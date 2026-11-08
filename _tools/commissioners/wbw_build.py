#!/usr/bin/env python3
"""Build theariel.tv/commissioners/whos-buying-what/ from _tools/commissioners/editions/*.json.

  python3 _tools/commissioners/wbw_build.py

Writes <edition_id>.html per edition, index.html (latest edition + archive) and latest.json
(the newsletter backend pulls latest.json hourly and emails it on its send_after time).
Refuses an item without an https url, and any edition whose main items cite a Penske Media
article (main items must come from official announcements; Penske headlines go in "trades").
A main item may carry "also": {"source": "Deadline", "url": ...} - a plain link to the trade story
on the same project, shown beside the official link. Never read the trade article to fill the item.
"""
import html, json, re, sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ED = Path(__file__).resolve().parent / "editions"
OUT = ROOT / "commissioners" / "whos-buying-what"
ENDPOINT = json.loads((ROOT / "_tools/brr/config.json").read_text())["endpoint"]
PMC = re.compile(r"https?://(www\.)?(deadline|variety|hollywoodreporter|indiewire|rollingstone|billboard|vibe|sheknows|tvline|robbreport|wwd)\.com", re.I)

def e(s): return html.escape(str(s or ""), quote=True)

def check(ed):
    for k in ("commissions", "moves", "briefs", "funding"):
        for it in ed.get(k) or []:
            u = it.get("url", "")
            if not u.startswith("https://"):
                sys.exit(f"{ed['edition_id']} {k}: item without https url: {it}")
            if PMC.match(u):
                sys.exit(f"{ed['edition_id']} {k}: main items must not cite Penske Media articles: {u}")
            al = it.get("also") or {}
            if al and (not al.get("url", "").startswith("https://") or not al.get("source")):
                sys.exit(f"{ed['edition_id']} {k}: bad 'also' link {al}")
    for t in ed.get("trades") or []:
        if not t.get("url", "").startswith("https://") or not t.get("headline"):
            sys.exit(f"{ed['edition_id']} trades: bad item {t}")

SECTIONS = [("commissions", "What got commissioned"), ("funding", "Who funded what"), ("moves", "Who moved"), ("briefs", "Briefs and open calls")]

def item_html(kind, it):
    tag = " &middot; ".join(e(x) for x in [it.get("region"), it.get("broadcaster") or it.get("funder")] if x)
    head = e(it.get("name")) if kind == "moves" else f'<strong>{e(it.get("title"))}</strong>'
    body = e(it.get("change") if kind == "moves" else it.get("what"))
    extra = []
    if it.get("commissioner"): extra.append("Commissioned by " + e(it["commissioner"]))
    if it.get("producer"): extra.append("Made by " + e(it["producer"]))
    if it.get("amount"): extra.append(e(it["amount"]))
    if it.get("deadline"): extra.append("Deadline: " + e(it["deadline"]))
    return (f'<li><span class="tag">{tag}</span>{head}{("<br>" + body) if body else ""}'
            f'{("<br><span class=meta>" + " &middot; ".join(extra) + "</span>") if extra else ""}'
            f'<br><a href="{e(it.get("url"))}" rel="noopener" target="_blank">Official announcement</a>'
            + (f' &middot; <a href="{e(it["also"]["url"])}" rel="noopener" target="_blank">{e(it["also"]["source"])} story</a>' if (it.get("also") or {}).get("url") else "")
            + '</li>')

def page(ed, editions, is_index=False):
    blocks = []
    for k, title in SECTIONS:
        items = ed.get(k) or []
        if items:
            blocks.append(f'<section><h2>{title} <span class="n">{len(items)}</span></h2><ul class="items">{"".join(item_html(k, it) for it in items)}</ul></section>')
    if ed.get("trades"):
        lis = "".join(f'<li><a href="{e(t["url"])}" rel="noopener" target="_blank">{e(t["headline"])}</a> <span class="meta">({e(t["source"])})</span></li>' for t in ed["trades"])
        blocks.append(f'<section><h2>Also in the trades <span class="n">{len(ed["trades"])}</span></h2><p class="note">Headlines as the publishers wrote them, linked to their sites.</p><ul class="trades">{lis}</ul></section>')
    archive = "".join(f'<li><a href="/commissioners/whos-buying-what/{e(x["edition_id"])}.html">{e(x.get("date_label") or x["edition_id"])}</a></li>' for x in editions)
    canon = "https://theariel.tv/commissioners/whos-buying-what/" + ("" if is_index else ed["edition_id"] + ".html")
    title = "Who's Buying What" + ("" if is_index else ": " + ed.get("date_label", ""))
    desc = f"What UK and US broadcasters and streamers commissioned in documentary and factual, who moved and which briefs opened. {ed.get('window','')}. Free weekly from The Ariel."
    return f'''<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{e(title)} | The Ariel</title>
<meta name="description" content="{e(desc)}"><link rel="canonical" href="{canon}">
<meta property="og:type" content="article"><meta property="og:site_name" content="The Ariel"><meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{canon}"><meta property="og:image" content="https://theariel.tv/link-card.png">
<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/ariel-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Lato:wght@400;700;900&display=swap" rel="stylesheet">
<style>
:root{{--ink:#1B1F3B;--ivory:#F8F5F0;--paper:#FFFFFF;--gold:#B8965A;--gold-light:#E2C891;--gold-deep:#6E5428;--text:#1E2233;--muted:#454D60;--line:#CFC9BE;--tint:#F4ECDD;--ok:#245C36;--warn:#8A2F3A}}
*,*::before,*::after{{box-sizing:border-box}} html{{-webkit-text-size-adjust:100%}}
body{{margin:0;font-family:'Lato',-apple-system,'Segoe UI',sans-serif;color:var(--text);background:var(--ivory);line-height:1.6;font-size:17px}}
a{{color:var(--gold-deep);text-underline-offset:2px}}
.wrap{{max-width:860px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}}
.bar{{background:var(--ink);padding-block:14px}} .bar .wrap{{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}}
.bar a{{color:#FFF;text-decoration:none;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:600}}
.bar a.cta{{font-family:'Lato',sans-serif;font-size:14px;font-weight:700;color:var(--gold-light)}}
.hero{{background:var(--ink);color:#FFF;padding-block:34px 40px}}
.badge{{display:inline-block;background:var(--gold);color:var(--ink);font-weight:900;font-size:14px;letter-spacing:.14em;text-transform:uppercase;padding:5px 12px;border-radius:2px}}
h1{{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:clamp(40px,7vw,62px);line-height:1.04;margin:14px 0 6px}}
.when{{color:var(--gold-light);font-weight:700;letter-spacing:.04em}} .intro{{color:#E9E5DD;font-size:18px;margin:12px 0 0}}
.sub{{background:var(--paper);border-bottom:1px solid var(--line);padding-block:18px}}
.sub form{{display:flex;gap:10px;flex-wrap:wrap;align-items:center}}
.sub input[type=email]{{flex:1;min-width:220px;min-height:48px;padding:10px 14px;border:2px solid var(--gold);border-radius:4px;font:inherit;font-size:16px}}
.sub button{{min-height:48px;padding:0 20px;border:0;border-radius:4px;background:var(--ink);color:#FFF;font:inherit;font-weight:900;letter-spacing:.06em;text-transform:uppercase;font-size:14px;cursor:pointer}}
.sub p{{margin:0 0 10px;color:var(--muted)}} .hp{{position:absolute;left:-9999px}} .msg{{width:100%;margin:6px 0 0}}
main{{padding-block:24px 48px}}
section h2{{font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;margin:26px 0 8px;border-bottom:2px solid var(--gold);padding-bottom:4px}}
section h2 .n{{font-family:'Lato',sans-serif;font-size:14px;color:var(--muted);font-weight:700;margin-left:6px}}
ul.items{{list-style:none;padding:0;margin:0}} ul.items li{{background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:14px 16px;margin:10px 0}}
.tag{{display:block;font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-deep)}}
.meta{{color:var(--muted);font-size:15px}} .note{{color:var(--muted);font-size:15px;margin:0 0 6px}}
ul.trades{{padding-left:20px}} ul.trades li{{margin:6px 0}}
.archive{{background:var(--tint);border-radius:6px;padding:14px 18px;margin-top:30px}} .archive h3{{margin:0 0 6px;font-size:14px;letter-spacing:.1em;text-transform:uppercase}}
.small{{font-size:14px;color:var(--muted);margin-top:24px}}
footer{{background:var(--ink);color:#D8D3C8;text-align:center;font-size:14px;padding:22px 16px}} footer a{{color:var(--gold-light)}}
</style></head><body>
<header class="bar"><div class="wrap"><a href="/">The Ariel</a><a class="cta" href="/commissioners/">UK &amp; US commissioners list</a></div></header>
<section class="hero"><div class="wrap">
  <span class="badge">Free weekly</span>
  <h1>Who&#8217;s Buying What</h1>
  <div class="when">{e(ed.get("date_label"))} &middot; {e(ed.get("window"))}</div>
  <p class="intro">{e(ed.get("intro"))}</p>
</div></section>
<div class="sub"><div class="wrap">
  <p>Get it every Friday: what UK and US broadcasters and streamers commissioned in documentary and factual, who moved, and which briefs opened.</p>
  <form id="wbw"><input type="email" name="email" placeholder="you@company.com" aria-label="Email" autocomplete="email"><input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button type="submit">Send it to me</button><div class="msg" id="msg" role="status" aria-live="polite"></div></form>
</div></div>
<main class="wrap">
{"".join(blocks)}
<div class="archive"><h3>Past editions</h3><ul>{archive}</ul></div>
<p class="small">Main items are written by The Ariel from the broadcasters&#8217; and streamers&#8217; own announcements, each linked. Trade headlines are the publishers&#8217; own. Spot an error? <a href="mailto:hello@theariel.tv?subject=Who%27s%20Buying%20What">hello@theariel.tv</a></p>
</main>
<footer>The Ariel &middot; Personalised story intelligence for screen &middot; <a href="/">theariel.tv</a> &middot; <a href="/commissioners/">Commissioners list</a> &middot; <a href="/reviews/">London Review of Reviews</a> &middot; <a href="/documentary-funding/">Documentary Funding Directory</a></footer>
<script>
(function(){{var f=document.getElementById('wbw'),m=document.getElementById('msg');f.addEventListener('submit',function(ev){{ev.preventDefault();var em=f.email.value.trim();
if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{{2,}}$/.test(em)){{m.textContent='Please check your email address.';return;}}
var b=f.querySelector('button');b.disabled=true;
fetch({json.dumps(ENDPOINT)},{{method:'POST',headers:{{'Content-Type':'text/plain;charset=utf-8'}},body:JSON.stringify({{action:'commissioner_list',email:em,watch:true,website:f.website.value,source:'wbw'}})}})
.then(function(r){{return r.json();}}).then(function(d){{if(!d||!d.ok)throw 0;m.textContent='Done. You will get the next edition on Friday, and we have emailed you the full commissioners list.';f.reset();}})
.catch(function(){{m.textContent='That did not go through. Please try again.';}}).then(function(){{b.disabled=false;}});}});}})();
</script></body></html>'''

def main():
    eds = [json.loads(p.read_text()) for p in sorted(ED.glob("*.json"))]
    if not eds:
        sys.exit("no editions")
    for ed in eds: check(ed)
    eds.sort(key=lambda x: x["edition_id"], reverse=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for ed in eds:
        (OUT / f'{ed["edition_id"]}.html').write_text(page(ed, eds), encoding="utf-8")
    (OUT / "index.html").write_text(page(eds[0], eds, is_index=True), encoding="utf-8")
    (OUT / "latest.json").write_text(json.dumps(eds[0], ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"built {len(eds)} edition(s); latest {eds[0]['edition_id']}")

if __name__ == "__main__":
    main()
