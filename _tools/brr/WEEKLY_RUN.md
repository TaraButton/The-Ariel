# British Review of Reviews - weekly run (spec v1, 2026-11-01)

Runs every **Sunday evening (UK)** in the cloud. Produces Monday's edition, publishes it to
theariel.tv/reviews/, and the newsletter backend (Apps Script, "British Review of Reviews" sheet)
pulls `reviews/editions/latest.json` and emails it to subscribers at 07:00 Monday.

Lives in `_tools/` so GitHub Pages never publishes it. Canonical mirror for Tara's records:
The Ariel HQ/Platform/review-of-reviews/.

## Rules that never bend
- Non-fiction only (fiction may become a separate stream later).
- One line per book (max ~20 words) in our own words, from the review's standfirst and the book
  details the publication lists. **No quotes from reviews. No facts that are not on the page.**
- Every book links to at least one real review URL (https). Never invent a URL or a title.
- No em dashes anywhere (use hyphens). No AI / tech language. No "replaces scouts" framing.
- Do not work around paywalls or bot blocks. Telegraph, TLS, New Statesman stay uncovered unless a
  newsletter for them arrives in the sources inbox.

## Steps
1. **Repo.** Attach and clone `TaraButton/the-ariel` (push access). `cd` into it. `git pull`.
   If `_tools/brr/config.json` still has `"endpoint": "PENDING_WEB_APP_URL"`, the sign-up backend is not
   live yet: do not publish. Tell Tara the edition is waiting on the backend set-up and stop.
   If `reviews/editions/<next Monday>.json` already exists, that edition is already published: do
   nothing, tell Tara it was already done, and stop. Never overwrite a published edition.
2. **Collect.** `SSL_CERT_FILE=/root/.ccr/ca-bundle.crt python3 -I _tools/brr/collect.py --out /tmp/brr-candidates.json`
   (skips any review URL already in a published edition). Takes ~4 minutes. Note the per-source
   counts it prints; a source that drops to 0 when it usually has items goes in the run summary.
3. **Times books bulletin.** In Gmail, search
   `label:!!Ariel/Ariel-Sources from:(thetimes.com OR thetimes.co.uk) newer_than:8d` and open only
   the books bulletin (books / reading / review in the subject or masthead). Add each reviewed
   non-fiction book as a candidate with publication "Times/Sunday Times", the headline, standfirst
   and its thetimes.com article link (strip tracking redirects only if the clean URL is visible in
   the email; otherwise use the link as given). Ignore every other Times newsletter.
4. **Edit.** For every candidate decide:
   - Is it a review of a specific book? (Drop essays, interviews, round-ups whose books are also
     reviewed singly, film/TV reviews filed under Books, diaries, poems, letters.)
   - Non-fiction? (Drop novels, stories, poetry, children's books.)
   - Book title, author (as the publication lists them).
   - **subject**: exactly one of True crime, Espionage, Politics & world affairs, Business & power,
     Biography & memoir, History, Society & ideas, Nature & place, Arts & culture, Books & writing,
     Life & leisure.
   - **line**: one sentence describing the book.
   - **lead**: true only if the book has the makings of a film or TV project (a strong central
     figure, a crime or mystery, a secret world, an untold story, a dramatic event). Aim for
     10-20% of books, spread across subjects.
   - **why** (leads only): one short sentence on its screen potential (character, world, event,
     untold angle), drawn from the page, not invented facts. Shown to readers as "Screen potential".
     NEVER say or hint that rights are available, unoptioned, "worth checking", or that the author's
     books get adapted. We have not checked rights; the page and email say so.
   Merge the same book reviewed in several papers into one entry with all its review links (order:
   FT, Times/Sunday Times, Guardian/Observer, Spectator, Economist, LRB, Literary Review). Literary
   Review is monthly: include its new issue in the first edition after it appears.
5. **Write** `reviews/editions/YYYY-MM-DD.json` named for **Monday's date**:
   ```json
   {"edition_id":"2026-11-09","date_label":"9 November 2026",
    "window":"Reviews published 31 October - 8 November 2026",
    "preheader":"NN non-fiction books reviewed in the British papers this week, one line each.",
    "books":[{"book":"...","author":"...","subject":"History","line":"...","lead":false,"why":"",
              "reviews":[{"pub":"FT","url":"https://..."}]}]}
   ```
   Publication short names: FT, Times/Sunday Times, Guardian/Observer, Spectator, Economist, LRB,
   Literary Review.
6. **Check.** Open every review URL you are unsure of. Then `python3 -I _tools/brr/build_site.py`
   (it refuses an edition with a bad subject, a non-https link or an em dash). If fewer than 15
   books, still publish but say so in the summary.
7. **Publish.** `git add reviews sitemap.xml && git commit -m "Review of Reviews: <date> edition (<N> books)"`
   then `git fetch origin main && git rebase origin/main && git push origin HEAD:main`.
   GitHub Pages updates in about a minute. Confirm
   https://theariel.tv/reviews/editions/latest.json shows the new edition_id.
8. **Summary.** One short message to Tara: edition date, number of books, number of leads, source
   counts (flag any source at 0), the page link https://theariel.tv/reviews/ and that the email
   goes out Monday 07:00. Do not send the email yourself; the backend does it.

## What the backend does (for reference)
- Pulls latest.json hourly; a new edition_id is stored for the next Monday 07:00 London.
- Each subscriber gets their own version: leads in the subjects they chose come first with the
  "why"; with no subjects (or no matching leads) they get the week's top leads.
- While the script property TEST_ONLY_TO is set, it only emails those addresses. `goLive()` clears it.
