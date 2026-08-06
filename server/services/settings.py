"""Connection settings for VERTEXSCOPE.

Precedence: environment variables > persisted config file > defaults.
The config file lives outside the repository so credentials paths are never
committed by accident.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from dataclasses import asdict, dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_LOCATION = "global"
DEFAULT_COLLECTION = "default_collection"

_lock = threading.Lock()


def config_dir() -> Path:
    override = os.environ.get("VERTEXSCOPE_CONFIG_DIR")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".vertexscope"


def config_path() -> Path:
    return config_dir() / "config.json"


@dataclass
class Settings:
    project_id: str = ""
    location: str = DEFAULT_LOCATION
    collection: str = DEFAULT_COLLECTION
    credentials_path: str = ""

    def to_dict(self) -> dict[str, str]:
        return asdict(self)


def _from_env(base: Settings) -> Settings:
    """Environment variables win, but only when actually set."""
    return Settings(
        project_id=os.environ.get("VERTEXSCOPE_PROJECT_ID") or base.project_id,
        location=os.environ.get("VERTEXSCOPE_LOCATION") or base.location,
        collection=os.environ.get("VERTEXSCOPE_COLLECTION") or base.collection,
        credentials_path=(
            os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or base.credentials_path
        ),
    )


def _read_file() -> Settings:
    path = config_path()
    if not path.is_file():
        return Settings()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001 - a corrupt file must not break startup
        logger.warning("Ignoring unreadable config at %s: %s", path, e)
        return Settings()
    return Settings(
        project_id=str(raw.get("project_id", "") or ""),
        location=str(raw.get("location", "") or DEFAULT_LOCATION),
        collection=str(raw.get("collection", "") or DEFAULT_COLLECTION),
        credentials_path=str(raw.get("credentials_path", "") or ""),
    )


def _drop_empty_credentials_env() -> None:
    """空文字の GOOGLE_APPLICATION_CREDENTIALS を取り除く。

    google-auth はこの変数が「定義されているか」だけを見るため、空文字のまま
    残っていると空パスのキーファイルを読もうとして ADC にフォールバックしない。
    docker compose などが空値を渡してくるケースを吸収する。
    """
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip() == "":
        os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)


_drop_empty_credentials_env()

_settings: Settings = _from_env(_read_file())


def get_settings() -> Settings:
    with _lock:
        return Settings(**_settings.to_dict())


def update_settings(
    project_id: str | None = None,
    location: str | None = None,
    collection: str | None = None,
    credentials_path: str | None = None,
    persist: bool = True,
) -> Settings:
    """Apply a partial update and (optionally) write it to disk."""
    global _settings
    with _lock:
        current = _settings
        updated = Settings(
            project_id=(
                project_id.strip() if project_id is not None else current.project_id
            ),
            location=(
                (location.strip() or DEFAULT_LOCATION)
                if location is not None else current.location
            ),
            collection=(
                (collection.strip() or DEFAULT_COLLECTION)
                if collection is not None else current.collection
            ),
            credentials_path=(
                credentials_path.strip()
                if credentials_path is not None else current.credentials_path
            ),
        )
        _settings = updated

    if persist:
        _write(updated)
    return updated


def _write(settings: Settings) -> None:
    path = config_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        # The file records a local credentials path; keep it owner-only.
        path.write_text(
            json.dumps(settings.to_dict(), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        os.chmod(path, 0o600)
    except OSError as e:
        logger.warning("Could not persist config to %s: %s", path, e)
