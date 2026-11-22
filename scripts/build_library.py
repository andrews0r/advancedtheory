#!/usr/bin/env python3
"""People and Research sections: two hand-curated CSVs become one data file and two pages.

  data/people.csv     field,name,kind,role,org,site,x,youtube,note
  data/research.csv   field,title,authors,year,kind,url,note

Writes data/library.js (window.FC_LIBRARY) and data/library.json for js/catalog.js, and
people/index.html and research/index.html: the same shell as the Courses page, with the
list pre-rendered inside <main> so crawlers see it before the script takes over, plus an
ItemList in JSON-LD. Order within a field is the CSV order; that is the editorial rank.
A field may be several slugs separated by |.
"""
from __future__ import annotations

import csv
import json
import pathlib
import re
from urllib.parse import urlparse

SITE = pathlib.Path(__file__).resolve().parent.parent
DATA = SITE / "data"
BASE = "https://frontierconcepts.org"

FIELDS = [("ai", "Artificial intelligence", "AI"), ("robotics", "Robotics", "Robotics"), ("quantum", "Quantum computing", "Quantum"),
          ("space", "Space exploration", "Space"), ("biotech", "Biotechnology", "Biotech"), ("neurotech", "Neurotechnology", "Neurotech"),
          ("semiconductors", "Semiconductors", "Semiconductors"), ("energy", "Advanced energy", "Energy"), ("nanotech", "Nanotechnology", "Nanotech")]
LABEL = {s: l for s, _, l in FIELDS}
PEOPLE_KINDS = ["Researcher", "Builder", "Educator", "Writer"]
RESEARCH_KINDS = ["Paper", "Textbook", "Lecture notes", "Essay", "Reading list"]

META = {
    "people": {"title": "People", "blurb": "Who to follow and learn from in each field: the researchers, builders, educators and writers whose work is the primary source.",
               "placeholder": "Search people, organizations"},
    "research": {"title": "Research", "blurb": "The papers, textbooks, lecture notes and essays each field is built on: read these before the summaries of them.",
                 "placeholder": "Search papers, authors"},
}


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def domain(url: str) -> str:
    d = urlparse(url).netloc.lower()
    return d[4:] if d.startswith("www.") else d


def esc(s) -> str:
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def read(name: str) -> list[dict]:
    with (DATA / name).open(newline="", encoding="utf-8") as f:
        return [{k: (v or "").strip() for k, v in row.items()} for row in csv.DictReader(f)]


def people() -> list[dict]:
    out, rank = [], {}
    for r in read("people.csv"):
        fields = [x for x in r["field"].split("|") if x]
        rank[fields[0]] = rank.get(fields[0], 0) + 1
        url = r["site"] or (f"https://x.com/{r['x']}" if r["x"] else r["youtube"])
        out.append({"id": f"{fields[0]}-{slug(r['name'])}", "name": r["name"], "kind": r["kind"], "kinds": [r["kind"]], "role": r["role"], "org": r["org"],
                    "field": fields[0], "fields": fields, "site": r["site"], "x": r["x"], "youtube": r["youtube"], "url": url, "domain": domain(url),
                    "note": r["note"], "rank": rank[fields[0]]})
    return out


def research() -> list[dict]:
    out, rank = [], {}
    for r in read("research.csv"):
        fields = [x for x in r["field"].split("|") if x]
        rank[fields[0]] = rank.get(fields[0], 0) + 1
        out.append({"id": f"{fields[0]}-{slug(r['title'])[:60]}", "name": r["title"], "authors": r["authors"], "year": int(r["year"]), "kind": r["kind"], "kinds": [r["kind"]],
                    "field": fields[0], "fields": fields, "url": r["url"], "domain": domain(r["url"]), "note": r["note"], "rank": rank[fields[0]]})
    return out


SHELL_SRC = SITE / "courses" / "index.html"


def page(section: str, items: list[dict], description: str) -> str:
    m = META[section]
    shell = SHELL_SRC.read_text()
    title = f"{m['title']} · Frontier Concepts"
    shell = shell.replace("<title>Courses · Frontier Concepts</title>", f"<title>{title}</title>")
    shell = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{esc(description)}">', shell)
    shell = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{esc(description)}">', shell)
    shell = shell.replace('content="Courses · Frontier Concepts"', f'content="{title}"')
    shell = shell.replace("https://frontierconcepts.org/courses/", f"{BASE}/{section}/")
    shell = shell.replace('<body data-section="courses">', f'<body data-section="{section}">')
    shell = shell.replace('placeholder="Search courses, providers"', f'placeholder="{m["placeholder"]}"')
    shell = shell.replace('<script src="/data/programs.js"></script>', '<script src="/data/library.js"></script>')
    # Pre-rendered list for crawlers; catalog.js replaces it.
    if section == "people":
        rows = "".join(f'<tr><td><a href="{esc(i["url"])}" rel="noopener">{esc(i["name"])}</a></td><td>{esc(i["role"])}{" · " + esc(i["org"]) if i["org"] else ""}</td><td>{esc(LABEL[i["field"]])}</td><td>{esc(i["note"])}</td></tr>' for i in items)
        head = "<tr><th>Person</th><th>Role</th><th>Field</th><th>Why</th></tr>"
        ld_items = [{"@type": "ListItem", "position": n, "item": {"@type": "Person", "name": i["name"], "url": i["url"], "jobTitle": i["role"], **({"affiliation": i["org"]} if i["org"] else {})}} for n, i in enumerate(items, 1)]
    else:
        rows = "".join(f'<tr><td><a href="{esc(i["url"])}" rel="noopener">{esc(i["name"])}</a></td><td>{esc(i["authors"])} · {i["year"]}</td><td>{esc(i["kind"])}</td><td>{esc(LABEL[i["field"]])}</td><td>{esc(i["note"])}</td></tr>' for i in items)
        head = "<tr><th>Title</th><th>Authors</th><th>Type</th><th>Field</th><th>Why</th></tr>"
        ld_items = [{"@type": "ListItem", "position": n, "item": {"@type": "ScholarlyArticle" if i["kind"] == "Paper" else "Book" if i["kind"] == "Textbook" else "CreativeWork", "name": i["name"], "url": i["url"], "author": i["authors"], "datePublished": str(i["year"])}} for n, i in enumerate(items, 1)]
    static = f'<header class="page-head"><h1>{m["title"]}</h1><p class="blurb">{esc(m["blurb"])}</p></header><div class="table-wrap"><table class="table"><thead>{head}</thead><tbody>{rows}</tbody></table></div>'
    shell = shell.replace('<main class="main" id="main" tabindex="-1"><noscript><p>This page needs JavaScript to filter the list. <a href="/">Frontier Concepts home</a>.</p></noscript></main>',
                          f'<main class="main" id="main" tabindex="-1">{static}</main>')
    ld = {"@context": "https://schema.org", "@type": "ItemList", "name": title, "url": f"{BASE}/{section}/", "numberOfItems": len(items), "itemListElement": ld_items}
    shell = shell.replace("</head>", f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>\n</head>')
    return shell


def main():
    P, R = people(), research()
    lib = {"fields": [{"slug": s, "name": n, "label": l} for s, n, l in FIELDS], "kinds": {"people": PEOPLE_KINDS, "research": RESEARCH_KINDS}, "people": P, "research": R}
    (DATA / "library.json").write_text(json.dumps(lib, ensure_ascii=False, indent=0))
    (DATA / "library.js").write_text("window.FC_LIBRARY = " + json.dumps(lib, ensure_ascii=False) + ";\n")
    fields_txt = "AI, robotics, quantum, space, biotech, neurotech, semiconductors, energy and nanotech"
    for section, items, desc in (
        ("people", P, f"{len(P)} people to follow and learn from across {fields_txt}: researchers, builders, educators and writers, with where to find their work."),
        ("research", R, f"{len(R)} papers, textbooks, lecture notes and essays the frontier technologies are built on, across {fields_txt}, each with why it matters."),
    ):
        d = SITE / section
        d.mkdir(exist_ok=True)
        (d / "index.html").write_text(page(section, items, desc))
    unknown = {i["kind"] for i in P} - set(PEOPLE_KINDS) | {i["kind"] for i in R} - set(RESEARCH_KINDS)
    if unknown:
        raise SystemExit(f"unknown kind: {unknown}")
    print(f"people {len(P)}, research {len(R)} -> data/library.js, people/index.html, research/index.html")


if __name__ == "__main__":
    main()
