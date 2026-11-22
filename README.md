# FrontierTube

A YouTube-style viewer restricted to videos tied to the providers on the Frontier Academy program list (`frontier_academy_programs_filtered_top20.csv`, nine directions, 2,452 programs). One playlist per direction, an About page, dark and light themes, and a lean-back TV mode.

## Run it

```bash
python3 scripts/serve.py
```

Open http://localhost:8765. (Opening `index.html` directly from disk also works, since the data is loaded as a script.)

## Build the catalogue

1. Create `.env` in this folder with `YOUTUBE_API_KEY=...` (the file is git-ignored).
2. Run `python3 scripts/fetch_videos.py`. Use `--dry-run` to see the search plan and quota estimate first.

The script searches YouTube per direction (most-viewed topic queries, the top providers by program count, and the CSV's YouTube-native programs such as Scott Manley or the Stanford CS courses), then keeps only videos on a listed provider's channel or naming a listed provider in the title/description. It writes `data/videos.js`, `data/videos.json` and `data/providers.js`. Every API response is cached in `cache/`, so re-runs are free; delete the cache to refresh.

Default plan: about 85 searches, roughly 8,500 of the 10,000 daily quota units (robotics gets ten extra provider-targeted searches because few robotics channels are on the list). Tune with `--topics-per-direction`, `--providers-per-direction`, `--native-per-direction`, or limit to some playlists with `--directions ai robotics`.

## Three sources

1. **Listed providers**: YouTube searches per direction, kept only when tied to a provider on the Frontier Academy list.
2. **Hacker News picks**: videos linked two or more times on HN for the direction's topics (`scripts/fetch_hn.py`, no key needed), up to 50 per playlist.
3. **Builders** (shown as "From the builders"): explainers from the three leading companies' own channels per direction (DeepMind/OpenAI/Anthropic, Boston Dynamics/FANUC/Figure, IBM Quantum/Google Quantum AI/Quantinuum, SpaceX/Rocket Lab/Blue Origin, Genentech/Regeneron/Illumina, Neuralink/Synchron/Precision Neuroscience, TSMC/NVIDIA/ASML, CFS/TerraPower/Form Energy, Bruker/Oxford Instruments/Nanosys), up to 30 per playlist, plus a second wave of frontier startups (Sakana AI, World Labs, Mistral, Physical Intelligence, Skild, PsiQuantum, QuEra, Alice & Bob, Stoke, Varda, Impulse, Profluent, Mammoth, Cellares, Paradromics, Science Corp, Etched, Lightmatter, Ayar Labs, Helion, Chiral, SkyNano, Nfinite). Channel uploads are listed cheaply (about 1 quota unit per 50 videos) and filtered to talks, updates, tutorials and how-it-works videos; trailers, announcements, keynotes, recruiting and launch webcasts are dropped. Handles live in `LEADERS` in the fetch script; `id:UC...` pins a channel id when a handle is ambiguous, an empty list means the script may find the channel by search (100 units each, only when `--max-channel-searches N` is passed; cached searches are free), and `None` means the company has no channel of its own and is skipped.

All three pass the same educational filter.

## Curated library

`data/curated_library.csv` is a hand-curated list (columns: section, collection, frontier_category, secondary_categories, subject, video_title, channel, youtube_url/youtube_id, selection_note, ...). Rows in section "Start a Company" go to that tab and take precedence over automatic picks inside its 100-video cap; rows in "Curated Collections" form the **Advanced Theory** tab ("The Hard Stuff: 50 Fields Explained"). Each row is also filed under its primary field, and both tabs can be filtered by field. Lookups cost about 1 quota unit per 50 rows. Edit the CSV and re-run to change either tab.

## Hand-picked videos

Put links in `data/manual_adds.txt` (one per line: URL or id, playlist slug, optional label) and re-run the script; they are looked up at about 1 quota unit per 50 videos and filed where you say, bypassing the automatic filters.

A tenth tab, **Start a Company**, holds up to 100 founder videos where company building meets the frontier topics: uploads from Y Combinator (incl. Peter Thiel's CS183B lectures), a16z, First Round Capital, Lenny's Podcast, NFX, 20VC and Acquired whose titles name one of the nine topics or a builder company (generic startup advice is excluded), plus catalogue videos whose titles are about founding. Channels also include Sequoia, Founders Fund, Lux, Khosla and Bessemer. Optional topic-targeted founder searches (`STARTUP_SEARCHES`, `--startup-searches N`, off by default, 100 units each) add interviews and startup stories for the non-AI directions, and the tab is balanced: AI-only titles take at most `--startup-ai-share` (30%) of the slots and each other topic gets `--startup-topic-min` (8) reserved slots first. At most 20 per channel; `--startup-pages` sets how many upload pages (50 each) to scan per channel.

## Deploying

Static site: publish `index.html`, `css/`, `js/`, `og.png` and `data/videos.js` + `data/providers.js` (the rest is build tooling). The site lives at https://frontiertube.org; the Open Graph tags in `index.html` already point there.

## Routes

- `#/` home, `#/p/<slug>` playlist (`?src=providers|hn|leaders` filters by source; `?field=<slug>` filters the Start a Company and Advanced Theory tabs by field), `#/w/<id>?p=<slug>` watch, `#/search?q=`, `#/hn`, `#/builders` (also `#/leaders`), `#/history`, `#/about`
- `#/tv?p=<slug|all>` TV mode. Keys: arrows for next/previous, Space play/pause, S shuffle, F full screen, M mute, 0 to 9 switch playlist, Esc exit.

The current catalogue was built on 21 November 2026: about 1,580 videos across the nine playlists, including about 340 Hacker News picks. Run `python3 scripts/fetch_hn.py` first (no key needed) to refresh the HN candidates, then the fetch script merges up to 50 per playlist (`--hn-per-direction`). The fetch script also applies an educational filter: news and entertainment channels, launch and live-stream footage, listicles, reviews and hype titles are dropped.
