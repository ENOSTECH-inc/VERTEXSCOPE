"""HTTP API for browsing and querying Vertex AI Search data stores."""
from __future__ import annotations

import asyncio
import logging
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field

from services import discovery_engine as de
from services import grounded_chat
from services import settings as cfg

logger = logging.getLogger(__name__)
router = APIRouter()

#: Content types that can execute script when opened as a document.
SCRIPTABLE_MIME_TYPES = frozenset({
    "text/html",
    "application/xhtml+xml",
    "image/svg+xml",
    "application/xml",
    "text/xml",
})


# ── Request models ──

class ConfigRequest(BaseModel):
    project_id: str | None = Field(default=None, max_length=256)
    location: str | None = Field(default=None, max_length=64)
    collection: str | None = Field(default=None, max_length=256)
    credentials_path: str | None = Field(default=None, max_length=4096)


class ConsoleUrlRequest(BaseModel):
    url: str = Field(max_length=4096)


class DocumentNameRequest(BaseModel):
    name: str = Field(max_length=2048)


class PurgeRequest(BaseModel):
    data_store: str = Field(max_length=2048)
    filter: str = Field(default="*", max_length=2048)
    force: bool = True


class ImportGcsRequest(BaseModel):
    data_store: str = Field(max_length=2048)
    gcs_uris: list[str] = Field(min_length=1, max_length=100)
    data_schema: str = Field(default="content", max_length=64)
    reconciliation_mode: str = Field(default="INCREMENTAL", max_length=32)


class SearchRequest(BaseModel):
    data_store: str = Field(max_length=2048)
    query: str = Field(min_length=1, max_length=8192)
    page_size: int = Field(default=10, ge=1, le=100)
    page_token: str | None = Field(default=None, max_length=4096)
    filter: str | None = Field(default=None, max_length=4096)
    # Enterprise edition 限定機能なので既定は無効
    with_summary: bool = False
    with_snippets: bool = False
    with_extractive: bool = False
    serving_config: str = Field(default=de.DEFAULT_SERVING_CONFIG, max_length=256)


class ChatTurn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    text: str = Field(max_length=8192)


class ChatRequest(BaseModel):
    data_store: str = Field(max_length=2048)
    query: str = Field(min_length=1, max_length=8192)
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)
    top_k: int = Field(default=grounded_chat.DEFAULT_TOP_K, ge=1, le=grounded_chat.MAX_TOP_K)
    model: str = Field(default=grounded_chat.DEFAULT_MODEL, max_length=128)
    model_location: str = Field(default=grounded_chat.DEFAULT_MODEL_LOCATION, max_length=64)
    filter: str | None = Field(default=None, max_length=4096)
    serving_config: str = Field(default=de.DEFAULT_SERVING_CONFIG, max_length=256)


class AnswerRequest(BaseModel):
    data_store: str = Field(max_length=2048)
    query: str = Field(min_length=1, max_length=8192)
    session: str | None = Field(default=None, max_length=2048)
    preamble: str | None = Field(default=None, max_length=8192)
    model_name: str | None = Field(default=None, max_length=128)
    related_questions: bool = True
    serving_config: str = Field(default=de.DEFAULT_SERVING_CONFIG, max_length=256)


def _fail(e: Exception) -> HTTPException:
    """Convert a client exception into an HTTP error, keeping the upstream status."""
    if isinstance(e, grounded_chat.ChatError):
        message = str(e)
        head = message.split(" ", 1)[0]
        status = int(head) if head.isdigit() and 400 <= int(head) <= 599 else 502
        return HTTPException(status_code=status, detail=message)
    if isinstance(e, (de.ConfigError, de.PreviewError)):
        return HTTPException(status_code=400, detail=str(e))
    if isinstance(e, de.AuthError):
        return HTTPException(status_code=401, detail=str(e))

    message = str(e)

    # Generative answers and summaries need the LLM add-on; say so explicitly.
    if "FAILED_PRECONDITION" in message and "Large Language Model" in message:
        message = (
            f"{message} / Cloud Console の該当アプリで「Enterprise エディション + "
            "LLM アドオン」を有効化するか、検索 (search) モードで要約をオフにして"
            "実行してください。"
        )

    if "FAILED_PRECONDITION" in message and "enterprise edition" in message.lower():
        message = (
            f"{message} / スニペット・抽出回答・要約は Enterprise エディション限定です。"
            "これらのオプションをオフにするか、検索ターゲットにエンジン (アプリ) を"
            "選択してください。"
        )

    head = message.split(" ", 1)[0]
    status = int(head) if head.isdigit() and 400 <= int(head) <= 599 else 502
    return HTTPException(status_code=status, detail=message)


# ── Connection settings ──

@router.get("/config")
async def api_get_config():
    return cfg.get_settings().to_dict()


@router.post("/config")
async def api_set_config(req: ConfigRequest):
    updated = cfg.update_settings(
        project_id=req.project_id,
        location=req.location,
        collection=req.collection,
        credentials_path=req.credentials_path,
    )
    de.reset_credentials()
    return updated.to_dict()


@router.post("/config/parse-url")
async def api_parse_console_url(req: ConsoleUrlRequest):
    """Turn a Cloud Console Agent Builder URL into connection settings."""
    parsed = de.parse_console_url(req.url)
    if not parsed:
        raise HTTPException(status_code=400, detail="URL から設定を抽出できませんでした")
    return parsed


@router.get("/auth/status")
async def api_auth_status():
    return await de.auth_status()


# ── Data stores ──

@router.get("/datastores")
async def api_list_data_stores(
    page_size: int = Query(default=100, ge=1, le=1000),
    page_token: str | None = None,
    enrich: bool = False,
):
    try:
        data = await de.list_data_stores(page_size=page_size, page_token=page_token)
    except Exception as e:
        raise _fail(e) from e

    if not enrich:
        return data

    stores = data.get("dataStores", [])
    counts = await asyncio.gather(
        *[de.data_store_document_count(s.get("name", "")) for s in stores],
        return_exceptions=True,
    )
    for store, count in zip(stores, counts):
        store["_documentCount"] = None if isinstance(count, BaseException) else count
    return data


@router.get("/engines")
async def api_list_engines(
    page_size: int = Query(default=100, ge=1, le=1000),
    page_token: str | None = None,
):
    try:
        return await de.list_engines(page_size=page_size, page_token=page_token)
    except Exception as e:
        raise _fail(e) from e


@router.get("/datastores/{data_store:path}/schema")
async def api_get_schema(data_store: str, schema_id: str = "default_schema"):
    try:
        return await de.get_schema(data_store, schema_id)
    except Exception as e:
        raise _fail(e) from e


@router.get("/datastores/{data_store:path}")
async def api_get_data_store(data_store: str):
    try:
        return await de.get_data_store(data_store)
    except Exception as e:
        raise _fail(e) from e


# ── Documents ──

@router.get("/documents")
async def api_list_documents(
    data_store: str,
    page_size: int = Query(default=100, ge=1, le=1000),
    page_token: str | None = None,
    branch: str = de.DEFAULT_BRANCH,
):
    try:
        return await de.list_documents(
            data_store, page_size=page_size, page_token=page_token, branch=branch,
        )
    except Exception as e:
        raise _fail(e) from e


@router.post("/documents/get")
async def api_get_document(req: DocumentNameRequest):
    try:
        return await de.get_document(req.name)
    except Exception as e:
        raise _fail(e) from e


@router.delete("/documents")
async def api_delete_document(req: DocumentNameRequest):
    try:
        return await de.delete_document(req.name)
    except Exception as e:
        raise _fail(e) from e


@router.post("/documents/purge")
async def api_purge_documents(req: PurgeRequest):
    try:
        return await de.purge_documents(
            req.data_store, filter_expr=req.filter, force=req.force,
        )
    except Exception as e:
        raise _fail(e) from e


@router.post("/documents/import-gcs")
async def api_import_gcs(req: ImportGcsRequest):
    try:
        return await de.import_documents_from_gcs(
            req.data_store,
            gcs_uris=req.gcs_uris,
            data_schema=req.data_schema,
            reconciliation_mode=req.reconciliation_mode,
        )
    except Exception as e:
        raise _fail(e) from e


@router.get("/operations/{operation_name:path}")
async def api_get_operation(operation_name: str):
    try:
        return await de.get_operation(operation_name)
    except Exception as e:
        raise _fail(e) from e


# ── Document preview ──

@router.get("/preview")
async def api_preview(uri: str = Query(max_length=4096), download: bool = False):
    """Relay a document's Cloud Storage object so the browser can display it."""
    try:
        content, content_type = await de.fetch_object(uri)
    except Exception as e:
        raise _fail(e) from e

    filename = uri.rstrip("/").split("/")[-1] or "document"
    disposition = "attachment" if download else "inline"
    headers = {
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(filename)}",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
    }
    # Scriptable payloads are relayed as opaque data: keep them from running.
    # PDFs and media are left alone so the browser's built-in viewers still work.
    if content_type.split(";")[0].strip().lower() in SCRIPTABLE_MIME_TYPES:
        headers["Content-Security-Policy"] = "sandbox; default-src 'none'"

    return Response(content=content, media_type=content_type, headers=headers)


# ── Search / Answer ──

@router.post("/search")
async def api_search(req: SearchRequest):
    try:
        return await de.search(
            req.data_store,
            query=req.query,
            page_size=req.page_size,
            page_token=req.page_token,
            filter_expr=req.filter,
            with_summary=req.with_summary,
            with_snippets=req.with_snippets,
            with_extractive=req.with_extractive,
            serving_config=req.serving_config,
        )
    except Exception as e:
        raise _fail(e) from e


@router.post("/answer")
async def api_answer(req: AnswerRequest):
    try:
        return await de.answer(
            req.data_store,
            query=req.query,
            session=req.session,
            preamble=req.preamble,
            model_name=req.model_name,
            related_questions=req.related_questions,
            serving_config=req.serving_config,
        )
    except Exception as e:
        raise _fail(e) from e


@router.post("/chat")
async def api_chat(req: ChatRequest):
    """検索 + Vertex AI Gemini による会話。Standard エディションでも動く。"""
    try:
        return await grounded_chat.generate_answer(
            req.data_store,
            query=req.query,
            history=[t.model_dump() for t in req.history],
            top_k=req.top_k,
            model=req.model,
            model_location=req.model_location,
            filter_expr=req.filter,
            serving_config=req.serving_config,
        )
    except Exception as e:
        raise _fail(e) from e
