/**
 * London Review of Reviews - Check Rights, click tracking, rights store, outbox.
 * v1.0 2026-11-02
 *
 * Tabs (auto-created):
 *   Rights    - one row per book: who represents it and what the agent told us
 *   Requests  - every Check Rights click that reached the form
 *   Clicks    - every tracked click (review links, Check Rights opens), for real demand numbers
 *   Members   - Ariel members and Rights Pass holders (email, type member|pass)
 *   Outbox    - emails queued by Claude's runs; sent after a hold unless status set to "hold"
 *   Config    - admin secret for Claude's runs (keep the sheet private)
 *
 * Tiers for Check Rights:
 *   member / pass -> unlimited
 *   anyone else   -> first check free (one per email address), then the upsell
 */

var RIGHTS_HEADERS = ['book_id', 'book', 'author', 'agency', 'agent_name', 'agent_email', 'screen_email', 'agency_type',
  'source_url', 'status', 'handled_by', 'show_public', 'asked_at', 'answered_at', 'notes'];
var REQ_HEADERS = ['time', 'book_id', 'book', 'email', 'name', 'company', 'role', 'tier', 'status', 'answered_at', 'source', 'edition_id'];
var CLICK_HEADERS = ['time', 'edition_id', 'book_id', 'kind', 'where', 'role', 'reader', 'pub'];
var MEMBER_HEADERS = ['email', 'type', 'since', 'until', 'note'];
var OUTBOX_HEADERS = ['id', 'queued_at', 'send_after', 'status', 'to', 'cc', 'subject', 'kind', 'ref', 'html', 'text', 'sent_at', 'error'];

var RIGHTS_CFG = {
  HOLD_MIN: 30,
  OUTBOX_DAILY_CAP: 40,
  CHECK_PRICE: 5,            // GBP, one rights check, one-off (Stripe product "Rights check (one book)")
  PASS_PRICE_NUM: 15,        // GBP a month, unlimited checks (Stripe product "Unlimited rights checks")
  PASS_PRICE: '£15 a month',
  TRIAL_CHECKS: 3,           // rights checks included in a free Ariel Genres month
  GUARANTEE_DAYS: 14,        // calendar days (~10 working): a paid check with no answer by then is credited back
  ANSWER_PROMISE: 'within a working day'
};
var RIGHTS_CHECK_URL_NOTE = 'Stripe payment link, ONE-OFF £5: product "Rights check (one book)". Blank = the £5 option is hidden.';
var RIGHTS_PASS_URL_NOTE = 'Stripe payment link, MONTHLY £15: product "Unlimited rights checks". Blank = the £15 option is hidden.';

var RIGHTS_STATUS_TEXT = {
  available: 'Screen rights are available',
  optioned: 'Screen rights are currently optioned or sold',
  not_available: 'Screen rights are not available',
  handled_elsewhere: 'Screen rights are handled by another agent',
  unknown: 'We are still finding out',
  asked: 'We have asked the agent'
};

/* ───────────── setup (called from setupSheet and lazily) ───────────── */

function setupRights_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureTab_(ss, 'Rights', RIGHTS_HEADERS);
  ensureTab_(ss, 'Requests', REQ_HEADERS);
  ensureTab_(ss, 'Clicks', CLICK_HEADERS);
  ensureTab_(ss, 'Members', MEMBER_HEADERS);
  ensureTab_(ss, 'Outbox', OUTBOX_HEADERS);
  var cfg = ensureTab_(ss, 'Config', ['key', 'value', 'note']);
  var secret = PropertiesService.getScriptProperties().getProperty('PUBLISH_SECRET');
  if (secret && !findRow_(cfg, 1, 'admin_secret')) {
    cfg.appendRow(['admin_secret', secret, 'Used by Claude’s weekly and daily runs. Keep this sheet private.']);
  }
  if (!findRow_(cfg, 1, 'rights_pass_url')) cfg.appendRow(['rights_pass_url', '', RIGHTS_PASS_URL_NOTE]);
  if (!findRow_(cfg, 1, 'rights_check_url')) cfg.appendRow(['rights_check_url', '', RIGHTS_CHECK_URL_NOTE]);
  ensureTriggers_();
}

function ensureTriggers_() {
  var have = {};
  ScriptApp.getProjectTriggers().forEach(function (t) { have[t.getHandlerFunction()] = true; });
  if (!have.sendDueEditions) ScriptApp.newTrigger('sendDueEditions').timeBased().everyHours(1).create();
  if (!have.sendOutbox) ScriptApp.newTrigger('sendOutbox').timeBased().everyMinutes(15).create();
  if (!have.genreTick) ScriptApp.newTrigger('genreTick').timeBased().everyHours(1).create();
}

function cfgValue_(key) {
  var sh = sheet_('Config');
  var row = findRow_(sh, 1, key);
  return row ? String(sh.getRange(row, 2).getValue() || '').trim() : '';
}

/* ───────────── click tracking ───────────── */

function logClick_(b) {
  var book = String(b.book_id || '').slice(0, 100);
  if (!book) return { ok: false };
  var role = '', reader = '';
  if (b.t) {
    var sh = sheet_('Subscribers');
    var row = findRow_(sh, 6, b.t);
    if (row) { role = cell_(sh, row, 'role') || 'subscriber'; reader = shortHash_(cell_(sh, row, 'email')); }
  }
  sheet_('Clicks').appendRow([new Date(), String(b.edition_id || '').slice(0, 12), book,
    String(b.kind || 'review').slice(0, 20), String(b.where || 'page').slice(0, 10), role, reader, String(b.pub || '').slice(0, 30)]);
  return { ok: true };
}

function shortHash_(s) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s).toLowerCase());
  return d.slice(0, 6).map(function (x) { return ((x + 256) % 256).toString(16); }).join('');
}

/* ───────────── Check Rights ───────────── */

function memberType_(email) {
  var sh = sheet_('Members');
  var row = findRow_(sh, 1, email);
  if (!row) return '';
  var until = cell_(sh, row, 'until');
  if (until && new Date(until) < new Date()) return '';
  return String(cell_(sh, row, 'type') || 'member');
}

function rightsRow_(bookId) {
  var sh = sheet_('Rights');
  return { sh: sh, row: findRow_(sh, 1, bookId) };
}

function checkRights_(b) {
  if (b.website) return { ok: true, outcome: 'accepted' };
  var email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'invalid_email', message: 'Please check your email address.' };
  var bookId = String(b.book_id || '').slice(0, 100);
  var bookTitle = String(b.book || '').slice(0, 200);
  if (!bookId || !bookTitle) return { ok: false, error: 'bad_book' };
  var name = String(b.name || '').trim().slice(0, 80);
  var company = String(b.company || '').trim().slice(0, 120);
  var role = ROLES.indexOf(b.role) >= 0 ? b.role : '';
  var wantsPass = b.want === 'pass';

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var req = sheet_('Requests');
    var tier = memberType_(email);
    var capped = false;
    var data = req.getDataRange().getValues();
    if (tier === 'genre' && genrePlanOf_(email) === 'trial') {
      // a free Ariel Genres month includes TRIAL_CHECKS rights checks
      var since = Date.now() - 31 * 86400000, used = 0;
      for (var i = 1; i < data.length; i++) if (String(data[i][3]).toLowerCase() === email && data[i][7] === 'genre' && data[i][8] !== 'upsell_shown' && new Date(data[i][0]).getTime() > since) used++;
      if (used >= RIGHTS_CFG.TRIAL_CHECKS) { tier = 'upsell'; capped = true; }
    }
    if (!tier) {
      var usedFree = 0, credits = 0;
      for (var j = 1; j < data.length; j++) {
        if (String(data[j][3]).toLowerCase() !== email) continue;
        if (data[j][7] === 'free') usedFree++;
        if (data[j][8] === 'credited') credits++;
      }
      tier = usedFree < 1 + credits ? 'free' : 'upsell';
    }
    if (wantsPass) tier = 'pass_interest';

    var now = new Date();
    var status = (tier === 'upsell') ? 'upsell_shown' : (tier === 'pass_interest' ? 'pass_interest' : 'open');
    req.appendRow([now, bookId, bookTitle, email, name, company, role, tier, status, '', String(b.source || 'page').slice(0, 20), String(b.edition_id || '').slice(0, 12)]);
    var reqRow = req.getLastRow();
    logClick_({ book_id: bookId, kind: tier === 'upsell' ? 'check_rights_upsell' : 'check_rights', where: b.source || 'page', edition_id: b.edition_id, t: b.t });

    if (tier === 'upsell') {
      var ref = 'r' + reqRow + '-' + shortHash_(email + bookId).slice(0, 8);
      return { ok: true, outcome: 'upsell', trial_cap: capped,
        genre_url: capped ? '' : '/genres/?from=rights',
        check_url: payLink_(cfgValue_('rights_check_url'), email, ref),
        pass_url: payLink_(cfgValue_('rights_pass_url'), email, ref),
        price_check: RIGHTS_CFG.CHECK_PRICE, price_pass: RIGHTS_CFG.PASS_PRICE_NUM, trial_checks: RIGHTS_CFG.TRIAL_CHECKS };
    }
    if (tier === 'pass_interest') {
      alertTara_('[Review of Reviews] Unlimited rights checks interest: ' + email,
        email + (name ? ' (' + name + (company ? ', ' + company : '') + ')' : '') + ' asked for unlimited rights checks (' + RIGHTS_CFG.PASS_PRICE +
        ').\nBook they were checking: ' + bookTitle + '\nNo Stripe link is set in Config (rights_pass_url), so please send them one by email.');
      return { ok: true, outcome: 'pass_interest' };
    }
    return fulfilRequest_(reqRow, email, name, company, role, bookId, bookTitle, String(b.author || ''), tier);
  } finally {
    lock.releaseLock();
  }
}

/* Stripe payment link with the buyer's email prefilled and our reference attached. */
function payLink_(url, email, ref) {
  if (!url) return '';
  var sep = url.indexOf('?') >= 0 ? '&' : '?';
  return url + sep + 'prefilled_email=' + encodeURIComponent(email) + '&client_reference_id=' + encodeURIComponent(ref);
}

/* The GenreSubs plan for an email ('trial' | 'paid' | 'comp' | '' ). Lives in Genres.js's tab; tolerant if it is missing. */
function genrePlanOf_(email) {
  try {
    var f = gSubRow_('email', String(email || '').toLowerCase());
    return f.row ? String(gSub_(f.sh, f.row).plan || '') : '';
  } catch (e) { return ''; }
}

/* Runs an accepted rights check (free first check, member, genre, pass or paid): answers instantly when we already
   know, sends the agent contact when we have it, otherwise acknowledges and leaves the request open for the rights run. */
function fulfilRequest_(reqRow, email, name, company, role, bookId, bookTitle, author, tier) {
  var req = sheet_('Requests');
  var now = new Date();
  var rr = rightsRow_(bookId);
  var known = rr.row ? String(cell_(rr.sh, rr.row, 'status') || '') : '';
  if (!rr.row) {
    rr.sh.appendRow([bookId, bookTitle, String(author || '').slice(0, 120), '', '', '', '', '', '', 'unknown', '', '', '', '', 'Created by a Check Rights request']);
  }
  if (['available', 'optioned', 'not_available', 'handled_elsewhere'].indexOf(known) >= 0) {
    sendRightsAnswer_(email, name, bookTitle, rr.sh, rr.row, tier);
    req.getRange(reqRow, 9, 1, 2).setValues([['answered', now]]);
    return { ok: true, outcome: 'answered' };
  }
  if (rr.row && contactOf_(rr.sh, rr.row)) {
    sendRightsContact_(email, name, bookTitle, rr.sh, rr.row, tier);
    req.getRange(reqRow, 9, 1, 2).setValues([['contact_sent', now]]);
    alertTara_('[Review of Reviews] Rights check: ' + bookTitle,
      (name || email) + (company ? ' (' + company + ')' : '') + (role ? ', ' + role : '') + ' asked about screen rights to "' + bookTitle +
      '".\nTier: ' + tier + '\nThey were sent the agent contact details instantly. The daily rights run will ask the agent for the rights status.');
    return { ok: true, outcome: 'contact' };
  }
  sendRightsAck_(email, name, bookTitle, tier);
  alertTara_('[Review of Reviews] Rights check: ' + bookTitle,
    (name || email) + (company ? ' (' + company + ')' : '') + (role ? ', ' + role : '') + ' asked about screen rights to "' + bookTitle +
    '".\nTier: ' + tier + '\nNo agent contact on file yet. The daily rights run must find the agent today; the backend then emails them automatically.');
  return { ok: true, outcome: 'accepted', tier: tier };
}

/* Hourly (called from genreTick): match Stripe receipts for the £5 check and the £15 unlimited plan, then
   credit back paid checks that have had no answer within GUARANTEE_DAYS. */
function rightsPaymentsTick_() {
  var label = GmailApp.getUserLabelByName('ariel-rights-seen') || GmailApp.createLabel('ariel-rights-seen');
  var threads = GmailApp.search('from:(stripe.com) newer_than:4d -label:ariel-rights-seen', 0, 30);
  var req = sheet_('Requests');
  threads.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      var body = (m.getPlainBody() || '') + ' ' + m.getSubject();
      var low = body.toLowerCase();
      var unlimited = low.indexOf('unlimited rights checks') >= 0 && new RegExp('£\\s?' + RIGHTS_CFG.PASS_PRICE_NUM + '(\\.00)?\\b').test(body);
      var single = !unlimited && low.indexOf('rights check') >= 0 && new RegExp('£\\s?' + RIGHTS_CFG.CHECK_PRICE + '(\\.00)?\\b').test(body);
      if (!unlimited && !single) return;
      var v = req.getDataRange().getValues();
      var seen = {};
      for (var i = v.length - 1; i >= 1; i--) {
        var em = String(v[i][3]).toLowerCase();
        if (!em || low.indexOf(em) < 0 || v[i][8] !== 'upsell_shown') continue;
        if (Date.now() - new Date(v[i][0]).getTime() > 7 * 86400000) continue;
        if (single && seen[em]) continue;  // one £5 payment pays for the most recent request only
        seen[em] = true;
        var tier = unlimited ? 'pass' : 'paid';
        req.getRange(i + 1, 8, 1, 2).setValues([[tier, 'open']]);
        if (unlimited) upsertMember_(em, 'pass', new Date(Date.now() + 31 * 86400000), 'Unlimited rights checks £' + RIGHTS_CFG.PASS_PRICE_NUM);
        try { fulfilRequest_(i + 1, em, v[i][4], v[i][5], v[i][6], v[i][1], v[i][2], '', tier); } catch (e) { log_('error', 'fulfil paid ' + em + ': ' + e); }
        alertTara_('[Review of Reviews] Payment matched: ' + em, 'Stripe email "' + m.getSubject() + '" matched ' + em + ': ' + (unlimited ? 'unlimited rights checks for a month' : 'one £' + RIGHTS_CFG.CHECK_PRICE + ' rights check') + ' on "' + v[i][2] + '".');
      }
      if (unlimited && !Object.keys(seen).length) {
        // renewal or a purchase with no open request: extend membership for whoever's email is in the receipt
        var ms = sheet_('Members'), mv = ms.getDataRange().getValues();
        for (var k = 1; k < mv.length; k++) if (mv[k][1] === 'pass' && low.indexOf(String(mv[k][0]).toLowerCase()) >= 0) upsertMember_(mv[k][0], 'pass', new Date(Date.now() + 31 * 86400000), 'Unlimited rights checks £' + RIGHTS_CFG.PASS_PRICE_NUM);
      }
    });
    t.addLabel(label);
  });
  // Guarantee: a paid check with no answer after GUARANTEE_DAYS is credited back (their next check is free)
  var w = req.getDataRange().getValues();
  for (var r = 1; r < w.length; r++) {
    if (w[r][7] !== 'paid' || (w[r][8] !== 'open' && w[r][8] !== 'contact_sent')) continue;
    if (Date.now() - new Date(w[r][0]).getTime() < RIGHTS_CFG.GUARANTEE_DAYS * 86400000) continue;
    req.getRange(r + 1, 9).setValue('credited');
    try {
      sendBranded_(w[r][3], 'Your rights check on ' + w[r][2], 'Your next check is on us',
        (w[r][4] ? 'Hello ' + esc_(w[r][4]) + ',<br><br>' : '') + 'We haven’t yet had an answer from the agent about <b>' + esc_(w[r][2]) + '</b>, so your next rights check on the London Review of Reviews is free. We’ll still email you the moment we hear.');
    } catch (e) { log_('error', 'credit email ' + w[r][3] + ': ' + e); }
    alertTara_('[Review of Reviews] Paid check credited back: ' + w[r][3], 'No answer after ' + RIGHTS_CFG.GUARANTEE_DAYS + ' days on "' + w[r][2] + '". Their next check is free.');
  }
}

function sendRightsAck_(email, name, bookTitle, tier) {
  var body = (name ? 'Hello ' + esc_(name) + ',<br><br>' : '') +
    'Thanks for asking about the screen rights to <b>' + esc_(bookTitle) + '</b>. We’re tracking down who represents the author and will email you their contact details, ' +
    'with the rights status if we have it, ' + RIGHTS_CFG.ANSWER_PROMISE + '.<br><br>' +
    (tier === 'free' ? 'This is your free rights check from the London Review of Reviews. After this, checks are £' + RIGHTS_CFG.CHECK_PRICE + ' each or ' + RIGHTS_CFG.PASS_PRICE + ' for unlimited checks. ' +
      'Or start a free month of Ariel Genres, which includes ' + RIGHTS_CFG.TRIAL_CHECKS + ' checks and a daily email of stories with screen potential: ' +
      '<a href="https://theariel.tv/genres/?from=rights" style="color:' + C.goldDeep + ';">theariel.tv/genres</a>.<br><br>' : '') +
    (tier === 'paid' ? 'This check is paid for. If we can’t get you an answer within two weeks, your next check is free.<br><br>' : '') +
    'If you’d like us to introduce you to the agent, just reply to this email.';
  sendBranded_(email, 'Screen rights: ' + bookTitle, 'Checking the rights', body);
}

/* Agent / rights contact on file for a Rights row, or null. Prefers a named screen contact. */
function contactOf_(sh, row) {
  var screen = String(cell_(sh, row, 'screen_email') || '').trim();
  var agentEmail = String(cell_(sh, row, 'agent_email') || '').trim();
  var em = screen || agentEmail;
  if (!em) return null;
  return {
    email: em,
    agency: String(cell_(sh, row, 'agency') || '').trim(),
    agent: screen ? '' : String(cell_(sh, row, 'agent_name') || '').trim(),
    screen: !!screen,
    source: String(cell_(sh, row, 'source_url') || '').trim()
  };
}

function contactHtml_(c) {
  var who = c.screen ? 'Film and TV rights contact' : 'Author’s agent';
  var line = (c.agent ? esc_(c.agent) + (c.agency ? ', ' + esc_(c.agency) : '') : esc_(c.agency || ''));
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;border-left:3px solid ' + C.goldDeep + ';"><tr><td style="padding:4px 0 4px 14px;">' +
    '<div style="font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:' + C.goldDeep + ';">' + who + '</div>' +
    (line ? '<div style="font-weight:bold;">' + line + '</div>' : '') +
    '<div><a href="mailto:' + esc_(c.email) + '" style="color:' + C.goldDeep + ';">' + esc_(c.email) + '</a></div>' +
    (c.source ? '<div style="font-size:14px;"><a href="' + esc_(c.source) + '" style="color:' + C.body + ';">Where this address is listed</a></div>' : '') +
    '</td></tr></table>';
}

function sendRightsContact_(email, name, bookTitle, sh, row, tier) {
  var c = contactOf_(sh, row);
  if (!c) return false;
  var body = (name ? 'Hello ' + esc_(name) + ',<br><br>' : '') +
    'You asked about the screen rights to <b>' + esc_(bookTitle) + '</b>. Here is who to contact:<br><br>' + contactHtml_(c) +
    'We haven’t confirmed the rights status yet. We’re asking now and will email you as soon as we hear.<br><br>' +
    'If you’d rather we introduced you, just reply to this email.' +
    (tier === 'free' ? '<br><br>This was your free rights check. Ariel members get unlimited checks and introductions, plus rights-available books sent to us directly by literary agents. ' +
      '<a href="' + CONFIG.APPLY_URL + '" style="color:' + C.goldDeep + ';">See what The Ariel does</a>.' : '');
  sendBranded_(email, 'Screen rights: ' + bookTitle, 'Who holds the rights', body);
  return true;
}

function sendRightsAnswer_(email, name, bookTitle, sh, row, tier) {
  var status = String(cell_(sh, row, 'status'));
  var handled = cell_(sh, row, 'handled_by');
  var agency = cell_(sh, row, 'agency');
  var line = RIGHTS_STATUS_TEXT[status] || 'We have an update';
  var body = (name ? 'Hello ' + esc_(name) + ',<br><br>' : '') +
    'You asked about the screen rights to <b>' + esc_(bookTitle) + '</b>.<br><br>' +
    '<b>' + esc_(line) + '.</b>' + (status === 'handled_elsewhere' && handled ? ' They are handled by ' + esc_(handled) + '.' : '') +
    (agency && status === 'available' && !contactOf_(sh, row) ? ' The author is represented by ' + esc_(agency) + '.' : '') + '<br><br>' +
    (status === 'available' && contactOf_(sh, row) ? contactHtml_(contactOf_(sh, row)) : '') +
    (status === 'available' ? 'Would you like an introduction to the agent? Reply to this email and we’ll introduce you.<br><br>' : '') +
    (tier === 'free' ? 'That was your free rights check. Ariel members get unlimited checks and introductions, plus rights-available books sent to us directly by literary agents. ' +
      '<a href="' + CONFIG.APPLY_URL + '" style="color:' + C.goldDeep + ';">See what The Ariel does</a>.' : '');
  sendBranded_(email, 'Screen rights: ' + bookTitle, line, body);
}

function sendBranded_(to, subject, heading, bodyHtml) {
  var html = '<!doctype html><html lang="en"><body style="margin:0;background:' + C.ivory + ';" bgcolor="' + C.ivory + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' + C.ivory + '"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">' +
    '<tr><td bgcolor="' + C.ink + '" style="background-color:' + C.ink + ';padding:22px 28px;">' +
    '<div style="font-family:' + SANS + ';font-size:13px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#E2C891;">The Ariel &middot; London Review of Reviews</div>' +
    '<div style="font-family:' + SERIF + ';font-size:28px;line-height:1.15;color:#FFFFFF;margin-top:8px;">' + esc_(heading) + '</div></td></tr>' +
    '<tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:24px 28px;font-family:' + SANS + ';font-size:16px;line-height:1.6;color:' + C.body + ';">' + bodyHtml + '</td></tr>' +
    '</table></td></tr></table></body></html>';
  var opts = { htmlBody: html, name: CONFIG.SENDER_NAME, replyTo: CONFIG.FROM_ALIAS };
  if (aliasOk_()) opts.from = CONFIG.FROM_ALIAS;
  GmailApp.sendEmail(to, subject, bodyHtml.replace(/<br>/g, '\n').replace(/<[^>]+>/g, ''), opts);
}

function alertTara_(subject, text) {
  try { GmailApp.sendEmail(CONFIG.ALERT_TO, subject, text); } catch (e) { log_('error', 'alert: ' + e); }
}

/* ───────────── public rights status (for the page buttons) ───────────── */

function rightsStatus_() {
  var v = sheet_('Rights').getDataRange().getValues();
  var out = {};
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (r[9] === 'available' && String(r[11]).toLowerCase() === 'yes') out[r[0]] = 'available';
  }
  return { ok: true, books: out };
}

/* ───────────── admin ops used by Claude's runs ───────────── */

function rightsAdmin_(b) {
  if (b.op === 'set_rights') {
    var rows = b.rows || [];
    var sh = sheet_('Rights');
    var updated = 0, answered = 0, contacted = 0;
    rows.forEach(function (r) {
      if (!r.book_id) return;
      var row = findRow_(sh, 1, r.book_id);
      if (!row) {
        sh.appendRow(RIGHTS_HEADERS.map(function (h) { return r[h] !== undefined ? r[h] : (h === 'status' ? 'unknown' : ''); }));
        row = sh.getLastRow();
      } else {
        RIGHTS_HEADERS.forEach(function (h) { if (r[h] !== undefined && h !== 'book_id') setCell_(sh, row, h, r[h]); });
      }
      updated++;
      var st = String(cell_(sh, row, 'status') || '');
      if (['available', 'optioned', 'not_available', 'handled_elsewhere'].indexOf(st) >= 0) {
        answered += answerOpenRequests_(r.book_id, sh, row);
      } else if (contactOf_(sh, row)) {
        contacted += sendContactToOpen_(r.book_id, sh, row);
      }
    });
    return { ok: true, updated: updated, requesters_answered: answered, requesters_sent_contact: contacted };
  }
  if (b.op === 'queue_email') {
    var ob = sheet_('Outbox');
    var id = 'OB' + Date.now() + Math.floor(Math.random() * 1000);
    var after = new Date(Date.now() + (b.hold_minutes != null ? b.hold_minutes : RIGHTS_CFG.HOLD_MIN) * 60000);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(b.to || ''))) return { ok: false, error: 'bad_to' };
    ob.appendRow([id, new Date(), after, b.status || 'queued', b.to, b.cc || '', b.subject || '', b.kind || '', b.ref || '',
      String(b.html || '').slice(0, 45000), String(b.text || '').slice(0, 20000), '', '']);
    return { ok: true, id: id, send_after: after.toISOString() };
  }
  if (b.op === 'demand') {
    // Real demand numbers for agent emails: clicks and checks per book since a date
    var since = b.since ? new Date(b.since) : new Date(Date.now() - 14 * 86400000);
    var v = sheet_('Clicks').getDataRange().getValues();
    var out = {};
    for (var i = 1; i < v.length; i++) {
      if (new Date(v[i][0]) < since) continue;
      var k = v[i][2];
      out[k] = out[k] || { review_clicks: 0, check_rights: 0, producer_checks: 0, readers: {} };
      var kind = String(v[i][3]);
      if (kind === 'review') { out[k].review_clicks++; if (v[i][6]) out[k].readers[v[i][6]] = 1; }
      if (kind.indexOf('check_rights') === 0) out[k].check_rights++;
    }
    var rq = sheet_('Requests').getDataRange().getValues();
    for (var j = 1; j < rq.length; j++) {
      if (new Date(rq[j][0]) < since) continue;
      var bk = rq[j][1];
      out[bk] = out[bk] || { review_clicks: 0, check_rights: 0, producer_checks: 0, readers: {} };
      if (['Producer', 'Development executive', 'Commissioner'].indexOf(rq[j][6]) >= 0 || ['member', 'pass'].indexOf(rq[j][7]) >= 0) out[bk].producer_checks++;
    }
    Object.keys(out).forEach(function (k) { out[k].distinct_email_readers = Object.keys(out[k].readers).length; delete out[k].readers; });
    return { ok: true, since: since.toISOString(), books: out };
  }
  if (b.op === 'open_requests') {
    var q = sheet_('Requests').getDataRange().getValues();
    var list = [];
    for (var m = 1; m < q.length; m++) if (q[m][8] === 'open' || q[m][8] === 'contact_sent' || q[m][8] === 'pass_interest') list.push({ row: m + 1, time: q[m][0], book_id: q[m][1], book: q[m][2], email: q[m][3], name: q[m][4], company: q[m][5], role: q[m][6], tier: q[m][7], status: q[m][8] });
    return { ok: true, requests: list };
  }
  if (b.op === 'add_member') {
    var ms = sheet_('Members');
    var em = String(b.email || '').toLowerCase().trim();
    if (!em) return { ok: false };
    var mr = findRow_(ms, 1, em);
    var vals = [em, b.type || 'member', new Date(), b.until || '', b.note || ''];
    if (mr) ms.getRange(mr, 1, 1, vals.length).setValues([vals]); else ms.appendRow(vals);
    return { ok: true };
  }
  return null;
}

function answerOpenRequests_(bookId, sh, row) {
  var req = sheet_('Requests');
  var v = req.getDataRange().getValues();
  var n = 0;
  for (var i = 1; i < v.length; i++) {
    if (v[i][1] === bookId && (v[i][8] === 'open' || v[i][8] === 'contact_sent')) {
      try {
        sendRightsAnswer_(v[i][3], v[i][4], v[i][2], sh, row, v[i][7]);
        req.getRange(i + 1, 9, 1, 2).setValues([['answered', new Date()]]);
        n++;
      } catch (e) { log_('error', 'answer ' + v[i][3] + ': ' + e); }
    }
  }
  return n;
}

function sendContactToOpen_(bookId, sh, row) {
  var req = sheet_('Requests');
  var v = req.getDataRange().getValues();
  var n = 0;
  for (var i = 1; i < v.length; i++) {
    if (v[i][1] === bookId && v[i][8] === 'open') {
      try {
        if (sendRightsContact_(v[i][3], v[i][4], v[i][2], sh, row, v[i][7])) {
          req.getRange(i + 1, 9, 1, 2).setValues([['contact_sent', new Date()]]);
          n++;
        }
      } catch (e) { log_('error', 'contact ' + v[i][3] + ': ' + e); }
    }
  }
  return n;
}

/* ───────────── outbox (agent emails etc.) ───────────── */

function sendOutbox() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var sh = sheet_('Outbox');
    var v = sh.getDataRange().getValues();
    var now = new Date();
    var today = Utilities.formatDate(now, 'Europe/London', 'yyyy-MM-dd');
    var sentToday = 0;
    for (var i = 1; i < v.length; i++) {
      if (v[i][11] && Utilities.formatDate(new Date(v[i][11]), 'Europe/London', 'yyyy-MM-dd') === today) sentToday++;
    }
    for (var r = 1; r < v.length; r++) {
      if (v[r][3] !== 'queued') continue;
      if (new Date(v[r][2]) > now) continue;
      if (sentToday >= RIGHTS_CFG.OUTBOX_DAILY_CAP) { log_('outbox', 'daily cap reached'); return; }
      try {
        var opts = { htmlBody: v[r][9], name: 'Tara Button, The Ariel', replyTo: CONFIG.FROM_ALIAS };
        if (v[r][5]) opts.cc = v[r][5];
        if (aliasOk_()) opts.from = CONFIG.FROM_ALIAS;
        GmailApp.sendEmail(v[r][4], v[r][6], v[r][10] || '', opts);
        sh.getRange(r + 1, 4).setValue('sent');
        sh.getRange(r + 1, 12).setValue(new Date());
        sentToday++;
        if (v[r][7] === 'agent_ask' && v[r][8]) {
          String(v[r][8]).split(',').forEach(function (bk) {
            var rr = rightsRow_(bk.trim());
            if (rr.row) {
              if (!cell_(rr.sh, rr.row, 'asked_at')) setCell_(rr.sh, rr.row, 'asked_at', new Date());
              if (cell_(rr.sh, rr.row, 'status') === 'unknown') setCell_(rr.sh, rr.row, 'status', 'asked');
            }
          });
        }
      } catch (e) {
        sh.getRange(r + 1, 4).setValue('error');
        sh.getRange(r + 1, 13).setValue(String(e).slice(0, 300));
      }
    }
  } finally {
    lock.releaseLock();
  }
}
