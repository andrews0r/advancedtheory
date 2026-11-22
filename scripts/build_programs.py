#!/usr/bin/env python3
"""Build the Courses and Programs sections from the program datasets.

Inputs (in data/):
  programs_top20.csv          the Frontier Academy list: 2,452 programs, 9 fields x 25 formats
  programs_ranked_168.csv     programs ranked by founder outcomes, 5 categories
  programs_logo_manifest.csv  domain mapping for the ranked programs (for favicons)

Outputs:
  data/programs.js            window.FC_PROGRAMS = {fields, formats, courses, programs, ranked}
  courses/index.html, programs/index.html   the two pages (same template, different section)

Logos: each card shows the provider's site favicon (looked up by domain) with a
monogram fallback drawn by CSS, so no image files are stored here.
"""
from __future__ import annotations

import csv
import json
import pathlib
import re
from collections import Counter
from urllib.parse import urlparse

SITE = pathlib.Path(__file__).resolve().parent.parent
DATA = SITE / "data"
BASE = "https://frontierconcepts.org"

FIELDS = [
    ("Artificial intelligence", "ai", "AI"),
    ("Robotics", "robotics", "Robotics"),
    ("Quantum computing", "quantum", "Quantum"),
    ("Space exploration", "space", "Space"),
    ("Biotechnology", "biotech", "Biotech"),
    ("Neurotechnology", "neurotech", "Neurotech"),
    ("Semiconductors", "semiconductors", "Semiconductors"),
    ("Advanced energy", "energy", "Energy"),
    ("Nanotechnology", "nanotech", "Nanotech"),
]
FIELD_SLUG = {name: slug for name, slug, _ in FIELDS}

# Which of the 25 formats belong to Courses (things you take) vs Programs (things you join).
COURSE_FORMATS = [
    "Open online course / MOOC", "Self-study", "Live course", "Cohort-based course", "Bootcamp",
    "Guided independent study", "Workshop / masterclass", "Professional certification program",
    "Corporate training program", "Studio / project-based program", "1:1 tutoring / coaching",
]
PROGRAM_FORMATS = [
    "Fellowship", "Academic degree program", "Research training program", "Internship / work placement",
    "Accelerator / incubator", "Laboratory program", "Residency", "Apprenticeship", "Mentorship program",
    "Community of practice", "Competition / challenge", "Learning retreat / immersion",
    "Professional development program", "Field school / expedition",
]
# Display names: shorter, plainer, and a few near-duplicates merged
# (guided study -> self-study, tutoring -> coaching, cohort course -> live course).
FORMAT_SHORT = {
    "Open online course / MOOC": "Online course", "Self-study": "Self-study", "Live course": "Live course",
    "Cohort-based course": "Live course", "Bootcamp": "Bootcamp", "Guided independent study": "Self-study",
    "Workshop / masterclass": "Workshop", "Professional certification program": "Certification",
    "Corporate training program": "Corporate", "Studio / project-based program": "Project-based",
    "1:1 tutoring / coaching": "Coaching", "Fellowship": "Fellowship", "Academic degree program": "Degree",
    "Research training program": "Research training", "Internship / work placement": "Internship",
    "Accelerator / incubator": "Accelerator", "Laboratory program": "Lab", "Residency": "Residency",
    "Apprenticeship": "Apprenticeship", "Mentorship program": "Mentorship", "Community of practice": "Community",
    "Competition / challenge": "Competition", "Learning retreat / immersion": "Retreat",
    "Professional development program": "Professional development", "Field school / expedition": "Field school",
}
# Order of the format chips on each page (display names, deduplicated after merging).
FORMAT_ORDER = {
    "courses": ["Online course", "Self-study", "Live course", "Bootcamp", "Workshop", "Certification", "Project-based", "Corporate", "Coaching"],
    "programs": ["Fellowship", "Degree", "Research training", "Internship", "Accelerator", "Lab", "Residency", "Apprenticeship", "Mentorship", "Community", "Competition", "Retreat", "Professional development", "Field school"],
}


def host(url: str) -> str:
    try:
        h = urlparse(url.strip()).netloc.lower()
    except Exception:  # noqa: BLE001
        return ""
    return h[4:] if h.startswith("www.") else h


def cost_of(r: dict) -> str:
    c = (r.get("cost_grok") or "").strip().lower()
    a = (r.get("access_chatgpt") or "").strip().lower()
    if c in ("free", "free/paid"):
        return "free"
    if c == "paid":
        return "paid"
    if c.startswith("funded"):
        return "funded"
    if "free" in a:
        return "free"
    return ""


def note_of(r: dict) -> str:
    """First source's note, without the 'claude: ' prefix, trimmed."""
    n = (r.get("notes") or "").strip()
    first = n.split("||")[0].strip()
    first = re.sub(r"^(claude|harmonic|chatgpt|grok):\s*", "", first, flags=re.I)
    return first[:220]


# ----------------------------------------------------------------- logos
def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def load_logos():
    """Provider logos supplied in data/logos_index.csv + logos/ (converted by the import step).
    Returns (by_provider_name, by_domain) -> '/logos/<file>'."""
    mapping = json.loads((SITE / "logos" / "_map.json").read_text()) if (SITE / "logos" / "_map.json").exists() else {}
    by_name, by_dom = {}, {}
    path = DATA / "logos_index.csv"
    if not path.exists():
        return by_name, by_dom
    for r in csv.DictReader(path.open(encoding="utf-8-sig")):
        f = mapping.get(r["logo_filename"])
        if not f or not (SITE / "logos" / f).exists():
            continue
        by_name.setdefault(norm(r["provider"]), "/logos/" + f)
        d = host("https://" + r["source_domain"].split("/")[0]) if r.get("source_domain") else ""
        if d:
            by_dom.setdefault(d, "/logos/" + f)
    return by_name, by_dom


def logo_for(name: str, domain: str, by_name: dict, by_dom: dict) -> str:
    n = norm(name)
    if n in by_name:
        return by_name[n]
    if domain and domain in by_dom:
        return by_dom[domain]
    # "MIT Energy Initiative" -> "MIT", "Stanford Online" -> "Stanford": shorten word by word.
    words = n.split()
    for k in range(len(words) - 1, 0, -1):
        cand = " ".join(words[:k])
        if len(cand) >= 3 and cand in by_name:
            return by_name[cand]
    # Parent domain: "ocw.mit.edu" -> "mit.edu".
    if domain and domain.count(".") >= 2:
        parent = ".".join(domain.split(".")[-2:])
        if parent in by_dom:
            return by_dom[parent]
    return ""


def load_top20():
    rows = list(csv.DictReader((DATA / "programs_top20.csv").open(encoding="utf-8")))
    by_name, by_dom = load_logos()
    items = []
    for r in rows:
        if r["direction"] not in FIELD_SLUG:
            continue
        fmt = r["program_format"]
        section = "courses" if fmt in COURSE_FORMATS else "programs" if fmt in PROGRAM_FORMATS else None
        if not section:
            continue
        url = (r.get("url") or "").strip()
        items.append({
            "id": f"{FIELD_SLUG[r['direction']]}-{re.sub(r'[^a-z0-9]+', '-', (fmt + '-' + r['program']).lower()).strip('-')[:80]}",
            "name": r["program"].strip(),
            "provider": r["provider"].strip(),
            "field": FIELD_SLUG[r["direction"]],
            "format": fmt,
            "fmt": FORMAT_SHORT.get(fmt, fmt),
            "section": section,
            "url": url,
            "domain": host(url),
            "logo": logo_for(r["provider"], host(url), by_name, by_dom),
            "rank": int(r["rank_final"]) if (r.get("rank_final") or "").isdigit() else 99,
            "sources": int(r["source_count"]) if (r.get("source_count") or "").isdigit() else 1,
            "cost": cost_of(r),
            "level": (r.get("level_chatgpt") or "").strip(),
            "access": (r.get("access_chatgpt") or "").strip(),
            "selectivity": (r.get("selectivity_grok") or "").strip(),
            "note": note_of(r),
        })
    return items


def load_ranked():
    manifest = {m["program"].strip().lower(): m for m in csv.DictReader((DATA / "programs_logo_manifest.csv").open(encoding="utf-8-sig"))}
    rows = list(csv.DictReader((DATA / "programs_ranked_168.csv").open(encoding="utf-8-sig")))
    by_name, by_dom = load_logos()
    out = []
    for r in rows:
        status = r["selection_status"]
        if not status.startswith(("Selected", "Additional")):
            continue  # contextual entities and exclusions are not programs
        m = manifest.get(r["program"].strip().lower())
        domain = (m["domain_for_logo"] if m else "") or host(r.get("official_program_url") or "")
        out.append({
            "category": r["final_category"],
            "rank": int(r["category_rank"]) if r["category_rank"].isdigit() else 99,
            "name": r["program"].strip(),
            "operator": r["operator"].strip(),
            "url": (r.get("official_program_url") or "").strip(),
            "domain": domain,
            "logo": logo_for(r["operator"], domain, by_name, by_dom) or logo_for(r["program"], domain, by_name, by_dom),
            "kind": (m["category"] if m else "").strip(),
            "examples": [x.strip() for x in (r.get("example_companies") or "").split(";") if x.strip()][:3],
            "hit_rate": float(r["hit_rate_pct"]) if (r.get("hit_rate_pct") or "").replace(".", "", 1).isdigit() else None,
            "alumni": int(r["harmonic_alumni"]) if (r.get("harmonic_alumni") or "").isdigit() else None,
            "candidate": status.startswith("Additional"),
        })
    out.sort(key=lambda x: (x["category"], x["rank"]))
    return out


PAGE = """<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · Frontier Concepts</title>
<meta name="description" content="{description}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="{base}/{section}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Frontier Concepts">
<meta property="og:title" content="{title} · Frontier Concepts">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{base}/{section}/">
<meta property="og:image" content="{base}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@andrewsor_">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/styles.css">
<script>
  try {{ var t = localStorage.getItem('fa-theme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); }} catch (e) {{}}
</script>
</head>
<body data-section="{section}">
<header class="topbar" id="topbar">
  <div class="topbar-left">
    <a class="brand" href="/" aria-label="Frontier Concepts home">
      <span class="brand-mark"><svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="6" fill="#141414" stroke="#2a2a2a"/><g stroke="#ffffff" stroke-opacity=".22" stroke-width=".8" fill="none"><path d="M6 2v28"/><path d="M10 2v28"/><path d="M14 2v28"/><path d="M18 2v28"/><path d="M22 2v28"/><path d="M26 2v28"/><path d="M2 6h28"/><path d="M2 10h28"/><path d="M2 14h28"/><path d="M2 18h28"/><path d="M2 22h28"/><path d="M2 26h28"/></g><circle cx="16" cy="16" r="11" stroke="#ffffff" stroke-width="1.1" fill="none"/></svg></span>
      <span class="brand-text">frontier <span class="brand-tv">concepts.</span></span>
    </a>
  </div>
  <form class="search" id="search-form" role="search">
    <input id="search-input" type="search" placeholder="{placeholder}" aria-label="Search" autocomplete="off">
    <button class="search-btn" type="submit" aria-label="Search">
      <svg viewBox="0 0 24 24" width="22" height="22"><path d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" fill="currentColor"/></svg>
    </button>
  </form>
  <div class="topbar-right">
    <button class="icon-btn" id="theme-btn" aria-label="Toggle dark mode" title="Toggle dark mode">
      <svg class="ico-sun" viewBox="0 0 24 24" width="22" height="22"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5h0a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm0 18a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1zM2 12a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1zm17-1h2a1 1 0 1 1 0 2h-2a1 1 0 1 1 0-2zM4.9 4.9a1 1 0 0 1 1.4 0l1.4 1.4a1 1 0 0 1-1.4 1.4L4.9 6.3a1 1 0 0 1 0-1.4zm11.4 11.4a1 1 0 0 1 1.4 0l1.4 1.4a1 1 0 0 1-1.4 1.4l-1.4-1.4a1 1 0 0 1 0-1.4zM4.9 19.1l1.4-1.4a1 1 0 0 1 1.4 1.4l-1.4 1.4a1 1 0 0 1-1.4-1.4zm11.4-11.4l1.4-1.4a1 1 0 1 1 1.4 1.4l-1.4 1.4a1 1 0 0 1-1.4-1.4z" fill="currentColor"/></svg>
      <svg class="ico-moon" viewBox="0 0 24 24" width="22" height="22"><path d="M12 3a9 9 0 1 0 9 9c0-.5 0-.9-.1-1.3A5.5 5.5 0 0 1 13.3 3.1C12.9 3 12.5 3 12 3z" fill="currentColor"/></svg>
    </button>
  </div>
</header>
<nav class="tabs" id="tabs" aria-label="Fields"></nav>
<div class="layout"><main class="main" id="main" tabindex="-1"><noscript><p>This page needs JavaScript to filter the list. <a href="/">Frontier Concepts home</a>.</p></noscript></main></div>
<footer class="footer">
  <a href="https://x.com/andrewsor_" target="_blank" rel="noopener">Created by @andrewsor_</a>
  <span>Links go to each provider's own site.</span>
</footer>
<script src="/data/programs.js"></script>
<script src="/js/catalog.js"></script>
</body>
</html>
"""


def main():
    items = load_top20()
    ranked = load_ranked()
    courses = [i for i in items if i["section"] == "courses"]
    programs = [i for i in items if i["section"] == "programs"]
    out = {
        "fields": [{"slug": s, "name": n, "label": l} for n, s, l in FIELDS],
        "formats": {"courses": FORMAT_ORDER["courses"], "programs": FORMAT_ORDER["programs"], "short": FORMAT_SHORT},
        "courses": courses,
        "programs": programs,
        "ranked": ranked,
        "rankedCategories": [c for c, _ in Counter(r["category"] for r in ranked).most_common()],
    }
    DATA.mkdir(exist_ok=True)
    (DATA / "programs.js").write_text("window.FC_PROGRAMS = " + json.dumps(out, ensure_ascii=False) + ";\n")
    (DATA / "programs.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))

    pages = {
        "courses": {"title": "Courses", "placeholder": "Search courses, providers",
                    "description": f"{len(courses)} courses to learn the frontier technologies: MOOCs, self-study texts, bootcamps, cohort courses, workshops and certifications across AI, robotics, quantum, space, biotech, neurotech, semiconductors, energy and nanotech."},
        "programs": {"title": "Programs", "placeholder": "Search programs, providers",
                     "description": f"{len(programs)} programs that take you into a frontier field: fellowships, degrees, research training, internships, accelerators, labs and residencies, plus the programs ranked by founder outcomes."},
    }
    for section, meta in pages.items():
        d = SITE / section
        d.mkdir(exist_ok=True)
        (d / "index.html").write_text(PAGE.format(section=section, base=BASE, **meta))
    with_logo = sum(1 for i in items if i["logo"]) + sum(1 for r in ranked if r["logo"])
    print(f"logos matched for {with_logo} of {len(items) + len(ranked)} entries")
    print(f"courses {len(courses)}, programs {len(programs)}, ranked {len(ranked)}; wrote data/programs.js, courses/index.html, programs/index.html")


if __name__ == "__main__":
    main()
