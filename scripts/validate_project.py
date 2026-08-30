#!/usr/bin/env python3
"""Run offline integrity checks for the static weather PWA."""
from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
REQUIRED_FILES = (
    "index.html",
    "manifest.webmanifest",
    "sw.js",
    "data/typhoons.json",
    "scripts/update_typhoons.py",
)


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def load_json(relative: str):
    path = ROOT / relative
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - diagnostic path
        fail(f"{relative} is not valid JSON: {exc}")


def check_manifest() -> None:
    manifest = load_json("manifest.webmanifest")
    for key in ("name", "short_name", "start_url", "scope", "display", "icons"):
        if not manifest.get(key):
            fail(f"manifest.webmanifest missing {key}")
    if manifest["display"] not in {"standalone", "fullscreen", "minimal-ui"}:
        fail("manifest.webmanifest has an unexpected display mode")
    if not isinstance(manifest["icons"], list) or len(manifest["icons"]) < 2:
        fail("manifest.webmanifest should define at least two icons")


def check_snapshot() -> int:
    snapshot = load_json("data/typhoons.json")
    if not isinstance(snapshot, dict):
        fail("data/typhoons.json must contain an object")
    for key in ("updated", "sources", "storms"):
        if key not in snapshot:
            fail(f"data/typhoons.json missing {key}")
    if not isinstance(snapshot["sources"], list) or not snapshot["sources"]:
        fail("data/typhoons.json sources must be a non-empty list")
    if not isinstance(snapshot["storms"], list):
        fail("data/typhoons.json storms must be a list")

    for index, storm in enumerate(snapshot["storms"]):
        if not isinstance(storm, dict):
            fail(f"storm {index} must be an object")
        for key in ("id", "provider", "track", "forecast"):
            if key not in storm:
                fail(f"storm {index} missing {key}")
        if not isinstance(storm["track"], list) or not isinstance(storm["forecast"], list):
            fail(f"storm {index} track/forecast must be lists")
        for key in ("lat", "lon"):
            value = storm.get(key)
            if value is not None and not isinstance(value, (int, float)):
                fail(f"storm {index} {key} must be numeric or null")
    return len(snapshot["storms"])


def main() -> int:
    missing = [path for path in REQUIRED_FILES if not (ROOT / path).is_file()]
    if missing:
        fail("missing required files: " + ", ".join(missing))

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    if 'rel="manifest"' not in html or "serviceWorker.register" not in html:
        fail("index.html must reference the manifest and register the service worker")

    check_manifest()
    storm_count = check_snapshot()

    try:
        compile((ROOT / "scripts/update_typhoons.py").read_text(encoding="utf-8"), "update_typhoons.py", "exec")
    except SyntaxError as exc:
        fail(f"scripts/update_typhoons.py has a syntax error: {exc}")

    print(f"OK: weather PWA integrity checks passed; storms={storm_count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
