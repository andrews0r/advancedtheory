#!/usr/bin/env python3
"""Profile images for the People page: logos/people/<id>.jpg, 96px, from each person's X handle.

Uses unavatar.io (a public avatar proxy) once per person at build time, so the page itself
never calls a third party. People without a handle, or whose image cannot be fetched, keep
the monogram. Existing files are kept; delete one to refetch it. Re-run build_library.py after.
"""
from __future__ import annotations

import csv
import pathlib
import re
import subprocess
import sys
import time
import urllib.request

SITE = pathlib.Path(__file__).resolve().parent.parent
OUT = SITE / "logos" / "people"
UA = {"User-Agent": "Mozilla/5.0 (frontier-concepts avatar fetch, one request per person)"}


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def fetch(url: str) -> bytes | None:
    """The proxy allows a few dozen requests per window and answers 429 after that: wait it out."""
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                b = r.read()
                return b if len(b) > 1000 and (b[:3] == b"\xff\xd8\xff" or b[:8] == b"\x89PNG\r\n\x1a\n" or b[:4] == b"RIFF" or b[:6] in (b"GIF87a", b"GIF89a")) else None
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"  rate limited; waiting 5 minutes (attempt {attempt + 1})", file=sys.stderr); time.sleep(300); continue
            return None
        except Exception:  # noqa: BLE001
            return None
    return None


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with (SITE / "data" / "people.csv").open(newline="", encoding="utf-8") as f:
        people = list(csv.DictReader(f))
    got = skipped = failed = 0
    for p in people:
        pid = f"{p['field'].split('|')[0]}-{slug(p['name'])}"
        dest = OUT / f"{pid}.jpg"
        if dest.exists():
            skipped += 1; continue
        if not p.get("x"):
            continue
        raw = fetch(f"https://unavatar.io/x/{p['x']}?fallback=false")
        if not raw:
            failed += 1; print(f"  no image: {p['name']} (@{p['x']})", file=sys.stderr); continue
        tmp = OUT / f"{pid}.tmp"
        tmp.write_bytes(raw)
        # Normalize to a 96px JPEG with sips (macOS); keeps the repo small and the format uniform.
        r = subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", "96", str(tmp), "--out", str(dest)], capture_output=True)
        tmp.unlink(missing_ok=True)
        if r.returncode == 0 and dest.exists():
            got += 1
        else:
            failed += 1; print(f"  convert failed: {p['name']}", file=sys.stderr)
        time.sleep(2)
    print(f"avatars: {got} fetched, {skipped} already there, {failed} failed -> {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
