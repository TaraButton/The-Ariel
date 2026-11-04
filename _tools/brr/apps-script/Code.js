/**
 * London Review of Reviews - newsletter backend (The Ariel)
 * v1.0 2026-11-01
 *
 * Container-bound to the "British Review of Reviews" Google Sheet.
 * Tabs (created by setupSheet()):
 *   Subscribers - one row per email address
 *   Editions    - one row per weekly edition (JSON split across columns)
 *   Log         - send / error log
 *
 * Web app (deployed as Tara, anyone can call):
 *   POST {action:"subscribe", email, name, role, subjects[], source, website}   (website = honeypot)
 *   POST {action:"publish_edition", secret, edition:{...}, send_after?}
 *   GET  ?action=confirm&t=TOKEN
 *   GET  ?action=unsubscribe&t=TOKEN
 *   GET  ?action=resubscribe&t=TOKEN
 *   GET  ?action=prefs&t=TOKEN            (choose subjects)
 *   GET  ?action=saveprefs&t=TOKEN&s=a,b   (save subjects)
 *   GET  ?action=preview&subjects=a,b[&edition=YYYY-MM-DD]  (renders an email in the browser)
 *   GET  ?action=health
 *
 * Editions arrive by PULL: each hourly run fetches https://theariel.tv/reviews/editions/latest.json
 * (written by the weekly pipeline when it publishes the web edition). A new edition_id is stored
 * as "ready" for the next Monday 07:00 London, so the public page is the single source of truth.
 * POST publish_edition (with the secret) remains for manual use.
 *
 * Sending: an hourly trigger (installTriggers) sends any edition whose status is
 * "ready" and whose send_after has passed, in batches that stay inside the
 * 6-minute limit. Script property TEST_ONLY_TO (comma list) restricts every
 * send to those addresses until Tara clears it.
 */

var CONFIG = {
  NAME: 'London Review of Reviews',
  FROM_ALIAS: 'tara@theariel.tv',
  SENDER_NAME: 'The Ariel',
  REPLY_TO: 'hello@theariel.tv',
  ALERT_TO: 'tara@buymeonce.com',
  SITE: 'https://theariel.tv/reviews/',
  ARIEL_SITE: 'https://theariel.tv/',
  APPLY_URL: 'https://theariel.tv/#book',
  MAX_PICKS: 8,
  BATCH_MS: 4.5 * 60 * 1000,
  CELL_LIMIT: 45000
};

var SUBJECTS = [
  'True crime', 'Espionage', 'Politics & world affairs', 'Business & power',
  'Biography & memoir', 'History', 'Society & ideas', 'Nature & place',
  'Arts & culture', 'Books & writing', 'Life & leisure'
];

var ROLES = ['Producer', 'Development executive', 'Commissioner', 'Agent or publisher', 'Writer', 'Other'];

var SUB_HEADERS = ['email', 'name', 'role', 'subjects', 'status', 'token', 'created_at', 'confirmed_at',
  'unsubscribed_at', 'source', 'consent', 'last_sent_edition', 'last_confirm_sent'];
var ED_HEADERS = ['edition_id', 'status', 'send_after', 'created_at', 'sent_at', 'sent_count',
  'json_1', 'json_2', 'json_3', 'json_4', 'json_5'];

var CONSENT_TEXT = 'Weekly London Review of Reviews email from The Ariel. Unsubscribe any time.';

/* ───────────────────────── setup ───────────────────────── */

function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureTab_(ss, 'Subscribers', SUB_HEADERS);
  ensureTab_(ss, 'Editions', ED_HEADERS);
  ensureTab_(ss, 'Log', ['time', 'type', 'detail']);
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PUBLISH_SECRET')) {
    props.setProperty('PUBLISH_SECRET', Utilities.getUuid().replace(/-/g, ''));
  }
  if (props.getProperty('TEST_ONLY_TO') === null) {
    props.setProperty('TEST_ONLY_TO', CONFIG.ALERT_TO);
  }
  ss.setSpreadsheetTimeZone('Europe/London');
  setupRights_();
  Logger.log('PUBLISH_SECRET=' + props.getProperty('PUBLISH_SECRET'));
  Logger.log('TEST_ONLY_TO=' + props.getProperty('TEST_ONLY_TO'));
  Logger.log('From alias available: ' + aliasOk_());
  return { secret: props.getProperty('PUBLISH_SECRET'), test_only_to: props.getProperty('TEST_ONLY_TO'), alias_ok: aliasOk_() };
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDueEditions') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendDueEditions').timeBased().everyHours(1).create();
  return 'sendDueEditions runs hourly';
}

/** Tara runs this from the editor (or via the admin action) when she is happy to go live. */
function goLive() {
  PropertiesService.getScriptProperties().setProperty('TEST_ONLY_TO', '');
  log_('admin', 'TEST_ONLY_TO cleared - sending to all active subscribers');
  return 'Live: editions now go to every active subscriber.';
}

function ensureTab_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ───────────────────────── web entry points ───────────────────────── */

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    body = (e && e.parameter) || {};
  }
  var action = String(body.action || '');
  try {
    if (action === 'subscribe') return json_(subscribe_(body));
    if (action === 'click') return json_(logClick_(body));
    if (action === 'check_rights') return json_(checkRights_(body));
    if (action === 'publish_edition') return json_(publishEdition_(body));
    if (action === 'admin') return json_(admin_(body));
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    log_('error', action + ': ' + err);
    return json_({ ok: false, error: 'server_error' });
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = String(p.action || '');
  try {
    if (action === 'confirm') return page_(confirm_(p.t));
    if (action === 'unsubscribe') return page_(unsubscribe_(p.t));
    if (action === 'resubscribe') return page_(resubscribe_(p.t));
    if (action === 'prefs') return page_(prefsPage_(p.t));
    if (action === 'saveprefs') return page_(savePrefs_(p.t, p.s));
    if (action === 'preview') return previewEmail_(p);
    if (action === 'rights_status') return json_(rightsStatus_());
    if (action === 'health') return json_({ ok: true, name: CONFIG.NAME, alias_ok: aliasOk_(), test_only_to: testOnly_() });
    return page_({ title: CONFIG.NAME, body: '<p>Read the latest edition at <a href="' + CONFIG.SITE + '">theariel.tv/reviews</a>.</p>' });
  } catch (err) {
    log_('error', action + ': ' + err);
    return page_({ title: 'Something went wrong', body: '<p>Sorry, that link did not work. Please try again, or email <a href="mailto:hello@theariel.tv">hello@theariel.tv</a>.</p>' });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ───────────────────────── subscribers ───────────────────────── */

function subscribe_(b) {
  if (b.website) return { ok: true };  // honeypot filled: pretend success, store nothing
  var email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return { ok: false, error: 'invalid_email', message: 'Please check your email address.' };
  }
  var subjects = cleanSubjects_(b.subjects);
  var role = ROLES.indexOf(b.role) >= 0 ? b.role : '';
  var name = String(b.name || '').trim().slice(0, 80);
  var source = String(b.source || 'site').slice(0, 30);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_('Subscribers');
    var row = findRow_(sh, 1, email);
    var now = new Date();
    if (row && cell_(sh, row, 'status') === 'active') {
      // Already subscribed: update subjects if they chose some, send nothing.
      if (subjects.length) setCell_(sh, row, 'subjects', subjects.join(', '));
      return { ok: true, status: 'already' };
    }
    var token;
    if (row) {
      var last = cell_(sh, row, 'last_confirm_sent');
      if (last && now - new Date(last) < 10 * 60 * 1000) return { ok: true, status: 'pending' };
      token = cell_(sh, row, 'token') || newToken_();
      setCells_(sh, row, { name: name || cell_(sh, row, 'name'), role: role || cell_(sh, row, 'role'),
        subjects: subjects.join(', ') || cell_(sh, row, 'subjects'), status: 'pending', token: token,
        source: source, consent: CONSENT_TEXT, last_confirm_sent: now });
    } else {
      token = newToken_();
      var rec = { email: email, name: name, role: role, subjects: subjects.join(', '), status: 'pending',
        token: token, created_at: now, confirmed_at: '', unsubscribed_at: '', source: source,
        consent: CONSENT_TEXT, last_sent_edition: '', last_confirm_sent: now };
      sh.appendRow(SUB_HEADERS.map(function (h) { return rec[h]; }));
    }
    sendConfirm_(email, name, token);
    return { ok: true, status: 'pending' };
  } finally {
    lock.releaseLock();
  }
}

function confirm_(token) {
  var sh = sheet_('Subscribers');
  var row = findRow_(sh, 6, token);
  if (!row) return { title: 'Link not recognised', body: '<p>That confirmation link has expired or was mistyped. You can <a href="' + CONFIG.SITE + '">sign up again here</a>.</p>' };
  var wasActive = cell_(sh, row, 'status') === 'active';
  setCells_(sh, row, { status: 'active', confirmed_at: cell_(sh, row, 'confirmed_at') || new Date(), unsubscribed_at: '' });
  var email = cell_(sh, row, 'email');
  if (!wasActive) {
    var latest = latestEdition_('sent');
    if (latest) {
      var sub = subFromRow_(sh, row);
      try {
        sendEditionTo_(latest, sub, true);
      } catch (err) {
        log_('error', 'welcome send ' + email + ': ' + err);
      }
    }
    try {
      GmailApp.sendEmail(CONFIG.ALERT_TO, '[Review of Reviews] New subscriber: ' + email,
        'Email: ' + email + '\nName: ' + cell_(sh, row, 'name') + '\nRole: ' + cell_(sh, row, 'role') +
        '\nSubjects: ' + cell_(sh, row, 'subjects') + '\nSource: ' + cell_(sh, row, 'source'));
    } catch (err) { /* alert is best-effort */ }
  }
  var subjects = cell_(sh, row, 'subjects');
  return {
    title: 'You’re subscribed',
    body: '<p>The London Review of Reviews will arrive every Monday morning' +
      (subjects ? ', with books for <strong>' + esc_(subjects) + '</strong> picked out at the top.' : '.') + '</p>' +
      (latestEdition_('sent') ? '<p>We’ve just sent you the latest edition so you don’t have to wait.</p>' : '') +
      '<p><a class="btn" href="' + CONFIG.SITE + '">Read this week’s edition</a></p>' +
      '<p class="small"><a href="' + webUrl_() + '?action=prefs&t=' + encodeURIComponent(token) + '">Change your subjects</a></p>'
  };
}

function unsubscribe_(token) {
  var sh = sheet_('Subscribers');
  var row = findRow_(sh, 6, token);
  if (!row) return { title: 'Link not recognised', body: '<p>We couldn’t find that subscription. If emails keep arriving, reply to one and we’ll remove you by hand.</p>' };
  setCells_(sh, row, { status: 'unsubscribed', unsubscribed_at: new Date() });
  log_('unsubscribe', cell_(sh, row, 'email'));
  return { title: 'You’re unsubscribed', body: '<p>You won’t receive the London Review of Reviews any more.</p>' +
    '<p class="small">Changed your mind? <a href="' + webUrl_() + '?action=resubscribe&t=' + encodeURIComponent(token) + '">Resubscribe</a></p>' };
}

function resubscribe_(token) {
  var sh = sheet_('Subscribers');
  var row = findRow_(sh, 6, token);
  if (!row) return unsubscribe_(token);
  setCells_(sh, row, { status: 'active', unsubscribed_at: '' });
  return { title: 'Welcome back', body: '<p>You’re subscribed again. The next edition arrives on Monday.</p>' };
}

function prefsPage_(token) {
  var sh = sheet_('Subscribers');
  var row = findRow_(sh, 6, token);
  if (!row) return { title: 'Link not recognised', body: '<p>Please use the link in your latest email.</p>' };
  var current = String(cell_(sh, row, 'subjects')).split(/\s*,\s*/);
  var boxes = SUBJECTS.map(function (s) {
    return '<label class="chk"><input type="checkbox" name="s" value="' + esc_(s) + '"' +
      (current.indexOf(s) >= 0 ? ' checked' : '') + '> ' + esc_(s) + '</label>';
  }).join('');
  return {
    title: 'Your subjects',
    body: '<p>Pick what you develop. Books in these subjects are picked out at the top of your edition.</p>' +
      '<form method="get" action="' + webUrl_() + '" target="_top" id="f">' +
      '<input type="hidden" name="action" value="saveprefs"><input type="hidden" name="t" value="' + esc_(token) + '">' +
      '<div class="chks">' + boxes + '</div><button class="btn" type="submit">Save</button></form>' +
      '<script>document.getElementById("f").addEventListener("submit",function(e){e.preventDefault();' +
      'var v=[].slice.call(document.querySelectorAll("input[name=s]:checked")).map(function(i){return i.value});' +
      'window.top.location.href="' + webUrl_() + '?action=saveprefs&t=' + encodeURIComponent(token) + '&s="+encodeURIComponent(v.join(","));});</script>'
  };
}

function savePrefs_(token, s) {
  var sh = sheet_('Subscribers');
  var row = findRow_(sh, 6, token);
  if (!row) return { title: 'Link not recognised', body: '<p>Please use the link in your latest email.</p>' };
  var subjects = cleanSubjects_(String(s || '').split(','));
  setCell_(sh, row, 'subjects', subjects.join(', '));
  return { title: 'Saved', body: '<p>' + (subjects.length ? 'Your edition will pick out <strong>' + esc_(subjects.join(', ')) + '</strong>.' : 'You’ll get the editor’s picks at the top of each edition.') + '</p>' +
    '<p><a class="btn" href="' + CONFIG.SITE + '">Read this week’s edition</a></p>' };
}

function cleanSubjects_(v) {
  if (!v) return [];
  if (typeof v === 'string') v = v.split(',');
  var out = [];
  v.forEach(function (s) {
    s = String(s).trim();
    if (SUBJECTS.indexOf(s) >= 0 && out.indexOf(s) < 0) out.push(s);
  });
  return out;
}

function subFromRow_(sh, row) {
  return { row: row, email: cell_(sh, row, 'email'), name: cell_(sh, row, 'name'),
    token: cell_(sh, row, 'token'), subjects: cleanSubjects_(cell_(sh, row, 'subjects')) };
}

function newToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

/* ───────────────────────── editions ───────────────────────── */

function publishEdition_(b) {
  var secret = PropertiesService.getScriptProperties().getProperty('PUBLISH_SECRET');
  if (!secret || b.secret !== secret) return { ok: false, error: 'forbidden' };
  var ed = b.edition;
  if (!ed || !ed.edition_id || !ed.books || !ed.books.length) return { ok: false, error: 'bad_edition' };
  var problems = validateEdition_(ed);
  if (problems.length) return { ok: false, error: 'invalid', problems: problems.slice(0, 20) };
  var jsonStr = JSON.stringify(ed);
  var chunks = [];
  for (var i = 0; i < jsonStr.length; i += CONFIG.CELL_LIMIT) chunks.push(jsonStr.slice(i, i + CONFIG.CELL_LIMIT));
  if (chunks.length > 5) return { ok: false, error: 'too_large' };
  var sendAfter = b.send_after ? new Date(b.send_after) : nextMondayMorning_();
  var sh = sheet_('Editions');
  var row = findRow_(sh, 1, ed.edition_id);
  if (row && cell_(sh, row, 'status') === 'sent') return { ok: false, error: 'already_sent' };
  var rec = { edition_id: ed.edition_id, status: 'ready', send_after: sendAfter, created_at: new Date(),
    sent_at: '', sent_count: 0, json_1: chunks[0] || '', json_2: chunks[1] || '', json_3: chunks[2] || '',
    json_4: chunks[3] || '', json_5: chunks[4] || '' };
  var values = [ED_HEADERS.map(function (h) { return rec[h]; })];
  values[0][0] = "'" + ed.edition_id;  // keep the id as text
  if (row) sh.getRange(row, 1, 1, ED_HEADERS.length).setValues(values);
  else sh.appendRow(values[0]);
  log_('publish', ed.edition_id + ' books=' + ed.books.length + ' send_after=' + sendAfter.toISOString());
  return { ok: true, edition_id: ed.edition_id, books: ed.books.length, send_after: sendAfter.toISOString(), test_only_to: testOnly_() };
}

function validateEdition_(ed) {
  var p = [];
  ed.books.forEach(function (bk, i) {
    if (!bk.book) p.push(i + ': no book title');
    if (SUBJECTS.indexOf(bk.subject) < 0) p.push(i + ': bad subject ' + bk.subject);
    if (!bk.line) p.push(i + ': no line');
    if (!bk.reviews || !bk.reviews.length) p.push(i + ': no review links');
    (bk.reviews || []).forEach(function (r) { if (!/^https:\/\//.test(r.url || '')) p.push(i + ': bad url'); });
    if (/—/.test(JSON.stringify(bk))) p.push(i + ': em dash');
  });
  return p;
}

function nextMondayMorning_() {
  var d = new Date();
  var tz = 'Europe/London';
  var day = Number(Utilities.formatDate(d, tz, 'u')); // 1=Mon..7=Sun
  var add = (8 - day) % 7;
  if (add === 0 && Number(Utilities.formatDate(d, tz, 'H')) >= 7) add = 7;
  var target = new Date(d.getTime() + add * 86400000);
  var ymd = Utilities.formatDate(target, tz, 'yyyy-MM-dd');
  return Utilities.parseDate(ymd + ' 07:00', tz, 'yyyy-MM-dd HH:mm');
}

function editionFromRow_(sh, row) {
  var s = '';
  for (var i = 1; i <= 5; i++) s += String(cell_(sh, row, 'json_' + i) || '');
  return JSON.parse(s);
}

function latestEdition_(status) {
  var sh = sheet_('Editions');
  var last = sh.getLastRow();
  for (var r = last; r >= 2; r--) {
    if (!status || cell_(sh, r, 'status') === status) return editionFromRow_(sh, r);
  }
  return null;
}

/* ───────────────────────── sending ───────────────────────── */

function pullLatestEdition() {
  var res = UrlFetchApp.fetch(CONFIG.SITE + 'editions/latest.json?ts=' + Date.now(), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) { log_('pull', 'latest.json HTTP ' + res.getResponseCode()); return null; }
  var ed;
  try { ed = JSON.parse(res.getContentText()); } catch (err) { log_('pull', 'latest.json not JSON'); return null; }
  if (!ed || !ed.edition_id) return null;
  var sh = sheet_('Editions');
  if (findRow_(sh, 1, ed.edition_id)) return null;  // already have it
  var secret = PropertiesService.getScriptProperties().getProperty('PUBLISH_SECRET');
  var out = publishEdition_({ secret: secret, edition: ed });
  log_('pull', ed.edition_id + ' -> ' + JSON.stringify(out));
  if (!out.ok) {
    GmailApp.sendEmail(CONFIG.ALERT_TO, '[Review of Reviews] Edition ' + ed.edition_id + ' rejected',
      'The weekly edition on the site failed checks and will not be emailed:\n' + JSON.stringify(out, null, 1));
  }
  return out;
}

function sendDueEditions() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var start = Date.now();
    try { if (!SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config')) setupRights_(); else ensureTriggers_(); } catch (err) { log_('error', 'setupRights: ' + err); }
    try { pullLatestEdition(); } catch (err) { log_('error', 'pull: ' + err); }
    var esh = sheet_('Editions');
    var now = new Date();
    var seen = {};  // one live row per edition: later copies of a sent or already-queued edition are retired
    for (var q = 2; q <= esh.getLastRow(); q++) {
      var qid = idText_(cell_(esh, q, 'edition_id')), qst = cell_(esh, q, 'status');
      if (qst === 'sent' || qst === 'ready' || qst === 'sending') {
        if (seen[qid]) { setCell_(esh, q, 'status', 'duplicate'); continue; }
        seen[qid] = true;
      }
    }
    for (var r = 2; r <= esh.getLastRow(); r++) {
      var st = cell_(esh, r, 'status');
      if (st !== 'ready' && st !== 'sending') continue;
      var after = cell_(esh, r, 'send_after');
      if (after && new Date(after) > now) continue;
      var ed = editionFromRow_(esh, r);
      setCell_(esh, r, 'status', 'sending');
      var done = sendBatch_(ed, start);
      setCell_(esh, r, 'sent_count', Number(cell_(esh, r, 'sent_count') || 0) + done.sent);
      if (done.finished) {
        setCells_(esh, r, { status: 'sent', sent_at: new Date() });
        var total = cell_(esh, r, 'sent_count');
        log_('sent', ed.edition_id + ' total=' + total + (testOnly_() ? ' (TEST_ONLY_TO)' : ''));
        GmailApp.sendEmail(CONFIG.ALERT_TO, '[Review of Reviews] ' + ed.edition_id + ' sent to ' + total,
          'Edition ' + ed.edition_id + ' finished sending to ' + total + ' subscriber(s).' +
          (testOnly_() ? '\nTest mode: only sent to ' + testOnly_() + '. Run goLive() to send to everyone.' : '') +
          (done.errors ? '\nErrors: ' + done.errors + ' (see Log tab).' : ''));
      }
      if (Date.now() - start > CONFIG.BATCH_MS) return;
    }
  } finally {
    lock.releaseLock();
  }
}

function sendBatch_(ed, start) {
  var sh = sheet_('Subscribers');
  var data = sh.getDataRange().getValues();
  var idx = {};
  SUB_HEADERS.forEach(function (h, i) { idx[h] = i; });
  var testList = testOnly_() ? testOnly_().split(/\s*,\s*/) : null;
  var sent = 0, errors = 0;
  for (var i = 1; i < data.length; i++) {
    if (Date.now() - start > CONFIG.BATCH_MS) return { sent: sent, errors: errors, finished: false };
    var rowv = data[i];
    if (rowv[idx.status] !== 'active') continue;
    if (idText_(rowv[idx.last_sent_edition]) === idText_(ed.edition_id)) continue;
    var email = String(rowv[idx.email]);
    if (testList && testList.indexOf(email) < 0) continue;
    if (MailApp.getRemainingDailyQuota() < 5) {
      log_('quota', 'Daily email quota reached during ' + ed.edition_id + '; resumes next run');
      return { sent: sent, errors: errors, finished: false };
    }
    try {
      sendEditionTo_(ed, { row: i + 1, email: email, name: rowv[idx.name], token: rowv[idx.token],
        subjects: cleanSubjects_(rowv[idx.subjects]) }, false);
      sh.getRange(i + 1, idx.last_sent_edition + 1).setValue("'" + ed.edition_id);
      sent++;
    } catch (err) {
      errors++;
      log_('error', 'send ' + email + ': ' + err);
    }
  }
  // Test mode with a test address that is not (yet) a subscriber: send it a copy once.
  if (testList) {
    testList.forEach(function (addr) {
      if (!addr) return;
      var found = data.some(function (r) { return String(r[idx.email]) === addr && r[idx.status] === 'active'; });
      if (!found) {
        sendEditionTo_(ed, { email: addr, name: '', token: '', subjects: ['True crime', 'Espionage', 'History'] }, false);
        sent++;
      }
    });
  }
  return { sent: sent, errors: errors, finished: true };
}

function sendEditionTo_(ed, sub, isWelcome) {
  var m = renderEmail_(ed, sub, isWelcome);
  var opts = { htmlBody: m.html, name: CONFIG.SENDER_NAME, replyTo: CONFIG.REPLY_TO };
  if (aliasOk_()) opts.from = CONFIG.FROM_ALIAS;
  GmailApp.sendEmail(sub.email, m.subject, m.text, opts);
}

function testOnly_() {
  var v = PropertiesService.getScriptProperties().getProperty('TEST_ONLY_TO');
  return v ? String(v).trim().toLowerCase() : '';
}

function aliasOk_() {
  try {
    var want = CONFIG.FROM_ALIAS.toLowerCase();
    return GmailApp.getAliases().some(function (a) { return String(a).toLowerCase() === want; });
  } catch (err) {
    return false;
  }
}

/* ───────────────────────── email rendering ───────────────────────── */

var C = { ink: '#1B1F3B', ivory: '#F8F5F0', cream: '#FFFFFF', gold: '#B8965A', goldDeep: '#6E5428',
  mist: '#454D60', line: '#CFC9BE', body: '#1E2233', tint: '#F4ECDD' };
var SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
var SANS = "Lato, 'Helvetica Neue', Arial, sans-serif";

function picksFor_(ed, subjects) {
  var leads = ed.books.filter(function (b) { return b.lead; });
  if (subjects && subjects.length) {
    var mine = leads.filter(function (b) { return subjects.indexOf(b.subject) >= 0; });
    if (mine.length) return { mine: true, books: mine.slice(0, CONFIG.MAX_PICKS) };
  }
  return { mine: false, books: leads.slice(0, 6) };
}

function renderEmail_(ed, sub, isWelcome) {
  var picks = picksFor_(ed, sub.subjects);
  var dateLabel = ed.date_label || ed.edition_id;
  var n = ed.books.length;
  var subject = CONFIG.NAME + ' - ' + dateLabel + ': ' + n + ' books' +
    (picks.mine ? ', ' + picks.books.length + ' picked for you' : '');
  var unsub = sub.token ? webUrl_() + '?action=unsubscribe&t=' + encodeURIComponent(sub.token) : CONFIG.SITE;
  var prefs = sub.token ? webUrl_() + '?action=prefs&t=' + encodeURIComponent(sub.token) : CONFIG.SITE;
  var webVersion = CONFIG.SITE + (ed.edition_id ? ed.edition_id + '.html' : '');

  var h = [];
  h.push('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light"><title>' + esc_(subject) + '</title></head>');
  h.push('<body style="margin:0;padding:0;background-color:' + C.ivory + ';" bgcolor="' + C.ivory + '">');
  h.push('<div style="display:none;max-height:0;overflow:hidden;">' + esc_(ed.preheader || ('Every non-fiction book reviewed in the British papers this week, one line each.')) + '</div>');
  h.push('<div role="main" aria-label="' + CONFIG.NAME + '"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.ivory + '" style="background-color:' + C.ivory + ';"><tr><td align="center" style="padding:24px 12px;">');
  h.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;">');

  // masthead
  h.push('<tr><td bgcolor="' + C.ink + '" style="background-color:' + C.ink + ';padding:28px 28px 22px;">' +
    '<div style="font-family:' + SANS + ';font-size:13px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#E2C891;">Free every Monday from The Ariel &middot; ' + esc_(dateLabel) + '</div>' +
    '<h1 style="margin:10px 0 0;font-weight:normal;font-family:' + SERIF + ';font-size:36px;line-height:1.1;color:#FFFFFF;">London Review <i>of</i> Reviews</h1>' +
    '<div style="font-family:' + SANS + ';font-size:16px;line-height:1.5;color:#E6E9F1;margin-top:10px;">Every non-fiction book reviewed in the week’s papers and literary magazines, one line each. ' + n + ' books this week.</div>' +
    '</td></tr>');

  if (isWelcome) {
    h.push('<tr><td bgcolor="' + C.cream + '" style="background-color:' + C.cream + ';padding:18px 28px;font-family:' + SANS + ';font-size:14px;color:' + C.body + ';border-bottom:1px solid ' + C.line + ';">' +
      'Welcome. Here’s the latest edition so you don’t have to wait. The next one arrives on Monday.</td></tr>');
  }

  // picks
  if (picks.books.length) {
    h.push('<tr><td bgcolor="' + C.tint + '" style="background-color:' + C.tint + ';padding:22px 28px 10px;">' +
      '<div style="font-family:' + SANS + ';font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:' + C.goldDeep + ';font-weight:bold;">' +
      (picks.mine ? '&#9733; Picked for you: ' + esc_(sub.subjects.join(', ')) : '&#9733; This week’s screen picks') + '</div>' +
      '<div style="font-family:' + SANS + ';font-size:15px;color:' + C.mist + ';margin-top:4px;">' +
      (picks.mine ? 'Books in your subjects with screen potential, and why. We haven\u2019t checked the rights; for rights-available books from agents, <a href="' + CONFIG.APPLY_URL + '" style="color:' + C.goldDeep + ';">sign up to The Ariel</a>.' : 'Books with screen potential, and why. We haven\u2019t checked the rights; for rights-available books from agents, <a href="' + CONFIG.APPLY_URL + '" style="color:' + C.goldDeep + ';">sign up to The Ariel</a>. <a href="' + prefs + '" style="color:' + C.goldDeep + ';">Choose your subjects</a> to get your own picks.') +
      '</div></td></tr>');
    picks.books.forEach(function (b) {
      h.push('<tr><td bgcolor="' + C.tint + '" style="background-color:' + C.tint + ';padding:10px 28px;">' + bookBlock_(b, true, { edition_id: ed.edition_id, token: sub.token }) + '</td></tr>');
    });
    h.push('<tr><td bgcolor="' + C.tint + '" style="background-color:' + C.tint + ';padding:6px 28px 22px;"></td></tr>');
  }

  // full edition by subject
  SUBJECTS.forEach(function (s) {
    var list = ed.books.filter(function (b) { return b.subject === s; });
    if (!list.length) return;
    h.push('<tr><td bgcolor="' + C.cream + '" style="background-color:' + C.cream + ';padding:26px 28px 6px;">' +
      '<div style="font-family:' + SERIF + ';font-style:italic;font-size:24px;color:' + C.ink + ';border-bottom:2px solid ' + C.ink + ';padding-bottom:4px;">' +
      esc_(s) + ' <span style="font-family:' + SANS + ';font-style:normal;font-size:12px;color:' + C.mist + ';">' + list.length + '</span></div></td></tr>');
    list.forEach(function (b) {
      h.push('<tr><td bgcolor="' + C.cream + '" style="background-color:' + C.cream + ';padding:10px 28px;border-bottom:1px solid ' + C.line + ';">' + bookBlock_(b, false, { edition_id: ed.edition_id, token: sub.token }) + '</td></tr>');
    });
  });

  // Ariel CTA
  h.push('<tr><td bgcolor="' + C.ink + '" style="background-color:' + C.ink + ';padding:28px;">' +
    '<div style="font-family:' + SERIF + ';font-size:24px;line-height:1.2;color:' + C.ivory + ';">Want books whose rights are available?</div>' +
    '<div style="font-family:' + SANS + ';font-size:16px;line-height:1.6;color:#E6E9F1;margin-top:10px;">We don’t check rights for the Review. Sign up to The Ariel and get a first look at rights-available books directly from literary agents, matched to what you develop, plus books, journalism and rights deals every day for your slate.</div>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;"><tr><td bgcolor="' + C.gold + '" style="background-color:' + C.gold + ';border-radius:2px;">' +
    '<a href="' + CONFIG.ARIEL_SITE + '?utm_source=review-of-reviews&utm_medium=email#book" style="display:inline-block;padding:13px 22px;font-family:' + SANS + ';font-size:16px;color:' + C.ink + ';text-decoration:none;font-weight:bold;">Sign up to The Ariel</a>' +
    '</td></tr></table></td></tr>');

  // footer
  h.push('<tr><td style="padding:20px 28px 0;font-family:' + SANS + ';font-size:16px;line-height:1.5;color:' + C.body + ';">' +
    '<b>Know someone who\u2019d like this?</b> Forward it on. They can sign up free at <a href="' + CONFIG.SITE + '" style="color:' + C.goldDeep + ';">theariel.tv/reviews</a>.</td></tr>');
  h.push('<tr><td style="padding:16px 28px 22px;font-family:' + SANS + ';font-size:14px;line-height:1.6;color:' + C.mist + ';">' +
    'Summaries are our own one-line descriptions of each review. Follow the links to read the reviews in full. &#9733; marks books we think have screen potential; we haven\u2019t checked who holds the film and TV rights, and some may already be optioned. For a first look at rights-available books directly from agents, sign up to The Ariel.<br>' +
    'Not yet covered: the Telegraph, TLS and New Statesman.<br><br>' +
    'You’re getting this because you signed up at theariel.tv. ' +
    '<a href="' + webVersion + '" style="color:' + C.mist + ';">View on the web</a> &middot; ' +
    '<a href="' + prefs + '" style="color:' + C.mist + ';">Change your subjects</a> &middot; ' +
    '<a href="' + unsub + '" style="color:' + C.mist + ';">Unsubscribe</a><br>' +
    'The Ariel &middot; <a href="mailto:hello@theariel.tv" style="color:' + C.mist + ';">hello@theariel.tv</a></td></tr>');

  h.push('</table></td></tr></table></div></body></html>');

  var t = [CONFIG.NAME + ' - ' + dateLabel, ''];
  if (picks.books.length) {
    t.push(picks.mine ? 'PICKED FOR YOU (' + sub.subjects.join(', ') + ')' : 'THIS WEEK’S SCREEN PICKS');
    picks.books.forEach(function (b) { t.push('* ' + b.book + (b.author ? ' - ' + b.author : '') + ': ' + b.line + (b.why ? ' Screen potential: ' + b.why : '') + ' ' + b.reviews[0].url); });
    t.push('');
  }
  SUBJECTS.forEach(function (s) {
    var list = ed.books.filter(function (b) { return b.subject === s; });
    if (!list.length) return;
    t.push(s.toUpperCase());
    list.forEach(function (b) { t.push('- ' + b.book + (b.author ? ' - ' + b.author : '') + ': ' + b.line + ' ' + b.reviews[0].url); });
    t.push('');
  });
  t.push('Want books whose rights are available? Get a first look directly from literary agents: sign up to The Ariel at ' + CONFIG.APPLY_URL);
  t.push('Change your subjects: ' + prefs);
  t.push('Unsubscribe: ' + unsub);
  return { subject: subject, html: h.join(''), text: t.join('\n') };
}

function bookId_(b) {
  return b.book_id || String((b.book || '') + ' ' + (b.author || '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function bookBlock_(b, withWhy, ctx) {
  ctx = ctx || {};
  var bid = bookId_(b);
  var go = function (i) {
    return CONFIG.SITE + 'go.html?e=' + encodeURIComponent(ctx.edition_id || '') + '&b=' + encodeURIComponent(bid) + '&u=' + i +
      (ctx.token ? '&t=' + encodeURIComponent(ctx.token) : '');
  };
  var links = b.reviews.map(function (r, i) {
    var VL = { rave: 'rave', warm: 'warm', mixed: 'mixed', pan: 'critical' };
    return '<a href="' + esc_(ctx.edition_id ? go(i) : r.url) + '" style="color:' + C.goldDeep + ';text-decoration:underline;">' + esc_(r.pub) + '</a>' +
      (VL[r.verdict] ? ' <span style="font-size:13px;color:' + C.goldDeep + ';">(' + VL[r.verdict] + ')</span>' : '');
  }).join(' &middot; ');
  var check = CONFIG.SITE + (ctx.edition_id ? ctx.edition_id + '.html' : '') + '?check=' + encodeURIComponent(bid) + (ctx.token ? '&t=' + encodeURIComponent(ctx.token) : '') + '#b-' + bid;
  return '<div style="font-family:' + SANS + ';font-size:17px;line-height:1.35;color:' + C.ink + ';font-weight:bold;">' +
    (withWhy || !b.lead ? '' : '<span style="color:' + C.gold + ';">&#9733; </span>') + esc_(b.book) +
    (b.author ? ' <span style="font-weight:normal;color:' + C.mist + ';font-size:15px;">' + esc_(b.author) + '</span>' : '') + '</div>' +
    '<div style="font-family:' + SANS + ';font-size:16px;line-height:1.55;color:' + C.body + ';margin-top:4px;">' + esc_(b.line) + '</div>' +
    (withWhy && b.why ? '<div style="font-family:' + SANS + ';font-size:15px;line-height:1.5;color:' + C.ink + ';margin-top:6px;padding:8px 10px;background-color:#FFFFFF;border-left:3px solid ' + C.gold + ';"><b style="color:' + C.goldDeep + ';">Screen potential:</b> ' + esc_(b.why) + '</div>' : '') +
    '<div style="font-family:' + SANS + ';font-size:14px;color:' + C.mist + ';margin-top:6px;">Reviewed in ' + links +
    (b.reviews.length > 1 ? ' <span style="color:' + C.goldDeep + ';font-weight:bold;">(' + b.reviews.length + ' papers)</span>' : '') +
    ' &middot; <a href="' + esc_(check) + '" style="color:' + C.ink + ';font-weight:bold;text-decoration:underline;">Check rights</a></div>';
}

function previewEmail_(p) {
  var ed;
  if (p.edition) {
    var sh = sheet_('Editions');
    var row = findRow_(sh, 1, p.edition);
    ed = row ? editionFromRow_(sh, row) : null;
  } else {
    ed = latestEdition_();
  }
  if (!ed) return page_({ title: 'No edition yet', body: '<p>No edition has been published yet.</p>' });
  var m = renderEmail_(ed, { email: '', token: '', subjects: cleanSubjects_(String(p.subjects || '').split(',')) }, false);
  return HtmlService.createHtmlOutput(m.html).setTitle(m.subject);
}

/* ───────────────────────── admin ───────────────────────── */

function admin_(b) {
  var secret = PropertiesService.getScriptProperties().getProperty('PUBLISH_SECRET');
  if (!secret || b.secret !== secret) return { ok: false, error: 'forbidden' };
  if (b.op === 'stats') {
    var sh = sheet_('Subscribers');
    var v = sh.getDataRange().getValues();
    var c = { active: 0, pending: 0, unsubscribed: 0 };
    for (var i = 1; i < v.length; i++) c[v[i][4]] = (c[v[i][4]] || 0) + 1;
    return { ok: true, counts: c, test_only_to: testOnly_(), alias_ok: aliasOk_(), quota: MailApp.getRemainingDailyQuota() };
  }
  if (b.op === 'send_now') { sendDueEditions(); return { ok: true }; }
  var ra = rightsAdmin_(b);
  if (ra) return ra;
  return { ok: false, error: 'unknown_op' };
}

/* ───────────────────────── pages ───────────────────────── */

function page_(o) {
  var html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<base target="_top"><title>' + esc_(o.title) + ' - ' + CONFIG.NAME + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,500&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">' +
    '<style>body{margin:0;background:' + C.ivory + ';color:' + C.body + ';font-family:Lato,Arial,sans-serif;font-weight:400;font-size:18px;line-height:1.6}' +
    '.top{background:' + C.ink + ';color:#FFFFFF;padding:22px 16px}.top a{color:#E2C891;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:.04em}' +
    '.wrap{max-width:560px;margin:0 auto;padding:36px 16px}h1{font-family:"Cormorant Garamond",Georgia,serif;font-weight:500;font-size:38px;line-height:1.1;color:' + C.ink + ';margin:0 0 14px}' +
    'a{color:' + C.goldDeep + '}a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid ' + C.gold + ';outline-offset:2px}.btn{display:inline-block;background:' + C.gold + ';color:' + C.ink + ';padding:14px 22px;text-decoration:none;font-size:17px;font-weight:900;border:0;border-radius:3px;cursor:pointer;font-family:Lato,Arial,sans-serif;min-height:48px}' +
    '.small{font-size:16px;color:' + C.mist + '}.chks{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin:16px 0 20px}.chk{font-size:17px;display:flex;gap:8px;align-items:center}.chk input{width:22px;height:22px}</style></head><body>' +
    '<header class="top"><div style="max-width:560px;margin:0 auto"><a href="' + CONFIG.SITE + '" target="_top">London Review of Reviews &middot; The Ariel</a></div></header>' +
    '<main class="wrap"><h1>' + esc_(o.title) + '</h1>' + o.body + '</main></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(o.title).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ───────────────────────── sheet helpers ───────────────────────── */

function sheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) { setupSheet(); sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }
  return sh;
}

function headers_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}

function colOf_(sh, h) {
  var i = headers_(sh).indexOf(h);
  if (i < 0) throw new Error('missing column ' + h);
  return i + 1;
}

function cell_(sh, row, h) { return sh.getRange(row, colOf_(sh, h)).getValue(); }
function setCell_(sh, row, h, v) { sh.getRange(row, colOf_(sh, h)).setValue(v); }
function setCells_(sh, row, o) { Object.keys(o).forEach(function (k) { setCell_(sh, row, k, o[k]); }); }

/* Sheets turns ids like "2026-11-02" into Dates; compare them as yyyy-MM-dd text. */
function idText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return String(v);
}

function findRow_(sh, col, value) {
  if (!value) return 0;
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, col, last - 1, 1).getValues();
  var want = idText_(value).toLowerCase();
  for (var i = 0; i < vals.length; i++) if (idText_(vals[i][0]).toLowerCase() === want) return i + 2;
  return 0;
}

function webUrl_() {
  var u = PropertiesService.getScriptProperties().getProperty('WEB_APP_URL');
  return u || ScriptApp.getService().getUrl();
}

function sendConfirm_(email, name, token) {
  var link = webUrl_() + '?action=confirm&t=' + encodeURIComponent(token);
  var html = '<!doctype html><html><body style="margin:0;background:' + C.ivory + ';" bgcolor="' + C.ivory + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' + C.ivory + '"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">' +
    '<tr><td bgcolor="' + C.ink + '" style="background-color:' + C.ink + ';padding:24px 28px;font-family:' + SERIF + ';font-size:28px;color:' + C.ivory + ';">London Review <i>of</i> Reviews</td></tr>' +
    '<tr><td bgcolor="' + C.cream + '" style="background-color:' + C.cream + ';padding:24px 28px;font-family:' + SANS + ';font-size:15px;line-height:1.6;color:' + C.body + ';">' +
    (name ? 'Hello ' + esc_(name) + ',<br><br>' : '') +
    'Please confirm you’d like the London Review of Reviews from The Ariel: every non-fiction book reviewed in the week’s papers, one line each, every Monday.<br><br>' +
    '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="' + C.ink + '" style="background-color:' + C.ink + ';border-radius:2px;">' +
    '<a href="' + link + '" style="display:inline-block;padding:12px 22px;font-family:' + SANS + ';font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:' + C.ivory + ';text-decoration:none;">Confirm my subscription</a></td></tr></table><br>' +
    '<span style="font-size:13px;color:' + C.mist + ';">If you didn’t ask for this, ignore this email and you won’t hear from us.</span></td></tr></table></td></tr></table></body></html>';
  var opts = { htmlBody: html, name: CONFIG.SENDER_NAME, replyTo: CONFIG.REPLY_TO };
  if (aliasOk_()) opts.from = CONFIG.FROM_ALIAS;
  GmailApp.sendEmail(email, 'Confirm your London Review of Reviews subscription',
    'Please confirm your subscription to the London Review of Reviews from The Ariel: ' + link, opts);
}

function log_(type, detail) {
  try { sheet_('Log').appendRow([new Date(), type, String(detail).slice(0, 500)]); } catch (e) { /* ignore */ }
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
