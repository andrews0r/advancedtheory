#!/usr/bin/env python3
"""One-off: fold an X accounts export into data/people.csv.

  python3 -I scripts/merge_x_accounts.py /path/to/x_accounts.csv

For people already in people.csv it fills or corrects the X handle. For people in the export
but not in the list it adds a row, using the role, organization, site and note from PROFILES
below (hand-written; the export only has a handle, a name and a one-line "why"). Accounts of
type lab/org and paper-feed are skipped: the People page is for people. Existing rows keep
their place; new rows go at the end of their field.
"""
from __future__ import annotations

import csv
import io
import pathlib
import sys

SITE = pathlib.Path(__file__).resolve().parent.parent
PEOPLE = SITE / "data" / "people.csv"
FIELD = {"Artificial intelligence": "ai", "Robotics": "robotics", "Quantum computing": "quantum", "Space exploration": "space", "Biotechnology": "biotech",
         "Neurotechnology": "neurotech", "Semiconductors": "semiconductors", "Advanced energy": "energy", "Nanotechnology": "nanotech"}
# Names as they should appear, keyed by handle (the export's display names are not always names).
NAME = {"hardmaru": "David Ha", "swyx": "Shawn Wang", "KordingLab": "Konrad Kording", "FoolAllTheTime": "Doug O'Laughlin", "Erdayastronaut": "Tim Dodd",
        "IanCutress": "Ian Cutress", "geochurch": "George Church", "JesseJenkins": "Jesse Jenkins", "tomoxl": "Tom Oxley", "leecronin": "Lee Cronin",
        "DrJamesTour": "James Tour", "MLiebreich": "Michael Liebreich", "AukeHoekstra": "Auke Hoekstra", "iScienceLuvr": "Tanishq Abraham",
        "michael_nielsen": "Michael Nielsen", "asianometry": "Jon Y", "matthewvenn": "Matt Venn", "jimkxa": "Jim Keller", "tyrell_turing": "Blake Richards", "ewintang": "Ewin Tang"}
SKIP = {"owl_posting", "ChrisHayduk", "IlirAliu_"}  # anonymous, inactive, or a news feed rather than a person
# handle -> (kind, role, org, site, note)
PROFILES = {
    "JeffDean": ("Researcher", "Former chief scientist of Google; co-designed MapReduce, TensorFlow and the TPU", "Discovery Loop", "https://research.google/people/jeff/", "Built the systems behind Google's AI for twenty years; posts the engineering detail behind big results"),
    "geoffreyhinton": ("Researcher", "Professor emeritus; Nobel laureate in physics", "University of Toronto", "https://www.cs.toronto.edu/~hinton/", "Backpropagation and deep learning's godfather; now its most prominent warner"),
    "ilyasut": ("Builder", "Co-founder; former chief scientist of OpenAI", "Safe Superintelligence", "https://ssi.inc", "Behind AlexNet, seq2seq and GPT; posts rarely and each post gets read"),
    "fchollet": ("Researcher", "Creator of Keras; co-founder of the ARC Prize", "Ndea", "https://fchollet.com", "Argues that intelligence is skill acquisition, not benchmark scores; ARC is the test of that"),
    "natolambert": ("Writer", "Post-training lead; author of Interconnects", "Ai2", "https://www.interconnects.ai", "The clearest running account of how open models are trained and where RLHF is going"),
    "jeremyphoward": ("Educator", "Co-founder", "fast.ai and Answer.AI", "https://www.fast.ai", "Practical Deep Learning for Coders: top-down teaching that gets you training models on day one"),
    "chrmanning": ("Researcher", "Professor; director of the Stanford AI Lab", "Stanford", "https://nlp.stanford.edu/~manning/", "Founded Stanford NLP; CS224N is the course that taught a generation NLP"),
    "percyliang": ("Researcher", "Professor; director of the Center for Research on Foundation Models", "Stanford", "https://cs.stanford.edu/~pliang/", "HELM and open evaluation; the academic check on frontier labs' claims"),
    "drfeifei": ("Researcher", "Professor; co-founder of World Labs", "Stanford and World Labs", "https://profiles.stanford.edu/fei-fei-li", "ImageNet made deep learning possible; now building spatial intelligence"),
    "polynoamial": ("Researcher", "Research scientist; leads reasoning research", "OpenAI", "https://noambrown.github.io", "Superhuman poker and Diplomacy, then the o-series; the person to read on test-time compute"),
    "hardmaru": ("Builder", "Co-founder and CEO", "Sakana AI", "https://sakana.ai", "World models and evolutionary methods; curates the most interesting papers outside the mainstream"),
    "janleike": ("Researcher", "Alignment research lead", "Anthropic", "https://aligned.substack.com", "Led OpenAI's alignment work before Anthropic; writes plainly about what safety research can and cannot do"),
    "soumithchintala": ("Builder", "Co-creator of PyTorch", "Meta", "https://soumith.ch", "Built the framework most research runs on; honest about infrastructure and open source"),
    "tri_dao": ("Researcher", "Assistant professor; chief scientist", "Princeton and Together AI", "https://tridao.me", "FlashAttention and Mamba; the hardware-aware algorithms that make long context cheap"),
    "srush_nlp": ("Educator", "Associate professor", "Cornell Tech", "https://rush-nlp.com", "Teaches transformers in a few hundred lines of code; the Annotated Transformer and GPU puzzles"),
    "simonw": ("Writer", "Co-creator of Django; independent researcher", "simonwillison.net", "https://simonwillison.net", "Tests every model and tool the week it ships and writes down exactly what happened"),
    "emollick": ("Writer", "Professor; author of Co-Intelligence", "Wharton", "https://www.oneusefulthing.org", "The best guide to using AI at work, from someone who runs the experiments"),
    "swyx": ("Writer", "Founder of Latent Space; AI engineer", "Latent Space", "https://www.latent.space", "Podcast and newsletter for people building with models; curates the high-signal accounts"),
    "DrJimFan": ("Researcher", "Director of robotics; co-leads GEAR", "NVIDIA", "https://jimfan.me", "Humanoid foundation models and simulation at scale; posts the results with the caveats"),
    "Ken_Goldberg": ("Researcher", "Professor; co-founder of Ambi Robotics", "UC Berkeley", "https://goldberg.berkeley.edu", "Grasping and the data question in robotics; the skeptic the field needs"),
    "RussTedrake": None,  # already listed; handle only
    "SongShuran": ("Researcher", "Assistant professor", "Stanford", "https://shuransong.github.io", "Diffusion Policy and UMI; makes robot data collection cheap enough to scale"),
    "yukez": ("Researcher", "Assistant professor; co-leads GEAR", "UT Austin and NVIDIA", "https://www.cs.utexas.edu/~yukez/", "Robot learning benchmarks and humanoid control; open code for most of it"),
    "xiaolonw": ("Researcher", "Associate professor; co-leads robotics", "UC San Diego and Meta Superintelligence Labs", "https://xiaolonw.github.io", "Sim-to-real for humanoids and dexterous hands; the videos come with the papers"),
    "hausman_k": ("Builder", "Co-founder", "Physical Intelligence", "https://karolhausman.github.io", "RT-1 and RT-2 at Google, now general robot policies; explains the recipe"),
    "chris_j_paxton": ("Researcher", "AI lead; co-host of RoboPapers", "Agility Robotics", "https://cpaxton.github.io", "Reads the robotics papers for you every week and argues with the authors"),
    "RemiCadene": ("Builder", "Creator of LeRobot; CEO", "UMA Robots", "", "Made robot learning as open as language models with LeRobot; low-cost arms and datasets"),
    "adcock_brett": ("Builder", "Founder and CEO", "Figure AI", "https://www.figure.ai", "Building humanoids for factories and homes; the most public humanoid roadmap"),
    "BerntBornich": ("Builder", "Founder and CEO", "1X", "https://www.1x.tech", "NEO, the home humanoid; posts the real footage, not renders"),
    "andy_matuschak": ("Educator", "Independent researcher; co-author of Quantum Country", "andymatuschak.org", "https://andymatuschak.org", "Quantum Country is the best introduction to quantum computing; also the best thinking on how people learn"),
    "CraigGidney": ("Researcher", "Research scientist", "Google Quantum AI", "https://algassert.com", "Error correction and resource estimates; the blog that tells you what breaking RSA would actually take"),
    "boazbaraktcs": ("Researcher", "Professor", "Harvard", "https://www.boazbarak.org", "Complexity theory and a careful eye on quantum and AI claims"),
    "ewintang": ("Researcher", "Assistant professor", "UC Berkeley", "https://ewintang.com", "Dequantized the quantum recommendation algorithm as an undergraduate; the person who checks the speedups"),
    "jaygambetta": None,
    "preskill": None,
    "michael_nielsen": None,
    "jeff_foust": ("Writer", "Senior staff writer", "SpaceNews", "https://spacenews.com/author/jeff-foust/", "Policy and industry reporting with the documents attached"),
    "SciGuySpace": ("Writer", "Senior space editor", "Ars Technica", "https://arstechnica.com/author/ericberger/", "The reporter the industry reads; Liftoff and Reentry are the histories of SpaceX"),
    "Peter_J_Beck": ("Builder", "Founder and CEO", "Rocket Lab", "https://www.rocketlabcorp.com", "Electron and Neutron; the second company to make orbital launch routine"),
    "torybruno": ("Builder", "Former CEO of United Launch Alliance", "Blue Origin", "", "Explains launch vehicle engineering trade-offs in public, with the numbers"),
    "rookisaacman": ("Builder", "Private astronaut; commander of Polaris Dawn", "", "", "Flew the first commercial spacewalk; posts from the inside of the program"),
    "JPMajor": ("Writer", "Science writer", "Lights in the Dark", "https://lightsinthedark.com", "Daily coverage of missions and images from the probes"),
    "pdhsu": ("Researcher", "Co-founder; assistant professor", "Arc Institute and UC Berkeley", "https://arcinstitute.org", "Evo, the DNA foundation model, and new CRISPR tools; the lab that treats biology as a design problem"),
    "BrianHie": ("Researcher", "Assistant professor; Arc Institute investigator", "Stanford", "https://brianhie.com", "Evolution-scale language models for DNA and protein; the papers behind Evo"),
    "sokrypton": ("Researcher", "Assistant professor", "MIT", "", "ColabFold put AlphaFold in a browser tab; posts the tricks and the failures of structure prediction"),
    "MoAlQuraishi": ("Researcher", "Assistant professor", "Columbia", "https://www.aqlab.io", "OpenFold and the honest scorecards of protein structure prediction"),
    "lpachter": ("Researcher", "Professor", "Caltech", "https://pachterlab.github.io", "Computational biology and genomics; the field's sharpest critic of weak papers"),
    "anshulkundaje": ("Researcher", "Associate professor", "Stanford", "https://kundajelab.stanford.edu", "Deep learning on the genome; the regulatory code and how to read it"),
    "ElliotHershberg": ("Writer", "Author of The Century of Biology; partner", "Amplify Partners", "https://centuryofbio.com", "Essays on where biology is going as an engineering discipline"),
    "EricTopol": None,
    "geochurch": None,
    "maxhodak_": ("Builder", "Founder and CEO; co-founded Neuralink", "Science Corp", "https://science.xyz", "Retinal and cortical implants; the most technical founder writing about brain interfaces"),
    "tomoxl": None,
    "SergeyStavisky": ("Researcher", "Assistant professor", "UC Davis", "", "Speech neuroprostheses; the UC Davis trial that decoded speech at conversational speed"),
    "KordingLab": ("Researcher", "Professor", "University of Pennsylvania", "https://kordinglab.com", "Neuroscience meets machine learning; co-founded Neuromatch, the free summer school"),
    "tyrell_turing": ("Researcher", "Associate professor", "McGill and Mila", "https://linclab.org", "NeuroAI: what the brain can teach deep learning and the reverse"),
    "patrickmineault": ("Researcher", "NeuroAI researcher", "Amaranth Foundation", "https://xcorr.net", "Writes the field's best explainers on brain-inspired models and the tools to build them"),
    "SussilloDavid": ("Researcher", "Adjunct professor", "Stanford", "", "Reverse-engineering neural networks and brains with the same tools"),
    "dileeplearning": ("Researcher", "Head of AI; co-founded Vicarious", "Astera Institute", "https://www.astera.org", "Brain-inspired AI from cortical circuits; the long-running alternative to scaling"),
    "AdamMarblestone": ("Builder", "CEO", "Convergent Research", "https://www.convergentresearch.org", "Roadmaps for neurotech and the focused research organizations that execute them"),
    "neuralreckoning": ("Educator", "Professor", "Imperial College London", "https://neural-reckoning.org", "Computational neuroscience with open courses and code; co-created Brian, the simulator"),
    "IanCutress": ("Writer", "Chip industry analyst; TechTechPotato", "More Than Moore", "https://morethanmoore.substack.com", "Interviews the architects and explains the roadmaps; former AnandTech"),
    "asianometry": None,
    "matthewvenn": None,
    "jimkxa": None,
    "LisaSu": None,
    "PGelsinger": ("Builder", "Former CEO of Intel; architect of the 80486", "Playground Global", "", "Forty years inside Intel from the 486 to the foundry bet"),
    "FoolAllTheTime": ("Writer", "Author of Fabricated Knowledge", "Fabricated Knowledge", "https://www.fabricatedknowledge.com", "The semiconductor supply chain explained for investors and engineers"),
    "dnystedt": ("Writer", "Taiwan technology reporter", "", "", "Daily data from Taiwan's chip industry: TSMC, the suppliers, the numbers"),
    "anshelsag": ("Writer", "Principal analyst", "Moor Insights and Strategy", "https://moorinsightsstrategy.com", "Mobile and client silicon; the analyst in the room at every launch"),
    "dylan522p": None,
    "DrSimEvans": ("Writer", "Deputy editor and policy editor", "Carbon Brief", "https://www.carbonbrief.org", "Energy and emissions data for the UK and the world, checked against the sources"),
    "hausfath": ("Researcher", "Climate scientist; research lead", "Berkeley Earth and Stripe", "https://www.theclimatebrink.com", "Climate science and carbon removal by the numbers; writes The Climate Brink"),
    "MLiebreich": ("Writer", "Founder of BloombergNEF; host of Cleaning Up", "Liebreich Associates", "https://www.liebreich.com", "The economics of the energy transition and the hydrogen ladder"),
    "ramez": ("Writer", "Author; climate and clean energy investor", "", "https://rameznaam.com", "Forecast the solar cost collapse before it happened; writes the learning-curve analysis"),
    "drvolts": ("Writer", "Author of Volts", "Volts", "https://www.volts.wtf", "Long interviews with the people decarbonizing each sector"),
    "_brianpotter": ("Writer", "Author of Construction Physics", "Institute for Progress", "https://www.construction-physics.com", "Why building things is hard, from transmission lines to fabs to reactors"),
    "fbirol": ("Builder", "Executive director", "International Energy Agency", "https://www.iea.org", "The World Energy Outlook; the official numbers on supply and demand"),
    "AukeHoekstra": ("Researcher", "Energy transition researcher", "Eindhoven University of Technology", "", "Models electric vehicles and the grid; corrects the bad studies in public"),
    "Dkirtley": ("Builder", "Founder and CEO", "Helion Energy", "https://www.helionenergy.com", "Pulsed fusion with direct electricity recovery; the first fusion power purchase agreement"),
    "JesseJenkins": None,
    "BobMumgaard": None,
    "DrJamesTour": ("Researcher", "Professor of chemistry", "Rice University", "https://www.jmtour.com", "Nanocars, graphene from anything and the synthesis behind nanomaterials"),
    "leecronin": ("Researcher", "Regius professor of chemistry; founder of Chemify", "University of Glasgow", "https://www.chem.gla.ac.uk/cronin/", "Digital chemistry and assembly theory; robots that run synthesis"),
}


def main(export: pathlib.Path):
    with PEOPLE.open(newline="", encoding="utf-8") as f:
        r = csv.DictReader(f); fields = r.fieldnames; people = list(r)
    with export.open(newline="", encoding="utf-8") as f:
        rows = [x for x in csv.DictReader(f) if x.get("account_type") == "person" and x.get("handle")]
    by_name = {p["name"].lower(): p for p in people}
    updated, added, skipped = 0, [], []
    for x in rows:
        handle = x["handle"].lstrip("@")
        if handle in SKIP:
            continue
        name = NAME.get(handle, x["name"].strip())
        p = by_name.get(name.lower())
        if p is not None:
            if p["x"] != handle:
                p["x"] = handle; updated += 1
            continue
        prof = PROFILES.get(handle)
        if prof is None:
            skipped.append(f"{name} (@{handle})"); continue
        kind, role, org, site, note = prof
        row = {k: "" for k in fields}
        row.update(field=FIELD[x["field"]], name=name, kind=kind, role=role, org=org, site=site, x=handle, note=note)
        people.append(row); by_name[name.lower()] = row; added.append(name)
    # Keep field groups together: stable sort by field order of first appearance.
    order = []
    for p in people:
        if p["field"] not in order: order.append(p["field"])
    people.sort(key=lambda p: order.index(p["field"]))
    buf = io.StringIO(); w = csv.DictWriter(buf, fieldnames=fields, lineterminator="\n"); w.writeheader(); w.writerows(people)
    PEOPLE.write_text(buf.getvalue())
    print(f"handles updated: {updated}; added {len(added)}: {', '.join(added)}")
    if skipped:
        print(f"no profile, skipped: {', '.join(skipped)}", file=sys.stderr)
    print(f"people now {len(people)}")


if __name__ == "__main__":
    main(pathlib.Path(sys.argv[1]))
