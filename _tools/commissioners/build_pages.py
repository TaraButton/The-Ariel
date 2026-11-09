#!/usr/bin/env python3
"""Build one page per broadcaster: theariel.tv/commissioners/<slug>/ (e.g. /commissioners/channel-4/).

  python3 _tools/commissioners/build_pages.py      (run AFTER build.py; reuses its styles and cards)

Each page: who commissions factual/documentary there, recent commissions, official pitch routes,
current briefs, related broadcasters, FAQ (with FAQPage schema). Writes commissioners/pages.json
(list of page URLs) for the sitemap.
"""
import html, json, re, sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build as B  # noqa: E402

ROOT = B.ROOT
OUT = ROOT / "commissioners"
e, slug, nice = B.e, B.slug, B.nice_date

def page_slug(g):
    s = slug(g["broadcaster"])
    return s + "-us" if g["region"] == "US" and not s.endswith("-us") else s

def main():
    groups = B.load()
    idx = (OUT / "index.html").read_text()
    m = re.search(r"<style>.*?</style>", idx, re.S)
    if not m: sys.exit("run build.py first (no <style> in commissioners/index.html)")
    style = m.group(0)
    extra = """<style>
.crumbs{font-size:14px;margin:18px 0 0}.crumbs a{color:var(--gold-deep,#6E5428)}
.faq{background:#fff;border:1px solid #CFC9BE;border-radius:6px;padding:16px 20px;margin-top:28px}
.faq h2{font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;margin:0 0 6px}
.faq h3{font-size:17px;margin:14px 0 2px}.faq p{margin:0}
.related{margin-top:24px}.related a{display:inline-block;margin:4px 10px 4px 0}
.hero-pg{background:#1B1F3B;color:#fff;padding:30px 0 34px}.hero-pg h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:clamp(34px,5.5vw,52px);line-height:1.05;margin:10px 0 8px}
.hero-pg p{color:#E9E5DD;margin:0;max-width:760px}
</style>"""
    urls = []
    for g in groups:
        b, r = g["broadcaster"], g["region"]
        ps = page_slug(g)
        cs = g.get("commissioners", [])
        checked = g.get("checked", "")
        rname = "UK" if r == "UK" else "US"
        cards = "\n".join(B.card(b, c, checked) for c in cs)
        routes = "".join(f'<li><strong>{e(x.get("genre"))}</strong>: <a href="{e(x.get("url"))}" rel="noopener" target="_blank">{e(x.get("route") or x.get("url"))}</a></li>' for x in g.get("pitch_routes") or [] if x.get("url"))
        briefs = "".join(f'<li><a href="{e(x.get("url"))}" rel="noopener" target="_blank">{e(x.get("title"))}</a>{(" &middot; " + e(x.get("summary"))) if x.get("summary") else ""}{(" <span class=when>(" + e(x.get("date")) + ")</span>") if x.get("date") else ""}</li>' for x in g.get("briefs") or [] if x.get("url"))
        recent = [(c, rc) for c in cs for rc in (c.get("recent_commissions") or []) if rc.get("title")]
        # FAQ built only from data on the page
        first_route = next((x for x in g.get("pitch_routes") or [] if x.get("url")), None)
        qa = []
        qa.append((f"Who commissions documentaries and factual programmes at {b}?",
                   f"We list {len(cs)} commissioners at {b}: " + "; ".join(f'{c.get("name")} ({c.get("title")})' for c in cs[:6]) + ("; and more below." if len(cs) > 6 else ".")))
        if first_route:
            qa.append((f"How do I pitch to {b}?", f'{first_route.get("route") or "Use the official route"} (source: {B.domain(first_route.get("url"))}).'))
        else:
            pr = next((c.get("pitch_route") for c in cs if c.get("pitch_route")), "")
            if pr: qa.append((f"How do I pitch to {b}?", pr))
        if recent:
            qa.append((f"What has {b} commissioned recently?", "; ".join(f'{rc.get("title")} ({c.get("name")}{", " + rc["date"] if rc.get("date") else ""})' for c, rc in recent[:5]) + "."))
        faq_html = "".join(f"<h3>{e(q)}</h3><p>{e(a)}</p>" for q, a in qa)
        ld = [{"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qa]},
              {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
                  {"@type": "ListItem", "position": 1, "name": "Commissioners", "item": "https://theariel.tv/commissioners/"},
                  {"@type": "ListItem", "position": 2, "name": b, "item": f"https://theariel.tv/commissioners/{ps}/"}]}]
        others = [o for o in groups if o is not g and o["region"] == r]
        related = "".join(f'<a href="/commissioners/{page_slug(o)}/">{e(o["broadcaster"])} commissioners</a>' for o in others)
        title = f"{b} Commissioners: Who Commissions Factual and Documentary ({rname}, {date.today().year}) | The Ariel"
        desc = (f"Who commissions factual and documentary at {b}: {len(cs)} commissioners, their remits, recent commissions and the official way to pitch. "
                f"Every line sourced, checked {nice(checked)}. Free from The Ariel.")
        html_page = f'''<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}"><link rel="canonical" href="https://theariel.tv/commissioners/{ps}/">
<meta property="og:type" content="website"><meta property="og:site_name" content="The Ariel"><meta property="og:title" content="{e(b)} commissioners: factual and documentary">
<meta property="og:description" content="{e(desc)}"><meta property="og:url" content="https://theariel.tv/commissioners/{ps}/"><meta property="og:image" content="https://theariel.tv/link-card.png">
<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/ariel-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Lato:wght@400;700;900&display=swap" rel="stylesheet">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
{style}
{extra}
</head><body>
<section class="hero-pg"><div class="wrap">
  <p style="margin:0"><a href="/" style="color:#fff;text-decoration:none;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:600">The Ariel</a></p>
  <h1>{e(b)} commissioners: factual and documentary</h1>
  <p>Who commissions factual and documentary at {e(b)} ({rname}), what they have commissioned recently and the official way to pitch. {len(cs)} commissioners, checked {e(nice(checked))}.</p>
</div></section>
<main class="wrap">
<p class="crumbs"><a href="/commissioners/">All UK &amp; US commissioners</a> &rsaquo; {e(b)}</p>
<section class="bc"><div class="how">{f'<div><h4>Official pitch routes</h4><ul>{routes}</ul></div>' if routes else ""}{f'<div><h4>What they say they want now</h4><ul>{briefs}</ul></div>' if briefs else ""}</div>
<div class="grid">{cards}</div></section>
<section class="faq"><h2>Pitching to {e(b)}: quick answers</h2>{faq_html}</section>
<p class="related"><strong>Other {rname} broadcasters:</strong> {related}</p>
<p class="related"><strong>Free from The Ariel:</strong> <a href="/commissioners/">Commissioners list and quick match</a> <a href="/commissioners/whos-buying-what/">Who&#8217;s Buying What (weekly)</a> <a href="/documentary-funding/">Documentary funding and deadlines</a> <a href="/talent-agencies/">Talent agencies</a></p>
</main>
<footer>The Ariel &middot; Personalised story intelligence for screen &middot; <a href="/">theariel.tv</a> &middot; Commissioners: is your entry right? Email <a href="mailto:hello@theariel.tv?subject={e(b)}%20commissioners">hello@theariel.tv</a></footer>
</body></html>'''
        d = OUT / ps
        d.mkdir(exist_ok=True)
        (d / "index.html").write_text(html_page, encoding="utf-8")
        urls.append(f"https://theariel.tv/commissioners/{ps}/")
    (OUT / "pages.json").write_text(json.dumps(urls, indent=1))
    print(f"built {len(urls)} broadcaster pages")

if __name__ == "__main__":
    main()
