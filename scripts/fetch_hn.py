#!/usr/bin/env python3
"""Mine Hacker News for YouTube videos repeatedly shared on each Frontier Academy topic.

Uses the public HN Algolia search API (no key). For every direction it runs a few
topic searches over story submissions (title/url) and over comments, extracts
YouTube video ids, and counts how many distinct HN items (stories + comments)
linked each video, over how many distinct years, with how many story points.

Output: data/hn_candidates.json  {direction_slug: [{id, mentions, stories,
comments, points, years, first, last, title, url}]}. fetch_videos.py merges these
into the catalogue as "HN picks" (up to --hn-per-direction per playlist).
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict

SITE = pathlib.Path(__file__).resolve().parent.parent
OUT = SITE / "data" / "hn_candidates.json"
API = "https://hn.algolia.com/api/v1/search?"
RX = re.compile(r"(?:youtube\.com/(?:watch\?(?:[^\"'\s<]*?&)?v=|embed/|v/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})")

# Topic terms per direction. Story searches use "youtube.com <term>" against
# title+url; comment searches use "youtube <term>" against comment text.
TERMS = {
    "ai": ["machine learning", "deep learning", "neural network", "LLM", "transformer", "reinforcement learning", "Karpathy", "GPT"],
    "robotics": ["robotics", "robot", "humanoid", "ROS", "Boston Dynamics", "robot arm", "SLAM"],
    "quantum": ["quantum computing", "quantum computer", "qubit", "quantum mechanics lecture", "Feynman"],
    "space": ["spacecraft", "space exploration", "orbital mechanics", "NASA", "Mars", "astronomy lecture", "rocket engine", "Apollo"],
    "biotech": ["biology", "synthetic biology", "CRISPR", "genetics", "protein", "biotech", "molecular biology", "bioinformatics"],
    "neurotech": ["neuroscience", "brain computer interface", "brain", "neuron", "Neuralink", "EEG", "computational neuroscience"],
    "semiconductors": ["semiconductor", "chip design", "transistor", "CPU", "lithography", "VLSI", "FPGA", "TSMC", "Asianometry"],
    "energy": ["nuclear fusion", "nuclear reactor", "solar", "battery", "energy", "power grid", "thorium", "fusion"],
    "nanotech": ["nanotechnology", "nanoscale", "graphene", "nanofabrication", "MEMS", "atomic", "materials science"],
}


def get(params: dict, tries: int = 4) -> dict:
    url = API + urllib.parse.urlencode(params)
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "frontier-academy-tv/1.0"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                print(f"  ! {e} for {params}", file=sys.stderr)
                return {"hits": [], "nbPages": 0}
            time.sleep(1.5 * (i + 1))
    return {"hits": [], "nbPages": 0}


def main(max_pages: int = 3):
    results = {}
    for slug, terms in TERMS.items():
        videos: dict[str, dict] = {}
        seen_items: set[str] = set()

        def note(vid: str, item: dict, kind: str):
            key = item["objectID"]
            if (vid, key) in seen_items:
                return
            seen_items.add((vid, key))
            rec = videos.setdefault(vid, {"id": vid, "mentions": 0, "stories": 0, "comments": 0, "points": 0, "years": set(), "first": None, "last": None, "title": None, "url": None, "best_points": -1})
            rec["mentions"] += 1
            rec[kind] += 1
            pts = item.get("points") or 0
            rec["points"] += pts
            date = (item.get("created_at") or "")[:10]
            if date:
                rec["years"].add(date[:4])
                rec["first"] = min(rec["first"] or date, date)
                rec["last"] = max(rec["last"] or date, date)
            if kind == "stories" and pts > rec["best_points"]:
                rec["best_points"] = pts
                rec["title"] = item.get("title")
                rec["url"] = f"https://news.ycombinator.com/item?id={key}"
            elif kind == "comments" and rec["url"] is None and item.get("story_id"):
                rec["title"] = item.get("story_title")
                rec["url"] = f"https://news.ycombinator.com/item?id={item['story_id']}"

        for term in terms:
            # Stories whose title/url match, URL on YouTube.
            for page in range(max_pages):
                d = get({"query": f"youtube.com {term}", "tags": "story", "restrictSearchableAttributes": "title,url", "hitsPerPage": 1000, "page": page})
                for h in d.get("hits", []):
                    for vid in set(RX.findall((h.get("url") or "") + " " + (h.get("story_text") or ""))):
                        note(vid, h, "stories")
                if page + 1 >= d.get("nbPages", 0):
                    break
            # Comments mentioning the term and linking YouTube.
            for page in range(max_pages):
                d = get({"query": f"youtube {term}", "tags": "comment", "hitsPerPage": 1000, "page": page})
                for h in d.get("hits", []):
                    for vid in set(RX.findall(h.get("comment_text") or "")):
                        note(vid, h, "comments")
                if page + 1 >= d.get("nbPages", 0):
                    break
            print(f"[{slug}] {term!r}: {len(videos)} videos so far", file=sys.stderr)

        ranked = sorted(videos.values(), key=lambda r: (-r["mentions"], -len(r["years"]), -r["points"]))
        for r in ranked:
            r["years"] = sorted(r["years"])
            r.pop("best_points", None)
        results[slug] = ranked[:400]
        print(f"[{slug}] {len(videos)} videos, {sum(1 for r in ranked if r['mentions'] >= 2)} with 2+ mentions", file=sys.stderr)

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=1))
    print(f"wrote {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
