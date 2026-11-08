/**
 * UK Commissioners list - lead capture for theariel.tv/commissioners/ (2026-11-07)
 *
 * POST {action:"commissioner_list", email, name, role, company, watch, website}
 *   website = honeypot. Stores the request in tab CommissionerLeads and emails
 *   the requester the download links (so the address is proven real). watch=true
 *   records consent to the weekly Who's Buying What email.
 *
 * The list files themselves are static on the site:
 *   https://theariel.tv/commissioners/download/uk-tv-commissioners.xlsx  (+ .csv)
 * built by _tools/commissioners/build.py from _tools/commissioners/data/*.json
 */

var COMM = {
  TAB: 'CommissionerLeads',
  HEADERS: ['email', 'name', 'role', 'company', 'watch', 'consent', 'source', 'created_at', 'last_sent', 'count', 'idea'],
  PAGE: 'https://theariel.tv/commissioners/',
  XLSX: 'https://theariel.tv/commissioners/download/uk-tv-commissioners.xlsx',
  CSV: 'https://theariel.tv/commissioners/download/uk-tv-commissioners.csv',
  CONSENT_WATCH: 'Weekly Who\'s Buying What email from The Ariel. Unsubscribe any time.',
  CONSENT_LIST: 'Sent the UK commissioners list once, on request.'
};

function commissionerPost_(action, b) {
  if (action === 'commissioner_list') return commissionerList_(b || {});
  return null;
}

function commissionerList_(b) {
  if (b.website) return { ok: true };  // honeypot
  var email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return { ok: false, error: 'invalid_email', message: 'Please check your email address.' };
  }
  var name = String(b.name || '').trim().slice(0, 80);
  var role = String(b.role || '').trim().slice(0, 60);
  var company = String(b.company || '').trim().slice(0, 100);
  var watch = b.watch === true || String(b.watch) === 'true';
  var idea = String(b.idea || '').trim().slice(0, 500);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ensureTab_(ss, COMM.TAB, COMM.HEADERS);
    var row = findRow_(sh, 1, email);
    var now = new Date();
    if (row) {
      var last = cell_(sh, row, 'last_sent');
      if (last && now - new Date(last) < 10 * 60 * 1000) return { ok: true, status: 'sent' };
      setCells_(sh, row, {
        name: name || cell_(sh, row, 'name'), role: role || cell_(sh, row, 'role'),
        company: company || cell_(sh, row, 'company'),
        watch: watch || cell_(sh, row, 'watch') === true || cell_(sh, row, 'watch') === 'TRUE',
        consent: watch ? COMM.CONSENT_WATCH : cell_(sh, row, 'consent'),
        last_sent: now, count: (Number(cell_(sh, row, 'count')) || 0) + 1,
        idea: idea || cell_(sh, row, 'idea')
      });
    } else {
      var rec = { email: email, name: name, role: role, company: company, watch: watch,
        consent: watch ? COMM.CONSENT_WATCH : COMM.CONSENT_LIST, source: String(b.source || 'commissioners').slice(0, 30),
        created_at: now, last_sent: now, count: 1, idea: idea };
      sh.appendRow(COMM.HEADERS.map(function (h) { return rec[h]; }));
      try {
        GmailApp.sendEmail(CONFIG.ALERT_TO, '[Commissioners] List downloaded: ' + email,
          [email, name, role, company, watch ? 'wants Who\'s Buying What' : 'list only', idea ? 'Quick match idea: ' + idea : ''].filter(String).join('\n'));
      } catch (e) { log_('error', 'commissioner alert: ' + e); }
    }
    sendCommissionerList_(email, name, watch);
    return { ok: true, status: 'sent', xlsx: COMM.XLSX, csv: COMM.CSV };
  } finally {
    lock.releaseLock();
  }
}

function sendCommissionerList_(email, name, watch) {
  var btn = function (href, label) {
    return '<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;margin:0 8px 8px 0;"><tr><td bgcolor="' + C.ink + '" style="background-color:' + C.ink + ';border-radius:2px;">' +
      '<a href="' + href + '" style="display:inline-block;padding:12px 22px;font-family:' + SANS + ';font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:' + C.ivory + ';text-decoration:none;">' + label + '</a></td></tr></table>';
  };
  var html = '<!doctype html><html><body style="margin:0;background:' + C.ivory + ';" bgcolor="' + C.ivory + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' + C.ivory + '"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">' +
    '<tr><td bgcolor="' + C.ink + '" style="background-color:' + C.ink + ';padding:24px 28px;font-family:' + SERIF + ';font-size:28px;color:' + C.ivory + ';">UK &amp; US TV Commissioners</td></tr>' +
    '<tr><td bgcolor="' + C.cream + '" style="background-color:' + C.cream + ';padding:24px 28px;font-family:' + SANS + ';font-size:15px;line-height:1.6;color:' + C.body + ';">' +
    (name ? 'Hello ' + esc_(name) + ',<br><br>' : '') +
    'Here is the list you asked for: who commissions factual and documentary at the UK and US broadcasters and streamers, what they have recently commissioned, and the official way to pitch each team. Every line links to its source and shows the date we last checked it.<br><br>' +
    btn(COMM.XLSX, 'Download (Excel)') + btn(COMM.CSV, 'Download (CSV)') + '<br>' +
    'The list on <a href="' + COMM.PAGE + '" style="color:' + C.goldDeep + ';">theariel.tv/commissioners</a> is always the current version.<br><br>' +
    (watch ? 'You are also signed up to Who&#8217;s Buying What: a short weekly email of what UK and US broadcasters and streamers have commissioned, who has moved, and which briefs have opened. Every issue has an unsubscribe link.<br><br>' : '') +
    'Spotted something out of date? Just reply and we will fix it.<br><br>The Ariel</td></tr></table></td></tr></table></body></html>';
  var opts = { htmlBody: html, name: CONFIG.SENDER_NAME, replyTo: CONFIG.REPLY_TO };
  if (aliasOk_()) opts.from = CONFIG.FROM_ALIAS;
  GmailApp.sendEmail(email, 'Your UK and US TV commissioners list',
    'Your UK and US TV commissioners list from The Ariel. Excel: ' + COMM.XLSX + ' CSV: ' + COMM.CSV + ' Current version: ' + COMM.PAGE, opts);
}

/* ───────────── Who's Buying What - weekly email (2026-11-08) ─────────────
 *
 * The weekly run (_tools/commissioners/WBW_RUN.md) publishes
 *   https://theariel.tv/commissioners/whos-buying-what/latest.json
 * Each hourly sendDueEditions() run calls wbwTick(): it pulls latest.json, stores a new
 * edition in tab WBW as "ready" (send_after = the JSON's send_after, else next Friday
 * 07:00 London), and once due sends it to every CommissionerLeads row with watch = TRUE
 * that has not unsubscribed. TEST_ONLY_TO (script property) restricts sends, as for the Review.
 * Unsubscribe: GET ?action=wbw_unsub&t=TOKEN
 */
var WBW = {
  LATEST: 'https://theariel.tv/commissioners/whos-buying-what/latest.json',
  PAGE: 'https://theariel.tv/commissioners/whos-buying-what/',
  TAB: 'WBW',
  HEADERS: ['edition_id', 'status', 'send_after', 'created_at', 'sent_at', 'sent_count', 'json'],
  LEAD_EXTRA: ['token', 'unsubscribed_at', 'last_wbw']
};

function wbwEnsureLeadCols_(sh) {
  var have = headers_(sh);
  WBW.LEAD_EXTRA.forEach(function (h) {
    if (have.indexOf(h) < 0) { sh.getRange(1, sh.getLastColumn() + 1).setValue(h).setFontWeight('bold'); have.push(h); }
  });
}

function wbwNextFriday_() {
  var now = new Date();
  var d = new Date(Utilities.formatDate(now, 'Europe/London', "yyyy-MM-dd'T'07:00:00"));
  var dow = Number(Utilities.formatDate(now, 'Europe/London', 'u')); // 1=Mon..7=Sun
  var add = (5 - dow + 7) % 7;
  d.setDate(d.getDate() + add);
  if (d <= now) d.setDate(d.getDate() + 7);
  return d;
}

function wbwTick() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tab = ensureTab_(ss, WBW.TAB, WBW.HEADERS);
  // 1. pull
  try {
    var r = UrlFetchApp.fetch(WBW.LATEST + '?t=' + Date.now(), { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      var ed = JSON.parse(r.getContentText());
      if (ed && ed.edition_id && !findRow_(tab, 1, ed.edition_id)) {
        var after = ed.send_after ? new Date(ed.send_after) : wbwNextFriday_();
        tab.appendRow([ed.edition_id, 'ready', after, new Date(), '', 0, JSON.stringify(ed).slice(0, 49000)]);
        log_('wbw', 'pulled ' + ed.edition_id + ' send_after ' + after.toISOString());
      }
    }
  } catch (e) { log_('error', 'wbw pull: ' + e); }
  // 2. send anything due
  var v = tab.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (v[i][1] !== 'ready' && v[i][1] !== 'sending') continue;
    if (new Date(v[i][2]) > new Date()) continue;
    tab.getRange(i + 1, 2).setValue('sending');
    var n = wbwSendEdition_(JSON.parse(v[i][6]));
    var leadsLeft = wbwPending_(v[i][0]);
    tab.getRange(i + 1, 6).setValue((Number(v[i][5]) || 0) + n);
    if (!leadsLeft) { tab.getRange(i + 1, 2).setValue('sent'); tab.getRange(i + 1, 5).setValue(new Date()); }
  }
}

function wbwRecipients_(sh) {
  var v = sh.getDataRange().getValues(), h = v[0], out = [];
  var ix = function (k) { return h.indexOf(k); };
  var only = testOnly_();
  for (var i = 1; i < v.length; i++) {
    var watch = v[i][ix('watch')] === true || String(v[i][ix('watch')]).toUpperCase() === 'TRUE';
    if (!watch || v[i][ix('unsubscribed_at')]) continue;
    var email = String(v[i][ix('email')]).toLowerCase();
    if (only && only.split(',').map(function (s) { return s.trim(); }).indexOf(email) < 0) continue;
    out.push({ row: i + 1, email: email, name: v[i][ix('name')], token: v[i][ix('token')], last: String(v[i][ix('last_wbw')] || '') });
  }
  return out;
}

function wbwPending_(editionId) {
  var sh = sheet_(COMM.TAB);
  return wbwRecipients_(sh).filter(function (r) { return r.last !== String(editionId); }).length;
}

function wbwSendEdition_(ed) {
  var sh = sheet_(COMM.TAB);
  wbwEnsureLeadCols_(sh);
  var start = Date.now(), n = 0;
  wbwRecipients_(sh).forEach(function (r) {
    if (r.last === String(ed.edition_id) || Date.now() - start > 4.5 * 60 * 1000) return;
    var token = r.token || newToken_();
    if (!r.token) setCell_(sh, r.row, 'token', token);
    try {
      var m = wbwRender_(ed, r.name, token);
      var opts = { htmlBody: m.html, name: CONFIG.SENDER_NAME, replyTo: CONFIG.REPLY_TO };
      if (aliasOk_()) opts.from = CONFIG.FROM_ALIAS;
      GmailApp.sendEmail(r.email, m.subject, m.text, opts);
      setCell_(sh, r.row, 'last_wbw', String(ed.edition_id));
      n++;
    } catch (e) { log_('error', 'wbw send ' + r.email + ': ' + e); }
  });
  log_('wbw', 'sent ' + ed.edition_id + ' to ' + n);
  return n;
}

function wbwRender_(ed, name, token) {
  var unsub = webUrl_() + '?action=wbw_unsub&t=' + encodeURIComponent(token);
  var page = WBW.PAGE + (ed.edition_id ? ed.edition_id + '.html' : '');
  var a = function (href, label) { return '<a href="' + esc_(href) + '" style="color:' + C.goldDeep + ';">' + esc_(label) + '</a>'; };
  var h3 = function (t) { return '<tr><td style="padding:22px 28px 4px;font-family:' + SERIF + ';font-size:24px;color:' + C.ink + ';">' + esc_(t) + '</td></tr>'; };
  var row = function (inner) { return '<tr><td style="padding:8px 28px;font-family:' + SANS + ';font-size:15px;line-height:1.55;color:' + C.body + ';border-bottom:1px solid ' + C.line + ';">' + inner + '</td></tr>'; };
  var parts = [], text = [];
  var groups = [['commissions', 'What got commissioned'], ['moves', 'Who moved'], ['briefs', 'Briefs and open calls']];
  groups.forEach(function (g) {
    var items = ed[g[0]] || [];
    if (!items.length) return;
    parts.push(h3(g[1])); text.push('\n' + g[1].toUpperCase());
    items.forEach(function (it) {
      var head = g[0] === 'moves' ? esc_(it.name) : '<b>' + esc_(it.title || '') + '</b>';
      var tag = '<span style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:' + C.mist + ';">' + esc_([it.region, it.broadcaster].filter(String).join(' &middot; ')) + '</span><br>';
      var body = g[0] === 'moves' ? esc_(it.change) : esc_(it.what || '');
      var extra = [];
      if (it.commissioner) extra.push('Commissioned by ' + esc_(it.commissioner));
      if (it.producer) extra.push('Made by ' + esc_(it.producer));
      if (it.deadline) extra.push('Deadline: ' + esc_(it.deadline));
      parts.push(row(tag + head + (body ? '<br>' + body : '') + (extra.length ? '<br><span style="color:' + C.mist + ';">' + extra.join(' &middot; ') + '</span>' : '') + '<br>' + a(it.url, 'Official announcement') + (it.also && it.also.url ? ' &middot; ' + a(it.also.url, (it.also.source || 'Trade') + ' story') : '')));
      text.push('- ' + (it.title || it.name || '') + ': ' + (it.what || it.change || '') + ' ' + (it.url || ''));
    });
  });
  if ((ed.trades || []).length) {
    parts.push(h3('Also in the trades'));
    text.push('\nALSO IN THE TRADES');
    ed.trades.forEach(function (t) {
      parts.push(row(a(t.url, t.headline) + ' <span style="color:' + C.mist + ';">(' + esc_(t.source) + ')</span>'));
      text.push('- ' + t.headline + ' (' + t.source + ') ' + t.url);
    });
  }
  var html = '<!doctype html><html><body style="margin:0;background:' + C.ivory + ';" bgcolor="' + C.ivory + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' + C.ivory + '"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' + C.cream + '" style="max-width:600px;background-color:' + C.cream + ';">' +
    '<tr><td bgcolor="' + C.ink + '" style="background-color:' + C.ink + ';padding:24px 28px;font-family:' + SERIF + ';font-size:30px;color:' + C.ivory + ';">Who&#8217;s Buying What<div style="font-family:' + SANS + ';font-size:13px;letter-spacing:0.08em;color:#E2C891;margin-top:6px;">' + esc_(ed.date_label || '') + ' &middot; UK &amp; US documentary and factual</div></td></tr>' +
    '<tr><td style="padding:20px 28px 0;font-family:' + SANS + ';font-size:15px;line-height:1.6;color:' + C.body + ';">' + (name ? 'Hello ' + esc_(name) + ',<br><br>' : '') + esc_(ed.intro || '') + '</td></tr>' +
    parts.join('') +
    '<tr><td style="padding:22px 28px;font-family:' + SANS + ';font-size:13px;line-height:1.6;color:' + C.mist + ';">' +
    'Main items are written by The Ariel from the broadcasters&#8217; own announcements. Trade headlines are the publishers&#8217; own, linked to their sites. ' +
    a(page, 'Read this edition online') + ' &middot; ' + a('https://theariel.tv/commissioners/', 'UK and US commissioners list') + '<br><br>' +
    'You get this because you asked for it on theariel.tv. ' + a(unsub, 'Unsubscribe') + '</td></tr>' +
    '</table></td></tr></table></body></html>';
  return { subject: "Who's Buying What: " + (ed.date_label || ''), html: html, text: "Who's Buying What - " + (ed.date_label || '') + '\n\n' + (ed.intro || '') + '\n' + text.join('\n') + '\n\nOnline: ' + page + '\nUnsubscribe: ' + unsub };
}

function wbwUnsub_(token) {
  var sh = sheet_(COMM.TAB);
  wbwEnsureLeadCols_(sh);
  var row = token ? findRow_(sh, colOf_(sh, 'token'), token) : 0;
  if (!row) return { title: 'Link not recognised', body: '<p>That link has expired. Email <a href="mailto:hello@theariel.tv">hello@theariel.tv</a> and we will take you off.</p>' };
  setCells_(sh, row, { unsubscribed_at: new Date(), watch: false });
  return { title: 'Unsubscribed', body: '<p>You will not get Who&#8217;s Buying What again. The <a href="https://theariel.tv/commissioners/">commissioners list</a> is still there whenever you need it.</p>' };
}
