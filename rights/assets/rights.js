/* The Ariel - agency rights pages. One script for four views, picked by <body data-view>:
 *   catalogue  /rights/<slug>/          (also the enquiry page when ?t=ID)
 *   edit       /rights/<slug>/edit/?k=  (the agency's private page)
 *   guide      /rights/<slug>/guide/    (print-ready rights guide; ?k= shows the draft before going public)
 * Data comes from the Review of Reviews Apps Script (Agencies.js). 10 Nov 2026. */
(function () {
  'use strict';
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbz2LY8eW--gMExOT-SkEgxytey5bBdULHkRTsjokCtukJJqQViFYG4PmiUPZQx0ENCqAw/exec';
  var SITE = 'https://theariel.tv/rights/';
  var body = document.body, VIEW = body.getAttribute('data-view'), SLUG = body.getAttribute('data-slug');
  var Q = new URLSearchParams(location.search);
  var K = Q.get('k') || '';
  var app = document.getElementById('app');

  var STATUS = {
    available: { label: 'Available', long: 'Film/TV rights available' },
    optioned: { label: 'Under option', long: 'Under option' },
    produced: { label: 'Adapted', long: 'Previously adapted' },
    not_available: { label: 'Not available', long: 'Not available' },
    check: { label: 'To check', long: 'Rights to be confirmed' }
  };
  var SECTION_ORDER = ['Fiction', 'Non-fiction', "Children's & YA", 'Backlist & Estates'];
  var FORMS = ['Fiction', 'Non-fiction', "Children's", 'Young adult'];
  var STAGES = ['Published', 'Forthcoming', 'On submission', 'Proposal'];
  var MATERIAL = ['', 'Finished copies', 'Proofs', 'Edited manuscript', 'Unedited manuscript', 'Proposal', 'Sample chapters'];

  /* ───────── helpers ───────── */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function get(params) {
    return fetch(ENDPOINT + '?' + new URLSearchParams(params).toString()).then(function (r) { return r.json(); });
  }
  function post(payload) {
    return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) }).then(function (r) { return r.json(); });
  }
  function surname(a) {
    a = String(a || '').replace(/^the estate of\s+/i, '').replace(/\s*\(.*\)$/, '').trim();
    var p = a.split(/\s+/); return (p[p.length - 1] || '').toLowerCase();
  }
  function sectionOf(t) {
    if (t.section) return t.section;
    if (t.form === "Children's" || t.form === 'Young adult') return "Children's & YA";
    return t.form === 'Non-fiction' ? 'Non-fiction' : 'Fiction';
  }
  function yearNum(t) { var m = /(\d{4})/.exec(t.pub_date || t.year || ''); return m ? +m[1] : 0; }
  function sorter(kind) {
    return function (a, b) {
      if (kind === 'date') return (yearNum(b) - yearNum(a)) || surname(a.author).localeCompare(surname(b.author));
      if (kind === 'title') return a.title.replace(/^(the|a|an)\s+/i, '').localeCompare(b.title.replace(/^(the|a|an)\s+/i, ''));
      if (kind === 'recent') return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
      return surname(a.author).localeCompare(surname(b.author)) || a.title.localeCompare(b.title);
    };
  }
  function when(t) {
    if (t.stage && t.stage !== 'Published') return t.stage + (t.pub_date || t.year ? ', ' + (t.pub_date || t.year) : '');
    return t.pub_date || t.year || '';
  }
  function lapseText(t) {
    if (t.status !== 'optioned') return '';
    var s = t.optioned_to ? 'to ' + t.optioned_to : '';
    if (t.option_lapse) {
      var d = new Date(t.option_lapse);
      s += (s ? '; ' : '') + 'lapses ' + (isNaN(d) ? t.option_lapse : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }));
    }
    return s;
  }
  function chip(st) { return '<span class="chip st-' + esc(st) + '">' + esc((STATUS[st] || STATUS.check).label) + '</span>'; }
  var IMG = {};
  function coverSrc(t) {
    var c = t.cover || '';
    if (/^img:/.test(c)) return IMG[c.slice(4)] || '';
    return /^https:\/\//.test(c) ? c : '';
  }
  function coverHtml(t, cls) {
    var src = coverSrc(t);
    if (src) return '<img class="' + (cls || 'cv') + '" src="' + esc(src) + '" alt="Cover of ' + esc(t.title) + '" loading="lazy" referrerpolicy="no-referrer">';
    return '<div class="ph ' + (cls || '') + '" aria-hidden="true"><span class="t">' + esc(t.title) + '</span><span class="a">' + esc(t.author) + '</span></div>';
  }
  function loadImages(slug, items) {
    var ids = [];
    items.forEach(function (x) { var c = typeof x === 'string' ? x : x.cover; if (/^img:/.test(c || '') && !IMG[c.slice(4)]) ids.push(c.slice(4)); });
    if (!ids.length) return Promise.resolve();
    var chunks = [];
    for (var i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));
    return Promise.all(chunks.map(function (c) {
      return get({ action: 'agency_imgs', slug: slug, ids: c.join(',') }).then(function (r) { if (r.ok) Object.keys(r.images).forEach(function (k) { IMG[k] = r.images[k]; }); }).catch(function () {});
    }));
  }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3200);
  }
  function enquireUrl(id, via) { return SITE + SLUG + '/?t=' + encodeURIComponent(id) + (via ? '&via=' + via : ''); }
  function qrSvg(text, cell) {
    if (!window.qrcode) return '';
    var q = window.qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: cell || 3, margin: 1, scalable: true });
  }
  function fairsHtml(fairs, cls) {
    return (fairs || []).filter(function (f) { return f.fair; }).map(function (f) {
      return '<div class="' + cls + '"><b>' + esc(f.fair) + (f.dates ? ' &middot; ' + esc(f.dates) : '') + '</b>' + esc(f.where || '') + (f.who ? '<br><span>' + esc(f.who) + '</span>' : '') + '</div>';
    }).join('');
  }
  var ICON = {
    check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>',
    doc: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    share: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
    mail: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 7l9 6 9-6"/></svg>'
  };

  /* ───────── enquiry form (modal on the catalogue, full page on ?t=) ───────── */
  function enquiryForm(t, agency, via) {
    return '<form class="enq-form" novalidate>' +
      '<input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<div class="row2"><div class="field"><label for="en-n">Your name</label><input id="en-n" name="name" autocomplete="name" required></div>' +
      '<div class="field"><label for="en-e">Email</label><input id="en-e" name="email" type="email" autocomplete="email" required></div></div>' +
      '<div class="row2"><div class="field"><label for="en-c">Company</label><input id="en-c" name="company" autocomplete="organization"></div>' +
      '<div class="field"><label for="en-r">Role</label><input id="en-r" name="role" placeholder="Producer, development exec"></div></div>' +
      '<div class="field"><label for="en-m">What interests you? <span style="text-transform:none;font-weight:400">(optional)</span></label><textarea id="en-m" name="message" placeholder="A line or two about you and why this title"></textarea></div>' +
      '<p class="hint" style="font-size:14px;color:var(--muted);margin:0 0 12px">We’ll introduce you by email to ' + esc(agency.contact_name || 'the agency') + (agency.contact_name ? ' at ' + esc(agency.name) : '') +
      '. The conversation is then between you and the agency.</p>' +
      '<button class="btn dark" type="submit">' + ICON.mail + 'Introduce me</button> <span class="msg" role="status" style="margin-left:8px;color:var(--no)"></span>' +
      '</form>';
  }
  function wireEnquiry(root, t, agency, via, onDone) {
    var f = $('.enq-form', root);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = Object.fromEntries(new FormData(f).entries());
      var msg = $('.msg', f), btn = $('button[type=submit]', f);
      if (!d.name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email || '')) { msg.textContent = 'Please add your name and email.'; return; }
      btn.disabled = true; msg.style.color = 'var(--muted)'; msg.textContent = 'Sending…';
      post(Object.assign({ action: 'agency_enquire', slug: SLUG, id: t.id, via: via }, d)).then(function (r) {
        if (!r.ok) { btn.disabled = false; msg.style.color = 'var(--no)'; msg.textContent = r.message || 'Sorry, that did not send. Please try again.'; return; }
        f.outerHTML = '<div class="done"><div class="gk">Done</div><h3>Check your inbox</h3><p>We’ve introduced you to ' + esc(r.contact_name || agency.contact_name || 'the agency') +
          ' at ' + esc(r.agency || agency.name) + ' about <b>' + esc(t.title) + '</b>. Reply to that email to carry on the conversation.</p>' +
          '<p style="font-size:14px;color:var(--muted)">Looking for more stories with rights available? <a href="https://theariel.tv/">See what The Ariel does for producers</a>.</p></div>';
        if (onDone) onDone();
      }).catch(function () { btn.disabled = false; msg.style.color = 'var(--no)'; msg.textContent = 'Network problem. Please try again.'; });
    });
  }

  function enquiryPage(id, via) {
    app.innerHTML = '<div class="loading">Loading…</div>';
    get({ action: 'agency_title', slug: SLUG, id: id }).then(function (r) {
      if (!r.ok) { app.innerHTML = '<div class="gate"><h1>Title not found</h1><p>That title is no longer listed. <a href="./">See the full list</a>.</p></div>'; return; }
      var t = r.title, ag = r.agency;
      document.title = t.title + ' - screen rights enquiry | ' + ag.name;
      return loadImages(SLUG, [t]).then(function () {
        var lapse = lapseText(t);
        app.innerHTML = '<div class="wrap"><article class="enq"><div class="top">' + coverHtml(t, '') +
          '<div><div class="kicker" style="color:var(--gold-light);font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase">' + esc(ag.name) + ' &middot; Screen rights enquiry</div>' +
          '<h1>' + esc(t.title) + '</h1><div style="color:#E9E5DD">' + esc(t.author) + (when(t) ? ' &middot; ' + esc(when(t)) : '') + '</div>' +
          '<div style="margin-top:8px">' + chip(t.status) + (lapse ? ' <span style="font-size:13px;color:#E9E5DD">' + esc(lapse) + '</span>' : '') + '</div></div></div>' +
          '<div class="dlg-b">' + (t.pitch ? '<p style="margin-top:0">' + esc(t.pitch) + '</p>' : '') + (t.credentials ? '<p style="color:var(--muted);font-style:italic">' + esc(t.credentials) + '</p>' : '') +
          enquiryForm(t, ag, via) + '</div></article>' +
          (ag.visibility !== 'private' ? '<p style="text-align:center"><a href="./">See every title from ' + esc(ag.name) + '</a></p>' : '') + '</div>';
        wireEnquiry(app, t, ag, via);
      });
    }).catch(function () { app.innerHTML = '<div class="gate"><h1>Sorry</h1><p>We could not load that page. Please try again in a moment.</p></div>'; });
  }

  /* ───────── catalogue ───────── */
  function catalogue() {
    if (Q.get('t')) return enquiryPage(Q.get('t'), Q.get('via') || 'web');
    var pw = '';
    try { pw = sessionStorage.getItem('ariel-pw-' + SLUG) || ''; } catch (e) {}
    load();
    function load() {
      app.innerHTML = '<div class="loading">Loading the list…</div>';
      get({ action: 'agency_public', slug: SLUG, pw: pw }).then(function (r) {
        if (!r.ok && (r.error === 'password' || r.error === 'wrong_password')) return gate(r);
        if (!r.ok) {
          app.innerHTML = '<div class="gate"><h1>' + esc(r.name || 'This list') + '</h1><p>This rights list is private. If you were sent a guide, use the Enquire link next to any title, or contact the agency directly.</p></div>';
          return;
        }
        try { if (pw) sessionStorage.setItem('ariel-pw-' + SLUG, pw); } catch (e) {}
        loadImages(SLUG, r.titles.concat([{ cover: r.agency.cover_image || '' }])).then(function () { renderCatalogue(r.agency, r.titles); });
      }).catch(function () { app.innerHTML = '<div class="gate"><h1>Sorry</h1><p>We could not load this list. Please try again.</p></div>'; });
    }
    function gate(r) {
      app.innerHTML = '<form class="gate"><h1>' + esc(r.name) + '</h1><p>This rights list is password protected.</p>' +
        '<div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required></div>' +
        (r.error === 'wrong_password' ? '<p style="color:var(--no)">That password did not work.</p>' : '') +
        '<button class="btn dark" type="submit">Open the list</button></form>';
      $('form', app).addEventListener('submit', function (e) { e.preventDefault(); pw = $('#pw').value; load(); });
      $('#pw').focus();
    }
  }

  function renderCatalogue(ag, titles) {
    document.title = ag.name + ' - ' + (ag.guide_title || 'Film & TV Rights') + ' | The Ariel';
    if (ag.accent) document.documentElement.style.setProperty('--accent', ag.accent);
    var latest = titles.reduce(function (m, t) { return t.updated_at > m ? t.updated_at : m; }, '');
    var state = { q: '', sort: ag.guide_sort || 'author', f: 'all' };
    var highlights = titles.filter(function (t) { return t.status === 'optioned' || t.status === 'produced'; });
    app.innerHTML =
      '<section class="hero" style="background:var(--accent)"><div class="wrap">' +
      '<div class="kicker">' + esc(ag.guide_title || 'Film & TV Rights') + (ag.season ? ' &middot; ' + esc(ag.season) : '') + '</div>' +
      '<h1>' + esc(ag.name) + '</h1>' + (ag.intro ? '<p>' + esc(ag.intro) + '</p>' : '<p>Titles available for film and television adaptation. Ask about any title and we’ll introduce you to the agency.</p>') +
      '<div class="meta">' + titles.length + ' titles' + (latest ? ' &middot; updated ' + new Date(latest).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '') +
      (ag.contact_name ? ' &middot; Film &amp; TV: ' + esc(ag.contact_name) : '') + '</div>' +
      (ag.fairs && ag.fairs.length ? '<div class="fairs">' + fairsHtml(ag.fairs, 'fair') + '</div>' : '') +
      '<div class="ed-actions"><a class="btn primary" href="guide/' + (location.search.indexOf('pw') >= 0 ? '' : '') + '">' + ICON.doc + 'Rights guide (PDF)</a></div>' +
      '</div></section>' +
      '<div class="tools"><div class="wrap">' +
      '<input type="search" id="q" placeholder="Search titles and authors" aria-label="Search titles and authors">' +
      '<label class="sr" for="sort">Sort</label><select id="sort"><option value="author">Author A to Z</option><option value="date">Newest first</option><option value="title">Title A to Z</option></select>' +
      '<div class="chips" role="group" aria-label="Filter">' +
      [['all', 'All'], ['Fiction', 'Fiction'], ['Non-fiction', 'Non-fiction'], ["Children's & YA", "Children's & YA"], ['available', 'Available now']].map(function (x) {
        return '<button type="button" class="fchip" data-f="' + esc(x[0]) + '" aria-pressed="' + (x[0] === 'all') + '">' + esc(x[1]) + '</button>';
      }).join('') + '</div><span class="count" id="count" aria-live="polite"></span></div></div>' +
      '<main class="wrap" id="list"></main>' +
      '<dialog id="dlg" aria-labelledby="dlg-title"></dialog>';
    $('#sort').value = state.sort;
    function draw() {
      var q = state.q.toLowerCase();
      var list = titles.filter(function (t) {
        if (q && (t.title + ' ' + t.author + ' ' + (t.pitch || '') + ' ' + (t.genre || '')).toLowerCase().indexOf(q) < 0) return false;
        if (state.f === 'available') return t.status === 'available';
        if (state.f !== 'all') return sectionOf(t) === state.f || (state.f === 'Fiction' && sectionOf(t) === 'Backlist & Estates' && t.form === 'Fiction') || (state.f === 'Non-fiction' && sectionOf(t) === 'Backlist & Estates' && t.form === 'Non-fiction');
        return true;
      }).sort(sorter(state.sort));
      $('#count').textContent = list.length + ' of ' + titles.length;
      var html = '';
      if (!q && state.f === 'all' && highlights.length) {
        html += '<h2 class="section-h">Under option &amp; adapted<span class="n">' + highlights.length + '</span></h2><div class="grid">' + highlights.map(card).join('') + '</div>';
      }
      html += '<h2 class="section-h">' + (state.f === 'all' ? 'All titles' : esc(state.f === 'available' ? 'Available now' : state.f)) + '<span class="n">' + list.length + '</span></h2>';
      html += list.length ? '<div class="grid">' + list.map(card).join('') + '</div>' : '<p>No titles match.</p>';
      $('#list').innerHTML = html;
    }
    function card(t) {
      var lapse = lapseText(t);
      return '<article class="card">' + coverHtml(t, 'cv') + '<div class="body">' +
        '<div>' + chip(t.status) + (t.genre ? ' <span class="count">' + esc(t.genre) + '</span>' : '') + '</div>' +
        '<h3>' + esc(t.title) + '</h3><div class="by">' + esc(t.author) + (when(t) ? ' &middot; ' + esc(when(t)) : '') + '</div>' +
        (lapse ? '<div class="count">' + esc(lapse) + '</div>' : '') +
        (t.pitch ? '<p class="pitch">' + esc(t.pitch.length > 260 ? t.pitch.slice(0, 250) + '…' : t.pitch) + '</p>' : '') +
        (t.credentials ? '<p class="cred">' + esc(t.credentials) + '</p>' : '') +
        '<div class="act"><button class="btn small" type="button" data-enq="' + esc(t.id) + '">' + ICON.mail + 'Enquire</button></div></div></article>';
    }
    $('#q').addEventListener('input', function (e) { state.q = e.target.value; draw(); });
    $('#sort').addEventListener('change', function (e) { state.sort = e.target.value; draw(); });
    $$('.fchip').forEach(function (b) { b.addEventListener('click', function () { state.f = b.dataset.f; $$('.fchip').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); draw(); }); });
    $('#list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-enq]'); if (!b) return;
      var t = titles.filter(function (x) { return x.id === b.dataset.enq; })[0];
      var dlg = $('#dlg');
      dlg.innerHTML = '<div class="dlg-h"><div class="k">Screen rights enquiry</div><h2 id="dlg-title">' + esc(t.title) + '</h2><div>' + esc(t.author) + '</div></div>' +
        '<div class="dlg-b">' + enquiryForm(t, ag, 'catalogue') + '<p style="text-align:right;margin:10px 0 0"><button class="btn ghost" type="button" data-close>Close</button></p></div>';
      wireEnquiry(dlg, t, ag, 'catalogue');
      $('[data-close]', dlg).addEventListener('click', function () { dlg.close(); });
      dlg.showModal();
    });
    draw();
  }

  /* ───────── editor (private) ───────── */
  function editor() {
    if (!K) { app.innerHTML = '<div class="gate"><h1>Private page</h1><p>Please use the link from your email.</p></div>'; return; }
    app.innerHTML = '<div class="loading">Loading your list…</div>';
    get({ action: 'agency_get', slug: SLUG, k: K }).then(function (r) {
      if (!r.ok) { app.innerHTML = '<div class="gate"><h1>Link not recognised</h1><p>Please use the latest link from your email, or write to <a href="mailto:tara@theariel.tv">tara@theariel.tv</a>.</p></div>'; return; }
      var covers = r.titles.map(function (t) { return t.cover || ''; }).concat([r.agency.cover_image || '']);
      return loadImages(SLUG, covers).then(function () { Editor(r.agency, r.titles); });
    }).catch(function () { app.innerHTML = '<div class="gate"><h1>Sorry</h1><p>We could not load your page. Please refresh.</p></div>'; });
  }

  function Editor(ag, titles) {
    document.title = ag.name + ' - your rights list | The Ariel';
    var byId = {}; titles.forEach(function (t) { byId[t.id] = t; });
    var pending = {}, pendingAgency = null, timer = null;
    var state = { q: '', sort: 'author', f: 'all', tab: 'titles' };
    var guideUrl = 'guide/?k=' + encodeURIComponent(K);
    var publicUrl = SITE + SLUG + '/';

    app.innerHTML =
      '<section class="hero ed-hero"><div class="wrap">' +
      '<div class="kicker">Private &middot; only you can see this page</div>' +
      '<h1>' + esc(ag.name) + ': your film &amp; TV rights list</h1>' +
      '<p>We’ve built this from your website so you don’t have to start from scratch. Titles are set to <b>available</b> unless your website told us otherwise. Change anything that isn’t right, add what’s missing, then confirm. ' +
      'Your rights guide, with an Enquire link and QR code for every title, builds itself from this list.</p>' +
      '<div class="stats" id="stats"></div>' +
      '<div class="ed-actions">' +
      '<button class="btn primary" type="button" id="confirm-all">' + ICON.check + '<span>Everything else is correct: confirm all</span></button>' +
      '<a class="btn" href="' + esc(guideUrl) + '" target="_blank" rel="noopener">' + ICON.doc + 'Rights guide (PDF)</a>' +
      '<button class="btn" type="button" data-goto="share">' + ICON.share + 'Share settings</button>' +
      '<span class="save-state" id="save" role="status" style="color:#E9E5DD"></span></div></div></section>' +
      '<div class="wrap"><div class="tabs" role="tablist">' +
      [['titles', 'Your titles'], ['add', 'Add titles'], ['guide', 'Guide & book fairs'], ['share', 'Sharing']].map(function (x) {
        return '<button class="tab" role="tab" type="button" id="tab-' + x[0] + '" aria-controls="p-' + x[0] + '" aria-selected="' + (x[0] === 'titles') + '" data-tab="' + x[0] + '">' + x[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="panel" role="tabpanel" id="p-titles" aria-labelledby="tab-titles"></div>' +
      '<div class="panel" role="tabpanel" id="p-add" aria-labelledby="tab-add" hidden></div>' +
      '<div class="panel" role="tabpanel" id="p-guide" aria-labelledby="tab-guide" hidden></div>' +
      '<div class="panel" role="tabpanel" id="p-share" aria-labelledby="tab-share" hidden></div></div>' +
      '<input type="file" id="file" accept="image/jpeg,image/png,image/webp" hidden>' +
      '<footer class="site" style="margin-top:40px">The Ariel matches the story topline to producers. When a producer is a match and rights are available, we introduce them to you by email. We never pass on manuscripts or take part in negotiations. &middot; <a href="mailto:tara@theariel.tv">tara@theariel.tv</a></footer>';

    function stats() {
      var c = { all: titles.length, available: 0, optioned: 0, produced: 0, check: 0, unconf: 0 };
      titles.forEach(function (t) { c[t.status] = (c[t.status] || 0) + 1; if (!t.confirmed) c.unconf++; });
      $('#stats').innerHTML = [['all', 'Titles'], ['available', 'Available'], ['optioned', 'Under option'], ['produced', 'Adapted'], ['unconf', 'Still to confirm']].map(function (x) {
        return '<div class="stat"><b>' + (c[x[0]] || 0) + '</b><span>' + x[1] + '</span></div>';
      }).join('');
      var b = $('#confirm-all');
      if (!c.unconf) { b.disabled = true; b.querySelector('span').textContent = 'All confirmed'; }
    }

    /* saving */
    function setSave(text, cls) { var s = $('#save'); s.textContent = text; s.className = 'save-state ' + (cls || ''); s.style.color = cls === 'err' ? '#F5B8BF' : '#E9E5DD'; }
    function queue(t) { pending[t.id] = t._tmp ? Object.assign({}, t, { id: '' }) : t; schedule(); }
    function queueAgency(fields) { pendingAgency = Object.assign(pendingAgency || {}, fields); schedule(); }
    function schedule() { setSave('Saving…'); clearTimeout(timer); timer = setTimeout(flush, 900); }
    function flush(extra) {
      var list = Object.keys(pending).map(function (id) { var t = Object.assign({}, pending[id]); return t; });
      var payload = Object.assign({ action: 'agency_save', slug: SLUG, k: K, titles: list }, extra || {});
      if (pendingAgency) payload.agency = pendingAgency;
      pending = {}; pendingAgency = null;
      return post(payload).then(function (r) {
        if (!r.ok) { setSave(r.message || 'Not saved. Please try again.', 'err'); return r; }
        (r.added || []).forEach(function (a) {
          var tmp = titles.filter(function (t) { return t._tmp && t.title === a.title && !t.id_set; })[0];
          if (tmp) { delete byId[tmp.id]; tmp.id = a.id; tmp.id_set = true; delete tmp._tmp; byId[a.id] = tmp; }
        });
        setSave('All changes saved', 'ok');
        return r;
      }).catch(function () { setSave('Offline: changes not saved yet', 'err'); });
    }
    window.addEventListener('beforeunload', function (e) { if (Object.keys(pending).length || pendingAgency) { flush(); e.preventDefault(); e.returnValue = ''; } });

    /* tabs */
    function showTab(name) {
      state.tab = name;
      $$('.tab').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === name); });
      $$('.panel').forEach(function (p) { p.hidden = p.id !== 'p-' + name; });
      ({ titles: drawTitles, add: drawAdd, guide: drawGuide, share: drawShare })[name]();
    }
    $$('.tab').forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.tab); }); });
    $$('[data-goto]').forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.goto); $('.tabs').scrollIntoView({ behavior: 'smooth' }); }); });

    $('#confirm-all').addEventListener('click', function () {
      var n = titles.filter(function (t) { return !t.confirmed; }).length;
      titles.forEach(function (t) { t.confirmed = true; });
      setSave('Saving…');
      flush({ confirm_all: true }).then(function (r) { if (r && r.ok) { toast(n + ' titles confirmed. Thank you!'); stats(); if (state.tab === 'titles') drawTitles(); } });
    });

    /* titles tab */
    function drawTitles() {
      var p = $('#p-titles');
      if (!p.dataset.ready) {
        p.dataset.ready = '1';
        p.innerHTML = '<div class="tools" style="margin:0 -16px;padding-inline:16px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<input type="search" id="eq" placeholder="Search your titles" aria-label="Search your titles">' +
          '<label class="sr" for="esort">Sort</label><select id="esort"><option value="author">Author A to Z</option><option value="date">Publication date, newest</option><option value="title">Title A to Z</option><option value="recent">Recently changed</option></select>' +
          '<div class="chips" role="group" aria-label="Show">' + [['all', 'All'], ['unconf', 'To confirm'], ['available', 'Available'], ['optioned', 'Under option'], ['produced', 'Adapted'], ['check', 'To check'], ['not_available', 'Not available']].map(function (x) {
            return '<button type="button" class="fchip" data-f="' + x[0] + '" aria-pressed="' + (x[0] === 'all') + '">' + x[1] + '</button>';
          }).join('') + '</div><span class="count" id="ecount" aria-live="polite"></span></div></div><div id="rows" style="margin-top:14px"></div>';
        $('#eq').addEventListener('input', function (e) { state.q = e.target.value; rows(); });
        $('#esort').addEventListener('change', function (e) { state.sort = e.target.value; rows(); });
        $$('.fchip', p).forEach(function (b) { b.addEventListener('click', function () { state.f = b.dataset.f; $$('.fchip', p).forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); rows(); }); });
        $('#rows').addEventListener('change', onRowChange);
        $('#rows').addEventListener('input', onRowInput);
        $('#rows').addEventListener('click', onRowClick);
      }
      rows();
    }
    function rows() {
      var q = state.q.toLowerCase();
      var list = titles.filter(function (t) {
        if (q && (t.title + ' ' + t.author).toLowerCase().indexOf(q) < 0) return false;
        if (state.f === 'unconf') return !t.confirmed;
        if (state.f !== 'all') return t.status === state.f;
        return true;
      }).sort(sorter(state.sort));
      $('#ecount').textContent = list.length + ' of ' + titles.length;
      var shown = list.slice(0, 400);
      $('#rows').innerHTML = shown.map(rowHtml).join('') + (list.length > 400 ? '<p class="count">Showing the first 400. Use search to find others.</p>' : '');
    }
    function opt(v, cur, label) { return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label || v || '-') + '</option>'; }
    function rowHtml(t) {
      var id = esc(t.id);
      var sub = [t.author, when(t), t.form].filter(Boolean).map(esc).join(' &middot; ');
      return '<article class="trow' + (t.confirmed ? '' : ' unconf') + '" data-id="' + id + '">' +
        '<div class="main"><button type="button" class="thumb' + (coverSrc(t) ? '' : ' ph') + '" data-act="cover" aria-label="Change cover for ' + esc(t.title) + '">' +
        (coverSrc(t) ? '<img class="thumb" src="' + esc(coverSrc(t)) + '" alt="" referrerpolicy="no-referrer">' : '<span class="t">Add cover</span>') + '</button>' +
        '<div><h3>' + esc(t.title) + '</h3><div class="sub">' + sub + '</div>' +
        (t.credentials ? '<div class="sub" style="font-style:italic">' + esc(t.credentials) + '</div>' : '') +
        (!t.confirmed ? '<div class="flag">Pre-filled by The Ariel from your website' + (t.cover_auto ? '; cover found automatically' : '') + (/^Blurb:/.test(t.agent_note || '') ? '; blurb is the publisher\u2019s description, word for word' : '') + '</div>' : '') + '</div>' +
        '<div class="ctl"><label class="sr" for="st-' + id + '">Film/TV rights for ' + esc(t.title) + '</label>' +
        '<select class="status" id="st-' + id + '" data-k="status">' + ['available', 'optioned', 'produced', 'not_available', 'check'].map(function (s) { return opt(s, t.status, STATUS[s].long); }).join('') + '</select>' +
        '<button class="btn small" type="button" data-act="more" aria-expanded="false">Details</button></div></div>' +
        (t.status === 'optioned' ? '<div class="opt"><div class="field"><label for="ol-' + id + '">Option lapses <span style="text-transform:none;font-weight:400">(recommended)</span></label><input type="date" id="ol-' + id + '" data-k="option_lapse" value="' + esc(t.option_lapse || '') + '"></div>' +
          '<div class="field"><label for="ot-' + id + '">Optioned to</label><input id="ot-' + id + '" data-k="optioned_to" value="' + esc(t.optioned_to || '') + '" placeholder="Production company (optional)"></div></div>' : '') +
        '<div class="more"></div></article>';
    }
    function moreHtml(t) {
      var id = esc(t.id);
      function f(k, label, ph, type) { return '<div class="field"><label for="' + k + '-' + id + '">' + label + '</label><input id="' + k + '-' + id + '" data-k="' + k + '" value="' + esc(t[k] || '') + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + (type ? ' type="' + type + '"' : '') + '></div>'; }
      return '<div class="grid2">' + f('title', 'Title') + f('author', 'Author') + '</div>' +
        '<div class="field"><label for="pi-' + id + '">Pitch (a line or two producers will read first)</label><textarea id="pi-' + id + '" data-k="pitch" placeholder="The story in two sentences: who, what, and why it would work on screen">' + esc(t.pitch || '') + '</textarea></div>' +
        '<div class="grid2">' +
        '<div class="field"><label for="fo-' + id + '">Form</label><select id="fo-' + id + '" data-k="form">' + FORMS.map(function (x) { return opt(x, t.form); }).join('') + '</select></div>' +
        '<div class="field"><label for="sg-' + id + '">Stage</label><select id="sg-' + id + '" data-k="stage">' + STAGES.map(function (x) { return opt(x, t.stage || 'Published'); }).join('') + '</select></div>' +
        f('pub_date', 'Publication date', 'e.g. March 2027') + f('genre', 'Genre', 'e.g. Crime & thriller') +
        f('uk_pub', 'UK publisher', 'e.g. HarperCollins, Spring 2027') + f('us_pub', 'US publisher') +
        '<div class="field"><label for="ma-' + id + '">Material available</label><select id="ma-' + id + '" data-k="material">' + MATERIAL.map(function (x) { return opt(x, t.material || ''); }).join('') + '</select></div>' +
        f('length', 'Length', 'e.g. 90,000 words') + f('agent', 'Agent') + f('screen_agent', 'Film/TV agent') + '</div>' +
        '<div class="field"><label for="cr-' + id + '">Awards, sales and press (one line)</label><input id="cr-' + id + '" data-k="credentials" value="' + esc(t.credentials || '') + '"></div>' +
        '<div class="field"><label for="pr-' + id + '">Praise <span style="text-transform:none;font-weight:400">(one per line: quote - who)</span></label><textarea id="pr-' + id + '" data-k="praise_text">' + esc((t.praise || []).map(function (p) { return p.quote + (p.by ? ' - ' + p.by : ''); }).join('\n')) + '</textarea></div>' +
        '<div class="field"><label for="bi-' + id + '">About the author</label><textarea id="bi-' + id + '" data-k="bio">' + esc(t.bio || '') + '</textarea></div>' +
        '<div class="field"><label for="no-' + id + '">Private note (only you see this)</label><input id="no-' + id + '" data-k="agent_note" value="' + esc(t.agent_note || '') + '"></div>' +
        '<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center">' +
        '<label class="chk"><input type="checkbox" data-k="in_guide"' + (t.in_guide !== false ? ' checked' : '') + '> Include in the guide and catalogue</label>' +
        '<label class="chk"><input type="checkbox" data-k="highlight"' + (t.highlight ? ' checked' : '') + '> Feature at the front of the guide</label>' +
        '<button type="button" class="btn small" data-act="cover">Change cover</button>' +
        (/^https/.test(t.cover || '') || /^img:/.test(t.cover || '') ? '<button type="button" class="btn small ghost" data-act="nocover">Remove cover</button>' : '') +
        '<a class="btn small ghost" href="' + esc(enquireUrl(t.id, 'web')) + '" target="_blank" rel="noopener">Preview enquiry page</a>' +
        '<button type="button" class="btn small ghost" data-act="delete" style="color:var(--no)">Remove title</button></div>';
    }
    function rowOf(el) { var r = el.closest('.trow'); return r ? byId[r.dataset.id] : null; }
    function setField(t, k, v) {
      if (k === 'praise_text') {
        t.praise = String(v).split('\n').map(function (l) { var m = /^(.*?)(?:\s+[-–]\s+([^-–]+))?$/.exec(l.trim()); return m && m[1] ? { quote: m[1].replace(/^["“']|["”']$/g, ''), by: m[2] || '' } : null; }).filter(Boolean);
      } else t[k] = v;
      t.confirmed = true;
      queue(t);
    }
    function onRowChange(e) {
      var el = e.target, t = rowOf(el), k = el.dataset.k; if (!t || !k) return;
      setField(t, k, el.type === 'checkbox' ? el.checked : el.value);
      if (k === 'status') {
        var row = el.closest('.trow'), open = row.classList.contains('open');
        row.outerHTML = rowHtml(t);
        if (open) { var nr = $('.trow[data-id="' + t.id + '"]'); nr.classList.add('open'); $('.more', nr).innerHTML = moreHtml(t); }
        stats();
        if (t.status === 'optioned') { var li = $('#ol-' + t.id); if (li) li.focus(); }
      }
    }
    function onRowInput(e) {
      var el = e.target, t = rowOf(el), k = el.dataset.k; if (!t || !k || el.tagName === 'SELECT' || el.type === 'checkbox') return;
      setField(t, k, el.value);
      if (k === 'title' || k === 'author') { var r = el.closest('.trow'); $('h3', r).textContent = t.title; }
    }
    var coverTarget = null;
    function onRowClick(e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var t = rowOf(b), row = b.closest('.trow');
      if (b.dataset.act === 'more') {
        var open = row.classList.toggle('open'); b.setAttribute('aria-expanded', open);
        if (open) { $('.more', row).innerHTML = moreHtml(t); var first = $('.more textarea', row); if (first) first.focus(); }
      } else if (b.dataset.act === 'cover') { coverTarget = t; $('#file').click(); }
      else if (b.dataset.act === 'nocover') { t.cover = ''; t.cover_auto = false; queue(t); row.outerHTML = rowHtml(t); }
      else if (b.dataset.act === 'delete') {
        if (!window.confirm('Remove “' + t.title + '” from your list?')) return;
        titles.splice(titles.indexOf(t), 1); delete byId[t.id];
        setSave('Saving…'); flush({ deletes: [t.id] }); row.remove(); stats();
      }
    }

    /* image upload (resized in the browser, stored by The Ariel) */
    function resize(file, maxW) {
      return new Promise(function (res, rej) {
        var img = new Image(), url = URL.createObjectURL(file);
        img.onload = function () {
          var w = Math.min(maxW, img.width), h = Math.round(img.height * w / img.width);
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          var q = 0.84, d = c.toDataURL('image/jpeg', q);
          while (d.length > 520000 && q > 0.4) { q -= 0.08; d = c.toDataURL('image/jpeg', q); }
          URL.revokeObjectURL(url); res(d);
        };
        img.onerror = function () { rej(new Error('bad image')); };
        img.src = url;
      });
    }
    function upload(file, maxW) {
      setSave('Uploading image…');
      return resize(file, maxW).then(function (data) {
        return post({ action: 'agency_upload', slug: SLUG, k: K, data: data }).then(function (r) {
          if (!r.ok) { setSave(r.message || 'Upload failed', 'err'); throw new Error('upload'); }
          IMG[r.ref.slice(4)] = data; return r.ref;
        });
      });
    }
    var guideCoverPick = false;
    $('#file').addEventListener('change', function (e) {
      var file = e.target.files[0]; e.target.value = ''; if (!file) return;
      if (guideCoverPick) {
        guideCoverPick = false;
        upload(file, 1240).then(function (ref) { ag.cover_image = ref; queueAgency({ cover_image: ref }); drawGuide(); toast('Guide cover updated'); }).catch(function () {});
        return;
      }
      var t = coverTarget; if (!t) return;
      upload(file, 600).then(function (ref) {
        t.cover = ref; t.cover_auto = false; setField(t, 'cover', ref);
        var row = $('.trow[data-id="' + t.id + '"]'); if (row) { var open = row.classList.contains('open'); row.outerHTML = rowHtml(t); if (open) { var nr = $('.trow[data-id="' + t.id + '"]'); nr.classList.add('open'); $('.more', nr).innerHTML = moreHtml(t); } }
        toast('Cover updated');
      }).catch(function () {});
    });

    /* add tab */
    function drawAdd() {
      var p = $('#p-add');
      var todo = (ag.authors_to_add || []).filter(function (x) { return !x.done; });
      p.innerHTML =
        '<div class="box"><h2>Add a title</h2><p class="lead">Include forthcoming books, titles on submission and proposals: producers often want to be first.</p>' +
        '<form id="addf"><div class="grid2">' +
        '<div class="field"><label for="a-t">Title</label><input id="a-t" name="title" required></div>' +
        '<div class="field"><label for="a-a">Author</label><input id="a-a" name="author" required></div>' +
        '<div class="field"><label for="a-s">Stage</label><select id="a-s" name="stage">' + STAGES.map(function (x) { return opt(x, 'Published'); }).join('') + '</select></div>' +
        '<div class="field"><label for="a-d">Publication date</label><input id="a-d" name="pub_date" placeholder="e.g. Spring 2027"></div>' +
        '<div class="field"><label for="a-f">Form</label><select id="a-f" name="form">' + FORMS.map(function (x) { return opt(x, 'Fiction'); }).join('') + '</select></div>' +
        '<div class="field"><label for="a-r">Film/TV rights</label><select id="a-r" name="status">' + ['available', 'optioned', 'produced', 'not_available'].map(function (s) { return opt(s, 'available', STATUS[s].long); }).join('') + '</select></div></div>' +
        '<div class="field"><label for="a-p">Pitch</label><textarea id="a-p" name="pitch" placeholder="The story in two sentences"></textarea></div>' +
        '<button class="btn dark" type="submit">Add title</button></form></div>' +
        '<div class="box"><h2>Paste a list</h2><p class="lead">Copy rows straight from a spreadsheet or your last rights guide: one title per line, as <b>Title, Author, Year</b> (tabs work too).</p>' +
        '<div class="field"><label for="bulk">Titles</label><textarea id="bulk" style="min-height:140px" placeholder="The Lake, Catherine Cooper, 2026&#10;A New Book, Author Name, 2027"></textarea></div>' +
        '<button class="btn dark" type="button" id="bulk-go">Add these titles</button> <span class="count" id="bulk-n"></span></div>' +
        (todo.length ? '<div class="box"><h2>Authors we couldn’t read</h2><p class="lead">Your website wouldn’t let us read these ' + todo.length + ' author pages. Add their titles here, or just reply to our email and we’ll do it for you.</p>' +
          '<div class="authors-add">' + todo.map(function (x) { return '<button type="button" class="btn small" data-author="' + esc(x.name) + '"><span>' + esc(x.name) + '</span><span aria-hidden="true">+</span></button>'; }).join('') + '</div></div>' : '');
      $('#addf').addEventListener('submit', function (e) {
        e.preventDefault();
        var d = Object.fromEntries(new FormData(e.target).entries());
        if (!d.title.trim() || !d.author.trim()) return;
        addTitles([d]); e.target.reset(); toast('Added “' + d.title + '”');
        $('#a-t').focus();
      });
      $('#bulk').addEventListener('input', function () { $('#bulk-n').textContent = parseBulk($('#bulk').value).length + ' titles found'; });
      $('#bulk-go').addEventListener('click', function () {
        var list = parseBulk($('#bulk').value); if (!list.length) return;
        addTitles(list); $('#bulk').value = ''; $('#bulk-n').textContent = ''; toast(list.length + ' titles added');
      });
      $$('[data-author]', p).forEach(function (b) {
        b.addEventListener('click', function () { $('#a-a').value = b.dataset.author; $('#a-t').focus(); $('#addf').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      });
    }
    function parseBulk(txt) {
      return String(txt || '').split('\n').map(function (l) {
        var parts = l.indexOf('\t') >= 0 ? l.split('\t') : l.split(/,\s*/);
        parts = parts.map(function (s) { return s.trim(); });
        if (!parts[0]) return null;
        var year = parts.filter(function (s) { return /^\d{4}$/.test(s); })[0] || '';
        var rest = parts.filter(function (s) { return s !== year; });
        return { title: rest[0], author: rest[1] || '', year: year };
      }).filter(function (x) { return x && x.title; });
    }
    function addTitles(list) {
      list.forEach(function (d) {
        var t = Object.assign({ status: 'available', form: 'Fiction', in_guide: true, confirmed: true, added_by: 'agency', stage: 'Published' }, d);
        t.id = 'tmp' + Math.random().toString(36).slice(2, 9); t._tmp = true; t.updated_at = new Date().toISOString();
        titles.push(t); byId[t.id] = t; pending[t.id] = Object.assign({}, t, { id: '' });
        (ag.authors_to_add || []).forEach(function (x) { if (x.name === t.author) x.done = true; });
      });
      queueAgency({ authors_to_add: ag.authors_to_add || [] });
      stats(); drawAdd();
    }

    /* guide & fairs tab */
    function drawGuide() {
      var p = $('#p-guide');
      var fairs = ag.fairs && ag.fairs.length ? ag.fairs : [{ fair: '', dates: '', where: '', who: '' }];
      var coverPrev = coverSrc({ cover: ag.cover_image || '' });
      p.innerHTML =
        '<div class="box"><h2>Your rights guide</h2><p class="lead">Built from this list, always up to date. Every title gets an <b>Enquire</b> button and a QR code, so a producer reading it on screen or on paper can reach you in one step.</p>' +
        '<div class="grid2"><div class="field"><label for="g-t">Guide title</label><input id="g-t" data-a="guide_title" value="' + esc(ag.guide_title || 'Film & TV Rights Guide') + '"></div>' +
        '<div class="field"><label for="g-s">Season</label><input id="g-s" data-a="season" value="' + esc(ag.season || '') + '" placeholder="e.g. London Book Fair 2027"></div></div>' +
        '<div class="field"><label for="g-i">Welcome line (optional)</label><textarea id="g-i" data-a="intro" placeholder="A sentence about your list for producers">' + esc(ag.intro || '') + '</textarea></div>' +
        '<div class="grid2"><div class="field"><label for="g-o">Order titles by</label><select id="g-o" data-a="guide_sort">' + opt('author', ag.guide_sort || 'author', 'Author A to Z') + opt('date', ag.guide_sort, 'Publication date, newest first') + opt('title', ag.guide_sort, 'Title A to Z') + '</select></div>' +
        '<div class="field"><label for="g-c">Brand colour</label><input id="g-c" type="color" data-a="accent" value="' + esc(ag.accent || '#1B1F3B') + '" style="min-height:44px;padding:4px"></div></div>' +
        '<div class="field"><span class="lbl">Cover</span><div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">' +
        (coverPrev ? '<img src="' + esc(coverPrev) + '" alt="Your guide cover" style="width:90px;aspect-ratio:210/297;object-fit:cover;border:1px solid var(--line)">' : '<span class="hint" style="font-size:14px;color:var(--muted)">No cover uploaded: we design one from your book jackets.</span>') +
        '<button type="button" class="btn small" id="g-cover">' + (coverPrev ? 'Change cover' : 'Upload your own cover') + '</button>' +
        (coverPrev ? '<button type="button" class="btn small ghost" id="g-nocover">Use our designed cover</button>' : '') + '</div></div>' +
        '<a class="btn primary" href="' + esc(guideUrl) + '" target="_blank" rel="noopener">' + ICON.doc + 'Open and download the guide</a></div>' +
        '<div class="box"><h2>Where to find you at the fairs</h2><p class="lead">Shown on your guide’s cover and your catalogue page.</p><div id="fairs">' +
        fairs.map(fairRow).join('') + '</div><button type="button" class="btn small" id="fair-add">Add another fair</button></div>' +
        '<div class="box"><h2>Contact for enquiries</h2><p class="lead">Producer introductions go to this person, from tara@theariel.tv.</p><div class="grid2">' +
        '<div class="field"><label for="c-n">Name</label><input id="c-n" data-a="contact_name" value="' + esc(ag.contact_name || '') + '"></div>' +
        '<div class="field"><label for="c-r">Role</label><input id="c-r" data-a="contact_role" value="' + esc(ag.contact_role || '') + '"></div>' +
        '<div class="field"><label for="c-e">Email</label><input id="c-e" type="email" data-a="contact_email" value="' + esc(ag.contact_email || '') + '"></div>' +
        '<div class="field"><label for="c-c">Also copy (optional)</label><input id="c-c" type="email" data-a="cc_email" value="' + esc(ag.cc_email || '') + '"></div></div></div>';
      $$('[data-a]', p).forEach(function (el) {
        el.addEventListener(el.tagName === 'SELECT' || el.type === 'color' ? 'change' : 'input', function () { ag[el.dataset.a] = el.value; var o = {}; o[el.dataset.a] = el.value; queueAgency(o); });
      });
      $('#g-cover').addEventListener('click', function () { guideCoverPick = true; $('#file').click(); });
      if ($('#g-nocover')) $('#g-nocover').addEventListener('click', function () { ag.cover_image = ''; queueAgency({ cover_image: '' }); drawGuide(); });
      $('#fair-add').addEventListener('click', function () { $('#fairs').insertAdjacentHTML('beforeend', fairRow({}, $$('.fair-row').length)); });
      $('#fairs').addEventListener('input', saveFairs);
      $('#fairs').addEventListener('click', function (e) { var b = e.target.closest('[data-rmfair]'); if (b) { b.closest('.fair-row').remove(); saveFairs(); } });
    }
    function fairRow(f, i) {
      i = i || 0; var n = Math.random().toString(36).slice(2, 7);
      return '<div class="fair-row">' +
        '<div class="field"><label for="ff-' + n + '">Fair</label><input id="ff-' + n + '" data-f="fair" value="' + esc(f.fair || '') + '" placeholder="London Book Fair" list="fairlist"></div>' +
        '<div class="field"><label for="fd-' + n + '">Dates</label><input id="fd-' + n + '" data-f="dates" value="' + esc(f.dates || '') + '" placeholder="10-12 March 2027"></div>' +
        '<div class="field"><label for="fw-' + n + '">Stand / table</label><input id="fw-' + n + '" data-f="where" value="' + esc(f.where || '') + '" placeholder="Rights Centre, table 12C"></div>' +
        '<div class="field"><label for="fp-' + n + '">Who’s there</label><input id="fp-' + n + '" data-f="who" value="' + esc(f.who || '') + '" placeholder="Lucy Fawcett (film/TV)"></div>' +
        '<button type="button" class="btn small ghost" data-rmfair aria-label="Remove this fair">Remove</button></div>' +
        (i === 0 && !document.getElementById('fairlist') ? '<datalist id="fairlist"><option value="London Book Fair"><option value="Frankfurt Book Fair"><option value="Bologna Children’s Book Fair"><option value="Berlinale Books at Berlinale"><option value="Frankfurt Book Fair: Frankfurt Studio"><option value="Sharjah International Book Fair"></datalist>' : '');
    }
    function saveFairs() {
      ag.fairs = $$('.fair-row').map(function (r) { var o = {}; $$('[data-f]', r).forEach(function (el) { o[el.dataset.f] = el.value; }); return o; }).filter(function (o) { return o.fair || o.where; });
      queueAgency({ fairs: ag.fairs });
    }

    /* share tab */
    function drawShare() {
      var p = $('#p-share');
      var vis = ag.visibility || 'private';
      p.innerHTML = '<div class="box"><h2>Who can see your list?</h2><p class="lead">Your rights guide PDF always works, whichever you choose: its Enquire links and QR codes open a page for that one title.</p>' +
        [['private', 'Private', 'Only you. The Ariel uses it to match titles to producers’ briefs.'],
         ['password', 'Password protected', 'Send the link and password to the producers and scouts you choose.'],
         ['public', 'Public link', 'Anyone with the link can browse your catalogue: use it as your online rights list.']].map(function (x) {
          return '<label class="radio"><input type="radio" name="vis" value="' + x[0] + '"' + (vis === x[0] ? ' checked' : '') + '><span><b>' + x[1] + '</b>' + x[2] + '</span></label>';
        }).join('') +
        '<div id="pwbox" class="field" style="margin-top:10px"' + (vis === 'password' ? '' : ' hidden') + '><label for="pw1">Password' + (ag.has_password ? ' (leave blank to keep the current one)' : '') + '</label>' +
        '<div class="linkbox"><input id="pw1" type="text" autocomplete="off" placeholder="Choose a password"><button class="btn small dark" type="button" id="pw-save">Save password</button></div></div>' +
        '<p class="save-state" id="vis-msg" role="status"></p></div>' +
        '<div class="box"><h2>Your links</h2>' +
        '<div class="field"><span class="lbl">Catalogue</span><div class="linkbox"><input readonly value="' + esc(publicUrl) + '" aria-label="Catalogue link"><button class="btn small" type="button" data-copy="' + esc(publicUrl) + '">Copy</button><a class="btn small" href="' + esc(publicUrl) + '" target="_blank" rel="noopener">Open</a></div></div>' +
        '<div class="field"><span class="lbl">Rights guide</span><div class="linkbox"><input readonly value="' + esc(publicUrl + 'guide/') + '" aria-label="Guide link"><button class="btn small" type="button" data-copy="' + esc(publicUrl + 'guide/') + '">Copy</button></div>' +
        '<span class="hint">Opens for anyone when your list is public, or with the password.</span></div>' +
        '<div class="field"><span class="lbl">QR code for your catalogue</span><div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div id="cat-qr" style="width:140px;background:#FFF;padding:6px;border:1px solid var(--line)"></div>' +
        '<span class="hint" style="max-width:420px">Put it on your stand at the fair, on a postcard or in an email signature. Right-click to save the image.</span></div></div>' +
        '<p style="font-size:14px;color:var(--muted);margin:0">This page’s private link is your key: please don’t forward it outside your agency.</p></div>';
      ensureQR().then(function () { $('#cat-qr').innerHTML = qrSvg(publicUrl, 4); });
      $$('input[name=vis]', p).forEach(function (r) {
        r.addEventListener('change', function () {
          $('#pwbox').hidden = r.value !== 'password';
          if (r.value === 'password' && !ag.has_password) { $('#pw1').focus(); $('#vis-msg').textContent = 'Choose a password, then save it.'; return; }
          setVis(r.value);
        });
      });
      $('#pw-save').addEventListener('click', function () {
        var pw = $('#pw1').value.trim();
        if (!pw && !ag.has_password) { $('#vis-msg').textContent = 'Please type a password.'; return; }
        setVis('password', pw);
      });
      $$('[data-copy]', p).forEach(function (b) { b.addEventListener('click', function () { navigator.clipboard.writeText(b.dataset.copy).then(function () { toast('Link copied'); }); }); });
    }
    function setVis(v, pw) {
      $('#vis-msg').textContent = 'Saving…';
      var a = { visibility: v }; if (pw) a.password = pw;
      post({ action: 'agency_save', slug: SLUG, k: K, agency: a, titles: [] }).then(function (r) {
        if (!r.ok) { $('#vis-msg').textContent = r.message || 'Not saved.'; return; }
        ag.visibility = v; if (pw) ag.has_password = true;
        $('#vis-msg').textContent = v === 'private' ? 'Your list is private.' : v === 'public' ? 'Your catalogue is live at the link below.' : 'Password saved. Your catalogue needs it to open.';
        if (pw) $('#pw1').value = '';
      });
    }

    stats();
    showTab('titles');
  }

  /* ───────── print guide ───────── */
  function ensureQR() {
    if (window.qrcode) return Promise.resolve();
    return new Promise(function (res) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
      s.onload = res; s.onerror = res; document.head.appendChild(s);
    });
  }

  function guide() {
    app.innerHTML = '<div class="loading">Building your guide…</div>';
    var pw = Q.get('pw') || '';
    try { pw = pw || sessionStorage.getItem('ariel-pw-' + SLUG) || ''; } catch (e) {}
    var req = K ? get({ action: 'agency_get', slug: SLUG, k: K }) : get({ action: 'agency_public', slug: SLUG, pw: pw });
    Promise.all([req, ensureQR()]).then(function (res) {
      var r = res[0];
      if (!r.ok) {
        app.innerHTML = '<div class="gate"><h1>' + esc(r.name || 'Rights guide') + '</h1><p>' + (r.error === 'password' || r.error === 'wrong_password' ? 'This guide is password protected. <a href="../">Open the catalogue</a> and enter the password first.' : 'This guide is private.') + '</p></div>';
        return;
      }
      var titles = r.titles.filter(function (t) { return t.in_guide !== false && ['available', 'optioned', 'produced'].indexOf(t.status) >= 0; });
      return loadImages(SLUG, titles.concat([{ cover: r.agency.cover_image || '' }])).then(function () { renderGuide(r.agency, titles, r.titles); });
    }).catch(function () { app.innerHTML = '<div class="gate"><h1>Sorry</h1><p>We could not build the guide. Please refresh.</p></div>'; });
  }

  function renderGuide(ag, titles, all) {
    var name = ag.name, gt = ag.guide_title || 'Film & TV Rights Guide';
    document.title = name + ' - ' + gt + (ag.season ? ' - ' + ag.season : '');
    if (ag.accent) document.documentElement.style.setProperty('--accent', ag.accent);
    var st = document.createElement('style');
    st.textContent = '@page{@bottom-left{content:"' + (name + '  ·  ' + gt + (ag.season ? ', ' + ag.season : '')).replace(/"/g, '') + '";font:9px Lato,Arial,sans-serif;color:#4A5165;padding-left:16mm}@bottom-right{content:counter(page);font:9px Lato,Arial,sans-serif;color:#4A5165;padding-right:16mm}}';
    document.head.appendChild(st);
    var sort = sorter(ag.guide_sort || 'author');
    var highlights = titles.filter(function (t) { return t.highlight || t.status === 'optioned' || t.status === 'produced'; }).sort(sort);
    var groups = {};
    titles.forEach(function (t) { var s = sectionOf(t); (groups[s] = groups[s] || []).push(t); });
    var order = SECTION_ORDER.concat(Object.keys(groups).filter(function (s) { return SECTION_ORDER.indexOf(s) < 0; })).filter(function (s) { return groups[s]; });
    var unconfirmed = (all || []).some(function (t) { return t.confirmed === false; });
    var latest = (all || titles).reduce(function (m, t) { return t.updated_at > m ? t.updated_at : m; }, '');
    var upd = latest ? new Date(latest).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    var withCovers = titles.filter(function (t) { return coverSrc(t); });
    var hero = highlights.filter(function (t) { return coverSrc(t); }).concat(withCovers).filter(function (t, i, a) { return a.indexOf(t) === i; }).slice(0, 10);
    var coverImg = coverSrc({ cover: ag.cover_image || '' });
    var catUrl = SITE + SLUG + '/';

    var html = '<div class="sheet">';
    // cover
    html += '<section class="pg gcover">' + (coverImg ? '<img class="full" src="' + esc(coverImg) + '" alt="' + esc(name) + ' ' + esc(gt) + '">' :
      '<div class="in"><div class="gt">' + esc(gt) + '</div><div class="season">' + esc(ag.season || '') + '</div><div class="rule"></div><div class="ag">' + esc(name) + '</div>' +
      (hero.length ? '<div class="covers">' + hero.map(function (t) { return '<img src="' + esc(coverSrc(t)) + '" alt="" referrerpolicy="no-referrer">'; }).join('') + '</div>' : '') +
      '<div class="foot"><div>' + (ag.contact_name ? '<b>' + esc(ag.contact_name) + '</b>' + (ag.contact_role ? ', ' + esc(ag.contact_role) : '') + '<br>' : '') + (ag.contact_email ? esc(ag.contact_email) + '<br>' : '') + esc(ag.site || '').replace(/^https?:\/\//, '') + '</div>' +
      '<div style="text-align:right">' + (ag.fairs || []).filter(function (f) { return f.fair; }).map(function (f) { return '<b>' + esc(f.fair) + '</b>' + (f.where ? ': ' + esc(f.where) : ''); }).join('<br>') + '</div></div></div>') + '</section>';
    // contents + how to enquire + fairs
    html += '<section class="pg" id="contents"><div class="gk">' + esc(gt) + (ag.season ? ' &middot; ' + esc(ag.season) : '') + '</div><h1 class="gh">' + esc(name) + '</h1>' +
      (ag.intro ? '<p style="font-size:14px;max-width:150mm">' + esc(ag.intro) + '</p>' : '') +
      '<ul class="toc">' + (highlights.length ? '<li><a href="#s-highlights">Under option &amp; adapted</a><span>' + highlights.length + '</span></li>' : '') +
      order.map(function (s, i) { return '<li><a href="#s-' + i + '">' + esc(s) + '</a><span>' + groups[s].length + ' titles</span></li>'; }).join('') +
      '<li><a href="#s-index">Index of authors</a><span></span></li><li><a href="#s-contact">Contact</a><span></span></li></ul>' +
      '<div class="howto"><div><h3>Interested in a title?</h3><p>Click <b>Enquire</b> next to it, or scan its QR code with your phone camera. We’ll introduce you to ' + esc(ag.contact_name || name) + ' by email, usually within minutes.</p>' +
      '<p style="margin:0">See the live list, always up to date: <a href="' + esc(catUrl) + '">' + esc(catUrl.replace('https://', '')) + '</a></p></div>' +
      '<div class="qr" style="width:28mm">' + qrSvg(catUrl, 3) + '</div></div>' +
      ((ag.fairs || []).filter(function (f) { return f.fair; }).length ? '<h2 class="gh" style="font-size:26px;margin-top:10mm">Find us at the fairs</h2><div class="gfairs">' + fairsHtml(ag.fairs, 'gfair') + '</div>' : '') +
      '<p class="draft">' + (upd ? 'Updated ' + esc(upd) + '. ' : '') + (unconfirmed && K ? 'Draft prepared by The Ariel from your website: please check every title before you share it.' : 'Rights information is supplied by ' + esc(name) + '.') + '</p></section>';
    // highlights
    if (highlights.length) {
      html += '<section class="pg flow" id="s-highlights"><div class="gk">Track record</div><h2 class="gh">Under option &amp; adapted</h2><div class="hl-grid">' + highlights.map(function (t) {
        return '<div class="hl">' + coverHtml(t, '') + '<b>' + esc(t.title) + '</b>' + esc(t.author) + '<br><span style="color:var(--gold-deep)">' + esc(STATUS[t.status].long) + (lapseText(t) ? ' ' + esc(lapseText(t)) : '') + '</span>' + (t.credentials ? '<br>' + esc(t.credentials) : '') + '</div>';
      }).join('') + '</div></section>';
    }
    // sections
    order.forEach(function (s, i) {
      var list = groups[s].sort(sort);
      html += '<section class="pg flow" id="s-' + i + '"><div class="gk">' + esc(name) + '</div><h2 class="gh" style="font-size:46px;border-bottom:3px solid var(--gold);padding-bottom:4mm">' + esc(s) + '</h2>' +
        groupSlim(list) + '</section>';
    });
    // index
    var authors = {};
    titles.forEach(function (t) { (authors[t.author] = authors[t.author] || []).push(t); });
    html += '<section class="pg flow" id="s-index"><h2 class="gh">Index of authors</h2><div class="idx">' + Object.keys(authors).sort(function (a, b) { return surname(a).localeCompare(surname(b)); }).map(function (a) {
      return '<p><b>' + esc(a) + '</b>: ' + authors[a].map(function (t) { return '<a href="#t-' + esc(t.id) + '">' + esc(t.title) + '</a>'; }).join(', ') + '</p>';
    }).join('') + '</div></section>';
    // back
    html += '<section class="pg back" id="s-contact"><div style="padding:26mm 20mm 0"><div class="gk" style="color:var(--gold-light)">Contact</div><h2 class="gh" style="font-size:52px">' + esc(name) + '</h2>' +
      '<p style="font-size:15px;line-height:1.7">' + (ag.contact_name ? '<b>' + esc(ag.contact_name) + '</b>' + (ag.contact_role ? ', ' + esc(ag.contact_role) : '') + '<br>' : '') +
      (ag.contact_email ? '<a href="mailto:' + esc(ag.contact_email) + '">' + esc(ag.contact_email) + '</a><br>' : '') + (ag.phone ? esc(ag.phone) + '<br>' : '') + (ag.address ? esc(ag.address) + '<br>' : '') +
      (ag.site ? '<a href="' + esc(ag.site) + '">' + esc(ag.site.replace(/^https?:\/\//, '')) + '</a>' : '') + '</p>' +
      ((ag.fairs || []).filter(function (f) { return f.fair; }).length ? '<p style="font-size:14px">' + (ag.fairs || []).filter(function (f) { return f.fair; }).map(function (f) { return '<b>' + esc(f.fair) + '</b>' + (f.dates ? ', ' + esc(f.dates) : '') + (f.where ? ': ' + esc(f.where) : '') + (f.who ? ' (' + esc(f.who) + ')' : ''); }).join('<br>') + '</p>' : '') + '</div>' +
      '<div style="padding:0 20mm 22mm;display:flex;justify-content:space-between;align-items:flex-end;gap:10mm"><div style="font-size:12px;color:#D8D3C8;max-width:110mm">The live list, always up to date:<br><a href="' + esc(catUrl) + '">' + esc(catUrl.replace('https://', '')) + '</a>' +
      '<br><br>Enquiries are introductions made by The Ariel, which matches story toplines to producers. The Ariel never passes on manuscripts or takes part in negotiations.</div>' +
      '<div class="qrbig">' + qrSvg(catUrl, 4) + '</div></div></section>';
    html += '</div>';

    app.innerHTML = '<div class="guide-ui"><div class="wrap"><p><b>' + esc(name) + '</b> &middot; ' + titles.length + ' titles' + (K ? ' &middot; draft from your private page' : '') + '</p>' +
      '<span><button class="btn primary small" type="button" id="dl">' + ICON.doc + 'Download PDF</button>' + (K ? ' <a class="btn small" href="../edit/?k=' + encodeURIComponent(K) + '">Back to your list</a>' : ' <a class="btn small" href="../">Catalogue</a>') + '</span></div>' +
      '<div class="wrap no-print" style="padding-top:6px"><p style="font-size:13px;color:#CFCBD9">In the print window choose <b>Save as PDF</b>. Every Enquire button stays clickable in the saved file.</p></div></div>' + html;
    $('#dl').addEventListener('click', function () { window.print(); });

    function groupSlim(list) {
      return '<div class="slimgrid">' + list.map(entry).join('') + '</div>';
    }
    function entry(t) {
      var facts = [];
      function fact(k, v) { if (v) facts.push('<dt>' + k + '</dt><dd>' + esc(v) + '</dd>'); }
      fact('Published', when(t)); fact('Genre', t.genre); fact('UK', t.uk_pub); fact('US', t.us_pub); fact('Material', t.material); fact('Length', t.length);
      fact('Agent', t.agent); fact('Film/TV agent', t.screen_agent); fact('Rights sold', t.rights_sold);
      fact('Film/TV', STATUS[t.status].long.replace('Film/TV rights available', 'Available') + (lapseText(t) ? ', ' + lapseText(t) : ''));
      var url = enquireUrl(t.id, 'pdf'), qurl = enquireUrl(t.id, 'qr');
      var slim = !t.pitch && !(t.praise || []).length && !t.bio;
      return '<article class="entry' + (slim ? ' slim' : '') + '" id="t-' + esc(t.id) + '"><div>' + coverHtml(t, 'cvr') + '</div><div>' +
        '<div class="gk">' + esc(t.genre || t.form || '') + '</div><h3>' + esc(t.title) + '</h3><div class="au">' + esc(t.author) + '</div>' +
        (t.pitch ? '<p class="pitch">' + esc(t.pitch.length > 1100 ? t.pitch.slice(0, 1100).replace(/\s+\S*$/, '') + '…' : t.pitch) + '</p>' : '') +
        (t.credentials ? '<p class="cred">' + esc(t.credentials) + '</p>' : '') +
        ((t.praise || []).length ? '<p class="praise">' + t.praise.slice(0, 3).map(function (p) { return '<q>' + esc(p.quote) + '</q>' + (p.by ? ' <b>' + esc(p.by) + '</b>' : ''); }).join('<br>') + '</p>' : '') +
        '<dl class="facts">' + facts.join('') + '</dl>' +
        (t.bio ? '<p class="pitch" style="font-size:10.5px;color:var(--muted)">' + esc(t.bio) + '</p>' : '') + '</div>' +
        '<div class="side"><div class="qr">' + qrSvg(qurl, 2) + '</div>Scan to enquire<a class="enq-btn" href="' + esc(url) + '">Enquire</a><div class="stc">' + chip(t.status) + '</div></div></article>';
    }
  }

  if (VIEW === 'catalogue') catalogue();
  else if (VIEW === 'edit') editor();
  else if (VIEW === 'guide') guide();
})();
