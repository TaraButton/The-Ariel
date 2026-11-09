#!/usr/bin/env python3
"""Children's Review of Reviews - static site builder (The Ariel). Added 9 Nov 2026.

The children's and YA edition of the London Review of Reviews. Reads every edition in
reviews/children/editions/YYYY-MM-DD.json (edition_id "kids-YYYY-MM-DD") and writes:
  reviews/children/index.html           latest edition + sign-up + archive
  reviews/children/YYYY-MM-DD.html      one page per edition
  reviews/children/editions/latest.json newest edition (the newsletter backend pulls this)
and adds the pages to sitemap.xml. Reuses the adult builder's styles, book cards, sign-up,
rights checks and click tracking (reviews/signup.js, rights.js, go.html).

Usage (from the repo root): python3 _tools/brr/build_kids.py
"""
import json, os, re, sys
from datetime import date

sys.path.insert(0, os.path.dirname(__file__))
import build_site as bs  # noqa: E402

E, slug = bs.E, bs.slug
ROOT = bs.ROOT
ED_DIR = os.path.join(ROOT, "reviews", "children", "editions")
OUT_DIR = os.path.join(ROOT, "reviews", "children")
SITE = "https://theariel.tv/reviews/children/"
NAME = "Children's Review of Reviews"

# Age band first, then fiction / non-fiction (Tara, 9 Nov 2026). Keep in step with KIDS_SUBJECTS in Code.js.
BANDS = [("0-5", "Preschool (0-5)"), ("5-8", "Ages 5-8"), ("8-12", "Middle grade (8-12)"), ("12+", "Young adult (12+)")]
SUBJECTS = ["Preschool fiction (0-5)", "Preschool non-fiction (0-5)",
            "5-8 fiction", "5-8 non-fiction",
            "Middle grade fiction (8-12)", "Middle grade non-fiction (8-12)",
            "YA fiction (12+)", "YA non-fiction (12+)"]
BAND_OF = {s: BANDS[i // 2][0] for i, s in enumerate(SUBJECTS)}
NONFIC = [s for s in SUBJECTS if "non-fiction" in s]
ROLES = ["Producer", "Development executive", "Commissioner", "Agent or publisher", "Writer", "Other"]

KIDS_CSS = r"""
:root{--ink:#14303A;--gold:#2E7D74;--gold-light:#9ED8CF;--gold-deep:#1D5A53;--tint:#E3F1EE;--ivory:#F5F8F6;--line:#C6D6D1}
.brr-submit,.free-badge,.cta a,.upsell-tag,.skip{color:#FFFFFF}
.brr-submit:hover,.cta a:hover{background:var(--gold-deep);color:#FFFFFF}
.star{color:#2E7D74}
.v-rave{background:#1D5A53;border-color:#1D5A53}.v-warm{color:#1D5A53;background:#E3F1EE}
.bandbar{display:flex;flex-wrap:wrap;gap:6px;background:var(--paper);border:2px solid var(--line);border-radius:6px;padding:6px;margin:0 0 12px}
.bandbar button{flex:1 1 120px;min-height:48px;border:0;border-radius:4px;background:transparent;font:inherit;font-weight:900;font-size:16px;color:var(--muted);cursor:pointer}
.bandbar button[aria-pressed=true]{background:var(--gold);color:#FFFFFF}
.kindbar{max-width:520px}.kindbar button{flex:1 1 80px}
h2.part{border-top-color:var(--gold)}
.bar .sib{font-family:'Lato',sans-serif;font-size:14px;font-weight:700;letter-spacing:.06em;color:var(--gold-light);margin-right:16px}
"""

KIDS_JS = r"""
(function(){
  var picks=[], paper='all', band='all', kind='both';
  function bandOf(s){return s.indexOf('Preschool')===0?'0-5':s.indexOf('5-8')===0?'5-8':s.indexOf('Middle grade')===0?'8-12':'12+';}
  function isNF(s){return s.indexOf('non-fiction')>-1;}
  function store(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v);}catch(e){return null;}}
  function apply(){
    document.querySelectorAll('.book').forEach(function(li){
      var s=li.dataset.subject;
      var ok=(paper==='all'||li.dataset.papers.split(' ').indexOf(paper)>-1)&&(band==='all'||bandOf(s)===band)&&(kind==='both'||(kind==='nonfiction')===isNF(s));
      li.hidden=!ok;
      li.classList.toggle('picked', li.classList.contains('lead') && picks.indexOf(s)>-1);
    });
    document.querySelectorAll('.subject').forEach(function(x){var n=x.querySelectorAll('.book:not([hidden])').length;x.hidden=n===0;x.querySelector('.n').textContent=n;});
    document.querySelectorAll('h2.part').forEach(function(h){h.hidden=!(band==='all'||h.dataset.band===band);});
    var info=document.getElementById('pickinfo');
    if(info){var c=document.querySelectorAll('.book.picked:not([hidden])').length;
      info.textContent=picks.length?(c+' book'+(c===1?'':'s')+' with screen potential for what you develop. Rights not checked: for rights-available books from agents, sign up to The Ariel.'):'Choose what you develop to see the books with screen potential, and why.';}
  }
  function group(attr,set){document.querySelectorAll('['+attr+']').forEach(function(b){b.addEventListener('click',function(){
    set(b.getAttribute(attr));document.querySelectorAll('['+attr+']').forEach(function(x){x.setAttribute('aria-pressed',x===b);x.classList.toggle('on',x===b&&x.classList.contains('tog'));});apply();});});}
  group('data-band',function(v){band=v;store('kids_band',v);});
  group('data-kind',function(v){kind=v;});
  group('data-paper',function(v){paper=v;});
  document.querySelectorAll('[data-pick]').forEach(function(b){b.addEventListener('click',function(){
    var s=b.dataset.pick,i=picks.indexOf(s); if(i>-1)picks.splice(i,1); else picks.push(s);
    b.classList.toggle('on',i<0);b.setAttribute('aria-pressed',i<0);apply();
    var f=document.querySelector('.book.picked'); if(f&&i<0)f.scrollIntoView({behavior:'smooth',block:'center'});});});
  var q=new URLSearchParams(location.search).get('age')||store('kids_band');
  var start=q&&document.querySelector('[data-band="'+q+'"]'); if(start) start.click(); else apply();
})();
"""


def load_editions():
    eds = []
    for f in sorted(os.listdir(ED_DIR)):
        if re.match(r"^\d{4}-\d{2}-\d{2}\.json$", f):
            ed = json.load(open(os.path.join(ED_DIR, f)))
            if ed.get("edition_id") != "kids-" + f[:-5]:
                sys.exit(f"{f}: edition_id must be kids-{f[:-5]}")
            eds.append(ed)
    if not eds:
        sys.exit("no editions in reviews/children/editions/")
    return eds


def check(ed):
    bs.SUBJECTS, keep = SUBJECTS, bs.SUBJECTS
    try:
        bs.check(ed)
    finally:
        bs.SUBJECTS = keep


def day(ed):
    return ed["edition_id"][5:]


def signup_form(fid, source):
    chip = lambda s: f'<label class="brr-chip"><input type="checkbox" name="subjects" value="{E(s)}"><span>{E(s)}</span></label>'
    chips = "".join(f'<span class="chipgroup">{E(lbl)}</span>' + chip(SUBJECTS[2 * i]) + chip(SUBJECTS[2 * i + 1]) for i, (_, lbl) in enumerate(BANDS))
    roles = "".join(f'<option value="{E(r)}">{E(r)}</option>' for r in ROLES)
    return f'''<form class="brr-form" id="{fid}" data-source="{E(source)}" data-kids="1" novalidate>
  <div class="brr-row">
    <div><label for="{fid}-email">Email <span class="req">*</span></label><input type="email" id="{fid}-email" name="email" required autocomplete="email" placeholder="you@company.com"></div>
    <div><label for="{fid}-role">What do you do?</label><select id="{fid}-role" name="role"><option value="">Choose (optional)</option>{roles}</select></div>
  </div>
  <fieldset class="brr-subjects"><legend>Which ages do you make for? <span class="hint">Optional. We put the books with screen potential for these ages at the top of your email.</span></legend>{chips}</fieldset>
  <input type="text" name="website" class="brr-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
  <button type="submit" class="brr-submit">Sign up free</button>
  <p class="brr-status" role="status" aria-live="polite"></p>
  <p class="brr-small">Free, no card. One email on the Mondays we publish. Unsubscribe in one click. We use your email only to send the Review.</p>
</form>'''


def example_card(ed):
    leads = [b for b in ed["books"] if b.get("lead") and b.get("why")]
    if not leads:
        return ""
    b = sorted(leads, key=lambda b: (bs.best_verdict(b), -len(b["reviews"])))[0]
    au = f' <span class="au">{E(b.get("author"))}</span>' if b.get("author") else ""
    revs = " &middot; ".join(f'<a href="{E(r["url"])}" target="_blank" rel="noopener">{E(r["pub"])}</a>' for r in b["reviews"])
    return (f'<div class="example"><p class="example-label">Example from this edition: {E(b["subject"].lower())}</p>'
            f'<p class="ex-title"><span class="star" aria-hidden="true">&#9733;</span> {E(b["book"])}{au}</p><p class="line">{E(b["line"])}</p>'
            f'<p class="why"><b>Screen potential</b>{E(b["why"])}</p><p class="revs">Reviewed in {revs}</p>'
            f'<div class="ex-actions"><button type="button" class="check-rights" data-check-target="b-{E(b["book_id"])}">Check rights<span class="sr-only"> for {E(b["book"])}</span></button>'
            f'<a class="ex-read" href="{E(b["reviews"][0]["url"])}" target="_blank" rel="noopener">Read the {E(b["reviews"][0]["pub"])} review</a></div></div>')


def edition_body(ed):
    books = ed["books"]
    papers = bs.papers_of(ed)
    present = [s for s in SUBJECTS if any(b["subject"] == s for b in books)]
    bands_present = [(k, l) for k, l in BANDS if any(BAND_OF[s] == k for s in present)]
    band_btns = '<button type="button" data-band="all" aria-pressed="true">All ages</button>' + "".join(
        f'<button type="button" data-band="{E(k)}" aria-pressed="false">{E(l)}</button>' for k, l in bands_present)
    pick_btns = "".join(f'<button type="button" class="tog" data-pick="{E(s)}" aria-pressed="false">{E(s)}</button>' for s in present)
    paper_btns = '<button type="button" class="tog on" data-paper="all" aria-pressed="true">All papers</button>' + "".join(
        f'<button type="button" class="tog" data-paper="{slug(p)}" aria-pressed="false">{E(p)}</button>' for p in papers)
    secs = []
    for k, lbl in bands_present:
        secs.append(f'<h2 class="part" id="age-{slug(k) or "teen"}" data-band="{E(k)}">{E(lbl)}</h2>')
        for s in [s for s in present if BAND_OF[s] == k]:
            lst = [b for b in books if b["subject"] == s]
            lst.sort(key=lambda b: (not b.get("lead"), bs.best_verdict(b), -len(b["reviews"])))
            secs.append(f'<section class="subject" id="{slug(s)}"><header><h2>{E(s)}</h2><span class="n">{len(lst)}</span></header>'
                        f'<ol>{"".join(bs.book_li(b) for b in lst)}</ol></section>')
    return f'''<div class="bandbar" role="group" aria-label="Show an age group">{band_btns}</div>
<div class="bandbar kindbar" role="group" aria-label="Show fiction, non-fiction or both">
  <button type="button" data-kind="fiction" aria-pressed="false">Fiction</button>
  <button type="button" data-kind="nonfiction" aria-pressed="false">Non-fiction</button>
  <button type="button" data-kind="both" aria-pressed="true">Both</button>
</div>
<div class="controls">
  <div class="crow" role="group" aria-labelledby="lbl-pick"><span class="lbl" id="lbl-pick">Show the books with screen potential for what I develop</span>{pick_btns}</div>
  <p class="pickinfo" id="pickinfo"></p>
  <div class="crow" role="group" aria-labelledby="lbl-paper"><span class="lbl" id="lbl-paper">Filter by publication</span>{paper_btns}</div>
</div>
{"".join(secs)}'''


def page(ed, eds, is_index):
    keep = bs.SUBJECTS
    bs.SUBJECTS = SUBJECTS
    try:
        html = bs.page(ed, eds, is_index)  # adult page as the shell: rights modal, scripts, styles
    finally:
        bs.SUBJECTS = keep
    n = len(ed["books"])
    pubs = sorted({r["pub"] for b in ed["books"] for r in b["reviews"]})
    title = NAME if is_index else f'{NAME}, {ed["date_label"]}'
    canon = SITE + ("" if is_index else day(ed) + ".html")
    desc = (f"Every children's and young adult book reviewed in the British press, sorted by age from preschool to YA, "
            f"fiction and non-fiction, one line each. {n} books, {ed['date_label']}. Free from The Ariel.")
    archive = "".join(f'<li><a href="{E(day(e))}.html">{E(e["date_label"])}</a> <span class="n">{len(e["books"])} books</span></li>' for e in reversed(eds))
    head_end = html.index("</style>")
    html = html[:head_end] + KIDS_CSS + html[head_end:]
    html = re.sub(r"<title>.*?</title>", f"<title>{E(title)}</title>", html, count=1)
    html = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{E(desc)}">', html, count=1)
    html = re.sub(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{E(canon)}">', html, count=1)
    html = re.sub(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{E(canon)}">', html, count=1)
    html = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{E(title)}">', html, count=1)
    html = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{E(desc)}">', html, count=1)
    body_start, main_end = html.index('<a class="skip"'), html.index("</footer>") + len("</footer>")
    script_end = html.index("</script>", main_end) + len("</script>")
    new = f'''<a class="skip" href="#edition">Skip to this edition&#8217;s books</a>
<header class="bar"><div class="bar-in"><a href="/">The Ariel</a><span><a class="bar-cta sib" href="/reviews/">Grown-up books</a><a class="bar-cta" href="/#what">What The Ariel does</a></span></div></header>
<section class="hero" aria-labelledby="page-title"><div class="hero-in">
  <div class="hero-intro">
    <p class="free"><span class="free-badge">Free</span><span class="free-when">{E(ed["date_label"])}</span></p>
    <h1 id="page-title">Children&#8217;s Review <em>of</em> Reviews</h1>
    <p class="dek">Every children&#8217;s and young adult book reviewed in the British press and the specialist children&#8217;s book magazines, sorted by age from preschool to YA, one line each.</p>
    <ul class="promises">
      <li>Free, from the makers of the London Review of Reviews</li>
      <li>{n} books in this edition from {len(pubs)} publications</li>
      <li>Tell us which ages you make for and we flag the books with screen potential, and why</li>
    </ul>
  </div>
  <div class="hero-example">{example_card(ed)}</div>
  <div class="brr-card hero-form"><h2>Get it free by email</h2><p class="card-sub">Takes ten seconds. Just your email.</p>{signup_form("kids-top", "kids-page")}</div>
</div></section>
<main id="edition"><div class="wrap">
  <div class="edition-head"><h2>This edition&#8217;s books</h2><p class="meta">{n} books &middot; {E(ed.get("window", ""))}</p></div>
  {edition_body(ed)}
  <div class="cta">
    <h2>Want children&#8217;s books whose rights are available?</h2>
    <p>We don&#8217;t check rights for the Review. Sign up to The Ariel and get a first look at rights-available books directly from literary agents, matched to the ages and genres you develop.</p>
    <a href="/?utm_source=kids-review-of-reviews&amp;utm_medium=web#book">Sign up to The Ariel</a>
  </div>
  <div class="inline-signup brr-card"><h2>Get the next edition free</h2><p class="card-sub">Free. Unsubscribe in one click.</p>{signup_form("kids-bottom", "kids-page-bottom")}</div>
  <div class="archive"><h2>Past editions</h2><ul>{archive}</ul></div>
  <p class="note">Summaries are our own one-line descriptions of each review. Rave, Warm, Mixed and Critical are the reviewer&#8217;s verdict, not ours, and we only add one when the review makes it clear (Books for Keeps star ratings: 5 Rave, 4 Warm, 3 Mixed). Age bands follow the reviewer or publisher where they give one. &#9733; marks books we think have screen potential. We haven&#8217;t checked who holds the film and TV rights, and some may already be optioned. Sources in this edition: {E(", ".join(pubs))}.</p>
</div></main>
<footer>The Ariel &middot; Personalised story intelligence for screen &middot; <a href="/">theariel.tv</a> &middot; <a href="/reviews/">London Review of Reviews</a> &middot; <a href="mailto:hello@theariel.tv">hello@theariel.tv</a></footer>
<script>{KIDS_JS}</script>'''
    html = html[:body_start] + new + html[script_end:]
    return html


def main():
    eds = load_editions()
    for ed in eds:
        check(ed)
        changed = False
        for b in ed["books"]:
            if not b.get("book_id"):
                b["book_id"] = bs.book_id(b); changed = True
        if changed:
            json.dump(ed, open(os.path.join(ED_DIR, day(ed) + ".json"), "w"), ensure_ascii=False, indent=1)
    latest = eds[-1]
    for ed in eds:
        open(os.path.join(OUT_DIR, day(ed) + ".html"), "w").write(page(ed, eds, False))
    open(os.path.join(OUT_DIR, "index.html"), "w").write(page(latest, eds, True))
    json.dump(latest, open(os.path.join(ED_DIR, "latest.json"), "w"), ensure_ascii=False, indent=1)
    sm_path = os.path.join(ROOT, "sitemap.xml")
    sm = open(sm_path).read()
    for u in [SITE] + [SITE + day(e) + ".html" for e in eds]:
        if f"<loc>{u}</loc>" not in sm:
            sm = sm.replace("</urlset>", f"  <url><loc>{u}</loc><lastmod>{date.today().isoformat()}</lastmod></url>\n</urlset>")
    open(sm_path, "w").write(sm)
    print(f"built {len(eds)} children's edition page(s); latest {latest['edition_id']} ({len(latest['books'])} books)")


if __name__ == "__main__":
    main()
