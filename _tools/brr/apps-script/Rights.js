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
  PASS_PRICE: '£29 a month',
  ANSWER_PROMISE: 'usually within a week, depending on how quickly the agent replies'
};

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
  if (!findRow_(cfg, 1, 'rights_pass_url')) {
    cfg.appendRow(['rights_pass_url', '', 'Stripe payment link for the Rights Pass. Leave blank until it exists.']);
  }
  ensureTriggers_();
}

function ensureTriggers_() {
  var have = {};
  ScriptApp.getProjectTriggers().forEach(function (t) { have[t.getHandlerFunction()] = true; });
  if (!have.sendDueEditions) ScriptApp.newTrigger('sendDueEditions').timeBased().everyHours(1).create();
  if (!have.sendOutbox) ScriptApp.newTrigger('sendOutbox').timeBased().everyMinutes(15).create();
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
    if (!tier) {
      var data = req.getDataRange().getValues();
      var usedFree = data.some(function (r, i) { return i > 0 && String(r[3]).toLowerCase() === email && r[7] === 'free'; });
      tier = usedFree ? 'upsell' : 'free';
    }
    if (wantsPass) tier = 'pass_interest';

    var now = new Date();
    var status = (tier === 'upsell') ? 'upsell_shown' : (tier === 'pass_interest' ? 'pass_interest' : 'open');
    req.appendRow([now, bookId, bookTitle, email, name, company, role, tier, status, '', String(b.source || 'page').slice(0, 20), String(b.edition_id || '').slice(0, 12)]);
    logClick_({ book_id: bookId, kind: tier === 'upsell' ? 'check_rights_upsell' : 'check_rights', where: b.source || 'page', edition_id: b.edition_id, t: b.t });

    if (tier === 'upsell') {
      return { ok: true, outcome: 'upsell', pass_url: cfgValue_('rights_pass_url') };
    }
    if (tier === 'pass_interest') {
      alertTara_('[Review of Reviews] Rights Pass interest: ' + email,
        email + (name ? ' (' + name + (company ? ', ' + company : '') + ')' : '') + ' wants the Rights Pass (' + RIGHTS_CFG.PASS_PRICE +
        ').\nBook they were checking: ' + bookTitle + '\nNo Stripe link is set yet, so please follow up by email.');
      return { ok: true, outcome: 'pass_interest' };
    }

    // Accepted (free first check, member or pass holder)
    var rr = rightsRow_(bookId);
    var known = rr.row ? String(cell_(rr.sh, rr.row, 'status') || '') : '';
    if (!rr.row) {
      rr.sh.appendRow([bookId, bookTitle, String(b.author || '').slice(0, 120), '', '', '', '', '', '', 'unknown', '', '', '', '', 'Created by a Check Rights request']);
    }
    if (['available', 'optioned', 'not_available', 'handled_elsewhere'].indexOf(known) >= 0) {
      sendRightsAnswer_(email, name, bookTitle, rr.sh, rr.row, tier);
      req.getRange(req.getLastRow(), 9, 1, 2).setValues([['answered', now]]);
      return { ok: true, outcome: 'answered' };
    }
    sendRightsAck_(email, name, bookTitle, tier);
    alertTara_('[Review of Reviews] Rights check: ' + bookTitle,
      (name || email) + (company ? ' (' + company + ')' : '') + (role ? ', ' + role : '') + ' asked about screen rights to "' + bookTitle +
      '".\nTier: ' + tier + '\nRights status on file: ' + (known || 'none') + '\nThe daily rights run will ask the agent and reply to them.');
    return { ok: true, outcome: 'accepted', tier: tier };
  } finally {
    lock.releaseLock();
  }
}

function sendRightsAck_(email, name, bookTitle, tier) {
  var body = (name ? 'Hello ' + esc_(name) + ',<br><br>' : '') +
    'Thanks for asking about the screen rights to <b>' + esc_(bookTitle) + '</b>. We’re finding out from the author’s agent and will email you the answer, ' +
    RIGHTS_CFG.ANSWER_PROMISE + '.<br><br>' +
    (tier === 'free' ? 'This is your free rights check from the London Review of Reviews. ' +
      'Ariel members get unlimited rights checks and introductions to agents, plus a first look at rights-available books sent to us directly by literary agents. ' +
      '<a href="' + CONFIG.APPLY_URL + '" style="color:' + C.goldDeep + ';">See what The Ariel does</a>.<br><br>' : '') +
    'If the rights are available and you’d like an introduction to the agent, just reply to this email.';
  sendBranded_(email, 'Screen rights: ' + bookTitle, 'Checking the rights', body);
}

function sendRightsAnswer_(email, name, bookTitle, sh, row, tier) {
  var status = String(cell_(sh, row, 'status'));
  var handled = cell_(sh, row, 'handled_by');
  var agency = cell_(sh, row, 'agency');
  var line = RIGHTS_STATUS_TEXT[status] || 'We have an update';
  var body = (name ? 'Hello ' + esc_(name) + ',<br><br>' : '') +
    'You asked about the screen rights to <b>' + esc_(bookTitle) + '</b>.<br><br>' +
    '<b>' + esc_(line) + '.</b>' + (status === 'handled_elsewhere' && handled ? ' They are handled by ' + esc_(handled) + '.' : '') +
    (agency && status === 'available' ? ' The author is represented by ' + esc_(agency) + '.' : '') + '<br><br>' +
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
    var updated = 0, answered = 0;
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
      if (['available', 'optioned', 'not_available', 'handled_elsewhere'].indexOf(r.status) >= 0) {
        answered += answerOpenRequests_(r.book_id, sh, row);
      }
    });
    return { ok: true, updated: updated, requesters_answered: answered };
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
    for (var m = 1; m < q.length; m++) if (q[m][8] === 'open' || q[m][8] === 'pass_interest') list.push({ row: m + 1, time: q[m][0], book_id: q[m][1], book: q[m][2], email: q[m][3], name: q[m][4], company: q[m][5], role: q[m][6], tier: q[m][7], status: q[m][8] });
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
    if (v[i][1] === bookId && v[i][8] === 'open') {
      try {
        sendRightsAnswer_(v[i][3], v[i][4], v[i][2], sh, row, v[i][7]);
        req.getRange(i + 1, 9, 1, 2).setValues([['answered', new Date()]]);
        n++;
      } catch (e) { log_('error', 'answer ' + v[i][3] + ': ' + e); }
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
