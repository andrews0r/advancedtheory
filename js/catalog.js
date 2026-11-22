/* Courses and Programs pages: one dense, sortable table per page, section chosen by
   <body data-section>. Data: data/programs.js (window.FC_PROGRAMS).
   State lives in the hash: #f=ai&fmt=MOOC&cost=free&q=rl&sort=provider&dir=asc&view=ranked */
(function () {
  'use strict';
  const D = window.FC_PROGRAMS || { fields: [], formats: { courses: [], programs: [], short: {} }, courses: [], programs: [], ranked: [], rankedCategories: [] };
  const SECTION = document.body.dataset.section === 'courses' ? 'courses' : 'programs';
  const ITEMS = D[SECTION];
  const $ = (s, el = document) => el.querySelector(s);
  const main = $('#main');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const TITLE = { courses: 'Courses', programs: 'Programs' };
  const BLURB = {
    courses: 'Things you take to learn a field: open online courses, self-study texts, bootcamps, cohort courses, workshops and certifications.',
    programs: 'Things you join to enter a field: fellowships, degrees, research training, internships, accelerators, labs and residencies.',
  };
  const field = (slug) => D.fields.find((f) => f.slug === slug);
  const fieldLabel = (slug) => (field(slug) || {}).label || slug;

  // ------------------------------------------------------------------ state
  const KEYS = ['f', 'fmt', 'cost', 'q', 'sort', 'dir', 'view', 'cat'];
  function state() {
    const p = new URLSearchParams(location.hash.replace(/^#/, ''));
    const s = {}; for (const k of KEYS) s[k] = p.get(k) || '';
    s.f = s.f || 'all'; s.n = +(p.get('n') || 100); s.q = s.q.trim();
    return s;
  }
  function link(patch) {
    const s = { ...state(), ...patch };
    const p = new URLSearchParams();
    for (const k of KEYS) if (s[k] && !(k === 'f' && s[k] === 'all')) p.set(k, s[k]);
    if (patch.n) p.set('n', patch.n);
    return '#' + p.toString();
  }
  const go = (patch) => { location.hash = link(patch); };

  // ------------------------------------------------------------------- bits
  function logo(item, name) {
    const initials = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
    // Real provider logo when one is in /logos/; the monogram shows until it loads and stays if there is none.
    const img = item.logo ? `<img loading="lazy" src="${esc(item.logo)}" alt="" onload="this.classList.add('ok')">` : '';
    return `<span class="logo sm ${item.logo ? 'has' : ''}" aria-hidden="true"><span class="mono">${esc(initials)}</span>${img}</span>`;
  }
  const tag = (label, href) => href ? `<a class="tag" href="${href}">${esc(label)}</a>` : `<span class="tag">${esc(label)}</span>`;
  const chip = (label, href, active, n) => `<a class="chip small ${active ? 'active' : ''}" href="${href}">${esc(label)}${n != null ? ` <span>${n}</span>` : ''}</a>`;
  function th(label, key, s, cls = '') {
    const active = s.sort === key;
    const dir = active ? s.dir || 'asc' : '';
    const next = active && dir === 'asc' ? 'desc' : 'asc';
    return `<th class="${cls} ${active ? 'sorted' : ''}"><a href="${link({ sort: key, dir: next })}">${esc(label)}<span class="arrow">${active ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span></a></th>`;
  }
  const ext = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`;

  // ------------------------------------------------------------------- tabs
  function renderTabs(s) {
    const tab = (href, label, active) => `<a class="chip ${active ? 'active' : ''}" href="${href}">${esc(label)}</a>`;
    let html = '<div class="tabs-row">' + tab(link({ f: 'all', n: 0 }), 'All', s.f === 'all');
    for (const f of D.fields) html += tab(link({ f: f.slug }), f.label, s.f === f.slug);
    html += '</div><div class="tabs-row secondary">';
    html += `<a class="chip" href="/videos/">Videos</a><a class="chip ${SECTION === 'courses' ? 'active' : ''}" href="/courses/">Courses</a><a class="chip ${SECTION === 'programs' ? 'active' : ''}" href="/programs/">Programs</a><a class="chip" href="/videos/#/about">About</a>`;
    html += '</div>';
    $('#tabs').innerHTML = html;
  }

  // -------------------------------------------------------------- main table
  function mainTable(s) {
    let items = ITEMS.slice();
    if (s.f !== 'all') items = items.filter((i) => (i.fields || [i.field]).includes(s.f));
    if (s.fmt) items = items.filter((i) => (i.fmts || [i.fmt]).includes(s.fmt));
    if (s.cost) items = items.filter((i) => i.cost === s.cost);
    if (s.q) { const terms = s.q.toLowerCase().split(/\s+/); items = items.filter((i) => { const hay = (i.name + ' ' + i.provider + ' ' + i.note + ' ' + i.fmt + ' ' + fieldLabel(i.field)).toLowerCase(); return terms.every((t) => hay.includes(t)); }); }
    const cmp = {
      rank: (a, b) => a.rank - b.rank || b.sources - a.sources,
      name: (a, b) => a.name.localeCompare(b.name),
      provider: (a, b) => a.provider.localeCompare(b.provider) || a.rank - b.rank,
      format: (a, b) => a.fmt.localeCompare(b.fmt) || a.rank - b.rank,
      field: (a, b) => fieldLabel(a.field).localeCompare(fieldLabel(b.field)) || a.rank - b.rank,
      cost: (a, b) => (a.cost || 'zz').localeCompare(b.cost || 'zz') || a.rank - b.rank,
      level: (a, b) => (a.level || 'zz').localeCompare(b.level || 'zz') || a.rank - b.rank,
    }[s.sort] || ((a, b) => (b.score || 0) - (a.score || 0) || a.rank - b.rank || b.sources - a.sources);
    items.sort(cmp);
    if (s.dir === 'desc') items.reverse();

    const base = ITEMS.filter((i) => s.f === 'all' || (i.fields || [i.field]).includes(s.f));
    const fmtCount = {}; for (const i of base) for (const x of (i.fmts || [i.fmt])) fmtCount[x] = (fmtCount[x] || 0) + 1;
    const costCount = {}; for (const i of base) if (i.cost) costCount[i.cost] = (costCount[i.cost] || 0) + 1;
    const filtered = !!(s.fmt || s.cost || s.q || s.f !== 'all');

    const rows = items.slice(0, s.n).map((i) => `<tr>
        <td class="name" title="${esc(i.provider)}">${logo(i, i.provider || i.name)}${i.url ? ext(i.url, i.name) : esc(i.name)}</td>
        <td>${(i.fmts || [i.fmt]).map((x) => tag(x, link({ fmt: x, n: 0 }))).join('')}</td>
        <td>${(i.fields || [i.field]).length >= 7 ? tag('All fields', link({ f: 'all', n: 0 })) : (i.fields || [i.field]).map((x) => tag(fieldLabel(x), link({ f: x, n: 0 }))).join('')}</td>
        <td class="note wide" title="${esc(i.note)}">${esc(i.note)}</td>
        <td class="mono-cell">${i.url ? ext(i.url, i.domain || 'link') : ''}</td>
      </tr>`).join('');

    return `
      <div class="filters">
        <div class="filter-row"><span class="filter-label">Format</span>${D.formats[SECTION].filter((x) => fmtCount[x]).map((x) => chip(x, link({ fmt: s.fmt === x ? '' : x, n: 0 }), s.fmt === x, fmtCount[x])).join('')}</div>
        <div class="filter-row">
          <span class="filter-meta">${filtered ? `<a href="${link({ f: 'all', fmt: '', cost: '', q: '', n: 0 })}">Clear all</a> · ` : ''}${s.sort ? `<a href="${link({ sort: '', dir: '', n: 0 })}">Reset sort</a> · ` : ''}${Math.min(items.length, s.n)} of ${items.length} shown</span>
        </div>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr>${th(SECTION === 'courses' ? 'Course' : 'Program', 'name', s, 'name')}${th('Format', 'format', s)}${th('Field', 'field', s)}<th>About</th><th>Link</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="empty-row">Nothing matches. Clear a filter or try another word.</td></tr>'}</tbody>
      </table></div>
      ${items.length > s.n ? `<div class="more"><a class="pill-btn" href="${link({ n: s.n + 100 })}">Show more</a></div>` : ''}`;
  }

  // ------------------------------------------------------------ ranked table
  function rankedTable(s) {
    let rs = D.ranked.slice();
    if (s.cat) rs = rs.filter((r) => r.category === s.cat);
    if (s.q) { const terms = s.q.toLowerCase().split(/\s+/); rs = rs.filter((r) => { const hay = (r.name + ' ' + r.operator + ' ' + r.kind + ' ' + r.examples.join(' ')).toLowerCase(); return terms.every((t) => hay.includes(t)); }); }
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name),
      operator: (a, b) => a.operator.localeCompare(b.operator),
      hit: (a, b) => (b.hit_rate || -1) - (a.hit_rate || -1),
      alumni: (a, b) => (b.alumni || -1) - (a.alumni || -1),
    }[s.sort] || ((a, b) => a.category.localeCompare(b.category) || a.rank - b.rank);
    rs.sort(cmp);
    if (s.dir === 'desc') rs.reverse();
    const catCount = {}; for (const r of D.ranked) catCount[r.category] = (catCount[r.category] || 0) + 1;
    const rows = rs.map((r) => `<tr>
        <td class="mono-cell num">${String(r.rank).padStart(2, '0')}</td>
        <td class="name">${logo(r, r.operator || r.name)}${r.url ? ext(r.url, r.name) : esc(r.name)}${r.candidate ? ' <span class="tag" title="Candidate, under editorial review">candidate</span>' : ''}</td>
        <td class="mono-cell">${esc(r.operator)}</td>
        <td>${tag(r.category, link({ cat: s.cat === r.category ? '' : r.category }))}</td>
        <td class="mono-cell">${esc(r.kind)}</td>
        <td class="note">${esc(r.examples.join(', '))}</td>
        <td class="mono-cell num">${r.hit_rate != null ? r.hit_rate + '%' : ''}</td>
        <td class="mono-cell num">${r.alumni != null ? r.alumni.toLocaleString() : ''}</td>
      </tr>`).join('');
    return `
      <div class="filters">
        <div class="filter-row"><span class="filter-label">Category</span>${D.rankedCategories.map((c) => chip(c, link({ cat: s.cat === c ? '' : c }), s.cat === c, catCount[c])).join('')}
          <span class="filter-meta">${s.cat || s.q ? `<a href="${link({ cat: '', q: '' })}">Clear all</a> · ` : ''}${s.sort ? `<a href="${link({ sort: '', dir: '' })}">Reset sort</a> · ` : ''}${rs.length} of ${D.ranked.length} shown</span></div>
        <p class="filter-note">Programs ranked within each category by how often their alumni go on to found frontier companies, from the Frontier Programs index. Hit rate is the share of tracked alumni who founded one; alumni is the tracked population.</p>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th class="num">#</th>${th('Program', 'name', s, 'name')}${th('Operator', 'operator', s)}<th>Category</th><th>Kind</th><th>Alumni companies</th>${th('Hit rate', 'hit', s, 'num')}${th('Alumni', 'alumni', s, 'num')}</tr></thead>
        <tbody>${rows || '<tr><td colspan="8" class="empty-row">Nothing matches.</td></tr>'}</tbody>
      </table></div>`;
  }

  // ----------------------------------------------------------------- render
  function render() {
    const s = state();
    renderTabs(s);
    const f = s.f !== 'all' ? field(s.f) : null;
    const ranked = SECTION === 'programs' && s.view === 'ranked';
    let html = `<header class="page-head">
      <h1>${TITLE[SECTION]}${f ? ' <span class="muted">·</span> ' + esc(f.name) : ''}</h1>
      <p class="blurb">${BLURB[SECTION]}</p>
      ${SECTION === 'programs' ? `<div class="subtabs"><a class="chip small ${!ranked ? 'active' : ''}" href="${link({ view: '', cat: '', n: 0 })}">All programs <span>${D.programs.length}</span></a><a class="chip small ${ranked ? 'active' : ''}" href="${link({ view: 'ranked', fmt: '', cost: '', n: 0 })}">Ranked by founder outcomes <span>${D.ranked.length}</span></a></div>` : ''}
    </header>`;
    html += ranked ? rankedTable(s) : mainTable(s);
    main.innerHTML = html;
    document.title = `${TITLE[SECTION]}${f ? ' · ' + f.name : ''}${ranked ? ' · Ranked' : ''} · Frontier Concepts`;
    $('#search-input').value = s.q;
    if (!/[?&]n=/.test(location.hash)) window.scrollTo(0, 0);
  }

  // ----------------------------------------------------------------- events
  $('#theme-btn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.set('fa-theme', next);
  });
  $('#search-form').addEventListener('submit', (e) => { e.preventDefault(); go({ q: $('#search-input').value.trim(), n: 0 }); });
  window.addEventListener('hashchange', render);
  render();
})();
