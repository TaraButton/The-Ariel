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
MONEY = {"grant": "Grant (non-repayable)", "repayable loan": "Repayable loan", "equity investment": "Equity investment",
         "licence fee": "Licence fee", "prize": "Prize", "fellowship": "Fellowship", "no cash (pitch/market)": "No cash: pitch or market access",
         "mixed": "Mixed (see amount)"}
UKE = {"yes": "Can apply", "no": "Not eligible", "with conditions": "Can apply, with conditions (see who can apply)", "check": "Not stated; check the guidelines"}
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
        if s == "invitation only": return '<span class="st later">By invitation or nomination only</span>'
        if s == "closed" and not x.get("next_window"): return '<span class="st later">Closed; next round not announced</span>'
        if x.get("next_window"): return f'<span class="st later">{e(x["next_window"])}</span>'
        return '<span class="st later">Check site for next round</span>'

    def card(x):
        stages = [s for s in x.get("stages") or [] if s in STAGES]
        notable = "".join(f'<li><a href="{e(n["url"])}" rel="noopener" target="_blank">{e(n.get("title"))}</a></li>' for n in (x.get("notable") or [])[:3] if n.get("url"))
        rows = []
        if x.get("money") and x["money"] != "check": rows.append(("What you get", e(MONEY.get(x["money"], x["money"]))))
        if x.get("max_award"): rows.append(("Max per project", e(x["max_award"])))
        if x.get("amount") and x.get("amount") != x.get("max_award"): rows.append(("Amount", e(x["amount"])))
        if x.get("uk_eligible"): rows.append(("UK producers", e(UKE.get(x["uk_eligible"], x["uk_eligible"]))))
        if x.get("eligibility"): rows.append(("Who can apply", e(x["eligibility"])))
        if x.get("last_deadline") and not x["_d"]: rows.append(("Last deadline", e(nice(x["last_deadline"]))))
        if x.get("next_window") and x["_d"]: rows.append(("Next window", e(x["next_window"])))
        how = ""
        if x.get("apply_url"): how = f'<a class="apply" href="{e(x["apply_url"])}" rel="noopener" target="_blank">How to apply</a>'
        if x.get("published_email"):
            how += f' <a href="mailto:{e(x["published_email"])}">{e(x["published_email"])}</a> <span class=meta>(as published on {e(dom(x["email_source_url"]))})</span>'
        q = " ".join([x.get("name", ""), x.get("org", ""), x.get("what", ""), x.get("eligibility", ""), x.get("country", ""), " ".join(stages), x.get("type", "")]).lower()
        return f'''<article class="card" id="{e(x["id"])}" data-r="{e(x.get("region"))}" data-s="{e(" ".join(stages))}" data-uk="{e(x.get("uk_eligible") or "")}" data-m="{e(x.get("money") or "")}" data-q="{e(q)}">
  <div class="type">{e(x.get("region"))}{(" &middot; " + e(x["country"])) if x.get("country") and x.get("country") != x.get("region") else ""} &middot; {e(TYPE_LABEL.get(x.get("type"), x.get("type") or "Fund"))}</div>
  <h3><a href="/documentary-funding/{e(x["id"])}/">{e(x.get("name"))}</a>{(" <span class=flag>To confirm</span>") if x.get("confidence") == "check" else ""}</h3>
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
<title>Documentary Grants and Funding 2026-27: {n} Funds with Deadlines | The Ariel</title>
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
.card h3 a{{color:var(--ink);text-decoration:none}} .card h3{{font-family:'Cormorant Garamond',Georgia,serif;font-size:27px;margin:2px 0 0;line-height:1.15;color:var(--ink)}}
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
.finder{{background:var(--paper);border:2px solid var(--gold);border-radius:8px;padding:18px 20px;margin-top:22px}}
.finder h2{{font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;margin:0 0 4px}} .finder .fgrid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin-top:10px}}
.finder label{{font-size:13px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--gold-deep);display:block}}
.finder select,.finder input{{width:100%;min-height:44px;padding:8px 12px;border:1px solid var(--line);border-radius:6px;font:inherit;font-size:16px;background:#fff;margin-top:4px}}
.finder button{{min-height:44px;margin-top:12px;padding:0 22px;border:0;border-radius:4px;background:var(--ink);color:#fff;font:inherit;font-weight:900;cursor:pointer}}
#fres{{margin-top:14px}} #fres ol{{list-style:none;padding:0;margin:0}} #fres li{{padding:10px 0;border-bottom:1px solid var(--tint)}}
#fres .el{{display:inline-block;font-size:12px;font-weight:900;padding:2px 8px;border-radius:999px;margin-right:6px}}
.el.y{{background:#E3EFE5;color:var(--ok)}} .el.c{{background:var(--tint);color:var(--gold-deep)}} .el.k{{background:#EEE;color:var(--muted)}}
.niche-nav{{margin:16px 0 0;font-size:15px}} .niche-nav a{{display:inline-block;margin:4px 12px 4px 0;font-weight:700}}
@media (max-width:820px){{ .grid{{grid-template-columns:1fr}} .tools{{position:static}} .cal ol{{columns:1}} }}
</style></head><body>
<header class="bar"><div class="wrap"><a href="/">The Ariel</a><span><a class="cta" href="/commissioners/">Commissioners</a> &nbsp; <a class="cta" href="/commissioners/whos-buying-what/">Who&#8217;s Buying What</a> &nbsp; <a class="cta" href="/talent-agencies/">Agencies</a></span></div></header>
<section class="hero"><div class="wrap">
  <span class="badge">Free</span>
  <h1>Documentary grants and funding: every deadline in one place</h1>
  <p class="dek">Grants, funds, equity financiers and pitch forums for documentary, with every stated deadline in one calendar. {n} funders, each checked against its own website, last checked {e(nice(checked))}.</p>
</div></section>
<div class="wrap">
{matcher_html(fs, today)}
<p class="niche-nav"><strong><a href="/find-funding-and-buyers/">New: match your film to funds AND commissioners in one go</a></strong></p>
<p class="niche-nav">{niche_nav(fs, today)}</p>
<section class="cal" aria-labelledby="cal-h"><h2 id="cal-h">Upcoming deadlines</h2>
{f"<ol>{cal}</ol>" if cal else "<p>No dated deadlines open right now. Rolling funds are marked below.</p>"}
<p class="meta" style="margin:10px 0 0;font-size:14px">{len(rolling)} more funders take applications on a rolling basis or are open now. Funders change dates: always confirm on their own site before you apply. Each week&#8217;s new funding rounds and grants go out in <a href="/commissioners/whos-buying-what/">Who&#8217;s Buying What</a>.</p>
</section></div>
<div class="tools"><div class="wrap">
  <button type="button" data-r="all" aria-pressed="true">All</button>{"".join(f'<button type="button" data-r="{e(r)}" aria-pressed="false">{e(r)}</button>' for r in regions)}
  <select id="uk" aria-label="UK producers"><option value="">Anyone</option><option value="uk">Open to UK producers</option></select>
  <select id="money" aria-label="Type of money"><option value="">Any type</option>{"".join(f'<option value="{e(k)}">{e(v)}</option>' for k, v in MONEY.items() if any(x.get("money") == k for x in fs))}</select>
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
(function(){{var rg='all',q=document.getElementById('q'),st=document.getElementById('stage'),uk=document.getElementById('uk'),mo=document.getElementById('money'),cards=[].slice.call(document.querySelectorAll('.card'));
function apply(){{var t=(q.value||'').trim().toLowerCase(),s=st.value,u=uk.value,m=mo.value;cards.forEach(function(c){{c.hidden=!((rg==='all'||c.dataset.r===rg)&&(!s||(' '+c.dataset.s+' ').indexOf(' '+s+' ')>-1)&&(!u||c.dataset.uk==='yes'||c.dataset.uk==='with conditions')&&(!m||c.dataset.m===m)&&(!t||c.dataset.q.indexOf(t)>-1));}});
document.querySelectorAll('.region-h').forEach(function(h){{var any=cards.some(function(c){{return c.dataset.r===h.dataset.r&&!c.hidden;}});h.hidden=!any;h.nextElementSibling.hidden=!any;}});}}
document.querySelectorAll('.tools button').forEach(function(b){{b.addEventListener('click',function(){{rg=b.dataset.r;document.querySelectorAll('.tools button').forEach(function(x){{x.setAttribute('aria-pressed',x===b);}});apply();}});}});
q.addEventListener('input',apply);st.addEventListener('change',apply);uk.addEventListener('change',apply);mo.addEventListener('change',apply);}})();
</script></body></html>'''
    OUT.mkdir(exist_ok=True)
    (OUT / "index.html").write_text(page, encoding="utf-8")
    style = re.search(r"<style>.*?</style>", page, re.S).group(0)
    urls = [build_funder_page(x, fs, style, status_html, today) for x in fs]
    urls += build_niches(fs, style, card, status_html, today)
    (OUT / "pages.json").write_text(json.dumps([u for u in urls if u], indent=1))
    print(f"built {n} funders ({len(upcoming)} dated deadlines, {len(rolling)} rolling/open) -> {OUT/'index.html'}; {len([u for u in urls if u])} indexable funder pages")

COUNTRIES = [("uk", "the UK"), ("us", "the US"), ("canada", "Canada"), ("eu", "an EU country"), ("other", "somewhere else")]

def open_val(x, c):
    o = x.get("open_to") or {}
    v = o.get(c)
    if v: return v
    if c == "uk":
        return {"yes": "yes", "with conditions": "conditions", "no": "no"}.get(x.get("uk_eligible"), "check")
    return "check"

NICHES = [
    ("uk", "Documentary Funding UK: Grants and Funds UK Producers Can Apply To", "Documentary funding for UK producers",
     "Every fund in our directory that a UK-based producer or filmmaker can apply to: UK funds such as BFI Doc Society, plus international funds and pitch forums that accept UK applicants. Funds marked with conditions usually need a co-producer or a particular kind of project.",
     lambda x: open_val(x, "uk") in ("yes", "conditions")),
    ("usa", "Documentary Grants USA: Funds Open to US Filmmakers", "Documentary grants for US filmmakers",
     "Grants, fellowships, equity and pitch forums that US-based documentary filmmakers can apply to, from Sundance and ITVS to international forums that accept US projects.",
     lambda x: open_val(x, "us") in ("yes", "conditions")),
    ("international", "International Documentary Funding: Open to Filmmakers Anywhere", "International documentary funding",
     "Funds and pitch forums that accept documentary projects from outside their own country, so filmmakers almost anywhere can apply.",
     lambda x: open_val(x, "other") in ("yes", "conditions")),
    ("open-now", "Documentary Funding Open Now: Current Calls and Deadlines", "Documentary funding open now",
     "Calls that are open today or have a confirmed upcoming deadline, plus funds that take applications all year. Sorted by deadline.",
     lambda x: bool(x.get("_d")) or x.get("status") in ("open", "rolling")),
    ("development", "Documentary Development Funding: Grants for Research and Development", "Documentary development funding",
     "Money for the early stages: research, access, shooting a teaser and writing the treatment, before a broadcaster or financier is on board.",
     lambda x: "development" in (x.get("stages") or [])),
    ("production", "Documentary Production Funding: Grants and Finance to Shoot", "Documentary production funding",
     "Funds that put money into the shoot itself, from production grants to equity investment.",
     lambda x: "production" in (x.get("stages") or [])),
    ("post-production", "Documentary Post-production and Finishing Funds", "Documentary post-production and finishing funds",
     "Money to finish a film: editing, sound, grading, music and archive clearance.",
     lambda x: "post" in (x.get("stages") or [])),
    ("impact", "Documentary Impact and Outreach Funding", "Documentary impact and outreach funding",
     "Funds for impact campaigns and getting a finished film in front of the audiences it was made for.",
     lambda x: "impact" in (x.get("stages") or [])),
    ("shorts", "Short Documentary Funding: Grants for Short Films", "Short documentary funding",
     "Funds and fellowships that back short documentaries.",
     lambda x: "shorts" in (x.get("stages") or []) or "short" in (x.get("formats") or [])),
    ("pitch-forums", "Documentary Pitch Forums and Markets: Where to Pitch for Finance", "Documentary pitch forums and markets",
     "Pitch forums, markets and labs where documentary projects meet broadcasters, funders and sales agents. Some carry cash prizes; most are about the meetings.",
     lambda x: x.get("type") == "pitch" or x.get("money") == "no cash (pitch/market)"),
    ("equity-investors", "Documentary Equity Investors and Impact Finance", "Documentary equity investors and impact finance",
     "Investors and impact funds that put recoupable money into documentaries, rather than grants.",
     lambda x: x.get("type") == "equity" or x.get("money") == "equity investment"),
]
NICHE_MIN = 5

def live_niches(fs):
    return [n for n in NICHES if sum(1 for x in fs if n[4](x)) >= NICHE_MIN]

def niche_nav(fs, today, skip=None):
    return "Browse: " + "".join(f'<a href="/documentary-funding/{s}/">{e(h[0].upper() + h[1:])}</a>' for s, t, h, i, f in live_niches(fs) if s != skip)

def matcher_html(fs, today):
    data = [{"id": x["id"], "n": x["name"], "r": x.get("region"), "o": {c: open_val(x, c) for c, _ in COUNTRIES},
             "s": x.get("stages") or [], "f": x.get("formats") or [], "sub": x.get("subjects") or [], "m": x.get("money") or "",
             "a": x.get("max_award") or x.get("amount") or "", "d": x.get("next_deadline") or "",
             "st": x.get("status") or "", "w": x.get("next_window") or "", "ap": x.get("applicant") or []} for x in fs]
    js = json.dumps(data, ensure_ascii=False).replace("</", "<" + chr(92) + "/")
    return f'''<section class="finder" aria-labelledby="finder-h"><h2 id="finder-h">Find funding for your documentary</h2>
<p class="meta" style="margin:0">Tell us about your project and we&#8217;ll list the funds whose published rules fit it, open calls first. Always read the guidelines before applying.</p>
<form id="finder" onsubmit="return false"><div class="fgrid">
<div><label for="f-c">You are based in</label><select id="f-c">{"".join(f'<option value="{c}">{"The UK" if c == "uk" else "The US" if c == "us" else "Canada" if c == "canada" else "An EU country" if c == "eu" else "Somewhere else"}</option>' for c, _ in COUNTRIES)}</select></div>
<div><label for="f-s">Stage</label><select id="f-s"><option value="">Any stage</option><option value="development">Development</option><option value="production">Production</option><option value="post">Post-production</option><option value="impact">Impact / outreach</option></select></div>
<div><label for="f-f">Format</label><select id="f-f"><option value="">Any format</option><option value="feature">Feature</option><option value="series">Series</option><option value="short">Short</option></select></div>
<div><label for="f-m">Type of money</label><select id="f-m"><option value="">Any</option><option value="grant">Grants</option><option value="equity investment">Equity investment</option><option value="pitch">Pitch forums and markets</option><option value="loan">Repayable loans</option></select></div>
<div><label for="f-t">Subject (optional)</label><input id="f-t" type="text" placeholder="e.g. music, science, climate"></div>
</div><button type="button" id="f-go">Show matching funds</button></form>
<div id="fres" role="status" aria-live="polite"></div>
<script>window.FUNDERS={js};</script>
<script>
(function(){{var F=window.FUNDERS,today="{today.isoformat()}";
function fmt(d){{var p=d.split('-');return new Date(+p[0],+p[1]-1,+p[2]).toLocaleDateString('en-GB',{{day:'numeric',month:'short',year:'numeric'}});}}
function esc(s){{return String(s).replace(/[&<>"]/g,function(c){{return{{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}}[c];}});}}
document.getElementById('f-go').addEventListener('click',function(){{
var c=document.getElementById('f-c').value,s=document.getElementById('f-s').value,f=document.getElementById('f-f').value,m=document.getElementById('f-m').value,t=(document.getElementById('f-t').value||'').trim().toLowerCase();
var res=F.filter(function(x){{var o=x.o[c];if(o==='no')return false;
if(s&&x.s.length&&x.s.indexOf(s)<0)return false;
if(f&&x.f.length&&x.f.indexOf(f)<0&&!(f==='short'&&x.s.indexOf('shorts')>-1))return false;
if(m==='grant'&&['grant','fellowship','prize','mixed',''].indexOf(x.m)<0)return false;
if(m==='equity investment'&&x.m!=='equity investment'&&x.m!=='mixed')return false;
if(m==='pitch'&&x.m!=='no cash (pitch/market)'&&x.m!=='prize')return false;
if(m==='loan'&&x.m!=='repayable loan'&&x.m!=='mixed')return false;
if(x.sub.length){{if(!t)return false;var hit=x.sub.some(function(z){{return t.indexOf(z.toLowerCase())>-1||z.toLowerCase().indexOf(t)>-1;}});if(!hit)return false;}}
return true;}});
function rank(x){{var o=x.o[c]==='yes'?0:x.o[c]==='conditions'?1:2;var open=(x.d&&x.d>=today)?0:(x.st==='rolling'||x.st==='open')?1:2;return o*10+open;}}
res.sort(function(a,b){{return rank(a)-rank(b)||(a.d||'9').localeCompare(b.d||'9');}});
var out=document.getElementById('fres');
if(!res.length){{out.innerHTML='<p>No funds match all of those. Try fewer filters.</p>';return;}}
out.innerHTML='<p><strong>'+res.length+' funds may fit.</strong> Green means the published rules say producers based where you are can apply; amber means conditions apply; grey means the rules do not say, so check.</p><ol>'+res.map(function(x){{var o=x.o[c];
var b=o==='yes'?'<span class="el y">You can apply</span>':o==='conditions'?'<span class="el c">Conditions apply</span>':'<span class="el k">Check eligibility</span>';
var when=(x.d&&x.d>=today)?'Deadline '+fmt(x.d):x.st==='rolling'?'Rolling':x.st==='open'?'Open now':x.st==='invitation only'?'Invitation only':x.st==='closed'?('Closed'+(x.w?': '+x.w:'')):(x.w||'Next round not announced');
return '<li>'+b+'<a href="/documentary-funding/'+x.id+'/"><strong>'+esc(x.n)+'</strong></a><br><span class="meta">'+esc(x.r)+' &middot; '+esc(when)+(x.a?' &middot; '+esc(x.a):'')+'</span></li>';}}).join('')+'</ol>';
}});}})();
</script></section>'''

def build_niches(fs, style, card, status_html, today):
    urls = []
    for slug_, title, h1, intro, fn in live_niches(fs):
        sub = [x for x in fs if fn(x)]
        sub.sort(key=lambda x: (0 if x.get("_d") else 1 if x.get("status") in ("open", "rolling") else 2, x.get("next_deadline") or "9", x["name"].lower()))
        up = [x for x in sub if x.get("_d")]
        nxt = up[0] if up else None
        stats = f"{len(sub)} funds" + (f", {len(up)} with an upcoming deadline; next: {nxt['name']} on {nice(nxt['next_deadline'])}" if nxt else "")
        cal = "".join(f'<li><time datetime="{e(x["next_deadline"])}">{e(x["_d"].strftime("%-d %b %Y"))}</time><a href="/documentary-funding/{e(x["id"])}/">{e(x["name"])}</a></li>' for x in up)
        yr = f"{today.year}-{str(today.year + 1)[2:]}"
        ld = {"@context": "https://schema.org", "@type": "ItemList", "name": h1,
              "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": x["name"], "url": f"https://theariel.tv/documentary-funding/{x['id']}/"} for i, x in enumerate(sub)]}
        bc = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Documentary funding", "item": "https://theariel.tv/documentary-funding/"},
            {"@type": "ListItem", "position": 2, "name": h1, "item": f"https://theariel.tv/documentary-funding/{slug_}/"}]}
        desc = f"{intro} {stats}. Checked against each funder's own site."
        pg = f'''<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{e(title)} ({yr}) | The Ariel</title>
<meta name="description" content="{e(desc[:300])}"><link rel="canonical" href="https://theariel.tv/documentary-funding/{slug_}/">
<meta property="og:type" content="website"><meta property="og:site_name" content="The Ariel"><meta property="og:title" content="{e(h1)}">
<meta property="og:description" content="{e(desc[:300])}"><meta property="og:url" content="https://theariel.tv/documentary-funding/{slug_}/"><meta property="og:image" content="https://theariel.tv/link-card.png">
<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/ariel-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Lato:wght@400;700;900&display=swap" rel="stylesheet">
<script type="application/ld+json">{json.dumps([ld, bc], ensure_ascii=False)}</script>
{style}
</head><body>
<header class="bar"><div class="wrap"><a href="/">The Ariel</a><span><a class="cta" href="/documentary-funding/">All funding</a> &nbsp; <a class="cta" href="/commissioners/">Commissioners</a></span></div></header>
<section class="hero"><div class="wrap">
  <span class="badge">Free</span>
  <h1>{e(h1)}</h1>
  <p class="dek">{e(intro)}</p>
  <p class="dek" style="margin-top:10px">{e(stats)}. Checked against each funder&#8217;s own website.</p>
</div></section>
<div class="wrap">
<p class="niche-nav"><a href="/documentary-funding/">All funds and the funding finder</a> &middot; {niche_nav(fs, today, skip=slug_)}</p>
{f'<section class="cal"><h2>Upcoming deadlines</h2><ol>{cal}</ol></section>' if cal else ""}
</div>
<main class="wrap"><div class="grid">{"".join(card(x) for x in sub)}</div>
<div class="note"><p>Funders change their rules and dates: always confirm on the funder&#8217;s site before you apply. New rounds go out every Friday in <a href="/commissioners/whos-buying-what/">Who&#8217;s Buying What</a>. Funder? Corrections to <a href="mailto:hello@theariel.tv?subject=Documentary%20funding">hello@theariel.tv</a>.</p></div>
</main>
<footer>The Ariel &middot; Personalised story intelligence for screen &middot; <a href="/">theariel.tv</a> &middot; <a href="/documentary-funding/">Documentary funding</a> &middot; <a href="/commissioners/">UK &amp; US commissioners</a> &middot; <a href="/talent-agencies/">Talent agencies</a></footer>
</body></html>'''
        d = OUT / slug_
        d.mkdir(exist_ok=True)
        (d / "index.html").write_text(pg, encoding="utf-8")
        urls.append(f"https://theariel.tv/documentary-funding/{slug_}/")
    return urls

def thin(x):
    """A page with nothing a searcher needs (no amount, no dates, unconfirmed) is kept out of Google."""
    return x.get("confidence") == "check" and not x.get("amount") and not x.get("_d") and not x.get("last_deadline")

def build_funder_page(x, fs, style, status_html, today):
    stages = [s for s in x.get("stages") or [] if s in STAGES]
    sim = sorted([o for o in fs if o is not x and (o.get("region") == x.get("region") or set(o.get("stages") or []) & set(stages))],
                 key=lambda o: (o.get("region") != x.get("region"), -len(set(o.get("stages") or []) & set(stages)), o["name"]))[:8]
    rows = [("Type", e(TYPE_LABEL.get(x.get("type"), x.get("type") or "Fund"))), ("Where", e(x.get("country") or x.get("region")))]
    if x.get("money") and x["money"] != "check": rows.append(("What you get", e(MONEY.get(x["money"], x["money"]))))
    if x.get("max_award"): rows.append(("Max per project", e(x["max_award"])))
    if x.get("amount") and x.get("amount") != x.get("max_award"): rows.append(("Amount", e(x["amount"])))
    if x.get("uk_eligible"): rows.append(("UK producers", e(UKE.get(x["uk_eligible"], x["uk_eligible"]))))
    if x["_d"]: rows.append(("Next deadline", e(nice(x["next_deadline"]))))
    if x.get("next_window"): rows.append(("Next round", e(x["next_window"])))
    if x.get("last_deadline") and not x["_d"]: rows.append(("Last deadline", e(nice(x["last_deadline"]))))
    if x.get("eligibility"): rows.append(("Who can apply", e(x["eligibility"])))
    if stages: rows.append(("Stages funded", e(", ".join(stages))))
    if x.get("published_email"): rows.append(("Contact", f'<a href="mailto:{e(x["published_email"])}">{e(x["published_email"])}</a> (as published on {e(dom(x["email_source_url"]))})'))
    notable = "".join(f'<li><a href="{e(n["url"])}" rel="noopener" target="_blank">{e(n.get("title"))}</a></li>' for n in (x.get("notable") or [])[:3] if n.get("url"))
    name = x["name"]
    if x["_d"]: when = f'The next stated deadline is {nice(x["next_deadline"])}.'
    elif x.get("status") == "rolling": when = "It takes applications on a rolling basis."
    elif x.get("next_window"): when = f'Next round: {x["next_window"]}.'
    elif x.get("last_deadline"): when = f'The last stated deadline was {nice(x["last_deadline"])}; the next round has not been announced.'
    else: when = "Check the funder's site for the next round."
    qa = [(f"When is the {name} deadline?", when)]
    if x.get("amount"): qa.append((f"How much does {name} give?", x["amount"] + "."))
    if x.get("eligibility"): qa.append((f"Who can apply to {name}?", x["eligibility"].rstrip(".") + "."))
    if x.get("apply_url"): qa.append((f"How do I apply to {name}?", f'Apply through the funder\'s own page: {x["apply_url"]}'))
    ld = [{"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qa]},
          {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
              {"@type": "ListItem", "position": 1, "name": "Documentary funding", "item": "https://theariel.tv/documentary-funding/"},
              {"@type": "ListItem", "position": 2, "name": name, "item": f"https://theariel.tv/documentary-funding/{x['id']}/"}]}]
    yr = f"{today.year}-{str(today.year + 1)[2:]}"
    title = f"{name}: Deadline, Amount and How to Apply ({yr}) | The Ariel"
    desc = f"{name}: {x.get('what', '').rstrip('.')}. " + (f"Amount: {x['amount']}. " if x.get("amount") else "") + when + " Checked against the funder's own site."
    robots = '<meta name="robots" content="noindex,follow">' if thin(x) else ""
    pg = f'''<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{e(title)}</title>{robots}
<meta name="description" content="{e(desc[:300])}"><link rel="canonical" href="https://theariel.tv/documentary-funding/{e(x['id'])}/">
<meta property="og:type" content="website"><meta property="og:site_name" content="The Ariel"><meta property="og:title" content="{e(name)}: deadline, amount and how to apply">
<meta property="og:description" content="{e(desc[:300])}"><meta property="og:url" content="https://theariel.tv/documentary-funding/{e(x['id'])}/"><meta property="og:image" content="https://theariel.tv/link-card.png">
<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/ariel-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Lato:wght@400;700;900&display=swap" rel="stylesheet">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
{style}
<style>.facts{{background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:8px 20px;margin-top:20px}}.facts .row{{display:grid;grid-template-columns:170px 1fr;gap:12px;padding:10px 0;border-bottom:1px solid var(--tint);margin:0}}.facts .row:last-child{{border:0}}
.crumbs{{font-size:14px;margin:18px 0 0}} .faq h2,.sim h2{{font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;margin:28px 0 6px}} .faq h3{{font-size:17px;margin:14px 0 2px}} .faq p{{margin:0}}
.sim ul{{padding-left:18px}} .bigapply{{display:inline-block;background:var(--ink);color:#fff;font-weight:900;padding:12px 20px;border-radius:4px;text-decoration:none;margin-top:18px}}
@media (max-width:620px){{.facts .row{{grid-template-columns:1fr;gap:2px}}}}</style>
</head><body>
<header class="bar"><div class="wrap"><a href="/">The Ariel</a><span><a class="cta" href="/documentary-funding/">All funders</a> &nbsp; <a class="cta" href="/commissioners/">Commissioners</a></span></div></header>
<section class="hero"><div class="wrap">
  <div class="type" style="color:var(--gold-light)">{e(x.get("region"))} &middot; {e(TYPE_LABEL.get(x.get("type"), "Fund"))}</div>
  <h1>{e(name)}</h1>
  <p class="dek">{e(x.get("what"))}</p>
  <p>{status_html(x)}</p>
</div></section>
<main class="wrap">
<p class="crumbs"><a href="/documentary-funding/">Documentary funding</a> &rsaquo; {e(name)}{(" <span class=flag>To confirm</span>") if x.get("confidence") == "check" else ""}</p>
<div class="facts">{"".join(f'<div class="row"><span class="k">{k}</span><span>{v}</span></div>' for k, v in rows)}</div>
{f'<a class="bigapply" href="{e(x["apply_url"])}" rel="noopener" target="_blank">How to apply (official page)</a>' if x.get("apply_url") else ""}
{f'<section class="sim"><h2>Films they have backed</h2><ul>{notable}</ul></section>' if notable else ""}
<section class="faq"><h2>Quick answers</h2>{"".join(f"<h3>{e(q)}</h3><p>{e(a)}</p>" for q, a in qa)}</section>
<section class="sim"><h2>Similar funds</h2><ul>{"".join(f'<li><a href="/documentary-funding/{e(o["id"])}/">{e(o["name"])}</a> <span class=meta>{e(o.get("region"))}{(" &middot; deadline " + e(nice(o["next_deadline"]))) if o.get("_d") else ""}</span></li>' for o in sim)}</ul>
<p><a href="/documentary-funding/">See every fund and the full deadline calendar</a></p></section>
<p class="src">Checked {e(nice(x.get("checked")))}. Sources: {" ".join(f'<a href="{e(u)}" rel="noopener" target="_blank">{e(dom(u))}</a>' for u in x.get("sources", [])[:5])}. Dates change: confirm on the funder&#8217;s site before applying. Funder? Corrections to <a href="mailto:hello@theariel.tv?subject=Funding%20directory">hello@theariel.tv</a>.</p>
</main>
<footer>The Ariel &middot; Personalised story intelligence for screen &middot; <a href="/">theariel.tv</a> &middot; <a href="/documentary-funding/">Documentary funding</a> &middot; <a href="/commissioners/">UK &amp; US commissioners</a> &middot; <a href="/commissioners/whos-buying-what/">Who&#8217;s Buying What</a></footer>
</body></html>'''
    d = OUT / x["id"]
    d.mkdir(exist_ok=True)
    (d / "index.html").write_text(pg, encoding="utf-8")
    return None if thin(x) else f"https://theariel.tv/documentary-funding/{x['id']}/"

if __name__ == "__main__":
    main()
