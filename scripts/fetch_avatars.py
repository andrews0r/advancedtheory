#!/usr/bin/env python3
"""Profile images for the People page: logos/people/<id>.jpg, 96px.

Sources, in order, once per person at build time so the page never calls a third party:
  1. the person's X profile image, read from X's public embed (syndication) page for the handle;
  2. the person's Wikipedia page image, by name (public figures without a handle, or 1 failed);
  3. unavatar.io, a proxy with a 25-requests-a-day anonymous limit, as a last resort.
Whoever still has no image keeps the monogram. Existing files are kept; delete one to refetch.
Re-run build_library.py after.
"""
from __future__ import annotations

import csv
import json
import pathlib
import urllib.parse
import re
import subprocess
import sys
import time
import urllib.request

SITE = pathlib.Path(__file__).resolve().parent.parent
OUT = SITE / "logos" / "people"
UA = {"User-Agent": "frontier-concepts-avatar-fetch/1.0 (static site build; github.com/andrews0r/frontierconcepts)", "Accept": "*/*"}


def get(url: str) -> bytes | None:
    """One polite GET. On 429 honor Retry-After when it is short, otherwise wait once and retry; never hammer."""
    for i in range(2):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and i == 0:
                ra = e.headers.get("Retry-After")
                wait = int(ra) if ra and ra.isdigit() else 90
                if wait > 600:
                    print(f"  {url.split('/')[2]}: asked to retry in {wait // 3600} h; skipping that source", file=sys.stderr); return None
                print(f"  {url.split('/')[2]}: throttled, waiting {wait} s", file=sys.stderr); time.sleep(wait); continue
            return None
        except Exception:  # noqa: BLE001
            return None
    return None


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def fetch(url: str, quiet: bool = False) -> bytes | None:
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
            b = r.read()
            return b if len(b) > 1000 and (b[:3] == b"\xff\xd8\xff" or b[:8] == b"\x89PNG\r\n\x1a\n" or b[:4] == b"RIFF" or b[:6] in (b"GIF87a", b"GIF89a")) else None
    except urllib.error.HTTPError as e:
        if e.code == 429 and not quiet:
            print("  unavatar daily limit reached; skipping that source for the rest of the run", file=sys.stderr)
            fetch.limited = True
        return None
    except Exception:  # noqa: BLE001
        return None
fetch.limited = False


def x_image(handle: str) -> bytes | None:
    """The syndication page embeds the timeline's JSON; take the image of the user whose screen name matches."""
    raw = get(f"https://syndication.twitter.com/srv/timeline-profile/screen-name/{handle}")
    if not raw:
        return None
    html = raw.decode("utf-8", "replace")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    url = None
    if m:
        def walk(o):
            nonlocal url
            if url: return
            if isinstance(o, dict):
                if str(o.get("screen_name", "")).lower() == handle.lower() and o.get("profile_image_url_https"):
                    url = o["profile_image_url_https"]; return
                for v in o.values(): walk(v)
            elif isinstance(o, list):
                for v in o: walk(v)
        try: walk(json.loads(m.group(1)))
        except Exception: pass  # noqa: BLE001
    if not url:
        return None
    return fetch(url.replace("_normal.", "_400x400."), quiet=True) or fetch(url, quiet=True)


def wiki_image(name: str) -> bytes | None:
    q = urllib.parse.urlencode({"action": "query", "prop": "pageimages", "titles": name, "pithumbsize": 400, "format": "json", "redirects": 1})
    raw = get("https://en.wikipedia.org/w/api.php?" + q)
    if not raw:
        return None
    try:
        pages = json.loads(raw).get("query", {}).get("pages", {})
    except Exception:  # noqa: BLE001
        return None
    for p in pages.values():
        src = (p.get("thumbnail") or {}).get("source")
        if src:
            return fetch(src, quiet=True)
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
        raw = x_image(p["x"]) if p.get("x") else None
        src = "x" if raw else ""
        if not raw:
            raw = wiki_image(p["name"]); src = "wikipedia" if raw else ""
        if not raw and p.get("x") and not fetch.limited:
            raw = fetch(f"https://unavatar.io/x/{p['x']}?fallback=false"); src = "unavatar" if raw else ""
        if not raw:
            failed += 1; print(f"  no image: {p['name']}{' (@' + p['x'] + ')' if p.get('x') else ''}", file=sys.stderr); continue
        print(f"  {p['name']}: {src}", file=sys.stderr)
        tmp = OUT / f"{pid}.tmp"
        tmp.write_bytes(raw)
        # Normalize to a 96px JPEG with sips (macOS); keeps the repo small and the format uniform.
        r = subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", "96", str(tmp), "--out", str(dest)], capture_output=True)
        tmp.unlink(missing_ok=True)
        if r.returncode == 0 and dest.exists():
            got += 1
        else:
            failed += 1; print(f"  convert failed: {p['name']}", file=sys.stderr)
        time.sleep(4)
    print(f"avatars: {got} fetched, {skipped} already there, {failed} failed -> {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
