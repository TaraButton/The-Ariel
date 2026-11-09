#!/usr/bin/env python3
"""Add every URL listed in commissioners/pages.json and documentary-funding/pages.json to sitemap.xml
(idempotent). Run after the builders.  python3 _tools/sitemap_add.py"""
import json, re
from datetime import date
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sm = ROOT / "sitemap.xml"
t = sm.read_text()
have = set(re.findall(r"<loc>([^<]+)</loc>", t))
new = []
for pj in [ROOT / "commissioners/pages.json", ROOT / "documentary-funding/pages.json"]:
    if pj.exists():
        new += [u for u in json.loads(pj.read_text()) if u not in have]
if new:
    add = "".join(f"  <url><loc>{u}</loc><lastmod>{date.today()}</lastmod><changefreq>weekly</changefreq></url>\n" for u in new)
    t = t.replace("</urlset>", add + "</urlset>")
    sm.write_text(t)
print(f"sitemap: {len(new)} urls added")
