/* Home page: a node map drawn from data on the left, an expandable index on the right.
   Data: data/home.js (window.FC_HOME), written by scripts/build_pages.py. */
(function () {
  'use strict';
  const H = window.FC_HOME || { fields: [], totals: {} };
  const T = H.totals || {};
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n = (x) => (x || 0).toLocaleString();

  // ------------------------------------------------------------ sections
  const SECTIONS = [
    { num: '01', key: 'videos', label: 'Videos', sub: 'Lectures + talks + founders', href: '/videos/', open: true,
      line: 'Lectures, talks and founder interviews, with a TV mode.' },
    { num: '02', key: 'courses', label: 'Courses', sub: 'Structured paths per field', href: '/courses/', open: true,
      line: 'From canonical textbooks to bootcamps, ranked by signal.' },
    { num: '03', key: 'programs', label: 'Programs', sub: 'Fellowships + labs + schools', href: '/programs/', open: true,
      line: 'Fellowships, degrees, labs and accelerators, ranked by founder outcomes.' },
    { num: '04', key: 'research', label: 'Research', sub: 'Papers + textbooks + essays', href: '/research/', open: true,
      line: 'What each field is built on, with why each one matters.' },
    { num: '05', key: 'people', label: 'People', sub: 'Who to follow + learn from', href: '/people/', open: true,
      line: 'Researchers, builders, educators and writers, with where to find their work.' },
    { num: '06', key: 'opportunities', label: 'Opportunities', sub: 'Jobs + gigs + evals', open: false, cta: true,
      href: 'https://x.com/andrewsor_', ctaLabel: 'Join the waitlist →',
      line: 'Jobs, paid gigs and model evals from the labs and companies at the frontier.' },
  ];
  const SYMBOL = {
    videos: '<path d="M11 6.5v19l15-9.5z"/>', courses: '<path d="M5 26h7v-6h7v-6h7V7"/>', programs: '<rect x="6" y="6" width="20" height="20"/>',
    research: '<path d="M16 5l11 11-11 11L5 16z"/>', people: '<circle cx="16" cy="12" r="4.5"/><path d="M7 27a9 9 0 0 1 18 0"/>', opportunities: '<path d="M6 11h20v15H6z"/><path d="M12 11V7h8v4"/><path d="M6 18h20"/>',
  };
  const sym = (key, size = 18) => `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${SYMBOL[key]}</svg>`;

  // --------------------------------------------------------------- index
  function renderIndex() {
    const el = $('#index');
    el.insertAdjacentHTML('beforeend', SECTIONS.map((s) => `
      <div class="row ${s.open ? '' : 'locked'} ${s.cta ? 'soon' : ''}" data-key="${s.key}">
        <button class="row-head" ${s.open || s.cta ? '' : 'disabled'} aria-expanded="false">
          <span class="row-sym">${sym(s.key)}</span>
          <span class="row-label"><span class="num">${s.num}</span>${esc(s.label)}<span class="row-sub">${esc(s.sub)}${s.cta ? ' · coming' : s.open ? '' : ` · Level ${s.level} · locked`}</span></span>
          <span class="row-plus" aria-hidden="true">${s.open || s.cta ? '+' : '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="5" y="10" width="14" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>'}</span>
        </button>
        ${s.open || s.cta ? `<div class="row-body"><p>${esc(s.line)}<a href="${s.href}"${s.cta ? ' target="_blank" rel="noopener"' : ''}>${esc(s.ctaLabel || 'Open →')}</a></p></div>` : ''}
      </div>`).join(''));
    el.addEventListener('click', (e) => {
      const head = e.target.closest('.row-head');
      if (!head || head.disabled) return;
      const row = head.closest('.row');
      const open = row.classList.toggle('open');
      head.setAttribute('aria-expanded', open);
      head.querySelector('.row-plus').textContent = open ? '−' : '+';
      highlight(open ? row.dataset.key : null);
    });
  }

  // ----------------------------------------------------------------- map
  const W = 840, HGT = 680, CX = 420, CY = 340;
  const nodes = [];  // {id, kind, x, y, label, href, open, counts}
  const edges = [];  // {a, b, dashed}
  function layout() {
    nodes.length = 0; edges.length = 0;
    nodes.push({ id: 'home', kind: 'home', x: CX, y: CY, label: 'frontier concepts.', href: '/' });
    const fields = H.fields;
    const R = 190;
    fields.forEach((f, i) => {
      const a = -Math.PI / 2 + (i / fields.length) * Math.PI * 2 + 0.18 * Math.sin(i * 2.3);
      const r = R + 28 * Math.cos(i * 1.7);
      nodes.push({ id: f.slug, kind: 'field', x: CX + r * Math.cos(a), y: CY + r * Math.sin(a), label: f.label, title: f.name, href: `/learn/${f.slug}/`, open: true, f });
      edges.push({ a: 'home', b: f.slug, dashed: false });
    });
    const RS = 300;
    SECTIONS.forEach((s, i) => {
      const a = -Math.PI / 2 + 0.35 + (i / SECTIONS.length) * Math.PI * 2;
      const r = RS + 10 * Math.sin(i * 2.1);
      nodes.push({ id: s.key, kind: 'section', x: CX + r * Math.cos(a), y: CY + r * Math.sin(a), label: s.label, num: s.num, href: s.href, open: s.open, cta: s.cta, level: s.level });
      edges.push({ a: 'home', b: s.key, dashed: !s.open });
    });
  }
  const byId = (id) => nodes.find((x) => x.id === id);
  function path(e) {
    const A = byId(e.a), B = byId(e.b);
    const ax = A.x + (A.dx || 0), ay = A.y + (A.dy || 0), bx = B.x + (B.dx || 0), by = B.y + (B.dy || 0);
    return `M${ax},${ay} L${bx},${by}`;
  }
  function nodeSvg(nd) {
    if (nd.kind === 'home') {
      return `<g class="node home" transform="translate(${nd.x},${nd.y})"><a href="/"><circle r="13" fill="var(--ink)"/><circle r="6" fill="none" stroke="var(--bg)" stroke-width="1.2"/><circle r="2" fill="var(--bg)"/><text y="32" text-anchor="middle" class="lbl strong">frontier concepts.</text></a></g>`;
    }
    if (nd.kind === 'field') {
      return `<g class="node field" data-id="${nd.id}" transform="translate(${nd.x},${nd.y})"><a href="${nd.href}"><circle r="7" fill="var(--card)" stroke="var(--ink)" stroke-width="1.4"/><circle r="2" fill="var(--ink)"/><text y="24" text-anchor="middle" class="lbl">${esc(nd.label)}</text><title>${esc(nd.title)}: ${n(nd.f.videos)} videos, ${n(nd.f.courses)} courses, ${n(nd.f.programs)} programs. How to learn it →</title></a></g>`;
    }
    const hex = 'M0,-13 L11.3,-6.5 L11.3,6.5 L0,13 L-11.3,6.5 L-11.3,-6.5 Z';
    const inner = `<path d="${hex}" fill="var(--card)" stroke="${nd.open ? 'var(--ink)' : 'var(--ink-3)'}" stroke-width="1.4"/><text y="3.5" text-anchor="middle" class="num">${nd.num.replace(/^0/, '')}</text><text y="30" text-anchor="middle" class="lbl ${nd.open ? '' : 'muted'}">${esc(nd.label)}</text>`;
    if (nd.cta) return `<g class="node section locked" data-id="${nd.id}" transform="translate(${nd.x},${nd.y})"><a href="${nd.href}" target="_blank" rel="noopener">${inner}<title>${esc(nd.label)} · coming · join the waitlist →</title></a></g>`;
    return nd.open
      ? `<g class="node section" data-id="${nd.id}" transform="translate(${nd.x},${nd.y})"><a href="${nd.href}">${inner}<title>${esc(nd.label)} →</title></a></g>`
      : `<g class="node section locked" data-id="${nd.id}" transform="translate(${nd.x},${nd.y})">${inner}<title>${esc(nd.label)} · Level ${nd.level} · locked</title></g>`;
  }
  function renderMap() {
    layout();
    const svg = $('#map');
    svg.setAttribute('viewBox', `0 0 ${W} ${HGT}`);
    svg.innerHTML = `<g class="edges">${edges.map((e) => `<path class="edge ${e.dashed ? 'dashed' : ''}" data-a="${e.a}" data-b="${e.b}" d="${path(e)}"/>`).join('')}</g><g class="nodes">${nodes.map(nodeSvg).join('')}</g>`;
    svg.addEventListener('mouseover', (e) => { const g = e.target.closest('.node'); if (g) highlight(g.dataset.id); });
    svg.addEventListener('mouseout', (e) => { const g = e.target.closest('.node'); if (g) highlight(null); });
    drift();
  }
  function highlight(id) {
    const svg = $('#map');
    svg.classList.toggle('focus', !!id);
    svg.querySelectorAll('.edge').forEach((p) => p.classList.toggle('lit', !!id && (p.dataset.a === id || p.dataset.b === id)));
    svg.querySelectorAll('.node').forEach((g) => g.classList.toggle('lit', !!id && (g.dataset.id === id || g.classList.contains('home'))));
  }
  // A slow drift so the map feels alive; respects reduced-motion.
  function drift() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const svg = $('#map');
    const gs = [...svg.querySelectorAll('.node')].filter((g) => !g.classList.contains('home'));
    const ps = [...svg.querySelectorAll('.edge')];
    const t0 = performance.now();
    (function frame(t) {
      const k = (t - t0) / 1000;
      gs.forEach((g, i) => {
        const nd = byId(g.dataset.id); if (!nd) return;
        nd.dx = 2.2 * Math.sin(k * 0.6 + i * 1.3); nd.dy = 2.2 * Math.cos(k * 0.5 + i * 0.9);
        g.setAttribute('transform', `translate(${nd.x + nd.dx},${nd.y + nd.dy})`);
      });
      ps.forEach((p, i) => p.setAttribute('d', path(edges[i])));
      requestAnimationFrame(frame);
    })(t0);
  }

  renderIndex();
  renderMap();
})();
