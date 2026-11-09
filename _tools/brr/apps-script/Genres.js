/**
 * Ariel Genres - ready-made genre feeds with a free 30-day trial (The Ariel).
 * v1.1 2026-11-05 - per-genre pricing (GBP 29 first genre + GBP 10 each extra, free month covers up to 2), no setup fee on own Ariel
 *
 * Lives in the same Apps Script project as the London Review of Reviews, so it shares
 * the sheet, the sending alias, the Members tab (unlimited rights checks) and the admin secret.
 *
 * Tabs (auto-created by ensureGenres_):
 *   GenreItems    - one row per story placed in a genre feed (written by the daily distribution run)
 *   GenreSubs     - one row per person: genres, trial dates, plan, token (the token is their dashboard key)
 *   GenreActions  - every Save / Not for me / intro click, per person
 *   GenreRequests - Request a genre
 *   Config keys   - genre_feed_key, genre_pay_url (one Stripe link: GBP 29 base + 'Additional genre' GBP 10 line with adjustable quantity),
 *                   optional genre_pay_url_2 .. genre_pay_url_8 (fixed-count links, no quantity step for the buyer), genre_digest_hour, genre_book_url
 *
 * Public web API (all JSON):
 *   POST {action:"genre_signup", email, name, role, company, genres[], ror, website, source}
 *   GET  ?action=genre_feed&k=TOKEN                 (first call activates the trial)
 *   GET  ?action=genre_sample                       (3 recent real stories per genre, for the landing page)
 *   POST {action:"genre_act", k, item_id, act:"save"|"skip"|"unsave"|"unskip"}
 *   POST {action:"genre_settings", k, genres[], digest:"daily"|"weekly"|"off"}
 *   POST {action:"genre_keep", k, genres[]}          (genres they keep; price = 29 + 10 x (n-1))
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
 *   genre_stats, genre_subs, genre_requests, activate_genre {email, genres[]|count, months|paid_until, plan:'paid'|'comp'}, genre_add {genre, entries}
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
  },
  'cults': {
    name: 'Cults', on_request: true,
    blurb: 'Movements, leaders and the people who got out: coercive groups, high-control churches, wellness and online cults.',
    labels: ['Inside the Group', 'Leaders', 'Survivors', 'Investigations', 'Cult Books'],
    items_per_day: 6,
    lens: 'On-request Cults feed. Surface stories about coercive and high-control groups with a named person at the centre: leaders, survivors and defectors, families trying to get someone out, investigations into abuse or money, and wellness, political, religious and online movements. Favour first-hand testimony, leaked material or archive, and groups that are still active or newly exposed.',
    avoid: 'Opinion and explainers on why people join cults; anything already made into a documentary or series, or announced as one.'
  },
  'supernatural-paranormal': {
    name: 'Supernatural & Paranormal', on_request: true,
    blurb: 'Hauntings, the unexplained, believers and sceptics, and the folklore and investigations behind them.',
    labels: ['Hauntings', 'Unexplained', 'Believers & Sceptics', 'Folklore', 'Paranormal Books'],
    items_per_day: 6,
    lens: 'On-request Supernatural & Paranormal feed. Surface stories with a named person and a real place at the centre: hauntings and possessions with witnesses, unexplained events and sightings, investigators and debunkers, hoaxes exposed, folklore and rituals still practised, and new books on any of these. Favour stories with archive, recordings or a community still divided about what happened.',
    avoid: 'Listicles, horoscope and wellness content, and fiction; anything already made into a documentary or series.'
  },
  'medical-mysteries': {
    name: 'Medical Mysteries', on_request: true,
    blurb: 'Undiagnosed illnesses, medical detectives, malpractice and scandals, and breakthroughs with a human story.',
    labels: ['Undiagnosed', 'Medical Detectives', 'Scandals & Malpractice', 'Breakthroughs', 'Medical Books'],
    items_per_day: 6,
    lens: 'On-request Medical Mysteries feed. Surface stories with a named patient, family or doctor at the centre: undiagnosed and rare conditions, clusters of unexplained illness, doctors and families who cracked a case, malpractice and health scandals, and breakthroughs told through the people they changed. A clear arc and stakes.',
    avoid: 'Health advice, study round-ups and policy commentary with no human story; anything already made into a documentary or series.'
  },
  'celebrity': {
    name: 'Celebrity', on_request: true,
    blurb: 'Rise and fall, secret lives, feuds and scandals, comebacks and the memoirs that reveal them.',
    labels: ['Rise & Fall', 'Secret Lives', 'Feuds & Scandals', 'Comebacks', 'Celebrity Memoirs'],
    items_per_day: 6,
    lens: 'On-request Celebrity feed. Surface stories about famous people where there is a real untold story: rise and fall, hidden lives revealed through new material, feuds, scandals and legal fights, comebacks, and memoirs or biographies with genuine revelations. Favour new archive, new testimony or a fresh angle on an iconic figure.',
    avoid: 'Gossip, red-carpet and promotional interviews, trailers and teasers, and anything already made into a documentary or announced as one.'
  },
  'natural-disasters': {
    name: 'Natural Disasters', on_request: true,
    blurb: 'Survival, rescue, warnings ignored and the aftermath, from storms and floods to fires, quakes and eruptions.',
    labels: ['Survival', 'Warnings Ignored', 'Rescue', 'Aftermath', 'Disaster Books'],
    items_per_day: 6,
    lens: 'On-request Natural Disasters feed. Surface stories with named survivors, rescuers, scientists or officials at the centre: survival against the odds, rescues, warnings that were ignored and the inquiries that followed, communities rebuilding, and anniversaries of major disasters with lead time. Favour first-hand testimony, footage and an accountability angle.',
    avoid: 'Live weather updates, casualty-count news with no human story, and climate policy commentary; anything already made into a documentary or series.'
  },
  'fiction': {
    name: 'Fiction', on_request: true,
    blurb: 'Novels with screen potential: new and forthcoming fiction, debuts with buzz, prize lists, book deals, and rights-available novels sent to us by literary agents.',
    labels: ['Crime & Thriller', 'Literary', 'Historical', 'Book Club', 'Debuts & Deals'],
    items_per_day: 6,
    lens: 'On-request Fiction feed for drama producers and scripted development. Surface novels and short-story collections with adaptation potential: a strong premise that can be said in a sentence, a central character worth following for a series, a vivid world or period, crime and thriller plots, literary fiction with prize or review heat, debuts with buzz, forthcoming titles with lead time, and publishing deals or rights news that signal a book is coming. Favour reviews, deal reports, prize longlists, author profiles and agent rights lists.',
    avoid: 'Poetry, children\'s and picture books, non-fiction, bestseller-list reporting with no book at the centre, and anything already announced as a film or series.'
    },
  /* Children's genres (Tara, 9 Nov 2026), fed by the Children's Review of Reviews screen picks plus the shared sources. */
  'kids-preschool': {
    name: 'Preschool (0-5)', on_request: true,
    blurb: 'Picture books and preschool non-fiction with series potential: characters little children love, worlds built for episodes.',
    labels: ['Picture Books', 'Preschool Non-fiction', 'Characters & Series', 'Debuts & Deals'],
    items_per_day: 6,
    lens: 'On-request Preschool feed for children\'s TV, animation and preschool development. Surface picture books and preschool non-fiction (ages 0-5) with screen potential: a warm central character, a simple repeatable premise that could carry episodes, a distinctive visual world, strong review or prize heat, and series or sequel news. Include book deals and rights news for picture books, and rights-available titles from agents.',
    avoid: 'Parenting advice, education policy, reading-for-pleasure statistics, bestseller lists with no book at the centre, and anything already announced as a film or series.'
  },
  'kids-5-8': {
    name: 'Ages 5-8', on_request: true,
    blurb: 'Young fiction, illustrated stories and early non-fiction for 5-8s: funny, magical and adventurous books with a world to come back to.',
    labels: ['Young Fiction', 'Illustrated Stories', 'Early Non-fiction', 'Characters & Series', 'Debuts & Deals'],
    items_per_day: 6,
    lens: 'On-request Ages 5-8 feed for children\'s TV and animation. Surface picture books for older readers, first chapter books, illustrated story collections and non-fiction for ages 5-8 with screen potential: a hero children want to follow, comedy, magic or adventure with an episodic shape, a world that can grow, and review, prize or deal news. Include rights-available titles from agents.',
    avoid: 'Parenting advice, education policy, reading-for-pleasure statistics, bestseller lists with no book at the centre, and anything already announced as a film or series.'
  },
  'kids-middle-grade': {
    name: 'Middle Grade (8-12)', on_request: true,
    blurb: 'Novels, graphic novels and non-fiction for 8-12s: adventure, mystery, magic and true stories with a strong hero and a series in them.',
    labels: ['Adventure & Mystery', 'Fantasy & Magic', 'Funny', 'Graphic Novels', 'Non-fiction'],
    items_per_day: 6,
    lens: 'On-request Middle Grade feed for family drama, animation and children\'s TV. Surface middle-grade novels, graphic novels and non-fiction (ages 8-12) with screen potential: a premise that can be said in a sentence, a hero worth following for a series, a secret world or organisation, adventure, mystery or comic fantasy, true stories of children and animals, and prize, review or deal heat. Include rights-available titles from agents.',
    avoid: 'Parenting advice, education policy, reading-for-pleasure statistics, bestseller lists with no book at the centre, and anything already announced as a film or series.'
  },
  'kids-ya': {
    name: 'Young Adult (12+)', on_request: true,
    blurb: 'YA fiction and teen non-fiction with screen potential: thrillers, romantasy, contemporary stories and big high-concept series.',
    labels: ['Thriller & Mystery', 'Fantasy & Romantasy', 'Contemporary', 'Dystopian & Sci-fi', 'Teen Non-fiction'],
    items_per_day: 6,
    lens: 'On-request Young Adult feed for teen drama and streaming development. Surface YA novels and teen non-fiction (12+) with screen potential: a high-concept premise, a central character worth following for a series, thrillers and mysteries, fantasy and romantasy worlds, contemporary stories with a strong voice, series finales and trilogies, BookTok or prize heat, and book deals. Include rights-available titles from agents.',
    avoid: 'Parenting advice, education policy, reading-for-pleasure statistics, bestseller lists with no book at the centre, and anything already announced as a film or series.'
  }
};

var GENRE_CFG = {
  TRIAL_DAYS: 30,
  TRIAL_MAX_GENRES: 2,     // the free month covers up to two genres
  PRICE_FIRST: 29.99,      // GBP a month for the first genre (Stripe price is 29.99)
  PRICE_EXTRA: 10,         // GBP a month for each additional genre (8 genres = 99 = your own Ariel)
  MAX_GENRES: 8,
  APP_URL: 'https://theariel.tv/genres/app.html',
  LANDING_URL: 'https://theariel.tv/genres/',
  BOOK_URL: 'https://calendly.com/tarabutton/15min',
  FEED_DAYS: 45,
  DIGEST_PER_GENRE: 6,
  DIGEST_HOUR: 7
};

function genrePrice_(n) { n = Math.max(1, Math.min(GENRE_CFG.MAX_GENRES, Number(n) || 1)); return Math.round((GENRE_CFG.PRICE_FIRST + GENRE_CFG.PRICE_EXTRA * (n - 1)) * 100) / 100; }
function gbp_(x) { return '£' + (Math.round(x * 100) % 100 ? x.toFixed(2) : String(Math.round(x))); }
function genrePriceLabel_(n) { n = Math.max(1, Number(n) || 1); return gbp_(genrePrice_(n)) + ' a month' + (n > 1 ? ' for ' + n + ' genres' : ''); }
var PRICE_SENTENCE = gbp_(GENRE_CFG.PRICE_FIRST) + ' a month for one genre, ' + gbp_(GENRE_CFG.PRICE_EXTRA) + ' for each extra';
var OWN_ARIEL_SENTENCE = 'No setup fee and no minimum term: £75 a month at the founding rate, cancel any time.';
/* How many genres a subscriber may have switched on. */
function allowedGenres_(s) {
  if (!s) return GENRE_CFG.TRIAL_MAX_GENRES;
  if (s.plan === 'comp' || s.plan === 'all') return GENRE_CFG.MAX_GENRES;
  if (s.plan === 'paid') return Math.max(1, Math.min(GENRE_CFG.MAX_GENRES, Number(s.paid_genres) || 1));
  if (s.plan === 'one') return 1;
  return GENRE_CFG.TRIAL_MAX_GENRES;
}
function isPaidPlan_(plan) { return plan === 'paid' || plan === 'one' || plan === 'all'; }

var GITEM_HEADERS = ['id', 'genre', 'date', 'added_at', 'title', 'summary', 'source_name', 'source_url', 'source_id', 'label',
  'relevance_note', 'score', 'tier', 'agent', 'agency', 'agent_name', 'rights_note', 'original_language', 'original_title', 'status'];
var GSUB_HEADERS = ['email', 'name', 'role', 'company', 'genres', 'plan', 'status', 'token', 'created_at', 'activated_at',
  'trial_end', 'paid_until', 'digest', 'last_digest', 'day21_sent', 'day28_sent', 'ended_sent', 'keep_interest',
  'upgrade_interest', 'source', 'ror_optin', 'last_link_sent', 'note', 'paid_genres'];
var GACT_HEADERS = ['time', 'email', 'item_id', 'genre', 'action', 'title'];
var GREQ_HEADERS = ['time', 'email', 'name', 'role', 'genre', 'note', 'source', 'status'];

var GENRE_ROLES = ['Producer', 'Development executive', 'Commissioner', 'Director', 'Writer', 'Agent or publisher', 'Other'];

var PAY_URL_NOTE = 'Stripe payment link for Ariel Genres: product "Ariel Genres" £' + GENRE_CFG.PRICE_FIRST + '/month plus an "Additional genre" £' + GENRE_CFG.PRICE_EXTRA + '/month line with adjustable quantity (0-7). Optional keys genre_pay_url_2 .. genre_pay_url_8 = fixed-count links (no quantity step). Blank = keep requests are emailed to Tara.';

/* ───────────────────────── setup ───────────────────────── */

function ensureGenres_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName('GenreSubs') && ss.getSheetByName('GenreItems') && ss.getSheetByName('GenreActions') && ss.getSheetByName('GenreRequests')) {
    if (CacheService.getScriptCache().get('genres_v11')) return;
    var subs = ss.getSheetByName('GenreSubs');
    var have = subs.getRange(1, 1, 1, Math.max(1, subs.getLastColumn())).getValues()[0].map(String);
    GSUB_HEADERS.forEach(function (h) { if (have.indexOf(h) < 0) { subs.getRange(1, subs.getLastColumn() + 1).setValue(h); have.push(h); } });
    var cfg0 = ss.getSheetByName('Config');
    if (cfg0 && !findRow_(cfg0, 1, 'genre_pay_url')) cfg0.appendRow(['genre_pay_url', '', PAY_URL_NOTE]);
    CacheService.getScriptCache().put('genres_v11', '1', 21600);
    return;
  }
  ensureTab_(ss, 'GenreItems', GITEM_HEADERS);
  ensureTab_(ss, 'GenreSubs', GSUB_HEADERS);
  ensureTab_(ss, 'GenreActions', GACT_HEADERS);
  ensureTab_(ss, 'GenreRequests', GREQ_HEADERS);
  if (!ss.getSheetByName('Config')) setupRights_();
  var cfg = ss.getSheetByName('Config');
  var add = function (k, v, note) { if (!findRow_(cfg, 1, k)) cfg.appendRow([k, v, note]); };
  add('genre_feed_key', Utilities.getUuid().replace(/-/g, ''), 'Key the daily distribution run uses to post stories into the genre feeds. Keep private.');
  add('genre_pay_url', '', PAY_URL_NOTE);
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
  if (action === 'genre_active') {
    if (!genreKeyOk_(p.key)) return { success: false, error: 'forbidden' };
    return genreActive_();
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
    return { slug: slug, name: g.name, blurb: g.blurb, labels: g.labels, on_request: !!g.on_request };
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
  var genres = cleanGenres_(b.genres).slice(0, GENRE_CFG.TRIAL_MAX_GENRES);  // the free month covers up to two genres
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
    var before = genreReaders_();
    var token = newToken_();
    var rec = { email: email, name: name, role: role, company: company, genres: genres.join(','), plan: 'trial', status: 'pending',
      token: token, created_at: now, activated_at: '', trial_end: '', paid_until: '', digest: 'daily', last_digest: '',
      day21_sent: '', day28_sent: '', ended_sent: '', keep_interest: '', upgrade_interest: '', source: String(b.source || 'site').slice(0, 30),
      ror_optin: b.ror === false || b.ror === 'no' ? 'no' : 'yes', last_link_sent: now, note: '' };
    f.sh.appendRow(GSUB_HEADERS.map(function (h) { return rec[h]; }));
    var sub = gSub_(f.sh, f.sh.getLastRow());
    sub.firstOn = genres.filter(function (g) { return !before[g]; });
    sendGenreLink_(sub, 'welcome');
    noteGenreDemand_(genres, before, email);
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
  return (isPaidPlan_(s.plan) || s.plan === 'comp') && (!s.paid_until || new Date(s.paid_until).getTime() + 5 * 86400000 > Date.now() || s.plan === 'comp');
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

/* ───────────────────────── on-demand genres ───────────────────────── */

/* Genres with at least one reader: anyone with access, or a sign-up in the last 7 days who hasn't opened their link yet.
   The daily run only processes these, so no genre is read and scored until someone has chosen it. */
function genreReaders_() {
  var v = genreSheet_('GenreSubs').getDataRange().getValues();
  var out = {};
  Object.keys(GENRES).forEach(function (g) { out[g] = 0; });
  for (var i = 1; i < v.length; i++) {
    var s = {}; GSUB_HEADERS.forEach(function (h, j) { s[h] = v[i][j]; });
    var counts = false;
    if (s.status === 'pending') counts = s.created_at && Date.now() - new Date(s.created_at).getTime() < 7 * 86400000;
    else if (s.status === 'active') counts = hasAccess_(s) || paidActive_(s);
    if (!counts) continue;
    String(s.genres || '').split(',').forEach(function (g) { g = g.trim(); if (out[g] !== undefined) out[g]++; });
  }
  return out;
}

function genreActive_() {
  var r = genreReaders_();
  var list = Object.keys(r).filter(function (g) { return r[g] > 0; }).map(function (g) { return { slug: g, name: GENRES[g].name, readers: r[g] }; });
  return { success: true, genres: list, inactive: Object.keys(r).filter(function (g) { return !r[g]; }) };
}

/* Tell Tara when a genre gets its first reader, so she knows the daily run has started on it. */
function noteGenreDemand_(newGenres, before, who) {
  newGenres.forEach(function (g) {
    if (before[g]) return;
    alertTara_('[Ariel Genres] Switched on: ' + gName_(g),
      who + ' is the first reader of ' + gName_(g) + '. From the next daily run (overnight) it is read and scored like the others, and their first stories arrive the next morning.' +
      (GENRES[g].on_request ? '\nThis is a new on-request genre, so its sources are the shared ones: check the first few days look right.' : ''));
  });
}

/* ───────────────────────── dashboard API ───────────────────────── */

function genreFeed_(k) {
  var s = subByToken_(k);
  if (!s) return { ok: false, error: 'unknown_link', message: 'We don’t recognise that link.' };
  if (s.status === 'pending') s = activateIfPending_(s);
  var me = {
    name: s.name, email: s.email, genres: s.genreList, plan: s.plan, status: s.status, digest: s.digest || 'daily', allowed_genres: allowedGenres_(s),
    trial_end: s.trial_end ? new Date(s.trial_end).toISOString() : '', days_left: s.plan === 'trial' ? daysLeft_(s) : null,
    paid_until: s.paid_until ? new Date(s.paid_until).toISOString() : '', upgrade_requested: !!s.upgrade_interest, keep_requested: !!s.keep_interest
  };
  var acts = genreActionsFor_(s.email);
  var base = { ok: true, me: me, all_genres: genreDefsPublic_(), prices: { first: GENRE_CFG.PRICE_FIRST, extra: GENRE_CFG.PRICE_EXTRA, trial_max: GENRE_CFG.TRIAL_MAX_GENRES, max: GENRE_CFG.MAX_GENRES, sentence: PRICE_SENTENCE }, book_url: cfgValue_('genre_book_url') || GENRE_CFG.BOOK_URL };
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
    var allowed = allowedGenres_(s);
    if (g.length > allowed) {
      return { ok: false, error: 'too_many', allowed: allowed, message: s.plan === 'trial'
        ? 'Your free month covers up to ' + allowed + ' genres. You can add more when you keep your Ariel (' + gbp_(GENRE_CFG.PRICE_EXTRA) + ' a month each).'
        : 'You have ' + allowed + ' genre' + (allowed > 1 ? 's' : '') + ' on your plan. To add one for ' + gbp_(GENRE_CFG.PRICE_EXTRA) + ' a month, use Keep my genres.' };
    }
    upd.genres = g.join(',');
    noteGenreDemand_(g.filter(function (x) { return s.genreList.indexOf(x) < 0; }), genreReaders_(), s.email);
  }
  if (b.digest && ['daily', 'weekly', 'off'].indexOf(b.digest) >= 0) upd.digest = b.digest;
  setCells_(sh, s.row, upd);
  return { ok: true };
}

function genreKeep_(b) {
  var s = subByToken_(b.k);
  if (!s) return { ok: false, error: 'unknown_link' };
  var genres = cleanGenres_(b.genres);
  if (!genres.length) genres = s.genreList.slice();
  if (!genres.length) genres = ['true-crime'];
  genres = genres.slice(0, GENRE_CFG.MAX_GENRES);
  var n = genres.length, price = genrePrice_(n), label = genrePriceLabel_(n);
  var sh = genreSheet_('GenreSubs');
  setCells_(sh, s.row, { keep_interest: new Date() + ' ' + n + ':' + genres.join(','), genres: genres.join(',') });
  noteGenreDemand_(genres.filter(function (x) { return s.genreList.indexOf(x) < 0; }), genreReaders_(), s.email);
  var fixed = cfgValue_('genre_pay_url_' + n);
  var base = cfgValue_('genre_pay_url');
  // The base link covers 1 genre (and 2 via its "Add" cross-sell); for more we need a fixed-count link or Tara sends one by hand
  var url = fixed || base;
  alertTara_('[Ariel Genres] ' + s.email + ' wants to keep ' + n + ' genre' + (n > 1 ? 's' : '') + ' (' + label + ')',
    s.email + (s.name ? ' (' + s.name + (s.company ? ', ' + s.company : '') + ')' : '') + ' clicked Keep: ' + genres.map(gName_).join(', ') + ', ' + label + '.\n' +
    (url ? 'They were sent to the Stripe link' + (fixed || n === 1 ? '' : ' (they press Add on Additional Genre, then set Qty to ' + (n - 1) + ')') + '. Payment is picked up automatically from the Stripe email; if it is not, run admin activate_genre.'
      : 'No Stripe link is set in Config (genre_pay_url), so please email them a payment link today, then activate them (admin op activate_genre).'));
  if (url) {
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    return { ok: true, count: n, price: price, label: label, set_quantity: fixed || n === 1 ? 0 : n - 1, price_label: gbp_(price),
      url: url + sep + 'prefilled_email=' + encodeURIComponent(s.email) + '&client_reference_id=' + encodeURIComponent(s.token.slice(0, 40)) };
  }
  sendGenreNote_(s, 'Keeping ' + genres.map(gName_).join(', '),
    'Thank you. We’ll email you a payment link for ' + genres.map(gName_).join(', ') + ' (' + label + ') within a working day. Your feed stays on in the meantime.');
  extendGrace_(s, 7);
  return { ok: true, interest: true, count: n, price: price, label: label };
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
    ' wants their own Ariel.\nGenres: ' + s.genreList.map(gName_).join(', ') + '\nPlan: ' + s.plan + (inTrial ? ' (in trial)' : '') +
    '\n\nWhat they saved (' + saved.length + '):\n' + (saved.join('\n') || '(nothing yet)') +
    '\n\nNext: book the onboarding call. Their saves seed the new profile.json.');
  var book = cfgValue_('genre_book_url') || GENRE_CFG.BOOK_URL;
  sendGenreNote_(s, 'Your own Ariel',
    'Thank you. Tara will email you within a working day to set up your own Ariel. ' + OWN_ARIEL_SENTENCE + ' ' +
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
    try { rightsPaymentsTick_(); } catch (err) { log_('error', 'rights payments: ' + err); }
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
        if (isPaidPlan_(s.plan) && s.paid_until && new Date(s.paid_until).getTime() + 5 * 86400000 < Date.now() && String(s.note).indexOf('renewal_check') < 0) {
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
      if (low.indexOf('ariel genres') < 0 && low.indexOf('genre subscription') < 0 && low.indexOf('additional genre') < 0) return;  // own-Ariel payments (£75/£99) must never be read as genre payments
      var count = 0, re = /£\s?(\d{2,3}(?:\.\d{2})?)\b/g, mm;
      while ((mm = re.exec(body))) {
        var amt = Number(mm[1]);
        var n = Math.round((amt - GENRE_CFG.PRICE_FIRST) / GENRE_CFG.PRICE_EXTRA) + 1;
        if (n >= 1 && n <= GENRE_CFG.MAX_GENRES && Math.abs(genrePrice_(n) - amt) < 0.011) { count = n; break; }
      }
      if (!count) return;
      Object.keys(emails).forEach(function (em) {
        if (low.indexOf(em) < 0) return;
        var s = gSub_(sh, emails[em]);
        activateGenrePaid_(s, count, 1, []);
        alertTara_('[Ariel Genres] Payment matched: ' + em, 'Stripe email "' + m.getSubject() + '" matched ' + em + '. Plan set to ' + count + ' genre' + (count > 1 ? 's' : '') + ' (' + genrePriceLabel_(count) + ') for another month.');
      });
    });
    t.addLabel(label);
  });
}

/* Switch a subscriber on for `count` paid genres. `genres` (optional list) fixes which ones; otherwise the ones they
   chose when they clicked Keep, else the first `count` of their current genres. plan 'comp' = free of charge, all genres. */
function activateGenrePaid_(s, count, months, genres, plan) {
  var sh = genreSheet_('GenreSubs');
  plan = plan === 'comp' ? 'comp' : 'paid';
  count = Math.max(1, Math.min(GENRE_CFG.MAX_GENRES, Number(count) || 1));
  var base = s.paid_until && new Date(s.paid_until) > new Date() ? new Date(s.paid_until) : new Date();
  var until = new Date(base.getTime() + (months || 1) * 31 * 86400000);
  var chosen = cleanGenres_(genres);
  if (!chosen.length && s.keep_interest) chosen = cleanGenres_(String(s.keep_interest).split(':')[1] || '');
  if (!chosen.length) chosen = s.genreList.slice();
  if (plan === 'paid') chosen = chosen.slice(0, count);
  if (!chosen.length) chosen = ['true-crime'];
  var upd = { plan: plan, paid_until: until, status: 'active', paid_genres: plan === 'paid' ? count : GENRE_CFG.MAX_GENRES, genres: chosen.join(','),
    note: String(s.note || '').replace(' renewal_check', '') };
  if (s.status === 'pending') upd.activated_at = new Date();
  setCells_(sh, s.row, upd);
  upsertMember_(s.email, 'genre', until, 'Ariel Genres ' + plan + ' ' + chosen.length);
  if (s.plan === 'trial' || s.status === 'ended') {
    sendGenreNote_(gSub_(sh, s.row), 'You’re all set',
      'Thank you. ' + chosen.map(gName_).join(', ') + (chosen.length > 1 ? ' are' : ' is') + ' yours, and the daily email carries on as before. ' +
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
    (welcome && s.firstOn && s.firstOn.length ? 'You’re the first to choose ' + esc_(s.firstOn.map(gName_).join(' and ')) + ', so we’re switching ' + (s.firstOn.length > 1 ? 'them' : 'it') + ' on for you now: the first stories arrive tomorrow morning.<br><br>' : '') +
    (welcome ? 'From tomorrow morning you’ll get a short email of the best new stories in your genres: books, investigations and true stories with screen potential, plus rights-available titles sent to us directly by literary agents. ' +
      'Save what interests you and skip what doesn’t, from the email or the dashboard.<br><br>' +
      'Your trial is free for ' + GENRE_CFG.TRIAL_DAYS + ' days, with no card. It also includes three rights checks on the London Review of Reviews (unlimited once you keep your Ariel).' : ''));
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
    ' ' + OWN_ARIEL_SENTENCE + '<br>' +
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
    OWN_ARIEL_SENTENCE + '<br>' + gBtn_(appLink_(s, '&panel=upgrade'), 'Make it yours', true) + gBtn_(appLink_(s), 'Open my Ariel', false);
  var html = gShell_('The Ariel &middot; Genres', 'What your own Ariel would do', gPara_((s.name ? 'Hello ' + esc_(s.name) + ',<br><br>' : '') + body), gFooter_(s));
  genreMail_(s.email, 'Your Ariel so far, and what comes next', html);
}

function sendTrialEnding_(s) {
  var body = savedListHtml_(s) + 'Your free trial ends in two days. To keep your daily stories coming:<br><br>' +
    '&middot; <b>Keep your genres</b>: ' + PRICE_SENTENCE + '. Cancel any time.<br>' +
    '&middot; Or <b>make it yours</b>: an Ariel built around your own slate, with research briefs and colleagues copied in. ' + OWN_ARIEL_SENTENCE + '<br><br>' +
    gBtn_(appLink_(s, '&panel=keep'), 'Keep my genres', true) + gBtn_(appLink_(s, '&panel=upgrade'), 'Make it yours', false) +
    '<br><br><span style="font-size:14px;color:' + C.mist + ';">If you do nothing, the daily email simply stops. You’ll still get the free London Review of Reviews if you signed up for it.</span>';
  var html = gShell_('The Ariel &middot; Genres', 'Your trial ends in two days', gPara_((s.name ? 'Hello ' + esc_(s.name) + ',<br><br>' : '') + body), gFooter_(s));
  genreMail_(s.email, 'Your Ariel trial ends in two days', html);
}

function sendTrialEnded_(s) {
  var body = 'Your free month of Ariel Genres has ended, so the daily email has stopped. Thank you for trying it.<br><br>' + savedListHtml_(s) +
    'You can pick up where you left off at any time: keep your genres (' + PRICE_SENTENCE + '), or ask us to build an Ariel around your own slate.<br>' +
    gBtn_(appLink_(s, '&panel=keep'), 'Keep my genres', true) + gBtn_(appLink_(s, '&panel=upgrade'), 'Make it yours', false);
  var html = gShell_('The Ariel &middot; Genres', 'Your free month has ended', gPara_((s.name ? 'Hello ' + esc_(s.name) + ',<br><br>' : '') + body),
    'The Ariel &middot; <a href="mailto:tara@theariel.tv" style="color:' + C.mist + ';">tara@theariel.tv</a>');
  genreMail_(s.email, 'Your Ariel trial has ended', html);
}

/* ───────────────────────── admin ───────────────────────── */

function genreAdmin_(b) {
  if (b.op === 'genre_stats') {
    var v = genreSheet_('GenreSubs').getDataRange().getValues();
    var c = { pending: 0, trial: 0, ended: 0, paid: 0, comp: 0, unsubscribed: 0, keep_interest: 0, upgrade_interest: 0 }, per = {};
    for (var i = 1; i < v.length; i++) {
      var st = v[i][6], plan = v[i][5];
      if (st === 'pending') c.pending++; else if (st === 'unsubscribed') c.unsubscribed++; else if (st === 'ended') c.ended++;
      else if (plan === 'trial') c.trial++; else if (isPaidPlan_(plan)) c.paid++; else if (plan === 'comp') c.comp++;
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
    var plan = b.plan === 'comp' ? 'comp' : 'paid';
    var s = gSub_(f.sh, f.row);
    var list = cleanGenres_(b.genres);
    if (b.genre && !list.length) list = cleanGenres_(b.genre);
    var count = list.length || Number(b.count) || s.genreList.length || 1;
    if (b.paid_until) {
      var upd = { plan: plan, paid_until: new Date(b.paid_until), status: 'active', paid_genres: plan === 'comp' ? GENRE_CFG.MAX_GENRES : count };
      if (list.length) upd.genres = list.join(',');
      setCells_(f.sh, f.row, upd);
      upsertMember_(s.email, 'genre', new Date(b.paid_until), 'Ariel Genres ' + plan + ' ' + count);
    } else {
      activateGenrePaid_(s, count, Number(b.months) || 1, list, plan);
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
