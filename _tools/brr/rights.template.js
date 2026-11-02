/* London Review of Reviews - Check Rights button, upsell, click tracking (The Ariel).
   Built from _tools/brr/rights.template.js by build_site.py; do not edit reviews/rights.js by hand. */
(function () {
  var ENDPOINT = '__BRR_ENDPOINT__';
  var PASS_URL = '__BRR_PASS_URL__';
  var EDITION = document.body.getAttribute('data-edition') || '';
  var params = new URLSearchParams(location.search);
  var TOKEN = params.get('t') || '';
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  function beacon(o) {
    o.edition_id = EDITION; if (TOKEN) o.t = TOKEN;
    var body = JSON.stringify(Object.assign({ action: 'click' }, o));
    try { if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return; } catch (e) {}
    try { fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' } }); } catch (e) {}
  }

  // Review-link clicks
  document.querySelectorAll('.book .revs a[data-pub]').forEach(function (a) {
    a.addEventListener('click', function () {
      var li = a.closest('.book');
      beacon({ book_id: li.id.replace(/^b-/, ''), kind: 'review', where: 'page', pub: a.dataset.pub });
    });
  });

  var modal = document.getElementById('modal-rights');
  if (!modal) return;
  var panes = modal.querySelectorAll('[data-pane]');
  var form = modal.querySelector('form');
  var current = null, lastFocus = null;

  function pane(name) {
    panes.forEach(function (p) { p.hidden = p.dataset.pane !== name; });
    var h = modal.querySelector('[data-pane="' + name + '"] h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus(); }
  }
  function open(li) {
    current = { id: li.id.replace(/^b-/, ''), book: li.dataset.book, author: li.dataset.author || '' };
    modal.querySelectorAll('[data-fill=book]').forEach(function (el) { el.textContent = current.book; });
    lastFocus = document.activeElement;
    modal.hidden = false; document.body.style.overflow = 'hidden';
    pane('form');
    var em = form.querySelector('[name=email]');
    if (!em.value && store('brr_email')) em.value = store('brr_email');
    setTimeout(function () { (em.value ? form.querySelector('[name=name]') : em).focus(); }, 30);
    beacon({ book_id: current.id, kind: 'check_rights_open', where: TOKEN ? 'email' : 'page' });
  }
  function close() {
    modal.hidden = true; document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  modal.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', close); });
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) close(); });

  document.querySelectorAll('.check-rights').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var li = btn.dataset.checkTarget ? document.getElementById(btn.dataset.checkTarget) : btn.closest('.book');
      if (li) open(li);
    });
  });

  function submit(want) {
    var status = form.querySelector('.rights-status');
    var email = (form.querySelector('[name=email]').value || '').trim();
    status.className = 'rights-status';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { status.textContent = 'Please enter a valid email address.'; status.classList.add('error'); form.querySelector('[name=email]').focus(); return; }
    var roleSel = form.querySelector('[name=role]');
    if (!roleSel.value) { status.textContent = 'Please tell us what you do.'; status.classList.add('error'); roleSel.focus(); return; }
    store('brr_email', email);
    var payload = {
      action: 'check_rights', book_id: current.id, book: current.book, author: current.author, email: email,
      name: form.querySelector('[name=name]').value, company: form.querySelector('[name=company]').value,
      role: form.querySelector('[name=role]').value, website: form.querySelector('[name=website]').value,
      source: TOKEN ? 'email' : 'page', edition_id: EDITION, t: TOKEN, want: want || ''
    };
    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true; status.textContent = 'Sending...';
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        btn.disabled = false; status.textContent = '';
        if (!res || !res.ok) { status.textContent = (res && res.message) || 'That didn’t work. Please try again.'; status.classList.add('error'); return; }
        if (res.outcome === 'upsell') {
          var pass = modal.querySelector('[data-pass]');
          if (res.pass_url || PASS_URL) { pass.href = res.pass_url || PASS_URL; pass.dataset.mode = 'link'; }
          pane('upsell');
        } else if (res.outcome === 'pass_interest') { pane('pass'); }
        else if (res.outcome === 'answered') { pane('answered'); }
        else { pane('done'); }
      })
      .catch(function () { btn.disabled = false; status.textContent = 'We couldn’t reach the service just now. Please try again in a minute.'; status.classList.add('error'); });
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
  modal.querySelector('[data-pass]').addEventListener('click', function (e) {
    if (this.dataset.mode === 'link') { beacon({ book_id: current.id, kind: 'pass_click', where: 'page' }); return; }
    e.preventDefault(); pane('form'); submit('pass');
  });

  // Rights already confirmed (agent said yes and agreed to show it)
  fetch(ENDPOINT + '?action=rights_status').then(function (r) { return r.json(); }).then(function (res) {
    if (!res || !res.books) return;
    Object.keys(res.books).forEach(function (id) {
      var li = document.getElementById('b-' + id);
      if (!li) return;
      document.querySelectorAll('#b-' + id + ' .check-rights, [data-check-target="b-' + id + '"]').forEach(function (b) {
        b.classList.add('available');
        b.textContent = 'Rights available: ask for an introduction';
      });
    });
  }).catch(function () {});

  // Arriving from an email "Check rights" link
  var want = params.get('check');
  if (want) {
    var li = document.getElementById('b-' + want);
    if (li) { li.scrollIntoView({ block: 'center' }); open(li); }
  }
})();
