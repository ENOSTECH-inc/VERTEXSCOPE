"""Vertex AI Search (Discovery Engine) REST client.

Talks to discoveryengine.googleapis.com with an OAuth2 access token obtained
from Application Default Credentials or a service account key file.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlparse

import httpx

from services.settings import (
    DEFAULT_COLLECTION,
    DEFAULT_LOCATION,
    get_settings,
)

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]

DEFAULT_BRANCH = "default_branch"
DEFAULT_SERVING_CONFIG = "default_search"

REQUEST_TIMEOUT = 60.0
SEARCH_TIMEOUT = 120.0
ANSWER_TIMEOUT = 180.0
PREVIEW_TIMEOUT = 120.0

#: Preview downloads are held in memory before being relayed to the browser.
MAX_PREVIEW_BYTES = int(os.environ.get("VERTEXSCOPE_MAX_PREVIEW_BYTES", 64 * 1024 * 1024))

#: Only Google Cloud Storage may be fetched by the preview proxy. The proxy runs
#: with the operator's cloud credentials, so allowing arbitrary URLs would turn
#: it into an SSRF gadget against the host's network.
ALLOWED_OBJECT_HOSTS = frozenset({
    "storage.googleapis.com",
    "storage.cloud.google.com",
})


class ConfigError(RuntimeError):
    """The connection is not configured well enough to make a request."""


class AuthError(RuntimeError):
    """Google credentials could not be obtained or refreshed."""


class PreviewError(RuntimeError):
    """A document's source object cannot be fetched for preview."""


# ── Credentials ──

_credentials: Any = None
_credentials_key: tuple[str, str] | None = None
_credentials_source: str = ""


def reset_credentials() -> None:
    """Drop cached credentials, e.g. after the key file setting changed."""
    global _credentials, _credentials_key, _credentials_source
    _credentials = None
    _credentials_key = None
    _credentials_source = ""


def _load_credentials() -> tuple[Any, str]:
    global _credentials, _credentials_key, _credentials_source

    key_path = get_settings().credentials_path
    cache_key = ("service_account", key_path) if key_path else ("adc", "")
    if _credentials is not None and _credentials_key == cache_key:
        return _credentials, _credentials_source

    try:
        if key_path:
            if not os.path.isfile(key_path):
                raise AuthError(
                    f"サービスアカウントキーが見つかりません: {key_path}"
                )
            from google.oauth2 import service_account

            creds = service_account.Credentials.from_service_account_file(
                key_path, scopes=SCOPES,
            )
            source = f"service_account:{os.path.basename(key_path)}"
        else:
            import google.auth

            creds, _ = google.auth.default(scopes=SCOPES)
            source = "application_default_credentials"
    except AuthError:
        raise
    except Exception as e:  # noqa: BLE001 - surfaced to the operator as-is
        raise AuthError(str(e)) from e

    _credentials, _credentials_key, _credentials_source = creds, cache_key, source
    return creds, source


def _refresh_token_sync() -> str:
    from google.auth.transport.requests import Request

    creds, _ = _load_credentials()
    if not creds.valid:
        try:
            creds.refresh(Request())
        except Exception as e:  # noqa: BLE001
            raise AuthError(str(e)) from e
    return creds.token


async def _token() -> str:
    return await asyncio.to_thread(_refresh_token_sync)


async def _headers() -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {await _token()}",
        "Content-Type": "application/json",
    }
    project_id = get_settings().project_id
    if project_id:
        # Bill quota to the project being browsed, not the ADC default project.
        headers["x-goog-user-project"] = project_id
    return headers


async def auth_status() -> dict[str, Any]:
    """Report whether credentials are usable, without raising."""
    settings = get_settings().to_dict()
    try:
        await _token()
    except AuthError as e:
        return {
            "authenticated": False,
            "source": _credentials_source or None,
            "message": str(e),
            "config": settings,
        }
    return {
        "authenticated": True,
        "source": _credentials_source,
        "message": None,
        "config": settings,
    }


# ── Endpoints ──

def _host() -> str:
    location = get_settings().location or DEFAULT_LOCATION
    if location == DEFAULT_LOCATION:
        return "https://discoveryengine.googleapis.com"
    return f"https://{location}-discoveryengine.googleapis.com"


def _base_url() -> str:
    return f"{_host()}/v1"


def collection_path() -> str:
    """projects/{project}/locations/{location}/collections/{collection}"""
    settings = get_settings()
    if not settings.project_id:
        raise ConfigError("GCP プロジェクトIDが未設定です")
    return (
        f"projects/{settings.project_id}"
        f"/locations/{settings.location or DEFAULT_LOCATION}"
        f"/collections/{settings.collection or DEFAULT_COLLECTION}"
    )


def resolve_data_store_path(data_store: str) -> str:
    """Accept a bare data store ID, or a full dataStore / engine resource name."""
    value = (data_store or "").strip().strip("/")
    if not value:
        raise ConfigError("データストアが指定されていません")
    if value.startswith("projects/"):
        return value
    return f"{collection_path()}/dataStores/{value}"


def _error_message(resp: httpx.Response) -> str:
    try:
        error = resp.json().get("error", {})
        message = error.get("message") or resp.text
        status = error.get("status")
        return f"{resp.status_code} {status or ''} {message}".strip()
    except Exception:  # noqa: BLE001
        return f"{resp.status_code} {resp.text[:500]}"


async def _request(
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    timeout: float = REQUEST_TIMEOUT,
) -> dict[str, Any]:
    url = path if path.startswith("http") else f"{_base_url()}/{path.lstrip('/')}"
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.request(
            method, url, headers=await _headers(), params=params, json=json_body,
        )
    if resp.status_code >= 400:
        raise RuntimeError(_error_message(resp))
    return resp.json() if resp.text else {}


# ── Data stores ──

async def list_data_stores(
    page_size: int = 100, page_token: str | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {"pageSize": page_size}
    if page_token:
        params["pageToken"] = page_token
    return await _request("GET", f"{collection_path()}/dataStores", params=params)


async def get_data_store(data_store: str) -> dict[str, Any]:
    return await _request("GET", resolve_data_store_path(data_store))


async def list_engines(
    page_size: int = 100, page_token: str | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {"pageSize": page_size}
    if page_token:
        params["pageToken"] = page_token
    return await _request("GET", f"{collection_path()}/engines", params=params)


async def get_schema(
    data_store: str, schema_id: str = "default_schema",
) -> dict[str, Any]:
    return await _request(
        "GET", f"{resolve_data_store_path(data_store)}/schemas/{schema_id}",
    )


# ── Documents ──

def _branch_path(data_store: str, branch: str = DEFAULT_BRANCH) -> str:
    return f"{resolve_data_store_path(data_store)}/branches/{branch}"


async def list_documents(
    data_store: str,
    page_size: int = 100,
    page_token: str | None = None,
    branch: str = DEFAULT_BRANCH,
) -> dict[str, Any]:
    params: dict[str, Any] = {"pageSize": page_size}
    if page_token:
        params["pageToken"] = page_token
    return await _request(
        "GET", f"{_branch_path(data_store, branch)}/documents", params=params,
    )


def _assert_document_name(name: str) -> str:
    """Reject anything that is not a Discovery Engine document resource name."""
    value = (name or "").strip().strip("/")
    if not value.startswith("projects/") or "/documents/" not in value:
        raise ConfigError(f"ドキュメントのリソース名が不正です: {name}")
    return value


async def get_document(document_name: str) -> dict[str, Any]:
    return await _request("GET", _assert_document_name(document_name))


async def delete_document(document_name: str) -> dict[str, Any]:
    return await _request("DELETE", _assert_document_name(document_name))


async def purge_documents(
    data_store: str,
    filter_expr: str = "*",
    force: bool = True,
    branch: str = DEFAULT_BRANCH,
) -> dict[str, Any]:
    return await _request(
        "POST",
        f"{_branch_path(data_store, branch)}/documents:purge",
        json_body={"filter": filter_expr, "force": force},
    )


async def import_documents_from_gcs(
    data_store: str,
    gcs_uris: list[str],
    data_schema: str = "content",
    reconciliation_mode: str = "INCREMENTAL",
    branch: str = DEFAULT_BRANCH,
) -> dict[str, Any]:
    return await _request(
        "POST",
        f"{_branch_path(data_store, branch)}/documents:import",
        json_body={
            "gcsSource": {"inputUris": gcs_uris, "dataSchema": data_schema},
            "reconciliationMode": reconciliation_mode,
        },
    )


async def get_operation(operation_name: str) -> dict[str, Any]:
    value = (operation_name or "").strip().strip("/")
    if not value.startswith("projects/") or "/operations/" not in value:
        raise ConfigError(f"オペレーション名が不正です: {operation_name}")
    return await _request("GET", value)


# ── Search / Answer ──

def _serving_config_path(
    target: str, serving_config: str = DEFAULT_SERVING_CONFIG,
) -> str:
    """Build a servingConfigs path for a data store *or* an engine (app).

    Standard edition data stores reject enterprise-only features when queried
    directly; pointing at the engine resource is the documented workaround, so
    both resource kinds are accepted here.
    """
    config = (serving_config or DEFAULT_SERVING_CONFIG).strip()
    if "/" in config:
        raise ConfigError(f"サービング構成名が不正です: {serving_config}")
    return f"{resolve_data_store_path(target)}/servingConfigs/{config}"


async def search(
    data_store: str,
    query: str,
    page_size: int = 10,
    page_token: str | None = None,
    filter_expr: str | None = None,
    with_summary: bool = False,
    with_snippets: bool = False,
    with_extractive: bool = False,
    summary_result_count: int = 5,
    serving_config: str = DEFAULT_SERVING_CONFIG,
) -> dict[str, Any]:
    """Run a search.

    Snippets, extractive answers and summaries are Enterprise edition features,
    so they stay off unless the caller asks for them. That keeps the default
    request valid against a standard edition data store.
    """
    content_search_spec: dict[str, Any] = {}
    if with_snippets:
        content_search_spec["snippetSpec"] = {"returnSnippet": True}
    if with_extractive:
        content_search_spec["extractiveContentSpec"] = {"maxExtractiveAnswerCount": 1}
    if with_summary:
        content_search_spec["summarySpec"] = {
            "summaryResultCount": summary_result_count,
            "includeCitations": True,
            "ignoreAdversarialQuery": True,
            "ignoreNonSummarySeekingQuery": False,
        }

    body: dict[str, Any] = {
        "query": query,
        "pageSize": page_size,
        "queryExpansionSpec": {"condition": "AUTO"},
        "spellCorrectionSpec": {"mode": "AUTO"},
    }
    if content_search_spec:
        body["contentSearchSpec"] = content_search_spec
    if page_token:
        body["pageToken"] = page_token
    if filter_expr:
        body["filter"] = filter_expr

    return await _request(
        "POST",
        f"{_serving_config_path(data_store, serving_config)}:search",
        json_body=body,
        timeout=SEARCH_TIMEOUT,
    )


async def answer(
    data_store: str,
    query: str,
    session: str | None = None,
    preamble: str | None = None,
    model_name: str | None = None,
    include_search_results: bool = True,
    related_questions: bool = True,
    serving_config: str = DEFAULT_SERVING_CONFIG,
) -> dict[str, Any]:
    answer_generation_spec: dict[str, Any] = {
        "includeCitations": True,
        "ignoreAdversarialQuery": True,
    }
    if preamble:
        answer_generation_spec["promptSpec"] = {"preamble": preamble}
    if model_name:
        answer_generation_spec["modelSpec"] = {"modelVersion": model_name}

    body: dict[str, Any] = {
        "query": {"text": query},
        "answerGenerationSpec": answer_generation_spec,
        "relatedQuestionsSpec": {"enable": related_questions},
    }
    if include_search_results:
        body["searchSpec"] = {"searchParams": {"maxReturnResults": 10}}
    if session:
        body["session"] = session

    return await _request(
        "POST",
        f"{_serving_config_path(data_store, serving_config)}:answer",
        json_body=body,
        timeout=ANSWER_TIMEOUT,
    )


async def data_store_document_count(
    data_store: str, cap: int = 200,
) -> int | str | None:
    """Best-effort document count, capped to avoid unbounded pagination."""
    try:
        total = 0
        page_token: str | None = None
        while True:
            resp = await list_documents(
                data_store, page_size=100, page_token=page_token,
            )
            total += len(resp.get("documents", []))
            page_token = resp.get("nextPageToken")
            if not page_token:
                return total
            if total >= cap:
                return f"{total}+"
    except Exception as e:  # noqa: BLE001
        logger.warning("Failed to count documents for %s: %s", data_store, e)
        return None


# ── Object preview ──

def parse_object_uri(uri: str) -> tuple[str, str]:
    """Normalise a Cloud Storage reference to (bucket, object).

    Raises PreviewError for anything that is not Cloud Storage, so the proxy can
    never be pointed at internal or third-party hosts.
    """
    value = (uri or "").strip()
    if not value:
        raise PreviewError("URI が空です")

    if value.startswith("gs://"):
        bucket, _, obj = value[len("gs://"):].partition("/")
        if not bucket or not obj:
            raise PreviewError(f"gs:// URI の形式が不正です: {uri}")
        return bucket, obj

    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_OBJECT_HOSTS:
        raise PreviewError(
            "プレビューできるのは Cloud Storage のオブジェクト "
            "(gs:// または storage.googleapis.com) のみです"
        )

    path = unquote(parsed.path).lstrip("/")
    if path.startswith("download/storage/v1/b/"):
        remainder = path[len("download/storage/v1/b/"):]
        bucket, _, tail = remainder.partition("/o/")
        obj = tail.split("?", 1)[0]
    else:
        bucket, _, obj = path.partition("/")

    if not bucket or not obj:
        raise PreviewError(f"Cloud Storage の URL 形式が不正です: {uri}")
    return bucket, obj


async def fetch_object(uri: str) -> tuple[bytes, str]:
    """Download a Cloud Storage object with the configured credentials."""
    bucket, obj = parse_object_uri(uri)
    url = (
        f"https://storage.googleapis.com/storage/v1/b/{quote(bucket, safe='')}"
        f"/o/{quote(obj, safe='')}"
    )
    headers = await _headers()
    headers.pop("Content-Type", None)

    async with httpx.AsyncClient(timeout=PREVIEW_TIMEOUT) as client:
        # follow_redirects stays off: a redirect would escape the allow-list.
        resp = await client.get(url, headers=headers, params={"alt": "media"})

    if resp.status_code >= 400:
        raise PreviewError(_error_message(resp))
    if len(resp.content) > MAX_PREVIEW_BYTES:
        raise PreviewError("ファイルサイズが大きすぎるためプレビューできません")

    content_type = resp.headers.get("content-type") or "application/octet-stream"
    return resp.content, content_type


# ── Console URL parsing ──

def parse_console_url(url: str) -> dict[str, str]:
    """Extract project / location / collection / data store from a console URL."""
    result: dict[str, str] = {}
    if not url:
        return result

    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    if "project" in query:
        result["project_id"] = query["project"][0]

    segments = [s for s in parsed.path.split("/") if s]
    for key, field in (
        ("locations", "location"),
        ("collections", "collection"),
        ("data-stores", "data_store"),
        ("dataStores", "data_store"),
        ("engines", "engine"),
    ):
        if key in segments:
            idx = segments.index(key)
            if idx + 1 < len(segments):
                result[field] = segments[idx + 1]
    return result
