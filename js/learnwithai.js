/* Learn with AI (demo). Pick a topic, a duration and a weekly load; the assistant builds a
   week-by-week path from the catalogue (videos, courses, programs, papers, people) and keeps it
   in a channel, one channel per rabbit hole. Calendar, Library and Tasks are views over the same
   plan. Everything is scripted and local: state lives in localStorage, nothing is sent anywhere.
   Routes: #/new · #/c/<id> · #/calendar · #/library · #/tasks */
(function () {
  'use strict';
  const V = (window.FA_DATA || {}).videos || [];
  const PR = window.FC_PROGRAMS || { fields: [], courses: [], programs: [] };
  const LIB = window.FC_LIBRARY || { fields: [], people: [], research: [] };
  const FIELDS = (LIB.fields.length ? LIB.fields : PR.fields);
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const KEY = 'fc-learnwithai';
  const S = store.get(KEY, { channels: [], setup: {} });
  const save = () => store.set(KEY, S);

  const LOADS = { minimal: { label: 'Minimal', hours: 8, sub: 'up to 10 h a week', days: [1, 3, 5] }, part: { label: 'Part time', hours: 20, sub: 'about 20 h a week', days: [0, 1, 2, 3, 4] }, full: { label: 'Full time', hours: 40, sub: 'about 40 h a week', days: [0, 1, 2, 3, 4] } };
  const DURATIONS = [3, 6, 9, 12];
  const KIND = { watch: 'Watch', read: 'Read', take: 'Take', build: 'Build', talk: 'Talk', attend: 'Attend', coach: 'Coach' };
  const PHASES = [['Foundations', 0.3], ['Core', 0.35], ['Practice', 0.2], ['Launch', 0.15]];
  const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const field = (slug) => FIELDS.find((f) => f.slug === slug) || { slug, name: slug, label: slug };
  const fmtH = (h) => (h >= 1 ? (Math.round(h * 2) / 2).toString().replace('.5', '½') + ' h' : Math.round(h * 60) + ' min');
  const fmtN = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
  const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

  // ------------------------------------------------------------ seeded rng
  function rng(seed) { let x = 0; for (const c of seed) x = (x * 31 + c.charCodeAt(0)) >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }

  // ---------------------------------------------------------------- pools
  function pools(slug, topic) {
    const q = (topic || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const hit = (t) => q.length ? q.some((w) => (t || '').toLowerCase().includes(w)) : false;
    const vids = V.filter((v) => (v.directions || []).includes(slug) && v.duration >= 600 && v.duration <= 4 * 3600)
      .sort((a, b) => (hit(b.title) - hit(a.title)) || (b.hn ? 1 : 0) - (a.hn ? 1 : 0) || (b.views || 0) - (a.views || 0));
    const inField = (i) => (i.fields || [i.field]).includes(slug);
    const byScore = (a, b) => (hit(b.name) - hit(a.name)) || (b.score || 0) - (a.score || 0);
    return {
      videos: vids,
      courses: PR.courses.filter(inField).sort(byScore),
      programs: PR.programs.filter(inField).sort(byScore),
      research: LIB.research.filter(inField).sort((a, b) => (hit(b.name) - hit(a.name)) || (a.source === 'hn') - (b.source === 'hn') || a.rank - b.rank),
      people: LIB.people.filter(inField).sort((a, b) => (b.logo ? 1 : 0) - (a.logo ? 1 : 0) || a.rank - b.rank),
    };
  }

  // -------------------------------------------------------------- planner
  // A plan is a list of weeks; each week a list of items {id, kind, hours, ref, title, url, meta, why}.
  function buildPlan(ch) {
    const P = pools(ch.field, ch.topic);
    const r = rng(ch.id);
    const weeks = Math.round(ch.months * 4.33);
    const budget = LOADS[ch.load].hours;
    const f = field(ch.field);
    const idx = { videos: 0, courses: 0, programs: 0, research: 0, people: 0 };
    const next = (k) => { const arr = P[k]; if (!arr.length) return null; const it = arr[idx[k] % arr.length]; idx[k] += 1; return it; };
    const items = [];
    const mk = (week, kind, hours, ref, title, url, meta, why, extra = {}) => { const it = { id: `${ch.id}-${week}-${items.length}`, week, kind, hours: Math.round(hours * 2) / 2, title, url, meta, why, ...extra }; items.push(it); return it; };
    const vidItem = (w, v, why) => mk(w, 'watch', v.duration / 3600 + 0.25, v, v.title, `/videos/#/w/${v.id}`, [v.channel, fmtH(v.duration / 3600), fmtN(v.views || 0) + ' views'], why, { thumb: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg` });
    const readItem = (w, p, why) => mk(w, 'read', p.kind === 'Paper' || p.kind === 'Essay' ? 3 : 5, p, p.name, p.url, [p.authors ? `${p.authors} · ${p.year}` : String(p.year), p.kind], why || p.note);
    const talkItem = (w, p, why) => mk(w, 'talk', 1, p, p.name, p.url, [p.role, p.org].filter(Boolean), why, { face: p.logo || '' });
    let course = null, program = null, phaseAt = 0;
    const bounds = PHASES.map(([name, frac]) => [name, frac]);
    for (let w = 1; w <= weeks; w++) {
      // phase for this week
      let acc = 0, phase = 'Foundations';
      for (const [name, frac] of bounds) { acc += frac; if ((w - 1) / weeks < acc) { phase = name; break; } }
      let left = budget;
      const firstOfPhase = phase !== phaseAt; phaseAt = phase;
      // weekly check-in with the assistant
      mk(w, 'coach', 0.5, null, `Check-in · week ${w}`, '', ['with the assistant', phase], w === 1 ? 'Set the baseline: what you know, what you want to be able to do by the end.' : 'What landed, what did not, what to change next week.');
      left -= 0.5;
      if (phase === 'Foundations') {
        if (w === 1 && P.research.length) { const t = P.research.find((x) => x.kind === 'Textbook') || P.research[0]; if (t) { const it = readItem(w, t, `The textbook for ${f.name.toLowerCase()}; one chapter a week through this phase.`); it.hours = Math.min(5, Math.round(left * 0.45 * 2) / 2); left -= it.hours; } }
        else if (P.research.find((x) => x.kind === 'Textbook')) { const t = P.research.find((x) => x.kind === 'Textbook'); const it = readItem(w, t, 'Next chapter.'); it.hours = Math.min(5, Math.round(left * 0.4 * 2) / 2); left -= it.hours; }
        while (left > 1 && P.videos.length) { const v = next('videos'); if (!v) break; const it = vidItem(w, v, w === 1 ? 'Start with a talk, not a tutorial: get the shape of the field before the details.' : 'Lecture or talk that fits what you are reading this week.'); left -= it.hours; if (items.filter((x) => x.week === w && x.kind === 'watch').length >= 4) break; }
        if (left > 2.5 && w > 1) { const p = next('research'); if (p && p.kind !== 'Textbook') { const it = readItem(w, p, p.note); left -= it.hours; } }
        if (left > 2) { const it = mk(w, 'build', Math.round(left * 0.8 * 2) / 2, null, w === 1 ? 'Set up: a notes system, the tools the course will need, and a public log of what you learn.' : 'Exercises and notes from this week\'s chapter.', '', ['practice', phase], w === 1 ? 'An hour of setup now saves ten later.' : 'Reading without exercises does not stick; write the summary you wish you had found.'); left -= it.hours; }
      } else if (phase === 'Core') {
        if (firstOfPhase || !course) { course = next('courses'); }
        if (course) { const it = mk(w, 'take', Math.max(3, left * 0.5), course, course.name, course.url, [course.provider, course.fmt, course.cost || ''].filter(Boolean), firstOfPhase ? `Your main course for this phase: ${course.note || 'the highest-signal course in the catalogue for this field'}.` : 'Keep going; the planner reserved half your week for it.', { logo: course.logo || '' }); left -= it.hours; }
        if (left > 2.5 && (w % 2 === 0)) { const p = next('research'); if (p) { const it = readItem(w, p, p.note); left -= it.hours; } }
        while (left > 1 && P.videos.length) { const v = next('videos'); if (!v) break; const it = vidItem(w, v, 'Pairs with the course this week.'); left -= it.hours; if (items.filter((x) => x.week === w && x.kind === 'watch').length >= 2) break; }
      } else if (phase === 'Practice') {
        const projects = [`Reproduce a result from a paper you read, end to end, and write it up.`, `Build something small in ${f.name.toLowerCase()} that a stranger could use; ship it publicly.`, `Teach it: a 20-minute talk or post explaining one idea from this phase.`, `Contribute to an open project in the field: an issue, a fix, a dataset.`];
        const it = mk(w, 'build', Math.max(3, left * 0.55), null, projects[(w - 1) % projects.length], '', ['project', phase], 'Practice is where the hours convert into skill; this is the biggest block of the week.');
        left -= it.hours;
        if (w % 2 === 1) { const p = next('people'); if (p) { const t = talkItem(w, p, `Ask one specific question about your project; ${p.name.split(' ')[0]}'s work is the primary source here.`); left -= t.hours; } }
        if (left > 2.5) { const p = next('research'); if (p) { const r2 = readItem(w, p, p.note); left -= r2.hours; } }
        if (left > 1 && P.videos.length) { const v = next('videos'); if (v) { vidItem(w, v, 'Background for the project.'); } }
      } else {
        if (firstOfPhase || !program) { program = next('programs'); }
        if (program) { const it = mk(w, 'attend', firstOfPhase ? 4 : 2, program, program.name, program.url, [program.provider, program.fmt].filter(Boolean), firstOfPhase ? `The program to apply to or join next: ${program.note || 'the strongest route into the field in the catalogue'}. This week: the application.` : 'Application follow-up, or the first sessions if you are in.', { logo: program.logo || '' }); left -= it.hours; }
        const it2 = mk(w, 'build', Math.max(3, left * 0.5), null, w === weeks ? 'Capstone: finish the write-up, publish it, send it to three people in the field.' : 'Capstone work: the project that goes in the application.', '', ['capstone', phase], 'What you show is what gets you in.');
        left -= it2.hours;
        if (w % 2 === 0) { const p = next('people'); if (p) talkItem(w, p, 'Ask for a review of the capstone, or an introduction.'); }
        if (left > 1 && P.videos.length) { const v = next('videos'); if (v) vidItem(w, v, 'Keep the input going.'); }
      }
    }
    return { weeks, items, phases: PHASES.map(([n]) => n) };
  }

  const planOf = (ch) => { if (!ch._plan) ch._plan = buildPlan(ch); return ch._plan; };
  const phaseOfWeek = (ch, w) => { const n = planOf(ch).weeks; let acc = 0; for (const [name, frac] of PHASES) { acc += frac; if ((w - 1) / n < acc) return name; } return 'Launch'; };
  const startDate = (ch) => { const d = new Date(ch.created); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day + 7); d.setHours(0, 0, 0, 0); return d; };
  const weekOfToday = (ch) => { const ms = Date.now() - startDate(ch).getTime(); return Math.max(1, Math.min(planOf(ch).weeks, Math.floor(ms / (7 * 864e5)) + 1)); };
  const isDone = (ch, it) => !!(ch.done || {})[it.id];
  const isSkipped = (ch, it) => !!(ch.skipped || {})[it.id];
  const hoursOf = (ch, w, only) => planOf(ch).items.filter((i) => i.week === w && !isSkipped(ch, i) && (!only || only(i))).reduce((a, i) => a + i.hours, 0);
  const progress = (ch) => { const its = planOf(ch).items.filter((i) => !isSkipped(ch, i)); const done = its.filter((i) => isDone(ch, i)).reduce((a, i) => a + i.hours, 0); const all = its.reduce((a, i) => a + i.hours, 0); return all ? done / all : 0; };
  const fmtDate = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const weekDate = (ch, w, offset = 0) => { const d = startDate(ch); d.setDate(d.getDate() + (w - 1) * 7 + offset); return d; };

  // ----------------------------------------------------------------- bits
  const tag = (t) => `<span class="tag">${esc(t)}</span>`;
  const chip = (label, active, attrs = '', sub = '') => `<a class="chip ${active ? 'active' : ''}" ${attrs}>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</a>`;
  const botIcon = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="2.2" fill="currentColor" stroke="none"/></svg>';
  const initials = (n) => n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  function card(ch, it) {
    const done = isDone(ch, it), skipped = isSkipped(ch, it);
    if (skipped) return '';
    let media = '';
    if (it.thumb) media = `<img class="thumb" loading="lazy" src="${esc(it.thumb)}" alt="">`;
    else if (it.kind === 'talk') media = it.face ? `<img class="face" loading="lazy" src="${esc(it.face)}" alt="">` : `<span class="face mono">${esc(initials(it.title))}</span>`;
    const title = it.url ? `<a href="${esc(it.url)}" ${/^https?:/.test(it.url) ? 'target="_blank" rel="noopener"' : ''}>${esc(it.title)}</a>` : esc(it.title);
    return `<div class="lw-card ${done ? 'done' : ''}" data-id="${it.id}">
      <div class="kind">${tag(KIND[it.kind])}${media}</div>
      <div><div class="ti">${title}</div>${it.why ? `<div class="why">${esc(it.why)}</div>` : ''}<div class="m">${it.meta.filter(Boolean).map(esc).join('<span>·</span>')}<span>·</span><span>${fmtH(it.hours)}</span></div></div>
      <div class="ops"><button data-act="done" class="${done ? 'on' : ''}">${done ? 'Done ✓' : 'Done'}</button>${it.kind !== 'coach' ? '<button data-act="skip">Skip</button>' : ''}${['watch', 'read', 'talk'].includes(it.kind) ? '<button data-act="swap">Swap</button>' : ''}</div>
    </div>`;
  }
  const msg = (html, me = false, t = '') => `<div class="lw-msg ${me ? 'me' : ''}">${me ? '' : `<span class="who">${botIcon}</span>`}<div><div class="txt">${html}</div>${t ? `<div class="t">${esc(t)}</div>` : ''}</div></div>`;

  // -------------------------------------------------------------- sidebar
  function renderSide(route) {
    const chans = S.channels.map((c) => {
      const active = route.view === 'c' && route.id === c.id;
      return `<a href="#/c/${c.id}" class="${active ? 'active' : ''}"><span class="hash">#</span><span class="lw-ch-name">${esc(c.name)}</span><span class="lw-ch-meta">${Math.round(progress(c) * 100)}%</span></a>`;
    }).join('');
    const view = (key, label, icon) => `<a href="#/${key}" class="${route.view === key ? 'active' : ''}">${icon}<span class="lw-ch-name">${label}</span></a>`;
    const ico = {
      cal: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
      lib: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h5v16H4zM11 4h5v16h-5zM17.5 5l4 15"/></svg>',
      task: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7l2 2 4-4M4 17l2 2 4-4M13 7h7M13 17h7"/></svg>',
    };
    $('#side').innerHTML = `<h3>Rabbit holes</h3><nav class="lw-nav">${chans}<a href="#/new" class="new ${route.view === 'new' ? 'active' : ''}">+ New rabbit hole</a></nav>
      <h3>Views</h3><nav class="lw-nav">${view('calendar', 'Calendar', ico.cal)}${view('library', 'Library', ico.lib)}${view('tasks', 'Tasks', ico.task)}</nav>
      <div class="lw-side-foot">Demo. The assistant is scripted and the plan is built from the catalogue; nothing leaves your browser.${S.channels.length ? ' <a href="#" id="reset">Reset</a>.' : ''}</div>`;
    const reset = $('#reset'); if (reset) reset.addEventListener('click', (e) => { e.preventDefault(); if (confirm('Clear all rabbit holes in this demo?')) { S.channels = []; save(); location.hash = '#/new'; } });
  }

  // ---------------------------------------------------------------- setup
  function renderSetup() {
    const st = S.setup;
    st.field = st.field || 'quantum'; st.months = st.months || 6; st.load = st.load || 'minimal';
    const f = field(st.field);
    const P = pools(st.field, st.topic);
    const weeks = Math.round(st.months * 4.33), hours = weeks * LOADS[st.load].hours;
    $('#main').innerHTML = `<div class="lw-setup">
      <h1>Start a rabbit hole</h1>
      <p class="lead">Tell the assistant what you want to get into, how long you have and how much of each week you can give it. It builds the path from the catalogue and adjusts as you go.</p>
      <div class="lw-step"><div class="lbl"><span class="n">01</span> Topic</div>
        <div class="lw-chips" id="fields">${FIELDS.map((x) => chip(x.label, x.slug === st.field, `data-field="${x.slug}"`)).join('')}</div>
        <input class="lw-text" id="topic" placeholder="Narrow it: e.g. error correction, legged locomotion, protein design" value="${esc(st.topic || '')}">
      </div>
      <div class="lw-step"><div class="lbl"><span class="n">02</span> Duration</div>
        <div class="lw-chips" id="months">${DURATIONS.map((m) => chip(`${m} months`, m === st.months, `data-months="${m}"`)).join('')}</div></div>
      <div class="lw-step"><div class="lbl"><span class="n">03</span> Load</div>
        <div class="lw-chips" id="loads">${Object.entries(LOADS).map(([k, v]) => chip(v.label, k === st.load, `data-load="${k}"`, v.sub)).join('')}</div></div>
      <div class="lw-summary">
        <dl class="kv"><dt>Field</dt><dd>${esc(f.name)}</dd></dl>
        <dl class="kv"><dt>Weeks</dt><dd>${weeks}</dd></dl>
        <dl class="kv"><dt>Hours</dt><dd>≈ ${hours}</dd></dl>
        <dl class="kv"><dt>From the catalogue</dt><dd>${P.videos.length} videos · ${P.courses.length} courses · ${P.programs.length} programs · ${P.research.length} papers · ${P.people.length} people</dd></dl>
      </div>
      <a class="pill-btn primary" id="build" href="#">Build my path →</a>
    </div>`;
    $('#rail').innerHTML = `<h3>How it works</h3><ul>
      <li>${tag('Watch')} talks and lectures from the videos section</li>
      <li>${tag('Read')} papers and textbooks from Research</li>
      <li>${tag('Take')} one course per phase from Courses</li>
      <li>${tag('Build')} projects sized to your load</li>
      <li>${tag('Talk')} to people from the People section</li>
      <li>${tag('Attend')} a program from Programs in the last phase</li>
      <li>${tag('Coach')} a 30-minute check-in every week</li></ul>
      <h3>Phases</h3><ul>${PHASES.map(([n, fr]) => `<li><b>${n}</b> <span class="lw-ch-meta">${Math.round(fr * 100)}% of the weeks</span></li>`).join('')}</ul>`;
    const on = (sel, key, attr, cast) => $(sel).addEventListener('click', (e) => { const a = e.target.closest('.chip'); if (!a) return; e.preventDefault(); st[key] = cast(a.dataset[attr]); save(); renderSetup(); });
    on('#fields', 'field', 'field', String); on('#months', 'months', 'months', Number); on('#loads', 'load', 'load', String);
    $('#topic').addEventListener('change', (e) => { st.topic = e.target.value.trim(); save(); renderSetup(); });
    $('#build').addEventListener('click', (e) => {
      e.preventDefault();
      const topic = ($('#topic').value || '').trim(); st.topic = topic;
      const name = slugify(topic || f.name) || f.slug;
      const id = `${name}-${Date.now().toString(36)}`;
      const ch = { id, name, field: st.field, topic, months: st.months, load: st.load, created: Date.now(), done: {}, skipped: {}, log: [] };
      S.channels.push(ch); save();
      location.hash = `#/c/${id}`;
    });
  }

  // -------------------------------------------------------------- channel
  function introText(ch) {
    const f = field(ch.field), plan = planOf(ch), L = LOADS[ch.load];
    return `<p>New rabbit hole: <b>${esc(f.name)}</b>${ch.topic ? `, narrowed to <b>${esc(ch.topic)}</b>` : ''}. ${plan.weeks} weeks at ${L.hours} hours a week, about ${plan.weeks * L.hours} hours.</p>
      <p>Four phases: <b>Foundations</b> (read the textbook, watch the talks that give you the map), <b>Core</b> (one course, plus the papers it points at), <b>Practice</b> (projects, and conversations with people doing the work) and <b>Launch</b> (apply to a program, finish a capstone).</p>
      <p>Each week I post the moves. Mark them done, skip what you know, swap what does not fit, or tell me when your week changes.</p>`;
  }
  function renderChannel(ch) {
    const plan = planOf(ch), f = field(ch.field), L = LOADS[ch.load], cur = weekOfToday(ch);
    let html = `<header class="lw-head"><h1><span class="hash">#</span>${esc(ch.name)}</h1>
      <span class="meta"><span>${esc(f.label)}</span><span>${ch.months} months</span><span>${L.label} · ${L.hours} h/wk</span><span>week ${cur} of ${plan.weeks}</span></span>
      <span class="bar" title="${Math.round(progress(ch) * 100)}% of planned hours done"><i style="width:${Math.round(progress(ch) * 100)}%"></i></span>
      <span class="acts"><a class="chip small" href="#/calendar">Calendar</a><a class="chip small" href="#/tasks">Tasks</a></span></header>`;
    html += '<div class="lw-stream">';
    html += msg(introText(ch), false, new Date(ch.created).toLocaleDateString());
    const shown = Math.min(plan.weeks, cur + 1);
    for (let w = 1; w <= shown; w++) {
      const phase = phaseOfWeek(ch, w);
      html += `<div class="lw-week ${w === cur ? 'cur' : ''}"><b>Week ${w}</b><span>${fmtDate(weekDate(ch, w))} – ${fmtDate(weekDate(ch, w, 6))}</span><span class="ph">${phase}</span><span>${fmtH(hoursOf(ch, w))}</span></div>`;
      const its = plan.items.filter((i) => i.week === w);
      const lead = w === cur ? 'This week.' : w < cur ? '' : 'Next week, so you can plan around it.';
      html += msg(`${lead ? `<p>${lead}</p>` : ''}${its.map((i) => card(ch, i)).join('')}`);
      for (const m of (ch.log || []).filter((x) => x.week === w)) html += msg(m.html, m.me, m.t);
    }
    if (shown < plan.weeks) html += msg(`<p>${plan.weeks - shown} more weeks are planned; they show up as you get there. The <a href="#/calendar">calendar</a> has all of them.</p>`);
    html += '</div>';
    html += `<div class="lw-compose"><div class="lw-quick">${['What should I do first?', 'I have less time this week', 'Go deeper', 'Who should I talk to?', 'What is next?'].map((q) => `<a class="chip small" data-q="${esc(q)}">${esc(q)}</a>`).join('')}</div>
      <form id="say"><input id="say-in" placeholder="Tell the assistant how your week looks, or ask for something…" autocomplete="off"><button class="pill-btn primary" type="submit">Send</button></form></div>`;
    $('#main').innerHTML = html;
    renderRail(ch);
    // scroll the current week into view
    const curEl = $('.lw-week.cur'); if (curEl) { const m = $('#main'); m.scrollTop = Math.max(0, curEl.offsetTop - 12); }
    $('.lw-stream').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const id = b.closest('.lw-card').dataset.id; const it = plan.items.find((x) => x.id === id); if (!it) return;
      if (b.dataset.act === 'done') { ch.done[id] = !ch.done[id]; }
      if (b.dataset.act === 'skip') { ch.skipped[id] = true; }
      if (b.dataset.act === 'swap') swap(ch, it);
      save(); renderChannel(ch);
    });
    $('.lw-quick').addEventListener('click', (e) => { const a = e.target.closest('[data-q]'); if (!a) return; reply(ch, a.dataset.q); });
    $('#say').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#say-in').value.trim(); if (v) reply(ch, v); });
  }
  function swap(ch, it) {
    const P = pools(ch.field, ch.topic);
    const used = new Set(planOf(ch).items.map((x) => x.title));
    const pool = it.kind === 'watch' ? P.videos : it.kind === 'read' ? P.research : P.people;
    const nxt = pool.find((x) => !used.has(x.title || x.name)); if (!nxt) return;
    if (it.kind === 'watch') Object.assign(it, { title: nxt.title, url: `/videos/#/w/${nxt.id}`, meta: [nxt.channel, fmtH(nxt.duration / 3600), fmtN(nxt.views || 0) + ' views'], thumb: `https://i.ytimg.com/vi/${nxt.id}/mqdefault.jpg`, hours: Math.round((nxt.duration / 3600 + 0.25) * 2) / 2, why: 'Swapped in.' });
    else if (it.kind === 'read') Object.assign(it, { title: nxt.name, url: nxt.url, meta: [nxt.authors ? `${nxt.authors} · ${nxt.year}` : String(nxt.year), nxt.kind], why: nxt.note });
    else Object.assign(it, { title: nxt.name, url: nxt.url, meta: [nxt.role, nxt.org].filter(Boolean), face: nxt.logo || '', why: 'Swapped in.' });
    ch.swaps = ch.swaps || {}; ch.swaps[it.id] = { title: it.title, url: it.url, meta: it.meta, thumb: it.thumb, face: it.face, hours: it.hours, why: it.why };
  }
  // Scripted replies: the demo's "assistant". Keyword intents, deterministic.
  function reply(ch, text) {
    const plan = planOf(ch), cur = weekOfToday(ch), f = field(ch.field), P = pools(ch.field, ch.topic);
    const t = text.toLowerCase();
    const now = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    ch.log = ch.log || [];
    ch.log.push({ week: cur, me: true, html: `<p>${esc(text)}</p>`, t: now });
    const week = plan.items.filter((i) => i.week === cur && !isSkipped(ch, i) && !isDone(ch, i));
    let html;
    if (/less time|busy|travel|no time|skip this week|lighter/.test(t)) {
      const drop = week.filter((i) => i.kind === 'watch').slice(-1)[0] || week.filter((i) => i.kind === 'read').slice(-1)[0];
      if (drop) { ch.skipped[drop.id] = true; html = `<p>Lighter week, then. I dropped <b>${esc(drop.title)}</b> (${fmtH(drop.hours)}) and kept the ${week.find((i) => i.kind === 'take') ? 'course' : week.find((i) => i.kind === 'build') ? 'project' : 'reading'}: the thing that compounds. The week is now ${fmtH(hoursOf(ch, cur, (i) => !isDone(ch, i)))}.</p>`; }
      else html = '<p>Nothing left to trim this week without losing the main block. Do the check-in and call it a week.</p>';
    } else if (/deeper|more|harder|advanced|theory/.test(t)) {
      const p = P.research.find((x) => !plan.items.some((i) => i.title === x.name));
      if (p) { const it = { id: `${ch.id}-${cur}-x${plan.items.length}`, week: cur, kind: 'read', hours: 3, title: p.name, url: p.url, meta: [p.authors ? `${p.authors} · ${p.year}` : String(p.year), p.kind], why: p.note }; plan.items.push(it); ch.extra = ch.extra || []; ch.extra.push(it); html = `<p>Added a primary source to this week: <b>${esc(p.name)}</b>. ${esc(p.note)}</p>`; }
      else html = '<p>You have read everything in the catalogue for this field. Time to write something.</p>';
    } else if (/who|people|talk|expert|mentor/.test(t)) {
      const ppl = P.people.slice(0, 3);
      html = `<p>Three people whose work is the primary source for ${esc(f.name.toLowerCase())}. Pick one, read their last three posts, and ask one specific question.</p><div class="lw-grid2">${ppl.map((p) => `<div class="lw-card"><div class="kind">${tag('Talk')}${p.logo ? `<img class="face" src="${esc(p.logo)}" alt="">` : `<span class="face mono">${esc(initials(p.name))}</span>`}</div><div><div class="ti"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a></div><div class="why">${esc(p.note)}</div><div class="m"><span>${esc(p.role)}</span>${p.org ? `<span>·</span><span>${esc(p.org)}</span>` : ''}</div></div></div>`).join('')}</div>`;
    } else if (/first|start|begin|where/.test(t)) {
      const first = week[0] || plan.items.find((i) => i.week === cur);
      html = first ? `<p>Start with <b>${esc(first.title)}</b> (${fmtH(first.hours)}). ${esc(first.why || '')} Then the rest of the week in the order posted.</p>` : '<p>This week is done. Next week is already posted.</p>';
    } else if (/next|then|after/.test(t)) {
      const nw = Math.min(plan.weeks, cur + 1); const its = plan.items.filter((i) => i.week === nw);
      html = `<p>Week ${nw} is <b>${esc(phaseOfWeek(ch, nw))}</b>, ${fmtH(hoursOf(ch, nw))}: ${its.map((i) => `${KIND[i.kind].toLowerCase()} <b>${esc(i.title)}</b>`).join(', ')}.</p>`;
    } else if (/done|finished|complete/.test(t)) {
      const left = week.length; html = left ? `<p>${left} move${left === 1 ? '' : 's'} left this week, ${fmtH(week.reduce((a, i) => a + i.hours, 0))}. Mark them done on the cards and I will reshape next week around what landed.</p>` : '<p>Week complete. Next week is posted above; take the weekend.</p>';
    } else {
      html = `<p>Noted. For now the plan stands: ${week.length} move${week.length === 1 ? '' : 's'} left this week. Ask me to go deeper, lighten the week, or for people to talk to, and I will change the path.</p>`;
    }
    ch.log.push({ week: cur, me: false, html, t: now });
    save(); renderChannel(ch);
    const m = $('#main'); m.scrollTop = m.scrollHeight;
  }

  // ----------------------------------------------------------------- rail
  function renderRail(ch) {
    const plan = planOf(ch), cur = weekOfToday(ch), L = LOADS[ch.load];
    const planned = hoursOf(ch, cur), done = hoursOf(ch, cur, (i) => isDone(ch, i));
    const its = plan.items.filter((i) => i.week === cur && !isSkipped(ch, i));
    const next = its.find((i) => !isDone(ch, i));
    const today = (new Date().getDay() + 6) % 7;
    $('#rail').innerHTML = `<h3>This week</h3>
      <div class="big">${fmtH(done)}<small>of ${fmtH(planned)}</small></div>
      <div class="days">${DAY.map((d, i) => `<span class="${L.days.includes(i) ? (i < today ? 'done' : 'on') : ''}" title="${d}">${d[0]}</span>`).join('')}</div>
      <dl class="kv"><div><dt>Phase</dt><dd>${esc(phaseOfWeek(ch, cur))}</dd></div><div><dt>Sessions</dt><dd>${L.days.length} × ${fmtH(L.hours / L.days.length)}</dd></div><div><dt>Up next</dt><dd>${next ? esc(KIND[next.kind]) + ' · ' + fmtH(next.hours) : 'all done'}</dd></div><div><dt>Overall</dt><dd>${Math.round(progress(ch) * 100)}% · wk ${cur}/${plan.weeks}</dd></div></dl>
      <h3>Moves left</h3><ul>${its.filter((i) => !isDone(ch, i)).map((i) => `<li>${tag(KIND[i.kind])}<span>${esc(i.title.length > 48 ? i.title.slice(0, 46) + '…' : i.title)}</span></li>`).join('') || '<li>Nothing left. Rest.</li>'}</ul>`;
  }

  // ------------------------------------------------------------- calendar
  function renderCalendar() {
    const chans = S.channels;
    if (!chans.length) return empty('Calendar');
    let html = `<div class="lw-page"><h1>Calendar</h1><p class="sub">Every week of every rabbit hole, with sessions on your load's days. Hatched days are off.</p>`;
    for (const ch of chans) {
      const plan = planOf(ch), L = LOADS[ch.load], cur = weekOfToday(ch);
      html += `<div class="lw-group"><b># ${esc(ch.name)}</b><span>${plan.weeks} weeks · ${L.label}</span></div><div class="lw-cal"><div class="dh"></div>${DAY.map((d) => `<div class="dh">${d}</div>`).join('')}`;
      for (let w = 1; w <= plan.weeks; w++) {
        const its = plan.items.filter((i) => i.week === w && !isSkipped(ch, i));
        // spread the week's moves over the load's days
        const perDay = L.days.map(() => []); its.forEach((it, k) => perDay[k % L.days.length].push(it));
        html += `<div class="wk ${w === cur ? 'cur' : ''}"><b>Week ${w}</b>${fmtDate(weekDate(ch, w))}<br><span class="ph">${esc(phaseOfWeek(ch, w))}</span></div>`;
        for (let d = 0; d < 7; d++) {
          const k = L.days.indexOf(d);
          html += `<div class="${k < 0 ? 'off' : ''} ${w === cur ? 'cur' : ''}">${k < 0 ? '' : perDay[k].map((it) => `<span class="ses ${isDone(ch, it) ? 'done' : ''}" title="${esc(it.title)}">${tag(KIND[it.kind])}${esc(it.title)}</span>`).join('')}</div>`;
        }
      }
      html += '</div>';
    }
    $('#main').innerHTML = html + '</div>';
    railSummary();
  }

  // -------------------------------------------------------------- library
  function renderLibrary() {
    const chans = S.channels;
    if (!chans.length) return empty('Library');
    let html = `<div class="lw-page"><h1>Library</h1><p class="sub">Everything the assistant has put on your path, by format. Check off what you have finished.</p>`;
    const kinds = ['watch', 'read', 'take', 'attend', 'talk'];
    for (const k of kinds) {
      const rows = [];
      for (const ch of chans) for (const it of planOf(ch).items.filter((i) => i.kind === k && !isSkipped(ch, i))) rows.push([ch, it]);
      if (!rows.length) continue;
      html += `<div class="lw-group"><b>${KIND[k]}</b><span>${rows.length}</span></div><div class="lw-list">${rows.map(([ch, it]) => `<div class="row ${isDone(ch, it) ? 'done' : ''}"><input type="checkbox" data-ch="${ch.id}" data-id="${it.id}" ${isDone(ch, it) ? 'checked' : ''}><span class="mono-cell k"># ${esc(ch.name)}</span><span class="ti">${it.url ? `<a href="${esc(it.url)}" ${/^https?:/.test(it.url) ? 'target="_blank" rel="noopener"' : ''}>${esc(it.title)}</a>` : esc(it.title)}<small>${it.meta.filter(Boolean).map(esc).join(' · ')}</small></span><span class="mono-cell wk">week ${it.week}</span><span class="mono-cell">${fmtH(it.hours)}</span></div>`).join('')}</div>`;
    }
    $('#main').innerHTML = html + '</div>';
    bindChecks(); railSummary();
  }

  // ---------------------------------------------------------------- tasks
  function renderTasks() {
    const chans = S.channels;
    if (!chans.length) return empty('Tasks');
    let html = `<div class="lw-page"><h1>Tasks</h1><p class="sub">Projects, applications and check-ins, by week. The parts of the path you produce rather than consume.</p>`;
    const rows = [];
    for (const ch of chans) for (const it of planOf(ch).items.filter((i) => ['build', 'attend', 'coach'].includes(i.kind) && !isSkipped(ch, i))) rows.push([ch, it]);
    rows.sort((a, b) => a[1].week - b[1].week);
    const open = rows.filter(([ch, it]) => !isDone(ch, it)), done = rows.filter(([ch, it]) => isDone(ch, it));
    const list = (rs) => `<div class="lw-list">${rs.map(([ch, it]) => `<div class="row ${isDone(ch, it) ? 'done' : ''}"><input type="checkbox" data-ch="${ch.id}" data-id="${it.id}" ${isDone(ch, it) ? 'checked' : ''}><span class="mono-cell k">${tag(KIND[it.kind])}</span><span class="ti">${esc(it.title)}<small># ${esc(ch.name)} · ${esc(phaseOfWeek(ch, it.week))}</small></span><span class="mono-cell wk">${fmtDate(weekDate(ch, it.week))}</span><span class="mono-cell">${fmtH(it.hours)}</span></div>`).join('')}</div>`;
    html += `<div class="lw-group"><b>Open</b><span>${open.length}</span></div>${list(open)}`;
    if (done.length) html += `<div class="lw-group"><b>Done</b><span>${done.length}</span></div>${list(done)}`;
    $('#main').innerHTML = html + '</div>';
    bindChecks(); railSummary();
  }
  function bindChecks() {
    $('#main').addEventListener('change', (e) => { const c = e.target; if (c.type !== 'checkbox') return; const ch = S.channels.find((x) => x.id === c.dataset.ch); if (!ch) return; ch.done[c.dataset.id] = c.checked; save(); route(); });
  }
  function railSummary() {
    $('#rail').innerHTML = `<h3>Rabbit holes</h3><ul>${S.channels.map((ch) => `<li><span class="lw-ch-meta">${Math.round(progress(ch) * 100)}%</span><a href="#/c/${ch.id}"># ${esc(ch.name)}</a></li>`).join('')}</ul>
      <h3>Hours a week</h3><dl class="kv">${S.channels.map((ch) => `<div><dt># ${esc(ch.name)}</dt><dd>${LOADS[ch.load].hours} h</dd></div>`).join('')}<div><dt>Total</dt><dd>${S.channels.reduce((a, ch) => a + LOADS[ch.load].hours, 0)} h</dd></div></dl>`;
  }
  function empty(title) {
    $('#main').innerHTML = `<div class="lw-page"><h1>${title}</h1><p class="sub">Nothing here yet. <a href="#/new">Start a rabbit hole</a> and the assistant fills this in.</p></div>`;
    $('#rail').innerHTML = '';
  }

  // ---------------------------------------------------------------- route
  function parse() {
    const h = location.hash.replace(/^#\/?/, '');
    if (h.startsWith('c/')) return { view: 'c', id: h.slice(2) };
    if (['calendar', 'library', 'tasks', 'new'].includes(h)) return { view: h };
    return S.channels.length ? { view: 'c', id: S.channels[S.channels.length - 1].id } : { view: 'new' };
  }
  function route() {
    const r = parse();
    renderSide(r);
    if (r.view === 'new') renderSetup();
    else if (r.view === 'calendar') renderCalendar();
    else if (r.view === 'library') renderLibrary();
    else if (r.view === 'tasks') renderTasks();
    else { const ch = S.channels.find((c) => c.id === r.id); if (!ch) { location.hash = '#/new'; return; } restore(ch); renderChannel(ch); }
    document.title = (r.view === 'c' ? `# ${(S.channels.find((c) => c.id === r.id) || {}).name || ''}` : r.view === 'new' ? 'New rabbit hole' : r.view[0].toUpperCase() + r.view.slice(1)) + ' · Learn with AI · Frontier Concepts';
    if (!/^#\/c\//.test(location.hash)) { $('#main').scrollTop = 0; window.scrollTo(0, 0); }
  }
  // Re-apply swaps and extras to a freshly built plan (plans are rebuilt from the seed on load).
  function restore(ch) {
    if (ch._plan) return;
    const plan = planOf(ch);
    for (const [id, patch] of Object.entries(ch.swaps || {})) { const it = plan.items.find((x) => x.id === id); if (it) Object.assign(it, patch); }
    for (const it of ch.extra || []) plan.items.push(it);
  }
  $('#theme-btn').addEventListener('click', () => { const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', next); store.set('fa-theme', next); });
  window.addEventListener('hashchange', route);
  route();
})();
