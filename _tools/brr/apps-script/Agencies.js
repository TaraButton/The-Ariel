/**
 * Agency rights pages - theariel.tv/rights/<slug>/ (added 10 Nov 2026)
 *
 * Each literary agency gets:
 *   /rights/<slug>/edit/?k=TOKEN  private page: confirm rights, edit, add titles, covers, fairs, sharing
 *   /rights/<slug>/               their catalogue (private until they choose public or password)
 *   /rights/<slug>/guide/         print-ready rights guide (Save as PDF) with an Enquire link + QR per title
 *   /rights/<slug>/?t=ID          enquiry page for one title - works whatever the catalogue's visibility,
 *                                 because the agency printed that title in its own guide
 *
 * Tabs (created on first use):
 *   AgencyPages      slug | name | token | visibility | pw_hash | json | created_at | updated_at | last_agent_save | last_agent_view
 *   AgencyTitles     slug | id | json | updated_at | updated_by | deleted
 *   AgencyImages     img_id | slug | mime | created_at | part_1..part_12   (uploaded covers, base64 split across cells)
 *   AgencyEnquiries  time | slug | title_id | title | author | name | email | company | role | message | via | status
 *   AgencyLog        time | slug | who | what
 *
 * GET  ?action=agency_get&slug=&k=           editor data (token required)
 * GET  ?action=agency_public&slug=&pw=       catalogue data (respects visibility)
 * GET  ?action=agency_title&slug=&id=        one title's topline, for the enquiry page
 * GET  ?action=agency_imgs&slug=&ids=a,b     uploaded images as data URIs
 * POST {action:"agency_save", slug, k, agency?, titles?, deletes?, confirm_all?}
 * POST {action:"agency_upload", slug, k, data (data URI, already resized in the browser)}
 * POST {action:"agency_enquire", slug, id, name, email, company, role, message, via, website}
 * admin ops (secret): agency_seed {seed:{agency,titles}, replace}, agency_link {slug}, agency_list
 *
 * The Ariel never shows agencies producer match counts (Tara, 9 Nov 2026). Enquiries are introductions:
 * one email from tara@theariel.tv to the agency's film/TV contact, copying the producer, Reply-To the producer.
 */

var AG = {
  PAGES: 'AgencyPages', TITLES: 'AgencyTitles', IMAGES: 'AgencyImages', ENQ: 'AgencyEnquiries', LOG: 'AgencyLog',
  PAGE_HEADERS: ['slug', 'name', 'token', 'visibility', 'pw_hash', 'json', 'created_at', 'updated_at', 'last_agent_save', 'last_agent_view'],
  TITLE_HEADERS: ['slug', 'id', 'json', 'updated_at', 'updated_by', 'deleted'],
  IMG_PARTS: 12,
  ENQ_HEADERS: ['time', 'slug', 'title_id', 'title', 'author', 'name', 'email', 'company', 'role', 'message', 'via', 'status'],
  SITE: 'https://theariel.tv/rights/',
  STATUSES: ['available', 'optioned', 'produced', 'not_available', 'check'],
  PUBLIC_STATUSES: ['available', 'optioned', 'produced'],
  TITLE_FIELDS: ['title', 'author', 'year', 'pub_date', 'form', 'genre', 'section', 'status', 'option_lapse', 'optioned_to',
    'pitch', 'credentials', 'praise', 'bio', 'cover', 'agent', 'screen_agent', 'uk_pub', 'us_pub', 'material', 'length',
    'rights_sold', 'stage', 'source', 'confirmed', 'in_guide', 'highlight', 'added_by', 'cover_auto', 'agent_note',
    'show_optioned_to', 'pitch_src', 'via_agency', 'aka', 'series', 'series_no'],
  PRIVATE_TITLE_FIELDS: ['agent_note', 'added_by', 'source', 'cover_auto', 'pitch_src'],
  AGENCY_FIELDS: ['name', 'short', 'site', 'address', 'phone', 'contact_name', 'contact_role', 'contact_email', 'cc_email',
    'guide_title', 'season', 'intro', 'cover_image', 'logo', 'accent', 'fairs', 'sections', 'authors_to_add', 'guide_sort', 'guide_scope'],
  PRIVATE_AGENCY_FIELDS: ['authors_to_add', 'cc_email']
};

/* ───────── routing (called from doGet / doPost / admin_) ───────── */

function agencyGet_(action, p) {
  if (action === 'agency_get') return agencyGetPrivate_(p.slug, p.k);
  if (action === 'agency_public') return agencyPublic_(p.slug, p.pw);
  if (action === 'agency_title') return agencyTitle_(p.slug, p.id);
  if (action === 'agency_imgs') return agencyImgs_(p.slug, p.ids);
  return null;
}

function agencyPost_(action, b) {
  if (action === 'agency_save') return agencySave_(b);
  if (action === 'agency_upload') return agencyUpload_(b);
  if (action === 'agency_enquire') return agencyEnquire_(b);
  if (action === 'agency_clear') return agencyClear_(b);
  return null;
}

function agencyAdmin_(b) {
  if (b.op === 'agency_seed') return agencySeed_(b.seed || {}, b.replace === true);
  if (b.op === 'agency_link') {
    var a = agencyRow_(b.slug);
    if (!a) return { ok: false, error: 'not_found' };
    return { ok: true, edit_url: agencyEditUrl_(a.slug, a.token), public_url: AG.SITE + a.slug + '/', visibility: a.visibility };
  }
  if (b.op === 'agency_list') {
    var sh = agencySheet_(AG.PAGES, AG.PAGE_HEADERS), v = sh.getDataRange().getValues(), out = [];
    for (var i = 1; i < v.length; i++) out.push({ slug: v[i][0], name: v[i][1], visibility: v[i][3], last_agent_save: v[i][8], last_agent_view: v[i][9] });
    return { ok: true, agencies: out };
  }
  return null;
}

/* ───────── sheets ───────── */

function agencySheet_(name, headers) {
  return ensureTab_(SpreadsheetApp.getActiveSpreadsheet(), name, headers);
}

function agencyEditUrl_(slug, token) { return AG.SITE + slug + '/edit/?k=' + encodeURIComponent(token); }

function agencyRow_(slug) {
  slug = String(slug || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  var sh = agencySheet_(AG.PAGES, AG.PAGE_HEADERS);
  var row = findRow_(sh, 1, slug);
  if (!row) return null;
  var v = sh.getRange(row, 1, 1, AG.PAGE_HEADERS.length).getValues()[0];
  var data = {};
  try { data = JSON.parse(v[5] || '{}'); } catch (e) { data = {}; }
  return { row: row, sh: sh, slug: slug, name: v[1], token: String(v[2]), visibility: String(v[3] || 'private'), pw_hash: String(v[4] || ''), data: data };
}

function agencyAuth_(slug, k) {
  var a = agencyRow_(slug);
  if (!a || !k || String(k) !== a.token) return null;
  return a;
}

function agencyTitles_(slug) {
  var sh = agencySheet_(AG.TITLES, AG.TITLE_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var v = sh.getRange(2, 1, last - 1, AG.TITLE_HEADERS.length).getValues(), out = [];
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]) !== slug || v[i][5] === true || String(v[i][5]) === 'TRUE') continue;
    var t = {};
    try { t = JSON.parse(v[i][2] || '{}'); } catch (e) { continue; }
    t.id = String(v[i][1]);
    t.updated_at = v[i][3] ? new Date(v[i][3]).toISOString() : '';
    t._row = i + 2;
    out.push(t);
  }
  return out;
}

function agencyPublicAgency_(a) {
  var o = { slug: a.slug, name: a.name, visibility: a.visibility, has_password: !!a.pw_hash };
  AG.AGENCY_FIELDS.forEach(function (f) { if (AG.PRIVATE_AGENCY_FIELDS.indexOf(f) < 0 && a.data[f] !== undefined) o[f] = a.data[f]; });
  o.name = a.data.name || a.name;
  return o;
}

function agencyPublicTitle_(t) {
  var o = { id: t.id };
  AG.TITLE_FIELDS.forEach(function (f) { if (AG.PRIVATE_TITLE_FIELDS.indexOf(f) < 0 && t[f] !== undefined && t[f] !== '') o[f] = t[f]; });
  if (!t.show_optioned_to) delete o.optioned_to;
  delete o.show_optioned_to;
  o.confirmed = t.confirmed !== false;
  o.updated_at = t.updated_at;
  return o;
}

function pwHash_(slug, pw) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, slug + ':' + String(pw), Utilities.Charset.UTF_8);
  return d.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

function agencyLog_(slug, who, what) {
  try { agencySheet_(AG.LOG, ['time', 'slug', 'who', 'what']).appendRow([new Date(), slug, who, String(what).slice(0, 500)]); } catch (e) { /* ignore */ }
}

/* ───────── reads ───────── */

function agencyGetPrivate_(slug, k) {
  var a = agencyAuth_(slug, k);
  if (!a) return { ok: false, error: 'forbidden' };
  a.sh.getRange(a.row, AG.PAGE_HEADERS.indexOf('last_agent_view') + 1).setValue(new Date());
  var ag = agencyPublicAgency_(a);
  AG.PRIVATE_AGENCY_FIELDS.forEach(function (f) { if (a.data[f] !== undefined) ag[f] = a.data[f]; });
  var titles = agencyTitles_(a.slug).map(function (t) { delete t._row; return t; });
  return { ok: true, agency: ag, titles: titles, enquiries: agencyEnquiriesFor_(a.slug) };
}

function agencyPublic_(slug, pw) {
  var a = agencyRow_(slug);
  if (!a) return { ok: false, error: 'not_found' };
  if (a.visibility === 'private' || a.visibility === 'off') return { ok: false, error: a.visibility, name: a.data.name || a.name };
  if (a.visibility === 'password' && (!pw || pwHash_(a.slug, pw) !== a.pw_hash)) {
    return { ok: false, error: pw ? 'wrong_password' : 'password', name: a.data.name || a.name };
  }
  var titles = agencyTitles_(a.slug).filter(function (t) {
    return t.in_guide !== false && AG.PUBLIC_STATUSES.indexOf(t.status) >= 0;
  }).map(agencyPublicTitle_);
  return { ok: true, agency: agencyPublicAgency_(a), titles: titles };
}

function agencyTitle_(slug, id) {
  var a = agencyRow_(slug);
  if (!a) return { ok: false, error: 'not_found' };
  if (a.visibility === 'off') return { ok: false, error: 'off', agency: { name: a.data.name || a.name, site: a.data.site || '' } };
  var t = agencyTitles_(a.slug).filter(function (x) { return x.id === String(id || ''); })[0];
  if (!t) return { ok: false, error: 'title_not_found', agency: { name: a.data.name || a.name } };
  var ag = agencyPublicAgency_(a);
  return { ok: true, agency: { name: ag.name, slug: a.slug, contact_name: ag.contact_name, contact_role: ag.contact_role, visibility: a.visibility },
    title: agencyPublicTitle_(t) };
}

function agencyImgs_(slug, ids) {
  var want = String(ids || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 60);
  if (!want.length) return { ok: true, images: {} };
  var sh = agencySheet_(AG.IMAGES, agencyImgHeaders_());
  var last = sh.getLastRow();
  if (last < 2) return { ok: true, images: {} };
  var v = sh.getRange(2, 1, last - 1, 4 + AG.IMG_PARTS).getValues(), out = {};
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][1]) !== String(slug) || want.indexOf(String(v[i][0])) < 0) continue;
    out[String(v[i][0])] = 'data:' + v[i][2] + ';base64,' + v[i].slice(4).join('');
  }
  return { ok: true, images: out };
}

function agencyImgHeaders_() {
  var h = ['img_id', 'slug', 'mime', 'created_at'];
  for (var i = 1; i <= AG.IMG_PARTS; i++) h.push('part_' + i);
  return h;
}

/* ───────── writes ───────── */

function cleanTitle_(src, prev) {
  var t = prev ? JSON.parse(JSON.stringify(prev)) : {};
  AG.TITLE_FIELDS.forEach(function (f) {
    if (src[f] === undefined) return;
    var v = src[f];
    if (f === 'confirmed' || f === 'in_guide' || f === 'highlight' || f === 'cover_auto' || f === 'show_optioned_to') { t[f] = v === true || v === 'true'; return; }
    if (f === 'praise') { t[f] = (Array.isArray(v) ? v : []).slice(0, 8).map(function (q) { return { quote: String(q.quote || '').slice(0, 600), by: String(q.by || '').slice(0, 120) }; }).filter(function (q) { return q.quote; }); return; }
    v = String(v == null ? '' : v).slice(0, f === 'pitch' || f === 'bio' ? 2500 : 600);
    if (f === 'status' && AG.STATUSES.indexOf(v) < 0) v = 'check';
    t[f] = v;
  });
  delete t._row; delete t.id; delete t.updated_at;
  return t;
}

function agencySave_(b) {
  var a = agencyAuth_(b.slug, b.k);
  if (!a) return { ok: false, error: 'forbidden' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var now = new Date(), changed = 0, added = [];
    if (b.agency && typeof b.agency === 'object') {
      AG.AGENCY_FIELDS.forEach(function (f) {
        if (b.agency[f] === undefined) return;
        var v = b.agency[f];
        if (f === 'fairs') v = (Array.isArray(v) ? v : []).slice(0, 12).map(function (x) {
          return { fair: String(x.fair || '').slice(0, 80), dates: String(x.dates || '').slice(0, 60), where: String(x.where || '').slice(0, 120), who: String(x.who || '').slice(0, 200) };
        });
        else if (f === 'authors_to_add' || f === 'sections') v = Array.isArray(v) ? v.slice(0, 300) : [];
        else v = String(v == null ? '' : v).slice(0, f === 'intro' ? 2000 : 400);
        a.data[f] = v;
      });
      var vis = String(b.agency.visibility || '');
      if (vis === 'password' && !b.agency.password && !a.pw_hash) return { ok: false, error: 'password_needed', message: 'Please choose a password first.' };
      if (['private', 'public', 'password', 'off'].indexOf(vis) >= 0) a.sh.getRange(a.row, 4).setValue(vis);
      if (b.agency.password) a.sh.getRange(a.row, 5).setValue(pwHash_(a.slug, String(b.agency.password).slice(0, 100)));
      a.sh.getRange(a.row, 6).setValue(JSON.stringify(a.data));
      if (b.agency.name) a.sh.getRange(a.row, 2).setValue(String(b.agency.name).slice(0, 120));
      changed++;
    }
    var sh = agencySheet_(AG.TITLES, AG.TITLE_HEADERS);
    var existing = agencyTitles_(a.slug), byId = {}, byKey = {};
    existing.forEach(function (t) { byId[t.id] = t; byKey[(String(t.title) + '|' + String(t.author)).toLowerCase()] = t; });
    if (b.confirm_all === true) {
      existing.forEach(function (t) {
        if (t.confirmed) return;
        t.confirmed = true;
        sh.getRange(t._row, 3, 1, 3).setValues([[JSON.stringify(cleanTitle_({}, t)), now, 'agency']]);
        changed++;
      });
    }
    (Array.isArray(b.titles) ? b.titles : []).slice(0, 500).forEach(function (src) {
      var id = String(src.id || '');
      // A title added twice before the first save came back (autosave race) updates the first copy.
      var prev = byId[id] || (!id || /^tmp/.test(id) ? byKey[(String(src.title || '') + '|' + String(src.author || '')).toLowerCase()] : null);
      if (prev) {
        var t = cleanTitle_(src, prev);
        if (src.pitch !== undefined && String(src.pitch) !== String(prev.pitch || '')) t.pitch_src = 'agency';
        sh.getRange(prev._row, 3, 1, 3).setValues([[JSON.stringify(t), now, 'agency']]);
      } else {
        if (!String(src.title || '').trim()) return;
        id = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
        var nt = cleanTitle_(src, { status: 'available', in_guide: true, confirmed: true, added_by: 'agency' });
        if (nt.pitch) nt.pitch_src = 'agency';
        nt.added_at = now.toISOString();
        sh.appendRow([a.slug, id, JSON.stringify(nt), now, 'agency', false]);
        added.push({ id: id, title: nt.title });
      }
      changed++;
    });
    (Array.isArray(b.deletes) ? b.deletes : []).forEach(function (id) {
      var t = byId[String(id)];
      if (t) { sh.getRange(t._row, 6).setValue(true); changed++; }
    });
    a.sh.getRange(a.row, 8, 1, 2).setValues([[now, now]]);
    agencyLog_(a.slug, 'agency', 'save: ' + changed + ' change(s)' + (added.length ? ', added ' + added.map(function (x) { return x.title; }).join('; ') : ''));
    agencyNotifyTara_(a, changed, added, b.confirm_all === true);
    return { ok: true, changed: changed, added: added, saved_at: now.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

/* One alert per agency per hour, so autosave does not flood Tara's inbox. */
function agencyNotifyTara_(a, changed, added, confirmAll) {
  try {
    var props = PropertiesService.getScriptProperties(), key = 'AG_ALERT_' + a.slug;
    var last = Number(props.getProperty(key) || 0);
    if (!confirmAll && !added.length && Date.now() - last < 60 * 60 * 1000) return;
    props.setProperty(key, String(Date.now()));
    alertTara_('[Agency page] ' + (a.data.name || a.name) + (confirmAll ? ' confirmed their whole list' : ' updated their page'),
      (a.data.name || a.name) + ' saved ' + changed + ' change(s)' + (added.length ? ', and added: ' + added.map(function (x) { return x.title; }).join('; ') : '') +
      '.\n\nTheir page: ' + agencyEditUrl_(a.slug, a.token));
  } catch (e) { log_('error', 'agency alert: ' + e); }
}

function agencyUpload_(b) {
  var a = agencyAuth_(b.slug, b.k);
  if (!a) return { ok: false, error: 'forbidden' };
  var m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/=]+)$/.exec(String(b.data || ''));
  if (!m) return { ok: false, error: 'bad_image', message: 'Please choose a JPG or PNG image.' };
  var CHUNK = 45000, b64 = m[2];
  if (b64.length > CHUNK * AG.IMG_PARTS) return { ok: false, error: 'too_big', message: 'That image is too large. Please try a smaller one.' };
  var parts = [];
  for (var i = 0; i < AG.IMG_PARTS; i++) parts.push(b64.slice(i * CHUNK, (i + 1) * CHUNK));
  var id = 'img' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  agencySheet_(AG.IMAGES, agencyImgHeaders_()).appendRow([id, a.slug, m[1], new Date()].concat(parts));
  return { ok: true, ref: 'img:' + id };
}

function agencySeed_(seed, replace) {
  var ag = seed.agency || {}, slug = String(ag.slug || '').toLowerCase();
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return { ok: false, error: 'bad_slug' };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = agencySheet_(AG.PAGES, AG.PAGE_HEADERS);
    var a = agencyRow_(slug), token, now = new Date();
    var data = {};
    AG.AGENCY_FIELDS.forEach(function (f) { if (ag[f] !== undefined) data[f] = ag[f]; });
    if (a) {
      if (!replace) return { ok: false, error: 'exists', message: 'Agency exists; pass replace:true to overwrite its titles.' };
      token = a.token;
      sh.getRange(a.row, 2, 1, 5).setValues([[ag.name || a.name, token, a.visibility, a.pw_hash, JSON.stringify(data)]]);
      sh.getRange(a.row, 8).setValue(now);
      var tsh = agencySheet_(AG.TITLES, AG.TITLE_HEADERS);
      agencyTitles_(slug).forEach(function (t) { tsh.getRange(t._row, 6).setValue(true); });
    } else {
      token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
      sh.appendRow([slug, ag.name || slug, token, 'private', '', JSON.stringify(data), now, now, '', '']);
    }
    var rows = (seed.titles || []).map(function (src) {
      var id = String(src.id || Utilities.getUuid().replace(/-/g, '').slice(0, 8));
      return [slug, id, JSON.stringify(cleanTitle_(src, {})), now, 'ariel', false];
    });
    if (rows.length) {
      var tsh2 = agencySheet_(AG.TITLES, AG.TITLE_HEADERS);
      tsh2.getRange(tsh2.getLastRow() + 1, 1, rows.length, AG.TITLE_HEADERS.length).setValues(rows);
    }
    agencyLog_(slug, 'ariel', 'seeded ' + rows.length + ' titles');
    return { ok: true, slug: slug, titles: rows.length, edit_url: agencyEditUrl_(slug, token), public_url: AG.SITE + slug + '/' };
  } finally {
    lock.releaseLock();
  }
}

/* ───────── enquiries (introductions) ───────── */

function agencyEnquire_(b) {
  if (b.website) return { ok: true };  // honeypot
  var email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return { ok: false, error: 'invalid_email', message: 'Please check your email address.' };
  var name = String(b.name || '').trim().slice(0, 80);
  if (!name) return { ok: false, error: 'name', message: 'Please add your name.' };
  var company = String(b.company || '').trim().slice(0, 120);
  var role = String(b.role || '').trim().slice(0, 80);
  var message = String(b.message || '').trim().slice(0, 1500);
  var via = ['web', 'pdf', 'qr', 'catalogue'].indexOf(String(b.via)) >= 0 ? String(b.via) : 'web';
  var info = agencyTitle_(b.slug, b.id);
  if (!info.ok) return { ok: false, error: 'not_found', message: 'Sorry, we could not find that title.' };
  var a = agencyRow_(b.slug), t = info.title;

  // Throttle: one enquiry per person per title per day.
  var esh = agencySheet_(AG.ENQ, AG.ENQ_HEADERS), last = esh.getLastRow();
  if (last > 1) {
    var recent = esh.getRange(Math.max(2, last - 300), 1, Math.min(300, last - 1), 7).getValues();
    for (var i = 0; i < recent.length; i++) {
      if (String(recent[i][1]) === a.slug && String(recent[i][2]) === t.id && String(recent[i][6]).toLowerCase() === email &&
          Date.now() - new Date(recent[i][0]).getTime() < 24 * 3600 * 1000) return { ok: true, status: 'already' };
    }
  }
  var to = String(a.data.contact_email || '').trim();
  var status = 'sent';
  if (!to) { to = CONFIG.ALERT_TO; status = 'no_contact_sent_to_tara'; }
  var contactFirst = String(a.data.contact_name || '').split(' ')[0] || 'there';
  var who = esc_(name) + (role ? ', ' + esc_(role) : '') + (company ? ' at ' + esc_(company) : '');
  var body =
    'Dear ' + esc_(contactFirst) + ',<br><br>' +
    'I’d like to introduce ' + who + ', who has asked about the screen rights to <b>' + esc_(t.title) + '</b> by ' + esc_(t.author) +
    ' from your ' + (via === 'qr' || via === 'pdf' ? 'rights guide' : 'rights list on The Ariel') + '.' +
    (message ? '<br><br>In ' + esc_(name.split(' ')[0]) + '’s words:<br><i>“' + esc_(message).replace(/\n/g, '<br>') + '”</i>' : '') +
    '<br><br>' + esc_(name.split(' ')[0]) + ' is copied in, so you can reply to them directly. The Ariel steps out from here: we never see manuscripts or take part in negotiations.' +
    '<br><br>Best wishes,<br>Tara Button<br>The Ariel';
  var subj = 'Screen rights enquiry: ' + t.title + ' by ' + t.author;
  var opts = { htmlBody: agencyEmailHtml_(subj, body), name: 'Tara Button, The Ariel', replyTo: email, cc: email };
  if (a.data.cc_email && status === 'sent') opts.cc = email + ',' + a.data.cc_email;
  opts.bcc = CONFIG.ALERT_TO;
  if (aliasOk_()) opts.from = CONFIG.FROM_ALIAS;
  GmailApp.sendEmail(to, subj, body.replace(/<br>/g, '\n').replace(/<[^>]+>/g, ''), opts);
  esh.appendRow([new Date(), a.slug, t.id, t.title, t.author, name, email, company, role, message, via, status]);
  agencyLog_(a.slug, email, 'enquiry ' + t.title + ' via ' + via);
  return { ok: true, status: 'sent', contact_name: a.data.contact_name || '', agency: a.data.name || a.name };
}

function agencyEmailHtml_(heading, bodyHtml) {
  return '<!doctype html><html lang="en"><body style="margin:0;background:' + C.ivory + ';" bgcolor="' + C.ivory + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' + C.ivory + '"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">' +
    '<tr><td bgcolor="' + C.ink + '" style="background-color:' + C.ink + ';padding:20px 28px;">' +
    '<div style="font-family:' + SANS + ';font-size:12px;font-weight:bold;letter-spacing:0.14em;text-transform:uppercase;color:#E2C891;">The Ariel &middot; Introduction</div>' +
    '<div style="font-family:' + SERIF + ';font-size:26px;line-height:1.2;color:#FFFFFF;margin-top:8px;">' + esc_(heading) + '</div></td></tr>' +
    '<tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:24px 28px;font-family:' + SANS + ';font-size:16px;line-height:1.6;color:' + C.body + ';">' + bodyHtml + '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

/* ───────── the agency's own data ───────── */

function agencyEnquiriesFor_(slug) {
  var sh = agencySheet_(AG.ENQ, AG.ENQ_HEADERS), last = sh.getLastRow(), out = [];
  if (last < 2) return out;
  var v = sh.getRange(2, 1, last - 1, AG.ENQ_HEADERS.length).getValues();
  for (var i = v.length - 1; i >= 0 && out.length < 200; i--) {
    if (String(v[i][1]) !== slug) continue;
    out.push({ time: v[i][0] ? new Date(v[i][0]).toISOString() : '', title_id: v[i][2], title: v[i][3], author: v[i][4], name: v[i][5],
      email: v[i][6], company: v[i][7], role: v[i][8], message: v[i][9], via: v[i][10] });
  }
  return out;
}

/* "Remove what I've added": everything the agency told us that is not public. The public record of their list
   (titles, authors, statuses from their own website) stays (Tara, 10 Nov 2026). */
function agencyClear_(b) {
  var a = agencyAuth_(b.slug, b.k);
  if (!a) return { ok: false, error: 'forbidden' };
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = agencySheet_(AG.TITLES, AG.TITLE_HEADERS), now = new Date(), removed = 0, cleared = 0;
    agencyTitles_(a.slug).forEach(function (t) {
      if (t.added_by === 'agency') { sh.getRange(t._row, 6).setValue(true); removed++; return; }
      var row = t._row;
      ['agent_note', 'option_lapse', 'optioned_to', 'show_optioned_to'].forEach(function (f) { delete t[f]; });
      if (t.pitch_src === 'agency') { t.pitch = ''; delete t.pitch_src; }
      if (/^img:/.test(t.cover || '')) t.cover = '';
      sh.getRange(row, 3, 1, 3).setValues([[JSON.stringify(cleanTitle_({}, t)), now, 'agency-clear']]);
      cleared++;
    });
    var ish = agencySheet_(AG.IMAGES, agencyImgHeaders_()), last = ish.getLastRow();
    for (var r = last; r >= 2; r--) if (String(ish.getRange(r, 2).getValue()) === a.slug) ish.deleteRow(r);
    ['contact_name', 'contact_role', 'contact_email', 'cc_email', 'logo', 'cover_image', 'intro', 'fairs'].forEach(function (f) { delete a.data[f]; });
    a.sh.getRange(a.row, 4, 1, 3).setValues([['private', '', JSON.stringify(a.data)]]);
    agencyLog_(a.slug, 'agency', 'cleared their additions: removed ' + removed + ' titles, cleared ' + cleared);
    alertTara_('[Agency page] ' + (a.data.name || a.name) + ' removed what they had added',
      'They used "Remove what I’ve added": ' + removed + ' added titles removed, private details cleared, page set to private. The public record of their list remains.');
    return { ok: true, removed: removed };
  } finally {
    lock.releaseLock();
  }
}
