#!/usr/bin/env python3
"""Trade headlines for Who's Buying What - "Also in the trades".

Uses ONLY the publishers' own RSS headline feeds, as their feed terms allow:
headline exactly as published (entities decoded, words unchanged), credited, linked
straight to the article. Never opens or reads the articles themselves (Penske Media's
terms bar automated tools from the article pages).

  python3 -I _tools/commissioners/wbw_trades.py --since 2026-11-01 --out /tmp/wbw-trades.json
"""
import argparse, html, json, re, urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

FEEDS = [  # (source credit, feed url, max pages)
    ("Deadline", "https://deadline.com/v/tv/feed/", 20),
    ("Deadline", "https://deadline.com/category/documentary/feed/", 3),
    ("Deadline", "https://deadline.com/v/film/feed/", 15),
    ("Variety", "https://variety.com/v/tv/feed/", 20),
    ("The Hollywood Reporter", "https://www.hollywoodreporter.com/c/tv/feed/", 12),
    ("The Hollywood Reporter", "https://www.hollywoodreporter.com/t/documentaries/feed/", 2),
]
KEEP = re.compile(r"\b(docs?|documentar(y|ies)|docuseries|docu-series|doc series|unscripted|nonfiction|non-fiction|true[- ]crime|factual|reality series)\b", re.I)
SKIP = re.compile(r"\b(review|rankings|ratings|box office|trailer|first look|clip|watch|podcast|interview|on her|on his|on their)\b|\?$", re.I)
DEAL = re.compile(r"\b(order|orders|ordered|greenlit|greenlight|greenlights|commission|commissions|commissioned|picks? up|picked up|acquire|acquires|acquired|lands|renew|renews|renewed|sets|taps|names|hires|promot|exits|joins|upped|deal|first[- ]look|slate)\b", re.I)

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; TheAriel feed reader; +https://theariel.tv)"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")

def items(xml):
    for m in re.finditer(r"<item>(.*?)</item>", xml, re.S):
        b = m.group(1)
        t = re.search(r"<title>(.*?)</title>", b, re.S)
        l = re.search(r"<link>(.*?)</link>", b, re.S)
        d = re.search(r"<pubDate>(.*?)</pubDate>", b, re.S)
        if not (t and l and d):
            continue
        title = html.unescape(re.sub(r"^<!\[CDATA\[|\]\]>$", "", t.group(1).strip()))
        yield title, l.group(1).strip(), parsedate_to_datetime(d.group(1).strip())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    since = datetime.fromisoformat(a.since).replace(tzinfo=timezone.utc)
    seen, out = set(), []
    for source, url, pages in FEEDS:
        n = 0
        for p in range(1, pages + 1):
            try:
                xml = fetch(url + (f"?paged={p}" if p > 1 else ""))
            except Exception as e:
                print(f"{source} page {p}: {e}")
                break
            got = list(items(xml))
            if not got:
                break
            for title, link, dt in got:
                if dt < since or link in seen:
                    continue
                if KEEP.search(title) and not SKIP.search(title):
                    seen.add(link)
                    out.append({"headline": title, "url": link, "source": source, "date": dt.date().isoformat()})
                    n += 1
            if min(dt for _, _, dt in got) < since:
                break
        print(f"{source} ({url}): {n}")
    out.sort(key=lambda x: x["date"], reverse=True)
    json.dump(out, open(a.out, "w"), indent=1, ensure_ascii=False)
    print(f"total {len(out)} -> {a.out}")

if __name__ == "__main__":
    main()
