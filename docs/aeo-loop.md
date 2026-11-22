# Answer-engine discoverability: the loop

What a learner asks before choosing how to get into a field, where Frontier Concepts
should appear for it, and how to check. Re-run the prompts after each change; log
the result; act on the biggest gap first.

## Own / claim / earn / contest

- **Own** (done on the site): `/about/` states what it is, who it is for and how it is
  built; `/learn/<field>/` answers "how do I learn X" directly with an answer-first
  paragraph, the best videos, courses and programs, and an FAQ (FAQPage schema);
  `/courses/<field>/` and `/programs/<field>/` are crawlable ranked tables; the home
  page carries a crawlable intro and start-here links; `/llms.txt` lists all of it.
- **Claim** (done): supportable numbers on `/about/` and in every meta description
  (video, course, program and ranked-program counts; the three selection tests).
- **Earn** (yours): independent mentions and comparisons. Cheapest wins, in order:
  a Show HN post ("Show HN: the small part of YouTube worth your time on frontier
  tech"), answers in the Reddit threads below, a mention in the newsletters that cover
  learning resources (TLDR, Ben's Bites, Import AI, The Batch), and asking three or
  four people you know with blogs to link the field page they would use.
- **Contest** (done on the site): `/about/` names the alternatives (YouTube search,
  Coursera, edX, Class Central, GitHub awesome lists, a university syllabus) and says
  honestly where each is better.

## Buyer questions to test

Run each in ChatGPT, Claude, Perplexity and Google AI Overviews; record whether
Frontier Concepts is cited, who is cited instead, and what page they cite.

| # | Prompt | Page that should answer it |
|---|---|---|
| 1 | How do I learn quantum computing from scratch? | /learn/quantum/ |
| 2 | Best free courses to get into robotics | /courses/robotics/ |
| 3 | Which fellowships lead to founding a deep tech company? | /programs/#view=ranked |
| 4 | Best YouTube lectures on nuclear fusion | /p/energy/ |
| 5 | How do I get into brain-computer interfaces? | /learn/neurotech/ |
| 6 | Where can I learn chip design and tape out my own chip? | /learn/semiconductors/ |
| 7 | Best resources to learn machine learning in 2026 | /learn/ai/ |
| 8 | Programs for getting into space engineering | /programs/space/ |
| 9 | Synthetic biology courses for beginners | /courses/biotech/ |
| 10 | How to get cleanroom access to learn nanofabrication | /learn/nanotech/ |
| 11 | Curated list of frontier tech lectures, not YouTube search | /about/ |
| 12 | Alternatives to Coursera for learning hard science | /about/ |

## Where learners already talk

Answer, don't promote: link the one page that answers the thread's question.

- r/learnmachinelearning, r/MLQuestions, r/robotics, r/QuantumComputing, r/spacex
  and r/aerospace, r/biotech and r/synthbio, r/neuro and r/BCI, r/chipdesign and
  r/ECE, r/fusion, r/nanotech.
- Hacker News "Ask HN: how do I learn X" threads; the HN search API finds them.
- Discords of the communities already in the catalogue: QWorld, NeuroTechX, Open
  Robotics, Tiny Tapeout, iGEM.

## Measure Google and AI separately

- Google: Search Console, by page, for the `/learn/`, `/courses/<field>/` and
  `/programs/<field>/` URLs; impressions first, then clicks.
- AI: the prompt table above, once a month, by assistant; count citations and
  mentions, branded and non-branded ("frontier concepts" vs "curated frontier tech
  lectures").
- Keep the two in separate columns; ranking on one does not imply the other.

## Close the gaps

For each miss: which page should have answered, does it answer the question in its
first paragraph, is it in the sitemap, is it linked from at least two other pages,
and what does the cited competitor say that we don't. Fix the existing page before
making a new one.
