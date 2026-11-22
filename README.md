# Advanced Theory

**[advancedtheory.org](https://advancedtheory.org)** — the best lectures, talks and founder stories on the frontier technologies: AI, robotics, quantum computing, space, biotech, neurotech, semiconductors, energy and nanotech.

A curated, ad-free view of YouTube. Nine topic playlists plus Builders, Hacker News favorites, Start a Company and The Hard Stuff; dark and light mode; a lean-back TV mode. Vanilla HTML, CSS and JavaScript, no build step, hosted on GitHub Pages.

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
4. **Curated lists**: `data/curated_library.csv` feeds the Start a Company and The Hard Stuff tabs; `data/manual_adds.txt` takes one-off links (URL, playlist slug, optional label).

## Refreshing the catalogue

1. Put a YouTube Data API key in `.env` as `YOUTUBE_API_KEY=...` (git-ignored).
2. Run `python3 scripts/fetch_hn.py`, then `python3 scripts/fetch_videos.py`.

Responses are cached in `cache/`, so re-runs are nearly free. The default run stays well under the daily API quota; searches that cost 100 units each are opt-in flags (`--startup-searches`, `--max-channel-searches`). The fetch ends by running `scripts/build_pages.py`, which regenerates the crawlable pages under `p/`, `sitemap.xml`, `robots.txt`, `llms.txt` and `llms-full.txt`.

## Routes

- `#/` home · `#/p/<slug>` playlist · `#/w/<id>` watch · `#/search?q=` · `#/builders` · `#/hn` · `#/history` · `#/about`
- `#/tv?p=<slug>` TV mode: arrows next/previous, Space pause, S shuffle, F full screen, M mute, 0–9 switch playlist, Esc exit.

## Deploying

Push to `main`. GitHub Pages serves the repo root at advancedtheory.org; `cache/` and `.env` never leave your machine.

Created by [@andrewsor_](https://x.com/andrewsor_). Videos belong to their creators and are streamed from YouTube.
