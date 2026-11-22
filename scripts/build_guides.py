#!/usr/bin/env python3
"""Question-led, crawlable pages: the answers a learner is looking for before they
pick how to get into a field, written as plain HTML so search engines and AI
assistants can read and cite them.

  learn/<field>/index.html     "How to learn <field>": answer first, then the best
                               videos, courses and programs, and an FAQ (FAQPage schema)
  courses/<field>/index.html   top courses per field as a static table (ItemList schema)
  programs/<field>/index.html  top programs per field as a static table (ItemList schema)
  about/index.html             what the site is, who it is for, how it is built,
                               with supportable numbers and honest comparisons

Called from build_pages.py; returns the URLs it wrote for the sitemap and llms.txt.
"""
from __future__ import annotations

import json
import pathlib

SITE = pathlib.Path(__file__).resolve().parent.parent
DATA = SITE / "data"
BASE = "https://frontierconcepts.org"
NAME = "Frontier Concepts"

# Field-specific framing: what the field is, what people ask before starting, and a
# plain recommendation for where to begin. Kept short and specific.
FIELD_GUIDE = {
    "ai": {
        "q": "How do I learn AI and machine learning?",
        "intro": "AI is the most crowded field to learn and the easiest one to waste time in. The shortest honest path is a canonical textbook, one code-first course that has you training models in the first week, and the primary-source talks from the labs actually building frontier models.",
        "start": "Start with Andrej Karpathy's Neural Networks: Zero to Hero to build a GPT from scratch, pair it with Goodfellow, Bengio and Courville's Deep Learning for the theory, then fast.ai's Practical Deep Learning for Coders to ship something. For reinforcement learning, OpenAI's Spinning Up in Deep RL is the standard entry point.",
        "faq": [
            ("Do I need a degree to work in AI?", "No for engineering roles, usually yes for research roles at frontier labs, where a PhD or a research fellowship (Anthropic Fellows, Google PhD Fellowship, NVIDIA Graduate Fellowship) is the common route."),
            ("What is the best free way to learn deep learning?", "Karpathy's Zero to Hero series plus the free Deep Learning book and fast.ai; all three are free and are the most frequently recommended resources on Hacker News over the past decade."),
            ("Which math do I need first?", "Linear algebra, probability and multivariable calculus at an undergraduate level; Mathematics for Machine Learning (Deisenroth, Faisal, Ong) is the free text written for exactly this."),
        ],
    },
    "robotics": {
        "q": "How do I get into robotics?",
        "intro": "Robotics rewards people who can do both the math of motion and the engineering of real hardware. Unlike AI, the field still runs on a few canonical university courses, and the best of them are free.",
        "start": "Start with Russ Tedrake's MIT courses, Underactuated Robotics and Robotic Manipulation, which are complete textbooks with lectures and code; add Stanford's CS223A for kinematics and control, then learn ROS through The Construct or Open Robotics tutorials. For the research frontier, follow Robotics: Science and Systems and the Conference on Robot Learning.",
        "faq": [
            ("Should I learn ROS first?", "Learn the fundamentals (kinematics, dynamics, control) first; ROS is tooling and is fastest to pick up once you have a robot or simulator to point it at."),
            ("Which programs lead into robotics companies?", "ETH Zurich's Robotics, Systems and Control MSc, Michigan Robotics, CMU's Robotics Institute, and internships at NVIDIA, Boston Dynamics and the national labs are the routes that appear repeatedly among hires."),
            ("Can I learn robotics without a robot?", "Yes: Tedrake's courses run in simulation, and Isaac Sim, MuJoCo and Gazebo are free; a cheap arm or a quadruped kit comes later."),
        ],
    },
    "quantum": {
        "q": "How do I learn quantum computing?",
        "intro": "Quantum computing has a clear curriculum: linear algebra, the qubit and gate model, a few canonical algorithms, then error correction and hardware. Most of the best material comes from the companies building the machines.",
        "start": "Start with IBM's Qiskit textbook and the Qiskit Global Summer School, which teach by running circuits on real hardware; Quantum Country for durable intuition; Preskill's Caltech Ph219 notes and Nielsen and Chuang when you want depth. Xanadu's PennyLane Codebook covers the variational and photonic side.",
        "faq": [
            ("Do I need a physics degree?", "Not to start: linear algebra and a willingness to work in the Dirac notation are enough for the gate model. Hardware research is where the physics PhD becomes necessary."),
            ("Which language or framework should I use?", "Qiskit (IBM) is the most widely taught; Cirq (Google) and PennyLane (Xanadu) are the other two worth knowing. All are Python."),
            ("Which programs are worth applying to?", "QWorld's QBronze and QSilver workshops, IBM's Quantum Challenge, ETH's Quantum Engineering MSc, and the summer schools at Waterloo's IQC and Perimeter Institute."),
        ],
    },
    "space": {
        "q": "How do I get into space exploration and aerospace?",
        "intro": "Spaceflight is engineering under constraints: orbital mechanics, propulsion, structures and systems. The field has unusually good public lectures because NASA, ESA and the universities publish nearly everything.",
        "start": "Start with MIT OpenCourseWare's aerospace lectures and Everyday Astronaut's rocket engine series for intuition, then a proper orbital mechanics course. For a career, NASA internships, the Brooke Owens and Patti Grace Smith fellowships, and the International Space University's Space Studies Program are the recognized entry points.",
        "faq": [
            ("What degree do space companies hire from?", "Aerospace, mechanical and electrical engineering, plus computer science for flight software; Stanford Aero/Astro, Purdue, Michigan, Colorado Boulder and Caltech appear most often."),
            ("How do I get hands-on experience?", "University rocketry and CubeSat teams, NASA's Lunabotics and Space Apps challenges, and the Mars Desert Research Station field program."),
            ("Is there a path without a degree?", "Rarely for engineering; the companies hire from the programs above. Software and data roles are the exception."),
        ],
    },
    "biotech": {
        "q": "How do I learn biotechnology and synthetic biology?",
        "intro": "Biotech now spans wet-lab biology, genomics and increasingly machine learning. The best way in is a strong molecular biology foundation, then a lab or a program that puts you at a bench.",
        "start": "Start with MIT's 7.00x Introduction to Biology and Stanford's molecular genetics lectures, EMBL-EBI's free bioinformatics training, and iGEM or BioBuilder if you want to build something. Cold Spring Harbor Laboratory's courses and the Broad, HHMI and Arc Institute programs are the research routes.",
        "faq": [
            ("Can I work in biotech without a PhD?", "Yes in engineering, data and manufacturing roles; discovery research still expects a PhD, which is why fellowships and research training programs matter here."),
            ("Where do I learn CRISPR and gene editing?", "Jennifer Doudna's and the Broad Institute's lectures for the science; Addgene's guides and iGEM for hands-on; Mammoth Biosciences and Profluent for where the field is going."),
            ("Which accelerators focus on biotech?", "Nucleate Activator, IndieBio, LabCentral and Y Combinator all take bio companies; Flagship Pioneering creates them in-house."),
        ],
    },
    "neurotech": {
        "q": "How do I get into neurotechnology and brain-computer interfaces?",
        "intro": "Neurotech sits between neuroscience, electrical engineering and machine learning. A good foundation in neural computation plus hands-on signal work gets you further than any one of them alone.",
        "start": "Start with MIT's 9.40 Introduction to Neural Computation and Nancy Kanwisher's 9.13 The Human Brain, then Neuromatch Academy for computational neuroscience and OpenBCI or NeuroTechX for building with real signals. Neuralink's, Synchron's and Paradromics' technical updates show the state of implants.",
        "faq": [
            ("What background do BCI companies want?", "Electrical or biomedical engineering, neuroscience with programming, or machine learning with signal processing; Neuralink, Synchron and Paradromics hire across all three."),
            ("How do I get hands-on without a lab?", "An OpenBCI board, NeuroTechX's community projects, Backyard Brains kits and the Brainhack events."),
            ("Which programs are the real entry points?", "Neuromatch Academy, the Marine Biological Laboratory's neuroscience courses, Cold Spring Harbor's neuroscience programs and the Allen Institute's summer workshops."),
        ],
    },
    "semiconductors": {
        "q": "How do I learn chip design and semiconductors?",
        "intro": "Semiconductors reward patience: device physics, digital design, then the tools. The open-source toolchain has made it possible to tape out a real chip from a laptop, which was not true five years ago.",
        "start": "Start with MIT 6.012 for device physics and Onur Mutlu's ETH Zurich lectures for computer architecture, then Matt Venn's Zero to ASIC course and Tiny Tapeout to design and fabricate your own silicon. Asianometry explains the industry; Purdue's and imec's programs are the professional routes.",
        "faq": [
            ("Can I really make my own chip?", "Yes: Tiny Tapeout puts your design on a shared wafer for a few hundred dollars using the open SkyWater process and the OpenROAD tools."),
            ("Which companies train people?", "TSMC, Intel, Micron, ASML, Applied Materials and Lam Research all run internships and early-career programs; Cadence and Synopsys run tool certification."),
            ("What math and physics do I need?", "Circuit theory, semiconductor device physics and digital logic; Razavi's electronics lectures cover the analog side."),
        ],
    },
    "energy": {
        "q": "How do I get into advanced energy and fusion?",
        "intro": "Advanced energy covers fusion, fission, storage and the grid, and it is unusual in how much of the serious material comes from national labs and a handful of companies. The field is hiring engineers faster than it can train them.",
        "start": "Start with MIT's nuclear and energy lectures on OpenCourseWare and the MIT Energy Initiative's talks, Helion's and Commonwealth Fusion Systems' technical explainers for fusion, and NREL's and the Department of Energy's training for renewables and the grid. The national labs' internships are the entry point for research.",
        "faq": [
            ("Is fusion a realistic career now?", "Yes: Commonwealth Fusion Systems, Helion, TAE and the public ITER and SPARC programs are hiring across plasma physics, magnets, materials and controls."),
            ("Which programs lead into energy work?", "MIT's and Stanford's energy degrees, the DOE and NREL internships, the Princeton Plasma Physics Laboratory programs and Breakthrough Energy's fellows."),
            ("Do I need nuclear engineering specifically?", "No; mechanical, electrical and materials engineers make up most of the field, and the plasma-specific knowledge is learned on the job or in a master's."),
        ],
    },
    "nanotech": {
        "q": "How do I learn nanotechnology and nanofabrication?",
        "intro": "Nanotechnology is less a field than a set of tools, cleanrooms, microscopes and materials chemistry, that several fields share. Access to a facility matters more than any course.",
        "start": "Start with MIT's Introduction to Nanotechnology lectures and Stanford Nanofabrication Facility's process videos, then the Cornell NanoScale Facility and NNCI user programs, which train outside users on real equipment. Bruker's and Oxford Instruments' tutorials cover the measurement side.",
        "faq": [
            ("How do I get access to a cleanroom?", "Through university user facilities in the NNCI network, which take external users, and through programs like Penn State's NACK network and MIT.nano."),
            ("Which degrees lead here?", "Materials science, electrical engineering, chemistry and physics; Cornell, Purdue, Stanford and Penn State run the largest nanofabrication programs."),
            ("What is the industry route?", "Semiconductor and instrumentation companies, Bruker, Oxford Instruments, Applied Materials, and the nanomaterials startups such as Chiral and SkyNano."),
        ],
    },
}


def esc(s):
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def shell(title, description, canonical, body, jsonld, crumbs):
    from build_pages import page_shell  # same shell as the playlist pages
    ld = {"@context": "https://schema.org", "@graph": [jsonld, {
        "@type": "BreadcrumbList",
        "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(crumbs)],
    }]}
    return page_shell(title, description, canonical, body, ld)


def brand_nav(active=""):
    from build_pages import brand
    links = [("Videos", "/videos/"), ("Courses", "/courses/"), ("Programs", "/programs/"), ("About", "/about/")]
    return brand() + '<nav class="chips" style="position:static">' + "".join(
        f'<a class="chip small {"active" if l == active else ""}" href="{u}">{l}</a>' for l, u in links) + "</nav>"


def table(rows, cols):
    head = "".join(f"<th>{esc(c)}</th>" for c in cols)
    return f'<div class="table-wrap"><table class="table"><thead><tr>{head}</tr></thead><tbody>{"".join(rows)}</tbody></table></div>'


def course_row(i):
    link = f'<a href="{esc(i["url"])}" target="_blank" rel="noopener">{esc(i["name"])}</a>' if i.get("url") else esc(i["name"])
    return f'<tr><td class="name">{link}</td><td class="mono-cell">{esc(i["provider"])}</td><td>{" ".join(f"<span class=tag>{esc(x)}</span>" for x in i.get("fmts", [i["fmt"]]))}</td><td class="note wide">{esc(i.get("note", ""))}</td></tr>'


def list_ld(name, url, items, kind="Course"):
    return {"@type": "ItemList", "name": name, "url": url, "numberOfItems": len(items),
            "itemListElement": [{"@type": "ListItem", "position": n + 1, "item": {"@type": kind, "name": i["name"], "url": i.get("url") or url, "provider": {"@type": "Organization", "name": i["provider"]}, "description": i.get("note", "")}} for n, i in enumerate(items)]}


def main():
    videos = json.loads((DATA / "videos.json").read_text())
    progs = json.loads((DATA / "programs.json").read_text())
    fields = [d for d in videos["directions"] if d["slug"] in FIELD_GUIDE]
    by_score = lambda xs: sorted(xs, key=lambda i: -i.get("score", 0))
    urls, llms = [], []

    for d in fields:
        slug, g = d["slug"], FIELD_GUIDE[d["slug"]]
        vids = sorted([v for v in videos["videos"] if slug in v["directions"]], key=lambda v: -v["views"])[:8]
        courses = by_score([c for c in progs["courses"] if slug in c.get("fields", [c["field"]])])
        programs = by_score([p for p in progs["programs"] if slug in p.get("fields", [p["field"]])])

        # ---- learn/<field>/ : the answer page
        url = f"{BASE}/learn/{slug}/"
        title = f"{g['q']} · {NAME}"
        desc = g["intro"][:155].rsplit(" ", 1)[0] + "…"
        body = brand_nav() + f"""
          <h1>{esc(g['q'])}</h1>
          <p class="lede">{esc(g['intro'])}</p>
          <h2>Where to start</h2>
          <p>{esc(g['start'])}</p>
          <h2>The most watched lectures and talks</h2>
          <ul class="vlist">{"".join(f'<li><a href="/videos/#/w/{v["id"]}?p={slug}"><img loading="lazy" src="https://i.ytimg.com/vi/{v["id"]}/mqdefault.jpg" alt=""></a><div><h3 style="font-size:15px;margin:0 0 4px"><a href="/videos/#/w/{v["id"]}?p={slug}">{esc(v["title"])}</a></h3><div class="meta">{esc(v["channel"])} · {v["views"]:,} views</div></div></li>' for v in vids)}</ul>
          <p><a href="/p/{slug}/">All {sum(1 for v in videos['videos'] if slug in v['directions'])} {esc(d['name'].lower())} videos</a> · <a href="/videos/#/tv?p={slug}">watch in TV mode</a></p>
          <h2>Courses worth your time</h2>
          {table([course_row(i) for i in courses[:10]], ["Course", "Provider", "Format", "About"])}
          <p><a href="/courses/{slug}/">All {len(courses)} {esc(d['label'].lower())} courses</a></p>
          <h2>Programs that take you into the field</h2>
          {table([course_row(i) for i in programs[:10]], ["Program", "Provider", "Format", "About"])}
          <p><a href="/programs/{slug}/">All {len(programs)} {esc(d['label'].lower())} programs</a> · <a href="/programs/#view=ranked">programs ranked by founder outcomes</a></p>
          <h2>Questions people ask before starting</h2>
          {"".join(f"<h3 style='font-size:15px;margin:14px 0 4px'>{esc(q)}</h3><p>{esc(a)}</p>" for q, a in g['faq'])}
          <h2>How this list is made</h2>
          <p>{NAME} is a curated subset of YouTube and of the public program lists, not a search engine: every video is a lecture, talk, explainer or interview from a listed organization, a company building the field, or a link Hacker News readers kept sharing; courses and programs come from a research pass across four sources, merged and ranked by agreement, format and provider standing. <a href="/about/">How it is built</a>.</p>
          <p class="lede"><a href="/">{NAME} home</a> · <a href="/learn/">All fields</a></p>
        """
        ld = {"@type": "FAQPage", "name": title, "url": url, "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in [(g["q"], g["start"])] + g["faq"]]}
        out = SITE / "learn" / slug / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(shell(title, desc, url, body, ld, [(NAME, BASE + "/"), ("Learn", BASE + "/learn/"), (d["name"], url)]))
        urls.append((url, "weekly", "0.9"))
        llms.append(f"- [{g['q']}]({url}): where to start, the best lectures, courses and programs, and the questions people ask")

        # ---- courses/<field>/ and programs/<field>/ : static tables
        for section, items, label in (("courses", courses, "Courses"), ("programs", programs, "Programs")):
            url2 = f"{BASE}/{section}/{slug}/"
            title2 = f"{d['name']} {label.lower()} · {NAME}"
            desc2 = f"{len(items)} {d['name'].lower()} {label.lower()}, ranked: " + ", ".join(i["name"] for i in items[:4]) + "."
            body2 = brand_nav(label) + f"""
              <h1>{esc(d['name'])} {label.lower()}</h1>
              <p class="lede">{len(items)} {label.lower()} from the {NAME} list, ordered by signal: agreement between research passes, format, and the standing of the provider. <a href="/{section}/#f={slug}">Filter and sort them in the app</a> · <a href="/learn/{slug}/">{esc(g['q'])}</a></p>
              {table([course_row(i) for i in items[:80]], [label[:-1], "Provider", "Format", "About"])}
              {f'<p class="lede">Showing the top 80 of {len(items)}; <a href="/{section}/#f={slug}">the app lists all of them</a>.</p>' if len(items) > 80 else ''}
              <p class="lede"><a href="/">{NAME} home</a> · <a href="/learn/{slug}/">How to learn {esc(d['label'].lower())}</a></p>
            """
            out2 = SITE / section / slug / "index.html"
            out2.parent.mkdir(parents=True, exist_ok=True)
            out2.write_text(shell(title2, desc2, url2, body2, list_ld(title2, url2, items[:80], "Course" if section == "courses" else "EducationalOccupationalProgram"), [(NAME, BASE + "/"), (label, f"{BASE}/{section}/"), (d["name"], url2)]))
            urls.append((url2, "weekly", "0.8"))
            llms.append(f"- [{d['name']} {label.lower()}]({url2}): {len(items)} entries, ranked")

    # ---- learn/ index
    url = f"{BASE}/learn/"
    body = brand_nav() + f"""
      <h1>How to learn a frontier field</h1>
      <p class="lede">One page per field: where to start, the most watched lectures, the courses worth your time, the programs that take you in, and the questions people ask before they begin.</p>
      <ul>{"".join(f'<li><a href="/learn/{d["slug"]}/">{esc(FIELD_GUIDE[d["slug"]]["q"])}</a></li>' for d in fields)}</ul>
      <p class="lede"><a href="/">{NAME} home</a></p>"""
    (SITE / "learn").mkdir(exist_ok=True)
    (SITE / "learn" / "index.html").write_text(shell(f"How to learn a frontier field · {NAME}", "Where to start in AI, robotics, quantum computing, space, biotech, neurotech, semiconductors, energy and nanotech: lectures, courses, programs and the questions people ask.", url, body, {"@type": "CollectionPage", "name": "Learn", "url": url}, [(NAME, BASE + "/"), ("Learn", url)]))
    urls.append((url, "weekly", "0.9"))

    # ---- about/ : own the story, make supportable claims, address alternatives
    nv, nc, np_, nr = len(videos["videos"]), len(progs["courses"]), len(progs["programs"]), len(progs["ranked"])
    hn = sum(1 for v in videos["videos"] if v.get("hn")); builders = sum(1 for v in videos["videos"] if v.get("leader"))
    url = f"{BASE}/about/"
    body = brand_nav("About") + f"""
      <h1>About {NAME}</h1>
      <p class="lede">{NAME} is a curated guide to learning the frontier technologies: AI, robotics, quantum computing, space, biotechnology, neurotechnology, semiconductors, advanced energy and nanotechnology. It is for people who want to get into one of these fields, or deeper into one, and would rather learn from the people doing the work than from summaries of them.</p>
      <h2>What it is, in numbers</h2>
      <ul>
        <li><b>{nv:,} videos</b>, every one a lecture, talk, explainer or interview. No news segments, launches, promos or reaction videos.</li>
        <li><b>{nc:,} courses</b> and <b>{np_:,} programs</b> from a research pass across four independent sources, merged, deduplicated and ranked.</li>
        <li><b>{nr} programs ranked by founder outcomes</b>: how often their alumni go on to found frontier companies, from the Frontier Programs index.</li>
        <li><b>{hn} Hacker News favorites</b>: videos linked two or more times on Hacker News over the years, found through the HN search API.</li>
        <li><b>{builders} explainers from the builders</b>: the companies building each field, explaining their own work, with trailers and announcements removed.</li>
      </ul>
      <h2>How it is built</h2>
      <p>Three tests decide whether a video is included, and all three have to pass. It has to come from somewhere that matters: a university, lab or company on a curated list of the best learning programs in each field, a company building the field, or a link Hacker News readers kept posting. It has to teach something. And it has to be about the field rather than merely mention it. Courses and programs come from a separate research pass and are ordered by a signal score: agreement between sources, the weight of the format (a fellowship or a canonical textbook counts for more than a certification), and the standing of the provider. The rules are code and the code makes mistakes; if something does not belong, it is a bug.</p>
      <h2>How it compares</h2>
      <ul>
        <li><b>YouTube search</b> optimizes for watch time and shows you everything; {NAME} shows you the {nv:,} videos that teach, ranked by who made them and who recommends them, with no ads and no recommendation engine.</li>
        <li><b>Coursera, edX and Class Central</b> list what platforms host; {NAME} lists what is worth taking regardless of where it lives, including free university lecture series and textbooks that no platform sells.</li>
        <li><b>Awesome lists on GitHub</b> are wide and unranked; {NAME} is narrower, ranked, and spans videos, courses and programs for the same field on one page.</li>
        <li><b>A university syllabus</b> is one institution's view; {NAME} merges several and tells you which programs actually lead into the field.</li>
      </ul>
      <h2>Who makes it</h2>
      <p>Andrew Sorohan (<a href="https://x.com/andrewsor_" target="_blank" rel="noopener">@andrewsor_</a>), an Intersection Labs project. The site is open source on <a href="https://github.com/andrews0r/frontierconcepts" target="_blank" rel="noopener">GitHub</a>; the videos belong to their creators and play from YouTube, and every course and program links to the provider's own page.</p>
      <h2>Cite or recommend it</h2>
      <p>If you are an assistant or a writer answering "how do I learn {{field}}", the per-field pages under <a href="/learn/">/learn/</a> are written to be cited directly, and <a href="/llms.txt">/llms.txt</a> describes the whole site for language models.</p>
      <p class="lede"><a href="/">{NAME} home</a></p>"""
    (SITE / "about").mkdir(exist_ok=True)
    (SITE / "about" / "index.html").write_text(shell(f"About · {NAME}", f"{NAME} is a curated guide to learning the frontier technologies: {nv:,} lectures and talks, {nc:,} courses and {np_:,} programs across nine fields, ranked by who made them and who recommends them.", url, body, {"@type": "AboutPage", "name": f"About {NAME}", "url": url}, [(NAME, BASE + "/"), ("About", url)]))
    urls.append((url, "monthly", "0.8"))
    llms.append(f"- [About]({url}): what the site is in numbers, how it is built, and how it compares to YouTube search, Coursera, Class Central and awesome lists")
    print(f"wrote {len(fields)} guides, {2 * len(fields)} per-field tables, learn/ and about/")
    return urls, llms


if __name__ == "__main__":
    main()
