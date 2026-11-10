#!/usr/bin/env python3
"""Agency rights pages: write the three page shells for each agency.

    python3 _tools/agency_pages/build.py sheil-land "Sheil Land Associates"

Creates (in the site repo):
    rights/<slug>/index.html        catalogue + single-title enquiry page (?t=ID)
    rights/<slug>/edit/index.html   the agency's private page (?k=TOKEN)
    rights/<slug>/guide/index.html  print-ready rights guide
All three load rights/assets/rights.js + rights.css; the data lives in the Apps Script
(_tools/brr/apps-script/Agencies.js), so nothing private is ever committed to the repo.
"""
import os, sys, html

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Lato:ital,wght@0,400;0,700;0,900;1,400&display=swap" rel="stylesheet">')
VER = '20261110c'

def shell(view, slug, name, title, desc, depth):
    up = '../' * depth
    bar = '' if view != 'edit' else (
        '<header class="bar"><div class="wrap"><a href="/">The Ariel</a><span class="tag">'
        + ('Your private page' if view == 'edit' else 'Film &amp; TV rights') + '</span></div></header>')
    foot = '' if view != 'catalogue' else (
        '<footer class="site" style="font-size:12px;padding:14px 16px">Made with <a href="/">The Ariel</a></footer>')
    return f'''<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta name="robots" content="noindex">
<meta property="og:title" content="{html.escape(title)}"><meta property="og:description" content="{html.escape(desc)}">
<meta property="og:image" content="https://theariel.tv/link-card.png"><link rel="icon" href="/ariel-icon.png">
{FONTS}
<link rel="stylesheet" href="{up}assets/rights.css?v={VER}">
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js" defer></script>
</head>
<body data-view="{view}" data-slug="{html.escape(slug)}">
{bar}
<div id="app"><div class="loading">Loading…</div></div>
{foot}
<script src="{up}assets/rights.js?v={VER}" defer></script>
</body></html>
'''

def build(slug, name):
    base = os.path.join(ROOT, 'rights', slug)
    pages = {
        'index.html': ('catalogue', f'{name} - Film & TV rights | The Ariel', f'Titles from {name} available for film and television adaptation.', 1),
        'edit/index.html': ('edit', f'{name} - your rights list | The Ariel', 'Private page for the agency.', 2),
        'guide/index.html': ('guide', f'{name} - Film & TV Rights Guide', f'Rights guide from {name}.', 2),
    }
    for rel, (view, title, desc, depth) in pages.items():
        p = os.path.join(base, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, 'w').write(shell(view, slug, name, title, desc, depth))
        print('wrote', os.path.relpath(p, ROOT))

if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    build(sys.argv[1], sys.argv[2])
