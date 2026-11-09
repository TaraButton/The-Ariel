#!/usr/bin/env python3
"""London Review of Reviews - collector (v1, 2026-11-01).

Pulls the week's book reviews from open, sanctioned sources (RSS feeds and
public section pages) and writes candidate rows to JSON. It does NOT write
summaries: the one-line summary + fiction/non-fiction call is a model step
that reads this JSON (see lrr spec).

Each row: source_id, publication, title, url, pub (ISO or ""), standfirst,
categories, reviewer, book_hint, kind_hint (nonfiction|fiction|unknown),
is_roundup.

Usage: python3 lrr_collect.py --days 8 --out candidates.json
"""
import argparse, html, json, os, re, ssl, sys, urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36"
CTX = ssl.create_default_context()

def get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=timeout, context=CTX).read().decode("utf-8", "ignore")

def clean(t):
    t = re.sub(r"<!\[CDATA\[|\]\]>", "", t or "")
    t = re.sub(r"<[^>]+>", " ", t)
    return " ".join(html.unescape(t).split())

def parse_date(s):
    try:
        return parsedate_to_datetime(s).astimezone(timezone.utc)
    except Exception:
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            return None

FICTION_CATS = {"fiction", "fiction in translation", "crime fiction", "thrillers", "horror books",
                "science fiction books", "fantasy books", "poetry", "short stories", "romance books",
                "historical fiction", "comics and graphic novels"}
NON_BOOK_CATS = {"film", "television", "television & radio", "music", "games"}
NONFICTION_CATS_RE = re.compile(r"(biography|memoir|history|politics|science|nature|society|economics|philosophy|travel|true crime|essays|psychology|religion|sport and leisure|health|art and design) ?(books)?$")
ROUNDUP_RE = re.compile(r"best (recent|books)|round-?up|books of the (week|month|year)|in brief|best .* of 20\d\d", re.I)

def rss_items(xml):
    for it in re.findall(r"<item\b.*?</item>", xml, re.S):
        g = lambda tag: (re.search(rf"<{tag}\b[^>]*>(.*?)</{tag}>", it, re.S) or [None, ""])[1]
        cats = [clean(c).lower() for c in re.findall(r"<category[^>]*>(.*?)</category>", it, re.S)]
        yield {"title": clean(g("title")), "url": clean(g("link")).split("?")[0],
               "pub": g("pubDate") or g("dc:date"), "standfirst": clean(g("description"))[:400],
               "categories": cats, "creator": clean(g("dc:creator"))}

def from_rss(source_id, publication, url, since, keep=lambda r: True):
    out = []
    for r in rss_items(get(url)):
        d = parse_date(r["pub"])
        if d and d < since:
            continue
        if not keep(r):
            continue
        cats = set(r["categories"])
        if cats & FICTION_CATS or any("children" in c for c in cats):
            kind = "fiction"
        elif any(NONFICTION_CATS_RE.search(c) for c in cats):
            kind = "nonfiction"
        else:
            kind = "unknown"
        out.append({"source_id": source_id, "publication": publication, "title": r["title"], "url": r["url"],
                    "pub": d.isoformat() if d else "", "standfirst": r["standfirst"],
                    "categories": r["categories"], "reviewer": r["creator"], "book_hint": "",
                    "kind_hint": kind, "is_roundup": bool(ROUNDUP_RE.search(r["title"]))})
    return out

def guardian(since):
    def keep(r):
        cats = set(r["categories"])
        t = r["title"].lower()
        if "audiobook" in t or " review" not in t or "books" not in cats:
            return False
        if cats & NON_BOOK_CATS and not any(NONFICTION_CATS_RE.search(c) for c in cats):
            return False  # film/TV adaptations tagged Books
        return True
    rows = from_rss("guardian-books", "The Guardian",
                    "https://www.theguardian.com/books/books+tone/reviews/rss", since, keep)
    seen = {r["url"] for r in rows}
    # history reviews feed catches extra non-fiction the main feed rolls off
    for r in from_rss("guardian-books", "The Guardian",
                      "https://www.theguardian.com/books/history+tone/reviews/rss", since, keep):
        if r["url"] not in seen:
            rows.append(r)
    return rows

def ft(since):
    rows = from_rss("ft-nonfiction", "Financial Times", "https://www.ft.com/non-fiction?format=rss", since)
    for r in rows:
        r["kind_hint"] = "nonfiction"
    seen = {r["url"] for r in rows}
    # the general books feed carries memoir/biography the non-fiction feed sometimes misses
    for r in from_rss("ft-books", "Financial Times", "https://www.ft.com/books?format=rss", since):
        if r["url"] not in seen:
            rows.append(r)
    return rows

def lrb(since):
    rows = from_rss("lrb", "London Review of Books", "https://www.lrb.co.uk/feeds/rss", since)
    rows = [r for r in rows if not re.search(r"^(letters|table of contents)$|: (diary|short cuts|at the movies|two poems|poem)\b|^[^:]+: \d+ \w+$", r["title"], re.I)]
    for r in rows:
        try:
            m = re.search(r'class="reviewed-items-holder">(.*?)</div>', get(r["url"]), re.S)
            r["book_hint"] = re.sub(r"\s*Show More\s*$", "", clean(m.group(1))) if m else ""
        except Exception:
            pass
    return [r for r in rows if r["book_hint"]]  # no reviewed book = essay, not a review

def economist(since):
    # culture feed mixes reviews with essays; model step decides which are book reviews
    rows = from_rss("economist-culture", "The Economist", "https://www.economist.com/culture/rss.xml", since)
    return [r for r in rows if not re.search(r"what to (watch|read|listen)", r["title"], re.I)]

def meta(page, prop):
    m = re.search(rf'<meta[^>]+(?:property|name)="{prop}"[^>]+content="([^"]*)"', page) or \
        re.search(rf'<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="{prop}"', page)
    return html.unescape(m.group(1)).strip() if m else ""

def spectator(since, max_articles=40):
    page = get("https://spectator.com/the-critics/books/")
    links = list(dict.fromkeys(re.findall(r'href="(https://spectator\.com/article/[^"?#]+)', page)))[:max_articles]
    rows = []
    for u in links:
        try:
            a = get(u)
        except Exception:
            continue
        d = parse_date(meta(a, "article:published_time"))
        if d and d < since:
            continue
        books = []
        for b in re.findall(r'<li class="related-books__item">(.*?)</li>', a, re.S):
            parts = [clean(x) for x in re.findall(r'<(?:h3|p)[^>]*class="related-books__[a-z-]+"[^>]*>(.*?)</(?:h3|p)>', b, re.S)]
            if parts:
                books.append(" - ".join(parts))
        rows.append({"source_id": "spectator-books", "publication": "The Spectator", "title": meta(a, "og:title"),
                     "url": u, "pub": d.isoformat() if d else "", "standfirst": meta(a, "og:description")[:400],
                     "categories": [], "reviewer": meta(a, "author"), "book_hint": " | ".join(books),
                     "kind_hint": "unknown", "is_roundup": False})
    return rows

def literary_review(since):
    """Monthly. Current-issue page lists reviewer, headline, book line per piece."""
    page = get("https://literaryreview.co.uk/current-issue")
    issue = clean((re.search(r"<title>(.*?)</title>", page, re.S) or [None, ""])[1])
    rows, seen = [], set()
    skip = {"back-issue", "search", "subscribe", "about", "shop", "current-issue", "contact",
            "advertising", "privacy-policy", "bad-sex-in-fiction-award"}
    for m in re.finditer(r'<a href="(https://literaryreview\.co\.uk/([a-z0-9-]+))"[^>]*>(.*?)</a>', page, re.S):
        url, slug, inner = m.group(1), m.group(2), m.group(3)
        if slug in skip or url in seen:
            continue
        text = clean(inner).replace(" LR", "").strip()
        if " By " not in text and " by " not in text:
            continue  # columns/poems without a book line
        seen.add(url)
        rows.append({"source_id": "literary-review", "publication": "Literary Review", "title": text[:300],
                     "url": url, "pub": "", "standfirst": "", "categories": [], "reviewer": "",
                     "book_hint": text, "kind_hint": "unknown",
                     "is_roundup": bool(re.search(r"round-?up", text, re.I)), "issue": issue})
    return rows

# name: (fn, lookback_days). Weeklies look back 10 days, fortnightlies/monthlies further;
# the seen-URL state file stops anything appearing in two editions.
SOURCES = {"guardian": (guardian, 10), "ft": (ft, 10), "spectator": (spectator, 10), "lrb": (lrb, 18),
           "economist": (economist, 10), "literary-review": (literary_review, 40)}

# ---- Children's Review of Reviews (added 9 Nov 2026): --set kids ----
KIDS_RE = re.compile(r"child|picture ?book|young adult|\bya\b|teen|middle.grade|ages? \d|\d\+|kids", re.I)
BFK_AGES = {41: "0-5", 42: "5-8", 43: "8-10", 44: "10-14", 45: "14+", 40: "about children's books"}

def guardian_kids(since):
    """Guardian 'Children and teenagers' tag: roundups (kept, is_roundup) and single reviews."""
    rows = from_rss("guardian-kids", "The Guardian", "https://www.theguardian.com/books/booksforchildrenandteenagers/rss", since)
    out = []
    for r in rows:
        if not re.search(r"review|roundup|round-up|best (new|recent)", r["title"], re.I):
            continue  # interviews, news, obituaries
        r["kind_hint"] = "kids"
        out.append(r)
    return out

def books_for_keeps(since):
    """Books for Keeps: the children's book magazine. Open WordPress API; each review carries an age band,
    and the review page carries the book's author and a 1-5 star rating (5 rave, 4 warm, 3 mixed)."""
    data = json.loads(get("https://booksforkeeps.co.uk/wp-json/wp/v2/review?per_page=100&after=" + since.strftime("%Y-%m-%dT%H:%M:%S")))
    rows = []
    for x in data:
        page = ""
        try:
            page = get(x["link"])
        except Exception:
            pass
        i = page.find("<h1")
        toks = [t.strip() for t in html.unescape(re.sub(r"<[^>]+>", "\n", re.sub(r"<script.*?</script>|<style.*?</style>", "", page[i:i + 3000], flags=re.S))).split("\n") if t.strip()]
        author = toks[toks.index("Author:") + 1] if "Author:" in toks else ""
        illus = toks[toks.index("Illustrator:") + 1] if "Illustrator:" in toks else ""
        stars = page.count("fa fa-star checked")
        rows.append({"source_id": "books-for-keeps", "publication": "Books for Keeps", "title": clean(x["title"]["rendered"]),
                     "url": x["link"], "pub": x["date"] + "+00:00", "standfirst": clean(x["content"]["rendered"])[:600],
                     "categories": [BFK_AGES.get(a, str(a)) for a in x.get("age-range", [])], "reviewer": "",
                     "book_hint": " - ".join(v for v in [clean(x["title"]["rendered"]), author, ("illustrated by " + illus) if illus else ""] if v),
                     "kind_hint": "kids", "is_roundup": False, "stars": stars})
    return rows

def kids_filter(fn, source_id):
    """Children's reviews from the grown-up sources (FT, Spectator, Economist): keep only those that look like kids' books."""
    def run(since):
        out = []
        for r in fn(since):
            cats = " ".join(r.get("categories") or [])
            if KIDS_RE.search(" ".join([r["title"], r["standfirst"], cats, r.get("book_hint", "")])):
                r["source_id"] = source_id; r["kind_hint"] = "kids"; out.append(r)
        return out
    return run

KIDS_SOURCES = {"guardian-kids": (guardian_kids, 16), "books-for-keeps": (books_for_keeps, 16),
                "ft-kids": (kids_filter(ft, "ft-kids"), 16), "spectator-kids": (kids_filter(spectator, "spectator-kids"), 16)}


def enrich(rows, limit=80):
    """Fill missing standfirst from the article's public og:description."""
    n = 0
    for r in rows:
        if r["standfirst"] or n >= limit:
            continue
        n += 1
        try:
            a = get(r["url"])
            r["standfirst"] = meta(a, "og:description")[:400]
            if not r["pub"]:
                d = parse_date(meta(a, "article:published_time"))
                r["pub"] = d.isoformat() if d else ""
        except Exception:
            pass

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=8, help="unused unless a source has no lookback")
    ap.add_argument("--out", default="lrr-candidates.json")
    ap.add_argument("--only", default="")
    ap.add_argument("--state", default="", help="JSON list of URLs already published; those are skipped")
    ap.add_argument("--editions-dir", default="", help="skip review URLs already in published editions (default: the set's own)")
    ap.add_argument("--set", default="main", choices=["main", "kids"], help="kids = Children's Review of Reviews sources")
    a = ap.parse_args()
    if not a.editions_dir:
        a.editions_dir = "reviews/children/editions" if a.set == "kids" else "reviews/editions"
    sources = KIDS_SOURCES if a.set == "kids" else SOURCES
    since = datetime.now(timezone.utc) - timedelta(days=a.days)
    published = set(json.load(open(a.state))) if a.state else set()
    if a.editions_dir and os.path.isdir(a.editions_dir):
        for f in os.listdir(a.editions_dir):
            if re.match(r"^\d{4}-\d{2}-\d{2}\.json$", f):
                for b in json.load(open(os.path.join(a.editions_dir, f)))["books"]:
                    for r in b["reviews"]:
                        published.add(r["url"])
    rows, report = [], {}
    for name, (fn, lookback) in sources.items():
        if a.only and name not in a.only.split(","):
            continue
        try:
            got = [r for r in fn(datetime.now(timezone.utc) - timedelta(days=lookback)) if r["url"] not in published]
            report[name] = len(got)
            rows += got
        except Exception as e:
            report[name] = f"ERROR {type(e).__name__}: {str(e)[:80]}"
    seen, uniq = set(), []
    for r in rows:
        if r["url"] in seen:
            continue
        seen.add(r["url"]); uniq.append(r)
    enrich(uniq)
    json.dump({"generated": datetime.now(timezone.utc).isoformat(), "since": since.isoformat(),
               "report": report, "items": uniq}, open(a.out, "w"), indent=1, ensure_ascii=False)
    print(json.dumps(report), "total", len(uniq))

if __name__ == "__main__":
    main()
