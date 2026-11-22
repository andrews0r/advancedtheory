# Frontier Concepts

**[frontierconcepts.org](https://frontierconcepts.org)**

The best way to learn a hard field is to watch the people working on it. YouTube has those videos and buries them. This is the small part of YouTube worth your time on nine frontier technologies: AI, robotics, quantum computing, space, biotech, neurotech, semiconductors, energy and nanotech. About two thousand videos, no ads, no recommendation engine.

It's a static site. HTML, CSS and one JavaScript file. No build step. GitHub Pages serves it.

## Run it

```bash
python3 scripts/serve.py
```

Open http://localhost:8765.

## How videos get in

A script picks them, offline, and writes `data/videos.js`. A video has to pass three tests.

1. **It comes from somewhere that matters.** A university or lab on a curated list of the best programs in each field, a company building the thing (`LEADERS` in the fetch script), or a link Hacker News readers kept posting (`scripts/fetch_hn.py`).
2. **It teaches something.** Lectures, talks, explainers and interviews stay. News, launches, promos and reaction videos go.
3. **It's about the field**, not just mentioning it.

Two tabs are picked by hand instead: `data/curated_library.csv` feeds Start a Company and Advanced Theory. One-off links go in `data/manual_adds.txt` (URL, playlist slug, optional label).

The rules are code, and the code makes mistakes. If something doesn't belong, open an issue.

## Refresh

1. Put a YouTube Data API key in `.env` as `YOUTUBE_API_KEY=...`. It's git-ignored.
2. `python3 scripts/fetch_hn.py`, then `python3 scripts/fetch_videos.py`.

Responses are cached in `cache/`, so a re-run is almost free. The default run uses a small fraction of the daily API quota; the expensive searches are behind flags (`--startup-searches`, `--max-channel-searches`). The fetch finishes by regenerating the crawlable pages under `p/`, `sitemap.xml`, `robots.txt`, `llms.txt` and `llms-full.txt`.

## Routes

- `#/` home · `#/p/<slug>` playlist · `#/w/<id>` watch · `#/search?q=` · `#/builders` · `#/hn` · `#/history` · `#/about`
- `#/tv?p=<slug>` TV mode. Arrows for next and previous, Space to pause, S to shuffle, F for full screen, M to mute, 0–9 to switch playlist, Esc to leave.

## Deploy

Push to `main`. That's it.

Made by [@andrewsor_](https://x.com/andrewsor_). The videos belong to the people who made them; they play from YouTube.
