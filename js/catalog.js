/* Courses and Programs pages: one script, section chosen by <body data-section>.
   Data: data/programs.js (window.FC_PROGRAMS), built by scripts/build_programs.py.
   State lives in the hash: #f=ai&fmt=MOOC&cost=free&lvl=Advanced&q=rl */
(function () {
  'use strict';
  const D = window.FC_PROGRAMS || { fields: [], formats: { courses: [], programs: [], short: {} }, courses: [], programs: [], ranked: [], rankedCategories: [] };
  const SECTION = document.body.dataset.section === 'courses' ? 'courses' : 'programs';
  const ITEMS = D[SECTION];
  const $ = (s, el = document) => el.querySelector(s);
  const main = $('#main');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const SVG = {
    courses: 'M5 26h7v-6h7v-6h7V7',
    programs: '',
  };
  const TITLE = { courses: 'Courses', programs: 'Programs' };
  const BLURB = {
    courses: 'Things you take to learn a field: open online courses, self-study texts, bootcamps, cohort courses, workshops and certifications.',
    programs: 'Things you join to enter a field: fellowships, degrees, research training, internships, accelerators, labs and residencies.',
  };

  // ------------------------------------------------------------------ state
  function state() {
    const p = new URLSearchParams(location.hash.replace(/^#/, ''));
    return { f: p.get('f') || 'all', fmt: p.get('fmt') || '', cost: p.get('cost') || '', lvl: p.get('lvl') || '', q: (p.get('q') || '').trim(), n: +(p.get('n') || 60) };
  }
  function link(patch) {
    const s = { ...state(), ...patch };
    const p = new URLSearchParams();
    for (const k of ['f', 'fmt', 'cost', 'lvl', 'q']) if (s[k] && !(k === 'f' && s[k] === 'all')) p.set(k, s[k]);
    if (patch.n) p.set('n', patch.n);
    const str = p.toString();
    return '#' + str;
  }
  const field = (slug) => D.fields.find((f) => f.slug === slug);
  const VIEWS = ['grid', 'list'];
  const currentView = () => (VIEWS.includes(store.get('fc-cat-view', 'list')) ? store.get('fc-cat-view', 'list') : 'list');

  // ------------------------------------------------------------------- tabs
  function renderTabs(s) {
    const tab = (href, label, active) => `<a class="chip ${active ? 'active' : ''}" href="${href}">${esc(label)}</a>`;
    let html = '<div class="tabs-row">' + tab(link({ f: 'all' }), 'All', s.f === 'all');
    for (const f of D.fields) html += tab(link({ f: f.slug }), f.label, s.f === f.slug);
    html += '</div><div class="tabs-row secondary">';
    html += `<a class="chip" href="/videos/">Videos</a><a class="chip ${SECTION === 'courses' ? 'active' : ''}" href="/courses/">Courses</a><a class="chip ${SECTION === 'programs' ? 'active' : ''}" href="/programs/">Programs</a><a class="chip" href="/videos/#/about">About</a>`;
    html += '</div>';
    $('#tabs').innerHTML = html;
  }

  // ------------------------------------------------------------------- cards
  function logo(domain, name) {
    const initials = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
    // Monogram always renders; the favicon is layered on top only once it has loaded.
    const img = domain ? `<img loading="lazy" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64" alt="" onload="if(this.naturalWidth>16)this.classList.add('ok')">` : '';
    return `<span class="logo" aria-hidden="true"><span class="mono">${esc(initials)}</span>${img}</span>`;
  }
  function card(i) {
    const f = field(i.field);
    const open = i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">` : '<span>';
    const close = i.url ? '</a>' : '</span>';
    return `<article class="card prog">
      <div class="prog-head">${logo(i.domain, i.provider || i.name)}
        <div style="min-width:0">${open}<h3 class="card-title">${esc(i.name)}</h3>${close}<div class="meta">${esc(i.provider)}</div></div>
      </div>
      <dl class="kv">
        <dt>Format</dt><dd><a href="${link({ fmt: i.format })}">${esc(i.fmt)}</a></dd>
        <dt>Field</dt><dd><a href="${link({ f: i.field })}">${esc(f ? f.label : i.field)}</a></dd>
        ${i.cost ? `<dt>Cost</dt><dd>${esc(i.cost)}</dd>` : ''}
        ${i.level ? `<dt>Level</dt><dd>${esc(i.level)}</dd>` : ''}
        ${i.selectivity || i.access ? `<dt>Access</dt><dd>${esc(i.access || i.selectivity)}</dd>` : ''}
        ${i.note ? `<dt>Note</dt><dd class="wrap">${esc(i.note)}</dd>` : ''}
        ${i.url ? `<dt>Link</dt><dd><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.domain || i.url)}</a></dd>` : ''}
      </dl>
    </article>`;
  }
  function rankedCard(r) {
    return `<article class="card prog ranked">
      <div class="prog-head">${logo(r.domain, r.operator || r.name)}
        <div style="min-width:0"><h3 class="card-title"><span class="rank">${String(r.rank).padStart(2, '0')}</span> ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>` : esc(r.name)}</h3><div class="meta">${esc(r.operator)}${r.kind ? ' · ' + esc(r.kind) : ''}</div></div>
      </div>
      <dl class="kv">
        ${r.examples.length ? `<dt>Alumni</dt><dd class="wrap">${esc(r.examples.join(', '))}</dd>` : ''}
        ${r.hit_rate != null ? `<dt>Hit rate</dt><dd>${r.hit_rate}% of ${r.alumni || '?'} alumni founded a frontier company</dd>` : ''}
        ${r.candidate ? `<dt>Status</dt><dd>candidate, under review</dd>` : ''}
      </dl>
    </article>`;
  }

  // ------------------------------------------------------------------- views
  function render() {
    const s = state();
    renderTabs(s);
    let items = ITEMS.slice();
    if (s.f !== 'all') items = items.filter((i) => i.field === s.f);
    if (s.fmt) items = items.filter((i) => i.format === s.fmt);
    if (s.cost) items = items.filter((i) => i.cost === s.cost);
    if (s.lvl) items = items.filter((i) => (i.level || '').toLowerCase().startsWith(s.lvl.toLowerCase()));
    if (s.q) { const terms = s.q.toLowerCase().split(/\s+/); items = items.filter((i) => { const hay = (i.name + ' ' + i.provider + ' ' + i.note + ' ' + i.fmt).toLowerCase(); return terms.every((t) => hay.includes(t)); }); }
    items.sort((a, b) => a.rank - b.rank || b.sources - a.sources || a.name.localeCompare(b.name));

    const base = ITEMS.filter((i) => s.f === 'all' || i.field === s.f);
    const fmtCount = {};
    for (const i of base) fmtCount[i.format] = (fmtCount[i.format] || 0) + 1;
    const costCount = {};
    for (const i of base) if (i.cost) costCount[i.cost] = (costCount[i.cost] || 0) + 1;
    const f = s.f !== 'all' ? field(s.f) : null;
    const chip = (label, href, active, n) => `<a class="chip small ${active ? 'active' : ''}" href="${href}">${esc(label)}${n != null ? ` <span>${n}</span>` : ''}</a>`;

    let html = `<header class="playlist-head">
      <div class="big-icon"><svg viewBox="0 0 32 32" aria-hidden="true">${SECTION === 'courses' ? '<path d="M5 26h7v-6h7v-6h7V7" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' : '<rect x="6" y="6" width="20" height="20" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>'}</svg></div>
      <div style="flex:1;min-width:0">
        <h1>${TITLE[SECTION]}${f ? ' · ' + esc(f.name) : ''}</h1>
        <div class="sub">${BLURB[SECTION]}</div>
        <div class="providers-strip">
          ${chip('All formats', link({ fmt: '' }), !s.fmt)}
          ${D.formats[SECTION].filter((x) => fmtCount[x]).map((x) => chip(D.formats.short[x] || x, link({ fmt: x }), s.fmt === x, fmtCount[x])).join('')}
          <span style="flex-basis:100%"></span>
          ${chip('Any cost', link({ cost: '' }), !s.cost)}
          ${['free', 'funded', 'paid'].filter((c) => costCount[c]).map((c) => chip(c, link({ cost: c }), s.cost === c, costCount[c])).join('')}
          <span class="sort" style="margin-left:auto"><span class="view-toggle" role="group" aria-label="Layout">${VIEWS.map((v) => `<button class="vt ${currentView() === v ? 'active' : ''}" data-view="${v}" title="${v} view">${v === 'grid' ? '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 4h18v3H3zm0 6.5h18v3H3zM3 17h18v3H3z" fill="currentColor"/></svg>'}</button>`).join('')}</span></span>
        </div>
      </div>
    </header>`;

    if (SECTION === 'programs' && s.f === 'all' && !s.fmt && !s.cost && !s.q) {
      html += `<section class="section"><div class="section-head"><h2>Ranked by founder outcomes</h2><span style="color:var(--ink-2);font-size:12px">${D.ranked.length} programs in ${D.rankedCategories.length} categories, from the Frontier Programs index</span></div>`;
      for (const cat of D.rankedCategories) {
        const rs = D.ranked.filter((r) => r.category === cat);
        html += `<h3 class="ranked-cat">${esc(cat)}</h3><div class="grid view-list ranked-grid collapsed">${rs.map((r, i) => rankedCard(r).replace('class="card prog ranked"', `class="card prog ranked ${i >= 6 ? 'extra' : ''}"`)).join('')}${rs.length > 6 ? `<button class="chip small more-toggle" data-more="${rs.length - 6}">+${rs.length - 6} more</button>` : ''}</div>`;
      }
      html += '</section>';
    }

    html += `<section class="section"><div class="section-head"><h2>${s.q ? `${items.length} results for “${esc(s.q)}”` : `${items.length} ${SECTION}${f ? ' in ' + esc(f.label) : ''}`}</h2><span style="color:var(--ink-2);font-size:12px">ranked within each field and format</span></div>
      <div class="grid view-${currentView()}">${items.slice(0, s.n).map(card).join('')}</div>
      ${items.length > s.n ? `<div class="more"><a class="pill-btn" href="${link({ n: s.n + 60 })}">Show more</a></div>` : ''}
      ${items.length ? '' : '<div class="empty"><p>Nothing matches. Clear a filter or try another word.</p></div>'}</section>`;
    main.innerHTML = html;
    document.title = `${TITLE[SECTION]}${f ? ' · ' + f.name : ''} · Frontier Concepts`;
    $('#search-input').value = s.q;
    window.scrollTo(0, 0);
  }

  // ----------------------------------------------------------------- events
  $('#theme-btn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.set('fa-theme', next);
  });
  $('#search-form').addEventListener('submit', (e) => { e.preventDefault(); location.hash = link({ q: $('#search-input').value.trim() }); });
  main.addEventListener('click', (e) => {
    const vt = e.target.closest('.vt'); if (vt) { store.set('fc-cat-view', vt.dataset.view); render(); return; }
    const b = e.target.closest('.more-toggle'); if (!b) return;
    const g = b.closest('.ranked-grid'); g.classList.toggle('collapsed');
    b.textContent = g.classList.contains('collapsed') ? `+${b.dataset.more} more` : 'Show fewer';
  });
  window.addEventListener('hashchange', render);
  render();
})();
