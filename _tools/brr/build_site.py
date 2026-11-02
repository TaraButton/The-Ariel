#!/usr/bin/env python3
"""London Review of Reviews - static site builder (The Ariel).

Reads every edition JSON in reviews/editions/ (YYYY-MM-DD.json) and writes:
  reviews/index.html          latest edition + sign-up + archive
  reviews/YYYY-MM-DD.html     one page per edition
  reviews/editions/latest.json  copy of the newest edition (the newsletter backend pulls this)
and adds the pages to sitemap.xml.

Usage (from the repo root): python3 _tools/brr/build_site.py
Lives under _tools/ so GitHub Pages (Jekyll) never publishes it.
"""
import html, json, os, re, sys
from datetime import date

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CFG = json.load(open(os.path.join(os.path.dirname(__file__), "config.json")))
ED_DIR = os.path.join(ROOT, "reviews", "editions")
OUT_DIR = os.path.join(ROOT, "reviews")

SUBJECTS = ["True crime", "Espionage", "Politics & world affairs", "Business & power",
            "Biography & memoir", "History", "Society & ideas", "Nature & place",
            "Arts & culture", "Books & writing", "Life & leisure"]
ROLES = ["Producer", "Development executive", "Commissioner", "Agent or publisher", "Writer", "Other"]
E = lambda s: html.escape(str(s or ""), quote=True)
slug = lambda s: re.sub(r"[^a-z]+", "-", s.lower()).strip("-")


def load_editions():
    eds = []
    for f in sorted(os.listdir(ED_DIR)):
        if re.match(r"^\d{4}-\d{2}-\d{2}\.json$", f):
            eds.append(json.load(open(os.path.join(ED_DIR, f))))
    if not eds:
        sys.exit("no editions in reviews/editions/")
    return eds


def check(ed):
    probs = []
    for i, b in enumerate(ed["books"]):
        if b.get("subject") not in SUBJECTS:
            probs.append(f"{i}: bad subject {b.get('subject')}")
        if not b.get("reviews") or not all(r["url"].startswith("https://") for r in b["reviews"]):
            probs.append(f"{i}: bad review links")
        if "—" in json.dumps(b, ensure_ascii=False):
            probs.append(f"{i}: em dash")
    if probs:
        sys.exit("edition %s failed checks:\n%s" % (ed["edition_id"], "\n".join(probs)))


def signup_form(fid, source):
    chips = "".join(
        f'<label class="brr-chip"><input type="checkbox" name="subjects" value="{E(s)}"><span>{E(s)}</span></label>'
        for s in SUBJECTS)
    roles = "".join(f'<option value="{E(r)}">{E(r)}</option>' for r in ROLES)
    return f'''<form class="brr-form" id="{fid}" data-source="{E(source)}" novalidate>
  <div class="brr-row">
    <div><label for="{fid}-email">Email <span class="req">*</span></label><input type="email" id="{fid}-email" name="email" required autocomplete="email" placeholder="you@company.com"></div>
    <div><label for="{fid}-role">What do you do?</label><select id="{fid}-role" name="role"><option value="">Choose (optional)</option>{roles}</select></div>
  </div>
  <fieldset class="brr-subjects"><legend>What do you develop? <span class="hint">Optional. We put the books with screen potential in these subjects at the top of your email.</span></legend>{chips}</fieldset>
  <input type="text" name="website" class="brr-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
  <button type="submit" class="brr-submit">Sign up free</button>
  <p class="brr-status" role="status" aria-live="polite"></p>
  <p class="brr-small">Free, no card, no catch. One email every Monday. Unsubscribe in one click. We use your email only to send the Review.</p>
</form>'''


CSS = r"""
:root{--ink:#1B1F3B;--logo-navy:#001733;--ivory:#F8F5F0;--paper:#FFFFFF;--gold:#B8965A;--gold-light:#E2C891;--gold-deep:#6E5428;--burgundy:#8A2F3A;--text:#1E2233;--muted:#454D60;--line:#CFC9BE;--tint:#F4ECDD;--ok:#245C36}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:'Lato',-apple-system,'Segoe UI',sans-serif;color:var(--text);background:var(--ivory);font-weight:400;line-height:1.6;font-size:18px;-webkit-font-smoothing:antialiased}
a{color:var(--gold-deep);text-underline-offset:2px}
a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.skip{position:absolute;left:-9999px;top:0;background:var(--gold);color:var(--ink);padding:10px 16px;font-weight:700;z-index:10}
.skip:focus{left:16px;top:16px}
.bar{background:var(--ink);padding-block:14px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.bar-in{max-width:1120px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.bar a{color:#FFFFFF;text-decoration:none;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:600;letter-spacing:.04em}
.bar .bar-cta{font-family:'Lato',sans-serif;font-size:14px;font-weight:700;letter-spacing:.06em;color:var(--gold-light)}
.hero{background:var(--ink);color:#FFFFFF;padding-block:44px 56px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.hero-in{max-width:1120px;margin:0 auto;display:grid;grid-template-columns:1.05fr .95fr;grid-template-areas:"intro form" "example form";column-gap:44px;row-gap:0;align-items:start}
.hero-intro{grid-area:intro}.hero-form{grid-area:form}.hero-example{grid-area:example}
.hero-in>*{min-width:0}
.free{display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap}
.free-badge{display:inline-block;background:var(--gold);color:var(--ink);font-weight:900;font-size:15px;letter-spacing:.14em;text-transform:uppercase;padding:6px 14px;border-radius:3px}
.free-when{font-size:16px;font-weight:700;color:var(--gold-light);letter-spacing:.04em}
h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:clamp(2.7rem,7vw,4.6rem);line-height:1;margin:.9rem 0 1rem;text-wrap:balance;color:#FFFFFF}
h1 em{font-style:italic;font-weight:500}
.dek{color:#E6E9F1;font-size:20px;line-height:1.55;max-width:34rem;margin:0 0 22px}
.promises{list-style:none;margin:0 0 26px;padding:0;display:grid;gap:8px;font-size:17px;color:#FFFFFF}
.promises li{display:flex;gap:10px;align-items:baseline}
.promises li::before{content:"\2713";color:var(--gold-light);font-weight:900}
.example{background:#FFFFFF;color:var(--text);border-radius:4px;padding:18px 20px;box-shadow:0 10px 30px rgba(0,0,0,.25)}
.example-label{font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-deep);margin:0 0 8px}
.example .ex-title{margin:0;font-size:19px;font-weight:700;color:var(--ink)}
.example .why{display:block}
.example .line{font-size:17px}
.brr-card{background:var(--paper);color:var(--text);padding:26px;border-radius:4px}
.brr-card h2{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:30px;line-height:1.1;margin:0 0 6px;color:var(--ink)}
.brr-card .card-sub{margin:0 0 16px;font-size:16px;color:var(--muted)}
.brr-form{display:flex;flex-direction:column;gap:14px}
.brr-form label,.brr-form legend{display:block;font-size:15px;font-weight:700;color:var(--ink);margin-bottom:6px}
.brr-form .req{color:var(--burgundy)}
.brr-form input[type=email],.brr-form select{width:100%;min-height:48px;padding:10px 12px;border:2px solid #9AA0AE;background:#FFFFFF;font-family:'Lato',sans-serif;font-size:17px;color:var(--text);border-radius:3px}
.brr-form input[type=email]:focus,.brr-form select:focus{border-color:var(--ink)}
.brr-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.brr-row>*{min-width:0}
.brr-subjects{border:0;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}
.brr-subjects legend{margin-bottom:8px;padding:0}
.brr-subjects .hint{display:block;font-weight:400;color:var(--muted);font-size:15px;margin-top:2px}
.brr-chip{position:relative;margin:0!important;font-weight:400!important;font-size:16px!important;cursor:pointer}
.brr-chip input{position:absolute;opacity:0;width:1px;height:1px}
.brr-chip span{display:inline-block;border:2px solid #9AA0AE;background:#FFFFFF;border-radius:999px;padding:7px 14px;color:var(--text);min-height:40px}
.brr-chip input:checked+span{background:var(--ink);border-color:var(--ink);color:#FFFFFF}
.brr-chip input:checked+span::before{content:"\2713  ";font-weight:900}
.brr-chip input:focus-visible+span{outline:3px solid var(--gold);outline-offset:2px}
.brr-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.brr-submit{min-height:52px;padding:14px 24px;background:var(--gold);color:var(--ink);border:0;border-radius:3px;font-family:'Lato',sans-serif;font-size:17px;font-weight:900;letter-spacing:.04em;cursor:pointer}
.brr-submit:hover{background:var(--gold-light)} .brr-submit:disabled{opacity:.6;cursor:progress}
.brr-status{margin:0;font-size:16px;font-weight:700;min-height:1px}
.brr-status:empty{display:none}
.brr-status.error{color:var(--burgundy)} .brr-status.success{color:var(--ok)}
.brr-small{margin:0;font-size:15px;color:var(--muted)}
main{display:block;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.wrap{max-width:800px;margin:0 auto;padding-block:40px 72px}
.edition-head h2{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:36px;line-height:1.1;color:var(--ink);margin:0 0 6px}
.meta{font-size:17px;color:var(--muted);margin:0 0 20px}
.controls{display:grid;gap:12px;padding:18px;background:#FFFFFF;border:1px solid var(--line);border-radius:4px;margin-bottom:8px}
.crow{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.crow .lbl{font-size:15px;font-weight:700;color:var(--ink);width:100%}
.tog{font:inherit;font-size:16px;border:2px solid #9AA0AE;background:#FFFFFF;color:var(--text);border-radius:999px;padding:6px 14px;cursor:pointer;min-height:40px}
.tog.on{background:var(--ink);color:#FFFFFF;border-color:var(--ink)}
.tog.on::before{content:"\2713  ";font-weight:900}
.gnav a{font-size:16px;color:var(--gold-deep);margin-right:12px;line-height:2}
.pickinfo{font-size:16px;color:var(--muted);margin:0}
.subject{margin-top:40px}
.subject>header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid var(--ink);padding-bottom:6px}
.subject h2{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:600;font-size:34px;margin:0;color:var(--ink)}
.n{font-size:15px;color:var(--muted);font-variant-numeric:tabular-nums}
ol{list-style:none;margin:0;padding:0}
.book{padding-block:18px;border-bottom:1px solid var(--line)}
.book h3{margin:0;font-size:20px;line-height:1.3;font-weight:700;color:var(--ink)}
.au{font-size:17px;font-weight:400;color:var(--muted)}
.line{margin:6px 0 0;font-size:18px}
.why{display:none;margin:10px 0 0;padding:10px 14px;background:var(--tint);border-left:4px solid var(--gold);font-size:17px}
.why b{display:block;font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold-deep);margin-bottom:2px}
.star{color:#9A7631}
.book.picked .why{display:block}
.book.picked{background:var(--tint);padding-inline:14px;margin-inline:-14px;border-radius:4px}
.revs{margin:8px 0 0;font-size:16px;color:var(--muted)}
.multi{color:var(--gold-deep);font-weight:700;margin-left:6px}
.cta{background:var(--ink);color:#FFFFFF;padding:32px;border-radius:4px;margin-top:48px}
.cta h2{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:34px;line-height:1.1;margin:0 0 10px}
.cta p{color:#E6E9F1;margin:0 0 20px;max-width:36rem;font-size:18px}
.cta a{display:inline-block;background:var(--gold);color:var(--ink);text-decoration:none;padding:14px 22px;font-size:16px;font-weight:900;border-radius:3px}
.inline-signup{margin-top:48px;border:2px solid var(--ink)}
.archive{margin-top:44px}
.archive h2{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:28px;color:var(--ink);margin:0 0 8px}
.archive ul{padding-left:20px} .archive li{padding:4px 0}
.ex-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}
.ex-read{display:inline-flex;align-items:center;min-height:44px;padding:7px 14px;border:2px solid var(--line);border-radius:3px;font-weight:700;color:var(--ink);text-decoration:none}
.book-foot{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px 16px;margin-top:8px}
.book-foot .revs{margin:0}
.check-rights{font:inherit;font-size:16px;font-weight:700;color:var(--ink);background:#FFFFFF;border:2px solid var(--ink);border-radius:3px;padding:7px 14px;min-height:44px;cursor:pointer}
.check-rights:hover{background:var(--ink);color:#FFFFFF}
.check-rights.available{background:var(--ok);border-color:var(--ok);color:#FFFFFF}
.rights-modal{position:fixed;inset:0;background:rgba(0,23,51,.6);z-index:50;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px max(16px,env(safe-area-inset-left,0px))}
.rights-modal[hidden]{display:none}
.rights-box{position:relative;background:#FFFFFF;max-width:600px;width:100%;margin:auto;border-radius:4px;padding:30px 28px;box-shadow:0 12px 48px rgba(0,0,0,.3)}
.rights-box h2{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:32px;line-height:1.1;color:var(--ink);margin:0 0 8px}
.rights-box h2:focus{outline:none}
.rights-box p{margin:0 0 12px}
.rights-book{font-weight:700;font-size:19px;color:var(--ink)}
.rights-free{background:var(--tint);border-left:4px solid var(--gold);padding:8px 12px}
.rights-close{position:absolute;top:8px;right:10px;font-size:30px;line-height:1;background:none;border:0;color:var(--muted);cursor:pointer;padding:6px 10px}
.rights-box form{display:flex;flex-direction:column;gap:12px}
.rights-box label{display:block;font-size:15px;font-weight:700;color:var(--ink);margin-bottom:6px}
.rights-box input[type=email],.rights-box input[type=text],.rights-box select{width:100%;min-height:48px;padding:10px 12px;border:2px solid #9AA0AE;background:#FFFFFF;font:inherit;font-size:17px;color:var(--text);border-radius:3px}
.rights-status{font-weight:700;margin:0}.rights-status:empty{display:none}.rights-status.error{color:var(--burgundy)}
.upsell-opt{border:2px solid var(--line);border-radius:4px;padding:16px 18px;margin-top:14px}
.upsell-opt.best{border-color:var(--gold);background:var(--tint)}
.upsell-opt h3{margin:0 0 6px;font-size:20px;color:var(--ink)}
.upsell-opt ul{margin:0 0 14px;padding-left:20px}
.upsell-tag{display:inline-block;background:var(--gold);color:var(--ink);font-size:13px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;padding:3px 10px;border-radius:3px;margin:0 0 8px!important}
.as-link{display:inline-block;text-decoration:none;text-align:center}
.brr-ghost{display:inline-block;min-height:48px;padding:12px 20px;border:2px solid var(--ink);color:var(--ink);font-weight:900;text-decoration:none;border-radius:3px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.note{margin-top:28px;font-size:16px;color:var(--muted)}
footer{background:var(--ink);color:#E6E9F1;text-align:center;padding:28px 16px;font-size:16px}
footer a{color:var(--gold-light)}
@media (max-width:860px){.hero-in{grid-template-columns:1fr;grid-template-areas:"intro" "form" "example";row-gap:24px}.brr-row{grid-template-columns:1fr}.hero{padding-block:32px 40px}.dek{font-size:19px}.controls{padding:14px}.cta{padding:24px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
"""

FILTER_JS = r"""
(function(){
  var picks=[], paper='all';
  function apply(){
    document.querySelectorAll('.book').forEach(function(li){
      var okPaper = paper==='all' || li.dataset.papers.split(' ').indexOf(paper)>-1;
      li.hidden = !okPaper;
      var picked = li.classList.contains('lead') && picks.indexOf(li.dataset.subject)>-1;
      li.classList.toggle('picked', picked);
    });
    document.querySelectorAll('.subject').forEach(function(s){
      var n=s.querySelectorAll('.book:not([hidden])').length; s.hidden=n===0; s.querySelector('.n').textContent=n;
    });
    var info=document.getElementById('pickinfo');
    if(info){
      var c=document.querySelectorAll('.book.picked:not([hidden])').length;
      info.textContent = picks.length ? (c+' book'+(c===1?'':'s')+' with screen potential in your subjects. Rights not checked: for rights-available books from agents, sign up to The Ariel.') : 'Choose what you develop to see the books with screen potential, and why.';
    }
  }
  document.querySelectorAll('[data-pick]').forEach(function(b){
    b.addEventListener('click',function(){
      var s=b.dataset.pick, i=picks.indexOf(s);
      if(i>-1){picks.splice(i,1);} else {picks.push(s);}
      b.classList.toggle('on',i<0); b.setAttribute('aria-pressed',i<0);
      apply();
      var first=document.querySelector('.book.picked'); if(first && i<0) first.scrollIntoView({behavior:'smooth',block:'center'});
    });
  });
  document.querySelectorAll('[data-paper]').forEach(function(b){
    b.addEventListener('click',function(){
      paper=b.dataset.paper;
      document.querySelectorAll('[data-paper]').forEach(function(x){var on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-pressed',on)});
      apply();
    });
  });
  apply();
})();
"""


def papers_of(ed):
    out = []
    for b in ed["books"]:
        for r in b["reviews"]:
            if r["pub"] not in out:
                out.append(r["pub"])
    return out


def example_card(ed):
    leads = [b for b in ed["books"] if b.get("lead") and b.get("why")]
    leads.sort(key=lambda b: SUBJECTS.index(b["subject"]))
    if not leads:
        return ""
    b = leads[0]
    au = f' <span class="au">{E(b.get("author"))}</span>' if b.get("author") else ""
    revs = " &middot; ".join(f'<a href="{E(r["url"])}" target="_blank" rel="noopener">{E(r["pub"])}</a>' for r in b["reviews"])
    return (f'<div class="example"><p class="example-label">Example from this week: a {E(b["subject"].lower())} pick</p>'
            f'<p class="ex-title"><span class="star" aria-hidden="true">&#9733;</span> {E(b["book"])}{au}</p><p class="line">{E(b["line"])}</p>'
            f'<p class="why"><b>Screen potential</b>{E(b["why"])}</p><p class="revs">Reviewed in {revs}</p>'
            f'<div class="ex-actions"><button type="button" class="check-rights" data-check-target="b-{E(b["book_id"])}">Check rights<span class="sr-only"> for {E(b["book"])}</span></button>'
            f'<a class="ex-read" href="{E(b["reviews"][0]["url"])}" target="_blank" rel="noopener">Read the {E(b["reviews"][0]["pub"])} review</a></div></div>')


def book_id(b):
    return re.sub(r"[^a-z0-9]+", "-", (b["book"] + " " + (b.get("author") or "")).lower()).strip("-")[:80]


def book_li(b):
    papers = " ".join(slug(r["pub"]) for r in b["reviews"])
    revs = " &middot; ".join(f'<a href="{E(r["url"])}" target="_blank" rel="noopener" data-pub="{E(r["pub"])}">{E(r["pub"])}</a>' for r in b["reviews"])
    multi = f'<span class="multi">{len(b["reviews"])} papers</span>' if len(b["reviews"]) > 1 else ""
    au = f' <span class="au">{E(b.get("author"))}</span>' if b.get("author") else ""
    star = '<span class="star" aria-hidden="true">&#9733;</span> <span class="sr-only">Screen potential: </span>' if b.get("lead") else ""
    why = f'<p class="why"><b>Screen potential</b>{E(b.get("why"))}</p>' if b.get("lead") and b.get("why") else ""
    cls = "book lead" if b.get("lead") else "book"
    return (f'<li class="{cls}" id="b-{E(b["book_id"])}" data-book="{E(b["book"])}" data-author="{E(b.get("author") or "")}" data-subject="{E(b["subject"])}" data-papers="{papers}">'
            f'<h3>{star}<span>{E(b["book"])}</span>{au}</h3><p class="line">{E(b["line"])}</p>{why}'
            f'<div class="book-foot"><p class="revs">Reviewed in {revs}{multi}</p>'
            f'<button type="button" class="check-rights" aria-haspopup="dialog">Check rights<span class="sr-only"> for {E(b["book"])}</span></button></div></li>')


def edition_body(ed):
    books = ed["books"]
    papers = []
    for b in books:
        for r in b["reviews"]:
            if r["pub"] not in papers:
                papers.append(r["pub"])
    present = [s for s in SUBJECTS if any(b["subject"] == s for b in books)]
    gnav = "".join(f'<a href="#{slug(s)}">{E(s)}</a>' for s in present)
    pick_btns = "".join(f'<button type="button" class="tog" data-pick="{E(s)}" aria-pressed="false">{E(s)}</button>' for s in present)
    paper_btns = '<button type="button" class="tog on" data-paper="all" aria-pressed="true">All papers</button>' + "".join(
        f'<button type="button" class="tog" data-paper="{slug(p)}" aria-pressed="false">{E(p)}</button>' for p in papers)
    secs = []
    for s in present:
        lst = [b for b in books if b["subject"] == s]
        lst.sort(key=lambda b: not b.get("lead"))
        secs.append(f'<section class="subject" id="{slug(s)}"><header><h2>{E(s)}</h2><span class="n">{len(lst)}</span></header>'
                    f'<ol>{"".join(book_li(b) for b in lst)}</ol></section>')
    return f'''<div class="controls">
  <div class="crow" role="group" aria-labelledby="lbl-pick"><span class="lbl" id="lbl-pick">Show the books with screen potential for what I develop</span>{pick_btns}</div>
  <p class="pickinfo" id="pickinfo"></p>
  <div class="crow" role="group" aria-labelledby="lbl-paper"><span class="lbl" id="lbl-paper">Filter by paper</span>{paper_btns}</div>
  <nav class="crow gnav" aria-label="Jump to subject"><span class="lbl">Jump to a subject</span>{gnav}</nav>
</div>
{"".join(secs)}'''


def page(ed, eds, is_index):
    n = len(ed["books"])
    title = "London Review of Reviews" if is_index else f'London Review of Reviews, {ed["date_label"]}'
    canon = CFG["site"] + ("" if is_index else ed["edition_id"] + ".html")
    desc = f'Every non-fiction book reviewed in the British papers and literary magazines this week, one line each. {n} books, {ed["date_label"]}. Free every Monday from The Ariel.'
    archive = "".join(
        f'<li><a href="{E(e["edition_id"])}.html">{E(e["date_label"])}</a> <span class="n">{len(e["books"])} books</span></li>'
        for e in reversed(eds))
    form_top = signup_form("brr-top", "reviews-page")
    form_bottom = signup_form("brr-bottom", "reviews-page-bottom")
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{E(title)}</title>
<meta name="description" content="{E(desc)}">
<link rel="canonical" href="{E(canon)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="The Ariel">
<meta property="og:url" content="{E(canon)}">
<meta property="og:title" content="{E(title)}">
<meta property="og:description" content="{E(desc)}">
<meta property="og:image" content="https://theariel.tv/link-card.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/ariel-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Lato:ital,wght@0,300;0,400;0,700;1,300&display=swap" rel="stylesheet">
<style>{CSS}</style>
</head>
<body data-edition="{E(ed["edition_id"])}">
<a class="skip" href="#edition">Skip to this week&#8217;s books</a>
<header class="bar"><div class="bar-in"><a href="/">The Ariel</a><a class="bar-cta" href="/#what">What The Ariel does</a></div></header>
<section class="hero" aria-labelledby="page-title"><div class="hero-in">
  <div class="hero-intro">
    <p class="free"><span class="free-badge">Free</span><span class="free-when">Every Monday &middot; {E(ed["date_label"])}</span></p>
    <h1 id="page-title">London Review <em>of</em> Reviews</h1>
    <p class="dek">Every non-fiction book reviewed in the week&#8217;s British papers and literary magazines, sorted by subject, one line each.</p>
    <ul class="promises">
      <li>Free to everyone, every week</li>
      <li>{n} books this week from {len(papers_of(ed))} publications</li>
      <li>Tell us what you develop and we flag the books with screen potential, and why</li>
    </ul>
  </div>
  <div class="hero-example">{example_card(ed)}</div>
  <div class="brr-card hero-form"><h2>Get it free every Monday</h2><p class="card-sub">Takes ten seconds. Just your email.</p>{form_top}</div>
</div></section>
<main id="edition"><div class="wrap">
  <div class="edition-head"><h2>This week&#8217;s books</h2><p class="meta">{n} books &middot; {E(ed.get("window", ""))}</p></div>
  {edition_body(ed)}
  <div class="cta">
    <h2>Want books whose rights are available?</h2>
    <p>We don&#8217;t check rights for the Review. Sign up to The Ariel and get a first look at rights-available books directly from literary agents, matched to what you develop, plus books, journalism and rights deals every day for your slate.</p>
    <a href="/?utm_source=review-of-reviews&amp;utm_medium=web#book">Sign up to The Ariel</a>
  </div>
  <div class="inline-signup brr-card"><h2>Get next Monday&#8217;s edition free</h2><p class="card-sub">Free, every week. Unsubscribe in one click.</p>{form_bottom}</div>
  <div class="archive"><h2>Past editions</h2><ul>{archive}</ul></div>
  <p class="note">Summaries are our own one-line descriptions of each review; follow the links to read the reviews in full. &#9733; marks books we think have screen potential. We haven&#8217;t checked who holds the film and TV rights, and some may already be optioned. For a first look at rights-available books directly from agents, <a href="/#book">sign up to The Ariel</a>. Sources this week: {E(", ".join(sorted({r["pub"] for b in ed["books"] for r in b["reviews"]})))}. Not yet covered: the Telegraph, TLS and New Statesman.</p>
</div></main>
<footer>The Ariel &middot; Personalised story intelligence for screen &middot; <a href="/">theariel.tv</a> &middot; <a href="mailto:hello@theariel.tv">hello@theariel.tv</a></footer>
<script>{FILTER_JS}</script>
<div class="rights-modal" id="modal-rights" role="dialog" aria-modal="true" aria-labelledby="rights-title" hidden>
  <div class="rights-box">
    <button type="button" class="rights-close" data-close aria-label="Close">&times;</button>
    <div data-pane="form">
      <h2 id="rights-title">Check the screen rights</h2>
      <p class="rights-book"><span data-fill="book"></span></p>
      <p>We&#8217;ll ask the author&#8217;s agent whether film and TV rights are available and email you the answer, usually within a week. If they are free, we can introduce you.</p>
      <p class="rights-free"><b>Your first rights check is free.</b> Ariel members get unlimited checks: just use the email address your Ariel emails come to. No password needed.</p>
      <form novalidate>
        <label for="rq-email">Your email <span class="req">*</span></label>
        <input type="email" id="rq-email" name="email" required autocomplete="email" placeholder="We&#8217;ll email you the answer">
        <input type="text" name="website" class="brr-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button type="submit" class="brr-submit">Check the rights</button>
        <p class="rights-status" role="status" aria-live="polite"></p>
      </form>
    </div>
    <div data-pane="done" hidden>
      <h2>We&#8217;re on it</h2>
      <p>We&#8217;re asking about <b data-fill="book"></b> and will email you the answer. Check your inbox for a confirmation.</p>
      <button type="button" class="brr-submit" data-close>Back to the Review</button>
    </div>
    <div data-pane="answered" hidden>
      <h2>We already know</h2>
      <p>We&#8217;ve just emailed you what we know about the rights to <b data-fill="book"></b>.</p>
      <button type="button" class="brr-submit" data-close>Back to the Review</button>
    </div>
    <div data-pane="upsell" hidden>
      <h2>You&#8217;ve used your free rights check</h2>
      <p>Choose how you&#8217;d like to keep checking rights on <b data-fill="book"></b> and every book in the Review.</p>
      <div class="upsell-opt best">
        <p class="upsell-tag">Recommended</p>
        <h3>Join The Ariel</h3>
        <ul><li>Unlimited rights checks and introductions to agents</li><li>A first look at rights-available books, sent to us directly by literary agents</li><li>Books, journalism and rights deals every day, chosen for your slate</li></ul>
        <a class="brr-submit as-link" href="/#book">Apply to join The Ariel</a>
      </div>
      <div class="upsell-opt">
        <h3>Rights Pass, &#163;29 a month</h3>
        <ul><li>Unlimited rights checks on every book in the Review</li><li>Introductions to the agent when rights are available</li><li>Cancel any time</li></ul>
        <a class="brr-ghost" href="#" data-pass>Get the Rights Pass</a>
      </div>
    </div>
    <div data-pane="pass" hidden>
      <h2>Thank you</h2>
      <p>We&#8217;ll email you today to set up your Rights Pass, and start on <b data-fill="book"></b> straight away.</p>
      <button type="button" class="brr-submit" data-close>Back to the Review</button>
    </div>
  </div>
</div>
<script src="/reviews/signup.js"></script>
<script src="/reviews/rights.js"></script>
</body>
</html>
'''


GO_HTML = r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Opening the review - London Review of Reviews</title>
<style>body{margin:0;font-family:Lato,Arial,sans-serif;background:#F8F5F0;color:#1E2233;font-size:18px}main{max-width:560px;margin:0 auto;padding:48px 16px}a{color:#6E5428}</style></head>
<body><main><h1 style="font-family:Georgia,serif;font-weight:500">Opening the review...</h1><p id="msg">If nothing happens, <a href="/reviews/" id="fallback">go back to the Review</a>.</p></main>
<script>
(function(){
  var q=new URLSearchParams(location.search), e=q.get('e')||'', b=q.get('b')||'', u=parseInt(q.get('u')||'0',10), t=q.get('t')||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(e)){location.replace('/reviews/');return;}
  fetch('/reviews/editions/'+e+'.json').then(function(r){return r.json()}).then(function(ed){
    var bk=(ed.books||[]).filter(function(x){return x.book_id===b})[0];
    var r=bk&&bk.reviews&&bk.reviews[u];
    if(!r||!/^https:\/\//.test(r.url)){location.replace('/reviews/'+e+'.html');return;}
    document.getElementById('fallback').href=r.url;
    var body=JSON.stringify({action:'click',edition_id:e,book_id:b,kind:'review',where:'email',pub:r.pub,t:t});
    var sent=false;try{sent=navigator.sendBeacon('__BRR_ENDPOINT__',new Blob([body],{type:'text/plain'}))}catch(x){}
    setTimeout(function(){location.replace(r.url)},sent?60:400);
  }).catch(function(){location.replace('/reviews/')});
})();
</script></body></html>
"""


def home_panels(ed):
    """Rewrite the Review panel + pop-up blocks in the homepage from the latest edition."""
    n = len(ed["books"]); pubs = papers_of(ed)
    leads = [b for b in ed["books"] if b.get("lead") and b.get("why")]
    leads.sort(key=lambda b: SUBJECTS.index(b["subject"]))
    stats = f'<p class="brr-stats">This week: {n} books from {len(pubs)} publications &middot; {E(ed["date_label"])}</p>'
    ex = ""
    pop_ex = ""
    if leads:
        b = leads[0]
        bid = b["book_id"]
        au = f' <span>{E(b.get("author"))}</span>' if b.get("author") else ""
        ex = (f'<div class="brr-example">\n        <p class="brr-example-label">From this week: a {E(b["subject"].lower())} pick</p>\n'
              f'        <h3><span aria-hidden="true" style="color:#9A7631">&#9733;</span> {E(b["book"])}{au}</h3>\n'
              f'        <p>{E(b["line"])}</p>\n'
              f'        <p class="brr-why"><b>Screen potential</b>{E(b["why"])}</p>\n'
              f'        <div class="brr-example-actions"><a class="ex-rights" href="/reviews/?check={E(bid)}#b-{E(bid)}">Check rights<span class="sr-only"> for {E(b["book"])}</span></a>'
              f'<a class="ex-review" href="{E(b["reviews"][0]["url"])}" target="_blank" rel="noopener">Read the {E(b["reviews"][0]["pub"])} review</a></div>\n'
              f'      </div>\n')
        pop_ex = f'\n    <p class="brr-pop-example"><b>&#9733; {E(b["book"])}</b>{" by " + E(b.get("author")) if b.get("author") else ""}. Screen potential: {E(b["why"][0].lower() + b["why"][1:])}</p>'
    panel = (f'      <!-- BRR:PANEL:START -->\n      {stats}\n      {ex}'
             '      <p class="brr-rights">We don&#8217;t check rights for the Review. For a first look at rights-available books directly from literary agents, <a href="#book">sign up to The Ariel</a>.</p>\n'
             f'      <div class="brr-actions">\n        <a class="brr-btn" href="/reviews/">Read this week&#8217;s {n} books</a>\n      </div>\n      <!-- BRR:PANEL:END -->')
    pop = (f'    <!-- BRR:POP:START -->\n    <p class="modal-sub">Every non-fiction book reviewed in the British papers, one line each, in your inbox every Monday. '
           f'This week: {n} books from {len(pubs)} publications. <a href="/reviews/">See this week&#8217;s edition</a>.</p>{pop_ex}\n    <!-- BRR:POP:END -->')
    hp = os.path.join(ROOT, "index.html")
    h = open(hp).read()
    h = re.sub(r"      <!-- BRR:PANEL:START -->.*?<!-- BRR:PANEL:END -->", lambda m: panel, h, flags=re.S)
    h = re.sub(r"    <!-- BRR:POP:START -->.*?<!-- BRR:POP:END -->", lambda m: pop, h, flags=re.S)
    open(hp, "w").write(h)


def main():
    eds = load_editions()
    for ed in eds:
        check(ed)
        changed = False
        for b in ed["books"]:
            if not b.get("book_id"):
                b["book_id"] = book_id(b); changed = True
        if changed:
            json.dump(ed, open(os.path.join(ED_DIR, ed["edition_id"] + ".json"), "w"), ensure_ascii=False, indent=1)
    latest = eds[-1]
    for ed in eds:
        open(os.path.join(OUT_DIR, ed["edition_id"] + ".html"), "w").write(page(ed, eds, False))
    open(os.path.join(OUT_DIR, "index.html"), "w").write(page(latest, eds, True))
    json.dump(latest, open(os.path.join(ED_DIR, "latest.json"), "w"), ensure_ascii=False, indent=1)
    home_panels(latest)
    # signup.js gets the backend URL from config
    js = open(os.path.join(os.path.dirname(__file__), "signup.template.js")).read().replace("__BRR_ENDPOINT__", CFG["endpoint"])
    open(os.path.join(OUT_DIR, "signup.js"), "w").write(js)
    rj = open(os.path.join(os.path.dirname(__file__), "rights.template.js")).read().replace("__BRR_ENDPOINT__", CFG["endpoint"]).replace("__BRR_PASS_URL__", CFG.get("rights_pass_url", ""))
    open(os.path.join(OUT_DIR, "rights.js"), "w").write(rj)
    open(os.path.join(OUT_DIR, "go.html"), "w").write(GO_HTML.replace("__BRR_ENDPOINT__", CFG["endpoint"]))
    # sitemap
    sm_path = os.path.join(ROOT, "sitemap.xml")
    sm = open(sm_path).read()
    urls = [CFG["site"]] + [CFG["site"] + e["edition_id"] + ".html" for e in eds]
    for u in urls:
        if f"<loc>{u}</loc>" not in sm:
            sm = sm.replace("</urlset>", f"  <url><loc>{u}</loc><lastmod>{date.today().isoformat()}</lastmod></url>\n</urlset>")
    open(sm_path, "w").write(sm)
    print(f"built {len(eds)} edition page(s); latest {latest['edition_id']} ({len(latest['books'])} books)")


if __name__ == "__main__":
    main()
