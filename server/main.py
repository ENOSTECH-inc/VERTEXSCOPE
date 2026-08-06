"""VERTEXSCOPE backend.

A local-first HTTP service that fronts the Vertex AI Search (Discovery Engine)
API and serves the built web UI.

Security posture: this process holds Google Cloud credentials, so it binds to
the loopback interface by default and refuses cross-origin browser requests from
anything but the configured UI origins. Do not expose it to a network you do not
control — see SECURITY.md.
"""
from __future__ import annotations

import argparse
import logging
import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from api.vertex import router as vertex_router
from services import settings as cfg

logging.basicConfig(level=os.environ.get("VERTEXSCOPE_LOG_LEVEL", "INFO"))
logger = logging.getLogger("vertexscope")

APP_NAME = "VERTEXSCOPE"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765

#: Origins allowed to call the API from a browser. Only loopback by default:
#: a page on any other origin must not be able to drive the operator's cloud
#: credentials. Override with VERTEXSCOPE_ALLOWED_ORIGINS (comma separated).
DEFAULT_ALLOWED_ORIGIN_PORTS = ("3000", "8765", "8080")


def _allowed_origins() -> list[str]:
    override = os.environ.get("VERTEXSCOPE_ALLOWED_ORIGINS", "").strip()
    if override:
        return [o.strip() for o in override.split(",") if o.strip()]
    return [
        f"http://{host}:{port}"
        for host in ("localhost", "127.0.0.1")
        for port in DEFAULT_ALLOWED_ORIGIN_PORTS
    ]


def _allowed_hosts() -> set[str]:
    """Host header values this server answers to (DNS-rebinding protection)."""
    override = os.environ.get("VERTEXSCOPE_ALLOWED_HOSTS", "").strip()
    if override == "*":
        return set()
    if override:
        return {h.strip().lower() for h in override.split(",") if h.strip()}
    return {"localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"}


def _static_dir() -> Path | None:
    override = os.environ.get("VERTEXSCOPE_STATIC_DIR")
    candidates = [Path(override)] if override else []
    here = Path(__file__).resolve().parent
    candidates += [here / "static", here.parent / ".output" / "public"]
    for candidate in candidates:
        if (candidate / "index.html").is_file():
            return candidate
    return None


app = FastAPI(title=f"{APP_NAME} backend", docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)

ALLOWED_HOSTS = _allowed_hosts()


@app.middleware("http")
async def guard_host_header(request: Request, call_next):
    """Reject requests whose Host header is not a known local name.

    Without this, a malicious page could point a DNS name it controls at
    127.0.0.1 and reach this API from its own origin.
    """
    if ALLOWED_HOSTS:
        host = (request.headers.get("host") or "").split(":")[0].strip().lower()
        if host and host not in ALLOWED_HOSTS:
            return JSONResponse(
                status_code=421,
                content={"detail": f"Host '{host}' は許可されていません"},
            )
    return await call_next(request)


app.include_router(vertex_router, prefix="/api", tags=["vertex"])


@app.get("/healthz")
async def healthz():
    settings = cfg.get_settings()
    return {
        "status": "ok",
        "app": APP_NAME,
        "configured": bool(settings.project_id),
    }


def _mount_ui() -> None:
    static_dir = _static_dir()
    if static_dir is None:
        logger.info("No built UI found; running in API-only mode")
        return

    index = static_dir / "index.html"
    app.mount(
        "/_nuxt",
        StaticFiles(directory=static_dir / "_nuxt", check_dir=False),
        name="nuxt-assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        candidate = (static_dir / full_path).resolve()
        # Keep path traversal from escaping the build output.
        if (
            full_path
            and static_dir.resolve() in candidate.parents
            and candidate.is_file()
        ):
            return FileResponse(candidate)
        return FileResponse(index)

    logger.info("Serving UI from %s", static_dir)


_mount_ui()


def main() -> None:
    parser = argparse.ArgumentParser(description=f"{APP_NAME} backend")
    parser.add_argument(
        "--host", default=os.environ.get("VERTEXSCOPE_HOST", DEFAULT_HOST),
    )
    parser.add_argument(
        "--port", type=int,
        default=int(os.environ.get("VERTEXSCOPE_PORT", DEFAULT_PORT)),
    )
    args = parser.parse_args()

    if args.host not in ("127.0.0.1", "localhost", "::1"):
        logger.warning(
            "Binding to %s exposes credential-backed APIs beyond this machine. "
            "Only do this on a trusted network — see SECURITY.md.",
            args.host,
        )

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
