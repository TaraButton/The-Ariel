#!/usr/bin/env python3
"""Build theariel.tv/commissioners/ from data/*.json.

  python3 _tools/commissioners/build.py

Writes commissioners/index.html and commissioners/download/uk-tv-commissioners.{xlsx,csv}.
Every line on the page carries its sources and the date it was checked. Email
addresses appear ONLY when published_email + email_source_url are set (an address
printed on the broadcaster's own page). Never add a guessed address to data/.
"""
import csv, html, json, re, sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(__file__).resolve().parent / "data"
OUT = ROOT / "commissioners"
DL = OUT / "download"
ENDPOINT = json.loads((ROOT / "_tools/brr/config.json").read_text())["endpoint"]
ORDER = ["BBC", "Channel 4", "ITV", "Channel 5", "Sky", "UKTV", "Warner Bros. Discovery", "Netflix", "Amazon", "Apple TV+", "Disney+", "Sony",
         "Netflix (US)", "Amazon (US)", "Apple TV+ (US)", "HBO", "CNN", "Warner Bros. Discovery (US)", "Paramount", "NBCUniversal",
         "Hulu", "ABC News Studios", "FX", "ESPN Films", "National Geographic (US)", "Disney+ (US)", "PBS", "A+E Networks", "MSNBC", "Fox"]
REGIONS = ["UK", "US"]

def e(s): return html.escape(str(s or ""), quote=True)
def slug(s): return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")

def nice_date(d):
    try:
        y, m, dd = [int(x) for x in str(d)[:10].split("-")]
        return date(y, m, dd).strftime("%-d %B %Y")
    except Exception:
        return str(d or "")

def mdate(d):
    m = re.match(r"^(\d{4})-(\d{2})(?:-\d{2})?$", str(d or "").strip())
    if m:
        return date(int(m.group(1)), int(m.group(2)), 1).strftime("%b %Y")
    return str(d or "")

def domain(u):
    m = re.match(r"https?://(?:www\.)?([^/]+)", u or "")
    return m.group(1) if m else "source"

def load():
    groups = []
    for f in sorted(DATA.glob("*.json")):
        g = json.loads(f.read_text())
        for c in g.get("commissioners", []):
            for r in c.get("recent_commissions") or []:
                r["date"] = mdate(r.get("date"))
        for r in g.get("briefs") or []:
            r["date"] = mdate(r.get("date"))
        for c in g.get("commissioners", []):
            if c.get("published_email") and not c.get("email_source_url"):
                sys.exit(f"{f.name}: {c.get('name')} has an email with no email_source_url - refusing to publish")
            if not c.get("sources"):
                sys.exit(f"{f.name}: {c.get('name')} has no sources - refusing to publish")
        g.setdefault("region", "UK")
        if g.get("commissioners"):
            groups.append(g)
    groups.sort(key=lambda g: (REGIONS.index(g["region"]) if g["region"] in REGIONS else 9, ORDER.index(g["broadcaster"]) if g["broadcaster"] in ORDER else 99))
    return groups

def card(b, c, checked):
    recent = "".join(
        f'<li><a href="{e(r.get("url"))}" rel="noopener" target="_blank">{e(r.get("title"))}</a>'
        f'{(" &middot; " + e(r.get("desc"))) if r.get("desc") else ""}'
        f'{(" <span class=when>(" + e(r.get("date")) + ")</span>") if r.get("date") else ""}</li>'
        for r in (c.get("recent_commissions") or [])[:3] if r.get("title"))
    pitch = ""
    if c.get("pitch_url"):
        pitch = f'<a href="{e(c["pitch_url"])}" rel="noopener" target="_blank">{e(c.get("pitch_route") or "Official pitch route")}</a>'
    elif c.get("pitch_route"):
        pitch = e(c["pitch_route"])
    mail = ""
    if c.get("published_email"):
        last = re.sub(r"[^a-z]", "", (c.get("name") or "").split()[-1].lower())
        personal = bool(last) and last[:5] in re.sub(r"[^a-z]", "", c["published_email"].split("@")[0].lower())
        mail = (f'<div class="row"><span class="k">{"Email" if personal else "Team email"}</span><span><a href="mailto:{e(c["published_email"])}">{e(c["published_email"])}</a> '
                f'<a class="src" href="{e(c["email_source_url"])}" rel="noopener" target="_blank">(as published by {e(domain(c["email_source_url"]))})</a></span></div>')
    srcs = " ".join(f'<a href="{e(u)}" rel="noopener" target="_blank">{e(domain(u))}</a>' for u in (c.get("sources") or [])[:4])
    flag = '<span class="flag" title="Latest public confirmation is over a year old">To confirm</span>' if c.get("confidence") == "check" else ""
    search = " ".join([c.get("name", ""), c.get("title", ""), c.get("remit", ""), b] + [r.get("title", "") for r in c.get("recent_commissions") or []]).lower()
    return f'''<article class="card" data-b="{e(slug(b))}" data-q="{e(search)}">
  <h3>{e(c.get("name"))} {flag}</h3>
  <p class="role">{e(c.get("title"))}{(" &middot; " + e(", ".join(c.get("channels") or []))) if c.get("channels") else ""}</p>
  {f'<p class="remit">{e(c.get("remit"))}</p>' if c.get("remit") else ""}
  {f'<div class="row"><span class="k">Recent commissions</span><ul>{recent}</ul></div>' if recent else ""}
  {f'<div class="row"><span class="k">How to pitch</span><span>{pitch}</span></div>' if pitch else ""}
  {mail}
  <p class="srcline">Sources: {srcs} &middot; checked {e(nice_date(checked))}</p>
</article>'''

def build():
    groups = load()
    total = sum(len(g.get("commissioners", [])) for g in groups)
    checked = max((g.get("checked", "") for g in groups), default=str(date.today()))
    bl = [("the BBC" if g["broadcaster"] == "BBC" else g["broadcaster"]) for g in groups]
    names = bl[0] if len(bl) == 1 else ", ".join(bl[:-1]) + " and " + bl[-1]
    nav = "".join(f'<button type="button" data-f="{e(slug(g["broadcaster"]))}" data-r="{e(g["region"])}" aria-pressed="false">{e(g["broadcaster"])}</button>' for g in groups)
    regions_present = [r for r in REGIONS if any(g["region"] == r for g in groups)]
    rcount = {r: sum(len(g["commissioners"]) for g in groups if g["region"] == r) for r in regions_present}
    regionbar = "".join(f'<button type="button" data-region="{r}" aria-pressed="false">{r} <span class="rn">{rcount[r]}</span></button>' for r in regions_present)
    rlabel = " and ".join(regions_present)
    seen_region = set()
    sections = []
    for g in groups:
        b = g["broadcaster"]
        routes = "".join(f'<li><strong>{e(r.get("genre"))}</strong>: <a href="{e(r.get("url"))}" rel="noopener" target="_blank">{e(r.get("route") or r.get("url"))}</a></li>' for r in g.get("pitch_routes") or [] if r.get("url"))
        briefs = "".join(f'<li><a href="{e(r.get("url"))}" rel="noopener" target="_blank">{e(r.get("title"))}</a>{(" &middot; " + e(r.get("summary"))) if r.get("summary") else ""}{(" <span class=when>(" + e(r.get("date")) + ")</span>") if r.get("date") else ""}</li>' for r in g.get("briefs") or [] if r.get("url"))
        cards = "\n".join(card(b, c, g.get("checked")).replace('<article class="card" ', f'<article class="card" data-r="{e(g["region"])}" ', 1) for c in g.get("commissioners", []))
        if g["region"] not in seen_region:
            seen_region.add(g["region"])
            sections.append(f'<h2 class="region-h" data-r="{e(g["region"])}" id="region-{e(g["region"].lower())}">{"United Kingdom" if g["region"] == "UK" else "United States"}</h2>')
        sections.append(f'''<section class="bc" id="{e(slug(b))}" data-b="{e(slug(b))}" data-r="{e(g["region"])}">
  <h2>{e(b)} <span class="n">{len(g.get("commissioners", []))} commissioners</span></h2>
  <div class="how">{f'<div><h4>Official pitch routes</h4><ul>{routes}</ul></div>' if routes else ""}{f'<div><h4>What they say they want now</h4><ul>{briefs}</ul></div>' if briefs else ""}</div>
  <div class="grid">{cards}</div>
</section>''')
    qm_data = [{"b": g["broadcaster"], "r": g["region"], "n": c.get("name", ""), "title": c.get("title", ""), "remit": c.get("remit", ""),
                "pr": c.get("pitch_route", ""), "pu": c.get("pitch_url", ""), "check": c.get("confidence") == "check",
                "rc": [{"title": r.get("title", ""), "desc": r.get("desc", ""), "date": r.get("date", ""), "url": r.get("url", "")} for r in (c.get("recent_commissions") or [])[:3]]}
               for g in groups for c in g.get("commissioners", [])]
    qm_json = json.dumps(qm_data, ensure_ascii=False).replace("</", "<" + chr(92) + "/")
    qm_js = (Path(__file__).resolve().parent / "quickmatch.js").read_text()
    desc = f"Who commissions factual and documentary at {names}: {total} commissioners, what they have recently commissioned and the official way to pitch each. Every line sourced, checked {nice_date(checked)}. Free download."
    page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>UK and US TV Commissioners: Factual and Documentary | The Ariel</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="https://theariel.tv/commissioners/">
<meta property="og:type" content="website"><meta property="og:site_name" content="The Ariel">
<meta property="og:url" content="https://theariel.tv/commissioners/">
<meta property="og:title" content="UK and US TV Commissioners: Factual and Documentary">
<meta property="og:description" content="{e(desc)}">
<meta property="og:image" content="https://theariel.tv/link-card.png"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/ariel-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Lato:wght@400;700;900&display=swap" rel="stylesheet">
<style>
:root{{--ink:#1B1F3B;--ivory:#F8F5F0;--paper:#FFFFFF;--gold:#B8965A;--gold-light:#E2C891;--gold-deep:#6E5428;--text:#1E2233;--muted:#454D60;--line:#CFC9BE;--tint:#F4ECDD;--ok:#245C36;--warn:#8A2F3A}}
*,*::before,*::after{{box-sizing:border-box}}
html{{-webkit-text-size-adjust:100%}}
body{{margin:0;font-family:'Lato',-apple-system,'Segoe UI',sans-serif;color:var(--text);background:var(--ivory);line-height:1.6;font-size:17px;-webkit-font-smoothing:antialiased}}
a{{color:var(--gold-deep);text-underline-offset:2px}}
a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{{outline:3px solid var(--gold);outline-offset:2px}}
.wrap{{max-width:1120px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}}
.bar{{background:var(--ink);padding-block:14px}}
.bar .wrap{{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}}
.bar a{{color:#FFF;text-decoration:none;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:600;letter-spacing:.04em}}
.bar a.cta{{font-family:'Lato',sans-serif;font-size:14px;font-weight:700;letter-spacing:.06em;color:var(--gold-light)}}
.hero{{background:var(--ink);color:#FFF;padding-block:40px 52px}}
.hero .wrap{{display:grid;grid-template-columns:1.1fr .9fr;gap:44px;align-items:start}}
.hero .wrap>*{{min-width:0}}
.badge{{display:inline-block;background:var(--gold);color:var(--ink);font-weight:900;font-size:14px;letter-spacing:.14em;text-transform:uppercase;padding:5px 12px;border-radius:2px}}
h1{{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:clamp(38px,6vw,60px);line-height:1.04;margin:16px 0 14px}}
.dek{{font-size:19px;color:#E9E5DD;margin:0 0 18px}}
.facts{{list-style:none;padding:0;margin:0;color:#D8D3C8;font-size:16px}}
.facts li{{padding-left:22px;position:relative;margin:6px 0}}
.facts li::before{{content:"";position:absolute;left:0;top:.62em;width:10px;height:2px;background:var(--gold)}}
.form{{background:var(--paper);color:var(--text);border-radius:6px;padding:24px;border-top:4px solid var(--gold)}}
.form h2{{font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;margin:0 0 6px;line-height:1.1}}
.form p{{margin:0 0 14px;color:var(--muted);font-size:15px}}
.form label{{display:block;font-size:13px;font-weight:700;letter-spacing:.04em;margin:10px 0 4px}}
.form input[type=email],.form input[type=text],.form select{{width:100%;min-height:46px;padding:10px 12px;border:1px solid var(--line);border-radius:4px;font:inherit;font-size:16px;background:#FFF;color:var(--text)}}
.form .two{{display:grid;grid-template-columns:1fr 1fr;gap:10px}}
.form .chk{{display:flex;gap:10px;align-items:flex-start;font-weight:400;font-size:15px;letter-spacing:0;margin-top:14px}}
.form .chk input{{width:20px;height:20px;margin-top:3px;flex:none}}
.form button{{margin-top:16px;width:100%;min-height:50px;border:0;border-radius:4px;background:var(--ink);color:#FFF;font:inherit;font-weight:900;letter-spacing:.08em;text-transform:uppercase;font-size:14px;cursor:pointer}}
.form button:hover{{background:#2A3058}}
.form .msg{{margin-top:12px;font-size:15px}}
.form .msg.ok{{color:var(--ok)}} .form .msg.err{{color:var(--warn)}}
.hp{{position:absolute;left:-9999px}}
.small{{font-size:13px;color:var(--muted);margin-top:10px}}
.tools{{position:sticky;top:0;z-index:5;background:var(--ivory);border-bottom:1px solid var(--line);padding-block:14px}}
.tools .wrap{{display:flex;gap:12px;flex-wrap:wrap;align-items:center}}
.filters{{display:flex;gap:6px;flex-wrap:wrap}}
.filters button{{min-height:42px;padding:0 16px;border:1px solid var(--line);background:var(--paper);border-radius:999px;font:inherit;font-size:15px;font-weight:700;color:var(--muted);cursor:pointer}}
.filters button[aria-pressed=true]{{background:var(--ink);border-color:var(--ink);color:#FFF}}
.tools input{{flex:1;min-width:200px;min-height:42px;padding:8px 14px;border:1px solid var(--line);border-radius:999px;font:inherit;font-size:16px;background:var(--paper)}}
main{{padding-block:28px 56px}}
.bc{{margin-bottom:44px}}
.region-h{{font-family:'Cormorant Garamond',Georgia,serif;font-size:48px;margin:8px 0 18px;color:var(--ink)}}
.regionbar{{display:flex;gap:6px;width:100%}}
.regionbar button{{min-height:44px;padding:0 20px;border:2px solid var(--ink);background:var(--paper);border-radius:4px;font:inherit;font-size:16px;font-weight:900;color:var(--ink);cursor:pointer}}
.regionbar button[aria-pressed=true]{{background:var(--ink);color:#FFF}}
.regionbar .rn{{font-weight:400;opacity:.7;margin-left:4px}}
.bc h2{{font-family:'Cormorant Garamond',Georgia,serif;font-size:38px;margin:0 0 12px;border-bottom:2px solid var(--gold);padding-bottom:6px}}
.bc h2 .n{{font-family:'Lato',sans-serif;font-size:14px;color:var(--muted);font-weight:700;letter-spacing:.06em;margin-left:8px}}
.how{{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px}}
.how>div{{background:var(--tint);border-radius:6px;padding:14px 18px}}
.how h4{{margin:0 0 6px;font-size:13px;letter-spacing:.1em;text-transform:uppercase}}
.how ul{{margin:0;padding-left:18px;font-size:15px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}}
.card{{background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:18px 20px}}
.card h3{{font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;margin:0;line-height:1.15}}
.card .role{{margin:4px 0 0;font-weight:700;font-size:15px}}
.card .remit{{margin:4px 0 0;color:var(--muted);font-size:15px}}
.card .row{{margin-top:12px;font-size:15px}}
.card .k{{display:block;font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-deep);margin-bottom:2px}}
.card ul{{margin:0;padding-left:18px}}
.card .when{{color:var(--muted)}}
.card .src{{font-size:13px;color:var(--muted)}}
.srcline{{margin:14px 0 0;font-size:13px;color:var(--muted)}}
.srcline a{{color:var(--muted)}}
.flag{{display:inline-block;vertical-align:middle;font-family:'Lato',sans-serif;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--warn);border:1px solid var(--warn);border-radius:2px;padding:1px 6px;margin-left:6px}}
.note{{background:var(--paper);border-left:4px solid var(--gold);padding:18px 22px;border-radius:0 6px 6px 0;margin-top:8px}}
.note h2{{font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;margin:0 0 6px}}
.empty{{display:none;color:var(--muted)}}
footer{{background:var(--ink);color:#D8D3C8;text-align:center;font-size:14px;padding:22px 16px}}
footer a{{color:var(--gold-light)}}
.sr{{position:absolute;left:-9999px}}
.qm-wrap{{background:var(--paper);border-bottom:1px solid var(--line);padding-block:32px}}
.qm-wrap h2{{font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;margin:0 0 4px}}
.qm-sub{{margin:0 0 14px;color:var(--muted)}}
.qm-form{{display:flex;gap:10px;flex-wrap:wrap}}
.qm-form input{{flex:1;min-width:220px;min-height:50px;padding:10px 14px;border:2px solid var(--gold);border-radius:4px;font:inherit;font-size:17px}}
.qm-form button,.qm-gate button{{min-height:50px;padding:0 22px;border:0;border-radius:4px;background:var(--ink);color:#FFF;font:inherit;font-weight:900;letter-spacing:.06em;text-transform:uppercase;font-size:14px;cursor:pointer}}
.qm-note{{margin:16px 0 10px;color:var(--muted)}}
.qm-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}}
.qm-card{{border:1px solid var(--line);border-top:3px solid var(--gold);border-radius:6px;padding:14px 16px;background:var(--ivory)}}
.qm-card h4{{font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;margin:2px 0 0}}
.qm-b{{font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-deep)}}
.qm-role{{margin:2px 0 6px;font-weight:700;font-size:15px}}
.qm-card ul{{margin:0 0 6px;padding-left:18px;font-size:15px}}
.qm-pitch{{margin:6px 0 0;font-size:14px}}
.qm-gate{{margin-top:16px;background:var(--tint);border-radius:6px;padding:16px 18px}}
.qm-gate p{{margin:0 0 10px}}
.qm-gate form{{display:flex;gap:10px;flex-wrap:wrap;align-items:center}}
.qm-gate input[type=email]{{flex:1;min-width:220px;min-height:50px;padding:10px 14px;border:1px solid var(--line);border-radius:4px;font:inherit;font-size:16px}}
.qm-gate .chk{{display:flex;gap:8px;align-items:center;width:100%;font-size:14px}}
.qm-msg{{color:var(--warn);margin:8px 0 0}}
@media (max-width:820px){{
  .hero .wrap{{grid-template-columns:1fr;gap:28px}}
  .how{{grid-template-columns:1fr}}
  .grid{{grid-template-columns:1fr}}
  .form .two{{grid-template-columns:1fr}}
  .tools{{position:static}}
}}
</style>
</head>
<body>
<header class="bar"><div class="wrap"><a href="/">The Ariel</a><span><a class="cta" href="/commissioners/whos-buying-what/">Who&#8217;s Buying What</a> &nbsp; <a class="cta" href="#match">Quick match</a></span></div></header>
<section class="hero"><div class="wrap">
  <div>
    <span class="badge">Free</span>
    <h1>{e(rlabel)} TV commissioners: factual and documentary</h1>
    <p class="dek">Who commissions documentary and factual at the {e(rlabel)} broadcasters and streamers, what they have bought recently, and the official way to pitch each team.</p>
    <ul class="facts">
      <li>{total} commissioners, checked {e(nice_date(checked))}</li>
      <li>Every line links to the page it came from</li>
      <li>Updated as people move and briefs change</li>
    </ul>
  </div>
  <form class="form" id="get" novalidate>
    <h2>Get the full list</h2>
    <p>As a spreadsheet you can sort and filter, emailed to you.</p>
    <label for="em">Email</label><input type="email" id="em" name="email" autocomplete="email" required>
    <div class="two">
      <div><label for="nm">Name</label><input type="text" id="nm" name="name" autocomplete="name"></div>
      <div><label for="co">Company</label><input type="text" id="co" name="company" autocomplete="organization"></div>
    </div>
    <label for="rl">I am a</label>
    <select id="rl" name="role"><option value="">Choose one</option><option>Producer</option><option>Development executive</option><option>Director</option><option>Agent or publisher</option><option>Writer or journalist</option><option>Other</option></select>
    <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="chk"><input type="checkbox" id="wt"> <span>Also send me Who&#8217;s Buying What: what UK and US broadcasters and streamers commissioned this week, who moved, and which briefs opened. Free, weekly, unsubscribe any time.</span></label>
    <button type="submit">Email me the list</button>
    <div class="msg" id="msg" role="status" aria-live="polite"></div>
  </form>
</div></section>
<section class="qm-wrap" id="match"><div class="wrap">
  <h2>Quick match: who would commission your idea?</h2>
  <p class="qm-sub">Type your idea in a line. We match it against every commissioner's remit and what they have actually commissioned.</p>
  <form id="qm" class="qm-form"><label for="idea" class="sr">Your idea</label><input id="idea" name="idea" type="text" maxlength="300" placeholder="e.g. music doc about a 1960s artist" autocomplete="off"><button type="submit">Find commissioners</button></form>
  <div id="qmOut" aria-live="polite"></div>
  <div id="qmGate" class="qm-gate" hidden>
    <p><strong><span id="qmRest"></span> more matches.</strong> Enter your email to see them all, with the full list emailed to you.</p>
    <form id="qmGateForm"><input type="email" name="email" placeholder="you@company.com" autocomplete="email" aria-label="Email"><input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button type="submit">Show all matches</button>
    <label class="chk"><input type="checkbox" name="watch"> <span>Also send me Who&#8217;s Buying What weekly. Unsubscribe any time.</span></label></form>
    <p class="qm-msg" id="qmMsg" role="status"></p>
  </div>
  <div id="qmMore"></div>
</div></section>
<div class="tools"><div class="wrap">
  <div class="regionbar"><button type="button" data-region="all" aria-pressed="true">All</button>{regionbar}</div>
  <div class="filters"><button type="button" data-f="all" aria-pressed="true">All companies</button>{nav}</div>
  <input type="search" id="q" placeholder="Search names, genres, programmes" aria-label="Search commissioners">
</div></div>
<main class="wrap">
{chr(10).join(sections)}
<p class="empty" id="empty">No commissioners match that search.</p>
<div class="note">
  <h2>Commissioners: is your entry right?</h2>
  <p>We build this from broadcasters' own pages and published announcements, so it can lag. If anything is out of date, or you would like to say what you are looking for right now, email <a href="mailto:hello@theariel.tv?subject=Commissioner%20list">hello@theariel.tv</a> and we will update it.</p>
  <p>Email addresses appear only where the broadcaster publishes them. Otherwise we link to the official pitch route.</p>
</div>
</main>
<footer>The Ariel &middot; Personalised story intelligence for screen &middot; <a href="/">theariel.tv</a> &middot; <a href="/commissioners/whos-buying-what/">Who&#8217;s Buying What</a> &middot; <a href="/talent-agencies/">Talent Agency Database</a> &middot; <a href="/reviews/">London Review of Reviews</a> &middot; <a href="mailto:hello@theariel.tv">hello@theariel.tv</a></footer>
<script>window.COMM_EP={json.dumps(ENDPOINT)};window.COMM_DATA={qm_json};</script>
<script>{qm_js}</script>
<script>
(function(){{
  var EP={json.dumps(ENDPOINT)}, f='all', rg='all';
  var q=document.getElementById('q'), cards=[].slice.call(document.querySelectorAll('.card')), secs=[].slice.call(document.querySelectorAll('.bc'));
  function apply(){{
    var t=(q.value||'').trim().toLowerCase(), shown=0;
    cards.forEach(function(c){{var ok=(rg==='all'||c.dataset.r===rg)&&(f==='all'||c.dataset.b===f)&&(!t||c.dataset.q.indexOf(t)>-1);c.hidden=!ok;if(ok)shown++;}});
    secs.forEach(function(s){{s.hidden=!s.querySelector('.card:not([hidden])');}});
    document.querySelectorAll('.region-h').forEach(function(h){{h.hidden=!document.querySelector('.bc[data-r="'+h.dataset.r+'"]:not([hidden])');}});
    document.querySelectorAll('.filters button[data-r]').forEach(function(b){{b.hidden=(rg!=='all'&&b.dataset.r!==rg);}});
    document.getElementById('empty').style.display=shown?'none':'block';
  }}
  document.querySelectorAll('.filters button').forEach(function(b){{b.addEventListener('click',function(){{f=b.dataset.f;document.querySelectorAll('.filters button').forEach(function(x){{x.setAttribute('aria-pressed',x===b);}});apply();}});}});
  q.addEventListener('input',apply);
  document.querySelectorAll('.regionbar button').forEach(function(b){{b.addEventListener('click',function(){{rg=b.dataset.region;window.QM_REGION=rg;f='all';document.querySelectorAll('.regionbar button').forEach(function(x){{x.setAttribute('aria-pressed',x===b);}});document.querySelectorAll('.filters button').forEach(function(x){{x.setAttribute('aria-pressed',x.dataset.f==='all');}});apply();}});}});
  var form=document.getElementById('get'), msg=document.getElementById('msg');
  form.addEventListener('submit',function(ev){{
    ev.preventDefault();
    var em=form.email.value.trim();
    if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{{2,}}$/.test(em)){{msg.textContent='Please check your email address.';msg.className='msg err';form.email.focus();return;}}
    var btn=form.querySelector('button');btn.disabled=true;btn.textContent='Sending...';msg.textContent='';
    fetch(EP,{{method:'POST',headers:{{'Content-Type':'text/plain;charset=utf-8'}},body:JSON.stringify({{action:'commissioner_list',email:em,name:form.name.value,company:form.company.value,role:form.role.value,watch:document.getElementById('wt').checked,website:form.website.value,source:'commissioners'}})}})
      .then(function(r){{return r.json();}})
      .then(function(d){{if(!d||!d.ok)throw new Error(d&&d.message||'failed');msg.textContent='Sent. Check your inbox for the list (and your spam folder, just in case).';msg.className='msg ok';form.reset();}})
      .catch(function(err){{msg.textContent=(err&&err.message&&err.message!=='failed'&&err.message.indexOf('fetch')<0)?err.message:'That did not go through. Please try again, or email hello@theariel.tv.';msg.className='msg err';}})
      .then(function(){{btn.disabled=false;btn.textContent='Email me the list';}});
  }});
}})();
</script>
</body>
</html>
'''
    OUT.mkdir(exist_ok=True); DL.mkdir(exist_ok=True)
    (OUT / "index.html").write_text(page, encoding="utf-8")

    cols = ["Region", "Broadcaster", "Name", "Job title", "Channels", "Remit", "Recent commissions", "How to pitch", "Pitch link",
            "Published email", "Email published at", "To confirm", "Sources", "Checked"]
    rows = []
    for g in groups:
        for c in g.get("commissioners", []):
            rows.append([g["region"], g["broadcaster"], c.get("name", ""), c.get("title", ""), ", ".join(c.get("channels") or []), c.get("remit", ""),
                         "; ".join(f'{r.get("title","")} ({r.get("date","")})' for r in c.get("recent_commissions") or []),
                         c.get("pitch_route", ""), c.get("pitch_url", ""), c.get("published_email", ""), c.get("email_source_url", ""),
                         "Yes" if c.get("confidence") == "check" else "", " ".join(c.get("sources") or []), g.get("checked", "")])
    with open(DL / "uk-tv-commissioners.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh); w.writerow(cols); w.writerows(rows)

    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    wb = Workbook(); ws = wb.active; ws.title = "Commissioners"
    ws.append(cols)
    for r in rows: ws.append(r)
    head = PatternFill("solid", fgColor="1B1F3B")
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF"); cell.fill = head; cell.alignment = Alignment(vertical="center", wrap_text=True)
    widths = [8, 12, 22, 34, 18, 30, 50, 30, 36, 30, 36, 10, 60, 12]
    for i, wd in enumerate(widths): ws.column_dimensions[chr(65 + i)].width = wd
    for row in ws.iter_rows(min_row=2):
        for cell in row: cell.alignment = Alignment(vertical="top", wrap_text=True)
    ws.freeze_panes = "C2"; ws.auto_filter.ref = ws.dimensions
    info = wb.create_sheet("About")
    for line in ["UK and US TV commissioners: factual and documentary", f"From The Ariel, theariel.tv/commissioners - checked {nice_date(checked)}",
                 "Every row lists the pages it came from. Email addresses appear only where the broadcaster publishes them.",
                 "Corrections or a commissioner's current wishlist: hello@theariel.tv"]:
        info.append([line])
    info.column_dimensions["A"].width = 110; info["A1"].font = Font(bold=True, size=14)
    wb.save(DL / "uk-tv-commissioners.xlsx")
    print(f"built {total} commissioners across {len(groups)} broadcasters -> {OUT/'index.html'}")

if __name__ == "__main__":
    build()
