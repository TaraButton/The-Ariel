/* British Review of Reviews - sign-up forms + homepage pop-up (The Ariel).
   Built from _tools/brr/signup.template.js by build_site.py; do not edit reviews/signup.js by hand. */
(function () {
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbz2LY8eW--gMExOT-SkEgxytey5bBdULHkRTsjokCtukJJqQViFYG4PmiUPZQx0ENCqAw/exec';
  var KEY_DISMISS = 'brr_dismissed_at', KEY_SUB = 'brr_subscribed';

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  function wire(form) {
    if (form.dataset.wired) return;
    form.dataset.wired = '1';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = form.querySelector('.brr-status');
      var btn = form.querySelector('.brr-submit');
      var email = (form.querySelector('[name=email]').value || '').trim();
      status.className = 'brr-status';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        status.textContent = 'Please enter a valid email address.';
        status.classList.add('error');
        return;
      }
      var subjects = [].slice.call(form.querySelectorAll('[name=subjects]:checked')).map(function (i) { return i.value; });
      var roleEl = form.querySelector('[name=role]');
      var payload = {
        action: 'subscribe', email: email, role: roleEl ? roleEl.value : '', subjects: subjects,
        source: form.dataset.source || 'site', website: (form.querySelector('[name=website]') || {}).value || ''
      };
      btn.disabled = true;
      status.textContent = 'Signing you up...';
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          btn.disabled = false;
          if (res && res.ok) {
            store(KEY_SUB, '1');
            status.classList.add('success');
            status.textContent = res.status === 'already'
              ? 'You’re already subscribed. The next edition arrives on Monday.'
              : 'Nearly there. Check your inbox and click the link to confirm.';
            form.querySelector('[name=email]').value = '';
          } else {
            status.classList.add('error');
            status.textContent = (res && res.message) || 'That didn’t work. Please check your email address and try again.';
          }
        })
        .catch(function () {
          btn.disabled = false;
          status.classList.add('error');
          status.textContent = 'We couldn’t reach the sign-up service just now. Please try again in a minute, or email hello@theariel.tv.';
        });
    });
  }

  document.querySelectorAll('.brr-form').forEach(wire);

  // Homepage pop-up: once per visitor every 30 days, never for subscribers, after 25s or half the page.
  var pop = document.getElementById('modal-brr');
  if (!pop) return;
  var last = Number(store(KEY_DISMISS) || 0);
  if (store(KEY_SUB) || (last && Date.now() - last < 30 * 86400000)) return;
  var shown = false;
  function show() {
    if (shown || document.querySelector('.modal-overlay.open')) return;
    var panel = document.getElementById('review-of-reviews');
    if (panel) {
      var r = panel.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) return;  // the sign-up panel is already on screen
    }
    shown = true;
    pop.classList.add('open');
    document.body.style.overflow = 'hidden';
    store(KEY_DISMISS, String(Date.now()));
    window.removeEventListener('scroll', onScroll);
    var first = pop.querySelector('input[type=email]');
    if (first) setTimeout(function () { first.focus(); }, 60);
  }
  var settle;
  function onScroll() {
    // wait until scrolling stops (anchor links scroll smoothly) before deciding
    clearTimeout(settle);
    settle = setTimeout(function () {
      var h = document.documentElement;
      if ((h.scrollTop + window.innerHeight) / h.scrollHeight > 0.5) show();
    }, 600);
  }
  setTimeout(show, 25000);
  window.addEventListener('scroll', onScroll, { passive: true });
})();
