#!/usr/bin/env python3
"""Build theariel.tv/talent-agencies/ (Talent Agency Database) from data/*.json.

  python3 _tools/agencies/build.py

Agencies and agents who represent documentary / unscripted talent or package and sell
projects, UK and US. Emails appear only when printed on the agency's own site (with source).
"""
import html, json, re, sys
from pathlib import Path
from datetime import date

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(__file__).resolve().parent / "data"
OUT = ROOT / "talent-agencies"
REGIONS = ["UK", "US"]

def e(s): return html.escape(str(s or ""), quote=True)
def slug(s): return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")
def dom(u):
    m = re.match(r"https?://(?:www\.)?([^/]+)", u or ""); return m.group(1) if m else "source"
def nice(d):
    try:
        y, m, dd = [int(x) for x in str(d)[:10].split("-")]; return date(y, m, dd).strftime("%-d %B %Y")
    except Exception: return str(d or "")
def mdate(d):
    m = re.match(r"^(\d{4})-(\d{2})", str(d or ""))
    return date(int(m.group(1)), int(m.group(2)), 1).strftime("%b %Y") if m else str(d or "")

def load():
    groups = []
    for f in sorted(DATA.glob("*.json")):
        g = json.loads(f.read_text())
        for a in g.get("agencies", []):
            if a.get("published_email") and not a.get("email_source_url"): sys.exit(f"{a['name']}: email without source")
            for p in a.get("agents") or []:
                if p.get("published_email") and not p.get("email_source_url"): sys.exit(f"{p['name']}: email without source")
            a["agents"] = [p for p in a.get("agents") or [] if p.get("sources")]
        g["agencies"] = [a for a in g.get("agencies", []) if a.get("sources") or a.get("agents")]
        groups.append(g)
    groups.sort(key=lambda g: REGIONS.index(g.get("region", "UK")) if g.get("region") in REGIONS else 9)
    return groups

def card(region, a):
    agents = "".join(
        f'<li><strong>{e(p.get("name"))}</strong>{(", " + e(p.get("title"))) if p.get("title") else ""}'
        f'{(" <span class=flag>To confirm</span>") if p.get("confidence") == "check" else ""}'
        f'{("<br><span class=meta>" + e(p.get("covers")) + "</span>") if p.get("covers") else ""}'
        f'{("<br><a href=mailto:" + e(p["published_email"]) + ">" + e(p["published_email"]) + "</a>") if p.get("published_email") else ""}</li>'
        for p in a.get("agents") or [])
    notable = "".join(f'<li><a href="{e(n.get("url"))}" rel="noopener" target="_blank">{e(n.get("title"))}</a>{(" &middot; " + e(n.get("desc"))) if n.get("desc") else ""}{(" (" + e(mdate(n.get("date"))) + ")") if n.get("date") else ""}</li>' for n in (a.get("notable") or [])[:3] if n.get("url"))
    contact = ""
    if a.get("contact_url"):
        contact = f'<a href="{e(a["contact_url"])}" rel="noopener" target="_blank">{e(a.get("contact_route") or "Official contact / submissions policy")}</a>'
    elif a.get("contact_route"):
        contact = e(a["contact_route"])
    if a.get("published_email"):
        contact += (" &middot; " if contact else "") + f'<a href="mailto:{e(a["published_email"])}">{e(a["published_email"])}</a> <span class=meta>(as published on {e(dom(a["email_source_url"]))})</span>'
    srcs = sorted({u for u in (a.get("sources") or []) + [s for p in a.get("agents") or [] for s in p.get("sources") or []]})[:5]
    q = " ".join([a.get("name", ""), a.get("what_they_do", ""), a.get("type", "")] + [p.get("name", "") + " " + p.get("covers", "") for p in a.get("agents") or []]).lower()
    return f'''<article class="card" data-r="{e(region)}" data-q="{e(q)}">
  <div class="type">{e(region)} &middot; {e(a.get("type") or "agency")}</div>
  <h3>{(f'<a href="{e(a["website"])}" rel="noopener" target="_blank">' + e(a.get("name")) + '</a>') if a.get("website") else e(a.get("name"))}{(" <span class=flag>To confirm</span>") if a.get("confidence") == "check" else ""}</h3>
  {f'<p class="what">{e(a.get("what_they_do"))}</p>' if a.get("what_they_do") else ""}
  {f'<div class="row"><span class="k">Agents</span><ul>{agents}</ul></div>' if agents else ""}
  {f'<div class="row"><span class="k">Recent deals and clients</span><ul>{notable}</ul></div>' if notable else ""}
  {f'<div class="row"><span class="k">How to approach</span><span>{contact}</span></div>' if contact else ""}
  <p class="src">Sources: {" ".join(f'<a href="{e(u)}" rel="noopener" target="_blank">{e(dom(u))}</a>' for u in srcs)}</p>
</article>'''

def main():
    groups = load()
    n_ag = sum(len(g["agencies"]) for g in groups); n_p = sum(len(a["agents"]) for g in groups for a in g["agencies"])
    checked = max((g.get("checked", "") for g in groups), default="")
    secs = []
    for g in groups:
        r = g.get("region", "UK")
        secs.append(f'<h2 class="region-h" data-r="{r}">{"United Kingdom" if r == "UK" else "United States"} <span class="n">{len(g["agencies"])} agencies</span></h2><div class="grid">' + "".join(card(r, a) for a in g["agencies"]) + "</div>")
    desc = f"The agencies and agents who represent documentary and unscripted talent and package projects for UK and US broadcasters and streamers: {n_ag} agencies, {n_p} named agents, every line sourced. Free from The Ariel."
    page = f'''<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Talent Agency Database: Documentary and Unscripted Agents, UK and US | The Ariel</title>
<meta name="description" content="{e(desc)}"><link rel="canonical" href="https://theariel.tv/talent-agencies/">
<meta property="og:type" content="website"><meta property="og:site_name" content="The Ariel"><meta property="og:title" content="Talent Agency Database: documentary and unscripted agents">
<meta property="og:description" content="{e(desc)}"><meta property="og:url" content="https://theariel.tv/talent-agencies/"><meta property="og:image" content="https://theariel.tv/link-card.png">
<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/ariel-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Lato:wght@400;700;900&display=swap" rel="stylesheet">
<style>
:root{{--ink:#1B1F3B;--ivory:#F8F5F0;--paper:#FFFFFF;--gold:#B8965A;--gold-light:#E2C891;--gold-deep:#6E5428;--text:#1E2233;--muted:#454D60;--line:#CFC9BE;--tint:#F4ECDD;--warn:#8A2F3A}}
*,*::before,*::after{{box-sizing:border-box}} html{{-webkit-text-size-adjust:100%}}
body{{margin:0;font-family:'Lato',-apple-system,'Segoe UI',sans-serif;color:var(--text);background:var(--ivory);line-height:1.6;font-size:17px}}
a{{color:var(--gold-deep);text-underline-offset:2px}}
.wrap{{max-width:1120px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}}
.bar{{background:var(--ink);padding-block:14px}} .bar .wrap{{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}}
.bar a{{color:#FFF;text-decoration:none;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:600}}
.bar a.cta{{font-family:'Lato',sans-serif;font-size:14px;font-weight:700;color:var(--gold-light)}}
.hero{{background:var(--ink);color:#FFF;padding-block:34px 40px}}
.badge{{display:inline-block;background:var(--gold);color:var(--ink);font-weight:900;font-size:14px;letter-spacing:.14em;text-transform:uppercase;padding:5px 12px;border-radius:2px}}
h1{{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:clamp(38px,6vw,58px);line-height:1.05;margin:14px 0 10px}}
.dek{{color:#E9E5DD;font-size:18px;margin:0}}
.tools{{position:sticky;top:0;z-index:5;background:var(--ivory);border-bottom:1px solid var(--line);padding-block:12px}}
.tools .wrap{{display:flex;gap:10px;flex-wrap:wrap;align-items:center}}
.tools button{{min-height:44px;padding:0 18px;border:2px solid var(--ink);background:var(--paper);border-radius:4px;font:inherit;font-weight:900;color:var(--ink);cursor:pointer}}
.tools button[aria-pressed=true]{{background:var(--ink);color:#FFF}}
.tools input{{flex:1;min-width:200px;min-height:44px;padding:8px 14px;border:1px solid var(--line);border-radius:999px;font:inherit;font-size:16px;background:var(--paper)}}
main{{padding-block:20px 48px}}
.region-h{{font-family:'Cormorant Garamond',Georgia,serif;font-size:44px;margin:18px 0 12px}} .region-h .n{{font-family:'Lato',sans-serif;font-size:14px;color:var(--muted);font-weight:700}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px}}
.card{{background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:18px 20px}}
.card h3{{font-family:'Cormorant Garamond',Georgia,serif;font-size:27px;margin:2px 0 4px;line-height:1.15}} .card h3 a{{color:var(--ink);text-decoration:none}}
.type{{font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-deep)}}
.what{{margin:4px 0 0;color:var(--muted);font-size:15px}} .row{{margin-top:12px;font-size:15px}}
.k{{display:block;font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-deep);margin-bottom:2px}}
.card ul{{margin:0;padding-left:18px}} .card li{{margin:4px 0}} .meta{{color:var(--muted)}}
.src{{margin:14px 0 0;font-size:13px;color:var(--muted)}} .src a{{color:var(--muted)}}
.flag{{display:inline-block;vertical-align:middle;font-family:'Lato',sans-serif;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--warn);border:1px solid var(--warn);border-radius:2px;padding:1px 6px;margin-left:6px}}
.note{{background:var(--paper);border-left:4px solid var(--gold);padding:16px 20px;border-radius:0 6px 6px 0;margin-top:28px}}
footer{{background:var(--ink);color:#D8D3C8;text-align:center;font-size:14px;padding:22px 16px}} footer a{{color:var(--gold-light)}}
@media (max-width:820px){{ .grid{{grid-template-columns:1fr}} .tools{{position:static}} }}
</style></head><body>
<header class="bar"><div class="wrap"><a href="/">The Ariel</a><span><a class="cta" href="/commissioners/">Commissioners</a> &nbsp; <a class="cta" href="/commissioners/whos-buying-what/">Who&#8217;s Buying What</a></span></div></header>
<section class="hero"><div class="wrap">
  <span class="badge">Free</span>
  <h1>Talent Agency Database: documentary and unscripted</h1>
  <p class="dek">The agencies and agents who represent documentary and unscripted talent, and package and sell projects to UK and US broadcasters and streamers. {n_ag} agencies, {n_p} named agents, checked {e(nice(checked))}.</p>
</div></section>
<div class="tools"><div class="wrap">
  <button type="button" data-r="all" aria-pressed="true">All</button>{"".join(f'<button type="button" data-r="{r}" aria-pressed="false">{r}</button>' for r in REGIONS if any(g.get("region") == r for g in groups))}
  <input type="search" id="q" placeholder="Search agencies, agents, clients" aria-label="Search">
</div></div>
<main class="wrap">
{"".join(secs)}
<div class="note"><p><strong>Agents: is your entry right?</strong> We build this from agencies&#8217; own sites and published announcements. To correct it, or to tell producers what you are looking for, email <a href="mailto:hello@theariel.tv?subject=Talent%20Agency%20Database">hello@theariel.tv</a>.</p>
<p>Most agencies do not accept unsolicited submissions; where an agency publishes its policy we link it. Emails appear only where the agency prints them on its own site.</p></div>
</main>
<footer>The Ariel &middot; Personalised story intelligence for screen &middot; <a href="/">theariel.tv</a> &middot; <a href="/commissioners/">UK &amp; US commissioners</a> &middot; <a href="/commissioners/whos-buying-what/">Who&#8217;s Buying What</a> &middot; <a href="/documentary-funding/">Documentary funding</a></footer>
<script>
(function(){{var rg='all',q=document.getElementById('q'),cards=[].slice.call(document.querySelectorAll('.card'));
function apply(){{var t=(q.value||'').trim().toLowerCase();cards.forEach(function(c){{c.hidden=!((rg==='all'||c.dataset.r===rg)&&(!t||c.dataset.q.indexOf(t)>-1));}});
document.querySelectorAll('.region-h').forEach(function(h){{var any=cards.some(function(c){{return c.dataset.r===h.dataset.r&&!c.hidden;}});h.hidden=!any;h.nextElementSibling.hidden=!any;}});}}
document.querySelectorAll('.tools button').forEach(function(b){{b.addEventListener('click',function(){{rg=b.dataset.r;document.querySelectorAll('.tools button').forEach(function(x){{x.setAttribute('aria-pressed',x===b);}});apply();}});}});
q.addEventListener('input',apply);}})();
</script></body></html>'''
    OUT.mkdir(exist_ok=True)
    (OUT / "index.html").write_text(page, encoding="utf-8")
    print(f"built {n_ag} agencies, {n_p} agents -> {OUT/'index.html'}")

if __name__ == "__main__":
    main()
