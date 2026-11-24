/* Learn with AI (demo). A pursuit is one subject you are building expertise in: pick a topic, a
   duration and a weekly load; the assistant builds a week-by-week path from the catalogue (videos,
   courses, programs, papers, people) and keeps it as a conversation. Every move on the path opens
   as its own session: a player for a talk, a reading guide for a paper, a brief and checklist for a
   project, a profile and prep for a conversation. Home lists what is coming up; Discover lists
   learning experiences from the providers in the catalogue that you can apply to from here.
   Everything is scripted and local: state lives in localStorage, nothing is sent anywhere.
   Routes: #/home · #/discover · #/new · #/p/<id> · #/p/<id>/i/<item> · #/calendar · #/library · #/tasks */
(function () {
  'use strict';
  const V = (window.FA_DATA || {}).videos || [];
  const PR = window.FC_PROGRAMS || { fields: [], courses: [], programs: [] };
  const LIB = window.FC_LIBRARY || { fields: [], people: [], research: [] };
  const FIELDS = (LIB.fields.length ? LIB.fields : PR.fields);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const KEY = 'fc-learnwithai';
  const S = store.get(KEY, {});
  S.pursuits = S.pursuits || S.channels || []; delete S.channels;
  S.pursuits.forEach((c) => { delete c._plan; if (!c.flow) c.log = []; });
  S.chat = S.chat || [];
  S.setup = S.setup || {}; S.applied = S.applied || {}; S.checks = S.checks || {}; S.notes = S.notes || {}; S.prefs = S.prefs || {};
  const save = () => store.set(KEY, JSON.parse(JSON.stringify(S, (k, v) => (k === '_plan' ? undefined : v))));

  const LOADS = { minimal: { label: 'Minimal', hours: 8, sub: 'up to 10 h a week', days: [1, 3, 5] }, part: { label: 'Part time', hours: 20, sub: 'about 20 h a week', days: [0, 1, 2, 3, 4] }, full: { label: 'Full time', hours: 40, sub: 'about 40 h a week', days: [0, 1, 2, 3, 4] } };
  const DURATIONS = [3, 6, 9, 12];
  const KIND = { watch: 'Watch', read: 'Read', take: 'Take', build: 'Build', talk: 'Talk', attend: 'Attend', coach: 'Coach' };
  const PHASES = [['Foundations', 0.3], ['Core', 0.35], ['Practice', 0.2], ['Launch', 0.15]];
  const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const field = (slug) => FIELDS.find((f) => f.slug === slug) || { slug, name: slug, label: slug };
  const fmtH = (h) => (h >= 1 ? (Math.round(h * 2) / 2).toString().replace('.5', '½') + ' h' : Math.round(h * 60) + ' min');
  const fmtN = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
  const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const initials = (n) => (n || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const ext = (url) => /^https?:/.test(url || '') ? 'target="_blank" rel="noopener"' : '';
  const midnight = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const fmtDate = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const fmtDay = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

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
    const weeks = Math.round(ch.months * 4.33);
    const budget = LOADS[ch.load].hours;
    const f = field(ch.field);
    const idx = { videos: 0, courses: 0, programs: 0, research: 0, people: 0 };
    const next = (k) => { const arr = P[k]; if (!arr.length) return null; const it = arr[idx[k] % arr.length]; idx[k] += 1; return it; };
    const items = [];
    const mk = (week, kind, hours, ref, title, url, meta, why, extra = {}) => { const it = { id: `${ch.id}-${week}-${items.length}`, week, kind, hours: Math.round(hours * 2) / 2, ref: ref ? ref.id : '', title, url, meta, why, ...extra }; items.push(it); return it; };
    const vidItem = (w, v, why) => mk(w, 'watch', v.duration / 3600 + 0.25, v, v.title, `/videos/#/w/${v.id}`, [v.channel, fmtH(v.duration / 3600), fmtN(v.views || 0) + ' views'], why, { thumb: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg` });
    const readItem = (w, p, why) => mk(w, 'read', p.kind === 'Paper' || p.kind === 'Essay' ? 3 : 5, p, p.name, p.url, [p.authors ? `${p.authors} · ${p.year}` : String(p.year), p.kind], why || p.note);
    const talkItem = (w, p, why) => mk(w, 'talk', 1, p, p.name, p.url, [p.role, p.org].filter(Boolean), why, { face: p.logo || '' });
    let course = null, program = null, phaseAt = 0;
    for (let w = 1; w <= weeks; w++) {
      let acc = 0, phase = 'Foundations';
      for (const [name, frac] of PHASES) { acc += frac; if ((w - 1) / weeks < acc) { phase = name; break; } }
      let left = budget;
      const firstOfPhase = phase !== phaseAt; phaseAt = phase;
      mk(w, 'coach', 0.5, null, `Check-in · week ${w}`, '', ['with the assistant', phase], w === 1 ? 'Set the baseline: what you know, what you want to be able to do by the end.' : 'What landed, what did not, what to change next week.');
      left -= 0.5;
      if (phase === 'Foundations') {
        const tb = P.research.find((x) => x.kind === 'Textbook');
        if (w === 1 && P.research.length) { const t = tb || P.research[0]; const it = readItem(w, t, `The textbook for ${f.name.toLowerCase()}; one chapter a week through this phase.`); it.hours = Math.min(5, Math.round(left * 0.45 * 2) / 2); left -= it.hours; }
        else if (tb) { const it = readItem(w, tb, 'Next chapter.'); it.hours = Math.min(5, Math.round(left * 0.4 * 2) / 2); left -= it.hours; }
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

  const planOf = (ch) => { if (!ch._plan) { ch._plan = buildPlan(ch); restore(ch); } return ch._plan; };
  // Re-apply swaps and extras to a freshly built plan (plans are rebuilt from the seed on load).
  function restore(ch) {
    const plan = ch._plan;
    for (const [id, patch] of Object.entries(ch.swaps || {})) { const it = plan.items.find((x) => x.id === id); if (it) Object.assign(it, patch); }
    for (const it of ch.extra || []) if (!plan.items.some((x) => x.id === it.id)) plan.items.push(it);
  }
  const phaseOfWeek = (ch, w) => { const n = planOf(ch).weeks; let acc = 0; for (const [name, frac] of PHASES) { acc += frac; if ((w - 1) / n < acc) return name; } return 'Launch'; };
  const startDate = (ch) => { const d = new Date(ch.created); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day + 7); d.setHours(0, 0, 0, 0); return d; };
  const weekOfToday = (ch) => { const ms = Date.now() - startDate(ch).getTime(); return Math.max(1, Math.min(planOf(ch).weeks, Math.floor(ms / (7 * 864e5)) + 1)); };
  const isDone = (ch, it) => !!(ch.done || {})[it.id];
  const isSkipped = (ch, it) => !!(ch.skipped || {})[it.id];
  const weekItems = (ch, w) => planOf(ch).items.filter((i) => i.week === w && !isSkipped(ch, i));
  const hoursOf = (ch, w, only) => weekItems(ch, w).filter((i) => !only || only(i)).reduce((a, i) => a + i.hours, 0);
  const progress = (ch) => { const its = planOf(ch).items.filter((i) => !isSkipped(ch, i)); const done = its.filter((i) => isDone(ch, i)).reduce((a, i) => a + i.hours, 0); const all = its.reduce((a, i) => a + i.hours, 0); return all ? done / all : 0; };
  const pct = (ch) => Math.round(progress(ch) * 100);
  const weekDate = (ch, w, offset = 0) => { const d = startDate(ch); d.setDate(d.getDate() + (w - 1) * 7 + offset); return d; };
  // Every move of a pursuit with the day it lands on (the week's moves spread over the load's days).
  function dated(ch) {
    const plan = planOf(ch), L = LOADS[ch.load], out = [];
    for (let w = 1; w <= plan.weeks; w++) weekItems(ch, w).forEach((it, k) => out.push({ ch, it, date: weekDate(ch, w, L.days[k % L.days.length]) }));
    return out;
  }
  const dateOf = (ch, it) => (dated(ch).find((x) => x.it.id === it.id) || {}).date || weekDate(ch, it.week);
  const refOf = (it) => {
    if (!it.ref) return null;
    if (it.kind === 'watch') return V.find((v) => v.id === it.ref);
    if (it.kind === 'read') return LIB.research.find((x) => x.id === it.ref);
    if (it.kind === 'take') return PR.courses.find((x) => x.id === it.ref);
    if (it.kind === 'attend') return PR.programs.find((x) => x.id === it.ref) || PR.courses.find((x) => x.id === it.ref);
    if (it.kind === 'talk') return LIB.people.find((x) => x.id === it.ref);
    return null;
  };
  const itemHref = (ch, it) => `#/p/${ch.id}/i/${it.id}`;

  // ----------------------------------------------------------------- bits
  const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  const ICO = {
    home: svg('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
    discover: svg('<circle cx="12" cy="12" r="9"/><path d="M15 9l-2 6-4 0 2-6z" fill="currentColor" stroke="none"/><path d="M15 9l-6 6"/>'),
    cal: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    lib: svg('<path d="M4 4h5v16H4zM11 4h5v16h-5zM17.5 5l4 15"/>'),
    task: svg('<path d="M4 7l2 2 4-4M4 17l2 2 4-4M13 7h7M13 17h7"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 'class="ico-sun"') + svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>', 'class="ico-moon"'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    enter: svg('<path d="M20 5v6a3 3 0 0 1-3 3H5M9 10l-4 4 4 4"/>'),
    chev: svg('<path d="M9 6l6 6-6 6"/>'),
    back: svg('<path d="M15 6l-6 6 6 6"/>'),
    ext: svg('<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'),
    check: svg('<path d="M5 12l4 4L19 7"/>'),
    watch: svg('<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z" fill="currentColor" stroke="none"/>'),
    read: svg('<path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z"/>'),
    take: svg('<path d="M2 9l10-4 10 4-10 4z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6"/>'),
    build: svg('<path d="M14 6l4 4-9 9H5v-4zM12 8l4 4"/><path d="M15 3l3 1 2 3-2 2-4-4z"/>'),
    talk: svg('<path d="M4 5h16v10H9l-5 4z"/>'),
    attend: svg('<path d="M3 21h18M5 21V8l7-4 7 4v13M10 21v-5h4v5"/>'),
    coach: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>'),
    bot: svg('<rect x="4" y="7" width="16" height="12" rx="4"/><circle cx="9.5" cy="13" r="1.3" fill="currentColor" stroke="none"/><circle cx="14.5" cy="13" r="1.3" fill="currentColor" stroke="none"/><path d="M12 7V4M9 4h6"/>'),
  };
  const tag = (t, cls = '') => `<span class="tag ${cls}">${esc(t)}</span>`;
  const chip = (label, active, attrs = '', sub = '') => `<a class="chip small ${active ? 'active' : ''}" ${attrs}>${esc(label)}${sub ? `<span>${esc(sub)}</span>` : ''}</a>`;
  const fold = (title, body, open = true, right = '') => `<details class="fold" ${open ? 'open' : ''}><summary>${ICO.chev}<span>${esc(title)}</span>${right ? `<em>${right}</em>` : ''}</summary><div class="fb">${body}</div></details>`;
  const logoOf = (x, cls = '') => `<span class="logo sm ${x.logo ? 'has' : ''} ${cls}">${x.logo ? `<img src="${esc(x.logo)}" alt="" onload="this.classList.add('ok')" onerror="this.remove()">` : ''}<span class="mono">${esc(initials(x.name || x.title))}</span></span>`;
  const faceOf = (p, cls = 'face') => p.logo ? `<img class="${cls}" src="${esc(p.logo)}" alt="">` : `<span class="${cls} mono">${esc(initials(p.name || p.title))}</span>`;
  const ptag = (ch) => `<span class="tag ptag">${esc(ch.name)}</span>`;
  const kv = (rows) => `<dl class="kv">${rows.filter((r) => r[1] || r[1] === 0).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

  // A move as a compact row (home, calendar, library, tasks).
  function row(ch, it, right = '') {
    const done = isDone(ch, it);
    return `<a class="lw-row ${done ? 'done' : ''}" href="${itemHref(ch, it)}"><span class="ic">${done ? ICO.check : ICO[it.kind]}</span><span class="ti">${esc(it.title)}<small>${ptag(ch)}<span>${KIND[it.kind]}</span>${it.meta[0] ? `<span>${esc(it.meta[0])}</span>` : ''}</small></span><span class="rt">${right || fmtH(it.hours)}</span></a>`;
  }
  // A move as a card in the conversation.
  function card(ch, it, why = true) {
    const done = isDone(ch, it);
    if (isSkipped(ch, it)) return '';
    let media = `<span class="ico">${ICO[it.kind]}</span>`;
    if (it.thumb) media = `<img class="thumb" loading="lazy" src="${esc(it.thumb)}" alt="">`;
    else if (it.kind === 'talk') media = faceOf(it, 'face');
    else if (it.logo) media = `<span class="logo sm has"><img src="${esc(it.logo)}" alt="" onload="this.classList.add('ok')"><span class="mono">${esc(initials(it.title))}</span></span>`;
    const href = itemHref(ch, it);
    return `<div class="lw-card ${done ? 'done' : ''}" data-id="${it.id}">
      <a class="med" href="${href}">${media}</a>
      <div class="bd"><a class="ti" href="${href}">${esc(it.title)}</a><div class="m">${tag(KIND[it.kind])}${it.meta.filter(Boolean).map((m) => `<span>${esc(m)}</span>`).join('')}<span>${fmtH(it.hours)}</span></div>${why && it.why ? `<div class="why">${esc(it.why)}</div>` : ''}</div>
      <div class="ops"><button data-act="done" class="${done ? 'on' : ''}" title="Mark done">${ICO.check}</button>${it.kind !== 'coach' ? '<button data-act="skip">skip</button>' : ''}${['watch', 'read', 'talk'].includes(it.kind) ? '<button data-act="swap">swap</button>' : ''}</div>
    </div>`;
  }
  const msg = (html, me = false, t = '') => `<div class="cc-msg ${me ? 'me' : 'bot'}"><div class="txt">${html}</div>${t ? `<span class="t">${esc(t)}</span>` : ''}</div>`;
  const act = (summary, body = '') => `<details class="cc-act"><summary>${ICO.chev}<span>${summary}</span></summary>${body ? `<div class="ab">${body}</div>` : ''}</details>`;

  // -------------------------------------------------------------- sidebar
  function renderSide(route) {
    const on = (k) => route.view === k ? 'active' : '';
    const purs = S.pursuits.map((c) => `<a href="#/p/${c.id}" class="${(route.view === 'p' || route.view === 'i') && route.id === c.id ? 'active' : ''}" title="${esc(field(c.field).name)}"><i class="ring" style="--p:${pct(c)}"></i><span class="nm">${esc(c.name)}</span><span class="mt">${pct(c)}%</span></a>`).join('');
    const ib = (k, label, icon) => `<a href="#/${k}" class="${on(k)}" title="${label}" aria-label="${label}">${icon}</a>`;
    $('#side').innerHTML = `
      <a class="lw-brand" href="/" aria-label="Frontier Concepts home"><span class="brand-mark"><svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="6" fill="#141414" stroke="#2a2a2a"/><g stroke="#ffffff" stroke-opacity=".22" stroke-width=".8" fill="none"><path d="M6 2v28"/><path d="M10 2v28"/><path d="M14 2v28"/><path d="M18 2v28"/><path d="M22 2v28"/><path d="M26 2v28"/><path d="M2 6h28"/><path d="M2 10h28"/><path d="M2 14h28"/><path d="M2 18h28"/><path d="M2 22h28"/><path d="M2 26h28"/></g><circle cx="16" cy="16" r="11" stroke="#ffffff" stroke-width="1.1" fill="none"/></svg></span><span class="brand-text">frontier <span class="brand-tv">concepts.</span></span></a>
      <span class="lw-demo-tag">Learn with AI · demo</span>
      <nav class="lw-nav top"><a href="#/home" class="${on('home')}">${ICO.home}<span class="nm">Home</span></a><a href="#/discover" class="${on('discover')}">${ICO.discover}<span class="nm">Discover</span></a><a href="#/chat" class="${on('chat')}">${ICO.bot}<span class="nm">Assistant</span></a></nav>
      <h3>Pursuits</h3>
      <nav class="lw-nav">${purs}<a href="#/new" class="new ${on('new')}">${ICO.plus}<span class="nm">New pursuit</span></a></nav>
      <div class="lw-side-bottom">
        <div class="lw-icons">${ib('calendar', 'Calendar', ICO.cal)}${ib('library', 'Library', ICO.lib)}${ib('tasks', 'Tasks', ICO.task)}<button id="theme-btn" title="Toggle dark mode" aria-label="Toggle dark mode">${ICO.sun}</button><button id="reset" title="Reset the demo" aria-label="Reset the demo">${ICO.trash}</button></div>
        <div class="lw-user"><span class="av">Y</span><span class="nm"><b>You</b><small>Local demo · nothing leaves the browser</small></span></div>
      </div>`;
    $('#theme-btn').addEventListener('click', () => { const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', next); store.set('fa-theme', next); });
    $('#reset').addEventListener('click', () => { if (confirm('Clear every pursuit, application and note in this demo?')) { for (const k of Object.keys(S)) delete S[k]; S.pursuits = []; S.setup = {}; S.applied = {}; S.checks = {}; S.notes = {}; S.prefs = {}; S.chat = []; save(); location.hash = '#/new'; } });
  }

  // ----------------------------------------------------------------- home
  function renderHome() {
    if (!S.pursuits.length) {
      $('#main').innerHTML = `<div class="lw-page lw-hero"><h1>Hi. What do you want to get good at?</h1><p class="sub">A pursuit is one subject you build expertise in: pick the field, how long you have and how much of each week you can give it. The assistant lays out the path from the catalogue, week by week, and adjusts as you go.</p><div class="acts"><a class="pill-btn primary" href="#/new">Start a pursuit →</a><a class="pill-btn" href="#/discover">Browse Discover</a></div>
        <div class="lw-hero-kinds">${Object.entries(KIND).map(([k, v]) => `<span>${ICO[k]}${v}</span>`).join('')}</div></div>`;
      $('#rail').innerHTML = '';
      return;
    }
    const today = midnight(new Date());
    const all = S.pursuits.flatMap(dated);
    const todays = all.filter((x) => sameDay(x.date, today));
    const horizon = new Date(today); horizon.setDate(horizon.getDate() + 14);
    const upcoming = all.filter((x) => x.date > today && x.date <= horizon).sort((a, b) => a.date - b.date);
    const earlier = all.filter((x) => x.date < today).sort((a, b) => b.date - a.date).slice(0, 24);
    const nextUp = upcoming[0];
    const hrs = (xs) => fmtH(xs.reduce((a, x) => a + x.it.hours, 0));
    const tomorrow = fmtDay(new Date(today.getTime() + 864e5));
    let html = `<div class="lw-page home"><h1>Coming up</h1>
      <div class="lw-up"><div class="date"><b>${today.getDate()}</b><span>${today.toLocaleDateString(undefined, { month: 'long' })}<i class="live"></i><br>${DAY[(today.getDay() + 6) % 7]}</span></div>
        <div class="up-body">${todays.length ? `<div class="up-head">${todays.length} session${todays.length === 1 ? '' : 's'} today · ${hrs(todays)}</div>${todays.map((x) => row(x.ch, x.it)).join('')}` : `<div class="up-empty">${ICO.cal}<b>No sessions today</b><span>${nextUp ? `Next: ${fmtDay(nextUp.date)} · ${KIND[nextUp.it.kind]} · ${esc(nextUp.it.title)}` : 'Nothing scheduled in the next two weeks.'}</span><a class="pill-btn" href="#/calendar">Open calendar</a></div>`}</div></div>`;
    let lastKey = '';
    for (const x of upcoming) { const k = fmtDay(x.date); if (k !== lastKey) { html += `<div class="lw-group"><b>${k === tomorrow ? 'Tomorrow' : k}</b>${k === tomorrow ? `<span>${k}</span>` : ''}</div>`; lastKey = k; } html += row(x.ch, x.it); }
    if (earlier.length) {
      html += `<div class="lw-group earlier"><b>Earlier</b><span>${earlier.filter((x) => isDone(x.ch, x.it)).length} of ${earlier.length} done</span></div>`;
      lastKey = '';
      for (const x of earlier) { const k = fmtDay(x.date); if (k !== lastKey) { html += `<div class="lw-day">${k}</div>`; lastKey = k; } html += row(x.ch, x.it, isDone(x.ch, x.it) ? 'done' : 'missed'); }
    }
    $('#main').innerHTML = html + '</div>';
    $('#rail').innerHTML = railPursuits();
  }

  // ---------------------------------------------------------------- setup
  function renderSetup() {
    const st = S.setup;
    st.field = st.field || 'quantum'; st.months = st.months || 6; st.load = st.load || 'minimal';
    const f = field(st.field);
    const P = pools(st.field, st.topic);
    const weeks = Math.round(st.months * 4.33), hours = weeks * LOADS[st.load].hours;
    $('#main').innerHTML = `<div class="lw-page lw-setup">
      <h1>New pursuit</h1>
      <p class="sub">One subject, taken seriously. Tell the assistant what you want to get into, how long you have and how much of each week you can give it. It builds the path from the catalogue and adjusts as you go.</p>
      <div class="lw-step"><div class="lbl"><span class="n">01</span> Field</div>
        <div class="lw-chips" id="fields">${FIELDS.map((x) => chip(x.label, x.slug === st.field, `data-field="${x.slug}"`)).join('')}</div>
        <input class="lw-text" id="topic" placeholder="Narrow it: e.g. error correction, legged locomotion, protein design" value="${esc(st.topic || '')}">
      </div>
      <div class="lw-step"><div class="lbl"><span class="n">02</span> Duration</div>
        <div class="lw-chips" id="months">${DURATIONS.map((m) => chip(`${m} months`, m === st.months, `data-months="${m}"`)).join('')}</div></div>
      <div class="lw-step"><div class="lbl"><span class="n">03</span> Load</div>
        <div class="lw-chips" id="loads">${Object.entries(LOADS).map(([k, v]) => chip(v.label, k === st.load, `data-load="${k}"`, v.sub)).join('')}</div></div>
      <div class="lw-summary">${kv([['Field', esc(f.name)], ['Weeks', weeks], ['Hours', `≈ ${hours}`], ['From the catalogue', `${P.videos.length} videos · ${P.courses.length} courses · ${P.programs.length} programs · ${P.research.length} papers · ${P.people.length} people`]])}</div>
      <a class="pill-btn primary" id="build" href="#">Build my path →</a>
    </div>`;
    const HOW = { watch: 'talks and lectures from Videos', read: 'papers and textbooks from Research', take: 'one course per phase from Courses', build: 'projects sized to your load', talk: 'people from the People section', attend: 'a program from Programs, or one you apply to in Discover', coach: 'a 30-minute check-in every week' };
    $('#rail').innerHTML = fold('How it works', `<ul class="fl">${Object.entries(KIND).map(([k, v]) => `<li>${ICO[k]}<b>${v}</b><span>${HOW[k]}</span></li>`).join('')}</ul>`)
      + fold('Phases', `<ul class="fl">${PHASES.map(([n, fr]) => `<li><b>${n}</b><span>${Math.round(fr * 100)}% of the weeks</span></li>`).join('')}</ul>`);
    const on = (sel, key, attr, cast) => $(sel).addEventListener('click', (e) => { const a = e.target.closest('.chip'); if (!a) return; e.preventDefault(); st[key] = cast(a.dataset[attr]); save(); renderSetup(); });
    on('#fields', 'field', 'field', String); on('#months', 'months', 'months', Number); on('#loads', 'load', 'load', String);
    $('#topic').addEventListener('change', (e) => { st.topic = e.target.value.trim(); save(); renderSetup(); });
    $('#build').addEventListener('click', (e) => {
      e.preventDefault();
      const topic = ($('#topic').value || '').trim(); st.topic = topic;
      const name = slugify(topic || f.name) || f.slug;
      const id = `${name}-${Date.now().toString(36)}`;
      S.pursuits.push({ id, name, field: st.field, topic, months: st.months, load: st.load, created: Date.now(), done: {}, skipped: {}, log: [] }); save();
      location.hash = `#/p/${id}`;
    });
  }

  // -------------------------------------------------------------- pursuit
  // The stream is a conversation the assistant leads. Each week it opens with a check-in (questions
  // with inline choices), adapts the plan to the answers, posts the moves, and answers every Done,
  // Skip and Swap. Entries: {week, t, me, html} · {sys, text} · {ui:{type,key,q,options…}, answer}.
  const now = () => new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const post = (ch, w, e) => { ch.log = ch.log || []; ch.log.push({ week: w, t: now(), ...e }); return ch.log[ch.log.length - 1]; };
  const say = (ch, w, html) => post(ch, w, { html });
  const ask = (ch, w, ui) => post(ch, w, { ui, html: ui.type === 'choice' ? '' : `<p>${ui.q}</p>` });
  const first = (p) => (p.name || '').split(' ')[0];
  const CHECKIN = (f) => [
    { key: 'q0', q: `What do you already know about ${f.name.toLowerCase()}, honestly?`, options: ['Nothing yet', 'The basics', 'I have built things', 'I work in it'] },
    { key: 'q1', q: 'What do you want to be able to do by the end?', options: ['Build something real', 'Read research fluently', 'Get into a program', 'Change what I work on'] },
    { key: 'q2', q: 'What will get in the way?', options: ['Time', 'The math', 'Hardware or tools', 'Staying with it'] },
  ];
  function pursuitHead(ch, extra = '') {
    const plan = planOf(ch), f = field(ch.field), L = LOADS[ch.load], cur = weekOfToday(ch);
    return `<header class="lw-head"><a class="back" href="#/home" title="Home">${ICO.back}</a><h1>${esc(ch.name)}</h1>
      <span class="meta"><span>${esc(f.label)}</span><span>${ch.months} mo</span><span>${L.label} · ${L.hours} h/wk</span><span>wk ${cur}/${plan.weeks}</span></span>
      <span class="bar" title="${pct(ch)}% of planned hours done"><i style="width:${pct(ch)}%"></i></span>${extra}</header>`;
  }
  // The assistant opens a week the first time it is shown.
  function ensureWeek(ch, w) {
    ch.flow = ch.flow || {};
    if (ch.flow[w]) return;
    ch.flow[w] = { ck: {} };
    const plan = planOf(ch), f = field(ch.field), L = LOADS[ch.load], phase = phaseOfWeek(ch, w);
    if (w === 1) {
      say(ch, w, `<p>Hi. Week 1 of <b>${esc(f.name)}</b>${ch.topic ? `, ${esc(ch.topic)}` : ''}: ${L.hours} hours, ${weekItems(ch, w).length} moves, Foundations.</p>`);
      ask(ch, w, { type: 'choice', key: 'start', q: 'Where do you want to start?', options: ['Just give me the first move', 'Lay out the whole week', 'A quick check-in first'] });
    } else {
      const prev = weekItems(ch, w - 1), dn = prev.filter((i) => isDone(ch, i));
      say(ch, w, `<p>Week ${w}, <b>${esc(phase)}</b>. Last week you finished ${dn.length} of ${prev.length} moves, ${fmtH(dn.reduce((a, i) => a + i.hours, 0))}.</p>`);
      ask(ch, w, { type: 'choice', key: 'went', q: 'How did it go?', options: ['Most of it landed', 'About half', 'Not much, honestly'] });
    }
  }
  // What the assistant does with an answer.
  function onAnswer(ch, e, value) {
    const w = e.week, f = field(ch.field), P = pools(ch.field, ch.topic), plan = planOf(ch), fl = ch.flow[w];
    e.answer = value;
    const key = e.ui.key;
    const moves = () => post(ch, w, { ui: { type: 'moves', week: w }, html: '' });
    const firstMove = () => { const n = weekItems(ch, w).find((i) => !isDone(ch, i) && i.kind !== 'coach'); return n ? `<p>Start with <a href="${itemHref(ch, n)}">${esc(n.title)}</a>, ${fmtH(n.hours)}. ${esc(n.why || '')}</p>` : '<p>Nothing left this week.</p>'; };
    if (key === 'start') {
      if (/first move/i.test(value)) { say(ch, w, firstMove()); ask(ch, w, { type: 'choice', key: 'more', q: 'When you are done with it:', options: ['Show me the rest of the week', 'Who should I talk to about it?', 'A quick check-in'] }); }
      else if (/whole week/i.test(value)) { moves(); ask(ch, w, { type: 'choice', key: 'after', q: 'Does the week fit?', options: ['Yes, start me off', 'Lighten it', 'Put it on my calendar'] }); }
      else ask(ch, w, { type: 'choice', ...CHECKIN(f)[0] });
      return;
    }
    if (key === 'more') {
      if (/rest of the week/i.test(value)) { moves(); ask(ch, w, { type: 'choice', key: 'after', q: 'Does the week fit?', options: ['Yes, start me off', 'Lighten it', 'Put it on my calendar'] }); }
      else if (/talk/i.test(value)) ask(ch, w, { type: 'experts', key: 'experts', q: `Three people whose work is the primary source here. Connect and I draft the message.`, options: P.people.slice(0, 3).map((p) => p.id) });
      else ask(ch, w, { type: 'choice', ...CHECKIN(f)[0] });
      return;
    }
    if (key === 'after') {
      if (/lighten/i.test(value)) ask(ch, w, { type: 'range', key: 'hours', q: 'How many hours do you have this week?', min: 2, max: LOADS[ch.load].hours, value: Math.max(2, Math.round(hoursOf(ch, w) * 0.6)) });
      else if (/calendar/i.test(value)) { const L = LOADS[ch.load]; post(ch, w, { sys: true, text: `Scheduled on ${L.days.map((d) => DAY[d]).join(', ')} · <a href="#/calendar">open the calendar</a>` }); say(ch, w, firstMove()); }
      else say(ch, w, firstMove());
      return;
    }
    if (key === 'q0' || key === 'q1') { fl.ck[key] = value; const q = CHECKIN(f)[key === 'q0' ? 1 : 2]; ask(ch, w, { type: 'choice', ...q }); return; }
    if (key === 'q2') {
      fl.ck.q2 = value; const its = weekItems(ch, w), notes = [];
      const a0 = fl.ck.q0 || '', a1 = fl.ck.q1 || '';
      if (/work in it|built/.test(a0)) { const tb = its.find((i) => i.kind === 'read'); if (tb) { ch.skipped[tb.id] = true; notes.push(`you know the basics, so I dropped the first textbook chapter`); } const p = P.research.find((x) => x.kind === 'Paper' && !plan.items.some((i) => i.ref === x.id)); if (p) { addItem(ch, w, 'read', p, 3, p.note); notes.push(`put a primary source in its place`); } }
      if (/research/i.test(a1)) { notes.push(`papers come in from week 2 rather than week 4`); }
      if (/program/i.test(a1)) { notes.push(`I will bring the program application forward and keep a project running for it`); }
      if (/Build/.test(a1)) { notes.push(`every phase gets a build block; the capstone starts in Practice`); }
      if (/Time/.test(value)) { const drop = its.filter((i) => i.kind === 'watch' && !isSkipped(ch, i)).slice(-1)[0]; if (drop) { ch.skipped[drop.id] = true; notes.push(`time is the risk, so this week is ${fmtH(hoursOf(ch, w))} instead of ${LOADS[ch.load].hours} h`); } }
      if (/math/i.test(value)) { const ln = P.research.find((x) => /Lecture notes|Textbook/.test(x.kind) && !plan.items.some((i) => i.ref === x.id)); if (ln) { addItem(ch, w + 1, 'read', ln, 3, 'Lecture notes to shore up the math; read the first two sections.'); notes.push(`I added lecture notes next week to shore up the math`); } }
      if (/Hardware/.test(value)) notes.push(`everything in Foundations runs in a browser or a notebook; hardware comes in Practice`);
      if (/Staying/.test(value)) notes.push(`I will check in twice a week instead of once`);
      const coach = its.find((i) => i.kind === 'coach'); if (coach) ch.done[coach.id] = true;
      say(ch, w, `<p>Got it${notes.length ? `: ${notes.join('; ')}.` : '.'}</p>`);
      moves();
      say(ch, w, firstMove());
      return;
    }
    if (key === 'went') {
      const its = weekItems(ch, w);
      if (/Not much/.test(value)) { const carry = weekItems(ch, w - 1).find((i) => i.kind === 'read' && !isDone(ch, i)); const drop = its.filter((i) => i.kind === 'watch').slice(-1)[0]; if (drop) ch.skipped[drop.id] = true; if (carry) addItem(ch, w, 'read', refOf(carry) || { id: carry.ref, name: carry.title, url: carry.url, kind: carry.meta[1], note: carry.why }, carry.hours, 'Carried over from last week; this is the one that matters.'); say(ch, w, `<p>Then we repair rather than pile on: I carried the reading over, dropped one talk, and kept the main block. ${fmtH(hoursOf(ch, w))} this week.</p>`); }
      else if (/half/.test(value)) { const drop = its.filter((i) => i.kind === 'watch').slice(-1)[0]; if (drop) ch.skipped[drop.id] = true; say(ch, w, `<p>Half is fine. I trimmed one talk so the week fits: ${fmtH(hoursOf(ch, w))}.</p>`); }
      else say(ch, w, `<p>Good. Same pace, one step denser.</p>`);
      const coach = its.find((i) => i.kind === 'coach'); if (coach) ch.done[coach.id] = true;
      post(ch, w, { ui: { type: 'moves', week: w }, html: '' });
      return;
    }
    if (key.startsWith('rate:')) {
      const id = key.slice(5), it = plan.items.find((i) => i.id === id);
      ch.prefs = ch.prefs || {};
      if (/easy/i.test(value)) { ch.prefs.level = 'up'; say(ch, w, `<p>Too easy: denser picks from here. ${nextLine(ch, w)}</p>`); }
      else if (/hard/i.test(value)) { ch.prefs.level = 'down'; const p = P.people[0]; say(ch, w, `<p>Too hard is useful: that is where the gap is. Write down the two terms that lost you; ${p ? `${esc(first(p))}'s work is where to look them up, and you can message ${esc(first(p))} from Connect on the right` : 'they are next week\'s reading'}. ${nextLine(ch, w)}</p>`); }
      else say(ch, w, `<p>${it && it.kind === 'read' ? 'Add one paragraph to your log before you move on.' : 'Good.'} ${nextLine(ch, w)}</p>`);
      return;
    }
    if (key === 'hours') {
      const h = Number(value); let left = h; const its = weekItems(ch, w).filter((i) => !isDone(ch, i));
      const keep = its.filter((i) => ['coach', 'take', 'build'].includes(i.kind)); keep.forEach((i) => { left -= i.hours; });
      const dropped = [];
      for (const i of its.filter((i) => !keep.includes(i))) { if (i.hours <= left) left -= i.hours; else { ch.skipped[i.id] = true; dropped.push(i.title); } }
      say(ch, w, `<p>${h} hours it is. ${dropped.length ? `I dropped ${dropped.map((t) => `<b>${esc(t)}</b>`).join(' and ')} and kept the block that compounds.` : 'Everything still fits.'} The week is now ${fmtH(hoursOf(ch, w, (i) => !isDone(ch, i)))}.</p>`);
      return;
    }
    if (key.startsWith('pick:')) {
      const id = key.slice(5), it = plan.items.find((i) => i.id === id); if (!it) return;
      const pool = it.kind === 'watch' ? P.videos : it.kind === 'read' ? P.research : P.people; const nxt = pool.find((x) => x.id === value); if (!nxt) return;
      swapTo(ch, it, nxt);
      say(ch, w, `<p>Swapped in <a href="${itemHref(ch, it)}">${esc(it.title)}</a>.</p>`);
    }
  }
  function nextLine(ch, w) { const n = weekItems(ch, w).find((i) => !isDone(ch, i)); return n ? `Next: <a href="${itemHref(ch, n)}">${esc(n.title)}</a> (${fmtH(n.hours)}).` : 'That was the last move of the week.'; }
  function addItem(ch, w, kind, src, hours, why) {
    const plan = planOf(ch);
    const it = kind === 'read' ? { id: `${ch.id}-${w}-x${plan.items.length}`, week: w, kind, hours, ref: src.id, title: src.name, url: src.url, meta: [src.authors ? `${src.authors} · ${src.year}` : String(src.year || ''), src.kind], why }
      : { id: `${ch.id}-${w}-x${plan.items.length}`, week: w, kind: 'talk', hours: 1, ref: src.id, title: src.name, url: src.url, meta: [src.role, src.org].filter(Boolean), why, face: src.logo || '' };
    plan.items.push(it); ch.extra = ch.extra || []; ch.extra.push(it); return it;
  }
  function swapTo(ch, it, nxt) {
    if (it.kind === 'watch') Object.assign(it, { ref: nxt.id, title: nxt.title, url: `/videos/#/w/${nxt.id}`, meta: [nxt.channel, fmtH(nxt.duration / 3600), fmtN(nxt.views || 0) + ' views'], thumb: `https://i.ytimg.com/vi/${nxt.id}/mqdefault.jpg`, hours: Math.round((nxt.duration / 3600 + 0.25) * 2) / 2, why: 'Swapped in.' });
    else if (it.kind === 'read') Object.assign(it, { ref: nxt.id, title: nxt.name, url: nxt.url, meta: [nxt.authors ? `${nxt.authors} · ${nxt.year}` : String(nxt.year), nxt.kind], why: nxt.note });
    else Object.assign(it, { ref: nxt.id, title: nxt.name, url: nxt.url, meta: [nxt.role, nxt.org].filter(Boolean), face: nxt.logo || '', why: 'Swapped in.' });
    ch.swaps = ch.swaps || {}; ch.swaps[it.id] = { ref: it.ref, title: it.title, url: it.url, meta: it.meta, thumb: it.thumb, face: it.face, hours: it.hours, why: it.why };
  }
  // Card actions go through the conversation.
  function onCard(ch, it, action) {
    const w = weekOfToday(ch), P = pools(ch.field, ch.topic), plan = planOf(ch);
    if (action === 'done') {
      ch.done[it.id] = !ch.done[it.id];
      if (!ch.done[it.id]) return;
      const its = weekItems(ch, w), dn = its.filter((i) => isDone(ch, i)).length;
      if (dn === its.length) { say(ch, w, `<p>Week ${w} complete: ${fmtH(hoursOf(ch, w))}. ${w < plan.weeks ? `Week ${w + 1} is <b>${esc(phaseOfWeek(ch, w + 1))}</b>; it opens on ${fmtDate(weekDate(ch, w + 1))}. Take the weekend.` : 'That was the last week. Publish the capstone.'}</p>`); return; }
      if (['watch', 'read'].includes(it.kind)) ask(ch, w, { type: 'choice', key: `rate:${it.id}`, q: `Done: <b>${esc(it.title)}</b>. ${dn} of ${its.length} this week. How was it?`, options: ['Too easy', 'About right', 'Too hard'] });
      else say(ch, w, `<p>Done: <b>${esc(it.title)}</b>. ${dn} of ${its.length} this week, ${fmtH(hoursOf(ch, w, (i) => isDone(ch, i)))} of ${fmtH(hoursOf(ch, w))}. ${nextLine(ch, w)}</p>`);
    } else if (action === 'skip') {
      ch.skipped[it.id] = true; post(ch, w, { sys: true, text: `Skipped ${esc(it.title)} · ${fmtH(hoursOf(ch, w))} left in the week` });
    } else if (action === 'swap') {
      const used = new Set(plan.items.map((x) => x.ref));
      const pool = (it.kind === 'watch' ? P.videos : it.kind === 'read' ? P.research : P.people).filter((x) => !used.has(x.id)).slice(0, 3);
      if (!pool.length) { say(ch, w, '<p>Nothing left in the catalogue to swap in for this one.</p>'); return; }
      ask(ch, w, { type: 'pick', key: `pick:${it.id}`, q: `Three alternatives to <b>${esc(it.title)}</b>. Pick one, or keep it.`, options: pool.map((x) => ({ id: x.id, title: x.title || x.name, sub: it.kind === 'watch' ? `${x.channel} · ${fmtH(x.duration / 3600)}` : it.kind === 'read' ? `${x.authors || ''} · ${x.year} · ${x.kind}` : `${x.role || ''}`, thumb: it.kind === 'watch' ? `https://i.ytimg.com/vi/${x.id}/mqdefault.jpg` : '', face: x.logo || '', note: x.note || '' })) });
    }
  }
  // Free text from the composer: answers a pending question, or an intent.
  function reply(ch, text) {
    const plan = planOf(ch), cur = weekOfToday(ch), f = field(ch.field), P = pools(ch.field, ch.topic);
    const pending = (ch.log || []).filter((e) => e.week === cur && e.ui && e.ui.type === 'choice' && e.answer == null).slice(-1)[0];
    post(ch, cur, { me: true, html: `<p>${esc(text)}</p>` });
    const t = text.toLowerCase();
    if (pending) { onAnswer(ch, pending, text); return finish(ch); }
    const week = weekItems(ch, cur).filter((i) => !isDone(ch, i));
    if (/show the week|the week|plan/.test(t)) { post(ch, cur, { ui: { type: 'moves', week: cur }, html: '' }); }
    else if (/less time|busy|travel|no time|lighter|hours/.test(t)) ask(ch, cur, { type: 'range', key: 'hours', q: 'How many hours do you have this week?', min: 2, max: LOADS[ch.load].hours, value: Math.max(2, Math.round(hoursOf(ch, cur, (i) => !isDone(ch, i)) * 0.6)) });
    else if (/deeper|more|harder|advanced|theory/.test(t)) { const p = P.research.find((x) => !plan.items.some((i) => i.ref === x.id)); if (p) { const it = addItem(ch, cur, 'read', p, 3, p.note); say(ch, cur, `<p>Added a primary source to this week: <a href="${itemHref(ch, it)}">${esc(p.name)}</a>. ${esc(p.note)}</p>`); } else say(ch, cur, '<p>You have read everything in the catalogue for this field. Time to write something.</p>'); }
    else if (/who|people|talk|expert|mentor|connect/.test(t)) ask(ch, cur, { type: 'experts', key: 'experts', q: `Three people whose work is the primary source for ${esc(f.name.toLowerCase())}. Connect with one and I will draft the message; the full list is under Connect on the right.`, options: P.people.slice(0, 3).map((p) => p.id) });
    else if (/first|start|begin|where/.test(t)) { const n = week[0]; say(ch, cur, n ? `<p>Start with <a href="${itemHref(ch, n)}">${esc(n.title)}</a> (${fmtH(n.hours)}). ${esc(n.why || '')}</p>` : '<p>This week is done. Next week opens on Monday.</p>'); }
    else if (/next|then|after/.test(t)) { const nw = Math.min(plan.weeks, cur + 1); say(ch, cur, `<p>Week ${nw} is <b>${esc(phaseOfWeek(ch, nw))}</b>, ${fmtH(hoursOf(ch, nw))}: ${weekItems(ch, nw).map((i) => `${KIND[i.kind].toLowerCase()} <b>${esc(i.title)}</b>`).join(', ')}. It opens on ${fmtDate(weekDate(ch, nw))}; the <a href="#/calendar">calendar</a> has every week.</p>`); }
    else if (/done|finished|complete/.test(t)) say(ch, cur, week.length ? `<p>${week.length} move${week.length === 1 ? '' : 's'} left this week, ${fmtH(week.reduce((a, i) => a + i.hours, 0))}. Mark them done on the cards and I will reshape next week around what landed.</p>` : '<p>Week complete. Next week opens on Monday; take the weekend.</p>');
    else say(ch, cur, `<p>Noted. ${week.length} move${week.length === 1 ? '' : 's'} left this week. Ask me to go deeper, to lighten the week, or for people to talk to, and I will change the path.</p>`);
    finish(ch);
  }
  function connect(ch, personId) {
    const p = LIB.people.find((x) => x.id === personId); if (!p) return;
    const w = weekOfToday(ch), plan = planOf(ch);
    let it = plan.items.find((i) => i.kind === 'talk' && i.ref === p.id && i.week === w && !isSkipped(ch, i));
    if (!it) it = addItem(ch, w, 'talk', p, 1, `You asked to connect; ${first(p)}'s work is the primary source for what you are doing this week.`);
    post(ch, w, { sys: true, text: `Connecting with ${esc(p.name)}: <a href="${itemHref(ch, it)}">the draft is ready</a>` });
    save(); location.hash = itemHref(ch, it);
  }
  const finish = (ch) => { save(); renderPursuit(ch); const m = $('#main'); m.scrollTop = m.scrollHeight; };

  // ---- rendering
  function moveRow(ch, it) {
    const done = isDone(ch, it);
    return `<div class="cc-move ${done ? 'done' : ''}" data-id="${it.id}"><button data-act="done" class="ck ${done ? 'on' : ''}" title="Mark done">${ICO.check}</button><span class="ic">${ICO[it.kind]}</span><a class="ti" href="${itemHref(ch, it)}">${esc(it.title)}</a><span class="m">${esc(KIND[it.kind])}${it.meta[0] ? ` · ${esc(it.meta[0])}` : ''}</span><span class="h">${fmtH(it.hours)}</span><span class="ops">${it.kind !== 'coach' ? '<button data-act="skip">skip</button>' : ''}${['watch', 'read', 'talk'].includes(it.kind) ? '<button data-act="swap">swap</button>' : ''}</span></div>`;
  }
  const movesList = (ch, w) => `<div class="cc-moves">${weekItems(ch, w).map((i) => moveRow(ch, i)).join('')}</div>`;
  const letters = 'ABCDEFG';
  function genUI(ch, e, idx) {
    const u = e.ui;
    if (u.type === 'moves') return movesList(ch, u.week);
    if (e.answer != null) return (u.type === 'choice' ? msg(`<p>${u.q}</p>`) : '') + (u.type === 'pick' ? '' : msg(`<p>${esc(e.answer)}</p>`, true));
    if (u.type === 'choice') return `<div class="gu gu-choice" data-idx="${idx}"><b>${u.q}</b>${u.options.map((o, i) => `<a data-opt="${esc(o)}"><i>${letters[i]}</i>${esc(o)}</a>`).join('')}<a class="else" data-focus><i>${letters[u.options.length]}</i>Something else</a></div>`;
    if (u.type === 'range') return `<div class="gu gu-range" data-idx="${idx}"><input type="range" min="${u.min}" max="${u.max}" step="1" value="${u.value}"><output>${u.value} h</output><button class="pill-btn primary" data-set>Set</button></div>`;
    if (u.type === 'pick') return `<div class="gu gu-pick" data-idx="${idx}">${u.options.map((o) => `<div class="gu-opt"><div class="med">${o.thumb ? `<img class="thumb" src="${esc(o.thumb)}" alt="">` : o.face ? `<img class="face" src="${esc(o.face)}" alt="">` : `<span class="ico">${ICO.read}</span>`}</div><div class="bd"><b>${esc(o.title)}</b><small>${esc(o.sub)}</small>${o.note ? `<span>${esc(o.note)}</span>` : ''}</div><button class="chip small" data-opt="${esc(o.id)}">Pick</button></div>`).join('')}<a class="chip small" data-opt="">Keep it</a></div>`;
    if (u.type === 'experts') return `<div class="gu gu-experts" data-idx="${idx}">${u.options.map((id) => LIB.people.find((p) => p.id === id)).filter(Boolean).map((p) => `<div class="gu-opt"><div class="med">${faceOf(p)}</div><div class="bd"><b>${esc(p.name)}</b><small>${esc(p.role || '')}${p.org ? ` · ${esc(p.org)}` : ''}</small><span>${esc(p.note || '')}</span></div><button class="chip small" data-connect="${esc(p.id)}">Connect</button></div>`).join('')}</div>`;
    return '';
  }
  function renderPursuit(ch) {
    const plan = planOf(ch), cur = weekOfToday(ch);
    for (let w = 1; w <= cur; w++) ensureWeek(ch, w);
    let html = pursuitHead(ch) + '<div class="cc-stream">';
    const picked = (w) => { const n = {}; weekItems(ch, w).forEach((i) => { n[i.kind] = (n[i.kind] || 0) + 1; }); return Object.entries(n).map(([k, c]) => `${c} ${KIND[k].toLowerCase()}`).join(', '); };
    for (let w = 1; w < cur; w++) {
      const its = weekItems(ch, w), done = its.filter((i) => isDone(ch, i)).length;
      html += act(`Week ${w} · ${phaseOfWeek(ch, w)} · ${fmtH(hoursOf(ch, w))} · ${picked(w)} · ${done}/${its.length} done`, movesList(ch, w));
    }
    html += `<div class="cc-week cur"><b>Week ${cur}</b><span>${fmtDate(weekDate(ch, cur))} – ${fmtDate(weekDate(ch, cur, 6))}</span><span class="ph">${phaseOfWeek(ch, cur)}</span><span>${fmtH(hoursOf(ch, cur))}</span></div>`;
    (ch.log || []).forEach((e, idx) => {
      if (e.week !== cur) return;
      if (e.sys) html += act(e.text);
      else if (e.me) html += msg(e.html, true, e.t);
      else if (e.ui) html += (e.html ? msg(e.html) : '') + genUI(ch, e, idx);
      else html += msg(e.html);
    });
    html += '</div>';
    const pending = (ch.log || []).some((e) => e.week === cur && e.ui && e.ui.type === 'choice' && e.answer == null);
    html += `<div class="cc-compose"><div class="cc-quick">${(pending ? [] : ['Show the week', 'Who should I talk to?', 'Less time this week', 'Go deeper']).map((q) => chip(q, false, `data-q="${esc(q)}"`)).join('')}</div>
      <form id="say" class="cc-box"><button type="button" class="plus" title="Attach (demo)">${ICO.plus}</button><textarea id="say-in" rows="1" placeholder="${pending ? 'Type your answer…' : 'Tell the assistant how your week looks, or ask for something…'}"></textarea><button class="go" type="submit" title="Send">${ICO.enter}</button></form>
      <div class="cc-status"><span>Scripted assistant · local only</span><span>${esc(ch.name)} · week ${cur} of ${plan.weeks}</span></div></div>`;
    $('#main').innerHTML = html;
    $('#rail').innerHTML = railPursuit(ch);
    save();
    const m = $('#main'); m.scrollTop = m.scrollHeight;
    $('.cc-stream').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]'), opt = e.target.closest('[data-opt]'), set = e.target.closest('[data-set]'), con = e.target.closest('[data-connect]');
      if (b) { const it = plan.items.find((x) => x.id === b.closest('[data-id]').dataset.id); if (it) { onCard(ch, it, b.dataset.act); save(); const top = m.scrollTop; renderPursuit(ch); if (b.dataset.act !== 'done' || !ch.done[it.id]) m.scrollTop = top; } return; }
      if (con) { connect(ch, con.dataset.connect); return; }
      const gu = e.target.closest('.gu'); if (!gu) return;
      const entry = ch.log[Number(gu.dataset.idx)]; if (!entry || entry.answer != null) return;
      if (e.target.closest('[data-focus]')) { e.preventDefault(); $('#say-in').focus(); return; }
      if (opt) { e.preventDefault(); if (entry.ui.type === 'pick' && !opt.dataset.opt) { entry.answer = 'Kept it.'; finish(ch); return; } onAnswer(ch, entry, opt.dataset.opt); finish(ch); }
      if (set) { onAnswer(ch, entry, gu.querySelector('input').value); finish(ch); }
    });
    $('.cc-stream').addEventListener('input', (e) => { const r = e.target.closest('.gu-range'); if (r && e.target.type === 'range') r.querySelector('output').textContent = `${e.target.value} h`; });
    $('.cc-quick').addEventListener('click', (e) => { const a = e.target.closest('[data-q]'); if (!a) return; e.preventDefault(); reply(ch, a.dataset.q); });
    $('#say').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#say-in').value.trim(); if (v) reply(ch, v); });
    $('#say-in').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#say').requestSubmit(); } });
    $('#say-in').addEventListener('input', (e) => { e.target.style.height = 'auto'; e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px'; });
  }

  // ------------------------------------------------------------ assistant
  // A general chat, not tied to a pursuit: start one, find a program, pick something to watch.
  const cpost = (e) => { S.chat.push({ t: now(), ...e }); return S.chat[S.chat.length - 1]; };
  function chatOptions() { return S.pursuits.length ? ['What should I do today?', 'Find a program to apply to', 'Something to watch tonight', 'Start another pursuit'] : ['Start a pursuit', 'Find a program to apply to', 'Something to watch tonight', 'Who should I follow?']; }
  function ensureChat() {
    if (S.chat.length) return;
    cpost({ html: `<p>Hi. I am the assistant behind every pursuit. I can start one, find a program or a person, or pick something worth an evening.</p>` });
    cpost({ ui: { type: 'choice', key: 'c', q: 'What do you want to do?', options: chatOptions() } });
  }
  function chatAnswer(text) {
    const t = text.toLowerCase();
    const pending = S.chat.filter((e) => e.ui && e.ui.type === 'choice' && e.answer == null).slice(-1)[0];
    if (pending) pending.answer = text; else cpost({ me: true, html: `<p>${esc(text)}</p>` });
    const fieldsOn = S.pursuits.length ? [...new Set(S.pursuits.map((c) => c.field))] : FIELDS.map((f) => f.slug);
    if (/start/.test(t)) { cpost({ html: '<p>Three choices and I build the path: field, duration, load.</p>' }); cpost({ sys: true, text: '<a href="#/new">Open New pursuit</a>' }); }
    else if (/program|apply|fellowship/.test(t)) { const top = PR.programs.filter((x) => OPP_FMTS.includes(x.fmt) && (x.fields || [x.field]).some((f) => fieldsOn.includes(f))).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3); cpost({ html: `<p>The three strongest in ${fieldsOn.map((f) => field(f).label).join(', ')}: ${top.map((x) => `<b>${esc(x.name)}</b> (${esc(x.provider)}, ${esc(x.fmt)})`).join(', ')}. <a href="#/discover">Discover</a> has the rest; Apply there puts it on your path.</p>` }); }
    else if (/watch|tonight|video/.test(t)) { const vids = V.filter((v) => (v.directions || []).some((d) => fieldsOn.includes(d)) && v.duration >= 1200 && v.duration <= 5400).sort((a, b) => (b.hn ? 1 : 0) - (a.hn ? 1 : 0) || (b.views || 0) - (a.views || 0)).slice(0, 3); cpost({ ui: { type: 'videos', q: 'Three for an evening, 20 to 90 minutes.', options: vids.map((v) => v.id) }, html: '<p>Three for an evening, 20 to 90 minutes.</p>' }); }
    else if (/today|do now|next/.test(t)) { const todays = S.pursuits.flatMap(dated).filter((x) => sameDay(x.date, midnight(new Date())) && !isDone(x.ch, x.it)); cpost({ html: todays.length ? `<p>Today: ${todays.map((x) => `<a href="${itemHref(x.ch, x.it)}">${esc(x.it.title)}</a> (${fmtH(x.it.hours)})`).join(', ')}.</p>` : `<p>Nothing is scheduled today. ${S.pursuits.length ? `<a href="#/p/${S.pursuits[0].id}">${esc(S.pursuits[0].name)}</a> has this week's moves` : '<a href="#/new">Start a pursuit</a> and I fill the week'}.</p>` }); }
    else if (/follow|who|people|expert/.test(t)) { const ppl = LIB.people.filter((p) => (p.fields || [p.field]).some((f) => fieldsOn.includes(f))).slice(0, 3); cpost({ ui: { type: 'experts', q: 'Three people whose work is the primary source.', options: ppl.map((p) => p.id) }, html: '<p>Three people whose work is the primary source.</p>' }); }
    else cpost({ html: '<p>I can start a pursuit, find a program or a person, or pick something to watch. Which one?</p>' });
    cpost({ ui: { type: 'choice', key: 'c', q: 'Anything else?', options: chatOptions() } });
    save(); renderChat(); const m = $('#main'); m.scrollTop = m.scrollHeight;
  }
  function renderChat() {
    ensureChat();
    let html = `<header class="lw-head"><a class="back" href="#/home" title="Home">${ICO.back}</a><h1>Assistant</h1><span class="meta"><span>${S.pursuits.length} pursuit${S.pursuits.length === 1 ? '' : 's'}</span><span>${Object.keys(S.applied).length} applications</span></span></header><div class="cc-stream">`;
    S.chat.forEach((e, idx) => {
      if (e.sys) html += act(e.text);
      else if (e.me) html += msg(e.html, true, e.t);
      else if (e.ui) {
        const u = e.ui;
        if (u.type === 'videos') html += msg(e.html) + `<div class="gu gu-pick">${u.options.map((id) => V.find((v) => v.id === id)).filter(Boolean).map((v) => `<a class="gu-opt" href="/videos/#/w/${esc(v.id)}"><div class="med"><img class="thumb" src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt=""></div><div class="bd"><b>${esc(v.title)}</b><small>${esc(v.channel)} · ${fmtH(v.duration / 3600)}</small></div></a>`).join('')}</div>`;
        else if (u.type === 'experts') html += msg(e.html) + `<div class="gu gu-experts">${u.options.map((id) => LIB.people.find((p) => p.id === id)).filter(Boolean).map((p) => `<a class="gu-opt" href="${esc(p.url)}" ${ext(p.url)}><div class="med">${faceOf(p)}</div><div class="bd"><b>${esc(p.name)}</b><small>${esc(p.role || '')}</small><span>${esc(p.note || '')}</span></div></a>`).join('')}</div>`;
        else if (e.answer != null) html += msg(`<p>${u.q}</p>`) + msg(`<p>${esc(e.answer)}</p>`, true);
        else if (idx === S.chat.length - 1) html += `<div class="gu gu-choice" data-idx="${idx}"><b>${u.q}</b>${u.options.map((o, i) => `<a data-opt="${esc(o)}"><i>${letters[i]}</i>${esc(o)}</a>`).join('')}<a class="else" data-focus><i>${letters[u.options.length]}</i>Something else</a></div>`;
      } else html += msg(e.html);
    });
    html += `</div><div class="cc-compose"><form id="say" class="cc-box"><button type="button" class="plus" title="Attach (demo)">${ICO.plus}</button><textarea id="say-in" rows="1" placeholder="Type your answer, or ask about something else…"></textarea><button class="go" type="submit" title="Send">${ICO.enter}</button></form><div class="cc-status"><span>Scripted assistant · local only</span><span>Across every pursuit</span></div></div>`;
    $('#main').innerHTML = html;
    $('#rail').innerHTML = S.pursuits.length ? railPursuits() : railApplications();
    const m = $('#main'); m.scrollTop = m.scrollHeight;
    $('.cc-stream').addEventListener('click', (e) => { const opt = e.target.closest('[data-opt]'); if (e.target.closest('[data-focus]')) { e.preventDefault(); $('#say-in').focus(); return; } if (opt) { e.preventDefault(); chatAnswer(opt.dataset.opt); } });
    $('#say').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#say-in').value.trim(); if (v) chatAnswer(v); });
    $('#say-in').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#say').requestSubmit(); } });
  }

  // ----------------------------------------------------------------- item
  // A move opened as its own session. The body changes with the format.
  function renderItem(ch, it) {
    const its = weekItems(ch, it.week), k = its.findIndex((x) => x.id === it.id);
    const prev = its[k - 1], nxt = its[k + 1], ref = refOf(it), f = field(ch.field), date = dateOf(ch, it), done = isDone(ch, it);
    const nav = `<span class="acts"><a class="ib ${prev ? '' : 'off'}" href="${prev ? itemHref(ch, prev) : '#'}" title="Previous">${ICO.back}</a><span>${k + 1} of ${its.length}</span><a class="ib ${nxt ? '' : 'off'}" href="${nxt ? itemHref(ch, nxt) : '#'}" title="Next">${ICO.chev}</a></span>`;
    const header = `<header class="lw-head"><a class="back" href="#/p/${ch.id}" title="Back to the pursuit">${ICO.back}</a><h1>${esc(ch.name)}</h1><span class="meta"><span>week ${it.week}</span><span>${esc(phaseOfWeek(ch, it.week))}</span><span>${fmtDay(date)}</span></span>${nav}</header>`;
    const checklist = (id, steps) => { const st = S.checks[id] || {}; return `<ul class="lw-check" data-check="${id}">${steps.map((s, i) => `<li class="${st[i] ? 'on' : ''}"><label><input type="checkbox" data-i="${i}" ${st[i] ? 'checked' : ''}><span>${esc(s)}</span></label></li>`).join('')}</ul>`; };
    const open = (url, label) => url ? `<a class="pill-btn primary" href="${esc(url)}" ${ext(url)}>${esc(label)} ${ICO.ext}</a>` : '';
    const note = (key, rows, ph) => `<textarea class="lw-draft" data-note="${key}" rows="${rows}" placeholder="${esc(ph)}">${esc((S.notes[it.id] || {})[key] || '')}</textarea>`;
    let body = '';
    if (it.kind === 'watch' && ref) {
      const desc = (ref.description || '').trim();
      body = `<div class="player-wrap"><iframe src="https://www.youtube-nocookie.com/embed/${esc(ref.id)}?rel=0" title="${esc(ref.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>
        <div class="d-meta">${tag(ref.channel)}<span>${fmtH(ref.duration / 3600)}</span><span>${fmtN(ref.views || 0)} views</span><span>${esc(ref.published || '')}</span>${ref.hn ? tag('HN', 'hn') : ''}<a href="/videos/#/w/${esc(ref.id)}">Open in Videos</a><a href="https://www.youtube.com/watch?v=${esc(ref.id)}" ${ext('http')}>YouTube ${ICO.ext}</a></div>
        <div class="d-cols"><section><h3>While you watch</h3><ol><li>Write the talk's one-sentence claim before the halfway mark.</li><li>Note every term you cannot define; they are next week's reading.</li><li>Write the question you would ask the speaker. Keep it for a Talk session.</li></ol></section>
        <section><h3>Notes</h3>${note('text', 6, 'The claim, the terms, the question…')}</section></div>
        ${desc ? `<section><h3>About</h3><p class="d-desc">${esc(desc.length > 600 ? desc.slice(0, 600) + '…' : desc)}</p></section>` : ''}`;
    } else if (it.kind === 'read') {
      const r = ref || {}; const kind = (r.kind || it.meta[1] || 'Paper');
      const how = kind === 'Textbook' ? ['Skim the chapter headings and the summary first.', 'Read once without stopping, then once with a pen.', 'Do the first three exercises before moving on.', 'Write a half-page summary in your own words; add it to your public log.']
        : kind === 'Essay' || kind === 'Reading list' ? ['Find the claim in the first two paragraphs.', 'List the evidence the author offers, and what they leave out.', 'Write one paragraph: where you agree, where you do not, and why.']
          : ['Abstract, figures, conclusion: ten minutes, then decide how deep to go.', 'Method section with a pen: what would you need to reproduce it?', 'Limitations and related work: what did it not solve, who solved it since?', 'One paragraph in your log: the result, the trick, the open question.'];
      body = `<div class="d-grid"><div>${kv([['Authors', esc(r.authors || '')], ['Year', r.year], ['Kind', esc(kind)], ['Source', r.source === 'hn' ? 'Hacker News pick' : 'Editorial pick'], ['Link', r.domain ? `<a href="${esc(it.url)}" ${ext(it.url)}>${esc(r.domain)}</a>` : '']])}
        ${r.hn_points ? `<p class="d-small">${r.hn_points} points · ${r.hn_comments || 0} comments on <a href="https://news.ycombinator.com/item?id=${esc(r.hn_id)}" ${ext('http')}>Hacker News</a></p>` : ''}</div>
        <section><h3>How to read it</h3><ol>${how.map((s) => `<li>${s}</li>`).join('')}</ol></section></div>
        ${r.note ? `<section><h3>Why it is on your path</h3><p>${esc(r.note)}</p></section>` : ''}
        <section><h3>Highlights</h3>${note('text', 5, 'The result, the trick, the open question. One paragraph for your log.')}</section>
        <div class="d-acts">${open(it.url, 'Open the ' + kind.toLowerCase())}</div>`;
    } else if (it.kind === 'take') {
      const c = ref || {}; const wks = planOf(ch).items.filter((x) => x.kind === 'take' && x.ref === it.ref && !isSkipped(ch, x));
      body = `<div class="d-prov">${logoOf({ logo: c.logo || it.logo, name: it.title }, 'lg')}<div><b>${esc(c.provider || it.meta[0] || '')}</b><small>${esc(c.domain || '')}</small></div></div>
        <div class="d-grid"><div>${kv([['Format', esc(c.format || it.meta[1] || '')], ['Cost', esc(c.cost || '')], ['Level', esc(c.level || '')], ['Access', esc(c.access || c.selectivity || '')], ['Signal', c.sources ? `${c.sources} sources · score ${c.score}` : '']])}</div>
        <section><h3>Syllabus on your path</h3><p class="d-small" style="margin:0 0 6px">${wks.length} week${wks.length === 1 ? '' : 's'} in the ${esc(phaseOfWeek(ch, it.week))} phase, ${fmtH(wks.reduce((a, x) => a + x.hours, 0))} in all; half of each week is reserved for it.</p><ul class="lw-check" data-check="${esc(it.ref || it.id)}-syl">${wks.map((x, i) => `<li class="${(S.checks[(it.ref || it.id) + '-syl'] || {})[i] ? 'on' : ''} ${x.id === it.id ? 'cur' : ''}"><label><input type="checkbox" data-i="${i}" ${(S.checks[(it.ref || it.id) + '-syl'] || {})[i] ? 'checked' : ''}><span><b>Week ${x.week}</b> · ${fmtDate(weekDate(ch, x.week))} · ${fmtH(x.hours)}${x.id === it.id ? ' · this session' : ''}</span></label></li>`).join('')}</ul></section></div>
        ${c.note ? `<section><h3>Why this course</h3><p>${esc(c.note)}</p></section>` : ''}
        <div class="d-acts">${open(it.url, 'Open the course')}</div>`;
    } else if (it.kind === 'attend') {
      const p = ref || {};
      const STAGES = ['Not started', 'Materials', 'Submitted', 'Reply'], stage = (S.notes[it.id] || {}).stage || 0;
      body = `<div class="d-prov">${logoOf({ logo: p.logo || it.logo, name: it.title }, 'lg')}<div><b>${esc(p.provider || it.meta[0] || '')}</b><small>${esc(p.domain || '')}</small></div></div>
        <div class="lw-stepper">${STAGES.map((st, i) => `<button data-stage="${i}" class="${i < stage ? 'past' : i === stage ? 'on' : ''}"><i>${i < stage ? ICO.check : i + 1}</i>${st}</button>`).join('')}</div>
        <div class="d-grid"><div>${kv([['Format', esc(p.format || it.meta[1] || '')], ['Access', esc(p.access || '')], ['Selectivity', esc(p.selectivity || '')], ['Cost', esc(p.cost || '')]])}</div>
        <section><h3>Application</h3>${checklist(it.id, ['Read the eligibility and the dates on the program page.', 'One-page statement: what you have built, what you want to build there.', 'The project that shows it: link, two paragraphs, one figure.', 'Two people who can vouch for the work; ask them this week.', 'Submit, then log the date and what you would change next time.'])}</section></div>
        ${p.note ? `<section><h3>Why this program</h3><p>${esc(p.note)}</p></section>` : ''}
        <div class="d-acts">${open(it.url, 'Open the program')}<a class="pill-btn" href="#/discover">More like this in Discover</a></div>`;
    } else if (it.kind === 'talk') {
      const p = ref || { name: it.title, role: it.meta[0], org: it.meta[1], logo: it.face, url: it.url };
      const first = (p.name || '').split(' ')[0];
      const qs = [`What in ${f.name.toLowerCase()} do you think is under-discussed right now, and why?`, `If you were starting a serious ${ch.topic ? esc(ch.topic) : f.name.toLowerCase()} project this month, what would you build first?`, `What is the paper or result that changed how you think about this field?`];
      const draft = `Hi ${first},\n\nI am ${ch.months} months into ${f.name.toLowerCase()}${ch.topic ? ` (${ch.topic})` : ''} and your work on ${(p.note || '').split(';')[0].toLowerCase() || 'this'} is the primary source for the project I am doing: [one line on the project].\n\nOne specific question: [the question].\n\nHappy to share what I find. Thank you,\n[your name]`;
      body = `<div class="d-person">${faceOf(p, 'face lg')}<div><b>${esc(p.name)}</b><span>${esc(p.role || '')}${p.org ? ` · ${esc(p.org)}` : ''}</span><div class="d-links">${p.site ? `<a class="chip small" href="${esc(p.site)}" ${ext('http')}>Site</a>` : ''}${p.x ? `<a class="chip small" href="https://x.com/${esc(p.x)}" ${ext('http')}>@${esc(p.x)}</a>` : ''}${p.youtube ? `<a class="chip small" href="${esc(p.youtube)}" ${ext('http')}>YouTube</a>` : ''}<a class="chip small" href="/people/">People</a></div></div></div>
        ${p.note ? `<section><h3>Why ${esc(first)}</h3><p>${esc(p.note)}</p></section>` : ''}
        <div class="d-grid"><section><h3>Three questions to ask</h3><ol>${qs.map((q) => `<li>${q}</li>`).join('')}</ol><p class="d-small">Read their last three posts first; ask the one question only they can answer.</p></section>
        <section><h3>Draft a message</h3><textarea class="lw-draft" id="draft" rows="9">${esc((S.notes[it.id] || {}).draft || draft)}</textarea><div class="d-acts"><button class="pill-btn" id="copy">Copy</button><span class="d-small" id="copied"></span></div></section></div>`;
    } else if (it.kind === 'build') {
      const steps = /set up/i.test(it.title) ? ['Pick one place for notes and keep everything there.', 'Install or sign up for what the course needs; run the hello-world.', 'Make a public log: a page, a repo or a thread. First entry: what you want to be able to do.', 'Put the weekly sessions in your real calendar.']
        : /exercises/i.test(it.title) ? ['Do the exercises before looking at any solution.', 'For each one you could not do, write what you were missing.', 'Half a page of notes on the chapter, in your words.', 'Post the notes to your log.']
          : /capstone/i.test(it.title) ? ['Write the one-paragraph description that goes in the application.', 'Finish the part a reviewer sees first: the figure, the demo, the README.', 'Ask one person from your Talk sessions for a review.', 'Publish it; link it from the application.']
            : ['Define the scope in one paragraph: what is in, what is out.', 'Do the work in two sessions; stop when the time is up.', 'Write it up: what you did, why, what broke.', 'Publish it and send it to one person in the field.'];
      const stDone = Object.values(S.checks[it.id] || {}).filter(Boolean).length;
      body = `<div class="lw-brief"><div><h3>Brief</h3><p>${esc(it.why || '')}</p><p>Block ${fmtH(it.hours)} this week; ${LOADS[ch.load].days.length > 3 ? 'two sessions' : 'one or two sessions'}. The deliverable is something a stranger can open.</p></div><div class="lw-meter"><b>${stDone}/${steps.length}</b><span>steps</span><i style="--p:${Math.round(stDone / steps.length * 100)}"></i></div></div>
        <div class="d-grid"><section><h3>Steps</h3>${checklist(it.id, steps)}</section>
        <section><h3>Deliverable</h3>${note('deliverable', 2, 'Link to the repo, page or thread…')}<h3 style="margin-top:14px">Notes</h3>${note('text', 5, 'What you did, what broke, what is next…')}</section></div>`;
    } else if (it.kind === 'coach') {
      const its2 = weekItems(ch, it.week), dn = its2.filter((x) => isDone(ch, x)).length, n = S.notes[it.id] || {};
      const qs = it.week === 1 ? ['What do you already know about this, honestly?', 'What do you want to be able to do by the end of the pursuit?', 'What will get in the way, and what is the plan for that?'] : ['What landed this week?', 'What did not, and why?', 'What changes next week?'];
      body = `<section><h3>This week</h3><p>${dn} of ${its2.length} moves done, ${fmtH(hoursOf(ch, it.week, (x) => isDone(ch, x)))} of ${fmtH(hoursOf(ch, it.week))}. Thirty minutes: answer the three questions, then tell the assistant what to change.</p></section>
        <section class="lw-qs">${qs.map((q, i) => `<label><b>${esc(q)}</b><textarea class="lw-draft" data-q="q${i}" rows="3">${esc(n['q' + i] || '')}</textarea></label>`).join('')}</section>
        <div class="d-acts"><a class="pill-btn" href="#/p/${ch.id}">Tell the assistant</a><span class="d-small">Answers save as you type.</span></div>`;
    } else {
      body = `<section><h3>Notes</h3>${note('text', 6, 'Notes for this session…')}</section><div class="d-acts">${open(it.url, 'Open')}</div>`;
    }
    $('#main').innerHTML = `${header}<article class="lw-detail"><div class="dk">${tag(KIND[it.kind])}${tag(f.label)}${it.meta[0] ? `<span class="dm">${esc(it.meta[0])}</span>` : ''}<span class="dm">${fmtH(it.hours)}</span></div><h1>${esc(it.title)}</h1>${it.kind !== 'build' && it.why ? `<p class="why">${esc(it.why)}</p>` : ''}${body}
      <div class="d-foot"><button class="pill-btn ${done ? 'primary' : ''}" id="done">${done ? 'Done ✓' : 'Mark done'}</button>${prev ? `<a class="pill-btn ghost" href="${itemHref(ch, prev)}">‹ ${esc(KIND[prev.kind])}</a>` : ''}${nxt ? `<a class="pill-btn ghost" href="${itemHref(ch, nxt)}">${esc(KIND[nxt.kind])} ›</a>` : `<a class="pill-btn ghost" href="#/p/${ch.id}">Back to the week</a>`}</div></article>`;
    $('#rail').innerHTML = railPursuit(ch, it);
    $('#done').addEventListener('click', () => { ch.done[it.id] = !ch.done[it.id]; save(); renderItem(ch, it); });
    $$('.lw-check').forEach((ul) => ul.addEventListener('change', (e) => { const c = e.target; S.checks[ul.dataset.check] = S.checks[ul.dataset.check] || {}; S.checks[ul.dataset.check][c.dataset.i] = c.checked; c.closest('li').classList.toggle('on', c.checked); save(); }));
    const noteOf = () => { S.notes[it.id] = S.notes[it.id] || {}; return S.notes[it.id]; };
    const d = $('#draft'); if (d) d.addEventListener('input', () => { noteOf().draft = d.value; save(); });
    $$('textarea[data-note]').forEach((ta) => ta.addEventListener('input', () => { noteOf()[ta.dataset.note] = ta.value; save(); }));
    $$('[data-stage]').forEach((b) => b.addEventListener('click', () => { noteOf().stage = Number(b.dataset.stage); save(); renderItem(ch, it); }));
    $$('textarea[data-q]').forEach((ta) => ta.addEventListener('input', () => { noteOf()[ta.dataset.q] = ta.value; save(); }));
    const cp = $('#copy'); if (cp) cp.addEventListener('click', () => { if (navigator.clipboard) navigator.clipboard.writeText($('#draft').value).then(() => { $('#copied').textContent = 'Copied.'; }); });
    $('#main').scrollTop = 0;
  }

  // ----------------------------------------------------------------- rail
  function appRows(filter) {
    return Object.entries(S.applied).filter(([, a]) => !filter || filter(a)).map(([id, a]) => { const p = PR.programs.find((x) => x.id === id) || PR.courses.find((x) => x.id === id); return p ? `<li>${ICO.attend}<a href="${esc(p.url)}" ${ext(p.url)}>${esc(p.name)}</a><small>${fmtDate(new Date(a.t))}</small></li>` : ''; }).join('');
  }
  const LEARNERS = ['Maya', 'Tomas', 'Priya', 'Jonas', 'Aiko', 'Leo', 'Sana', 'Mateo'];
  function railPursuit(ch, it) {
    const plan = planOf(ch), cur = weekOfToday(ch), L = LOADS[ch.load];
    const planned = hoursOf(ch, cur), done = hoursOf(ch, cur, (i) => isDone(ch, i));
    const its = weekItems(ch, cur), next = its.find((i) => !isDone(ch, i));
    const today = (new Date().getDay() + 6) % 7;
    const P = pools(ch.field, ch.topic);
    const apps = appRows((a) => a.p === ch.id), nApps = Object.values(S.applied).filter((a) => a.p === ch.id).length;
    const phases = PHASES.map(([n]) => `<span class="${n === phaseOfWeek(ch, cur) ? 'on' : ''}">${n}</span>`).join('');
    const tab = S.prefs.ctab || 'experts';
    const experts = P.people.slice(0, 6).map((p) => `<li>${faceOf(p, 'face xs')}<span class="nm"><a href="${esc(p.url)}" ${ext(p.url)}>${esc(p.name)}</a><small>${esc((p.role || '').split(';')[0])}</small></span><button class="chip small" data-connect="${esc(p.id)}">Connect</button></li>`).join('');
    const seed = ch.id.charCodeAt(ch.id.length - 1);
    const learners = LEARNERS.slice(seed % 3, seed % 3 + 5).map((n, i) => { const wk = ((seed + i * 7) % plan.weeks) + 1; return `<li><span class="face xs mono">${n[0]}</span><span class="nm"><a href="#" data-hi="${esc(n)}">${esc(n)}</a><small>${esc(field(ch.field).label)} · wk ${wk} · ${Object.values(LOADS)[(seed + i) % 3].label.toLowerCase()}</small></span><button class="chip small" data-hi="${esc(n)}">Say hi</button></li>`; }).join('');
    return fold('This week', `<div class="phases">${phases}</div><div class="big">${fmtH(done)}<small>of ${fmtH(planned)}</small></div><div class="days">${DAY.map((d, i) => `<span class="${L.days.includes(i) ? (i < today ? 'done' : 'on') : ''}" title="${d}">${d[0]}</span>`).join('')}</div>${kv([['Sessions', `${L.days.length} × ${fmtH(L.hours / L.days.length)}`], ['Up next', next ? `<a href="${itemHref(ch, next)}">${esc(KIND[next.kind])} · ${fmtH(next.hours)}</a>` : 'all done'], ['Overall', `${pct(ch)}% · wk ${cur}/${plan.weeks}`]])}`, true, `${its.filter((i) => isDone(ch, i)).length}/${its.length}`)
      + fold('Connect', `<div class="subtabs"><a class="chip small ${tab === 'experts' ? 'active' : ''}" data-ctab="experts">Experts</a><a class="chip small ${tab === 'learners' ? 'active' : ''}" data-ctab="learners">Learners</a></div><ul class="fl inv">${tab === 'experts' ? experts : learners}</ul>${tab === 'experts' ? `<p class="d-small">From the <a href="/people/">People</a> section. Connect drafts the message and adds a Talk session this week.</p>` : `<p class="d-small">Sample learners on the same field, to show the shape of it. The real product matches people a few weeks ahead of you.</p>`}`, true, tab === 'learners' ? 'sample' : String(P.people.length))
      + fold('Applications', apps ? `<ul class="fl">${apps}</ul>` : `<p class="d-small">None yet. <a href="#/discover">Discover</a> lists programs you can apply to from here.</p>`, false, String(nApps));
  }
  function railPursuits() {
    const planned = S.pursuits.reduce((a, ch) => a + hoursOf(ch, weekOfToday(ch)), 0), done = S.pursuits.reduce((a, ch) => a + hoursOf(ch, weekOfToday(ch), (i) => isDone(ch, i)), 0);
    const today = (new Date().getDay() + 6) % 7, days = new Set(S.pursuits.flatMap((ch) => LOADS[ch.load].days));
    return fold('This week', `<div class="big">${fmtH(done)}<small>of ${fmtH(planned)}</small></div><div class="days">${DAY.map((d, i) => `<span class="${days.has(i) ? (i < today ? 'done' : 'on') : ''}" title="${d}">${d[0]}</span>`).join('')}</div>${kv(S.pursuits.map((ch) => [ch.name, `<a href="#/p/${ch.id}">${esc(phaseOfWeek(ch, weekOfToday(ch)))} · wk ${weekOfToday(ch)}/${planOf(ch).weeks}</a>`]))}`)
      + railApplications();
  }
  function railApplications() {
    const n = Object.keys(S.applied).length, rows = appRows();
    return fold('Applications', rows ? `<ul class="fl">${rows}</ul>` : '<p class="d-small">None yet. <a href="#/discover">Discover</a> lists programs you can apply to from here.</p>', n > 0, String(n));
  }

  // ------------------------------------------------------------- calendar
  function renderCalendar() {
    if (!S.pursuits.length) return empty('Calendar');
    let html = `<div class="lw-page"><h1>Calendar</h1><p class="sub">Every week of every pursuit, with sessions on your load's days. Hatched days are off. Click a session to open it.</p>`;
    for (const ch of S.pursuits) {
      const plan = planOf(ch), L = LOADS[ch.load], cur = weekOfToday(ch);
      html += `<div class="lw-group"><b>${esc(ch.name)}</b><span>${plan.weeks} weeks · ${L.label}</span></div><div class="lw-cal"><div class="dh"></div>${DAY.map((d) => `<div class="dh">${d}</div>`).join('')}`;
      for (let w = 1; w <= plan.weeks; w++) {
        const its = weekItems(ch, w);
        const perDay = L.days.map(() => []); its.forEach((it, k) => perDay[k % L.days.length].push(it));
        html += `<div class="wk ${w === cur ? 'cur' : ''}"><b>Week ${w}</b>${fmtDate(weekDate(ch, w))}<br><span class="ph">${esc(phaseOfWeek(ch, w))}</span></div>`;
        for (let d = 0; d < 7; d++) {
          const k = L.days.indexOf(d);
          html += `<div class="${k < 0 ? 'off' : ''} ${w === cur ? 'cur' : ''}">${k < 0 ? '' : perDay[k].map((it) => `<a class="ses ${isDone(ch, it) ? 'done' : ''}" href="${itemHref(ch, it)}" title="${esc(it.title)}">${ICO[it.kind]}${esc(it.title)}</a>`).join('')}</div>`;
        }
      }
      html += '</div>';
    }
    $('#main').innerHTML = html + '</div>';
    $('#rail').innerHTML = railPursuits();
  }

  // -------------------------------------------------------------- library
  function renderLibrary() {
    if (!S.pursuits.length) return empty('Library');
    let html = `<div class="lw-page"><h1>Library</h1><p class="sub">Everything the assistant has put on your path, by format. Check off what you have finished; open a row to work on it.</p>`;
    for (const k of ['watch', 'read', 'take', 'attend', 'talk']) {
      const rows = [];
      for (const ch of S.pursuits) for (const it of planOf(ch).items.filter((i) => i.kind === k && !isSkipped(ch, i))) rows.push([ch, it]);
      if (!rows.length) continue;
      html += `<div class="lw-group"><b>${KIND[k]}</b><span>${rows.length}</span></div><div class="lw-list">${rows.map(([ch, it]) => `<div class="lrow ${isDone(ch, it) ? 'done' : ''}"><input type="checkbox" data-ch="${ch.id}" data-id="${it.id}" ${isDone(ch, it) ? 'checked' : ''}>${row(ch, it, `wk ${it.week} · ${fmtH(it.hours)}`)}</div>`).join('')}</div>`;
    }
    $('#main').innerHTML = html + '</div>';
    bindChecks(); $('#rail').innerHTML = railPursuits();
  }

  // ---------------------------------------------------------------- tasks
  function renderTasks() {
    if (!S.pursuits.length) return empty('Tasks');
    let html = `<div class="lw-page"><h1>Tasks</h1><p class="sub">Projects, applications and check-ins, by week. The parts of the path you produce rather than consume.</p>`;
    const rows = [];
    for (const ch of S.pursuits) for (const it of planOf(ch).items.filter((i) => ['build', 'attend', 'coach'].includes(i.kind) && !isSkipped(ch, i))) rows.push([ch, it, dateOf(ch, it)]);
    rows.sort((a, b) => a[2] - b[2]);
    const open = rows.filter(([ch, it]) => !isDone(ch, it)), done = rows.filter(([ch, it]) => isDone(ch, it));
    const list = (rs) => `<div class="lw-list">${rs.map(([ch, it, d]) => `<div class="lrow ${isDone(ch, it) ? 'done' : ''}"><input type="checkbox" data-ch="${ch.id}" data-id="${it.id}" ${isDone(ch, it) ? 'checked' : ''}>${row(ch, it, `${fmtDate(d)} · ${fmtH(it.hours)}`)}</div>`).join('')}</div>`;
    html += `<div class="lw-group"><b>Open</b><span>${open.length}</span></div>${list(open)}`;
    if (done.length) html += `<div class="lw-group"><b>Done</b><span>${done.length}</span></div>${list(done)}`;
    $('#main').innerHTML = html + '</div>';
    bindChecks(); $('#rail').innerHTML = railPursuits();
  }
  function bindChecks() {
    $('#main').addEventListener('change', (e) => { const c = e.target; if (c.type !== 'checkbox') return; const ch = S.pursuits.find((x) => x.id === c.dataset.ch); if (!ch) return; ch.done[c.dataset.id] = c.checked; save(); const top = $('#main').scrollTop; route(); $('#main').scrollTop = top; });
  }
  function empty(title) {
    $('#main').innerHTML = `<div class="lw-page"><h1>${title}</h1><p class="sub">Nothing here yet. <a href="#/new">Start a pursuit</a> and the assistant fills this in.</p></div>`;
    $('#rail').innerHTML = '';
  }

  // ------------------------------------------------------------- discover
  const OPP_FMTS = ['Fellowship', 'Internship', 'Residency', 'Accelerator', 'Competition', 'Lab', 'Research training', 'Apprenticeship', 'Mentorship'];
  const COURSE_FMTS = ['Bootcamp', 'Live course', 'Certification', 'Workshop'];
  const SAMPLES = [
    { name: 'Compare two assistants on graduate-level questions', provider: 'Frontier lab · via Opportunities', fmt: 'Eval', pay: '$35–60/h', note: 'Judge which answer is better and why. Needs real expertise in the field; your pursuit log is the credential.' },
    { name: 'Write and verify hard problems in your field', provider: 'Model evaluation partner', fmt: 'Gig', pay: 'per item', note: 'Author questions with worked answers that current models get wrong. Short, paid, remote.' },
    { name: 'Research assistant, part time', provider: 'Lab in the catalogue', fmt: 'Job', pay: 'hourly', note: 'Literature reviews and reproductions for a group working on what you are learning.' },
  ];
  function renderDiscover() {
    const myFields = S.pursuits.length ? [...new Set(S.pursuits.map((c) => c.field))] : [];
    const pf = S.prefs; pf.dkind = pf.dkind || 'all'; pf.dfield = pf.dfield || 'all';
    const fieldsOn = pf.dfield === 'all' ? (myFields.length ? myFields : FIELDS.map((f) => f.slug)) : [pf.dfield];
    const inF = (x) => (x.fields || [x.field]).some((f) => fieldsOn.includes(f));
    const byScore = (a, b) => (b.score || 0) - (a.score || 0) || a.rank - b.rank;
    const all = [...PR.programs.filter((x) => OPP_FMTS.includes(x.fmt)), ...PR.courses.filter((x) => COURSE_FMTS.includes(x.fmt))].filter(inF).sort(byScore);
    const kinds = ['all', ...OPP_FMTS, 'Course'];
    const list = all.filter((x) => pf.dkind === 'all' || (pf.dkind === 'Course' ? x.section === 'courses' : x.fmt === pf.dkind));
    const invited = all.filter((x) => ['Fellowship', 'Residency', 'Internship'].includes(x.fmt) && !S.applied[x.id]).slice(0, 3);
    const applied = (x) => !!S.applied[x.id];
    const cardOf = (x, cta = 'Apply') => `<div class="disc-card ${applied(x) ? 'applied' : ''}" data-id="${x.id}">
      <div class="dc-head">${logoOf(x)}<div class="dc-t"><b>${esc(x.name)}</b><small>${esc(x.provider)}</small></div></div>
      <div class="dc-meta">${tag(x.fmt)}${x.cost ? tag(x.cost) : ''}${x.selectivity && x.selectivity !== 'application' ? tag(x.selectivity) : ''}${fieldsOn.length > 1 ? `<span>${(x.fields || [x.field]).map((f) => field(f).label).join(' · ')}</span>` : ''}</div>
      ${x.note ? `<p class="dc-note">${esc(x.note)}</p>` : ''}
      <div class="dc-foot"><a class="chip small" href="${esc(x.url)}" ${ext(x.url)}>Open</a><button class="pill-btn ${applied(x) ? 'primary' : ''}" data-apply="${x.id}">${applied(x) ? 'Applied ✓' : cta}</button></div></div>`;
    const fieldChips = [chip(myFields.length ? 'My fields' : 'All fields', pf.dfield === 'all', 'data-df="all"'), ...FIELDS.map((f) => chip(f.label, pf.dfield === f.slug, `data-df="${f.slug}"`))].join('');
    $('#main').innerHTML = `<div class="lw-page disc"><h1>Discover</h1><p class="sub">Learning experiences from the labs, companies and universities in the catalogue, matched to your pursuits: fellowships, internships, residencies, accelerators, competitions and live courses. Apply from here; what you apply to lands on your path as an Attend session.</p>
      <div class="lw-group first"><b>Opportunities</b><span>${list.length} · matched to ${fieldsOn.map((f) => field(f).label).join(', ')}</span></div>
      <div class="filter-row"><span class="filter-label">Field</span>${fieldChips}</div>
      <div class="filter-row"><span class="filter-label">Kind</span>${kinds.map((k) => chip(k === 'all' ? 'All' : k, pf.dkind === k, `data-dk="${k}"`)).join('')}</div>
      <div class="disc-grid" id="opps">${list.slice(0, pf.dmore ? 96 : 24).map((x) => cardOf(x)).join('') || '<p class="d-small">Nothing in the catalogue for this filter yet.</p>'}</div>
      ${list.length > 24 && !pf.dmore ? `<div class="more"><a class="pill-btn" id="more">Show ${Math.min(96, list.length) - 24} more</a></div>` : ''}
      <div class="lw-group"><b>Paid evals, gigs and jobs</b><span class="soon">in the works · samples</span></div>
      <div class="disc-grid">${SAMPLES.map((s) => `<div class="disc-card sample"><div class="dc-head"><span class="logo sm"><span class="mono">${esc(initials(s.provider))}</span></span><div class="dc-t"><b>${esc(s.name)}</b><small>${esc(s.provider)}</small></div></div><div class="dc-meta">${tag(s.fmt)}${tag(s.pay)}${tag('Remote')}${tag('sample', 'soon')}</div><p class="dc-note">${esc(s.note)}</p><div class="dc-foot"><span class="mono">from the labs and companies at the frontier</span><a class="pill-btn" href="https://x.com/andrewsor_" ${ext('http')}>Join the waitlist</a></div></div>`).join('')}</div>
      <div class="lw-group"><b>Questions</b></div>
      <div class="lw-faq">${[['What counts as a learning experience here?', 'Anything in the catalogue you take part in rather than consume: a fellowship, an internship or residency, an accelerator, a lab, a competition, or a live course with a cohort. Paid evals, gigs and jobs come next.'], ['What happens when I apply?', 'In this demo, the program lands on your pursuit as an Attend session with an application checklist, and shows under Applications in the rail. The real product sends the application and tracks it.'], ['Where do these come from?', 'The Programs and Courses sections of Frontier Concepts: 1,300 programs and 950 courses ranked by how many curated sources recommend them. Logos and notes come from the same data.']].map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
    </div>`;
    $('#rail').innerHTML = railDiscover(invited);
    const main = $('#main');
    main.addEventListener('click', (e) => {
      const df = e.target.closest('[data-df]'), dk = e.target.closest('[data-dk]'), ap = e.target.closest('[data-apply]'), more = e.target.closest('#more');
      if (df) { e.preventDefault(); pf.dfield = df.dataset.df; save(); renderDiscover(); }
      if (dk) { e.preventDefault(); pf.dkind = dk.dataset.dk; save(); renderDiscover(); }
      if (more) { e.preventDefault(); pf.dmore = true; renderDiscover(); }
      if (ap) { apply(ap.dataset.apply); const top = main.scrollTop; renderDiscover(); main.scrollTop = top; }
    });
  }
  function apply(id) {
    if (S.applied[id]) { const a = S.applied[id]; const ch = S.pursuits.find((c) => c.id === a.p); if (ch && a.item) { ch.extra = (ch.extra || []).filter((x) => x.id !== a.item); if (ch._plan) ch._plan.items = ch._plan.items.filter((x) => x.id !== a.item); } delete S.applied[id]; save(); return; }
    const x = PR.programs.find((p) => p.id === id) || PR.courses.find((p) => p.id === id); if (!x) return;
    const ch = S.pursuits.find((c) => (x.fields || [x.field]).includes(c.field)) || S.pursuits[0];
    const a = { t: Date.now(), p: ch ? ch.id : '' };
    if (ch) {
      const plan = planOf(ch), cur = weekOfToday(ch);
      const it = { id: `${ch.id}-${cur}-a${plan.items.length}`, week: cur, kind: 'attend', hours: 2, ref: x.id, title: x.name, url: x.url, meta: [x.provider, x.fmt].filter(Boolean), why: 'From Discover. This week: read the requirements and start the materials.', logo: x.logo || '' };
      plan.items.push(it); ch.extra = ch.extra || []; ch.extra.push(it); a.item = it.id;
      ch.log = ch.log || []; ch.log.push({ week: cur, sys: true, text: `Added from Discover: <a href="${itemHref(ch, it)}">${esc(x.name)}</a> · 2 h this week` });
    }
    S.applied[id] = a; save();
  }
  function railDiscover(invited = []) {
    const ck = S.checks._setup || {};
    const rows = [['Pick a pursuit', 'Matches what you see to a field', S.pursuits.length > 0, 'auto', '#/new'], ['Set your weekly load', 'So applications fit around the path', S.pursuits.length > 0, 'auto', '#/new'], ['Public learning log', 'The credential providers look at first', !!ck.log, 'log'], ['Verify identity', 'Needed before any paid work', !!ck.id, 'id'], ['Text or email updates', 'Deadlines and replies, nothing else', !!ck.msg, 'msg']];
    return (invited.length ? fold('Invited', `<ul class="fl inv">${invited.map((x) => `<li>${logoOf(x)}<span class="nm"><a href="${esc(x.url)}" ${ext(x.url)}>${esc(x.name)}</a><small>${esc(x.provider)} · ${esc(x.fmt)}</small></span><button class="chip small" data-apply="${x.id}">Apply</button></li>`).join('')}</ul>`, true, String(invited.length)) : '')
      + fold('Before you start', `<ul class="lw-setup-list">${rows.map(([t, s, on, key, href]) => `<li class="${on ? 'on' : ''}">${key === 'auto' ? `<a class="ck" href="${href}">${on ? ICO.check : ''}</a>` : `<button class="ck" data-ck="${key}">${on ? ICO.check : ''}</button>`}<span><b>${t}</b><small>${s}</small></span>${key !== 'msg' ? tag('required', on ? '' : 'soon') : ''}</li>`).join('')}</ul>`, true, `${rows.filter((r) => r[2]).length}/${rows.length}`)
      + railApplications();
  }

  // ---------------------------------------------------------------- route
  function parse() {
    const h = location.hash.replace(/^#\/?/, '');
    let m;
    if ((m = h.match(/^p\/([^/]+)\/i\/(.+)$/))) return { view: 'i', id: m[1], item: m[2] };
    if ((m = h.match(/^(?:p|c)\/([^/]+)$/))) return { view: 'p', id: m[1] };
    if (['home', 'discover', 'chat', 'calendar', 'library', 'tasks', 'new'].includes(h)) return { view: h };
    return S.pursuits.length ? { view: 'home' } : { view: 'new' };
  }
  function route() {
    const r = parse();
    renderSide(r);
    let title = 'Learn with AI';
    if (r.view === 'new') { renderSetup(); title = 'New pursuit'; }
    else if (r.view === 'home') { renderHome(); title = 'Home'; }
    else if (r.view === 'discover') { renderDiscover(); title = 'Discover'; }
    else if (r.view === 'chat') { renderChat(); title = 'Assistant'; }
    else if (r.view === 'calendar') { renderCalendar(); title = 'Calendar'; }
    else if (r.view === 'library') { renderLibrary(); title = 'Library'; }
    else if (r.view === 'tasks') { renderTasks(); title = 'Tasks'; }
    else {
      const ch = S.pursuits.find((c) => c.id === r.id); if (!ch) { location.hash = '#/home'; return; }
      if (r.view === 'i') { const it = planOf(ch).items.find((x) => x.id === r.item); if (!it) { location.hash = `#/p/${ch.id}`; return; } renderItem(ch, it); title = `${it.title} · ${ch.name}`; }
      else { renderPursuit(ch); title = ch.name; }
    }
    document.title = `${title} · Learn with AI · Frontier Concepts`;
    if (!['p', 'i'].includes(r.view)) { $('#main').scrollTop = 0; window.scrollTo(0, 0); }
  }
  $('#rail').addEventListener('click', (e) => {
    const ct = e.target.closest('[data-ctab]'), con = e.target.closest('[data-connect]'), hi = e.target.closest('[data-hi]');
    const r = parse(), ch = (r.view === 'p' || r.view === 'i') ? S.pursuits.find((c) => c.id === r.id) : null;
    if (ct) { e.preventDefault(); S.prefs.ctab = ct.dataset.ctab; save(); if (ch) $('#rail').innerHTML = railPursuit(ch, r.view === 'i' ? planOf(ch).items.find((x) => x.id === r.item) : null); return; }
    if (con && ch) { connect(ch, con.dataset.connect); return; }
    if (hi && ch) { e.preventDefault(); post(ch, weekOfToday(ch), { sys: true, text: `Said hi to ${esc(hi.dataset.hi)} (sample learner)` }); save(); if (r.view === 'p') renderPursuit(ch); return; }
    const b = e.target.closest('[data-ck]'), ap = e.target.closest('[data-apply]');
    if (b) { S.checks._setup = S.checks._setup || {}; S.checks._setup[b.dataset.ck] = !S.checks._setup[b.dataset.ck]; save(); }
    if (ap) apply(ap.dataset.apply);
    if (b || ap) { const top = $('#main').scrollTop; renderDiscover(); $('#main').scrollTop = top; }
  });
  window.addEventListener('hashchange', route);
  route();
})();
