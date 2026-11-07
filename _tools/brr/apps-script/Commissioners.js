/**
 * UK Commissioners list - lead capture for theariel.tv/commissioners/ (2026-11-07)
 *
 * POST {action:"commissioner_list", email, name, role, company, watch, website}
 *   website = honeypot. Stores the request in tab CommissionerLeads and emails
 *   the requester the download links (so the address is proven real). watch=true
 *   records consent to the weekly Commissioning Watch email.
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
  CONSENT_WATCH: 'Weekly Commissioning Watch email from The Ariel. Unsubscribe any time.',
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
          [email, name, role, company, watch ? 'wants Commissioning Watch' : 'list only', idea ? 'Quick match idea: ' + idea : ''].filter(String).join('\n'));
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
    '<tr><td bgcolor="' + C.ink + '" style="background-color:' + C.ink + ';padding:24px 28px;font-family:' + SERIF + ';font-size:28px;color:' + C.ivory + ';">UK TV Commissioners</td></tr>' +
    '<tr><td bgcolor="' + C.cream + '" style="background-color:' + C.cream + ';padding:24px 28px;font-family:' + SANS + ';font-size:15px;line-height:1.6;color:' + C.body + ';">' +
    (name ? 'Hello ' + esc_(name) + ',<br><br>' : '') +
    'Here is the list you asked for: who commissions factual and documentary at the UK broadcasters, what they have recently commissioned, and the official way to pitch each team. Every line links to its source and shows the date we last checked it.<br><br>' +
    btn(COMM.XLSX, 'Download (Excel)') + btn(COMM.CSV, 'Download (CSV)') + '<br>' +
    'The list on <a href="' + COMM.PAGE + '" style="color:' + C.goldDeep + ';">theariel.tv/commissioners</a> is always the current version.<br><br>' +
    (watch ? 'You are also signed up to Commissioning Watch: a short weekly note of who has moved, what has been commissioned and which briefs have opened or closed. Reply STOP any time and we will take you off.<br><br>' : '') +
    'Spotted something out of date? Just reply and we will fix it.<br><br>The Ariel</td></tr></table></td></tr></table></body></html>';
  var opts = { htmlBody: html, name: CONFIG.SENDER_NAME, replyTo: CONFIG.REPLY_TO };
  if (aliasOk_()) opts.from = CONFIG.FROM_ALIAS;
  GmailApp.sendEmail(email, 'Your UK TV commissioners list',
    'Your UK TV commissioners list from The Ariel. Excel: ' + COMM.XLSX + ' CSV: ' + COMM.CSV + ' Current version: ' + COMM.PAGE, opts);
}
