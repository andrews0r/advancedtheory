/* Frontier Concepts — a small hash-routed YouTube-style viewer.
   Data comes from data/videos.js (window.FA_DATA) and data/providers.js
   (window.FA_PROVIDERS), both produced by scripts/fetch_videos.py. */
(function () {
  'use strict';

  const DATA = window.FA_DATA || { directions: [], videos: [], generated: null };
  // Label for the videos taken from the leading companies' own channels.
  // Playlists that are tabs of their own rather than one of the nine directions.
  const SPECIAL = new Set(['startup', 'theory']);
  const BUILDERS = { nav: 'Builders', title: 'From the builders', chip: 'Builders', unit: 'builder explainers' };
  const PROV = window.FA_PROVIDERS || {};
  const $ = (sel, el = document) => el.querySelector(sel);
  const main = $('#main');
  const sidebar = $('#sidebar');
  const tvRoot = $('#tv');

  // ------------------------------------------------------------ direction meta
  const DIR = {
    ai:             { color: '#6c5ce7', icon: 'M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7zm-2 19h4v1H10v-1zm2-17a5 5 0 0 1 5 5c0 1.9-1.1 3.5-2.6 4.3l-.4.3V17h-4v-3.4l-.4-.3A5 5 0 0 1 7 9a5 5 0 0 1 5-5zm-1 3v2H9v2h2v2h2v-2h2V9h-2V7h-2z' },
    robotics:       { color: '#00a8a8', icon: 'M12 2a1 1 0 0 1 1 1v1.1A7 7 0 0 1 19 11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-5a7 7 0 0 1 6-6.9V3a1 1 0 0 1 1-1zm0 4a5 5 0 0 0-5 5v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-5a5 5 0 0 0-5-5zM9.5 10a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM9 15h6v1.5H9V15zM2 11h2v5H2v-5zm18 0h2v5h-2v-5z' },
    quantum:        { color: '#e67e22', icon: 'M12 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm0-8.5c1.9 0 3.5 2.7 4.2 6.6 3.7 1.3 6.1 3.3 5.7 5.2-.4 1.9-3.5 2.7-7.4 2.3C13.3 19.7 12 22 12 22s-1.3-2.3-2.5-5.9c-3.9.4-7-.4-7.4-2.3-.4-1.9 2-3.9 5.7-5.2C8.5 4.7 10.1 2 12 2zm0 2c-.7 0-1.6 1.5-2.2 4.1.7-.2 1.4-.2 2.2-.2s1.5 0 2.2.2C13.6 5.5 12.7 4 12 4zm0 5.9c-3.6 0-6.6.9-7.5 2.1-.1.1-.1.3 0 .4.9 1.2 3.9 2.1 7.5 2.1s6.6-.9 7.5-2.1c.1-.1.1-.3 0-.4-.9-1.2-3.9-2.1-7.5-2.1zm0 7.5c.5-1 .9-2.3 1.2-3.5l-1.2.1-1.2-.1c.3 1.2.7 2.5 1.2 3.5z' },
    space:          { color: '#2d7ff9', icon: 'M12 2c3 2 5 6 5 10l2.5 3-1 5-3.5-3h-6l-3.5 3-1-5L7 12c0-4 2-8 5-10zm0 3.3c-1.7 1.6-3 4.3-3 6.7v2h6v-2c0-2.4-1.3-5.1-3-6.7zM12 9a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm-2 11h4l-2 2-2-2z' },
    biotech:        { color: '#2ecc71', icon: 'M7 2h2c0 2.2 1.3 3.8 3 4.9 1.7-1.1 3-2.7 3-4.9h2c0 2.9-1.6 5-3.7 6.4C15.4 9.7 17 11.8 17 14.7V22h-2c0-2.2-1.3-3.8-3-4.9-1.7 1.1-3 2.7-3 4.9H7v-7.3c0-2.9 1.6-5 3.7-6.4C8.6 7 7 4.9 7 2zm5 7.3c-1.9 1.1-3 2.7-3 4.7h6c0-2-1.1-3.6-3-4.7zM9 16.2c.6-.4 1.3-.8 2-1.2H9v1.2zm4-1.2c.7.4 1.4.8 2 1.2V15h-2z' },
    neurotech:      { color: '#e84393', icon: 'M12 3a3 3 0 0 1 3 3v.3A4 4 0 0 1 18.5 10 4 4 0 0 1 20 13.5c0 1.5-.8 2.8-2 3.5v.5a3.5 3.5 0 0 1-6 2.4 3.5 3.5 0 0 1-6-2.4V17a4 4 0 0 1-2-3.5A4 4 0 0 1 5.5 10 4 4 0 0 1 9 6.3V6a3 3 0 0 1 3-3zm-1 3v2.5a2.5 2.5 0 0 0 1 2 2.5 2.5 0 0 0 1-2V6a1 1 0 0 0-2 0zm-3.4 4.6a2 2 0 0 0-1.3 3.3l.7.7-.9.5a2 2 0 0 0 .1 3.6l.8.4v1.4a1.5 1.5 0 0 0 3 0V12.3l-.5-.3a4.5 4.5 0 0 1-1.9-1.4zm8.8 0a4.5 4.5 0 0 1-1.9 1.4l-.5.3v8.2a1.5 1.5 0 0 0 3 0v-1.4l.8-.4a2 2 0 0 0 .1-3.6l-.9-.5.7-.7a2 2 0 0 0-1.3-3.3z' },
    semiconductors: { color: '#f1c40f', icon: 'M7 7h10v10H7V7zm2 2v6h6V9H9zm2 2h2v2h-2v-2zM9 2h2v3H9V2zm4 0h2v3h-2V2zM9 19h2v3H9v-3zm4 0h2v3h-2v-3zM2 9h3v2H2V9zm0 4h3v2H2v-2zm17-4h3v2h-3V9zm0 4h3v2h-3v-2z' },
    energy:         { color: '#ff7f50', icon: 'M13 2L4 14h6l-1 8 9-12h-6l1-8z' },
    nanotech:       { color: '#1abc9c', icon: 'M12 2l8.7 5v10L12 22l-8.7-5V7L12 2zm0 2.3L5.3 8.2v7.6l6.7 3.9 6.7-3.9V8.2L12 4.3zm0 3.2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z' },
    startup:        { color: '#e53935', icon: 'M5 3h2v18H5V3zm3 1h11l-2.5 4L19 12H8V4zm2 2v4h5.6l-1.3-2 1.3-2H10z' },
    theory:         { color: '#8e44ad', icon: 'M6 4h12v2.5H9.8L14.5 12l-4.7 5.5H18V20H6v-2.2L11.2 12 6 6.2V4z' },
  };
  const ICON_HOME = 'M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3l9-8z';
  const ICON_TV = 'M21 3H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5v2h8v-2h5a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 14H3V5h18v12zM10 8l6 4-6 4V8z';
  const ICON_INFO = 'M11 17h2v-6h-2v6zm1-15a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM11 9h2V7h-2v2z';
  const ICON_HISTORY = 'M13 3a9 9 0 0 0-9 9H1l3.9 3.9L8.8 12H6a7 7 0 1 1 7 7 7 7 0 0 1-4.9-2l-1.4 1.4A9 9 0 1 0 13 3zm-1 5v5l4.3 2.5.7-1.2-3.5-2.1V8H12z';
  const svg = (d, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`;
  const dirOf = (slug) => DATA.directions.find((d) => d.slug === slug);
  const dirColor = (slug) => (DIR[slug] || {}).color || '#e53935';
  const dirIcon = (slug, size) => svg((DIR[slug] || {}).icon || ICON_HOME, size);

  // ------------------------------------------------------------------- utils
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtViews = (n) => {
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B views';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M views';
    if (n >= 1e3) return Math.round(n / 1e3) + 'K views';
    return n + ' views';
  };
  const fmtDur = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
  };
  const fmtAgo = (iso) => {
    if (!iso) return '';
    const days = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 864e5));
    if (days < 1) return 'today';
    if (days < 30) return days + (days === 1 ? ' day ago' : ' days ago');
    const months = Math.floor(days / 30);
    if (months < 12) return months + (months === 1 ? ' month ago' : ' months ago');
    const years = Math.floor(days / 365);
    return years + (years === 1 ? ' year ago' : ' years ago');
  };
  const thumb = (id, q = 'hqdefault') => `https://i.ytimg.com/vi/${id}/${q}.jpg`;
  const avatarColor = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 45% 45%)`; };
  const byViews = (a, b) => b.views - a.views;
  const byDate = (a, b) => (b.published || '').localeCompare(a.published || '');
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const videosIn = (slug) => (slug && slug !== 'all') ? DATA.videos.filter((v) => v.directions.includes(slug)) : DATA.videos.slice();
  const findVideo = (id) => DATA.videos.find((v) => v.id === id);

  function parseHash() {
    const h = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = h.split('?');
    const params = new URLSearchParams(qs || '');
    const parts = path.split('/').filter(Boolean);
    return { path, parts, params };
  }
  const go = (hash) => { location.hash = hash; };

  // ------------------------------------------------------------------- theme
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    store.set('fa-theme', next);
  }
  $('#theme-btn').addEventListener('click', toggleTheme);

  // ----------------------------------------------------------------- history
  function recordWatch(id) {
    const h = store.get('fa-history', []).filter((x) => x !== id);
    h.unshift(id);
    store.set('fa-history', h.slice(0, 40));
  }
  const history = () => store.get('fa-history', []).map(findVideo).filter(Boolean);

  // ----------------------------------------------------------------- sidebar
  function renderSidebar(active) {
    const item = (href, icon, label, count, key) =>
      `<a class="nav-item ${active === key ? 'active' : ''}" href="${href}">${icon}<span>${esc(label)}</span>${count != null ? `<span class="nav-count">${count}</span>` : ''}</a>`;
    let html = item('#/', svg(ICON_HOME), 'Home', null, 'home');
    html += item('#/tv', svg(ICON_TV), 'TV mode', null, 'tv');
    html += item('#/history', svg(ICON_HISTORY), 'History', null, 'history');
    { const n = DATA.videos.filter((v) => v.leader).length; if (n) html += item('#/builders', svg('M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.8 5.5 21l2-7.5L2 9h7z'), BUILDERS.nav, n, 'leaders'); }
    { const n = DATA.videos.filter((v) => v.hn).length; if (n) html += item('#/hn', svg('M3 3h18v18H3V3zm8.5 4.5L9.3 11.7 7 7.5H5.4l3.1 5.6V17h1.6v-3.9l3.1-5.6h-1.7z'), 'HN favorites', n, 'hn'); }
    html += '<hr><div class="nav-section">Playlists</div>';
    for (const d of DATA.directions) {
      if (d.slug === 'startup') html += '<hr>';
      html += `<a class="nav-item ${active === d.slug ? 'active' : ''}" href="#/p/${d.slug}" style="--c:${dirColor(d.slug)}"><span style="color:var(--c);display:inline-flex">${dirIcon(d.slug)}</span><span>${esc(d.label)}</span><span class="nav-count">${d.count}</span></a>`;
    }
    html += '<hr>' + item('#/about', svg(ICON_INFO), 'About', null, 'about');
    html += `<a class="nav-sub credit" href="https://x.com/andrewsor_" target="_blank" rel="noopener" title="Andrew Sorohan on X">
      <span>Created by</span>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-label="X"><path d="M18.9 2H22l-7 8 8.2 12h-6.4l-5-6.6L6 22H2.8l7.5-8.6L2.4 2h6.6l4.5 6L18.9 2zm-1.1 18h1.8L7.3 3.9H5.4L17.8 20z" fill="currentColor"/></svg>
      <span>@andrewsor_</span>
    </a>`;
    sidebar.innerHTML = html;
  }
  $('#menu-btn').addEventListener('click', () => {
    if (window.matchMedia('(max-width: 900px)').matches) document.body.classList.toggle('sidebar-open');
    else document.body.classList.toggle('sidebar-collapsed');
  });
  sidebar.addEventListener('click', () => document.body.classList.remove('sidebar-open'));

  // ------------------------------------------------------------------- cards
  function card(v, opts = {}) {
    const dirs = v.directions.map((s) => `<a class="tag dir" href="#/p/${s}" style="color:${dirColor(s)}">${esc((dirOf(s) || {}).label || s)}</a>`).join('');
    const provs = v.providers.slice(0, 2).map((p) => `<span class="tag">${esc(p)}</span>`).join('');
    const cur = v.curated ? `<span class="tag curated" title="${esc(v.curated.note || v.curated.collection)}">${esc(v.curated.subject || v.curated.collection)}</span>` : '';
    const lead = v.leader ? `<a class="tag leader" href="#/builders?c=${encodeURIComponent(v.leader)}" title="All explainers from ${esc(v.leader)}">${esc(v.leader)}</a>` : '';
    const hn = v.hn ? `<span class="tag hn" title="Linked in ${v.hn.mentions} Hacker News ${v.hn.mentions === 1 ? 'item' : 'items'}${v.hn.years && v.hn.years.length > 1 ? ' across ' + v.hn.years.length + ' years' : ''}">HN ×${v.hn.mentions}</span>` : '';
    const pl = opts.playlist ? `?p=${opts.playlist}` : '';
    return `<div class="card">
      <a href="#/w/${v.id}${pl}" aria-label="${esc(v.title)}">
        <div class="thumb"><img loading="lazy" src="${thumb(v.id)}" alt=""><span class="dur">${fmtDur(v.duration)}</span></div>
      </a>
      <div class="card-body">
        <div class="avatar" style="background:${avatarColor(v.channel)}">${esc(v.channel.slice(0, 1).toUpperCase())}</div>
        <div style="min-width:0">
          <a href="#/w/${v.id}${pl}"><h3 class="card-title">${esc(v.title)}</h3></a>
          <div class="meta">${esc(v.channel)}</div>
          <div class="meta">${fmtViews(v.views)}<span class="dot"></span>${fmtAgo(v.published)}</div>
          <div class="card-tags">${hn}${lead}${cur}${dirs}${v.leader || v.curated ? '' : provs}</div>
        </div>
      </div>
    </div>`;
  }
  function listItem(v, playlist, current) {
    return `<a class="list-item ${current ? 'current' : ''}" href="#/w/${v.id}${playlist ? '?p=' + playlist : ''}">
      <div class="thumb"><img loading="lazy" src="${thumb(v.id, 'mqdefault')}" alt=""><span class="dur">${fmtDur(v.duration)}</span></div>
      <div style="min-width:0"><p class="t">${esc(v.title)}</p><div class="meta">${esc(v.channel)}</div><div class="meta">${fmtViews(v.views)}<span class="dot"></span>${fmtAgo(v.published)}</div></div>
    </a>`;
  }
  const chipsBar = (active) => `<div class="chips">
      <a class="chip ${active === 'all' ? 'active' : ''}" href="#/">All</a>
      ${DATA.directions.map((d) => `<a class="chip ${active === d.slug ? 'active' : ''}" href="#/p/${d.slug}">${esc(d.label)}</a>`).join('')}
    </div>`;

  // ------------------------------------------------------------------- views
  function emptyState() {
    return `<div class="empty">
      <h2>No videos yet</h2>
      <p>The catalogue is built from the YouTube Data API. Put your key in a <code>.env</code> file next to <code>index.html</code> and run the fetch script:</p>
      <pre>YOUTUBE_API_KEY=your-key-here</pre>
      <pre>python3 scripts/fetch_videos.py</pre>
      <p>Then reload this page.</p>
    </div>`;
  }

  function viewHome(params) {
    if (!DATA.videos.length) return emptyState();
    const sort = params.get('sort') || 'views';
    const page = +(params.get('n') || 24);
    const all = videosIn('all').sort(sort === 'new' ? byDate : byViews);
    const h = history();
    let html = chipsBar('all');
    if (DATA.sample) html += `<div class="notice"><b>Sample data.</b> These are placeholder entries so the interface can be checked. Run <code>python3 scripts/fetch_videos.py</code> with a YouTube API key to build the real catalogue.</div>`;
    if (h.length) {
      html += `<section class="section"><div class="section-head"><h2>Continue watching</h2><a href="#/history">See all</a></div><div class="row">${h.slice(0, 8).map((v) => card(v)).join('')}</div></section>`;
    }
    const leaderPicks = DATA.videos.filter((v) => v.leader).sort(byViews);
    if (leaderPicks.length) {
      html += `<section class="section"><div class="section-head"><h2>${BUILDERS.title}</h2><a href="#/builders">All ${leaderPicks.length} ${BUILDERS.unit}</a></div><div class="row">${leaderPicks.slice(0, 12).map((v) => card(v)).join('')}</div></section>`;
    }
    const hnPicks = DATA.videos.filter((v) => v.hn).sort((a, b) => b.hn.mentions - a.hn.mentions || b.views - a.views);
    if (hnPicks.length) {
      html += `<section class="section"><div class="section-head"><h2>Hacker News favorites</h2><a href="#/hn">All ${hnPicks.length} HN picks</a></div><div class="row">${hnPicks.slice(0, 12).map((v) => card(v)).join('')}</div></section>`;
    }
    html += `<section class="section"><div class="section-head"><h2>${sort === 'new' ? 'Newest' : 'Most viewed'} across Frontier Concepts</h2>
      <div class="sort"><a class="chip small ${sort === 'views' ? 'active' : ''}" href="#/?sort=views">Most viewed</a><a class="chip small ${sort === 'new' ? 'active' : ''}" href="#/?sort=new">Newest</a></div></div>
      <div class="grid">${all.slice(0, page).map((v) => card(v)).join('')}</div>
      ${page < all.length ? `<div class="more"><a class="pill-btn" href="#/?sort=${sort}&n=${page + 24}">Show more</a></div>` : ''}</section>`;
    for (const d of DATA.directions) {
      const vids = videosIn(d.slug).sort(byViews).slice(0, 8);
      if (!vids.length) continue;
      html += `<section class="section"><div class="section-head"><h2 style="display:flex;align-items:center;gap:10px"><span style="color:${dirColor(d.slug)};display:inline-flex">${dirIcon(d.slug, 24)}</span>${esc(d.name)}</h2><a href="#/p/${d.slug}">View playlist (${d.count})</a></div>
        <div class="row">${vids.map((v) => card(v, { playlist: d.slug })).join('')}</div></section>`;
    }
    return html;
  }

  function viewPlaylist(slug, params) {
    const d = dirOf(slug);
    if (!d) return `<div class="empty"><h2>Unknown playlist</h2></div>`;
    const sort = params.get('sort') || 'views';
    const q = (params.get('prov') || '').toLowerCase();
    const src = params.get('src') || '';
    const field = params.get('field') || '';
    const special = SPECIAL.has(slug);
    let vids = videosIn(slug).sort(sort === 'new' ? byDate : byViews);
    if (q) vids = vids.filter((v) => v.providers.some((p) => p.toLowerCase() === q));
    if (src === 'hn') vids = vids.filter((v) => v.hn).sort((a, b) => sort === 'new' ? byDate(a, b) : (b.hn.mentions - a.hn.mentions || b.views - a.views));
    if (src === 'providers') vids = vids.filter((v) => v.sources && v.sources.includes('providers'));
    if (src === 'leaders') vids = vids.filter((v) => v.leader);
    if (field) vids = vids.filter((v) => (v.fields || v.directions).includes(field));
    if (special && sort === 'views' && slug === 'theory') vids.sort((a, b) => ((a.curated || {}).priority || 9) - ((b.curated || {}).priority || 9) || b.views - a.views);
    const fieldCount = {};
    if (special) for (const v of videosIn(slug)) for (const f of (v.fields || v.directions)) if (f !== slug && dirOf(f)) fieldCount[f] = (fieldCount[f] || 0) + 1;
    const hnCount = videosIn(slug).filter((v) => v.hn).length;
    const leaderCount = videosIn(slug).filter((v) => v.leader).length;
    const qs = (extra) => `#/p/${slug}?sort=${sort}${q ? '&prov=' + encodeURIComponent(q) : ''}${src ? '&src=' + src : ''}${extra || ''}`;
    const provCount = {};
    for (const v of videosIn(slug)) for (const p of v.providers) provCount[p] = (provCount[p] || 0) + 1;
    const provs = Object.entries(provCount).sort((a, b) => b[1] - a[1]).slice(0, 18);
    const first = vids[0];
    const info = PROV[slug];
    return `${chipsBar(slug)}
      <header class="playlist-head" style="--dir-color:${dirColor(slug)}">
        <div class="big-icon">${dirIcon(slug, 52)}</div>
        <div style="flex:1;min-width:0">
          <h1>${esc(d.name)}</h1>
          ${slug === 'theory' ? `<div class="sub">Curated lectures and explainers of the deep theory behind each field</div>` : ''}
          <div class="actions">
            ${first ? `<a class="pill-btn primary" href="#/w/${first.id}?p=${slug}">${svg('M8 5v14l11-7z', 18)} Play all</a>` : ''}
            <a class="pill-btn" href="#/w/${(shuffle(vids)[0] || {}).id}?p=${slug}&shuffle=1">${svg('M10.6 9.2L5.4 4H2v2h2.6l4.6 4.6 1.4-1.4zM14.5 4l2.1 2.1L4 18.7l1.4 1.4L18 7.5l2 2V4h-5.5zm0 16H20v-5.5l-2.1 2.1-3.3-3.3-1.4 1.4 3.3 3.3L14.5 20z', 18)} Shuffle</a>
            <a class="pill-btn" href="#/tv?p=${slug}">${svg(ICON_TV, 18)} Watch in TV mode</a>
            <div class="sort"><a class="chip small ${sort === 'views' ? 'active' : ''}" href="#/p/${slug}?sort=views${q ? '&prov=' + encodeURIComponent(q) : ''}">Most viewed</a><a class="chip small ${sort === 'new' ? 'active' : ''}" href="#/p/${slug}?sort=new${q ? '&prov=' + encodeURIComponent(q) : ''}">Newest</a></div>
          </div>
          <div class="providers-strip collapsed">
            ${special ? `<a class="chip small ${!field ? 'active' : ''}" href="#/p/${slug}?sort=${sort}">All fields</a>${DATA.directions.filter((x) => fieldCount[x.slug]).map((x) => `<a class="chip small ${field === x.slug ? 'active' : ''}" href="#/p/${slug}?sort=${sort}&field=${x.slug}" style="color:${dirColor(x.slug)}">${esc(x.label)} <span>${fieldCount[x.slug]}</span></a>`).join('')}<span style="flex-basis:100%"></span>` : `<a class="chip small ${!src ? 'active' : ''}" href="#/p/${slug}?sort=${sort}">All sources</a>`}
            ${special ? '' : `<a class="chip small ${src === 'providers' ? 'active' : ''}" href="#/p/${slug}?sort=${sort}&src=providers">From organizations</a>
            <a class="chip small ${src === 'hn' ? 'active' : ''}" href="#/p/${slug}?sort=${sort}&src=hn">Hacker News picks <span>${hnCount}</span></a>`}
            ${special ? '' : `<a class="chip small ${src === 'leaders' ? 'active' : ''}" href="#/p/${slug}?sort=${sort}&src=leaders">${BUILDERS.chip} <span>${leaderCount}</span></a>
            <span style="flex-basis:100%"></span>`}
            <a class="chip small ${!q ? 'active' : ''}" href="#/p/${slug}?sort=${sort}${src ? '&src=' + src : ''}${field ? '&field=' + field : ''}">${special ? 'All channels' : 'All organizations'}</a>
            ${provs.map(([p, n], i) => `<a class="chip small ${q === p.toLowerCase() ? 'active' : ''} ${i >= 12 && q !== p.toLowerCase() ? 'extra' : ''}" href="#/p/${slug}?sort=${sort}&prov=${encodeURIComponent(p)}${src ? '&src=' + src : ''}${field ? '&field=' + field : ''}">${esc(p)} <span>${n}</span></a>`).join('')}
            ${provs.length > 12 ? `<button class="chip small more-toggle" data-more="${provs.length - 12}">+${provs.length - 12} more</button>` : ''}
          </div>
        </div>
      </header>
      <div class="grid">${vids.map((v) => card(v, { playlist: slug })).join('')}</div>
      ${vids.length ? '' : '<div class="empty"><h2>Nothing here yet</h2></div>'}`;
  }

  function viewSearch(params) {
    const q = (params.get('q') || '').trim();
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const score = (v) => {
      const hay = (v.title + ' ' + v.channel + ' ' + v.providers.join(' ') + ' ' + v.description + ' ' + (v.tags || []).join(' ')).toLowerCase();
      let s = 0;
      for (const t of terms) {
        if (!hay.includes(t)) return 0;
        if (v.title.toLowerCase().includes(t)) s += 3;
        if (v.channel.toLowerCase().includes(t)) s += 2;
        s += 1;
      }
      return s + Math.log10(v.views + 1) / 10;
    };
    const res = terms.length ? DATA.videos.map((v) => [score(v), v]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).map((x) => x[1]) : [];
    return `${chipsBar('')}
      <div class="section-head"><h2>${res.length} result${res.length === 1 ? '' : 's'} for “${esc(q)}”</h2></div>
      <div class="grid">${res.map((v) => card(v)).join('')}</div>
      ${res.length ? '' : '<div class="empty"><p>Try a topic (“fusion”), a channel (“MIT OpenCourseWare”) or an organization (“NASA”).</p></div>'}`;
  }

  function viewHN(params) {
    const slug = params.get('p') || 'all';
    let vids = videosIn(slug).filter((v) => v.hn).sort((a, b) => b.hn.mentions - a.hn.mentions || (b.hn.years || []).length - (a.hn.years || []).length || b.views - a.views);
    const counts = {};
    for (const v of DATA.videos) if (v.hn) for (const s of v.directions) counts[s] = (counts[s] || 0) + 1;
    return `<div class="chips">
        <a class="chip ${slug === 'all' ? 'active' : ''}" href="#/hn">All</a>
        ${DATA.directions.map((d) => `<a class="chip ${slug === d.slug ? 'active' : ''}" href="#/hn?p=${d.slug}">${esc(d.label)} <span>${counts[d.slug] || 0}</span></a>`).join('')}
      </div>
      <div class="section-head"><h2>Hacker News favorites${slug !== 'all' ? ' · ' + esc((dirOf(slug) || {}).name || '') : ''}</h2><span style="color:var(--ink-2)">${vids.length} videos, ordered by how often HN linked them</span></div>
      <div class="grid">${vids.map((v) => card(v, { playlist: slug !== 'all' ? slug : '' })).join('')}</div>`;
  }

  function viewLeaders(params) {
    const slug = params.get('p') || 'all';
    const company = params.get('c') || '';
    const all = videosIn(slug).filter((v) => v.leader).sort(byViews);
    const vids = company ? all.filter((v) => v.leader.toLowerCase() === company.toLowerCase()) : all;
    const counts = {};
    for (const v of DATA.videos) if (v.leader) for (const s of v.directions) counts[s] = (counts[s] || 0) + 1;
    const companies = {};
    for (const v of all) companies[v.leader] = (companies[v.leader] || 0) + 1;
    const link = (p, c) => `#/builders?${p !== 'all' ? 'p=' + p : ''}${c ? (p !== 'all' ? '&' : '') + 'c=' + encodeURIComponent(c) : ''}`;
    return `<div class="chips">
        <a class="chip ${slug === 'all' ? 'active' : ''}" href="#/builders">All</a>
        ${DATA.directions.map((d) => `<a class="chip ${slug === d.slug ? 'active' : ''}" href="${link(d.slug, '')}">${esc(d.label)} <span>${counts[d.slug] || 0}</span></a>`).join('')}
      </div>
      <div class="section-head"><h2>${BUILDERS.title}${slug !== 'all' ? ' · ' + esc((dirOf(slug) || {}).name || '') : ''}${company ? ' · ' + esc(company) : ''}</h2><span style="color:var(--ink-2)">${vids.length} explainers</span></div>
      <p style="color:var(--ink-2);max-width:760px;margin:0 0 12px">Explanations, talks and technical updates from the companies building each field.</p>
      <div class="providers-strip" style="margin:0 0 20px">
        <a class="chip small ${!company ? 'active' : ''}" href="${link(slug, '')}">All companies</a>
        ${Object.entries(companies).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<a class="chip small ${company.toLowerCase() === c.toLowerCase() ? 'active' : ''}" href="${link(slug, c)}">${esc(c)} <span>${n}</span></a>`).join('')}
      </div>
      <div class="grid">${vids.map((v) => card(v, { playlist: slug !== 'all' ? slug : '' })).join('')}</div>`;
  }

  function viewHistory() {
    const h = history();
    return `${chipsBar('')}
      <div class="section-head"><h2>History</h2>${h.length ? '<a href="#/history?clear=1" id="clear-history">Clear</a>' : ''}</div>
      <div class="grid">${h.map((v) => card(v)).join('')}</div>
      ${h.length ? '' : '<div class="empty"><p>Videos you open will show up here.</p></div>'}`;
  }

  function viewWatch(id, params) {
    const v = findVideo(id);
    if (!v) return `<div class="empty"><h2>Video not found</h2></div>`;
    recordWatch(id);
    const pl = params.get('p') || v.directions[0];
    const isShuffle = params.get('shuffle') === '1';
    let queue = videosIn(pl).sort(byViews);
    if (isShuffle) queue = shuffle(queue);
    // Keep the current video first, then the rest of the queue.
    const rest = queue.filter((x) => x.id !== id);
    const autoplay = store.get('fa-autoplay', true);
    const d = dirOf(pl);
    return `<div class="watch">
      <div>
        <div class="player-wrap" id="player-wrap"><div id="player"></div></div>
        <h1>${esc(v.title)}</h1>
        <div class="watch-meta">
          <div class="channel">
            <div class="avatar" style="background:${avatarColor(v.channel)}">${esc(v.channel.slice(0, 1).toUpperCase())}</div>
            <div><div class="name">${esc(v.channel)}</div><div class="sub">${v.leader ? `<a href="#/builders?c=${encodeURIComponent(v.leader)}" style="color:#1c62b9;font-weight:600">Builder: ${esc(v.leader)}</a>` : (v.providers.length ? 'Organization: ' + esc(v.providers.join(', ')) : '')}${v.curated ? `${v.providers.length ? ' · ' : ''}<span style="color:#8e44ad;font-weight:600">Curated: ${esc(v.curated.collection)}${v.curated.subject ? ' · ' + esc(v.curated.subject) : ''}</span>${v.curated.note ? ` <span style="color:var(--ink-2)">— ${esc(v.curated.note)}</span>` : ''}` : ''}${v.startup && !v.curated ? `${v.providers.length ? ' · ' : ''}<a href="#/p/startup" style="color:#e53935;font-weight:600">Start a Company: ${esc(v.startup.channel)} (${esc(v.startup.reasons.join(', '))})</a>` : ''}${v.hn ? `${v.providers.length ? ' · ' : ''}<a href="${esc(v.hn.url || 'https://news.ycombinator.com')}" target="_blank" rel="noopener" style="color:#ff6600;font-weight:600">Linked on Hacker News ${v.hn.mentions}× (${v.hn.stories} ${v.hn.stories === 1 ? 'story' : 'stories'}, ${v.hn.comments} ${v.hn.comments === 1 ? 'comment' : 'comments'}${v.hn.years && v.hn.years.length ? ', ' + v.hn.years[0] + (v.hn.years.length > 1 ? '–' + v.hn.years[v.hn.years.length - 1] : '') : ''})</a>` : ''}</div></div>
          </div>
          <div class="actions">
            ${v.directions.map((s) => `<a class="chip small" href="#/p/${s}" style="color:${dirColor(s)}">${dirIcon(s, 14)} ${esc((dirOf(s) || {}).label || s)}</a>`).join('')}
            <a class="pill-btn" href="#/tv?p=${pl}&v=${v.id}" title="Continue in TV mode">${svg(ICON_TV, 18)} TV mode</a>
            <a class="pill-btn ghost" href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">Open on YouTube</a>
          </div>
        </div>
        <div class="desc clamp ${v.description.length < 220 && !(v.tags && v.tags.length) ? 'short' : ''}" id="desc">
          <div class="stats">${fmtViews(v.views)} · ${v.published} ${v.likes ? ' · ' + fmtViews(v.likes).replace(' views', ' likes') : ''}</div>
          <div class="desc-body">${esc(v.description)}
          ${v.tags && v.tags.length ? `<div class="card-tags" style="margin-top:10px">${v.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}</div>
          <span class="desc-toggle">...more</span>
        </div>
      </div>
      <aside class="upnext">
        <h3>${d ? `<span style="color:${dirColor(pl)};display:inline-flex">${dirIcon(pl, 20)}</span> ${esc(d.name)}` : 'Up next'} <span style="color:var(--ink-3);font-weight:400;font-size:13px">${isShuffle ? 'shuffled' : 'most viewed'}</span>
          <label class="autoplay"><span>Autoplay</span><span class="switch ${autoplay ? 'on' : ''}" id="autoplay-switch" role="switch" aria-checked="${autoplay}" tabindex="0"></span></label></h3>
        <div class="list">${rest.slice(0, 30).map((x) => listItem(x, pl + (isShuffle ? '&shuffle=1' : ''), false)).join('')}</div>
      </aside>
    </div>`;
  }

  function viewAbout() {
    const rows = DATA.directions.filter((d) => !SPECIAL.has(d.slug)).map((d) => {
      const p = PROV[d.slug] || { programs: '–', providers: [] };
      const top = p.providers.filter((x) => x.videos > 0).slice(0, 4).map((x) => x.name).join(', ');
      return `<tr><td><span class="swatch" style="background:${dirColor(d.slug)}"></span><a href="#/p/${d.slug}">${esc(d.name)}</a></td><td class="num">${d.count}</td><td style="color:var(--ink-2)">${esc(top)}</td></tr>`;
    }).join('');
    const provDetails = DATA.directions.filter((d) => !SPECIAL.has(d.slug)).map((d) => {
      const p = PROV[d.slug];
      if (!p) return '';
      return `<details><summary>${esc(d.name)} · ${p.providers.filter((x) => x.videos).length} organizations with videos</summary>
        <div class="prov-list">${p.providers.map((x) => x.videos ? `<a class="chip small" href="#/p/${d.slug}?prov=${encodeURIComponent(x.name)}">${esc(x.name)} <span>${x.videos}</span></a>` : `<span class="chip small" style="opacity:.55">${esc(x.name)}</span>`).join('')}</div></details>`;
    }).join('');
    return `<article class="about">
      <h1>About Frontier Concepts</h1>
      <p class="lede">A lean-back way to watch the best lectures, talks and courses on the frontier technologies: AI, robotics, quantum, space, biotech, neurotech, semiconductors, energy and nanotech.</p>
      <h2>Where the videos come from</h2>
      <p>Frontier Concepts is a restricted view of YouTube. Videos come from the organizations behind a curated list of frontier learning programs, from what Hacker News readers keep recommending, and from the channels of the companies building each field. Everything is filtered to lectures, talks, explainers and interviews; news, promos and entertainment are left out.</p>
      <table class="dir-table">
        <thead><tr><th>Direction</th><th style="text-align:right">Videos</th><th>Top organizations</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <h2>Tabs</h2>
      <ul>
        <li><b>Playlists</b> for each of the nine directions, sortable by views or date and filterable by organization.</li>
        <li><b>${esc(BUILDERS.nav)}</b>: explainers and technical updates from the leading companies' own channels.</li>
        <li><b>HN favorites</b>: videos Hacker News has linked again and again over the years.</li>
        <li><b>Start a Company</b>: hand-picked founder stories, podcasts and interviews where company building meets the frontier.</li>
        <li><b>Advanced Theory</b>: a curated set of the hardest, deepest lectures behind each field.</li>
      </ul>
      <h2>TV mode</h2>
      <p>Pick a playlist and let it play. Controls fade while you watch: <span class="kbd">→</span> next, <span class="kbd">←</span> previous, <span class="kbd">Space</span> pause, <span class="kbd">S</span> shuffle, <span class="kbd">F</span> full screen, <span class="kbd">Esc</span> exit.</p>
      <h2>Organizations by direction</h2>
      ${provDetails}
      <p style="color:var(--ink-3)">Created by <a href="https://x.com/andrewsor_" target="_blank" rel="noopener">@andrewsor_</a>. Videos belong to their creators and are streamed from YouTube.</p>
    </article>`;
  }

  // ------------------------------------------------------------ YouTube API
  let ytReady = null;
  function loadYT() {
    if (ytReady) return ytReady;
    ytReady = new Promise((resolve) => {
      if (window.YT && window.YT.Player) return resolve(window.YT);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
      setTimeout(() => resolve(window.YT && window.YT.Player ? window.YT : null), 6000);
    });
    return ytReady;
  }
  let player = null;
  let playerToken = 0;
  async function mountPlayer(elId, videoId, onEnded, onState) {
    const token = ++playerToken;
    destroyPlayer();
    const YT = await loadYT();
    const el = document.getElementById(elId);
    if (!el || token !== playerToken) return;
    if (!YT) {
      el.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen title="Video player"></iframe>`;
      return;
    }
    player = new YT.Player(elId, {
      host: 'https://www.youtube-nocookie.com',
      videoId,
      playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1, enablejsapi: 1, origin: location.origin.startsWith('http') ? location.origin : undefined },
      events: {
        onStateChange: (e) => { if (onState) onState(e.data); if (e.data === YT.PlayerState.ENDED && onEnded) onEnded(); },
        onError: () => { if (onEnded) setTimeout(onEnded, 1200); },
      },
    });
  }
  function destroyPlayer() {
    if (player && player.destroy) { try { player.destroy(); } catch (e) {} }
    player = null;
  }

  // ---------------------------------------------------------------- TV mode
  const tv = { on: false, queue: [], idx: 0, slug: 'all', shuffled: true, idleTimer: null, progTimer: null };
  function tvBuildQueue(slug, startId) {
    let q = videosIn(slug).sort(byViews);
    // Lean-back default: a shuffled mix biased toward the most viewed half.
    if (tv.shuffled) { const top = q.slice(0, Math.max(20, Math.ceil(q.length * 0.6))); q = shuffle(top).concat(shuffle(q.slice(top.length))); }
    if (startId) { const i = q.findIndex((v) => v.id === startId); if (i > 0) { const [v] = q.splice(i, 1); q.unshift(v); } else if (i < 0) { const v = findVideo(startId); if (v) q.unshift(v); } }
    tv.queue = q; tv.idx = 0;
  }
  function tvRender() {
    const v = tv.queue[tv.idx];
    const next = tv.queue[tv.idx + 1];
    const chip = (slug, label, n) => `<button class="tv-chip ${tv.slug === slug ? 'active' : ''}" data-tv-pl="${slug}">${slug !== 'all' ? `<span style="display:inline-flex;color:${tv.slug === slug ? dirColor(slug) : 'inherit'}">${dirIcon(slug, 16)}</span>` : ''}${esc(label)}${n != null ? ` <span>${n}</span>` : ''}</button>`;
    tvRoot.innerHTML = `
      <div class="tv-player"><div id="tv-player"></div></div>
      <div class="tv-overlay">
        <div class="tv-top">
          <a class="tv-brand" href="#/" title="Back to the home page"><svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="6" fill="#141414" stroke="#2a2a2a"/><g stroke="#ffffff" stroke-opacity=".22" stroke-width=".8" fill="none"><path d="M6 2v28" /><path d="M10 2v28" /><path d="M14 2v28" /><path d="M18 2v28" /><path d="M22 2v28" /><path d="M26 2v28" /><path d="M2 6h28" /><path d="M2 10h28" /><path d="M2 14h28" /><path d="M2 18h28" /><path d="M2 22h28" /><path d="M2 26h28" /></g><g stroke="#ffffff" stroke-width="1.1" fill="none" stroke-linecap="round"><circle cx="16" cy="16" r="11"/></g></svg> frontier <span class="brand-tv">concepts.</span></a>
          <div class="tv-pl">${chip('all', 'Everything', DATA.videos.length)}${DATA.directions.map((d) => chip(d.slug, d.label, d.count)).join('')}</div>
          <button class="tv-btn" data-tv="exit" title="Exit TV mode (Esc)">${svg('M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6z', 20)}</button>
        </div>
        <div class="tv-bottom">
          <div class="tv-info">
            ${v ? `<h2 class="tv-title">${esc(v.title)}</h2>
            <div class="tv-meta">${esc(v.channel)} · ${fmtViews(v.views)} · ${fmtDur(v.duration)} · ${v.directions.map((s) => esc((dirOf(s) || {}).label || s)).join(', ')}${v.providers.length ? ' · ' + esc(v.providers[0]) : ''}</div>` : '<h2 class="tv-title">Nothing to play</h2>'}
            <div class="tv-ctrls">
              <button class="tv-btn" data-tv="prev" title="Previous (←)">${svg('M6 6h2v12H6zm3.5 6l8.5 6V6z', 22)}</button>
              <button class="tv-btn primary" data-tv="play" title="Play / pause (Space)" id="tv-play">${svg('M6 19h4V5H6v14zm8-14v14h4V5h-4z', 22)}</button>
              <button class="tv-btn" data-tv="next" title="Next (→)">${svg('M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z', 22)}</button>
              <button class="tv-btn ${tv.shuffled ? 'primary' : ''}" data-tv="shuffle" title="Shuffle (S)">${svg('M10.6 9.2L5.4 4H2v2h2.6l4.6 4.6 1.4-1.4zM14.5 4l2.1 2.1L4 18.7l1.4 1.4L18 7.5l2 2V4h-5.5zm0 16H20v-5.5l-2.1 2.1-3.3-3.3-1.4 1.4 3.3 3.3L14.5 20z', 20)} ${tv.shuffled ? 'Shuffle on' : 'Shuffle'}</button>
              <button class="tv-btn" data-tv="fs" title="Full screen (F)">${svg('M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z', 20)}</button>
              <span style="color:rgba(255,255,255,.6);font-size:13px;margin-left:8px">${tv.idx + 1} / ${tv.queue.length}</span>
            </div>
          </div>
          ${next ? `<div class="tv-next"><h4>Up next</h4><button class="ni" data-tv="next" style="width:100%;text-align:left;color:#fff"><img src="${thumb(next.id, 'mqdefault')}" alt=""><div><div class="t">${esc(next.title)}</div><div class="m">${esc(next.channel)} · ${fmtDur(next.duration)}</div></div></button></div>` : ''}
        </div>
        <div class="tv-progress"><i id="tv-prog"></i></div>
        <div class="tv-hint" id="tv-hint"></div>
      </div>`;
    if (v) {
      mountPlayer('tv-player', v.id, () => tvStep(1), (state) => {
        const b = $('#tv-play');
        if (!b || !window.YT) return;
        b.innerHTML = state === YT.PlayerState.PLAYING ? svg('M6 19h4V5H6v14zm8-14v14h4V5h-4z', 22) : svg('M8 5v14l11-7z', 22);
      });
      document.title = v.title + ' · Frontier Concepts';
      recordWatch(v.id);
    }
    tvWake();
  }
  function tvStep(delta) {
    if (!tv.queue.length) return;
    tv.idx = (tv.idx + delta + tv.queue.length) % tv.queue.length;
    tvRender();
  }
  function tvHint(text) {
    const h = $('#tv-hint'); if (!h) return;
    h.textContent = text; h.classList.add('show');
    clearTimeout(h._t); h._t = setTimeout(() => h.classList.remove('show'), 1200);
  }
  function tvWake() {
    tvRoot.classList.remove('idle');
    clearTimeout(tv.idleTimer);
    tv.idleTimer = setTimeout(() => tvRoot.classList.add('idle'), 3500);
  }
  function tvEnter(params) {
    tv.on = true;
    tv.slug = params.get('p') || 'all';
    if (!dirOf(tv.slug) && tv.slug !== 'all') tv.slug = 'all';
    tv.shuffled = params.get('shuffle') !== '0';
    tvBuildQueue(tv.slug, params.get('v'));
    document.body.classList.add('tv-on');
    tvRoot.hidden = false;
    tvRender();
    clearInterval(tv.progTimer);
    tv.progTimer = setInterval(() => {
      const bar = $('#tv-prog');
      if (bar && player && player.getDuration && player.getCurrentTime) {
        try { const d = player.getDuration(); if (d) bar.style.width = (100 * player.getCurrentTime() / d) + '%'; } catch (e) {}
      }
    }, 1000);
  }
  function tvExit() {
    if (!tv.on) return;
    tv.on = false;
    clearInterval(tv.progTimer);
    destroyPlayer();
    document.body.classList.remove('tv-on');
    tvRoot.hidden = true;
    tvRoot.innerHTML = '';
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  tvRoot.addEventListener('mousemove', tvWake);
  tvRoot.addEventListener('click', (e) => {
    tvWake();
    const btn = e.target.closest('[data-tv], [data-tv-pl]');
    if (!btn) { if (e.target === tvRoot || e.target.closest('.tv-player')) tvTogglePlay(); return; }
    if (btn.dataset.tvPl) { tv.slug = btn.dataset.tvPl; tvBuildQueue(tv.slug); tvRender(); go(`#/tv?p=${tv.slug}${tv.shuffled ? '' : '&shuffle=0'}`); return; }
    switch (btn.dataset.tv) {
      case 'exit': go(tv.queue[tv.idx] ? `#/w/${tv.queue[tv.idx].id}?p=${tv.slug}` : '#/'); break;
      case 'prev': tvStep(-1); break;
      case 'next': tvStep(1); break;
      case 'play': tvTogglePlay(); break;
      case 'shuffle': tv.shuffled = !tv.shuffled; { const cur = tv.queue[tv.idx]; tvBuildQueue(tv.slug, cur && cur.id); } tvRender(); tvHint(tv.shuffled ? 'Shuffle on' : 'Shuffle off'); break;
      case 'fs': tvFullscreen(); break;
    }
  });
  function tvTogglePlay() {
    if (!player || !player.getPlayerState) return;
    try {
      if (player.getPlayerState() === YT.PlayerState.PLAYING) { player.pauseVideo(); tvHint('Paused'); }
      else { player.playVideo(); tvHint('Playing'); }
    } catch (e) {}
  }
  function tvFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (tvRoot.requestFullscreen) tvRoot.requestFullscreen().catch(() => {});
  }
  document.addEventListener('keydown', (e) => {
    if (!tv.on) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    tvWake();
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); go(tv.queue[tv.idx] ? `#/w/${tv.queue[tv.idx].id}?p=${tv.slug}` : '#/'); }
    else if (k === 'ArrowRight' || k === 'n' || k === 'N') { e.preventDefault(); tvStep(1); tvHint('Next'); }
    else if (k === 'ArrowLeft' || k === 'p' || k === 'P') { e.preventDefault(); tvStep(-1); tvHint('Previous'); }
    else if (k === ' ' || k === 'k') { e.preventDefault(); tvTogglePlay(); }
    else if (k === 's' || k === 'S') { tv.shuffled = !tv.shuffled; const cur = tv.queue[tv.idx]; tvBuildQueue(tv.slug, cur && cur.id); tvRender(); tvHint(tv.shuffled ? 'Shuffle on' : 'Shuffle off'); }
    else if (k === 'f' || k === 'F') { tvFullscreen(); }
    else if (k === 'm' || k === 'M') { try { player.isMuted() ? player.unMute() : player.mute(); tvHint(player.isMuted() ? 'Muted' : 'Sound on'); } catch (err) {} }
    else if (/^[0-9]$/.test(k)) {
      const n = +k; const slug = n === 0 ? 'all' : (DATA.directions[n - 1] || {}).slug;
      if (slug) { tv.slug = slug; tvBuildQueue(slug); tvRender(); tvHint(slug === 'all' ? 'Everything' : dirOf(slug).name); go(`#/tv?p=${slug}${tv.shuffled ? '' : '&shuffle=0'}`); }
    }
  });

  // ------------------------------------------------------------------ router
  function setSeo(title, description, ld) {
    const d = $('meta[name="description"]'); if (d && description) d.setAttribute('content', description);
    const ogt = $('meta[property="og:title"]'); if (ogt) ogt.setAttribute('content', title || 'Frontier Concepts');
    const ogd = $('meta[property="og:description"]'); if (ogd && description) ogd.setAttribute('content', description);
    const el = $('#route-ld'); if (el) el.textContent = ld ? JSON.stringify(ld) : '';
  }

  function route() {
    const { parts, params } = parseHash();
    const head = parts[0] || '';
    if (head === 'tv') {
      if (!DATA.videos.length) { tvExit(); main.innerHTML = emptyState(); return; }
      if (!tv.on || (params.get('p') || 'all') !== tv.slug) tvEnter(params);
      renderSidebar('tv');
      return;
    }
    tvExit();
    let html = '';
    let active = 'home';
    document.title = 'Frontier Concepts';
    switch (head) {
      case '': html = viewHome(params); break;
      case 'p': html = viewPlaylist(parts[1], params); active = parts[1]; document.title = `${(dirOf(parts[1]) || {}).name || 'Playlist'} · Frontier Concepts`; break;
      case 'w': destroyPlayer(); html = viewWatch(parts[1], params); active = params.get('p') || ''; { const v = findVideo(parts[1]); if (v) document.title = v.title + ' · Frontier Concepts'; } break;
      case 'search': html = viewSearch(params); active = ''; $('#search-input').value = params.get('q') || ''; break;
      case 'leaders':
      case 'builders': html = viewLeaders(params); active = 'leaders'; document.title = BUILDERS.nav + ' · Frontier Concepts'; break;
      case 'hn': html = viewHN(params); active = 'hn'; document.title = 'Hacker News favorites · Frontier Concepts'; break;
      case 'history': if (params.get('clear')) { store.set('fa-history', []); go('#/history'); return; } html = viewHistory(); active = 'history'; break;
      case 'about': html = viewAbout(); active = 'about'; document.title = 'About · Frontier Concepts'; break;
      default: html = '<div class="empty"><h2>Page not found</h2><p><a href="#/">Back home</a></p></div>';
    }
    destroyPlayer();
    main.innerHTML = html;
    renderSidebar(active);
    {
      const v = head === 'w' ? findVideo(parts[1]) : null;
      const d = head === 'p' ? dirOf(parts[1]) : null;
      if (v) setSeo(document.title, `${v.title} — ${v.channel}. Watch on Frontier Concepts, a curated viewer for frontier technology lectures and talks.`, {
        '@context': 'https://schema.org', '@type': 'VideoObject', name: v.title, description: v.description || v.title,
        thumbnailUrl: thumb(v.id), uploadDate: v.published || undefined, duration: `PT${Math.floor(v.duration / 60)}M${v.duration % 60}S`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${v.id}`, url: location.href, author: { '@type': 'Organization', name: v.channel },
      });
      else if (d) setSeo(document.title, `${d.name} on Frontier Concepts: ${d.count} curated lectures, talks and explainers.`, { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${d.name} · Frontier Concepts`, url: `https://frontierconcepts.org/p/${d.slug}/` });
      else setSeo(document.title, '', null);
    }
    if (head !== 'w') window.scrollTo(0, 0); else window.scrollTo(0, 0);
    if (head === 'w') {
      const v = findVideo(parts[1]);
      const pl = params.get('p') || (v && v.directions[0]);
      const isShuffle = params.get('shuffle') === '1';
      const nextLink = $('.upnext .list-item');
      mountPlayer('player', parts[1], () => {
        if (store.get('fa-autoplay', true) && nextLink) go(nextLink.getAttribute('href'));
      });
      const sw = $('#autoplay-switch');
      const flip = () => { const on = !store.get('fa-autoplay', true); store.set('fa-autoplay', on); sw.classList.toggle('on', on); sw.setAttribute('aria-checked', on); };
      sw.addEventListener('click', flip);
      sw.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
      $('#desc').addEventListener('click', (e) => { const d = e.currentTarget; d.classList.toggle('clamp'); $('.desc-toggle', d).textContent = d.classList.contains('clamp') ? '...more' : 'Show less'; });
      void pl; void isShuffle;
    }
  }

  $('.brand').addEventListener('click', (e) => {
    e.preventDefault();
    if (location.hash === '#/' || location.hash === '' || location.hash === '#') { window.scrollTo(0, 0); route(); }
    else go('#/');
  });
  main.addEventListener('click', (e) => {
    const b = e.target.closest('.more-toggle');
    if (!b) return;
    const strip = b.closest('.providers-strip');
    strip.classList.toggle('collapsed');
    b.textContent = strip.classList.contains('collapsed') ? `+${b.dataset.more} more` : 'Show fewer';
  });
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#search-input').value.trim();
    if (q) go('#/search?q=' + encodeURIComponent(q));
  });
  window.addEventListener('hashchange', route);
  route();
})();
