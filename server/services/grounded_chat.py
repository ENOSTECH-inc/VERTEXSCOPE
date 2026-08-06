"""Grounded chat: Discovery Engine で検索し、Vertex AI Gemini で回答を組み立てる。

Discovery Engine の `answer` API は Enterprise エディション + LLM アドオンが
必要で、Standard エディションのデータストアでは使えない。ここでは代わりに

  1. Discovery Engine の `search` でヒットしたドキュメントを集め
  2. その実体 (Cloud Storage 上のファイル) を Vertex AI Gemini に直接読ませて
  3. 引用付きの回答を生成する

という経路をとる。認証は Discovery Engine と同じ Application Default
Credentials をそのまま使うため、API キーの管理は不要。
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from services import discovery_engine as de
from services.settings import get_settings

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_MODEL_LOCATION = "global"
DEFAULT_TOP_K = 5
MAX_TOP_K = 20
CHAT_TIMEOUT = 180.0

#: Gemini が `fileData` として直接読める MIME タイプ。
#: これ以外 (xlsx, docx など) はメタデータだけを文脈として渡す。
READABLE_MIME_PREFIXES = ("image/", "audio/", "video/", "text/")
READABLE_MIME_TYPES = frozenset({
    "application/pdf",
    "application/json",
    "application/xml",
})

#: 拡張子から MIME を補う (Discovery Engine が mimeType を返さない場合がある)
EXTENSION_MIME: dict[str, str] = {
    "pdf": "application/pdf",
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "webp": "image/webp", "gif": "image/gif", "heic": "image/heic",
    "txt": "text/plain", "md": "text/plain", "csv": "text/csv",
    "json": "application/json", "xml": "application/xml",
    "html": "text/plain", "yaml": "text/plain", "yml": "text/plain",
    "mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm",
    "mp3": "audio/mpeg", "wav": "audio/wav", "m4a": "audio/mp4",
}

SYSTEM_PREAMBLE = """あなたは社内ドキュメント検索アシスタントです。
与えられた資料だけを根拠に、日本語で簡潔に回答してください。

- 資料から読み取れないことは推測せず、「資料からは判断できません」と述べる
- 回答の該当箇所では、資料名を [1] [2] のような番号で示す
- 一覧を求められた場合は、資料の題名を箇条書きで示す
"""


class ChatError(RuntimeError):
    """回答生成に失敗した。"""


def _guess_mime(uri: str, declared: str) -> str:
    if declared:
        return declared
    ext = uri.rsplit(".", 1)[-1].lower() if "." in uri else ""
    return EXTENSION_MIME.get(ext, "")


def _is_readable(mime: str) -> bool:
    return bool(mime) and (
        mime in READABLE_MIME_TYPES or mime.startswith(READABLE_MIME_PREFIXES)
    )


def _as_record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def collect_sources(search_response: dict[str, Any], top_k: int) -> list[dict[str, Any]]:
    """検索レスポンスから、回答の根拠に使う資料の一覧を作る。"""
    sources: list[dict[str, Any]] = []

    for result in search_response.get("results", [])[:top_k]:
        doc = _as_record(result.get("document"))
        struct = _as_record(doc.get("structData"))
        derived = _as_record(doc.get("derivedStructData"))
        content = _as_record(doc.get("content"))

        uri = (
            str(content.get("uri") or "")
            or str(struct.get("gcsUri") or "")
            or str(struct.get("uri") or "")
        )
        title = (
            str(derived.get("title") or "")
            or str(struct.get("title") or "")
            or str(doc.get("id") or "")
            or uri.rsplit("/", 1)[-1]
        )
        mime = _guess_mime(uri, str(content.get("mimeType") or ""))

        sources.append({
            "title": title,
            "uri": uri,
            "mimeType": mime,
            "documentName": str(doc.get("name") or ""),
            "documentKind": str(struct.get("documentKind") or ""),
            # gs:// 以外 (署名付き URL 等) は Gemini から読めないので除外する
            "readable": _is_readable(mime) and uri.startswith("gs://"),
        })

    return sources


async def _drop_missing_objects(sources: list[dict[str, Any]]) -> None:
    """実体が消えているオブジェクトを添付対象から外す。

    Gemini は fileUri が1つでも解決できないとリクエスト全体を 404 で失敗させる。
    インデックスに残ったままの削除済みドキュメントで会話が止まらないようにする。
    """
    targets = [s for s in sources if s["readable"]]
    if not targets:
        return

    results = await asyncio.gather(
        *[de.object_exists(s["uri"]) for s in targets],
        return_exceptions=True,
    )
    for source, exists in zip(targets, results):
        if exists is not True:
            source["readable"] = False
            source["missing"] = True
            logger.info("Skipping missing object: %s", source["uri"])


def _build_contents(
    query: str,
    sources: list[dict[str, Any]],
    history: list[dict[str, str]],
) -> list[dict[str, Any]]:
    contents: list[dict[str, Any]] = []

    for turn in history:
        role = "model" if turn.get("role") == "assistant" else "user"
        text = str(turn.get("text") or "").strip()
        if text:
            contents.append({"role": role, "parts": [{"text": text}]})

    parts: list[dict[str, Any]] = []

    def note(source: dict[str, Any]) -> str:
        if source["readable"]:
            return ""
        if source.get("missing"):
            return " ※実体が見つからないため題名のみ"
        return " ※本文は読み取れないため題名のみ"

    catalogue = "\n".join(
        f"[{i + 1}] {s['title']}"
        + (f" (種別: {s['documentKind']})" if s["documentKind"] else "")
        + note(s)
        for i, s in enumerate(sources)
    )
    parts.append({
        "text": (
            f"# 参照できる資料\n{catalogue or '(該当なし)'}\n\n"
            "以下に、読み取れる資料の実体を添付します。"
        ),
    })

    for source in sources:
        if source["readable"]:
            parts.append({
                "fileData": {
                    "fileUri": source["uri"],
                    "mimeType": source["mimeType"],
                },
            })

    parts.append({"text": f"\n# 質問\n{query}"})
    contents.append({"role": "user", "parts": parts})
    return contents


async def generate_answer(
    data_store: str,
    query: str,
    history: list[dict[str, str]] | None = None,
    top_k: int = DEFAULT_TOP_K,
    model: str = DEFAULT_MODEL,
    model_location: str = DEFAULT_MODEL_LOCATION,
    filter_expr: str | None = None,
    serving_config: str = de.DEFAULT_SERVING_CONFIG,
) -> dict[str, Any]:
    """検索 → Gemini で回答生成、をまとめて実行する。"""
    top_k = max(1, min(top_k, MAX_TOP_K))

    # 1. 検索。Enterprise 限定オプションは使わないので Standard でも通る。
    search_response = await de.search(
        data_store,
        query=query,
        page_size=top_k,
        filter_expr=filter_expr,
        serving_config=serving_config,
    )
    sources = collect_sources(search_response, top_k)
    await _drop_missing_objects(sources)

    if not sources:
        return {
            "answerText": "検索にヒットする資料がありませんでした。",
            "sources": [],
            "model": model,
            "searchTotalSize": search_response.get("totalSize", 0),
            "raw": {"search": search_response},
        }

    # 2. Gemini で回答生成
    project_id = get_settings().project_id
    if not project_id:
        raise de.ConfigError("GCP プロジェクトIDが未設定です")

    host = (
        "aiplatform.googleapis.com"
        if model_location == "global"
        else f"{model_location}-aiplatform.googleapis.com"
    )
    url = (
        f"https://{host}/v1/projects/{project_id}/locations/{model_location}"
        f"/publishers/google/models/{model}:generateContent"
    )
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PREAMBLE}]},
        "contents": _build_contents(query, sources, history or []),
        "generationConfig": {"temperature": 0.2},
    }

    headers = {
        "Authorization": f"Bearer {await de.access_token()}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=CHAT_TIMEOUT) as client:
        resp = await client.post(url, headers=headers, json=body)

    if resp.status_code >= 400:
        raise ChatError(de.format_api_error(resp))

    payload = resp.json()
    candidates = payload.get("candidates") or [{}]
    answer_parts = _as_record(candidates[0].get("content")).get("parts") or []
    answer_text = "".join(
        str(p.get("text") or "") for p in answer_parts if isinstance(p, dict)
    ).strip()

    return {
        "answerText": answer_text,
        "sources": sources,
        "model": model,
        "searchTotalSize": search_response.get("totalSize", 0),
        "raw": {"search": search_response, "generate": payload},
    }
