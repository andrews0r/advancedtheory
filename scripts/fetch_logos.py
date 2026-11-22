#!/usr/bin/env python3
"""Fill logo gaps: fetch site icons for catalogue entries that have no logo yet.

Reads data/programs.json, takes the domains of entries without a logo (skipping
platform domains such as coursera.org or github.com, whose icon would be the
platform's, not the provider's), and saves each site's icon to logos/fav-<domain>.png
via Google's favicon service, DuckDuckGo's as a fallback. Placeholder globes are
skipped so the page keeps its monogram there. Re-run scripts/build_programs.py
afterwards; it picks these files up by domain.
"""
from __future__ import annotations

import concurrent.futures as cf
import hashlib
import json
import pathlib
import sys
import urllib.request

SITE = pathlib.Path(__file__).resolve().parent.parent
DATA = SITE / "data"
OUT = SITE / "logos"
PLATFORMS = {"coursera.org", "edx.org", "github.com", "reddit.com", "youtube.com", "youtu.be", "medium.com", "substack.com",
             "linkedin.com", "x.com", "twitter.com", "discord.com", "discord.gg", "notion.site", "google.com", "docs.google.com",
             "sites.google.com", "udemy.com", "classcentral.com", "eventbrite.com", "meetup.com", "luma.com", "lu.ma", "usa.gov"}
SOURCES = ["https://www.google.com/s2/favicons?domain={d}&sz=128", "https://icons.duckduckgo.com/ip3/{d}.ico"]


def fetch(url: str) -> bytes | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (frontier-concepts logo fetch)"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.read()
    except Exception:  # noqa: BLE001
        return None


def is_image(b: bytes | None) -> bool:
    return bool(b) and len(b) >= 200 and (b[:8] == b"\x89PNG\r\n\x1a\n" or b[:4] == b"\x00\x00\x01\x00" or b[:3] == b"\xff\xd8\xff" or b[:6] in (b"GIF87a", b"GIF89a"))


def main():
    OUT.mkdir(exist_ok=True)
    placeholders = set()
    globe = fetch(SOURCES[0].format(d="no-such-domain-zzz.invalid"))
    if globe:
        placeholders.add(hashlib.sha1(globe).hexdigest())
    d = json.loads((DATA / "programs.json").read_text())
    domains = sorted({i["domain"] for k in ("courses", "programs", "ranked") for i in d[k] if i.get("domain") and not i.get("logo")})
    domains = [x for x in domains if x not in PLATFORMS and not any(x.endswith("." + p) for p in PLATFORMS)]
    # Also the organization sites named in build_programs.ORG_DOMAINS, so platform-hosted entries get their org's icon.
    try:
        sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
        from build_programs import ORG_DOMAINS
        have = {f.name[4:-4] for f in OUT.glob("fav-*.png")}
        domains = sorted(set(domains) | {v for v in ORG_DOMAINS.values() if v not in have})
    except Exception as e:  # noqa: BLE001
        print(f"  (org domains skipped: {e})", file=sys.stderr)
    print(f"{len(domains)} domains without a logo", file=sys.stderr)

    def grab(domain):
        dest = OUT / f"fav-{domain}.png"
        if dest.exists():
            return True
        for src in SOURCES:
            b = fetch(src.format(d=domain))
            if is_image(b) and hashlib.sha1(b).hexdigest() not in placeholders:
                dest.write_bytes(b)
                return True
        return False

    ok = 0
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        for got in ex.map(grab, domains):
            ok += bool(got)
    print(f"icons saved: {ok} of {len(domains)} -> {OUT}/fav-*.png", file=sys.stderr)


if __name__ == "__main__":
    main()
