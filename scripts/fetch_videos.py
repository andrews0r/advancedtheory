#!/usr/bin/env python3
"""Build the Advanced Theory video catalogue from the YouTube Data API.

Reads the curated provider list (frontier_academy_programs_filtered_top20.csv),
searches YouTube for the most viewed and most relevant videos in each of the nine
Frontier Academy directions, and keeps only videos that are tied to a provider on
the list (the provider's channel, or the provider named in the title/description).

Output: data/videos.json, data/videos.js (same data, loadable from file://),
data/providers.json (per-direction provider summary for the About page).

API key: pass --key, or set YOUTUBE_API_KEY, or put YOUTUBE_API_KEY=... in a .env
file next to the site root (frontier-academy-tv/.env). Responses are cached in
cache/, so re-runs do not spend quota again.

Quota: search.list costs 100 units per call (default daily quota 10,000). The
default plan below uses about 80 searches, roughly 8,000 units.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

SITE = pathlib.Path(__file__).resolve().parent.parent
HCI_ROOT = SITE.parents[4]
DEFAULT_CSV = (
    HCI_ROOT
    / "Human Learning/Markets and Providers/Fellowships and Programs"
    / "frontier_academy_programs_filtered_top20.csv"
)
CACHE = SITE / "cache"
DATA = SITE / "data"
API = "https://www.googleapis.com/youtube/v3/"

# Nine directions. slug/label are what the site shows; `topics` are the broad
# most-viewed searches, `keyword` is appended to provider-name searches.
DIRECTIONS = {
    "Artificial intelligence": {
        "slug": "ai",
        "label": "AI",
        "icon": "brain",
        "keyword": "AI",
        "topics": [
            "deep learning lecture",
            "large language models course",
            "machine learning full course",
            "reinforcement learning lecture",
            "transformers explained",
        ],
    },
    "Robotics": {
        "slug": "robotics",
        "label": "Robotics",
        "icon": "robot",
        "keyword": "robotics",
        "topics": [
            "robotics lecture",
            "humanoid robot",
            "ROS tutorial",
            "robot learning talk",
            "autonomous robots",
        ],
        # Few robotics channels are on the list, so search the listed providers directly.
        "extra": [
            "Boston Dynamics",
            "MIT robotics lecture",
            "Stanford robotics lecture",
            "CMU Robotics Institute seminar",
            "Google DeepMind robotics",
            "NVIDIA Isaac robotics",
            "Figure AI humanoid",
            "ETH Zurich legged robots",
            "Underactuated Robotics Tedrake",
            "Robotics Science and Systems talk",
        ],
    },
    "Quantum computing": {
        "slug": "quantum",
        "label": "Quantum",
        "icon": "atom",
        "keyword": "quantum",
        "topics": [
            "quantum computing lecture",
            "quantum computing course",
            "qiskit tutorial",
            "quantum algorithms explained",
            "quantum computer explained",
        ],
    },
    "Space exploration": {
        "slug": "space",
        "label": "Space",
        "icon": "rocket",
        "keyword": "space",
        "topics": [
            "space mission explained",
            "rocket launch",
            "astronautics lecture",
            "spacecraft engineering",
            "orbital mechanics lecture",
        ],
    },
    "Biotechnology": {
        "slug": "biotech",
        "label": "Biotech",
        "icon": "dna",
        "keyword": "biotechnology",
        "topics": [
            "synthetic biology lecture",
            "CRISPR explained",
            "genomics lecture",
            "molecular biology lecture",
            "bioengineering talk",
        ],
    },
    "Neurotechnology": {
        "slug": "neurotech",
        "label": "Neurotech",
        "icon": "neuron",
        "keyword": "neuroscience",
        "topics": [
            "brain computer interface",
            "neuroscience lecture",
            "computational neuroscience course",
            "EEG tutorial",
            "neural engineering",
        ],
    },
    "Semiconductors": {
        "slug": "semiconductors",
        "label": "Semiconductors",
        "icon": "chip",
        "keyword": "semiconductor",
        "topics": [
            "semiconductor manufacturing",
            "chip design course",
            "VLSI lecture",
            "how chips are made",
            "lithography explained",
        ],
    },
    "Advanced energy": {
        "slug": "energy",
        "label": "Energy",
        "icon": "bolt",
        "keyword": "energy",
        "topics": [
            "nuclear fusion explained",
            "renewable energy lecture",
            "energy systems course",
            "battery technology explained",
            "grid energy storage",
        ],
    },
    "Nanotechnology": {
        "slug": "nanotech",
        "label": "Nanotech",
        "icon": "hexagon",
        "keyword": "nanotechnology",
        "topics": [
            "nanotechnology lecture",
            "nanofabrication",
            "nanomaterials course",
            "cleanroom tour",
            "nanoscale science",
        ],
    },
}

# Industry leaders per direction: the company's own channel(s), listed cheaply via
# the uploads playlist (1 quota unit per 50 videos). Handles are tried in order.
LEADERS = {
    "ai": [
        ("Google DeepMind", ["GoogleDeepMind"]),
        ("OpenAI", ["OpenAI"]),
        ("Anthropic", ["anthropic-ai", "AnthropicAI"]),
        ("Sakana AI", ["SakanaAIOfficial"]),  # @SakanaAI is an unrelated anime channel
        ("World Labs", ["WorldLabsAI"]),
        ("Mistral AI", []),  # @MistralAI / @mistral-ai exist but hold no videos
    ],
    "robotics": [
        ("Boston Dynamics", ["BostonDynamics"]),
        ("FANUC", ["fanucamericacorporation"]),
        ("Figure AI", ["figureai", "FigureAI"]),
        ("Physical Intelligence", ["physicalintelligence"]),
        ("Skild AI", ["SkildAI"]),
    ],
    "quantum": [
        ("IBM Quantum", ["qiskit", "IBMResearch"]),
        ("Google Quantum AI", ["GoogleQuantumAI"]),
        ("Quantinuum", ["quantinuumqc"]),
        ("PsiQuantum", ["PsiQuantum"]),
        ("QuEra Computing", ["QuEraComputing"]),
        ("Alice & Bob", []),
    ],
    "space": [
        ("SpaceX", ["SpaceX"]),
        ("Rocket Lab", ["rocketlabcorp"]),
        ("Blue Origin", ["blueorigin", "BlueOrigin"]),
        ("Stoke Space", []),  # @StokeSpace is an unverified 31-subscriber channel
        ("Varda Space Industries", ["vardaspaceindustries"]),
        ("Impulse Space", ["ImpulseSpace"]),
    ],
    "biotech": [
        ("Genentech", ["genentech", "Genentech"]),
        ("Regeneron", ["Regeneron", "regeneron"]),
        ("Illumina", ["illumina", "IlluminaInc"]),
        ("Profluent", ["Profluent-Bio"]),  # @Profluent is an unverified 19-subscriber channel
        ("Mammoth Biosciences", None),  # no channel of its own; founder interviews live on other channels
        ("Cellares", None),
    ],
    "neurotech": [
        ("Neuralink", ["neuralink", "Neuralink"]),
        ("Synchron", ["SynchronBCI"]),
        ("Precision Neuroscience", ["precisionneuro", "PrecisionNeuroscience"]),
        ("Paradromics", ["Paradromics"]),
        ("Science Corporation", ["ScienceCorporation"]),
    ],
    "semiconductors": [
        ("TSMC", ["id:UC02yNxGj2MxhynehcWSxcLg"]),  # @tsmc4361; @tsmc is a person and search finds a Minecraft channel
        ("NVIDIA", ["NVIDIA"]),
        ("NVIDIA", ["NVIDIADeveloper"]),
        ("ASML", ["ASMLcompany", "ASML"]),
        ("Etched", None),  # no channel of its own
        ("Lightmatter", ["LightmatterInc"]),  # @lightmatterco exists but holds no videos
        ("Ayar Labs", ["AyarLabs"]),
    ],
    "energy": [
        ("Commonwealth Fusion Systems", ["commonwealthfusionsystems", "CFSenergy", "cfs_energy"]),
        ("TerraPower", ["TerraPowerLLC"]),
        ("Form Energy", ["formenergyinc"]),  # @formenergy is an unrelated Italian coaching firm
        ("Helion Energy", ["HelionEnergy"]),
    ],
    "nanotech": [
        ("Bruker", ["BrukerCorporation", "bruker", "Bruker"]),
        ("Oxford Instruments", ["OxfordInstruments", "oxfordinstruments", "OxfordInstrumentsplc"]),
        ("Nanosys", ["nanosysinc", "Nanosys", "nanosys"]),
        ("Chiral", ["chiralnano"]),  # @chiralofficial is a metal band
        ("SkyNano", None),  # no channel of its own
        ("Nfinite Nanotech", ["id:UCZgW9OtPmveTz_fJW5rsMGQ"]),
    ],
}
# Extra teaching signals that company channels use for substantive content.
EDU_LEADER_RX = re.compile(
    r"\b(update|overview|show and tell|deep dive|q&a|q & a|fireside|podcast|session|presentation|webinar|whiteboard|"
    r"technical|tech talk|under the hood|how we|how it works|behind|the science|the physics|the engineering|"
    r"architecture|roadmap|paper|benchmark|safety|alignment|interpretability|scaling|evaluation|research|"
    r"policy|generalization|generalist|\bVLA\b|clinical|participant|study|results|open.world|foundation model|"
    r"technology|milestone|first (light|plasma|flight|participant)|\bdemo\b|capabilit(y|ies))\b",
    re.IGNORECASE,
)
EDU_DESC_RX = re.compile(r"\b(explain|how it works|how we|lecture|tutorial|walkthrough|deep dive|overview of|introduction to|learn how|in this (video|talk|session))\b", re.IGNORECASE)
# "Start a Company" tab: founder content at the intersection of company building and
# the frontier topics. Scanned from these channels' uploads (cheap), plus videos already
# in the catalogue whose titles are about founding. Peter Thiel has no channel of his
# own; his lectures appear on Y Combinator's (CS183B) and are caught by name.
STARTUP_CHANNELS = [
    ("Y Combinator", ["ycombinator"]),
    ("a16z", ["a16z"]),
    ("First Round Capital", ["FirstRoundCapital", "firstround"]),
    ("Lenny's Podcast", ["LennysPodcast"]),
    ("NFX", ["nfxinsights"]),  # @NFX is an unrelated personal channel
    ("20VC", ["20VC", "TwentyMinuteVC", "20vcwithharrystebbings"]),
    ("Acquired", ["AcquiredFM", "acquiredpodcast"]),
    ("Sequoia Capital", ["sequoiacapital"]),
    ("Founders Fund", ["_foundersfund"]),
    ("Lux Capital", ["lux_capital"]),
    ("Khosla Ventures", ["KhoslaVentures1"]),
    ("Bessemer Venture Partners", ["id:UCKuHAxZoh99t8uyPQhoDR3A"]),  # @bvp is an empty unrelated channel
]
# Topic-targeted searches (100 units each) that find founder interviews, fund talks and
# startup stories for the non-AI directions, which the podcast channels under-cover.
# Each entry: direction slug -> queries. Results must still pass the founder + topic tests.
STARTUP_SEARCHES = {
    "robotics": ["robotics startup founder interview", "humanoid robot company founder", "robotics startup pitch demo day", "how to start a robotics company", "Boston Dynamics founder interview"],
    "quantum": ["quantum computing startup founder interview", "quantum startup CEO podcast", "PsiQuantum founder", "QuEra Quantinuum founder interview", "how to start a quantum company"],
    "space": ["space startup founder interview", "rocket company founder podcast", "Rocket Lab Peter Beck interview", "Varda Stoke Impulse space founder", "how to start a space company"],
    "biotech": ["biotech startup founder interview", "synthetic biology company founder podcast", "Genentech Illumina founder story", "how to start a biotech company", "techbio startup founders"],
    "neurotech": ["neurotech startup founder interview", "brain computer interface company founder", "Neuralink Synchron Paradromics founder interview", "how to start a neurotech company"],
    "semiconductors": ["semiconductor startup founder interview", "chip startup founder podcast", "NVIDIA ASML TSMC founder story", "Etched Lightmatter founder interview", "how to start a chip company"],
    "energy": ["fusion startup founder interview", "energy startup founder podcast", "Commonwealth Fusion Helion founder interview", "nuclear startup founder", "how to start an energy company"],
    "nanotech": ["nanotechnology startup founder interview", "materials science startup founder", "nanotech company CEO podcast", "deep tech materials startup"],
    "ai": ["AI lab founder interview", "frontier AI startup founder podcast", "DeepMind OpenAI Anthropic founder interview"],
}
STARTUP_DIRECTION = {"slug": "startup", "label": "Start a Company", "name": "Start a Company", "icon": "flag"}
THEORY_DIRECTION = {"slug": "theory", "label": "The Hard Stuff", "name": "The Hard Stuff", "icon": "sigma"}
# Hand-curated library (data/curated_library.csv): section -> playlist slug.
CURATED_SECTIONS = {"start a company": "startup", "curated collections": "theory"}
FOUNDER_RX = re.compile(
    r"\b(how to start a startup|startup ideas?|competition is for losers|zero to one|peter thiel|how to build the future|"
    r"lecture \d+|startup school|how to (get|find|evaluate|come up with) (startup |good )?ideas|co-?founders?|founders?|"
    r"product.market fit|first (customers|users|hires)|fundrais(e|ing)|seed (round|stage)|series [ab]\b|pitch(ing)?|"
    r"how to raise|hard.?tech|deep.?tech|technical founders?|research to startup|lab to (market|startup)|spin.?outs?|"
    r"commerciali[sz](e|ation)|\bYC\b|y combinator|demo day|unicorn|venture|\bVCs?\b|go.to.market|moats?|"
    r"startups?|start-ups?|entrepreneur|build(ing)? a company|company building|scale.?up|how (we|i|they) built|"
    r"the story of|origin story|inside the (company|startup)|ceo|cto)\b",
    re.IGNORECASE,
)

# Company-channel videos that are marketing rather than explanation.
PROMO_RX = re.compile(
    r"\b(trailer|teaser|announc(e|es|ed|ing|ement)|introducing|unveil(s|ed|ing)?|welcome to|join (us|our)|careers?|"
    r"hiring|recruit|customer stor(y|ies)|testimonial|press release|recap|year in review|commercial|promo|partnership|"
    r"sponsor|celebrat(e|es|ing|ion)|anniversary|awards?|thank you|happy|holiday|sizzle|brand film|we are|our mission|"
    r"meet the team|day in the life|intern|office|culture|hackathon|contest|giveaway|merch|now available|order now|"
    r"pre.?order|coming soon|save the date|register|sign up|countdown|livestream|live stream|replay|highlights|"
    r"ribbon|groundbreaking ceremony|grand opening|ceo message|investor|earnings|shareholder|keynote|pregame|"
    r"fireside|\bceo\b|case study|success story|how \w+ (built|uses|used|scaled)|music video|official video|"
    r"launch(es|ed|ing)?|crew demo|crew-\d|demo-\d|departure|coast phase|\bns-\d+|\bng-\d+|mission \d|"
    r"flight \d|behind the scenes|product tour|showcase|expo|booth|summit)\b",
    re.IGNORECASE,
)

# What a video must mention (title, tags or description) to be filed under a
# direction, so a power-electronics lecture found by a "robotics lecture" search
# does not land in Robotics just because MIT is a robotics provider.
TOPIC_RX = {
    "ai": r"machine learning|deep learning|neural|artificial intelligence|\bAI\b|\bLLMs?\b|language model|transformer|reinforcement|\bGPT|\bML\b|computer vision|\bNLP\b|generative|chatgpt|diffusion|\bAGI\b|backprop|gradient descent",
    "robotics": r"robot|\bROS\b|humanoid|manipulat|autonomous|drone|\bSLAM\b|locomotion|actuator|quadruped|teleop|self.driving",
    "quantum": r"quantum|qubit|qiskit|superposition|entangle",
    "space": r"\bspace(craft|flight|ships?| station| shuttle| telescope| exploration| probe| program| mission| suit| race)|\bNASA\b|orbit|satellite|\bmars\b|\bmoon\b|lunar|astronaut|rocket|planet|telescope|\bESA\b|spacex|propulsion|apollo|rover|\bJPL\b|interplanetary|asteroid|comet|solar system|galaxy|exoplanet|cosmos|cosmic|astronom",
    "biotech": r"\bbio(logy|logical|tech|engineering|informatics|chem|medical|design)|synthetic biology|\bgene(s|tic|tics|ome|omic|omics)?\b|\bgenom|crispr|\bDNA\b|\bRNA\b|protein|\bcells?\b|molecular|enzyme|sequencing|evolution|organism|microb|bacteria|immun|pharma|\bdrugs?\b|stem cell|tissue",
    "neurotech": r"\bneur|\bbrain|\bEEG\b|\bBCI\b|cortex|synap|cognitive|dopamine|mind.?pong|optogenetic|connectome|consciousness",
    "semiconductors": r"semiconductor|\bchips?\b|transistor|\bVLSI\b|lithograph|wafer|\bfabs?\b|\bCMOS\b|\bFPGA\b|RISC-V|silicon|circuit|\bASIC\b|\bEUV\b|\bTSMC\b|\bASML\b|\bGPUs?\b|\bCPUs?\b|microchip|microprocessor|\b6502\b|nanometer|\b\d+ ?nm\b|processor|integrated|logic gate",
    "energy": r"energy|fusion|nuclear|solar (panel|power|cell|energy|farm)|photovoltaic|batter(y|ies)|wind (power|turbine|energy|farm)|turbine|\bgrid\b|reactor|renewable|hydrogen|power (plant|grid|generation|station|electronics)|electricity|fission|geothermal|thorium|uranium|tokamak|plasma|\bEVs?\b|electric vehicle",
    "nanotech": r"nano|cleanroom|\bMEMS\b|graphene|quantum dot|\batomic\b(?! clock)|molecular machine|thin film|microfab|materials science|self.assembl|memristor|carbon nanotube|atomic force|\bAFM\b|microscop",
}
# Stricter test for videos that are not from a startup channel: the title itself must be about founding.
FOUNDER_STRICT_RX = re.compile(
    r"\b(startups?|start-ups?|founders?|co-?founders?|entrepreneur(s|ship)?|y combinator|\bYC\b|venture capital|"
    r"how (we|i|they) built (a|the|our) (company|startup|business)|build(ing)? a (company|startup)|company building|"
    r"zero to one|peter thiel|product.market fit|fundrais(e|ing)|raise (a |your )?(seed|series|round)|pitch deck|"
    r"from (lab|research|phd) to (startup|company|market)|spin.?outs?|commerciali[sz](e|ing|ation))\b",
    re.IGNORECASE,
)
FRONTIER_RX = re.compile(
    "|".join(v for k, v in TOPIC_RX.items() if k not in ("ai", "energy"))
    + r"|energy (storage|grid|company|companies|startups?|costs?|transition|tech|infrastructure|demand|crisis)|clean energy|"
    r"renewable|solar (power|panels?|energy)|batter(y|ies)|nuclear|fusion|geothermal|power (plants?|grid)|data ?center power"
    + r"|machine learning|deep learning|neural|artificial intelligence|\bLLMs?\b|language models?|transformers?|"
    r"reinforcement learning|\bGPT|computer vision|generative|chatgpt|diffusion|\bAGI\b|foundation models?|"
    r"frontier (model|models|lab|labs)|\bAI (lab|labs|research|model|models|infrastructure|chips?|compute|scientists?|"
    r"agents?|agentic|hardware|accelerators?|data ?centers?|native|first|coding|code)|open (models?|source models?|weights)|"
    r"inference|training runs?|\bGPUs?\b|\bTPUs?\b|deep.?tech|hard.?tech|biotech|robotics|humanoids?|space ?tech|"
    r"climate ?tech|fusion|nuclear|quantum|neurotech|semiconductors?|chips?\b|drug discovery|gene (editing|therapy)|"
    r"synthetic biology|autonomous (vehicles?|driving|systems?)|self.driving|defen[cs]e tech|aerospace|satellites?|"
    r"rockets?|launch vehicles?|batteries|energy storage|\b(power|energy|electric) grids?\b|photonics?|lithography|nanotech",
    re.IGNORECASE,
)
# Titles that mark entertainment or shopping rather than learning.
EXCLUDE_TITLE_RX = re.compile(r"\b(kids?|children|cartoon|nursery|song|lullaby|asleep|unboxing|you can buy|top \d+|best \d+|giveaway|prank|reaction)\b", re.IGNORECASE)
# Words that must never stand alone as a provider match.
COMMON = {
    "science", "energy", "space", "international", "research", "quantum", "engineering",
    "technology", "institute", "national", "laboratory", "academy", "foundation", "systems",
    "education", "learning", "university", "college", "school", "center", "centre", "group",
    "global", "digital", "open", "online", "network", "society", "program", "lab", "labs",
    "international space", "semiconductor engineering", "ai engineer", "zero gravity", "deep learning",
}

# Provider names too generic to match inside a description. They still match on
# the channel title and video title.
GENERIC = {
    "google", "microsoft", "apple", "meta", "ibm", "intel", "amazon", "youtube",
    "nvidia", "siemens", "activate", "nsf", "doe", "nih", "ieee", "esa", "grc",
    "semi", "nist", "arc institute", "the construct",
}
SKIP_PROVIDERS = {"youtube", "", "various", "multiple"}


# --------------------------------------------------------------------------- utils
def log(*a):
    print(*a, file=sys.stderr, flush=True)


def load_key(explicit: str | None) -> str:
    if explicit:
        return explicit.strip()
    if os.environ.get("YOUTUBE_API_KEY"):
        return os.environ["YOUTUBE_API_KEY"].strip()
    for env in (SITE / ".env", SITE.parent / ".env"):
        if env.exists():
            for line in env.read_text().splitlines():
                line = line.strip()
                if line.startswith("YOUTUBE_API_KEY") and "=" in line:
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit(
        "No YouTube API key. Pass --key, set YOUTUBE_API_KEY, or create\n"
        f"  {SITE / '.env'}\nwith a line:  YOUTUBE_API_KEY=your-key"
    )


def iso_duration_to_seconds(s: str) -> int:
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", s or "")
    if not m:
        return 0
    d, h, mi, se = (int(x) if x else 0 for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + se


class YouTube:
    def __init__(self, key: str, cache_dir: pathlib.Path, dry: bool = False):
        self.key = key
        self.cache = cache_dir
        self.cache.mkdir(exist_ok=True)
        self.dry = dry
        self.units = 0
        self.calls = 0
        self.cached = 0

    def _cache_path(self, endpoint: str, params: dict) -> pathlib.Path:
        canonical = json.dumps([endpoint, sorted(params.items())], sort_keys=True)
        return self.cache / f"{endpoint}-{hashlib.sha1(canonical.encode()).hexdigest()}.json"

    def search_is_cached(self, q: str) -> bool:
        return self._cache_path("search", {"part": "snippet", "q": q, "type": "channel", "maxResults": 5}).exists()

    def _get(self, endpoint: str, params: dict, cost: int) -> dict:
        path = self._cache_path(endpoint, params)
        if path.exists():
            self.cached += 1
            return json.loads(path.read_text())
        if self.dry:
            self.units += cost
            self.calls += 1
            return {"items": []}
        q = dict(params, key=self.key)
        url = API + endpoint + "?" + urllib.parse.urlencode(q, doseq=True)
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=30) as r:
                    body = json.loads(r.read().decode())
                break
            except urllib.error.HTTPError as e:
                msg = e.read().decode(errors="replace")
                if e.code == 403 and "quota" in msg.lower():
                    raise SystemExit(
                        f"YouTube quota exhausted after {self.calls} calls "
                        f"({self.units} units). Cached results are kept; re-run "
                        "tomorrow to continue."
                    )
                if e.code in (500, 503) and attempt < 2:
                    time.sleep(2 * (attempt + 1))
                    continue
                if e.code == 404:
                    log(f"  (404 from {endpoint}: {params.get('playlistId') or params.get('id') or ''})")
                    body = {"items": [], "error": 404}
                    break
                raise SystemExit(f"YouTube API error {e.code} on {endpoint}: {msg[:400]}")
        self.units += cost
        self.calls += 1
        path.write_text(json.dumps(body))
        return body

    def search(self, q: str, order: str) -> list[dict]:
        body = self._get(
            "search",
            {
                "part": "snippet",
                "q": q,
                "type": "video",
                "order": order,
                "maxResults": 50,
                "relevanceLanguage": "en",
                "videoEmbeddable": "true",
                "safeSearch": "none",
            },
            cost=100,
        )
        return body.get("items", [])

    def channel_by_handle(self, handle: str) -> dict | None:
        """Channel by @handle, or by id when given as 'id:UC...'."""
        params = {"part": "snippet,contentDetails,statistics"}
        if handle.startswith("id:"):
            params["id"] = handle[3:]
        else:
            params["forHandle"] = handle
        body = self._get("channels", params, cost=1)
        items = body.get("items") or []
        return items[0] if items else None

    def channel_search(self, q: str, must: str | None = None) -> dict | None:
        """Fallback when no handle resolves: one search (100 units) for the channel.
        With `must`, only channels whose title or description contains it count."""
        body = self._get("search", {"part": "snippet", "q": q, "type": "channel", "maxResults": 5}, cost=100)
        ids = [it["id"]["channelId"] for it in body.get("items", []) if it.get("id", {}).get("channelId")]
        if not ids:
            return None
        full = self._get("channels", {"part": "snippet,contentDetails,statistics", "id": ",".join(ids)}, cost=1)
        items = full.get("items") or []
        if must:
            m = must.lower()
            items = [c for c in items if m in (c["snippet"].get("title", "") + " " + c["snippet"].get("description", "")).lower()]
        items = [c for c in items if int(c.get("statistics", {}).get("videoCount", 0) or 0) > 0]
        return max(items, key=lambda c: int(c.get("statistics", {}).get("subscriberCount", 0) or 0)) if items else None

    def uploads(self, channel: dict, max_pages: int = 8) -> list[str]:
        """Video ids from the channel's uploads playlist, newest first."""
        pl = channel["contentDetails"]["relatedPlaylists"]["uploads"]
        ids, token = [], None
        for _ in range(max_pages):
            params = {"part": "contentDetails", "playlistId": pl, "maxResults": 50}
            if token:
                params["pageToken"] = token
            body = self._get("playlistItems", params, cost=1)
            ids.extend(it["contentDetails"]["videoId"] for it in body.get("items", []))
            token = body.get("nextPageToken")
            if not token:
                break
        return ids

    def videos(self, ids: list[str]) -> list[dict]:
        out = []
        for i in range(0, len(ids), 50):
            body = self._get(
                "videos",
                {
                    "part": "snippet,statistics,contentDetails",
                    "id": ",".join(ids[i : i + 50]),
                    "maxResults": 50,
                },
                cost=1,
            )
            out.extend(body.get("items", []))
        return out


# ------------------------------------------------------------------ providers
def clean_provider(raw: str) -> list[str]:
    """Split 'Purdue / NYCU' into parts, drop '(YouTube)' etc., return names."""
    s = raw.strip()
    s = re.sub(r"\((?:[^()]*)\)", lambda m: " " if any(
        k in m.group(0).lower() for k in ("youtube", "edx", "coursera", "udacity")
    ) else m.group(0), s)
    parts = re.split(r"\s*(?:/|\||;| and | & )\s*", s) if ("/" in s or "|" in s or ";" in s) else [s]
    out = []
    for p in parts:
        p = p.strip(" ,.")
        if p and p.lower() not in SKIP_PROVIDERS:
            out.append(p)
    return out


def name_variants(name: str) -> list[tuple[str, bool]]:
    """(variant, is_full_name) pairs worth matching, longest first."""
    n = re.sub(r"\s+", " ", name).strip()
    v = {n: True}
    for suffix in (" University", " Institute of Technology", " Inc.", " Inc", " Ltd", " LLC", " Corporation", " Corp"):
        if n.endswith(suffix) and len(n) - len(suffix) >= 5:
            v.setdefault(n[: -len(suffix)], False)
    # "Stanford Online" -> also "Stanford"; "MIT OpenCourseWare" -> also "MIT"
    for stem in ("Stanford", "MIT", "Caltech", "Harvard", "Cornell", "Purdue", "Berkeley", "ETH Zurich", "NASA", "NVIDIA", "IBM Quantum", "DeepMind", "EMBL", "ESA", "IBM"):
        if n.startswith(stem + " "):
            v.setdefault(stem, False)
    out = [(k, full) for k, full in v.items() if k and k.lower() not in COMMON]
    return sorted(out, key=lambda t: len(t[0]), reverse=True)


def compile_matcher(name: str) -> re.Pattern:
    short = len(name) <= 5
    flags = 0 if (short and name.isupper()) else re.IGNORECASE
    pattern = r"(?<![A-Za-z0-9])" + re.escape(name).replace(r"\ ", r"\s+") + r"(?![A-Za-z0-9])"
    return re.compile(pattern, flags)


def build_provider_index(rows: list[dict]):
    """Return {direction: [{name, programs, matchers:[(variant, regex, allow_description)]}]}."""
    per_dir: dict[str, dict[str, dict]] = defaultdict(dict)
    for r in rows:
        d = r["direction"]
        for name in clean_provider(r["provider"]):
            entry = per_dir[d].setdefault(name, {"name": name, "programs": [], "formats": Counter()})
            entry["programs"].append(r["program"])
            entry["formats"][r["program_format"]] += 1
    index = {}
    for d, provs in per_dir.items():
        lst = []
        for name, e in provs.items():
            matchers = []
            for variant, full in name_variants(name):
                if len(variant) < 3:
                    continue
                # Only a provider's full, multi-word, non-generic name may match inside a description.
                allow_desc = full and variant.lower() not in GENERIC and " " in variant and len(variant) >= 8
                matchers.append((variant, compile_matcher(variant), allow_desc, full))
            lst.append({**e, "matchers": matchers})
        index[d] = lst
    return index


def match_providers(video: dict, providers: list[dict]) -> tuple[list[str], bool]:
    """Providers tied to the video, and whether any match was 'strong' (in the
    channel name or title rather than only the description). Full-name matches
    win; a shortened stem such as 'MIT' or 'NASA' credits one provider only (the
    one named exactly that, or the one with most programs), so one lecture is not
    credited to every MIT entry."""
    chan = video["channel"]
    title = video["title"]
    desc = video["description"]
    full_hits, stem_hits = [], {}
    strong = False
    for p in providers:
        for variant, rx, allow_desc, full in p["matchers"]:
            in_chan_or_title = bool(rx.search(chan) or rx.search(title))
            if in_chan_or_title or (allow_desc and rx.search(desc)):
                strong = strong or in_chan_or_title
                if full:
                    full_hits.append(p["name"])
                else:
                    stem_hits.setdefault(variant, []).append(p)
                break
    hits = list(dict.fromkeys(full_hits))
    for variant, plist in stem_hits.items():
        if any(variant.lower() in h.lower() for h in hits):
            continue  # a full name containing this stem already matched
        exact = [p for p in plist if p["name"].lower() == variant.lower()]
        best = exact[0] if exact else max(plist, key=lambda p: len(p["programs"]))
        if best["name"] not in hits:
            hits.append(best["name"])
    return hits, strong


# ------------------------------------------------------------ educational?
# Titles that read as news, hype, shopping or entertainment rather than learning.
JUNK_RX = re.compile(
    r"\b(review|reaction|unboxing|news|mystery|secret|shocking|terrifying|nightmare|steal the show|"
    r"won.t believe|dominate|stocks?|unexplained|strangest|haunting|scary|creepy|exposed|billionaire|"
    r"net worth|rich|richest|steal|destroy|destroys|destroyed|collapse|disaster|crisis|war|threat|"
    r"vs\.?|versus|ranked|tier list|compilation|fails?|funny|meme|gone wrong|caught|live now|"
    r"official (trailer|broadcast)|press conference|keynote highlights|highlights|jaw.dropping|reveals? everything|"
    r"what really happened|releases? \d+|new images|kahani|ki story|full volume|cinematic|leaked|whistleblower|"
    r"escaping|hiding|real reason|truth about|they don.t want|hackers?|exposing|it.s over|game.changer|parody|gangnam|flash ?mob)\b",
    re.IGNORECASE,
)
# Per-direction exclusions. Space: launches, landings, live feeds and footage reels are not lessons.
DIR_EXCLUDE_RX = {
    "space": re.compile(r"\b(launch(es|ed|ing)?|lift.?off|landing|lands? on|live|live stream|livestream|live feed|official stream|watch now|watch nasa|views from|descent|touchdown|replay|broadcast|countdown|webcast|docking|splashdown|footage|timelapse|time-lapse|4k|8k|hdvr|full flight|flight test|static fire|rollout|panorama)\b", re.IGNORECASE),
    "energy": re.compile(r"\b(solar roof|tesla (model|cybertruck|truck)|range test|charging test|ev review)\b", re.IGNORECASE),
    "robotics": re.compile(r"\b(most advanced|robot pets?|you can buy|amazing robots|coolest|domino|soldiers|band|ace of spades)\b", re.IGNORECASE),
    "neurotech": re.compile(r"\b(virus|explicit|crack)\b", re.IGNORECASE),
    "nanotech": re.compile(r"datomic|clojure|datalog|kafka|c\+\+ memory", re.IGNORECASE),
}
# Signals that a video teaches something.
EDU_RX = re.compile(
    r"\b(lecture|lectures|course|tutorial|explain(ed|s|ing)?|introduction|intro|how .{0,40}(work|works|made|built)|seminar|"
    r"talk|keynote|class|lesson|workshop|chapter|part \d+|episode \d+|fundamentals|basics|guide|walkthrough|"
    r"deep dive|crash course|101|primer|overview|what is|what are|why |understanding|principles|theory|masterclass|"
    r"colloquium|symposium|conference|demo|demonstration|build(ing)?|from scratch|teardown|inside (a|the)|tour|"
    r"documentary|history of|the science of|physics of|math of|mathematics|algorithm|architecture|design|"
    r"engineering|science|research|paper|thesis|lab|laboratory|university|institute|professor|prof\.|dr\.|phd|"
    r"project|how (i|to|we|do|does|did|it|they)|diy|homebrew|restor(e|ing)|reverse.engineer(ing)?|interview|training|"
    r"experiments?|learn(s|ing)?|explor(e|es|ing)|simulat(e|ion)|progress update|anatomy|making of|behind the|lessons|"
    r"story of|evolution of|rise of|future of|works?|explainer|animation|visuali[sz])\b",
    re.IGNORECASE,
)
# Channels known for teaching, talks or documentary science: their videos count as educational.
EDU_CHANNEL_RX = re.compile(
    r"tech ?talks|conference|\bconf\b|universit|institute|\blabs?\b|academy|\bMIT\b|stanford|harvard|berkeley|caltech|"
    r"\bTEDx?\b|education|science|lecture|course|opencourseware|research|museum|summit|symposium|usenix|def ?con|cppcon|"
    r"\bgoto\b|strange loop|pycon|google|microsoft|nvidia|\bibm\b|intel|\bnasa\b|\bjpl\b|\besa\b|neuralink|openai|deepmind|"
    r"anthropic|asianometry|3blue1brown|veritasium|smartereveryday|branch education|curiousmarc|applied science|"
    r"practical engineering|real engineering|computerphile|numberphile|sixty symbols|periodic videos|kurzgesagt|"
    r"minutephysics|\bpbs\b|crash ?course|khan academy|sabine|lex fridman|dwarkesh|acquired|jeri ellsworth|ben eater|"
    r"tom scott|thought emporium|scott manley|everyday astronaut|primal space|jared owen|quanta|wired|seeker|"
    r"\bllm\b|\bai\b|robotics|quantum|space|bio|neuro|semiconductor|energy|nano|physics|engineer|explain|"
    r"karpathy|hinton|sapolsky|feynman|hossenfelder|fridman|nvidia|tnmoc|computer history|hackaday|mit\b",
    re.IGNORECASE,
)
# Outlets whose videos are news or entertainment segments, not teaching.
NEWS_CHANNELS = {
    "cnbc", "cnbc international", "the wall street journal", "wall street journal", "60 minutes", "bloomberg",
    "bloomberg originals", "bloomberg television", "fox news", "cnn", "bbc news", "abc news", "nbc news", "cbs news",
    "sky news", "science channel", "the space race", "astrum extra", "spaceflight tv", "dark facts tamil",
    "the diary of a ceo", "marques brownlee", "jerryrigeverything", "terkrecoms - tech tv", "technologyx ai",
    "dpccars", "the forge empire", "getsetflyscience by gaurav thakur", "osm dhruva", "business insider",
    "insider", "insider business", "insider tech", "cnbc television", "bloomberg tech", "global news", "wsj podcasts", "wsj", "bloomberg podcasts", "yahoo finance", "fox business", "vice", "vice news", "forbes", "the economist", "reuters", "associated press",
    "ndtv", "wion", "times now", "india today", "firstpost", "cnet", "the verge", "techcrunch", "tech might",
    "smarter while you sleep", "the b1m", "behind asia", "tech vision", "pro robots", "future unity", "ai revolution",
}


def educational(rec: dict, slug: str, strong_provider: bool, curated: bool = False) -> str | None:
    """Return None if the video belongs in the playlist, else the reason it does not."""
    title = rec["title"]
    if rec["channel"].strip().lower() in NEWS_CHANNELS:
        return "news/entertainment channel"
    if JUNK_RX.search(title):
        return "junk title"
    rx = DIR_EXCLUDE_RX.get(slug)
    if rx and rx.search(title):
        return f"{slug} exclusion"
    if strong_provider:
        return None
    blob = title + " " + " ".join(rec.get("tags") or [])
    if EDU_RX.search(blob) or EDU_CHANNEL_RX.search(rec["channel"]):
        return None
    return "no teaching signal"


def youtube_native_programs(rows: list[dict]) -> dict[str, list[str]]:
    """Programs in the CSV that are themselves YouTube channels/series."""
    out = defaultdict(list)
    seen = set()
    for r in rows:
        blob = (r["provider"] + " " + r["url"]).lower()
        if "youtube" in blob:
            q = r["program"]
            # "Scott Manley" | "Everyday Astronaut" style channels: search the name itself.
            key = (r["direction"], q.lower())
            if key not in seen:
                seen.add(key)
                out[r["direction"]].append(q)
    return out


# ----------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", type=pathlib.Path, default=DEFAULT_CSV)
    ap.add_argument("--key", help="YouTube Data API v3 key")
    ap.add_argument("--providers-per-direction", type=int, default=3, help="top providers (by program count) to search by name")
    ap.add_argument("--topics-per-direction", type=int, default=4)
    ap.add_argument("--native-per-direction", type=int, default=2, help="YouTube-native programs from the CSV to search by name")
    ap.add_argument("--min-seconds", type=int, default=120, help="drop videos shorter than this (filters Shorts)")
    ap.add_argument("--dry-run", action="store_true", help="only report planned searches and quota")
    ap.add_argument("--directions", nargs="*", help="limit to these direction slugs")
    ap.add_argument("--hn-per-direction", type=int, default=50, help="max Hacker News picks per playlist (from data/hn_candidates.json)")
    ap.add_argument("--hn-min-mentions", type=int, default=2, help="HN items that must link a video before it counts as repeatedly recommended")
    ap.add_argument("--hn-min-views", type=int, default=5000, help="drop HN picks with fewer YouTube views than this")
    ap.add_argument("--leaders-per-direction", type=int, default=30, help="max builder explainer videos per playlist")
    ap.add_argument("--curated", type=pathlib.Path, default=DATA / "curated_library.csv", help="hand-curated CSV (section, frontier_category, youtube_url/id, ...)")
    ap.add_argument("--startup-max", type=int, default=100, help="max videos in the Start a Company tab")
    ap.add_argument("--startup-pages", type=int, default=8, help="uploads pages (50 each) to scan per startup channel")
    ap.add_argument("--startup-per-channel", type=int, default=20, help="max videos from any one startup channel")
    ap.add_argument("--startup-searches", type=int, default=0, help="topic-targeted founder searches to run (100 units each; cached ones are free)")
    ap.add_argument("--startup-ai-share", type=float, default=0.3, help="max share of the tab that is AI-only (no other topic in the title)")
    ap.add_argument("--startup-topic-min", type=int, default=8, help="reserve this many slots per non-AI topic when candidates exist")
    ap.add_argument("--max-channel-searches", type=int, default=0, help="channel searches (100 units each) allowed per run for builders without a known handle")
    ap.add_argument("--leader-pages", type=int, default=8, help="uploads pages (50 videos each) to scan per leader channel")
    args = ap.parse_args()

    if not args.csv.exists():
        sys.exit(f"CSV not found: {args.csv}")
    rows = list(csv.DictReader(args.csv.open(encoding="utf-8")))
    rows = [r for r in rows if r["direction"] in DIRECTIONS]
    provider_index = build_provider_index(rows)
    native = youtube_native_programs(rows)

    # Plan searches.
    plan: list[tuple[str, str, str]] = []  # (direction, query, order)
    for d, cfg in DIRECTIONS.items():
        if args.directions and cfg["slug"] not in args.directions:
            continue
        for t in cfg["topics"][: args.topics_per_direction]:
            plan.append((d, t, "viewCount"))
        top = sorted(provider_index[d], key=lambda p: -len(p["programs"]))
        used = 0
        for p in top:
            if p["name"].lower() in GENERIC or len(p["name"]) < 4:
                continue
            plan.append((d, f"{p['name']} {cfg['keyword']}", "relevance"))
            used += 1
            if used >= args.providers_per_direction:
                break
        for q in native.get(d, [])[: args.native_per_direction]:
            plan.append((d, q, "relevance"))
        for q in cfg.get("extra", []):
            plan.append((d, q, "relevance"))

    est = len(plan) * 100
    log(f"{len(plan)} searches planned (~{est} quota units + ~{len(plan)} for video details).")
    if args.dry_run:
        for d, q, o in plan:
            log(f"  [{DIRECTIONS[d]['slug']:14}] {o:10} {q}")
        return

    key = load_key(args.key)
    yt = YouTube(key, CACHE)

    # Run searches, collect candidate ids per direction with the query that found them.
    found: dict[str, dict[str, set]] = defaultdict(lambda: defaultdict(set))  # id -> direction -> queries
    for i, (d, q, order) in enumerate(plan, 1):
        items = yt.search(q, order)
        for it in items:
            vid = it.get("id", {}).get("videoId")
            if vid:
                found[vid][d].add(q)
        log(f"[{i}/{len(plan)}] {DIRECTIONS[d]['slug']:14} {order:10} {q!r}: {len(items)} results")

    ids = list(found)
    log(f"{len(ids)} candidate videos; fetching details...")
    details = yt.videos(ids)

    videos = []
    dropped = Counter()

    def base_record(v: dict):
        """Common checks and record shape for any YouTube video item, or (None, reason)."""
        sn = v["snippet"]
        st = v.get("statistics", {})
        cd = v.get("contentDetails", {})
        secs = iso_duration_to_seconds(cd.get("duration", ""))
        if secs < args.min_seconds:
            return None, "too short"
        title = sn.get("title", "")
        letters = [c for c in title if c.isalpha()]
        if letters and sum(1 for c in letters if ord(c) > 0x24F) / len(letters) > 0.3:
            return None, "non-latin title"
        if EXCLUDE_TITLE_RX.search(title):
            return None, "entertainment/shopping title"
        rec = {
            "id": v["id"],
            "title": title,
            "channel": sn.get("channelTitle", ""),
            "channelId": sn.get("channelId", ""),
            "published": sn.get("publishedAt", "")[:10],
            "views": int(st.get("viewCount", 0) or 0),
            "likes": int(st.get("likeCount", 0) or 0),
            "duration": secs,
            "description": re.sub(r"\s+", " ", sn.get("description", ""))[:300],
            "tags": (sn.get("tags") or [])[:12],
            "directions": [],
            "providers": [],
            "sources": [],
            "queries": [],
        }
        full_desc = sn.get("description", "")
        topical_blob = title + " " + " ".join(sn.get("tags") or []) + " " + full_desc[:1000]
        return rec, (full_desc, topical_blob)

    for v in details:
        rec, extra = base_record(v)
        if rec is None:
            dropped[extra] += 1
            continue
        full_desc, topical_blob = extra
        probe = {"channel": rec["channel"], "title": rec["title"], "description": full_desc}
        # A video can belong to several directions if it was found for them and
        # matches a provider in each.
        for d in found[v["id"]]:
            slug = DIRECTIONS[d]["slug"]
            if not re.search(TOPIC_RX[slug], topical_blob, re.IGNORECASE):
                dropped["off-topic for direction"] += 1
                continue
            hits, strong = match_providers(probe, provider_index[d])
            if not hits:
                continue
            why = educational(rec, slug, strong)
            if why:
                dropped[why] += 1
                continue
            rec["directions"].append(slug)
            rec["providers"].extend(h for h in hits if h not in rec["providers"])
            rec["queries"].extend(sorted(found[v["id"]][d]))
        if not rec["directions"]:
            dropped["no provider match"] += 1
            continue
        rec["sources"].append("providers")
        videos.append(rec)
    log(f"provider pass kept {len(videos)} videos; dropped {dict(dropped)}")

    # ---- Hacker News picks: videos repeatedly linked on HN for each topic.
    hn_path = DATA / "hn_candidates.json"
    if args.hn_per_direction and hn_path.exists():
        hn = json.loads(hn_path.read_text())
        by_id = {v["id"]: v for v in videos}
        want = {}
        for slug, cands in hn.items():
            for c in cands:
                if c["mentions"] >= args.hn_min_mentions:
                    want.setdefault(c["id"], c)
        missing = [i for i in want if i not in by_id]
        log(f"HN: {len(want)} candidate videos with {args.hn_min_mentions}+ mentions, {len(missing)} not yet in catalogue; fetching details...")
        hn_details = {v["id"]: v for v in yt.videos(missing)}
        hn_dropped = Counter()
        hn_added = Counter()
        for slug, cands in hn.items():
            kept = 0
            for c in cands:
                if kept >= args.hn_per_direction:
                    break
                if c["mentions"] < args.hn_min_mentions:
                    continue
                rec = by_id.get(c["id"])
                if rec is None:
                    item = hn_details.get(c["id"])
                    if item is None:
                        hn_dropped["unavailable"] += 1
                        continue
                    rec, extra = base_record(item)
                    if rec is None:
                        hn_dropped[extra] += 1
                        continue
                topical_blob = rec["title"] + " " + " ".join(rec["tags"])
                if not re.search(TOPIC_RX[slug], topical_blob, re.IGNORECASE):
                    hn_dropped["off-topic"] += 1
                    continue
                why = educational(rec, slug, False, curated=True)
                if why:
                    hn_dropped[why] += 1
                    continue
                if rec["views"] < args.hn_min_views:
                    hn_dropped["too few views"] += 1
                    continue
                if rec["id"] not in by_id:
                    by_id[rec["id"]] = rec
                    videos.append(rec)
                if slug not in rec["directions"]:
                    rec["directions"].append(slug)
                if "hn" not in rec["sources"]:
                    rec["sources"].append("hn")
                rec["hn"] = {k: c[k] for k in ("mentions", "stories", "comments", "points", "years", "first", "last", "title", "url")}
                kept += 1
                hn_added[slug] += 1
        log(f"HN picks added per playlist: {dict(hn_added)}; dropped {dict(hn_dropped)}")

    # ---- Industry leaders: explainer videos from the leading companies' own channels.
    if args.leaders_per_direction:
        by_id = {v["id"]: v for v in videos}
        leader_added = Counter()
        leader_dropped = Counter()
        leaders_resolved = {}
        searches_left = args.max_channel_searches
        for slug, companies in LEADERS.items():
            picks = []
            for company, handles in companies:
                if handles is None:
                    log(f"  leader {company}: no channel of its own (skipped)")
                    continue
                channel = None
                for h in handles:
                    channel = yt.channel_by_handle(h)
                    if channel:
                        break
                if not channel:
                    keyword = next(c["keyword"] for c in DIRECTIONS.values() if c["slug"] == slug)
                    q = f"{company} {keyword}"
                    if yt.search_is_cached(q) or searches_left > 0:
                        if not yt.search_is_cached(q):
                            searches_left -= 1
                        channel = yt.channel_search(q, must=company.split(" ")[0].strip("&"))
                if not channel:
                    log(f"  leader {company}: no channel found for handles {handles}" + ("" if searches_left else " (search budget used; re-run tomorrow)"))
                    leaders_resolved[company] = None
                    continue
                ctitle = channel["snippet"]["title"]
                leaders_resolved[company] = ctitle
                ids = yt.uploads(channel, args.leader_pages)
                known = [i for i in ids if i in by_id]
                items = yt.videos([i for i in ids if i not in by_id])
                cands = []
                for item in items:
                    rec, extra = base_record(item)
                    if rec is None:
                        leader_dropped[extra] += 1
                        continue
                    cands.append(rec)
                cands.extend(by_id[i] for i in known)
                kept = []
                for rec in cands:
                    blob = rec["title"] + " " + " ".join(rec["tags"])
                    if PROMO_RX.search(rec["title"]):
                        leader_dropped["promo title"] += 1
                        continue
                    if JUNK_RX.search(rec["title"]) or (DIR_EXCLUDE_RX.get(slug) and DIR_EXCLUDE_RX[slug].search(rec["title"])):
                        leader_dropped["junk/excluded title"] += 1
                        continue
                    if not (EDU_RX.search(blob) or EDU_LEADER_RX.search(blob) or EDU_DESC_RX.search(rec["description"][:300])):
                        leader_dropped["no teaching signal"] += 1
                        continue
                    if rec["views"] < 500:
                        leader_dropped["too few views"] += 1
                        continue
                    kept.append((rec, company))
                kept.sort(key=lambda t: -t[0]["views"])
                picks.extend(kept)
                log(f"  leader {company} ({ctitle}): {len(ids)} uploads scanned, {len(kept)} explainers")
            # Interleave companies so one prolific channel does not crowd out the others.
            per_company = defaultdict(list)
            for rec, company in picks:
                per_company[company].append(rec)
            order = [c for c, _ in companies if c in per_company]
            chosen = []
            while len(chosen) < args.leaders_per_direction and any(per_company[c] for c in order):
                for c in order:
                    if per_company[c] and len(chosen) < args.leaders_per_direction:
                        chosen.append((per_company[c].pop(0), c))
            for rec, company in chosen:
                if rec["id"] not in by_id:
                    by_id[rec["id"]] = rec
                    videos.append(rec)
                if slug not in rec["directions"]:
                    rec["directions"].append(slug)
                if "leaders" not in rec["sources"]:
                    rec["sources"].append("leaders")
                rec["leader"] = company
                if company not in rec["providers"]:
                    rec["providers"].append(company)
                leader_added[slug] += 1
        log(f"leader picks per playlist: {dict(leader_added)}; dropped {dict(leader_dropped)}")

    # ---- Curated library: hand-picked rows with a section, field, subject and note.
    curated_startup_ids = set()
    if args.curated and args.curated.exists():
        by_id = {v["id"]: v for v in videos}
        name_to_slug = {d.lower(): c["slug"] for d, c in DIRECTIONS.items()}
        rows_c = list(csv.DictReader(args.curated.open(encoding="utf-8-sig")))
        wanted = []
        for r in rows_c:
            section = (r.get("section") or r.get("primary_placement") or "").strip().lower()
            slug = CURATED_SECTIONS.get(section)
            vid = (r.get("youtube_id") or "").strip()
            if not vid:
                m = re.search(r"(?:v=|youtu\.be/|shorts/|live/|embed/)([A-Za-z0-9_-]{11})", r.get("youtube_url") or "")
                vid = m.group(1) if m else ""
            if not slug or not re.fullmatch(r"[A-Za-z0-9_-]{11}", vid):
                log(f"  curated row skipped: section={section!r} id={vid!r} title={r.get('video_title')!r}")
                continue
            fields = [name_to_slug.get((r.get("frontier_category") or "").strip().lower())]
            fields += [name_to_slug.get(x.strip().lower()) for x in (r.get("secondary_categories") or "").split(";") if x.strip()]
            wanted.append((vid, slug, [f for f in fields if f], r))
        details = {v["id"]: v for v in yt.videos(list({vid for vid, _, _, _ in wanted if vid not in by_id}))}
        added, missing = Counter(), []
        for vid, slug, fields, r in wanted:
            rec = by_id.get(vid)
            if rec is None:
                item = details.get(vid)
                if item is None:
                    missing.append(f"{vid} {r.get('video_title')!r}")
                    continue
                sn, st, cd = item["snippet"], item.get("statistics", {}), item.get("contentDetails", {})
                rec = {"id": item["id"], "title": sn.get("title", ""), "channel": sn.get("channelTitle", ""), "channelId": sn.get("channelId", ""),
                       "published": sn.get("publishedAt", "")[:10], "views": int(st.get("viewCount", 0) or 0), "likes": int(st.get("likeCount", 0) or 0),
                       "duration": iso_duration_to_seconds(cd.get("duration", "")), "description": re.sub(r"\s+", " ", sn.get("description", ""))[:300],
                       "tags": (sn.get("tags") or [])[:12], "directions": [], "providers": [], "sources": [], "queries": []}
                by_id[vid] = rec
                videos.append(rec)
            for d in [slug] + fields[:1]:  # the playlist itself plus the primary field
                if d not in rec["directions"]:
                    rec["directions"].append(d)
            rec["fields"] = sorted(set(rec.get("fields", [])) | set(fields))
            if "curated" not in rec["sources"]:
                rec["sources"].append("curated")
            rec["curated"] = {
                "collection": (r.get("collection") or "").strip(),
                "category": (r.get("frontier_category") or "").strip(),
                "subject": (r.get("subject") or "").strip(),
                "topics": (r.get("startup_building_topics") or "").strip(),
                "note": (r.get("selection_note") or "").strip(),
                "alignment": (r.get("category_alignment") or "").strip(),
                "order": int(r["order_in_category"]) if (r.get("order_in_category") or "").isdigit() else None,
                "priority": int(r["priority_within_subject"]) if (r.get("priority_within_subject") or "").isdigit() else None,
            }
            if slug == "startup":
                curated_startup_ids.add(vid)
                rec["startup"] = {"channel": rec["channel"], "reasons": ["hand-picked: " + (r.get("subject") or "founder story")]}
            added[slug] += 1
        log(f"curated library: added {dict(added)}; {len(missing)} unavailable" + (": " + "; ".join(missing[:8]) if missing else ""))

    # ---- Start a Company: founder content that touches the frontier topics.
    if args.startup_max:
        by_id = {v["id"]: v for v in videos}
        builder_names = sorted({c for comps in LEADERS.values() for c, _ in comps}, key=len, reverse=True)  # includes channel-less companies, so mentions still count
        builder_rx = re.compile(r"(?<![A-Za-z0-9])(" + "|".join(re.escape(n) for n in builder_names) + r")(?![A-Za-z0-9])", re.IGNORECASE)

        def startup_score(rec: dict, from_startup_channel: bool):
            # Titles only: channel tags are noisy (most uploads on these channels are tagged "AI").
            blob = rec["title"]
            if re.search(r"chocolate|candy|snack|beverage|fashion|sports?\b|huberman|focus, energy", blob, re.IGNORECASE):
                return None
            if rec["views"] < 2000:
                return None
            frontier = bool(FRONTIER_RX.search(blob))
            founder = bool(FOUNDER_RX.search(blob + " " + " ".join(rec["tags"])))
            builder = bool(builder_rx.search(blob))
            # The tab is the intersection only: a video must name one of the nine topics
            # (or a builder company). Generic company-building content is left out.
            if not (frontier or builder):
                return None
            if not from_startup_channel:
                if not FOUNDER_STRICT_RX.search(rec["title"]) or rec["views"] < 5000 or rec["channel"].strip().lower() in NEWS_CHANNELS:
                    return None
            reasons = [r for r, ok in (("frontier topic", frontier), ("founder content", founder), ("builder company", builder)) if ok]
            return math.log10(rec["views"] + 10) + 2 * frontier + founder + builder, reasons

        cands = []  # (score, rec, channel_label, reasons)
        searches_left = getattr(args, "max_channel_searches", 0) if "searches_left" not in dir() else searches_left
        for label, handles in STARTUP_CHANNELS:
            if handles is None:
                continue
            channel = None
            for h in handles:
                channel = yt.channel_by_handle(h)
                if channel:
                    break
            if not channel:
                q = f"{label} startup"
                if yt.search_is_cached(q) or searches_left > 0:
                    if not yt.search_is_cached(q):
                        searches_left -= 1
                    channel = yt.channel_search(q, must=label.split(" ")[0])
            if not channel:
                log(f"  startup channel {label}: no channel found for {handles}" + ("" if searches_left else " (search budget used; re-run tomorrow)"))
                continue
            ids = yt.uploads(channel, args.startup_pages)
            items = yt.videos([i for i in ids if i not in by_id])
            kept = 0
            for item in items:
                rec, extra = base_record(item)
                if rec is None:
                    continue
                if JUNK_RX.search(rec["title"]) or PROMO_RX.search(rec["title"]) and not FOUNDER_RX.search(rec["title"]):
                    continue
                sc = startup_score(rec, True)
                if sc:
                    cands.append((sc[0], rec, label, sc[1]))
                    kept += 1
            for i in ids:
                if i in by_id:
                    sc = startup_score(by_id[i], True)
                    if sc:
                        cands.append((sc[0], by_id[i], label, sc[1]))
                        kept += 1
            log(f"  startup channel {label} ({channel['snippet']['title']}): {len(ids)} uploads scanned, {kept} candidates")
        # Videos already in the catalogue (any source) whose titles are about founding.
        for rec in videos:
            if any(c[1] is rec for c in cands):
                continue
            sc = startup_score(rec, False)
            if sc:
                cands.append((sc[0], rec, rec["channel"], sc[1]))
        # Topic-targeted searches for founder interviews and startup stories, mainly non-AI.
        searches_done = 0
        startup_channel_labels = {label.lower() for label, _ in STARTUP_CHANNELS}
        for slug, queries in STARTUP_SEARCHES.items():
            for q in queries:
                cached = yt._cache_path("search", {"part": "snippet", "q": q, "type": "video", "order": "relevance", "maxResults": 50, "relevanceLanguage": "en", "videoEmbeddable": "true", "safeSearch": "none"}).exists()
                if not cached and searches_done >= args.startup_searches:
                    continue
                if not cached:
                    searches_done += 1
                items = yt.search(q, "relevance")
                ids = [it["id"]["videoId"] for it in items if it.get("id", {}).get("videoId")]
                details = {v["id"]: v for v in yt.videos([i for i in ids if i not in by_id])}
                found_here = 0
                for i in ids:
                    rec = by_id.get(i)
                    if rec is None:
                        item = details.get(i)
                        if item is None:
                            continue
                        rec, _ = base_record(item)
                        if rec is None:
                            continue
                    if any(c[1] is rec for c in cands):
                        continue
                    if rec["channel"].strip().lower() in NEWS_CHANNELS or JUNK_RX.search(rec["title"]):
                        continue
                    if not re.search(TOPIC_RX[slug], rec["title"], re.IGNORECASE) and not builder_rx.search(rec["title"]):
                        continue
                    from_startup_channel = rec["channel"].strip().lower() in startup_channel_labels
                    if not from_startup_channel and not FOUNDER_STRICT_RX.search(rec["title"]):
                        continue
                    if rec["views"] < 5000:
                        continue
                    sc = startup_score(rec, True)
                    if sc:
                        cands.append((sc[0], rec, rec["channel"], sc[1] + ["search: " + slug]))
                        found_here += 1
                log(f"  startup search [{slug}] {q!r}: {found_here} candidates")
        if searches_done < sum(len(q) for q in STARTUP_SEARCHES.values()):
            pending = sum(len(q) for q in STARTUP_SEARCHES.values()) - searches_done
            log(f"  startup searches: {searches_done} run this time (budget {args.startup_searches}); some may be cached")

        # Balance across topics: AI-only videos may take at most --startup-ai-share of the
        # tab, and each other topic gets up to --startup-topic-min reserved slots first.
        def topics_of(rec):
            t = [sl for sl in TOPIC_RX if re.search(TOPIC_RX[sl], rec["title"], re.IGNORECASE)]
            for comps_slug, comps in LEADERS.items():
                if any(re.search(r"(?<![A-Za-z0-9])" + re.escape(c) + r"(?![A-Za-z0-9])", rec["title"], re.IGNORECASE) for c, _ in comps):
                    t.append(comps_slug)
            return list(dict.fromkeys(t))

        cands = [c for c in cands if c[1]["id"] not in curated_startup_ids]
        cands.sort(key=lambda c: -c[0])
        per_channel = Counter()
        chosen = []
        chosen_ids = set(curated_startup_ids)
        auto_max = max(0, args.startup_max - len(curated_startup_ids))
        ai_cap = int(auto_max * args.startup_ai_share)
        ai_only = 0

        def take(c):
            nonlocal ai_only
            score, rec, label, reasons = c
            if rec["id"] in chosen_ids or len(chosen) >= auto_max or per_channel[label] >= args.startup_per_channel:
                return False
            tp = topics_of(rec)
            is_ai_only = tp == ["ai"]
            if is_ai_only and ai_only >= ai_cap:
                return False
            if is_ai_only:
                ai_only += 1
            per_channel[label] += 1
            chosen.append((rec, label, reasons))
            chosen_ids.add(rec["id"])
            return True

        # Pass 1: reserved slots per non-AI topic, best candidates first.
        for sl in TOPIC_RX:
            if sl == "ai":
                continue
            n = 0
            for c in cands:
                if n >= args.startup_topic_min:
                    break
                if sl in topics_of(c[1]) and take(c):
                    n += 1
        # Pass 2: fill the rest by score.
        for c in cands:
            if len(chosen) >= auto_max:
                break
            take(c)
        topic_counts = Counter(sl for rec, _, _ in chosen for sl in (topics_of(rec) or ["other"]))
        log(f"  startup topic mix: {dict(topic_counts)} (AI-only {ai_only}, cap {ai_cap})")
        for rec, label, reasons in chosen:
            if rec["id"] not in by_id:
                by_id[rec["id"]] = rec
                videos.append(rec)
            if "startup" not in rec["directions"]:
                rec["directions"].append("startup")
            if "startup" not in rec["sources"]:
                rec["sources"].append("startup")
            rec["startup"] = {"channel": label, "reasons": reasons}
            if label not in rec["providers"]:
                rec["providers"].append(label)
        log(f"Start a Company: {len(curated_startup_ids)} hand-picked + {len(chosen)} auto (cap {args.startup_max}) from {len(cands)} candidates; per channel {dict(per_channel)}")

    # ---- Manual adds: links you choose yourself, filed where you say (about 1 unit per 50 videos).
    manual_path = DATA / "manual_adds.txt"
    if manual_path.exists():
        by_id = {v["id"]: v for v in videos}
        valid_slugs = {c["slug"] for c in DIRECTIONS.values()} | {"startup", "theory"}
        wanted = []  # (video_id, slug, label)
        for line in manual_path.read_text().splitlines():
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            parts = line.split()
            m = re.search(r"(?:v=|youtu\.be/|shorts/|live/|embed/)([A-Za-z0-9_-]{11})", parts[0]) or re.fullmatch(r"([A-Za-z0-9_-]{11})", parts[0])
            if not m:
                log(f"  manual add skipped (no video id): {line}")
                continue
            slug = parts[1] if len(parts) > 1 and parts[1] in valid_slugs else None
            if slug is None:
                log(f"  manual add skipped (second word must be a playlist slug {sorted(valid_slugs)}): {line}")
                continue
            wanted.append((m.group(1), slug, " ".join(parts[2:]).strip()))
        details = {v["id"]: v for v in yt.videos([i for i, _, _ in wanted if i not in by_id])}
        added = 0
        for vid, slug, label in wanted:
            rec = by_id.get(vid)
            if rec is None:
                item = details.get(vid)
                if item is None:
                    log(f"  manual add unavailable: {vid}")
                    continue
                rec, _ = base_record(item)
                if rec is None:
                    rec = None
                if rec is None:
                    # Manual picks are trusted: rebuild the record without the automatic drops.
                    sn, st, cd = item["snippet"], item.get("statistics", {}), item.get("contentDetails", {})
                    rec = {"id": item["id"], "title": sn.get("title", ""), "channel": sn.get("channelTitle", ""), "channelId": sn.get("channelId", ""),
                           "published": sn.get("publishedAt", "")[:10], "views": int(st.get("viewCount", 0) or 0), "likes": int(st.get("likeCount", 0) or 0),
                           "duration": iso_duration_to_seconds(cd.get("duration", "")), "description": re.sub(r"\s+", " ", sn.get("description", ""))[:300],
                           "tags": (sn.get("tags") or [])[:12], "directions": [], "providers": [], "sources": [], "queries": []}
                by_id[vid] = rec
                videos.append(rec)
            if slug not in rec["directions"]:
                rec["directions"].append(slug)
            if "manual" not in rec["sources"]:
                rec["sources"].append("manual")
            if slug == "startup":
                rec.setdefault("startup", {"channel": label or rec["channel"], "reasons": ["hand-picked"]})
            if label and label not in rec["providers"]:
                rec["providers"].append(label)
            added += 1
        log(f"manual adds: {added} videos from {manual_path.name}")

    videos.sort(key=lambda r: -r["views"])
    log(f"kept {len(videos)} videos in total")
    log(f"API: {yt.calls} live calls ({yt.units} units), {yt.cached} from cache")

    # Per-direction provider summary for the About page.
    prov_summary = {}
    for d, cfg in DIRECTIONS.items():
        vids_here = [v for v in videos if cfg["slug"] in v["directions"]]
        pc = Counter(p for v in vids_here for p in v["providers"])
        plist = []
        for p in sorted(provider_index[d], key=lambda p: (-len(p["programs"]), p["name"])):
            plist.append({
                "name": p["name"],
                "programs": len(p["programs"]),
                "videos": pc.get(p["name"], 0),
                "formats": [f for f, _ in p["formats"].most_common(3)],
            })
        prov_summary[cfg["slug"]] = {
            "name": d,
            "label": cfg["label"],
            "icon": cfg["icon"],
            "programs": sum(1 for r in rows if r["direction"] == d),
            "providers": plist,
            "videos": len(vids_here),
        }

    DATA.mkdir(exist_ok=True)
    out = {
        "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": args.csv.name,
        "directions": [
            {"slug": c["slug"], "label": c["label"], "name": d, "icon": c["icon"],
             "count": sum(1 for v in videos if c["slug"] in v["directions"])}
            for d, c in DIRECTIONS.items()
        ] + [dict(STARTUP_DIRECTION, count=sum(1 for v in videos if "startup" in v["directions"])),
             dict(THEORY_DIRECTION, count=sum(1 for v in videos if "theory" in v["directions"]))],
        "videos": videos,
        "builders": {slug: list(dict.fromkeys(c for c, _ in companies)) for slug, companies in LEADERS.items()},
    }
    (DATA / "videos.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    for v in out["videos"]:
        v.pop("queries", None)  # debugging detail, not needed by the site
    (DATA / "videos.js").write_text("window.FA_DATA = " + json.dumps(out, ensure_ascii=False) + ";\n")
    (DATA / "providers.json").write_text(json.dumps(prov_summary, ensure_ascii=False, indent=1))
    (DATA / "providers.js").write_text("window.FA_PROVIDERS = " + json.dumps(prov_summary, ensure_ascii=False) + ";\n")
    log(f"wrote {DATA / 'videos.json'} and providers.json")
    try:  # crawlable pages, sitemap, robots and llms.txt follow the catalogue
        import build_pages
        build_pages.main()
    except Exception as e:  # noqa: BLE001
        log(f"build_pages skipped: {e}")
    for d in out["directions"]:
        log(f"  {d['label']:15} {d['count']:4} videos")


if __name__ == "__main__":
    main()
