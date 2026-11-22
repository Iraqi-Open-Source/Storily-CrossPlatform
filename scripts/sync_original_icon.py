#!/usr/bin/env python3
"""Fetch the original Storily icon and regenerate ALL native platform icons.

The original image remains owned by the original project. In offline environments,
a bundled visual placeholder is retained; CI uses --strict to require the real one.

Mobile projects are scaffolded with Tauri's default art. This script always
writes the canonical set under src-tauri/icons, then copies it into
src-tauri/gen when an Android or iOS project already exists.
"""
import argparse
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import urllib.request
import zlib

BASE = Path(__file__).resolve().parents[1]
SOURCE = "https://raw.githubusercontent.com/waadmawlood/macos-storily-app/main/Sources/Storily/Assets.xcassets/AppIcon.appiconset/AppIcon1024.png"
ICON = BASE / "src-tauri" / "icons" / "original.png"
PUBLIC = BASE / "public" / "original-icon.png"
# Purple field of the original mark. Used behind the adaptive-icon and iOS masks
# so transparent corners do not turn white.
BRAND_PURPLE = "#6A3DE8"
# Android adaptive icons show the center 72dp of a 108dp layer and mask the rest.
# Fit the whole mark in that visible area so "Storily" and "MEMORY" are not cropped.
ADAPTIVE_SAFE_ZONE = 72 / 108


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="Fail if exact original icon cannot be fetched")
    parser.add_argument("--apply-only", action="store_true", help="Copy existing icons into generated mobile projects")
    args = parser.parse_args()
    if args.apply_only:
        apply_mobile_icons()
        return

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
    generate_icons()
    inset_android_foregrounds()
    apply_mobile_icons()
    print("Regenerated desktop, Android and iOS icon assets")


def generate_icons():
    """Run `tauri icon` into src-tauri/icons, even if gen/ projects already exist.

    The CLI writes straight into gen/android and gen/apple when those folders
    exist, and then leaves the canonical icons/ copies stale. Hide the native
    output folders for the duration of the command.
    """
    hidden = []
    for path in (
        BASE / "src-tauri" / "gen" / "android" / "app" / "src" / "main" / "res",
        BASE / "src-tauri" / "gen" / "apple" / "Assets.xcassets" / "AppIcon.appiconset",
    ):
        if path.exists():
            hold = path.with_name(path.name + ".storily-icon-hold")
            if hold.exists():
                shutil.rmtree(hold)
            path.rename(hold)
            hidden.append((hold, path))
    npx = "npx.cmd" if os.name == "nt" else "npx"
    try:
        subprocess.run(
            [npx, "tauri", "icon", str(ICON), "-o", str(ICON.parent), "--ios-color", BRAND_PURPLE],
            cwd=BASE,
            check=True,
        )
    finally:
        for hold, path in hidden:
            if path.exists():
                shutil.rmtree(path)
            hold.rename(path)


def inset_android_foregrounds():
    root = ICON.parent / "android"
    for path in sorted(root.glob("mipmap-*/ic_launcher_foreground.png")):
        width, height, rows = read_png(path)
        inset = max(1, round(width * ADAPTIVE_SAFE_ZONE))
        scaled = resize_rgba(rows, width, height, inset, inset)
        canvas = [bytearray(width * 4) for _ in range(height)]
        ox = (width - inset) // 2
        oy = (height - inset) // 2
        for y, row in enumerate(scaled):
            start = ox * 4
            canvas[oy + y][start : start + len(row)] = row
        write_png(path, width, height, canvas)
        print(f"Inset adaptive foreground {path.relative_to(BASE)}")


def apply_mobile_icons():
    node = "node.exe" if os.name == "nt" else "node"
    subprocess.run([node, str(BASE / "scripts" / "apply_mobile_icons.mjs")], cwd=BASE, check=True)


def read_png(path):
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"{path} is not a PNG")
    pos = 8
    width = height = color = None
    idat = b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        kind = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width, height, _bit, color = struct.unpack(">IIBB", chunk[:10])
        elif kind == b"IDAT":
            idat += chunk
        elif kind == b"IEND":
            break
    if color != 6:
        raise SystemExit(f"{path} must be 8-bit RGBA")
    raw = zlib.decompress(idat)
    rows = []
    index = 0
    prev = bytearray(width * 4)

    def paeth(a, b, c):
        estimate = a + b - c
        da, db, dc = abs(estimate - a), abs(estimate - b), abs(estimate - c)
        if da <= db and da <= dc:
            return a
        return b if db <= dc else c

    for _y in range(height):
        filt = raw[index]
        index += 1
        row = bytearray(raw[index : index + width * 4])
        index += width * 4
        out = bytearray(width * 4)
        for x in range(width * 4):
            left = out[x - 4] if x >= 4 else 0
            up = prev[x]
            ul = prev[x - 4] if x >= 4 else 0
            if filt == 0:
                value = row[x]
            elif filt == 1:
                value = (row[x] + left) & 255
            elif filt == 2:
                value = (row[x] + up) & 255
            elif filt == 3:
                value = (row[x] + ((left + up) // 2)) & 255
            elif filt == 4:
                value = (row[x] + paeth(left, up, ul)) & 255
            else:
                raise SystemExit(f"unsupported PNG filter {filt} in {path}")
            out[x] = value
        prev = out
        rows.append(out)
    return width, height, rows


def resize_rgba(rows, width, height, new_width, new_height):
    out = []
    for y in range(new_height):
        fy = (y + 0.5) * height / new_height - 0.5
        y0 = min(height - 1, max(0, int(fy)))
        y1 = min(height - 1, y0 + 1)
        ty = min(1, max(0, fy - int(fy))) if fy > 0 else 0
        row = bytearray(new_width * 4)
        for x in range(new_width):
            fx = (x + 0.5) * width / new_width - 0.5
            x0 = min(width - 1, max(0, int(fx)))
            x1 = min(width - 1, x0 + 1)
            tx = min(1, max(0, fx - int(fx))) if fx > 0 else 0
            for channel in range(4):
                p00 = rows[y0][x0 * 4 + channel]
                p10 = rows[y0][x1 * 4 + channel]
                p01 = rows[y1][x0 * 4 + channel]
                p11 = rows[y1][x1 * 4 + channel]
                value = (
                    p00 * (1 - tx) * (1 - ty)
                    + p10 * tx * (1 - ty)
                    + p01 * (1 - tx) * ty
                    + p11 * tx * ty
                )
                row[x * 4 + channel] = max(0, min(255, int(round(value))))
        out.append(row)
    return out


def write_png(path, width, height, rows):
    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + bytes(row) for row in rows)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


if __name__ == "__main__":
    main()
