/**
 * Ariel Genres - ready-made genre feeds with a free 30-day trial (The Ariel).
 * v1.0 2026-11-04
 *
 * Lives in the same Apps Script project as the London Review of Reviews, so it shares
 * the sheet, the sending alias, the Members tab (unlimited rights checks) and the admin secret.
 *
 * Tabs (auto-created by ensureGenres_):
 *   GenreItems    - one row per story placed in a genre feed (written by the daily distribution run)
 *   GenreSubs     - one row per person: genres, trial dates, plan, token (the token is their dashboard key)
 *   GenreActions  - every Save / Not for me / intro click, per person
 *   GenreRequests - Request a genre
 *   Config keys   - genre_feed_key, genre_one_url, genre_all_url, genre_digest_hour, genre_book_url
 *
 * Public web API (all JSON):
 *   POST {action:"genre_signup", email, name, role, company, genres[], ror, website, source}
 *   GET  ?action=genre_feed&k=TOKEN                 (first call activates the trial)
 *   GET  ?action=genre_sample                       (3 recent real stories per genre, for the landing page)
 *   POST {action:"genre_act", k, item_id, act:"save"|"skip"|"unsave"|"unskip"}
 *   POST {action:"genre_settings", k, genres[], digest:"daily"|"weekly"|"off"}
 *   POST {action:"genre_keep", k, plan:"one"|"all", genre}
 *   POST {action:"genre_upgrade", k}
 *   POST {action:"genre_intro", k, item_id}
 *   POST {action:"genre_request", genre, note, email, name, role, k, website}
 *   POST {action:"genre_link", email}               (lost link: re-sends the dashboard link)
 *
 * Feed API for the distribution run (behaves like a client endpoint):
 *   POST <exec>?genre=<slug>&key=<genre_feed_key>   body {"entries":[...]}  -> {success, added, skipped}
 *   GET  <exec>?genre=<slug>&key=<key>&action=items        -> recent items for dedup
 *   GET  <exec>?genre=<slug>&key=<key>&action=preferences  -> lens, labels, items_per_day
 *
 * Admin (POST {action:"admin", secret, op}):
 *   genre_stats, genre_subs, genre_requests, activate_genre {email, plan, months|paid_until, genre}, genre_add {genre, entries}
 *
 * Hourly trigger genreTick(): activation housekeeping, trial emails (day 21, day 28, end),
 * daily digests at genre_digest_hour London, Stripe payment detection from Gmail.
 */

var GENRES = {
  'true-crime': {
    name: 'True Crime',
    blurb: 'Unsolved and contested cases, miscarriages of justice, cases with unseen tapes or archive, and new true crime books.',
    labels: ['Unsolved', 'Miscarriages of Justice', 'Cons & Cults', 'New Evidence', 'True Crime Books'],
    items_per_day: 6,
    lens: 'Ready-made True Crime feed for documentary and drama developers. Surface cases with a named victim, suspect or investigator at the centre and a genuinely new way in: unsolved and cold cases with fresh movement, contested convictions and miscarriages of justice, cons, cults and coercive control, cases unlocked by new evidence (DNA, tapes, archive, leaked files), and newly published or acquired true crime books. Strongly favour stories where unseen material, new access or a fresh angle exists. Both UK and international cases.',
    avoid: 'Straight court reporting with no new angle; crime statistics and policy commentary; generic US true crime retellings; anything already made into a documentary or series, or announced as one.'
  },
  'political-scandal': {
    name: 'Political Scandal',
    blurb: 'Cover-ups, whistleblowers, institutional failure, and power and money, at home and abroad.',
    labels: ['Cover-ups', 'Whistleblowers', 'Money & Power', 'Abuse of Office', 'Institutional Failure'],
    items_per_day: 6,
    lens: 'Ready-made Political Scandal feed. Surface investigations and exposés with a named person at the centre: whistleblowers, cover-ups, corruption and dark money, abuse of office, intelligence and security scandals, and institutions failing the people they serve (police, prisons, care, health, the military, big companies). Original reporting with named sources, documents or data. A clear protagonist and stakes, at home or abroad.',
    avoid: 'Opinion columns, election horse-race coverage, policy explainers and think-pieces; geopolitical analysis without a human story; party politics with no wrongdoing; anything already made into a documentary or series.'
  },
  'music-pop-culture': {
    name: 'Music & Pop Culture',
    blurb: 'Music history, fame and its cost, internet and youth culture, and film and TV behind the scenes.',
    labels: ['Big Stories', 'Tours / Albums', 'Anniversaries', 'Fame & Internet Culture', 'Behind the Scenes'],
    items_per_day: 6,
    lens: 'Ready-made Music & Pop Culture feed, built from the Why Now music-documentary lens and widened. Surface raw news leads a viewer would want a whole documentary about: BIG STORIES (untold chapters, resurfacing scandals, newly opened archives, deaths, rediscovered footage, legal sagas, reunions, feuds), TOURS / ALBUMS (major tours or albums filmable as concert or tour docs, ideally with lead time), ANNIVERSARIES (album, event and death milestones at 10/20/25/30/40/50 years with lead time to develop; 2027 is the current sweet spot), FAME & INTERNET CULTURE (creators, fandoms, viral figures and youth scenes with a real human arc) and BEHIND THE SCENES (the making of films, TV and records, and the people behind famous work). Favour a named human story with archive or footage potential and access.',
    avoid: 'Album and gig reviews, celebrity gossip, chart news, trailers and teasers, and anything already made into a documentary or announced as one.'
  }
};

var GENRE_CFG = {
  TRIAL_DAYS: 30,
  PRICE_ONE: '£35 a month',
  PRICE_ALL: '£49 a month',
  APP_URL: 'https://theariel.tv/genres/app.html',
  LANDING_URL: 'https://theariel.tv/genres/',
  BOOK_URL: 'https://calendly.com/tarabutton/15min',
  FEED_DAYS: 45,
  DIGEST_PER_GENRE: 6,
  DIGEST_HOUR: 7
};

var GITEM_HEADERS = ['id', 'genre', 'date', 'added_at', 'title', 'summary', 'source_name', 'source_url', 'source_id', 'label',
  'relevance_note', 'score', 'tier', 'agent', 'agency', 'agent_name', 'rights_note', 'original_language', 'original_title', 'status'];
var GSUB_HEADERS = ['email', 'name', 'role', 'company', 'genres', 'plan', 'status', 'token', 'created_at', 'activated_at',
  'trial_end', 'paid_until', 'digest', 'last_digest', 'day21_sent', 'day28_sent', 'ended_sent', 'keep_interest',
  'upgrade_interest', 'source', 'ror_optin', 'last_link_sent', 'note'];
var GACT_HEADERS = ['time', 'email', 'item_id', 'genre', 'action', 'title'];
var GREQ_HEADERS = ['time', 'email', 'name', 'role', 'genre', 'note', 'source', 'status'];

var GENRE_ROLES = ['Producer', 'Development executive', 'Commissioner', 'Director', 'Writer', 'Agent or publisher', 'Other'];

/* ───────────────────────── setup ───────────────────────── */

function ensureGenres_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName('GenreSubs') && ss.getSheetByName('GenreItems') && ss.getSheetByName('GenreActions') && ss.getSheetByName('GenreRequests')) return;
  ensureTab_(ss, 'GenreItems', GITEM_HEADERS);
  ensureTab_(ss, 'GenreSubs', GSUB_HEADERS);
  ensureTab_(ss, 'GenreActions', GACT_HEADERS);
  ensureTab_(ss, 'GenreRequests', GREQ_HEADERS);
  if (!ss.getSheetByName('Config')) setupRights_();
  var cfg = ss.getSheetByName('Config');
  var add = function (k, v, note) { if (!findRow_(cfg, 1, k)) cfg.appendRow([k, v, note]); };
  add('genre_feed_key', Utilities.getUuid().replace(/-/g, ''), 'Key the daily distribution run uses to post stories into the genre feeds. Keep private.');
  add('genre_one_url', '', 'Stripe payment link for one genre (' + GENRE_CFG.PRICE_ONE + '). Blank = "keep" requests are emailed to Tara instead.');
  add('genre_all_url', '', 'Stripe payment link for all genres (' + GENRE_CFG.PRICE_ALL + '). Blank = "keep" requests are emailed to Tara instead.');
  add('genre_digest_hour', String(GENRE_CFG.DIGEST_HOUR), 'Hour (London) the daily genre emails go out.');
  add('genre_book_url', GENRE_CFG.BOOK_URL, 'Where "Make it yours" sends people to book the onboarding call.');
}

function genreSheet_(name) {
  ensureGenres_();
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

/** Run once from the editor if you want to see the setup result. Deploying is enough: everything self-creates. */
function setupGenres() {
  ensureGenres_();
  ensureTriggers_();
  return { feed_key_set: !!cfgValue_('genre_feed_key'), tabs: ['GenreItems', 'GenreSubs', 'GenreActions', 'GenreRequests'] };
}

/* ───────────────────────── routing (called from Code.js) ───────────────────────── */

function genrePost_(action, b, params) {
  params = params || {};
  if (!action && params.genre && b && b.entries) return genreAddEntries_(params.genre, params.key, b.entries);
  if (action === 'genre_signup') return genreSignup_(b);
  if (action === 'genre_act') return genreAct_(b);
  if (action === 'genre_settings') return genreSettings_(b);
  if (action === 'genre_keep') return genreKeep_(b);
  if (action === 'genre_upgrade') return genreUpgrade_(b);
  if (action === 'genre_intro') return genreIntro_(b);
  if (action === 'genre_request') return genreRequest_(b);
  if (action === 'genre_link') return genreResendLink_(b);
  return null;
}

function genreGet_(action, p) {
  if (p.genre && p.key && (action === 'items' || action === 'preferences')) {
    if (!genreKeyOk_(p.key)) return { success: false, error: 'forbidden' };
    if (!GENRES[p.genre]) return { success: false, error: 'unknown_genre' };
    return action === 'items' ? genreFeedItems_(p.genre) : genrePrefs_(p.genre);
  }
  if (action === 'genre_feed') return genreFeed_(p.k);
  if (action === 'genre_sample') return genreSample_();
  if (action === 'genre_list') return { ok: true, genres: genreDefsPublic_() };
  return null;
}

function genreKeyOk_(key) {
  var want = cfgValue_('genre_feed_key');
  return !!want && String(key) === want;
}

function genreDefsPublic_() {
  return Object.keys(GENRES).map(function (slug) {
    var g = GENRES[slug];
    return { slug: slug, name: g.name, blurb: g.blurb, labels: g.labels };
  });
}

/* ───────────────────────── feed in (distribution run) ───────────────────────── */

function genreAddEntries_(slug, key, entries) {
  if (!genreKeyOk_(key)) return { success: false, error: 'forbidden' };
  if (!GENRES[slug]) return { success: false, error: 'unknown_genre' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = genreSheet_('GenreItems');
    var v = sh.getDataRange().getValues();
    var ids = {}, urls = {};
    for (var i = 1; i < v.length; i++) {
      if (v[i][1] !== slug) continue;
      ids[String(v[i][0])] = 1;
      if (v[i][7]) urls[String(v[i][7])] = 1;
    }
    var added = 0, skipped = 0, rows = [];
    (entries || []).forEach(function (e) {
      if (!e || !e.title) { skipped++; return; }
      var id = String(e.id || (slug + '-' + Utilities.formatDate(new Date(), 'Europe/London', 'yyyyMMdd') + '-' + Utilities.getUuid().slice(0, 6)));
      var url = String(e.source_url || '');
      if (ids[id] || (url && urls[url])) { skipped++; return; }
      if (url && !/^https?:\/\//.test(url)) { skipped++; return; }
      ids[id] = 1; if (url) urls[url] = 1;
      var label = GENRES[slug].labels.indexOf(e.genre) >= 0 ? e.genre : (GENRES[slug].labels.indexOf(e.label) >= 0 ? e.label : GENRES[slug].labels[0]);
      var rec = {
        id: id, genre: slug, date: e.date || Utilities.formatDate(new Date(), 'Europe/London', 'yyyy-MM-dd'), added_at: new Date(),
        title: noDash_(e.title), summary: noDash_(e.summary), source_name: noDash_(e.source_name), source_url: url, source_id: e.source_id || '',
        label: label, relevance_note: noDash_(e.relevance_note), score: Number(e.score) || 0, tier: e.tier === 'secondary' ? 'secondary' : 'primary',
        agent: (e.agent === true || e.agent === 'true') ? 'yes' : '', agency: noDash_(e.agency), agent_name: noDash_(e.agent_name),
        rights_note: noDash_(e.rights_note), original_language: e.original_language || 'en', original_title: e.original_title || '', status: 'live'
      };
      rows.push(GITEM_HEADERS.map(function (h) { return h === 'id' || h === 'date' ? "'" + rec[h] : rec[h]; }));
      added++;
    });
    if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, GITEM_HEADERS.length).setValues(rows);
    return { success: true, added: added, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

function genreFeedItems_(slug) {
  var since = Date.now() - 30 * 86400000;
  var out = genreItems_([slug], since).map(function (it) {
    return { id: it.id, date: it.date, title: it.title, source_url: it.source_url, source_name: it.source_name, label: it.label, tier: it.tier };
  });
  return { success: true, genre: slug, items: out };
}

function genrePrefs_(slug) {
  var g = GENRES[slug];
  return { success: true, genre: slug, preferences: {
    items_per_day: g.items_per_day, scoring_lens: g.lens, avoid: g.avoid, genres: g.labels.join(', '),
    note: 'Ready-made genre feed shared by every subscriber to ' + g.name + '. Notes must read for any producer: never name a client or say "fits your slate".'
  } };
}

function noDash_(s) { return String(s == null ? '' : s).replace(/—/g, ' - ').replace(/–/g, '-').slice(0, 4000); }

/* All live items for these genres since a time, newest first. */
function genreItems_(slugs, sinceMs) {
  var sh = genreSheet_('GenreItems');
  var v = sh.getDataRange().getValues();
  var out = [];
  for (var i = v.length - 1; i >= 1; i--) {
    var r = v[i];
    if (slugs.indexOf(r[1]) < 0 || r[19] === 'hidden') continue;
    var added = r[3] instanceof Date ? r[3].getTime() : new Date(r[3]).getTime();
    if (sinceMs && added < sinceMs) continue;
    out.push({ id: String(r[0]), genre: r[1], date: idText_(r[2]), added_at: added, title: r[4], summary: r[5], source_name: r[6],
      source_url: r[7], label: r[9], relevance_note: r[10], score: Number(r[11]) || 0, tier: r[12], agent: r[13] === 'yes',
      agency: r[14], agent_name: r[15], rights_note: r[16], original_language: r[17], original_title: r[18] });
  }
  return out;
}

/* ───────────────────────── subscribers ───────────────────────── */

function gSubRow_(by, value) {
  var sh = genreSheet_('GenreSubs');
  var col = GSUB_HEADERS.indexOf(by) + 1;
  return { sh: sh, row: findRow_(sh, col, value) };
}

function gSub_(sh, row) {
  var vals = sh.getRange(row, 1, 1, GSUB_HEADERS.length).getValues()[0];
  var o = { row: row };
  GSUB_HEADERS.forEach(function (h, i) { o[h] = vals[i]; });
  o.genreList = String(o.genres || '').split(/\s*,\s*/).filter(function (s) { return GENRES[s]; });
  return o;
}

function cleanGenres_(v) {
  if (!v) return [];
  if (typeof v === 'string') v = v.split(',');
  var out = [];
  v.forEach(function (s) { s = String(s).trim(); if (GENRES[s] && out.indexOf(s) < 0) out.push(s); });
  return out;
}

function genreSignup_(b) {
  if (b.website) return { ok: true, status: 'pending' };
  var email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return { ok: false, error: 'invalid_email', message: 'Please check your email address.' };
  var genres = cleanGenres_(b.genres);
  if (!genres.length) return { ok: false, error: 'no_genre', message: 'Please choose at least one genre.' };
  var name = String(b.name || '').trim().slice(0, 80);
  var role = GENRE_ROLES.indexOf(b.role) >= 0 ? b.role : '';
  var company = String(b.company || '').trim().slice(0, 120);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var f = gSubRow_('email', email);
    var now = new Date();
    if (f.row) {
      var s = gSub_(f.sh, f.row);
      if (s.last_link_sent && now - new Date(s.last_link_sent) < 10 * 60 * 1000) return { ok: true, status: s.status === 'active' ? 'already' : 'pending' };
      if (s.status === 'unsubscribed') setCell_(f.sh, f.row, 'status', s.activated_at ? 'active' : 'pending');
      if (s.status === 'pending') setCells_(f.sh, f.row, { genres: genres.join(','), name: name || s.name, role: role || s.role, company: company || s.company });
      setCell_(f.sh, f.row, 'last_link_sent', now);
      sendGenreLink_(gSub_(f.sh, f.row), s.status === 'pending' ? 'welcome' : 'relink');
      return { ok: true, status: s.status === 'pending' ? 'pending' : (s.status === 'ended' ? 'ended' : 'already') };
    }
    var token = newToken_();
    var rec = { email: email, name: name, role: role, company: company, genres: genres.join(','), plan: 'trial', status: 'pending',
      token: token, created_at: now, activated_at: '', trial_end: '', paid_until: '', digest: 'daily', last_digest: '',
      day21_sent: '', day28_sent: '', ended_sent: '', keep_interest: '', upgrade_interest: '', source: String(b.source || 'site').slice(0, 30),
      ror_optin: b.ror === false || b.ror === 'no' ? 'no' : 'yes', last_link_sent: now, note: '' };
    f.sh.appendRow(GSUB_HEADERS.map(function (h) { return rec[h]; }));
    var sub = gSub_(f.sh, f.sh.getLastRow());
    sendGenreLink_(sub, 'welcome');
    alertTara_('[Ariel Genres] New sign-up: ' + email,
      'Name: ' + name + '\nRole: ' + role + '\nCompany: ' + company + '\nGenres: ' + genres.map(gName_).join(', ') + '\nSource: ' + rec.source +
      '\n\nTheir trial starts when they open the link in their welcome email.');
    return { ok: true, status: 'pending' };
  } finally {
    lock.releaseLock();
  }
}

function genreResendLink_(b) {
  var email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'invalid_email', message: 'Please check your email address.' };
  var f = gSubRow_('email', email);
  if (f.row) {
    var s = gSub_(f.sh, f.row);
    if (!s.last_link_sent || new Date() - new Date(s.last_link_sent) > 10 * 60 * 1000) {
      setCell_(f.sh, f.row, 'last_link_sent', new Date());
      sendGenreLink_(s, s.status === 'pending' ? 'welcome' : 'relink');
    }
  }
  return { ok: true };  // same answer whether or not we know the address
}

function gName_(slug) { return GENRES[slug] ? GENRES[slug].name : slug; }

function appLink_(sub, extra) {
  return GENRE_CFG.APP_URL + '?k=' + encodeURIComponent(sub.token) + (extra || '');
}

/* Activation happens the first time someone opens their dashboard link (that proves the address is theirs). */
function activateIfPending_(s) {
  if (s.status !== 'pending') return s;
  var sh = genreSheet_('GenreSubs');
  var now = new Date();
  var end = new Date(now.getTime() + GENRE_CFG.TRIAL_DAYS * 86400000);
  setCells_(sh, s.row, { status: 'active', activated_at: now, trial_end: end });
  upsertMember_(s.email, 'genre', end, 'Ariel Genres trial');
  if (s.ror_optin !== 'no') rorSubscribeDirect_(s.email, s.name, s.role);
  log_('genres', 'activated ' + s.email + ' trial to ' + end.toISOString());
  return gSub_(sh, s.row);
}

function upsertMember_(email, type, until, note) {
  var ms = sheet_('Members');
  var em = String(email || '').toLowerCase().trim();
  if (!em) return;
  var mr = findRow_(ms, 1, em);
  if (mr) {
    var curType = String(ms.getRange(mr, 2).getValue() || '');
    if (curType === 'member') return;  // full Ariel members keep their row as it is
    var curUntil = ms.getRange(mr, 4).getValue();
    if (curUntil && until && new Date(curUntil) > new Date(until)) return;
    ms.getRange(mr, 1, 1, 5).setValues([[em, type, ms.getRange(mr, 3).getValue() || new Date(), until || '', note || '']]);
  } else {
    ms.appendRow([em, type, new Date(), until || '', note || '']);
  }
}

/* Adds a confirmed reader to the London Review of Reviews (they asked for it on the genre form). Never resubscribes someone who left. */
function rorSubscribeDirect_(email, name, role) {
  try {
    var sh = sheet_('Subscribers');
    var row = findRow_(sh, 1, email);
    var now = new Date();
    if (row) {
      var st = cell_(sh, row, 'status');
      if (st === 'pending') setCells_(sh, row, { status: 'active', confirmed_at: now });
      return;
    }
    var rec = { email: email, name: name || '', role: ROLES.indexOf(role) >= 0 ? role : '', subjects: '', status: 'active',
      token: newToken_(), created_at: now, confirmed_at: now, unsubscribed_at: '', source: 'genres', consent: CONSENT_TEXT,
      last_sent_edition: '', last_confirm_sent: '' };
    sh.appendRow(SUB_HEADERS.map(function (h) { return rec[h]; }));
  } catch (err) { log_('error', 'ror add ' + email + ': ' + err); }
}

function subByToken_(k) {
  if (!k) return null;
  var f = gSubRow_('token', String(k));
  return f.row ? gSub_(f.sh, f.row) : null;
}

function paidActive_(s) {
  return (s.plan === 'one' || s.plan === 'all' || s.plan === 'comp') && (!s.paid_until || new Date(s.paid_until).getTime() + 5 * 86400000 > Date.now() || s.plan === 'comp');
}

function hasAccess_(s) {
  if (!s || s.status === 'pending') return false;
  if (paidActive_(s)) return true;
  return s.plan === 'trial' && s.trial_end && new Date(s.trial_end) > new Date();
}

function daysLeft_(s) {
  if (!s.trial_end) return GENRE_CFG.TRIAL_DAYS;
  return Math.max(0, Math.ceil((new Date(s.trial_end).getTime() - Date.now()) / 86400000));
}

/* ───────────────────────── dashboard API ───────────────────────── */

function genreFeed_(k) {
  var s = subByToken_(k);
  if (!s) return { ok: false, error: 'unknown_link', message: 'We don’t recognise that link.' };
  if (s.status === 'pending') s = activateIfPending_(s);
  var me = {
    name: s.name, email: s.email, genres: s.genreList, plan: s.plan, status: s.status, digest: s.digest || 'daily',
    trial_end: s.trial_end ? new Date(s.trial_end).toISOString() : '', days_left: s.plan === 'trial' ? daysLeft_(s) : null,
    paid_until: s.paid_until ? new Date(s.paid_until).toISOString() : '', upgrade_requested: !!s.upgrade_interest, keep_requested: !!s.keep_interest
  };
  var acts = genreActionsFor_(s.email);
  var base = { ok: true, me: me, all_genres: genreDefsPublic_(), prices: { one: GENRE_CFG.PRICE_ONE, all: GENRE_CFG.PRICE_ALL }, book_url: cfgValue_('genre_book_url') || GENRE_CFG.BOOK_URL };
  if (!hasAccess_(s)) {
    if (s.status !== 'ended' && s.status !== 'unsubscribed' && s.plan === 'trial') endTrial_(s);
    base.ended = true;
    base.saved = genreItems_(Object.keys(GENRES), 0).filter(function (it) { return acts.map[it.id] === 'save'; }).map(slimItem_);
    return base;
  }
  var since = Date.now() - GENRE_CFG.FEED_DAYS * 86400000;
  var items = genreItems_(s.genreList, since).slice(0, 400).map(slimItem_);
  var savedOld = genreItems_(Object.keys(GENRES), 0).filter(function (it) { return acts.map[it.id] === 'save' && it.added_at < since; }).map(slimItem_);
  base.items = items.concat(savedOld);
  base.actions = acts.map;
  return base;
}

function slimItem_(it) {
  return { id: it.id, genre: it.genre, date: it.date, title: it.title, summary: it.summary, source_name: it.source_name, source_url: it.source_url,
    label: it.label, note: it.relevance_note, score: it.score, tier: it.tier, agent: it.agent, agency: it.agency, rights_note: it.rights_note,
    original_language: it.original_language, original_title: it.original_title };
}

function genreActionsFor_(email) {
  var v = genreSheet_('GenreActions').getDataRange().getValues();
  var map = {}, saves = [];
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][1]).toLowerCase() !== email) continue;
    var id = String(v[i][2]), a = String(v[i][4]);
    if (a === 'save') map[id] = 'save';
    else if (a === 'skip') map[id] = 'skip';
    else if (a === 'unsave' || a === 'unskip') delete map[id];
  }
  Object.keys(map).forEach(function (id) { if (map[id] === 'save') saves.push(id); });
  return { map: map, saves: saves };
}

function itemById_(id) {
  var sh = genreSheet_('GenreItems');
  var row = findRow_(sh, 1, id);
  if (!row) return null;
  var r = sh.getRange(row, 1, 1, GITEM_HEADERS.length).getValues()[0];
  return { id: String(r[0]), genre: r[1], title: r[4], source_name: r[6], source_url: r[7], agent: r[13] === 'yes', agency: r[14], agent_name: r[15] };
}

function genreAct_(b) {
  var s = subByToken_(b.k);
  if (!s) return { ok: false, error: 'unknown_link' };
  var act = String(b.act || '');
  if (['save', 'skip', 'unsave', 'unskip'].indexOf(act) < 0) return { ok: false, error: 'bad_act' };
  var it = itemById_(String(b.item_id || ''));
  if (!it) return { ok: false, error: 'unknown_item' };
  genreSheet_('GenreActions').appendRow([new Date(), s.email, "'" + it.id, it.genre, act, String(it.title).slice(0, 200)]);
  return { ok: true, act: act, item_id: it.id };
}

function genreSettings_(b) {
  var s = subByToken_(b.k);
  if (!s) return { ok: false, error: 'unknown_link' };
  var sh = genreSheet_('GenreSubs');
  var upd = {};
  if (b.genres) {
    var g = cleanGenres_(b.genres);
    if (!g.length) return { ok: false, error: 'no_genre', message: 'Keep at least one genre.' };
    if (s.plan === 'one') g = [g[0]];
    upd.genres = g.join(',');
  }
  if (b.digest && ['daily', 'weekly', 'off'].indexOf(b.digest) >= 0) upd.digest = b.digest;
  setCells_(sh, s.row, upd);
  return { ok: true };
}

function genreKeep_(b) {
  var s = subByToken_(b.k);
  if (!s) return { ok: false, error: 'unknown_link' };
  var plan = b.plan === 'all' ? 'all' : 'one';
  var genre = GENRES[b.genre] ? b.genre : (s.genreList[0] || 'true-crime');
  var sh = genreSheet_('GenreSubs');
  setCell_(sh, s.row, 'keep_interest', new Date() + ' ' + plan + (plan === 'one' ? ':' + genre : ''));
  var url = cfgValue_(plan === 'all' ? 'genre_all_url' : 'genre_one_url');
  alertTara_('[Ariel Genres] ' + s.email + ' wants to keep ' + (plan === 'all' ? 'all genres' : gName_(genre)),
    s.email + (s.name ? ' (' + s.name + (s.company ? ', ' + s.company : '') + ')' : '') + ' clicked Keep: ' +
    (plan === 'all' ? 'all genres, ' + GENRE_CFG.PRICE_ALL : gName_(genre) + ', ' + GENRE_CFG.PRICE_ONE) + '.\n' +
    (url ? 'They were sent to the Stripe link. Payment is picked up automatically from the Stripe email; if it is not, run admin activate_genre.'
      : 'No Stripe link is set in the Config tab yet, so please email them a payment link today, then activate them (admin op activate_genre).'));
  if (url) {
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    return { ok: true, url: url + sep + 'prefilled_email=' + encodeURIComponent(s.email) + '&client_reference_id=' + encodeURIComponent(s.token.slice(0, 40)) };
  }
  sendGenreNote_(s, 'Keeping ' + (plan === 'all' ? 'all your genres' : gName_(genre)),
    'Thank you. We’ll email you a payment link for ' + (plan === 'all' ? 'all genres (' + GENRE_CFG.PRICE_ALL + ')' : gName_(genre) + ' (' + GENRE_CFG.PRICE_ONE + ')') +
    ' within a working day. Your feed stays on in the meantime.');
  extendGrace_(s, 7);
  return { ok: true, interest: true };
}

/* Keeps a trial open for a few more days while a keep or upgrade request is being handled. */
function extendGrace_(s, days) {
  if (s.plan !== 'trial') return;
  var sh = genreSheet_('GenreSubs');
  var end = s.trial_end ? new Date(s.trial_end) : new Date();
  var floor = new Date(Date.now() + days * 86400000);
  if (end < floor) {
    setCells_(sh, s.row, { trial_end: floor, status: 'active' });
    upsertMember_(s.email, 'genre', floor, 'Ariel Genres trial (grace)');
  }
}

function genreUpgrade_(b) {
  var s = subByToken_(b.k);
  if (!s) return { ok: false, error: 'unknown_link' };
  var sh = genreSheet_('GenreSubs');
  setCell_(sh, s.row, 'upgrade_interest', new Date());
  var acts = genreActionsFor_(s.email);
  var saved = acts.saves.map(function (id) { var it = itemById_(id); return it ? '- ' + it.title + ' (' + it.source_name + ') ' + (it.source_url || '') : ''; }).filter(String);
  var inTrial = s.plan === 'trial';
  alertTara_('[Ariel Genres] Upgrade request: ' + s.email,
    s.email + (s.name ? ' (' + s.name + (s.company ? ', ' + s.company : '') + (s.role ? ', ' + s.role : '') + ')' : '') +
    ' wants their own Ariel.\nGenres: ' + s.genreList.map(gName_).join(', ') + '\nPlan: ' + s.plan + (inTrial ? ' (in trial, so the £250 setup is waived)' : '') +
    '\n\nWhat they saved (' + saved.length + '):\n' + (saved.join('\n') || '(nothing yet)') +
    '\n\nNext: book the onboarding call. Their saves seed the new profile.json.');
  var book = cfgValue_('genre_book_url') || GENRE_CFG.BOOK_URL;
  sendGenreNote_(s, 'Your own Ariel',
    'Thank you. Tara will email you within a working day to set up your own Ariel. ' + (inTrial ? 'Because you’re upgrading during your trial, the £250 setup fee is waived. ' : '') +
    'Everything you’ve saved so far comes with you, so your Ariel starts from your taste on day one.<br><br>' +
    'If you’d like to pick a time now, <a href="' + esc_(book) + '" style="color:' + C.goldDeep + ';">book a 15-minute call</a>.');
  extendGrace_(s, 10);
  return { ok: true, book_url: book };
}

function genreIntro_(b) {
  var s = subByToken_(b.k);
  if (!s) return { ok: false, error: 'unknown_link' };
  var it = itemById_(String(b.item_id || ''));
  if (!it) return { ok: false, error: 'unknown_item' };
  genreSheet_('GenreActions').appendRow([new Date(), s.email, "'" + it.id, it.genre, 'intro', String(it.title).slice(0, 200)]);
  alertTara_('[Ariel Genres] Introduction request: ' + it.title,
    (s.name || s.email) + (s.company ? ' (' + s.company + ')' : '') + (s.role ? ', ' + s.role : '') + ' <' + s.email + '>' +
    ' would like an introduction to the rights holder for "' + it.title + '".\nAgency: ' + (it.agency || '?') + (it.agent_name ? ' (' + it.agent_name + ')' : '') +
    '\nGenre: ' + gName_(it.genre) + '\n\nReply to them and the agent with a warm introduction.');
  sendGenreNote_(s, 'Introduction requested',
    'We’ve asked for an introduction to the rights holder for <b>' + esc_(it.title) + '</b>' + (it.agency ? ' at ' + esc_(it.agency) : '') +
    '. Tara will email you both within a working day.');
  return { ok: true };
}

function genreRequest_(b) {
  if (b.website) return { ok: true };
  var genre = String(b.genre || '').trim().slice(0, 80);
  if (genre.length < 2) return { ok: false, error: 'no_genre', message: 'Tell us which genre you’d like.' };
  var s = b.k ? subByToken_(b.k) : null;
  var email = s ? s.email : String(b.email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'invalid_email', message: 'Please check your email address.' };
  var sh = genreSheet_('GenreRequests');
  sh.appendRow([new Date(), email, s ? s.name : String(b.name || '').slice(0, 80), s ? s.role : (GENRE_ROLES.indexOf(b.role) >= 0 ? b.role : ''),
    genre, String(b.note || '').slice(0, 500), s ? 'subscriber' : String(b.source || 'site').slice(0, 20), 'open']);
  var v = sh.getDataRange().getValues();
  var norm = genre.toLowerCase().replace(/[^a-z]/g, '');
  var count = 0;
  for (var i = 1; i < v.length; i++) if (String(v[i][4]).toLowerCase().replace(/[^a-z]/g, '') === norm) count++;
  alertTara_('[Ariel Genres] Genre request: ' + genre + ' (' + count + ' so far)',
    (email || 'anonymous') + ' asked for a "' + genre + '" genre.' + (b.note ? '\nNote: ' + b.note : '') + '\nRequests for this genre so far: ' + count);
  return { ok: true, count: count };
}

/* ───────────────────────── public sample for the landing page ───────────────────────── */

function genreSample_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('genre_sample');
  if (hit) return JSON.parse(hit);
  var since = Date.now() - 21 * 86400000;
  var out = {};
  Object.keys(GENRES).forEach(function (slug) {
    out[slug] = genreItems_([slug], since).filter(function (it) { return it.tier === 'primary'; })
      .sort(function (a, b) { return (b.score - a.score) || (b.added_at - a.added_at); }).slice(0, 3)
      .map(function (it) { return { title: it.title, source_name: it.source_name, source_url: it.source_url, label: it.label, date: it.date }; });
  });
  var res = { ok: true, genres: genreDefsPublic_(), samples: out };
  cache.put('genre_sample', JSON.stringify(res), 1800);
  return res;
}

/* ───────────────────────── trial lifecycle + digests (hourly) ───────────────────────── */

function genreTick() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  var start = Date.now();
  try {
    ensureGenres_();
    try { detectStripePayments_(); } catch (err) { log_('error', 'stripe scan: ' + err); }
    var sh = genreSheet_('GenreSubs');
    var last = sh.getLastRow();
    if (last < 2) return;
    var hour = Number(Utilities.formatDate(new Date(), 'Europe/London', 'H'));
    var digestHour = Number(cfgValue_('genre_digest_hour') || GENRE_CFG.DIGEST_HOUR);
    var today = Utilities.formatDate(new Date(), 'Europe/London', 'yyyy-MM-dd');
    var dow = Number(Utilities.formatDate(new Date(), 'Europe/London', 'u'));
    for (var row = 2; row <= last; row++) {
      if (Date.now() - start > 4.5 * 60 * 1000) return;
      var s = gSub_(sh, row);
      if (s.status === 'pending' || s.status === 'unsubscribed') continue;
      try {
        // Trial emails
        if (s.plan === 'trial' && s.status === 'active' && s.trial_end) {
          var left = (new Date(s.trial_end).getTime() - Date.now()) / 86400000;
          if (left <= 0) { endTrial_(s); continue; }
          if (left <= 2.2 && !s.day28_sent && !s.keep_interest && !s.upgrade_interest) { sendTrialEnding_(s); setCell_(sh, row, 'day28_sent', new Date()); }
          else if (left <= 9.2 && !s.day21_sent) { sendTrialMidpoint_(s); setCell_(sh, row, 'day21_sent', new Date()); }
        }
        // Paid plans that look overdue: tell Tara once, never cut someone off automatically
        if ((s.plan === 'one' || s.plan === 'all') && s.paid_until && new Date(s.paid_until).getTime() + 5 * 86400000 < Date.now() && String(s.note).indexOf('renewal_check') < 0) {
          alertTara_('[Ariel Genres] Renewal not seen: ' + s.email, s.email + ' was paid until ' + s.paid_until + ' and no renewal payment has been seen. They still have access. Check Stripe, then run activate_genre or cancel them.');
          setCell_(sh, row, 'note', String(s.note) + ' renewal_check');
        }
        // Daily digest
        if (hour >= digestHour && hasAccess_(s) && s.digest !== 'off') {
          var lastDay = s.last_digest ? Utilities.formatDate(new Date(s.last_digest), 'Europe/London', 'yyyy-MM-dd') : '';
          var due = lastDay !== today && (s.digest !== 'weekly' || dow === 1);
          if (due) {
            if (MailApp.getRemainingDailyQuota() < 10) { log_('quota', 'genre digests paused, quota low'); return; }
            sendGenreDigest_(s);
            setCell_(sh, row, 'last_digest', new Date());
          }
        }
      } catch (err) {
        log_('error', 'genreTick ' + s.email + ': ' + err);
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function endTrial_(s) {
  var sh = genreSheet_('GenreSubs');
  setCell_(sh, s.row, 'status', 'ended');
  if (!s.ended_sent) {
    try { sendTrialEnded_(s); } catch (err) { log_('error', 'ended email ' + s.email + ': ' + err); }
    setCell_(sh, s.row, 'ended_sent', new Date());
  }
  log_('genres', 'trial ended ' + s.email);
}

/* Stripe sends the account owner an email per payment. Match the payer's address to a subscriber and switch them on. */
function detectStripePayments_() {
  var label = GmailApp.getUserLabelByName('ariel-genres-seen') || GmailApp.createLabel('ariel-genres-seen');
  var threads = GmailApp.search('from:(stripe.com) newer_than:4d -label:ariel-genres-seen', 0, 30);
  if (!threads.length) return;
  var sh = genreSheet_('GenreSubs');
  var v = sh.getDataRange().getValues();
  var emails = {};
  for (var i = 1; i < v.length; i++) emails[String(v[i][0]).toLowerCase()] = i + 1;
  threads.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      var body = (m.getPlainBody() || '') + ' ' + m.getSubject();
      var low = body.toLowerCase();
      var amountAll = /£\s?49(\.00)?\b/.test(body), amountOne = /£\s?35(\.00)?\b/.test(body);
      if (!amountAll && !amountOne) return;
      Object.keys(emails).forEach(function (em) {
        if (low.indexOf(em) < 0) return;
        var s = gSub_(sh, emails[em]);
        activateGenrePaid_(s, amountAll ? 'all' : 'one', 1, '');
        alertTara_('[Ariel Genres] Payment matched: ' + em, 'Stripe email "' + m.getSubject() + '" matched ' + em + '. Plan set to ' + (amountAll ? 'all genres' : 'one genre') + ' for another month.');
      });
    });
    t.addLabel(label);
  });
}

function activateGenrePaid_(s, plan, months, genre) {
  var sh = genreSheet_('GenreSubs');
  var base = s.paid_until && new Date(s.paid_until) > new Date() ? new Date(s.paid_until) : new Date();
  var until = new Date(base.getTime() + (months || 1) * 31 * 86400000);
  var upd = { plan: plan, paid_until: until, status: 'active', note: String(s.note || '').replace(' renewal_check', '') };
  if (s.status === 'pending') upd.activated_at = new Date();
  if (plan === 'one') {
    var keep = GENRES[genre] ? genre : (String(s.keep_interest).split(':')[1] || '').trim();
    if (!GENRES[keep]) keep = s.genreList[0];
    if (keep) upd.genres = keep;
  } else if (plan === 'all') {
    upd.genres = Object.keys(GENRES).join(',');
  }
  setCells_(sh, s.row, upd);
  upsertMember_(s.email, 'genre', until, 'Ariel Genres ' + plan);
  if (s.plan === 'trial' || s.status === 'ended') {
    sendGenreNote_(gSub_(sh, s.row), 'You’re all set',
      'Thank you. ' + (plan === 'all' ? 'All the Ariel Genres are' : gName_(upd.genres) + ' is') + ' yours, and the daily email carries on as before. ' +
      'Unlimited rights checks on the London Review of Reviews carry on too.<br><br>Whenever you’d like an Ariel built around your own slate, just reply to this email.');
  }
}

/* ───────────────────────── emails ───────────────────────── */

function genreMail_(to, subject, html, text) {
  var opts = { htmlBody: html, name: 'The Ariel', replyTo: CONFIG.FROM_ALIAS };
  if (aliasOk_()) opts.from = CONFIG.FROM_ALIAS;
  GmailApp.sendEmail(to, subject, text || html.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ''), opts);
}

function gShell_(kicker, heading, inner, sub) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>' +
    '<body style="margin:0;padding:0;background-color:' + C.ivory + ';" bgcolor="' + C.ivory + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.ivory + '"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;">' +
    '<tr><td bgcolor="' + C.ink + '" style="background-color:' + C.ink + ';padding:24px 28px;">' +
    '<div style="font-family:' + SANS + ';font-size:13px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#E2C891;">' + kicker + '</div>' +
    '<div style="font-family:' + SERIF + ';font-size:30px;line-height:1.15;color:#FFFFFF;margin-top:8px;">' + heading + '</div></td></tr>' +
    inner +
    (sub ? '<tr><td style="padding:18px 28px 24px;font-family:' + SANS + ';font-size:14px;line-height:1.6;color:' + C.mist + ';">' + sub + '</td></tr>' : '') +
    '</table></td></tr></table></body></html>';
}

function gBtn_(href, label, solid) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:6px 8px 0 0;"><tr><td bgcolor="' + (solid ? C.gold : '#FFFFFF') + '" style="background-color:' + (solid ? C.gold : '#FFFFFF') + ';border:2px solid ' + C.gold + ';border-radius:3px;">' +
    '<a href="' + esc_(href) + '" style="display:inline-block;padding:11px 18px;font-family:' + SANS + ';font-size:15px;font-weight:bold;color:' + C.ink + ';text-decoration:none;">' + label + '</a></td></tr></table>';
}

function gPara_(html) {
  return '<tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:22px 28px;font-family:' + SANS + ';font-size:16px;line-height:1.6;color:' + C.body + ';">' + html + '</td></tr>';
}

function gFooter_(s) {
  return 'You’re getting this because you signed up for Ariel Genres at theariel.tv. ' +
    '<a href="' + esc_(appLink_(s, '&panel=settings')) + '" style="color:' + C.mist + ';">Email settings</a> &middot; ' +
    '<a href="' + esc_(appLink_(s, '&panel=request')) + '" style="color:' + C.mist + ';">Request a genre</a> &middot; ' +
    '<a href="' + esc_(appLink_(s, '&do=digest_off')) + '" style="color:' + C.mist + ';">Stop these emails</a><br>' +
    'The Ariel &middot; <a href="mailto:tara@theariel.tv" style="color:' + C.mist + ';">tara@theariel.tv</a>';
}

function sendGenreLink_(s, kind) {
  var names = s.genreList.map(gName_).join(', ');
  var welcome = kind === 'welcome';
  var inner = gPara_((s.name ? 'Hello ' + esc_(s.name) + ',<br><br>' : '') +
    (welcome ? 'Welcome to Ariel Genres. Your free month of <b>' + esc_(names) + '</b> starts when you open your Ariel:'
      : 'Here’s the link to your Ariel (' + esc_(names) + '). Keep this email: the link is your key, there’s no password.') +
    '<br>' + gBtn_(appLink_(s), 'Open my Ariel', true) + '<br><br>' +
    (welcome ? 'From tomorrow morning you’ll get a short email of the best new stories in your genres: books, investigations and true stories with screen potential, plus rights-available titles sent to us directly by literary agents. ' +
      'Save what interests you and skip what doesn’t, from the email or the dashboard.<br><br>' +
      'Your trial is free for ' + GENRE_CFG.TRIAL_DAYS + ' days, with no card. It also gives you unlimited rights checks on the London Review of Reviews.' : ''));
  var html = gShell_('The Ariel &middot; Genres', welcome ? 'Your Ariel is ready' : 'Your Ariel link', inner,
    'The link is personal to you: anyone with it can see your feed. You’re getting this because someone (we hope you) signed up at theariel.tv/genres. If it wasn’t you, ignore this email and nothing will happen.');
  genreMail_(s.email, welcome ? 'Your Ariel is ready: ' + names : 'Your Ariel link', html,
    (welcome ? 'Your Ariel is ready. Open it here to start your free month: ' : 'Your Ariel link: ') + appLink_(s));
}

function sendGenreNote_(s, heading, bodyHtml) {
  var html = gShell_('The Ariel &middot; Genres', esc_(heading), gPara_((s.name ? 'Hello ' + esc_(s.name) + ',<br><br>' : '') + bodyHtml +
    '<br><br>' + gBtn_(appLink_(s), 'Open my Ariel', false)), gFooter_(s));
  genreMail_(s.email, heading, html);
}

function digestItems_(s) {
  var since = s.last_digest ? new Date(s.last_digest).getTime() : (s.activated_at ? new Date(s.activated_at).getTime() - 3 * 86400000 : Date.now() - 3 * 86400000);
  if (s.digest === 'weekly') since = Math.min(since, Date.now() - 7 * 86400000);
  var acts = genreActionsFor_(s.email).map;
  var by = {};
  genreItems_(s.genreList, since).forEach(function (it) {
    if (acts[it.id]) return;
    if (it.tier !== 'primary' && !it.agent) return;
    (by[it.genre] = by[it.genre] || []).push(it);
  });
  Object.keys(by).forEach(function (g) {
    by[g].sort(function (a, b) { return (b.agent - a.agent) || (b.score - a.score) || (b.added_at - a.added_at); });
    by[g] = by[g].slice(0, s.digest === 'weekly' ? 10 : GENRE_CFG.DIGEST_PER_GENRE);
  });
  return by;
}

function sendGenreDigest_(s) {
  var by = digestItems_(s);
  var total = 0;
  Object.keys(by).forEach(function (g) { total += by[g].length; });
  if (!total) return false;
  var inner = '';
  var trialLine = '';
  if (s.plan === 'trial') {
    var dl = daysLeft_(s);
    trialLine = '<tr><td bgcolor="' + C.tint + '" style="background-color:' + C.tint + ';padding:12px 28px;font-family:' + SANS + ';font-size:14px;color:' + C.body + ';">' +
      'Free trial: <b>' + dl + ' day' + (dl === 1 ? '' : 's') + ' left</b>. <a href="' + esc_(appLink_(s, '&panel=keep')) + '" style="color:' + C.goldDeep + ';">Keep your genres</a> or <a href="' + esc_(appLink_(s, '&panel=upgrade')) + '" style="color:' + C.goldDeep + ';">make it yours</a>.</td></tr>';
  }
  inner += trialLine;
  s.genreList.forEach(function (g) {
    var list = by[g];
    if (!list || !list.length) return;
    inner += '<tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:24px 28px 4px;"><div style="font-family:' + SERIF + ';font-style:italic;font-size:26px;color:' + C.ink + ';border-bottom:2px solid ' + C.ink + ';padding-bottom:4px;">' +
      esc_(gName_(g)) + ' <span style="font-family:' + SANS + ';font-style:normal;font-size:13px;color:' + C.mist + ';">' + list.length + ' new</span></div></td></tr>';
    list.forEach(function (it) { inner += '<tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:14px 28px;border-bottom:1px solid ' + C.line + ';">' + digestCard_(s, it) + '</td></tr>'; });
  });
  inner += '<tr><td bgcolor="' + C.ink + '" style="background-color:' + C.ink + ';padding:24px 28px;font-family:' + SANS + ';font-size:16px;line-height:1.6;color:#E6E9F1;">' +
    '<div style="font-family:' + SERIF + ';font-size:22px;color:#FFFFFF;margin-bottom:6px;">Want an Ariel that knows your slate?</div>' +
    'Your own Ariel is built around your projects, your commissioners and your taste, learns from what you save, and adds research briefs on any story.' +
    (s.plan === 'trial' ? ' Upgrade during your trial and the £250 setup is waived.' : '') + '<br>' +
    gBtn_(appLink_(s, '&panel=upgrade'), 'Make it yours', true) + '</td></tr>';
  var names = s.genreList.filter(function (g) { return by[g] && by[g].length; }).map(gName_).join(', ');
  var subject = 'Your Ariel: ' + total + ' new ' + (total === 1 ? 'story' : 'stories') + ' in ' + names;
  var html = gShell_('The Ariel &middot; Genres &middot; ' + Utilities.formatDate(new Date(), 'Europe/London', 'EEEE d MMMM'), esc_(names), inner, gFooter_(s));
  var text = [subject, ''];
  s.genreList.forEach(function (g) { (by[g] || []).forEach(function (it) { text.push('- ' + it.title + ' (' + it.source_name + ') ' + (it.source_url || '')); }); });
  text.push('', 'Open your Ariel: ' + appLink_(s));
  genreMail_(s.email, subject, html, text.join('\n'));
  return true;
}

function digestCard_(s, it) {
  var save = appLink_(s, '&do=save&i=' + encodeURIComponent(it.id));
  var skip = appLink_(s, '&do=skip&i=' + encodeURIComponent(it.id));
  var title = it.source_url ? '<a href="' + esc_(it.source_url) + '" style="color:' + C.ink + ';text-decoration:none;">' + esc_(it.title) + '</a>' : esc_(it.title);
  return (it.agent ? '<div style="display:inline-block;background-color:' + C.gold + ';color:' + C.ink + ';font-family:' + SANS + ';font-size:12px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;padding:3px 8px;border-radius:2px;margin-bottom:6px;">&#9733; Rights available' + (it.agency ? ' &middot; ' + esc_(it.agency) : '') + '</div>' : '') +
    '<div style="font-family:' + SANS + ';font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:' + C.goldDeep + ';font-weight:bold;">' + esc_(it.label || '') + '</div>' +
    '<div style="font-family:' + SANS + ';font-size:18px;line-height:1.35;font-weight:bold;color:' + C.ink + ';margin-top:2px;">' + title + '</div>' +
    '<div style="font-family:' + SANS + ';font-size:14px;color:' + C.mist + ';margin-top:2px;">' + esc_(it.source_name || '') + (it.original_language && it.original_language !== 'en' ? ' &middot; translated' : '') + '</div>' +
    (it.relevance_note ? '<div style="font-family:' + SANS + ';font-size:16px;line-height:1.55;color:' + C.body + ';margin-top:6px;">' + esc_(it.relevance_note) + '</div>' : '') +
    '<div style="font-family:' + SANS + ';font-size:14px;margin-top:8px;">' +
    '<a href="' + esc_(save) + '" style="color:' + C.ink + ';font-weight:bold;">&#9734; Save</a> &nbsp;&middot;&nbsp; ' +
    '<a href="' + esc_(skip) + '" style="color:' + C.mist + ';">Not for me</a>' +
    (it.source_url ? ' &nbsp;&middot;&nbsp; <a href="' + esc_(it.source_url) + '" style="color:' + C.goldDeep + ';">Read the story</a>' : '') + '</div>';
}

function savedListHtml_(s) {
  var acts = genreActionsFor_(s.email);
  var items = acts.saves.map(itemById_).filter(Boolean).slice(-12).reverse();
  if (!items.length) return '';
  return '<b>You’ve saved ' + acts.saves.length + ' ' + (acts.saves.length === 1 ? 'story' : 'stories') + ' so far:</b><br>' +
    items.map(function (it) { return '&middot; ' + (it.source_url ? '<a href="' + esc_(it.source_url) + '" style="color:' + C.goldDeep + ';">' + esc_(it.title) + '</a>' : esc_(it.title)); }).join('<br>') + '<br><br>';
}

function sendTrialMidpoint_(s) {
  var dl = daysLeft_(s);
  var body = savedListHtml_(s) +
    'You have ' + dl + ' days left of your free trial. Here’s what changes if you make The Ariel your own:<br><br>' +
    '&middot; <b>Your lens, not a genre.</b> We start from what you develop, your commissioners and your slate, and rank every story for you.<br>' +
    '&middot; <b>It learns.</b> Everything you save or skip sharpens what comes next. Your saves from this trial come with you.<br>' +
    '&middot; <b>Research this.</b> One click on any story gets you a brief: what’s been made, who the people are, who holds the rights.<br>' +
    '&middot; <b>Colleagues copied in</b>, and first look at rights-available titles chosen for you.<br><br>' +
    'Upgrade during your trial and the £250 setup fee is waived.<br>' + gBtn_(appLink_(s, '&panel=upgrade'), 'Make it yours', true) + gBtn_(appLink_(s), 'Open my Ariel', false);
  var html = gShell_('The Ariel &middot; Genres', 'What your own Ariel would do', gPara_((s.name ? 'Hello ' + esc_(s.name) + ',<br><br>' : '') + body), gFooter_(s));
  genreMail_(s.email, 'Your Ariel so far, and what comes next', html);
}

function sendTrialEnding_(s) {
  var body = savedListHtml_(s) + 'Your free trial ends in two days. To keep your daily stories coming:<br><br>' +
    '&middot; <b>Keep one genre</b> for ' + GENRE_CFG.PRICE_ONE + ', or <b>all the genres</b> for ' + GENRE_CFG.PRICE_ALL + '. Cancel any time.<br>' +
    '&middot; Or <b>make it yours</b>: an Ariel built around your own slate, with research briefs and colleagues copied in. Upgrade before your trial ends and the £250 setup fee is waived.<br><br>' +
    gBtn_(appLink_(s, '&panel=keep'), 'Keep my genres', true) + gBtn_(appLink_(s, '&panel=upgrade'), 'Make it yours', false) +
    '<br><br><span style="font-size:14px;color:' + C.mist + ';">If you do nothing, the daily email simply stops. You’ll still get the free London Review of Reviews if you signed up for it.</span>';
  var html = gShell_('The Ariel &middot; Genres', 'Your trial ends in two days', gPara_((s.name ? 'Hello ' + esc_(s.name) + ',<br><br>' : '') + body), gFooter_(s));
  genreMail_(s.email, 'Your Ariel trial ends in two days', html);
}

function sendTrialEnded_(s) {
  var body = 'Your free month of Ariel Genres has ended, so the daily email has stopped. Thank you for trying it.<br><br>' + savedListHtml_(s) +
    'You can pick up where you left off at any time: keep one genre for ' + GENRE_CFG.PRICE_ONE + ' or all of them for ' + GENRE_CFG.PRICE_ALL + ', or ask us to build an Ariel around your own slate.<br>' +
    gBtn_(appLink_(s, '&panel=keep'), 'Keep my genres', true) + gBtn_(appLink_(s, '&panel=upgrade'), 'Make it yours', false);
  var html = gShell_('The Ariel &middot; Genres', 'Your free month has ended', gPara_((s.name ? 'Hello ' + esc_(s.name) + ',<br><br>' : '') + body),
    'The Ariel &middot; <a href="mailto:tara@theariel.tv" style="color:' + C.mist + ';">tara@theariel.tv</a>');
  genreMail_(s.email, 'Your Ariel trial has ended', html);
}

/* ───────────────────────── admin ───────────────────────── */

function genreAdmin_(b) {
  if (b.op === 'genre_stats') {
    var v = genreSheet_('GenreSubs').getDataRange().getValues();
    var c = { pending: 0, trial: 0, ended: 0, paid_one: 0, paid_all: 0, comp: 0, unsubscribed: 0, keep_interest: 0, upgrade_interest: 0 }, per = {};
    for (var i = 1; i < v.length; i++) {
      var st = v[i][6], plan = v[i][5];
      if (st === 'pending') c.pending++; else if (st === 'unsubscribed') c.unsubscribed++; else if (st === 'ended') c.ended++;
      else if (plan === 'trial') c.trial++; else if (plan === 'one') c.paid_one++; else if (plan === 'all') c.paid_all++; else if (plan === 'comp') c.comp++;
      if (v[i][17]) c.keep_interest++;
      if (v[i][18]) c.upgrade_interest++;
      String(v[i][4]).split(',').forEach(function (g) { if (g) per[g] = (per[g] || 0) + 1; });
    }
    var items = genreSheet_('GenreItems').getDataRange().getValues();
    var perItems = {};
    for (var j = 1; j < items.length; j++) perItems[items[j][1]] = (perItems[items[j][1]] || 0) + 1;
    return { ok: true, subscribers: c, by_genre: per, items_by_genre: perItems };
  }
  if (b.op === 'genre_subs') {
    var sv = genreSheet_('GenreSubs').getDataRange().getValues();
    return { ok: true, subs: sv.slice(1).map(function (r) { var o = {}; GSUB_HEADERS.forEach(function (h, i) { if (h !== 'token') o[h] = r[i]; }); return o; }) };
  }
  if (b.op === 'genre_requests') {
    var rv = genreSheet_('GenreRequests').getDataRange().getValues();
    var counts = {};
    rv.slice(1).forEach(function (r) { var k = String(r[4]).trim(); counts[k] = (counts[k] || 0) + 1; });
    return { ok: true, counts: counts, requests: rv.slice(1).map(function (r) { return { time: r[0], email: r[1], role: r[3], genre: r[4], note: r[5], status: r[7] }; }) };
  }
  if (b.op === 'activate_genre') {
    var f = gSubRow_('email', String(b.email || '').toLowerCase().trim());
    if (!f.row) return { ok: false, error: 'unknown_email' };
    var plan = ['one', 'all', 'comp'].indexOf(b.plan) >= 0 ? b.plan : 'one';
    var s = gSub_(f.sh, f.row);
    if (b.paid_until) {
      setCells_(f.sh, f.row, { plan: plan, paid_until: new Date(b.paid_until), status: 'active' });
      upsertMember_(s.email, 'genre', new Date(b.paid_until), 'Ariel Genres ' + plan);
    } else {
      activateGenrePaid_(s, plan, Number(b.months) || 1, b.genre || '');
    }
    return { ok: true };
  }
  if (b.op === 'genre_add') return genreAddEntries_(b.genre, cfgValue_('genre_feed_key'), b.entries);
  if (b.op === 'genre_hide_item') {
    var ish = genreSheet_('GenreItems');
    var row = findRow_(ish, 1, b.item_id);
    if (!row) return { ok: false };
    ish.getRange(row, GITEM_HEADERS.indexOf('status') + 1).setValue('hidden');
    return { ok: true };
  }
  if (b.op === 'genre_tick') { genreTick(); return { ok: true }; }
  if (b.op === 'genre_test_digest') {
    var tf = gSubRow_('email', String(b.email || '').toLowerCase().trim());
    if (!tf.row) return { ok: false, error: 'unknown_email' };
    var ts = gSub_(tf.sh, tf.row);
    if (b.reset) { setCell_(tf.sh, tf.row, 'last_digest', ''); ts = gSub_(tf.sh, tf.row); }
    return { ok: true, sent: sendGenreDigest_(ts) };
  }
  return null;
}
