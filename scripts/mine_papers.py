#!/usr/bin/env python3
"""Mine the papers Hacker News readers upvoted most, per field, into data/research_hn.csv.

Same idea as hackerpapers.si (papers that were shared on HN, ranked by points), done directly
against the HN Algolia archive so it can be cut by our nine fields:

  1. Pull every HN story that links to a paper host (arXiv, Nature, Science, DOI, bioRxiv, PNAS,
     IEEE, ACM, APS...) or a PDF with points >= MIN, one query per host and year so no query
     hits Algolia's 1,000-hit cap.
  2. Assign each story to the field whose pattern matches its title best (title first, URL as
     a tiebreak); the broad AI pattern loses ties to the more specific fields.
  3. Dedupe by normalized URL (arXiv id without version, DOI, or the bare URL), keeping the
     most upvoted post; sort by points; keep the top N per field.
  4. Fill title, authors and year from the arXiv API and Crossref where the URL carries an id;
     otherwise keep the HN title and the post year.

Free APIs, no keys. Re-run with --top 40 to widen. Editorial picks stay in data/research.csv;
scripts/build_library.py merges the two, editorial first.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

SITE = __import__("pathlib").Path(__file__).resolve().parent.parent
OUT = SITE / "data" / "research_hn.csv"
API = "https://hn.algolia.com/api/v1/search?"
UA = {"User-Agent": "frontier-concepts paper miner (static site; contact via github.com/andrews0r/frontierconcepts)"}

PAPER_HOSTS = ("arxiv.org", "nature.com", "science.org", "sciencemag.org", "doi.org", "biorxiv.org", "medrxiv.org", "pnas.org", "cell.com",
               "ieeexplore.ieee.org", "dl.acm.org", "journals.aps.org", "link.aps.org", "pubs.acs.org", "onlinelibrary.wiley.com", "sciencedirect.com",
               "nejm.org", "thelancet.com", "iopscience.iop.org", "royalsocietypublishing.org", "journals.plos.org", "frontiersin.org", "jmir.org",
               "openreview.net", "proceedings.neurips.cc", "papers.nips.cc", "aclanthology.org", "ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov",
               "elifesciences.org", "cambridge.org", "springer.com", "link.springer.com", "ssrn.com", "semanticscholar.org", "proceedings.mlr.press",
               "research.google", "deepmind.google", "openai.com/research", "arxiv-vanity.com", "ar5iv")
EXCLUDE_RX = re.compile(r"^(ask|show|tell|launch) hn\b", re.I)

HOST_TERMS = ["arxiv.org", "nature.com", "science.org", "sciencemag.org", "doi.org", "biorxiv.org", "pnas.org", "cell.com", "ieee.org", "acm.org", "aps.org",
              "acs.org", "wiley.com", "sciencedirect.com", "nejm.org", "iop.org", "plos.org", "openreview.net", "neurips.cc", "nih.gov", "elifesciences.org",
              "springer.com", "mlr.press", "pdf"]
# Specific fields first: a title matching two patterns goes to the earlier one on a tie.
PRIORITY = ["nanotech", "quantum", "neurotech", "robotics", "energy", "space", "biotech", "ai", "semiconductors"]
FIELDS = {
    "ai": (["arxiv neural network", "arxiv language model", "arxiv transformer", "arxiv reinforcement learning", "arxiv diffusion model", "deep learning paper", "LLM paper", "attention is all you need", "scaling laws", "GPT paper", "alignment paper"],
           r"\b(?:neural networks?|deep learning|machine learning|transformers?|language models?|LLMs?|GPT-?\d?|reinforcement learning|diffusion models?|self-attention|artificial intelligence|backprop(?:agation)?|convolutional|generative|GANs?|RLHF|AI alignment|AGI|reasoning models?|mixture of experts|embeddings?|tokeniz\w+|large language|foundation models?|chain of thought|autoregressive|gradient descent|overfitting|fine-?tun\w+)\b"),
    "robotics": (["arxiv robot", "robot learning", "humanoid robot paper", "legged locomotion", "robot manipulation", "autonomous driving paper", "SLAM paper", "drone paper"],
           r"\b(?:robots?|robotics?|robotic (?:manipulation|arms?|hands?)|dexterous|humanoids?|legged|locomotion|autonomous (?:driving|vehicles?|navigation)|self-driving|SLAM|quadrupeds?|grasping|drones?|quadrotors?|teleoperation|visuomotor|motion planning)\b"),
    "quantum": (["quantum computing paper", "arxiv quantum", "quantum error correction", "qubit", "quantum supremacy", "quantum advantage", "quantum algorithm", "superconducting qubit"],
           r"\b(?:quantum (?:comput\w+|error|supremacy|advantage|algorithms?|circuits?|processors?|annealing|information|entanglement|simulation|cryptography|key distribution|gates?|teleportation|machine learning)|qubits?|ion traps?|superconducting (?:qubits?|processors?|circuits?)|shor'?s algorithm|post-quantum)\b"),
    "space": (["rocket paper", "arxiv exoplanet", "spacecraft paper", "orbital mechanics", "mars mission paper", "satellite paper", "space propulsion", "nasa technical report", "asteroid paper", "interstellar paper"],
           r"\b(?:rockets?|rocketry|orbital|in orbit|satellites?|spacecraft|mars|lunar|moon landing|exoplanets?|planetary|propulsion|launch vehicles?|nasa|spacex|asteroids?|interstellar|telescopes?|starship|re-?entry|solar sails?|space station|space flight|spaceflight|astronauts?|cosmic|galaxy|galaxies|black holes?|neutron stars?|supernova|james webb|hubble)\b"),
    "biotech": (["arxiv protein", "biorxiv", "CRISPR paper", "genome paper", "protein structure paper", "synthetic biology paper", "mRNA paper", "aging paper nature", "antibiotic paper", "cell paper", "sequencing paper", "alphafold"],
           r"\b(?:CRISPR|genomes?|genomic|gene (?:editing|therapy|expression|drives?|regulation)|genetic|proteins?|DNA|RNA|mRNA|stem cells?|T cells?|cell (?:biology|therapy|lines?)|synthetic biology|biolog\w+|antibiotics?|vaccines?|alphafold|enzymes?|sequencing|microbiome|ag(?:e)?ing|longevity|cancer|immune|immunotherapy|bacteria|bacterial|yeast|organoids?|phage|biosynthesis|metabolic|drug discovery|clinical trial)\b"),
    "neurotech": (["brain paper", "neuroscience paper", "brain-computer interface", "neural interface paper", "neuron paper", "optogenetics", "neuralink paper", "memory brain study", "cortex paper", "consciousness paper"],
           r"\b(?:brain(?:-| )(?:computer|machine) interfaces?|BCIs?|neural (?:interfaces?|implants?|recordings?|activity|circuits?|prosthe\w+)|neuroprosthe\w+|neurons?|neuronal|neuroscience|neuroscientists?|cortex|cortical|optogenetics?|hippocamp\w+|synap\w+|dopamine|neurotransmitters?|connectome|spinal cord|brain (?:implants?|activity|imaging|organoids?|map\w*|cells?|signals?|stimulation|tissue|regions?|scans?)|EEG|fMRI|neuralink|memory consolidation|deep brain stimulation)\b"),
    "semiconductors": (["transistor paper", "semiconductor paper", "chip design paper", "CPU architecture paper", "GPU paper", "lithography paper", "RISC-V paper", "moore's law paper", "FPGA paper", "memory chip paper", "TPU paper"],
           r"\b(?:semiconductors?|transistors?|MOSFETs?|FinFETs?|chips?|chiplets?|CPUs?|GPUs?|silicon|lithography|EUV|wafers?|FPGAs?|RISC-V|TPUs?|moore'?s law|VLSI|CMOS|\bfab\b|microprocessors?|DRAM|SRAM|photonics?|branch predict\w+|instruction sets?|TSMC|\d+ ?nm (?:process|node)|microarchitecture|ASICs?|integrated circuits?|computer architecture|x86|ARM processors?)\b"),
    "energy": (["fusion paper", "tokamak", "solar cell paper", "battery paper", "nuclear reactor paper", "grid paper", "perovskite", "lithium battery", "fusion energy", "geothermal paper", "hydrogen energy paper", "energy storage paper"],
           r"\b(?:fusion (?:energy|reactors?|power|plasma|ignition)|nuclear fusion|tokamaks?|stellarators?|solar (?:cells?|power|energy|panels?)|photovoltaics?|perovskite|batter(?:y|ies)|nuclear (?:power|reactors?|energy|fission|plants?)|power grid|electric grid|grid storage|wind (?:power|turbines?|energy)|geothermal|hydrogen (?:fuel|production|economy)|energy storage|lithium-ion|lithium|carbon capture|electrolysis|ignition|thorium|uranium|renewable|fuel cells?|electric vehicles?|EVs)\b"),
    "nanotech": (["graphene paper", "nanotechnology paper", "carbon nanotube", "nanoparticle paper", "metamaterial paper", "molecular machine", "scanning tunneling microscope", "nanomaterial", "2D material paper", "DNA origami", "quantum dot paper"],
           r"\b(?:nano(?!second)\w*|graphene|carbon nanotubes?|molecular (?:machines?|motors?|manufacturing)|metamaterials?|2D materials?|two-dimensional materials?|self-assembl\w+|quantum dots?|atomically (?:thin|precise)|atomic(?:-| )scale|scanning tunneling|atomic force microscop\w+|MEMS|nanoparticles?|nanowires?|aerogels?|single-atom|single atoms?|DNA origami|monolayers?)\b"),
}


def get(params: dict) -> dict:
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(API + urllib.parse.urlencode(params), headers=UA), timeout=30) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001
            time.sleep(2 * (attempt + 1)); err = e
    print(f"  algolia failed: {err}", file=sys.stderr); return {"hits": []}


def is_paper(url: str) -> bool:
    u = url.lower()
    return any(h in u for h in PAPER_HOSTS) or u.split("?")[0].endswith(".pdf")


ARXIV_RX = re.compile(r"arxiv\.org/(?:abs|pdf|html)/([a-z\-]+/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?", re.I)
DOI_RX = re.compile(r"(10\.\d{4,9}/[^\s?#]+)", re.I)


def key_of(url: str) -> tuple[str, str]:
    """(kind, key): ('arxiv', id) | ('doi', doi) | ('url', normalized url)."""
    m = ARXIV_RX.search(url)
    if m:
        return "arxiv", m.group(1).lower()
    u = url
    if "nature.com/articles/" in u:
        return "doi", "10.1038/" + u.split("nature.com/articles/")[1].split("?")[0].split("#")[0].rstrip("/").split(".pdf")[0]
    m = DOI_RX.search(u)
    if m and any(h in u for h in ("doi.org", "science.org", "pnas.org", "cell.com", "journals.aps.org", "link.aps.org", "pubs.acs.org", "onlinelibrary.wiley.com", "iopscience", "royalsociety", "plos", "frontiersin", "jmir", "elifesciences", "cambridge.org", "springer", "dl.acm.org", "biorxiv", "medrxiv")):
        return "doi", m.group(1).rstrip("/.").lower()
    u = re.sub(r"^https?://(www\.)?", "", u).split("#")[0].rstrip("/")
    u = re.sub(r"\?(utm_[^&]*&?)+$", "", u)
    return "url", u.lower()


def corpus(min_points: int, years: range) -> dict:
    """Every paper-host story above the floor, keyed by normalized URL, best post kept."""
    best, n = {}, 0
    for term in HOST_TERMS:
        for y in years:
            lo = int(datetime(y, 1, 1, tzinfo=timezone.utc).timestamp()); hi = int(datetime(y + 1, 1, 1, tzinfo=timezone.utc).timestamp())
            d = get({"query": term, "tags": "story", "restrictSearchableAttributes": "url", "hitsPerPage": 1000,
                     "numericFilters": f"points>={min_points},created_at_i>={lo},created_at_i<{hi}"})
            hits = d.get("hits", [])
            if len(hits) >= 1000:
                print(f"  {term} {y}: hit the 1,000 cap; raise --min-points or split the year", file=sys.stderr)
            for h in hits:
                url, title = h.get("url") or "", h.get("title") or ""
                if not url or not title or EXCLUDE_RX.search(title) or not is_paper(url):
                    continue
                kind, key = key_of(url)
                rec = {"title": title.strip(), "url": url, "points": h.get("points") or 0, "comments": h.get("num_comments") or 0,
                       "hn_id": h.get("objectID"), "year": datetime.fromtimestamp(h.get("created_at_i", 0), tz=timezone.utc).year, "kind": kind, "key": key, "mentions": 1}
                cur = best.get((kind, key))
                if cur is None:
                    best[(kind, key)] = rec
                elif rec["hn_id"] != cur["hn_id"]:
                    cur["mentions"] += 1
                    if rec["points"] > cur["points"]:
                        rec["mentions"] = cur["mentions"]; best[(kind, key)] = rec
            n += len(hits)
            time.sleep(0.25)
    print(f"corpus: {n} hits, {len(best)} distinct papers", file=sys.stderr)
    return best


NEWS_DOI = re.compile(r"^doi:10\.1038/d4|^doi:10\.1126/science\.a[a-z]{2}\d|^doi:10\.1126/article")  # Nature and Science news, not papers


def is_scholarly(rec: dict) -> bool:
    k = f"{rec['kind']}:{rec['key']}"
    return rec["kind"] in ("arxiv", "doi") and not NEWS_DOI.search(k)


def classify(rec: dict, patterns: dict) -> str | None:
    """Title only; the URL breaks ties. Needs an identifiable paper (arXiv id or DOI)."""
    if not is_scholarly(rec):
        return None
    scores = {}
    for field, rx in patterns.items():
        t = len(set(m.lower() for m in rx.findall(rec["title"])))
        u = 1 if t and rx.search(rec["url"]) else 0
        if t:
            scores[field] = (t, u)
    if not scores:
        return None
    top = max(scores.values())
    for field in PRIORITY:
        if scores.get(field) == top:
            return field
    return None


def arxiv_meta(ids: list[str]) -> dict:
    out = {}
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        try:
            with urllib.request.urlopen(urllib.request.Request("https://export.arxiv.org/api/query?" + urllib.parse.urlencode({"id_list": ",".join(chunk), "max_results": len(chunk)}), headers=UA), timeout=60) as r:
                root = ET.fromstring(r.read())
        except Exception as e:  # noqa: BLE001
            print(f"  arxiv failed: {e}", file=sys.stderr); continue
        ns = {"a": "http://www.w3.org/2005/Atom"}
        for e in root.findall("a:entry", ns):
            aid = (e.findtext("a:id", "", ns) or "").split("/abs/")[-1]
            aid = re.sub(r"v\d+$", "", aid).lower()
            authors = [x.findtext("a:name", "", ns) for x in e.findall("a:author", ns)]
            out[aid] = {"title": re.sub(r"\s+", " ", e.findtext("a:title", "", ns) or "").strip(), "authors": authors, "year": (e.findtext("a:published", "", ns) or "")[:4]}
        time.sleep(3)
    return out


def crossref_meta(doi: str) -> dict | None:
    try:
        with urllib.request.urlopen(urllib.request.Request("https://api.crossref.org/works/" + urllib.parse.quote(doi), headers=UA), timeout=30) as r:
            m = json.loads(r.read())["message"]
    except Exception:  # noqa: BLE001
        return None
    title = (m.get("title") or [""])[0]
    authors = [f"{a.get('given', '')} {a.get('family', '')}".strip() for a in m.get("author", []) if a.get("family")]
    year = ""
    for k in ("published-print", "published-online", "issued", "created"):
        parts = (m.get(k) or {}).get("date-parts") or [[None]]
        if parts and parts[0] and parts[0][0]:
            year = str(parts[0][0]); break
    return {"title": re.sub(r"\s+", " ", title).strip(), "authors": authors, "year": year}


def short_authors(authors: list[str]) -> str:
    fam = [a.split()[-1] for a in authors if a.strip()]
    if not fam: return ""
    if len(fam) == 1: return fam[0]
    if len(fam) == 2: return f"{fam[0]} and {fam[1]}"
    return f"{fam[0]} et al."


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=20)
    ap.add_argument("--min-points", type=int, default=20)
    ap.add_argument("--from-year", type=int, default=2008)
    ap.add_argument("--refresh", action="store_true", help="refetch the HN corpus instead of using cache/")
    ap.add_argument("--fields", default=",".join(FIELDS))
    a = ap.parse_args()
    patterns = {f: re.compile(FIELDS[f][1], re.I) for f in a.fields.split(",")}
    cache = SITE / "cache" / f"hn_papers_{a.min_points}_{a.from_year}.json"
    if cache.exists() and not a.refresh:
        best = {tuple(k.split("\t", 1)): v for k, v in json.loads(cache.read_text()).items()}
        print(f"corpus from cache: {len(best)} papers ({cache.name}; --refresh to refetch)", file=sys.stderr)
    else:
        best = corpus(a.min_points, range(a.from_year, datetime.now(tz=timezone.utc).year + 1))
        cache.parent.mkdir(exist_ok=True)
        cache.write_text(json.dumps({"\t".join(k): v for k, v in best.items()}))
    for r in best.values():
        r["field"] = classify(r, patterns)
    rows = []
    for field in a.fields.split(","):
        ranked = sorted((r for r in best.values() if r["field"] == field), key=lambda r: (-r["points"], -r["comments"]))[: a.top * 2]
        print(f"{field}: {sum(1 for r in best.values() if r['field'] == field)} papers, keeping up to {a.top}", file=sys.stderr)
        rows += ranked
    # Enrich.
    ax = arxiv_meta(sorted({r["key"] for r in rows if r["kind"] == "arxiv"}))
    for r in rows:
        meta = ax.get(r["key"]) if r["kind"] == "arxiv" else crossref_meta(r["key"]) if r["kind"] == "doi" else None
        if r["kind"] == "doi": time.sleep(0.2)
        r["authors"] = short_authors(meta["authors"]) if meta and meta.get("authors") else ""
        r["skip"] = not r["authors"]  # no authors on record: an editorial, a news item or a dead DOI
        if meta and meta.get("title") and len(meta["title"]) > 8: r["title"] = meta["title"]
        if meta and meta.get("year"): r["year"] = meta["year"]
        t = r["title"].lower()
        r["type"] = "Lecture notes" if "lecture notes" in t or "course notes" in t else "Textbook" if re.search(r"\b(?:textbook|handbook|book)\b", t) else "Paper"
        r["title"] = re.sub(r"\s*\[pdf\]\s*$", "", r["title"], flags=re.I).strip()
    # Final top N per field after enrichment-based dedupe on title.
    out, seen = [], set()
    for field in a.fields.split(","):
        n = 0
        for r in [x for x in rows if x["field"] == field]:
            tk = re.sub(r"[^a-z0-9]+", " ", r["title"].lower()).strip()
            if tk in seen or r.get("skip"): continue
            seen.add(tk); out.append(r); n += 1
            if n >= a.top: break
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=["field", "title", "authors", "year", "kind", "url", "note", "hn_points", "hn_comments", "hn_id", "mentions"], lineterminator="\n")
    w.writeheader()
    for r in out:
        w.writerow({"field": r["field"], "title": r["title"], "authors": r["authors"], "year": r["year"], "kind": r["type"], "url": r["url"], "note": "",
                    "hn_points": r["points"], "hn_comments": r["comments"], "hn_id": r["hn_id"], "mentions": r["mentions"]})
    OUT.write_text(buf.getvalue())
    print(f"wrote {len(out)} rows -> {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
