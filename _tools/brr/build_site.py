#!/usr/bin/env python3
"""British Review of Reviews - static site builder (The Ariel).

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
  <fieldset class="brr-subjects"><legend>What do you develop? <span class="hint">We pick out the books for you at the top of each edition.</span></legend>{chips}</fieldset>
  <input type="text" name="website" class="brr-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
  <button type="submit" class="brr-submit">Get it every Monday</button>
  <p class="brr-status" role="status" aria-live="polite"></p>
  <p class="brr-small">Free. One email a week. Unsubscribe any time. We use your email only to send the Review.</p>
</form>'''


CSS = r"""
:root{--ink:#1B1F3B;--logo-navy:#001733;--ivory:#F8F5F0;--gold:#B8965A;--gold-light:#D4B87A;--gold-deep:#7A5F33;--mist:#BCC4D6;--mist-deep:#5A6378;--burgundy:#722F37;--body:#2D2D3A;--soft-line:#D8D4CC;--deep-ivory:#EFEAE2;--cream:#FFFDF8;--tint:#F3EDE2}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:'Lato',-apple-system,sans-serif;color:var(--body);background:var(--ivory);font-weight:300;line-height:1.65;font-size:17px;-webkit-font-smoothing:antialiased}
a{color:var(--gold-deep)}
.bar{background:var(--ink);padding-block:14px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.bar-in{max-width:1080px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
.bar a{color:var(--ivory);text-decoration:none;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;letter-spacing:.06em}
.bar .bar-cta{font-family:'Lato',sans-serif;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-light)}
.hero{background:var(--ink);color:var(--ivory);padding-block:40px 48px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.hero-in{max-width:1080px;margin:0 auto;display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:start}
.kicker{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold-light)}
h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:clamp(2.6rem,6vw,4.2rem);line-height:1.02;margin:.4rem 0 1rem;text-wrap:balance}
h1 em{font-style:italic}
.dek{color:#C9CEDC;max-width:34rem;margin:0}
.hero .brr-card{background:var(--ivory);color:var(--body);padding:24px;border-radius:3px}
.brr-card h2{font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:26px;margin:0 0 4px;color:var(--ink)}
.brr-form{display:flex;flex-direction:column;gap:12px}
.brr-form label,.brr-form legend{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);margin-bottom:5px;font-weight:400}
.brr-form .req{color:var(--burgundy)}
.brr-form input[type=email],.brr-form select{width:100%;padding:9px 12px;border:1px solid var(--soft-line);background:var(--cream);font-family:'Lato',sans-serif;font-size:15px;color:var(--body);border-radius:2px}
.brr-form input:focus,.brr-form select:focus{outline:2px solid var(--gold);outline-offset:1px}
.brr-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.brr-subjects{border:0;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:6px}
.brr-subjects legend{margin-bottom:8px}
.brr-subjects .hint{text-transform:none;letter-spacing:0;color:var(--mist-deep);font-size:12px}
.brr-chip{margin:0!important;text-transform:none!important;letter-spacing:0!important;font-size:13px!important;cursor:pointer}
.brr-chip input{position:absolute;opacity:0;pointer-events:none}
.brr-chip span{display:inline-block;border:1px solid var(--soft-line);background:var(--cream);border-radius:999px;padding:4px 11px;color:var(--body)}
.brr-chip input:checked+span{background:var(--ink);border-color:var(--ink);color:var(--ivory)}
.brr-chip input:focus-visible+span{outline:2px solid var(--gold);outline-offset:2px}
.brr-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.brr-submit{margin-top:4px;padding:13px 24px;background:var(--ink);color:var(--ivory);border:0;border-radius:2px;font-family:'Lato',sans-serif;font-size:12px;letter-spacing:.16em;text-transform:uppercase;cursor:pointer}
.brr-submit:hover{background:var(--logo-navy)} .brr-submit:disabled{opacity:.55;cursor:progress}
.brr-status{margin:0;font-size:14px;min-height:20px}
.brr-status.error{color:var(--burgundy)} .brr-status.success{color:#3D6B4A}
.brr-small{margin:0;font-size:12px;color:var(--mist-deep)}
main{padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.wrap{max-width:780px;margin:0 auto;padding-block:36px 64px}
.meta{font-size:13px;color:var(--mist-deep);margin-bottom:18px}
.controls{display:grid;gap:10px;padding-block:14px;border-block:1px solid var(--soft-line);margin-bottom:8px;font-size:14px}
.crow{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.crow .lbl{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mist-deep);min-width:5.5rem}
.tog{font:inherit;font-size:13px;border:1px solid var(--soft-line);background:var(--cream);color:var(--body);border-radius:999px;padding:4px 11px;cursor:pointer}
.tog.on{background:var(--ink);color:var(--ivory);border-color:var(--ink)}
.tog:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.gnav a{font-size:13px;color:var(--gold-deep);text-decoration:none;margin-right:6px}
.subject{margin-top:34px}
.subject header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid var(--ink);padding-bottom:4px}
.subject h2{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:500;font-size:30px;margin:0;color:var(--ink)}
.n{font-size:12px;color:var(--mist-deep);font-variant-numeric:tabular-nums}
ol{list-style:none;margin:0;padding:0}
.book{padding-block:14px;border-bottom:1px solid var(--soft-line)}
.book h3{margin:0;font-size:17px;font-weight:700;color:var(--ink);display:flex;flex-wrap:wrap;gap:2px 8px;align-items:baseline}
.au{font-size:14px;font-weight:300;color:var(--mist-deep)}
.line{margin:4px 0 0}
.why{display:none;margin:8px 0 0;padding:8px 12px;background:var(--tint);border-left:3px solid var(--gold);font-size:15px}
.why b{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold-deep);margin-right:6px}
.book.lead .star{color:var(--gold)}
.book.picked .why{display:block}
.book.picked{background:linear-gradient(90deg,var(--tint),transparent 70%);padding-inline:10px;margin-inline:-10px}
.revs{margin:6px 0 0;font-size:13px;color:var(--mist-deep)}
.multi{color:var(--gold-deep);font-weight:700;margin-left:6px}
.pickinfo{font-size:13px;color:var(--mist-deep);margin:4px 0 0}
.cta{background:var(--ink);color:var(--ivory);padding:30px;border-radius:3px;margin-top:44px}
.cta h2{font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:30px;margin:0 0 8px}
.cta p{color:#C9CEDC;margin:0 0 18px;max-width:36rem}
.cta a{display:inline-block;background:var(--gold);color:var(--ink);text-decoration:none;padding:12px 22px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;border-radius:2px}
.archive{margin-top:40px;font-size:15px}
.archive h2{font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:24px;color:var(--ink);margin:0 0 8px}
.archive li{padding:4px 0}
.note{margin-top:28px;font-size:13px;color:var(--mist-deep)}
.inline-signup{margin-top:44px;background:var(--cream);border:1px solid var(--soft-line);padding:24px;border-radius:3px}
footer{background:var(--ink);color:var(--mist);text-align:center;padding:28px 16px;font-size:13px}
footer a{color:var(--gold-light)}
@media (max-width:820px){.hero-in{grid-template-columns:1fr;gap:24px}.brr-row{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
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
      info.textContent = picks.length ? (c+' lead'+(c===1?'':'s')+' in your subjects, with why each could be a screen project.') : 'Choose what you develop to see the leads for you, with why each could be a screen project.';
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


def book_li(b):
    papers = " ".join(slug(r["pub"]) for r in b["reviews"])
    revs = " &middot; ".join(f'<a href="{E(r["url"])}" target="_blank" rel="noopener">{E(r["pub"])}</a>' for r in b["reviews"])
    multi = f'<span class="multi">{len(b["reviews"])} papers</span>' if len(b["reviews"]) > 1 else ""
    au = f' <span class="au">{E(b.get("author"))}</span>' if b.get("author") else ""
    star = '<span class="star" aria-label="Lead">&#9733;</span> ' if b.get("lead") else ""
    why = f'<p class="why"><b>Why it&#8217;s a lead</b>{E(b.get("why"))}</p>' if b.get("lead") and b.get("why") else ""
    cls = "book lead" if b.get("lead") else "book"
    return (f'<li class="{cls}" data-subject="{E(b["subject"])}" data-papers="{papers}">'
            f'<h3>{star}<span>{E(b["book"])}</span>{au}</h3><p class="line">{E(b["line"])}</p>{why}'
            f'<p class="revs">Reviewed in {revs}{multi}</p></li>')


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
  <div class="crow"><span class="lbl">I develop</span>{pick_btns}</div>
  <p class="pickinfo" id="pickinfo"></p>
  <div class="crow"><span class="lbl">Paper</span>{paper_btns}</div>
  <nav class="crow gnav" aria-label="Jump to subject"><span class="lbl">Jump to</span>{gnav}</nav>
</div>
{"".join(secs)}'''


def page(ed, eds, is_index):
    n = len(ed["books"])
    title = "British Review of Reviews" if is_index else f'British Review of Reviews, {ed["date_label"]}'
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
<body>
<div class="bar"><div class="bar-in"><a href="/">The Ariel</a><a class="bar-cta" href="/#what">What The Ariel does</a></div></div>
<header class="hero"><div class="hero-in">
  <div>
    <div class="kicker">Free every Monday &middot; {E(ed["date_label"])}</div>
    <h1>British Review <em>of</em> Reviews</h1>
    <p class="dek">Every non-fiction book reviewed in the week&#8217;s papers and literary magazines, sorted by subject, one line each. Tell us what you develop and we pick out the leads for you, with why each could be a screen project.</p>
  </div>
  <div class="brr-card"><h2>Get it in your inbox</h2>{form_top}</div>
</div></header>
<main><div class="wrap">
  <p class="meta">{n} books &middot; {E(ed.get("window", ""))}</p>
  {edition_body(ed)}
  <div class="cta">
    <h2>This is one week of books.</h2>
    <p>The Ariel does this every day, for your slate: books, journalism, rights deals and agents&#8217; lists, filtered to what you develop, with research briefs on the stories you want to chase.</p>
    <a href="/?utm_source=review-of-reviews&amp;utm_medium=web#what">See what The Ariel does</a>
  </div>
  <div class="inline-signup brr-card"><h2>Get next Monday&#8217;s edition</h2>{form_bottom}</div>
  <div class="archive"><h2>Past editions</h2><ul>{archive}</ul></div>
  <p class="note">Summaries are our own one-line descriptions of each review; follow the links to read the reviews in full. Sources this week: {E(", ".join(sorted({r["pub"] for b in ed["books"] for r in b["reviews"]})))}. Not yet covered: the Telegraph, TLS and New Statesman.</p>
</div></main>
<footer>The Ariel &middot; Personalised story intelligence for screen &middot; <a href="/">theariel.tv</a> &middot; <a href="mailto:hello@theariel.tv">hello@theariel.tv</a></footer>
<script>{FILTER_JS}</script>
<script src="/reviews/signup.js"></script>
</body>
</html>
'''


def main():
    eds = load_editions()
    for ed in eds:
        check(ed)
    latest = eds[-1]
    for ed in eds:
        open(os.path.join(OUT_DIR, ed["edition_id"] + ".html"), "w").write(page(ed, eds, False))
    open(os.path.join(OUT_DIR, "index.html"), "w").write(page(latest, eds, True))
    json.dump(latest, open(os.path.join(ED_DIR, "latest.json"), "w"), ensure_ascii=False, indent=1)
    # signup.js gets the backend URL from config
    js = open(os.path.join(os.path.dirname(__file__), "signup.template.js")).read().replace("__BRR_ENDPOINT__", CFG["endpoint"])
    open(os.path.join(OUT_DIR, "signup.js"), "w").write(js)
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
