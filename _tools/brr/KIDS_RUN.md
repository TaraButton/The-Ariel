# Children's Review of Reviews - run (spec v1, 9 Nov 2026)

Tara, 9 Nov 2026: "launch kids. Another review of reviews, and its own genres ... preschool non fiction,
preschool fiction, 5-8, midgrade, YA. There are less reviews but the world is tighter."

Runs as the LAST part of the Sunday London Review of Reviews run (WEEKLY_RUN.md step 10), in the same
session, so there is no separate scheduled task. Page: https://theariel.tv/reviews/children/ .
Backend: the same "British Review of Reviews" Apps Script pulls `reviews/children/editions/latest.json`
hourly and emails subscribers who chose a children's subject (or signed up on the children's page) at
07:00 the next Monday. Same rules as WEEKLY_RUN "Rules that never bend" (own words, no quotes, real https
review links only, no em dashes, no AI language, never hint rights are available).

## Cadence
Publish only when there are **8 or more** new books. Fewer: skip this week (say so in the summary) and
the collector's lookback carries them into the next edition. Children's reviews come in bursts (Books for
Keeps issues every two months, Guardian and Times monthly roundups), so expect roughly fortnightly.

## Subjects (age band first, then fiction / non-fiction) - exactly these strings
Preschool fiction (0-5) · Preschool non-fiction (0-5) · 5-8 fiction · 5-8 non-fiction ·
Middle grade fiction (8-12) · Middle grade non-fiction (8-12) · YA fiction (12+) · YA non-fiction (12+)
Use the reviewer's or publisher's age where given ("5+" picture book = 5-8; "7+" or "8+" = middle grade;
"14+" = YA; Books for Keeps bands: Under 5s = 0-5, 5-8 = 5-8, 8-10 and 10-14 = middle grade unless the
book is clearly teen, 14+ = YA). Two sources disagree: use the band most of them give, else the younger.
Graphic novels and poetry for children go in the band's fiction subject.

## Steps
1. **Collect.** `SSL_CERT_FILE=/root/.ccr/ca-bundle.crt python3 -I _tools/brr/collect.py --set kids --out /tmp/kids-candidates.json`
   Sources: Guardian "Children and teenagers" tag (roundups are KEPT here: split each into its books),
   Books for Keeps (open WordPress API; gives age band, author and a 1-5 star rating), children's
   reviews in the FT and Spectator feeds. Skips review URLs already in a published children's edition.
2. **Times.** In the Times newsletters (same Gmail search as WEEKLY_RUN step 3) look for children's
   picks and Lucy Bannerman's monthly "best children's books to read now" (Get Britain Reading). Use the
   headline, standfirst and link. Do not work round the paywall.
3. **Edit** each candidate into books: book, author ("X, illustrated by Y" where the review names an
   illustrator), subject (above), one-line description, reviews [{pub, url, verdict}].
   Publication names: Guardian, Observer, Times/Sunday Times, FT, Spectator, Books for Keeps.
   Verdict: as WEEKLY_RUN; Books for Keeps stars 5 = rave, 4 = warm, 3 = mixed, 1-2 = pan. A roundup
   that recommends the book = warm unless its wording is clearly a rave.
   **lead** (screen potential, 15-30%): for children's screen, favour a character children will follow
   across episodes, a world or premise that can carry a series, a high-concept YA premise, an
   adventure or true story with a strong child or animal at the centre, a series or trilogy. Picture
   books count: a strong character and simple repeatable premise is preschool TV's raw material.
   **why**: one sentence on the screen potential, from the review, never about rights.
   Merge the same book across publications.
4. **Write** `reviews/children/editions/YYYY-MM-DD.json` named for Monday's date:
   `{"edition_id":"kids-YYYY-MM-DD","date_label":"...","window":"Reviews published ...","preheader":"NN children's and YA books reviewed in the British press, sorted by age, one line each.","books":[...]}`
   The edition_id MUST start `kids-` (that is how the backend tells the two Reviews apart).
5. **Build and check.** `python3 -I _tools/brr/build_kids.py` (refuses a bad subject, bad link or em dash).
6. **Publish** with the grown-up edition: `git add reviews sitemap.xml` and commit "Children's Review of
   Reviews: <date> edition (<N> books)", then fetch, rebase and push as WEEKLY_RUN step 7. Confirm
   https://theariel.tv/reviews/children/editions/latest.json shows the new edition_id.
7. **Genres cross-post.** As WEEKLY_RUN "Fiction genre cross-post", but for the children's genres:
   GET `?action=genre_active`; for each of `kids-preschool` (0-5 subjects), `kids-5-8`, `kids-middle-grade`,
   `kids-ya` that is active, POST that band's screen picks to `?genre=<slug>&key=<key>`, label from the
   genre's labels (picture book -> "Picture Books", graphic novel -> "Graphic Novels", etc.). Not active:
   skip and log it.
8. **Agents.** Same as WEEKLY_RUN steps 8-9 (research the agent for every book, registry, Rights tab,
   Monday 10:00 agent asks sharing the 40-a-day Outbox cap; grown-up asks go first, children's overflow to
   Tuesday). Children's agents are a tight world: reuse the registry hard. Every ask mentions that our
   producers include BAFTA and Emmy award winners.
9. **Summary** to Tara: edition date or "skipped (N books)", number of books, leads, per-source counts.
