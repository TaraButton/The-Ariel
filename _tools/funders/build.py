#!/usr/bin/env python3
"""Build theariel.tv/documentary-funding/ (Documentary Funding Directory) from data/*.json.

  python3 _tools/funders/build.py [--today YYYY-MM-DD]

Grants, funds, equity financiers and pitch forums for documentary, UK, Europe, US and beyond.
Every fact comes from the funder's own site (sources listed per card). Deadlines are shown only
when the funder states them. Emails appear only when printed on the funder's own page.
"""
import html, json, re, sys
from pathlib import Path
from datetime import date

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(__file__).resolve().parent / "data"
OUT = ROOT / "documentary-funding"
REGION_ORDER = ["UK", "Europe", "US", "Canada", "Asia", "Middle East", "Africa", "Australia/NZ", "International"]
STAGES = ["development", "production", "post", "impact", "distribution", "shorts"]
TYPE_LABEL = {"grant": "Grant", "fund": "Fund", "equity": "Equity / impact finance", "pitch": "Pitch forum",
              "award": "Award", "broadcaster": "Broadcaster fund", "fellowship": "Fellowship"}
PENSKE = re.compile(r"(deadline\.com|variety\.com|hollywoodreporter\.com|indiewire\.com)", re.I)

def e(s): return html.escape(str(s or ""), quote=True)
def dom(u):
    m = re.match(r"https?://(?:www\.)?([^/]+)", u or ""); return m.group(1) if m else "source"
def pdate(d):
    try:
        y, m, dd = [int(x) for x in str(d)[:10].split("-")]; return date(y, m, dd)
    except Exception: return None
def nice(d):
    x = pdate(d); return x.strftime("%-d %B %Y") if x else str(d or "")

def load():
    out, seen = [], set()
    for f in sorted(DATA.glob("*.json")):
        for x in json.loads(f.read_text()):
            if not x.get("sources"): sys.exit(f"{x.get('name')}: no sources")
            if x.get("published_email") and not x.get("email_source_url"): sys.exit(f"{x['name']}: email without source")
            for u in x.get("sources", []) + [x.get("apply_url") or ""] + [n.get("url", "") for n in x.get("notable") or []]:
                if PENSKE.search(u or ""): sys.exit(f"{x['name']}: Penske URL not allowed: {u}")
                if u and not u.startswith("https://") and not u.startswith("http://"): sys.exit(f"{x['name']}: bad url {u}")
            if x["id"] in seen: continue
            seen.add(x["id"]); out.append(x)
    return out

def main():
    today = date.today()
    if "--today" in sys.argv: today = pdate(sys.argv[sys.argv.index("--today") + 1])
    fs = load()
    for x in fs:
        d = pdate(x.get("next_deadline"))
        if d and d < today:  # deadline passed since research: treat as last deadline
            x["last_deadline"], x["next_deadline"] = x["next_deadline"], ""
            if x.get("status") == "open": x["status"] = "closed"
        x["_d"] = pdate(x.get("next_deadline"))
    regions = [r for r in REGION_ORDER if any(x.get("region") == r for x in fs)]
    fs.sort(key=lambda x: (REGION_ORDER.index(x.get("region")) if x.get("region") in REGION_ORDER else 99, x.get("name", "").lower()))
    checked = max((x.get("checked", "") for x in fs), default="")

    def status_html(x):
        if x["_d"]:
            days = (x["_d"] - today).days
            cls = "soon" if days <= 30 else "open"
            return f'<span class="st {cls}">Deadline {e(nice(x["next_deadline"]))}</span>'
        s = x.get("status")
        if s == "rolling": return '<span class="st open">Rolling</span>'
        if s == "open": return '<span class="st open">Open now</span>'
        if x.get("next_window"): return f'<span class="st later">{e(x["next_window"])}</span>'
        return '<span class="st later">Check site for next round</span>'

    def card(x):
        stages = [s for s in x.get("stages") or [] if s in STAGES]
        notable = "".join(f'<li><a href="{e(n["url"])}" rel="noopener" target="_blank">{e(n.get("title"))}</a></li>' for n in (x.get("notable") or [])[:3] if n.get("url"))
        rows = []
        if x.get("amount"): rows.append(("Amount", e(x["amount"])))
        if x.get("eligibility"): rows.append(("Who can apply", e(x["eligibility"])))
        if x.get("last_deadline") and not x["_d"]: rows.append(("Last deadline", e(nice(x["last_deadline"]))))
        if x.get("next_window") and x["_d"]: rows.append(("Next window", e(x["next_window"])))
        how = ""
        if x.get("apply_url"): how = f'<a class="apply" href="{e(x["apply_url"])}" rel="noopener" target="_blank">How to apply</a>'
        if x.get("published_email"):
            how += f' <a href="mailto:{e(x["published_email"])}">{e(x["published_email"])}</a> <span class=meta>(as published on {e(dom(x["email_source_url"]))})</span>'
        q = " ".join([x.get("name", ""), x.get("org", ""), x.get("what", ""), x.get("eligibility", ""), x.get("country", ""), " ".join(stages), x.get("type", "")]).lower()
        return f'''<article class="card" id="{e(x["id"])}" data-r="{e(x.get("region"))}" data-s="{e(" ".join(stages))}" data-q="{e(q)}">
  <div class="type">{e(x.get("region"))}{(" &middot; " + e(x["country"])) if x.get("country") and x.get("country") != x.get("region") else ""} &middot; {e(TYPE_LABEL.get(x.get("type"), x.get("type") or "Fund"))}</div>
  <h3>{e(x.get("name"))}{(" <span class=flag>To confirm</span>") if x.get("confidence") == "check" else ""}</h3>
  {f'<p class="org">{e(x["org"])}</p>' if x.get("org") and x.get("org") != x.get("name") else ""}
  <p>{status_html(x)}</p>
  <p class="what">{e(x.get("what"))}</p>
  {"".join(f'<div class="row"><span class="k">{k}</span><span>{v}</span></div>' for k, v in rows)}
  {f'<div class="row"><span class="k">Stages</span><span class="tags">{"".join(f"<span>{e(s)}</span>" for s in stages)}</span></div>' if stages else ""}
  {f'<div class="row"><span class="k">Films they have backed</span><ul>{notable}</ul></div>' if notable else ""}
  {f'<div class="row">{how}</div>' if how else ""}
  <p class="src">Checked {e(nice(x.get("checked")))}. Sources: {" ".join(f'<a href="{e(u)}" rel="noopener" target="_blank">{e(dom(u))}</a>' for u in x.get("sources", [])[:4])}</p>
</article>'''

    upcoming = sorted([x for x in fs if x["_d"]], key=lambda x: x["_d"])
    cal = "".join(f'<li><time datetime="{e(x["next_deadline"])}">{e(x["_d"].strftime("%-d %b %Y"))}</time><a href="#{e(x["id"])}">{e(x["name"])}</a><span class="meta">{e(x.get("region"))}{(" &middot; " + e(x["amount"])) if x.get("amount") and len(x["amount"]) < 40 else ""}</span></li>' for x in upcoming)
    rolling = [x for x in fs if not x["_d"] and x.get("status") in ("rolling", "open")]
    secs = []
    for r in regions:
        rs = [x for x in fs if x.get("region") == r]
        secs.append(f'<h2 class="region-h" data-r="{e(r)}">{e(r)} <span class="n">{len(rs)}</span></h2><div class="grid">' + "".join(card(x) for x in rs) + "</div>")
    n = len(fs)
    desc = (f"Documentary funding directory: {n} grants, funds, equity financiers and pitch forums for documentary filmmakers in the UK, Europe, the US and beyond, "
            f"with an open-call deadline calendar. Every entry sourced from the funder's own site. Free from The Ariel.")
    ld = {"@context": "https://schema.org", "@type": "ItemList", "name": "Documentary Funding Directory",
          "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": x["name"], "url": f"https://theariel.tv/documentary-funding/#{x['id']}"} for i, x in enumerate(fs)]}
    page = f'''<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Documentary Funding Directory: Grants, Funds and Deadlines | The Ariel</title>
<meta name="description" content="{e(desc)}"><link rel="canonical" href="https://theariel.tv/documentary-funding/">
<meta property="og:type" content="website"><meta property="og:site_name" content="The Ariel"><meta property="og:title" content="Documentary Funding Directory: grants, funds and deadlines">
<meta property="og:description" content="{e(desc)}"><meta property="og:url" content="https://theariel.tv/documentary-funding/"><meta property="og:image" content="https://theariel.tv/link-card.png">
<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/ariel-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Lato:wght@400;700;900&display=swap" rel="stylesheet">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
<style>
:root{{--ink:#1B1F3B;--ivory:#F8F5F0;--paper:#FFFFFF;--gold:#B8965A;--gold-light:#E2C891;--gold-deep:#6E5428;--text:#1E2233;--muted:#454D60;--line:#CFC9BE;--tint:#F4ECDD;--warn:#8A2F3A;--ok:#2F5D3A}}
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
.dek{{color:#E9E5DD;font-size:18px;margin:0;max-width:760px}}
.cal{{background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:18px 20px;margin-top:22px}}
.cal h2{{font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;margin:0 0 8px}}
.cal ol{{list-style:none;margin:0;padding:0;columns:2;column-gap:28px}} .cal li{{break-inside:avoid;padding:6px 0;border-bottom:1px solid var(--tint);display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}}
.cal time{{font-weight:900;color:var(--ink);min-width:96px}} .cal .meta{{font-size:14px}}
.tools{{position:sticky;top:0;z-index:5;background:var(--ivory);border-bottom:1px solid var(--line);padding-block:12px}}
.tools .wrap{{display:flex;gap:8px;flex-wrap:wrap;align-items:center}}
.tools button{{min-height:44px;padding:0 14px;border:2px solid var(--ink);background:var(--paper);border-radius:4px;font:inherit;font-size:15px;font-weight:900;color:var(--ink);cursor:pointer}}
.tools button[aria-pressed=true]{{background:var(--ink);color:#FFF}}
.tools select,.tools input{{min-height:44px;padding:8px 14px;border:1px solid var(--line);border-radius:999px;font:inherit;font-size:16px;background:var(--paper)}}
.tools input{{flex:1;min-width:200px}}
main{{padding-block:20px 48px}}
.region-h{{font-family:'Cormorant Garamond',Georgia,serif;font-size:44px;margin:22px 0 12px}} .region-h .n{{font-family:'Lato',sans-serif;font-size:14px;color:var(--muted);font-weight:700}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px}}
.card{{background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:18px 20px;scroll-margin-top:90px}}
.card:target{{outline:3px solid var(--gold)}}
.card h3{{font-family:'Cormorant Garamond',Georgia,serif;font-size:27px;margin:2px 0 0;line-height:1.15;color:var(--ink)}}
.org{{margin:0;color:var(--muted);font-size:14px}}
.type{{font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-deep)}}
.what{{margin:6px 0 0;font-size:15px}} .row{{margin-top:10px;font-size:15px}}
.k{{display:block;font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-deep);margin-bottom:2px}}
.card ul{{margin:0;padding-left:18px}} .meta{{color:var(--muted)}}
.st{{display:inline-block;font-size:13px;font-weight:900;padding:3px 10px;border-radius:999px;margin-top:8px}}
.st.open{{background:#E3EFE5;color:var(--ok)}} .st.soon{{background:#F6E3E5;color:var(--warn)}} .st.later{{background:var(--tint);color:var(--gold-deep)}}
.tags span{{display:inline-block;font-size:13px;background:var(--tint);border-radius:3px;padding:1px 8px;margin:2px 4px 2px 0}}
.apply{{display:inline-block;font-weight:900;min-height:44px;line-height:44px}}
.src{{margin:12px 0 0;font-size:13px;color:var(--muted)}} .src a{{color:var(--muted)}}
.flag{{display:inline-block;vertical-align:middle;font-family:'Lato',sans-serif;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--warn);border:1px solid var(--warn);border-radius:2px;padding:1px 6px;margin-left:6px}}
.note{{background:var(--paper);border-left:4px solid var(--gold);padding:16px 20px;border-radius:0 6px 6px 0;margin-top:28px}}
footer{{background:var(--ink);color:#D8D3C8;text-align:center;font-size:14px;padding:22px 16px}} footer a{{color:var(--gold-light)}}
@media (max-width:820px){{ .grid{{grid-template-columns:1fr}} .tools{{position:static}} .cal ol{{columns:1}} }}
</style></head><body>
<header class="bar"><div class="wrap"><a href="/">The Ariel</a><span><a class="cta" href="/commissioners/">Commissioners</a> &nbsp; <a class="cta" href="/commissioners/whos-buying-what/">Who&#8217;s Buying What</a> &nbsp; <a class="cta" href="/talent-agencies/">Agencies</a></span></div></header>
<section class="hero"><div class="wrap">
  <span class="badge">Free</span>
  <h1>Documentary Funding Directory</h1>
  <p class="dek">Grants, funds, equity financiers and pitch forums for documentary, with every stated deadline in one calendar. {n} funders, each checked against its own website, last checked {e(nice(checked))}.</p>
</div></section>
<div class="wrap">
<section class="cal" aria-labelledby="cal-h"><h2 id="cal-h">Upcoming deadlines</h2>
{f"<ol>{cal}</ol>" if cal else "<p>No dated deadlines open right now. Rolling funds are marked below.</p>"}
<p class="meta" style="margin:10px 0 0;font-size:14px">{len(rolling)} more funders take applications on a rolling basis or are open now. Funders change dates: always confirm on their own site before you apply. Each week&#8217;s new funding rounds and grants go out in <a href="/commissioners/whos-buying-what/">Who&#8217;s Buying What</a>.</p>
</section></div>
<div class="tools"><div class="wrap">
  <button type="button" data-r="all" aria-pressed="true">All</button>{"".join(f'<button type="button" data-r="{e(r)}" aria-pressed="false">{e(r)}</button>' for r in regions)}
  <select id="stage" aria-label="Stage"><option value="">Any stage</option>{"".join(f'<option value="{s}">{s.capitalize()}</option>' for s in STAGES)}</select>
  <input type="search" id="q" placeholder="Search funders, topics, eligibility" aria-label="Search">
</div></div>
<main class="wrap">
{"".join(secs)}
<div class="note"><p><strong>Funders: is your entry right?</strong> We build this from funders&#8217; own pages. To correct it or add a new round, email <a href="mailto:hello@theariel.tv?subject=Documentary%20Funding%20Directory">hello@theariel.tv</a>.</p>
<p>Amounts and deadlines are shown only where the funder states them. Nothing here is advice on eligibility; read each funder&#8217;s guidelines in full.</p></div>
</main>
<footer>The Ariel &middot; Personalised story intelligence for screen &middot; <a href="/">theariel.tv</a> &middot; <a href="/commissioners/">UK &amp; US commissioners</a> &middot; <a href="/commissioners/whos-buying-what/">Who&#8217;s Buying What</a> &middot; <a href="/talent-agencies/">Talent agencies</a></footer>
<script>
(function(){{var rg='all',q=document.getElementById('q'),st=document.getElementById('stage'),cards=[].slice.call(document.querySelectorAll('.card'));
function apply(){{var t=(q.value||'').trim().toLowerCase(),s=st.value;cards.forEach(function(c){{c.hidden=!((rg==='all'||c.dataset.r===rg)&&(!s||(' '+c.dataset.s+' ').indexOf(' '+s+' ')>-1)&&(!t||c.dataset.q.indexOf(t)>-1));}});
document.querySelectorAll('.region-h').forEach(function(h){{var any=cards.some(function(c){{return c.dataset.r===h.dataset.r&&!c.hidden;}});h.hidden=!any;h.nextElementSibling.hidden=!any;}});}}
document.querySelectorAll('.tools button').forEach(function(b){{b.addEventListener('click',function(){{rg=b.dataset.r;document.querySelectorAll('.tools button').forEach(function(x){{x.setAttribute('aria-pressed',x===b);}});apply();}});}});
q.addEventListener('input',apply);st.addEventListener('change',apply);}})();
</script></body></html>'''
    OUT.mkdir(exist_ok=True)
    (OUT / "index.html").write_text(page, encoding="utf-8")
    print(f"built {n} funders ({len(upcoming)} dated deadlines, {len(rolling)} rolling/open) -> {OUT/'index.html'}")

if __name__ == "__main__":
    main()
