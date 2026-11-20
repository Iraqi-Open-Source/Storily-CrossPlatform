#!/usr/bin/env python3
"""Fetch the original Storily icon and regenerate ALL native platform icons.

The original image remains owned by the original project. In offline environments,
a bundled visual placeholder is retained; CI uses --strict to require the real one.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request

BASE = Path(__file__).resolve().parents[1]
SOURCE = "https://raw.githubusercontent.com/waadmawlood/macos-storily-app/main/Sources/Storily/Assets.xcassets/AppIcon.appiconset/AppIcon1024.png"
ICON = BASE / "src-tauri" / "icons" / "original.png"
PUBLIC = BASE / "public" / "original-icon.png"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="Fail if exact original icon cannot be fetched")
    args = parser.parse_args()
    ICON.parent.mkdir(parents=True, exist_ok=True)
    try:
        request = urllib.request.Request(SOURCE, headers={"User-Agent": "Storily-icon-sync/1.0"})
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read()
        if not data.startswith(b"\x89PNG\r\n\x1a\n") or len(data) < 10000:
            raise ValueError("Original icon download was not a valid PNG")
        ICON.write_bytes(data)
        print(f"Downloaded exact original icon: {len(data)} bytes")
    except Exception as e:
        if args.strict:
            raise SystemExit(f"Unable to fetch exact original icon: {e}")
        print(f"Offline; retaining bundled icon placeholder: {e}", file=sys.stderr)
        if not ICON.exists():
            raise SystemExit("No image available: run this script with an internet connection")
    shutil.copyfile(ICON, PUBLIC)
    npx = "npx.cmd" if os.name == "nt" else "npx"
    subprocess.run([npx, "tauri", "icon", str(ICON), "-o", str(ICON.parent)], cwd=BASE, check=True)
    print("Regenerated desktop, Android and iOS icon assets")


if __name__ == "__main__":
    main()
