# London Review of Reviews - weekly run (spec v1, 2026-11-01)

Runs every **Sunday evening (UK)** in the cloud. Produces Monday's edition, publishes it to
theariel.tv/reviews/, and the newsletter backend (Apps Script, "British Review of Reviews" sheet)
pulls `reviews/editions/latest.json` and emails it to subscribers at 07:00 Monday.

Lives in `_tools/` so GitHub Pages never publishes it. Canonical mirror for Tara's records:
The Ariel HQ/Platform/review-of-reviews/.

## Rules that never bend
- Fiction AND non-fiction (Tara, 5 Nov 2026: fiction launched). Poetry, children's and picture books stay out.
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
   book (fiction or non-fiction) as a candidate with publication "Times/Sunday Times", the headline, standfirst
   and its thetimes.com article link (strip tracking redirects only if the clean URL is visible in
   the email; otherwise use the link as given). Ignore every other Times newsletter.
4. **Edit.** For every candidate decide:
   - Is it a review of a specific book? (Drop essays, interviews, round-ups whose books are also
     reviewed singly, film/TV reviews filed under Books, diaries, poems, letters.)
   - A book for grown-ups? (Keep novels and story collections. Drop poetry, children's and picture books.)
   - Book title, author (as the publication lists them).
   - **subject**: exactly one of True crime, Espionage, Politics & world affairs, Business & power,
     Biography & memoir, History, Society & ideas, Nature & place, Arts & culture, Books & writing,
     Life & leisure (non-fiction), or Crime & thriller fiction, Literary fiction, Historical fiction,
     Other fiction (novels and story collections; sci-fi, fantasy, romance, horror and translated fiction
     with no better home go in Other fiction). The page shows fiction under its own "Fiction" heading.
   - **line**: one sentence describing the book.
   - **verdict** (per review, Tara 2 Nov): the REVIEWER's verdict, `rave`, `warm`, `mixed` or `pan`, shown on the
     page and in the email next to the paper's name. Set it only when the review's own wording makes it
     clear (standfirst, headline or text; FT is paywalled, so its standfirst is the evidence). Where a paper
     prints stars: 5 rave, 4 warm, 3 mixed, 1-2 pan, and never show the stars. Unclear: leave it out. Never
     guess. When unsure between rave and warm, use warm. A book panned in every review is dropped unless it
     is a screen pick (then its "why" must say why the story still matters); build_site.py enforces this.
     Within each subject the page sorts screen picks first, then by best verdict, then by number of papers.
   - **lead**: true only if the book has the makings of a film or TV project (a strong central
     figure, a crime or mystery, a secret world, an untold story, a dramatic event). For fiction:
     a premise that can be said in a sentence, a central character worth following, a vivid world
     or period, series potential, or clear review heat. Aim for 10-20% of books, spread across subjects.
   - **why** (leads only): one short sentence on its screen potential (character, world, event,
     untold angle), drawn from the page, not invented facts. Shown to readers as "Screen potential".
     NEVER say or hint that rights are available, unoptioned, "worth checking", or that the author's
     books get adapted. We have not checked rights; the page and email say so.
   Merge the same book reviewed in several papers into one entry with all its review links (order:
   FT, Times/Sunday Times, Guardian, Observer (Tortoise, observer.co.uk, separate since 2025), Spectator, Economist, LRB, Literary Review). Literary
   Review is monthly: include its new issue in the first edition after it appears.
5. **Write** `reviews/editions/YYYY-MM-DD.json` named for **Monday's date**:
   ```json
   {"edition_id":"2026-11-09","date_label":"9 November 2026",
    "window":"Reviews published 31 October - 8 November 2026",
    "preheader":"NN books reviewed in the British papers this week, fiction and non-fiction, one line each.",
    "books":[{"book":"...","author":"...","subject":"History","line":"...","lead":false,"why":"", (book_id is added by build_site.py)
              "reviews":[{"pub":"FT","url":"https://...","verdict":"rave"}]}]}
   ```
   Publication short names: FT, Times/Sunday Times, Guardian, Observer (Tortoise, observer.co.uk, separate since 2025), Spectator, Economist, LRB,
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

## Agents and rights (added 2026-11-02)
After step 7 (the edition is published):
8. **Agent research (be thorough: the aim is a verified contact for every book, Tara 4 Nov).** For every
   book in the new edition, find the author's literary agent/agency and the best email for a screen-rights
   enquiry, with the source URL. Work down this ladder until you have one:
   a. `reviews/agents/agencies.json` (the registry, below) and earlier `reviews/agents/*.json` entries for
      the same author. Reuse them; re-check the source URL only if older than 3 months.
   b. Tara's Gmail: search the agent's name and the agency domain. An address an agent has written from,
      or that Tara has corresponded with, counts as verified (source: the Gmail thread id).
   c. The author's own website (contact / about / representation pages).
   d. The agency's site: `site:<domain> <author surname>`, client lists, the agent's own page.
   e. Deal announcements: The Bookseller, Publishers Weekly, Publishers Lunch, publisher press releases
      ("acquired ... rights from X at Y").
   f. Publisher author pages or Wikipedia naming the agent.
   g. No agent findable: the UK publisher's rights/contracts contact, with agency_type `publisher_fallback`.
      Check `reviews/agents/rights_sources.json` first (publishers' and agencies' public rights guides and
      media-rights desks, each verified on the live page 8 Nov 2026): prefer a publisher's media/film rights
      desk over its translation rights team. Re-check an address there if it is older than 3 months.
   Prefer a named film/TV/screen/dramatic-rights agent or department, then the author's named agent, then
   the agency's general rights or enquiries address. An address must be printed on the live page you cite
   (or come from Gmail as in b). Never guess an address from a pattern.
   **Agency registry.** Keep `reviews/agents/agencies.json` up to date every week: one entry per agency
   under ONE canonical name (`agency`, `aliases`, `domain`, `film_tv_contact {name,email,source_url}`,
   `general_email {email,source_url}`, `rights_guide {url,kind,date}`, `book_ids`, `guide_ask_sent`).
   Use the canonical name in every agents file. For each agency new to the registry, look once on its
   site for a published FILM/TV rights guide or screen-rights list (translation-only guides don't count;
   record `kind` either way). Commit the registry with the edition. Write `reviews/agents/<edition_id>.json` (fields:
   book_id, book, author, agency, agent_name, agent_email, email_source_url, agent_source_url,
   screen_contact, screen_email, screen_source_url, contact_page, agency_type, confidence, notes) and
   push it with the edition. Then `op: set_rights` the agency/agent fields into the Rights tab
   (status stays `unknown`).
9. **Agent emails (Wednesday, not Sunday).** The weekly run only prepares; the rights run on Wednesday
   morning sends, so three days of real click data exist. One email per agency covering all its titles
   in the edition; skip agencies emailed in the last 14 days unless they have a new title (then mention
   it briefly in a new thread). Corporates included (Tara's decision 2026-11-02): address their screen
   or film/TV desk when one is listed. Queue with `op: queue_email` (kind `agent_ask`), 30-minute hold.
   Content and rules: see RIGHTS_RUN.md "Hard rules" and the template in
   `_tools/brr/agent_email_template.md`.

## Fiction genre cross-post (added 5 Nov 2026)
After the edition is built: GET `<GENRES endpoint>?action=genre_active&key=<genre_feed_key>` (key file
`Platform/review-of-reviews/genre-feed-key.txt`). If `fiction` is among the active genres, POST this week's
fiction screen picks (lead = true, subject in the four fiction subjects) to
`<endpoint>?genre=fiction&key=<key>` as `{"entries":[...]}` in the same entry shape the distribution run uses
(title "<Book> by <Author>", summary = the line, relevance_note = the why, source_name = the paper, source_url =
the review link, label from the subject: Crime & thriller fiction -> "Crime & Thriller", Literary -> "Literary",
Historical -> "Historical", Other -> "Book Club", tier primary, score 6). Dedup is on source_url. If `fiction`
is not active, skip and log `Fiction genre: not active`.
