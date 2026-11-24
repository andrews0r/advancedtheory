# Frontier Concepts

**[frontierconcepts.org](https://frontierconcepts.org)** — the best lectures, talks and founder stories on the frontier technologies: AI, robotics, quantum computing, space, biotech, neurotech, semiconductors, energy and nanotech.

A curated, ad-free view of YouTube. Nine topic playlists plus Builders, Hacker News favorites, Start a Company and Advanced Theory; dark and light mode; a lean-back TV mode. Vanilla HTML, CSS and JavaScript, no build step, hosted on GitHub Pages.

## Run locally

```bash
python3 scripts/serve.py
```

Then open http://localhost:8765.

## Where the videos come from

Everything is chosen offline by `scripts/fetch_videos.py`, which writes `data/videos.js`. Four sources, all passed through the same filter that keeps lectures, talks, explainers and interviews and drops news, promos, launches and entertainment:

1. **Organizations** behind a curated list of frontier learning programs: YouTube searches per topic, kept only when the video is on a listed organization's channel or names one.
2. **Hacker News**: videos linked two or more times on HN for the topic (`scripts/fetch_hn.py`, no key needed).
3. **Builders**: explainers and technical updates from the channels of the companies building each field. Channel handles live in `LEADERS` in the fetch script.
4. **Curated lists**: `data/curated_library.csv` feeds the Start a Company and Advanced Theory tabs; `data/manual_adds.txt` takes one-off links (URL, playlist slug, optional label).

## Courses and Programs

`scripts/build_programs.py` builds the two catalogue pages from `data/programs_top20.csv` (the Frontier Academy list, 2,452 programs across nine fields and 25 formats), `data/programs_ranked_168.csv` (programs ranked by founder outcomes) and `data/programs_logo_manifest.csv` (domains for logos). Course-type formats (online courses, self-study, live courses, bootcamps, workshops, certifications, project-based, corporate, coaching) go to `/courses/`; the rest (fellowships, degrees, research training, internships, accelerators, labs, residencies) go to `/programs/`, which also shows the ranked list. A program listed under several fields or formats becomes one row carrying all of them. Hand-added entries go in `data/programs_manual.csv` (same columns). It writes `data/programs.js` and both pages' HTML. Both pages are dense sortable tables with filter chips, ordered by default by a signal score (agreement between research passes, format weight, provider standing, penalties for consumer platforms; `signal_score` in the build script); the Programs page has a second view, "Ranked by founder outcomes". Logos come from a supplied provider logo pack (`data/logos_index.csv`, files under `logos/`, rasters resized to 128px), matched by provider name, then organization (`ORG_DOMAINS` in the build script maps entries hosted on platforms such as Coursera to their organization's site), then domain and parent domain; `scripts/fetch_logos.py` fetches site icons for whatever is still missing into `logos/fav-<domain>.png`. Entries with no match show a monogram.

## Research and People

`scripts/build_library.py` builds `/research/` and `/people/` from two hand-curated CSVs: `data/research.csv` (field, title, authors, year, kind, url, note) and `data/people.csv` (field, name, kind, role, org, site, x, youtube, note). Fifty rows each to start; the CSV order within a field is the editorial order. It writes `data/library.js` and both pages, with the list pre-rendered in the HTML and an ItemList in JSON-LD so crawlers see it without JavaScript. Both pages use the same table engine as Courses and Programs (`js/catalog.js`) with their own columns: People has role, kind, field, why and where to follow; Research has authors, year, type, field and why it matters.

Two feeders: `scripts/mine_papers.py` pulls every Hacker News story that links to a paper host (arXiv, Nature, Science, DOI, bioRxiv, IEEE, ACM, APS and PDFs) above a points floor, assigns each to a field by title pattern, keeps the top 20 per field by points, fills authors and years from the arXiv API and Crossref, and writes `data/research_hn.csv`; the library build appends those after the editorial picks (an HN paper that is also an editorial pick just lends it its points), and the Research page gets a Source filter and an HN column linking to the discussion. `scripts/merge_x_accounts.py <export.csv>` folds an X accounts export (field, account_type, handle, name, why) into `data/people.csv`: it fills handles for people already listed and adds the rest using the hand-written profiles in the script. Both only touch the CSVs; re-run `build_library.py` after.

## Learn with AI (demo)

`/learnwithai/` is a demo of the learning assistant, built from the same catalogue and kept out of search (`noindex`). A **pursuit** is one subject you build expertise in: a field, a narrower topic, a duration (3, 6, 9 or 12 months) and a weekly load (minimal, part time, full time). `js/learnwithai.js` plans it week by week from `data/videos.js`, `data/programs.js` and `data/library.js` in four phases (Foundations, Core, Practice, Launch) and keeps each pursuit as a conversation with scripted replies. Every move opens as its own session whose layout follows the format: a player for a talk, a reading guide for a paper, a brief and checklist for a project, a profile and message draft for a conversation, an application checklist for a program. Home lists what is coming up and what was done; Discover lists fellowships, internships, residencies, accelerators, competitions and live courses from the programs data, with Apply adding the program to the path. Calendar, Library and Tasks are views over the same plan. State lives in `localStorage`; nothing is sent anywhere.

## Refreshing the catalogue

1. Put a YouTube Data API key in `.env` as `YOUTUBE_API_KEY=...` (git-ignored).
2. Run `python3 scripts/fetch_hn.py`, then `python3 scripts/fetch_videos.py`.

Responses are cached in `cache/`, so re-runs are nearly free. The default run stays well under the daily API quota; searches that cost 100 units each are opt-in flags (`--startup-searches`, `--max-channel-searches`). The fetch ends by running `scripts/build_pages.py`, which regenerates the crawlable pages under `p/`, `sitemap.xml`, `robots.txt`, `llms.txt` and `llms-full.txt`.

## Routes

- `/` site home: a node map of the nine fields and six sections drawn from `data/home.js` (counts, written by the page builder) with an expandable index · `/courses/` and `/programs/` (`#f=<field>&fmt=<format>&cost=free|funded|paid&q=&sort=<column>&dir=asc|desc`; `#view=ranked` on Programs) · `/research/` and `/people/` (`#f=<field>&fmt=<kind>&q=&sort=<column>&dir=`) · `/videos/#/` videos home · `/videos/#/p/<slug>` playlist · `#/w/<id>` watch · `#/search?q=` · `#/builders` · `#/hn` · `#/history` · `#/about` · `/learnwithai/` demo (`#/home` · `#/discover` · `#/new` · `#/p/<id>` · `#/p/<id>/i/<item>` · `#/calendar` · `#/library` · `#/tasks`)
- `/videos/#/tv?p=<slug>` TV mode: arrows next/previous, Space pause, S shuffle, F full screen, M mute, 0–9 switch playlist, Esc exit.

## Deploying

Push to `main`. GitHub Pages serves the repo root at frontierconcepts.org; `cache/` and `.env` never leave your machine.

Created by [@andrewsor_](https://x.com/andrewsor_). Videos belong to their creators and are streamed from YouTube.
