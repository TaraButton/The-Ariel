# London Review of Reviews - rights run (spec v1, 2026-11-02)

Runs **every weekday morning (UK)** in the cloud. Keeps the Check Rights promise: finds out about the
screen rights readers asked about, records what agents told us, and lets the backend email the answer.

## Setup facts
- Backend web app: see `_tools/brr/config.json` -> `endpoint`. Admin calls are POSTs with
  `{"action":"admin","secret":<admin secret>,"op":...}`. The admin secret is in the
  "British Review of Reviews" Google Sheet, tab **Config**, key `admin_secret` (read it with the Google
  Drive connector; never print it in messages or commit it).
- Sheet tabs: Rights (one row per book), Requests (Check Rights requests), Clicks, Members, Outbox, Config.
- Agent emails send from tara@theariel.tv through the Outbox with a 30-minute hold (`op: queue_email`).
  Tara can stop one by setting its status to `hold` in the Outbox tab. Cap 40 a day.
- Agent research for each edition: `reviews/agents/<edition_id>.json` in the repo (written by the weekly run).

## Hard rules
- **Only real numbers.** Any demand line in an agent email comes from `op: demand` for that book. Always lead with
  producers (Tara, 2 Nov). Say "our producers have asked" only for requests whose role is Producer /
  Development executive / Commissioner or whose tier is member/pass; otherwise use the "for the producers
  we work with" opening. Never "readers". Never round up, never imply a number we do not have.
- Never invent an agent, email address or rights status. Email only addresses recorded with a source URL
  in the agents file (verified on the agency's own site), or the address an agent has written from.
- Never write as if The Ariel were a commissioner or buyer. No editorial verdicts on the book. No decks or
  pitch documents asked for. (See Tara's supplier email playbook.)
- No em dashes. No AI language.
- Mark a book `available` only when the agent (or rights holder) has said so in writing. `show_public` is
  `yes` only if they said we may show it.

## The promise (Tara, 2 Nov)
The Check Rights modal tells readers they'll get the rights status and the agent's contact details "anywhere
from instant to a day or so". The backend sends contact details instantly when a verified agent email is
already in the Rights tab, and sends the rights status instantly when it is already known. Everything else
depends on this run, so step 0 comes first and must clear every request that has no contact yet.

## Rights guides (Tara, 3 Nov)
Asking book by book is slow for us and a chore for agents. The weekly agent email and the thank-you note
(agent_email_template.md) ask each agency to add rights@theariel.tv to its film/TV rights guide mailing
list. The register of guides we hold is `reviews/agents/lists.json` in the repo, one entry per agency:
`{agency, domain, contact_email, received (YYYY-MM-DD), source (gmail thread id or URL), file (Drive link or
repo path), titles: [{book, author, status, note}], last_refresh_asked}`. Commit it after every change.

## Steps
0. **Same-day contacts.** `op: open_requests`. For each request with status `open` (not `contact_sent`), look
   the book up in `reviews/agents/*.json`. If there is no verified agent/screen email, research one now
   (same rules as WEEKLY_RUN step 8: verified on the agency's or author's own live site today, with the source
   URL; if the author has no agent, the publisher's rights contact). Then `op: set_rights` with agency,
   agent_name, agent_email/screen_email and source_url. The backend emails every open requester for that book
   the contact details automatically (`requesters_sent_contact` in the reply). If you truly cannot find a
   contact, tell Tara in the summary so she can reply to the requester by hand.
0b. **New rights guides.** Search Gmail (to:rights@theariel.tv OR to:tara@theariel.tv, newer_than:3d,
   has:attachment OR "rights guide" OR "rights list" OR "film and TV rights"). For each guide from an agency:
   extract every title with author and its screen-rights wording, add or replace that agency's entry in
   lists.json, and `op: set_rights` every title that matches a Rights row: `available` only where the guide
   says film/TV rights are available (the guide is the agent's written word), `optioned` where it says
   optioned or sold, otherwise leave the status alone. `show_public` stays `no` unless they said we may show
   it. Answers to open requests then go out automatically. Tell Tara which agency sent a guide and how many
   titles, and remind her to approve the agency's domain for rights@ intake if it isn't approved yet, so
   their titles also reach Ariel producers.
1. **Replies.** Search Gmail: `to:tara@theariel.tv newer_than:3d -from:me` plus any thread whose subject
   starts "Screen rights" or "<book> in this week's London Review of Reviews". For each agent reply,
   decide the status per book: available / optioned / not_available / handled_elsewhere (+ handled_by) /
   still unknown. Note whether they agreed to public display. Call `op: set_rights` with the rows.
   The backend automatically emails every open requester for that book with the answer.
   If this is the agency's first answer and lists.json has no guide for them, queue the `agent_thanks`
   note (agent_email_template.md) as a reply in their thread, once per agency ever.
   If an agent offers more titles or wants to join, tell Tara (do not onboard them yourself).
2. **Introductions.** If a requester has replied asking for an introduction to the agent of an `available`
   book, draft the introduction as a Gmail draft from tara@theariel.tv to both (Tara sends it). Log it in
   the Rights row notes.
3. **Open requests.** `op: open_requests`. For each open request whose book has status `unknown` and no
   `asked_at`, and an agent with a verified email in the agents file, queue one warm email per agency
   (`op: queue_email`, kind `agent_ask`, ref = comma-separated book_ids). Wording: open with "Our producers have asked us to find out the film rights status for <book>." ONLY when
   a requester is a producer/development exec/commissioner or member/pass holder (use the real count:
   "Two of our producers..."); otherwise lead with "We're finding out the film rights status of the books in this week's London Review of
   Reviews for the producers we work with, and <book> is one of them." Never use "readers".
   See agent_email_template.md. One line back is plenty.
   For `pass_interest` requests: tell Tara (the Rights Pass link may not be live yet).
3b. **Use the guides first.** Before asking an agent about a book, check lists.json. If the book is in
   that agency's guide, set_rights from the guide and do not email them. If the agency has a guide but the
   book is not in it, the email asks only "Is <Book> on your current rights guide?".
3c. **Late contacts.** Any book in the current edition whose Rights row now has a verified contact but no
   `asked_at` (found after Wednesday's emails): queue its agent_ask now, one email per agency.
3d. **Agency guide asks (the main supply lever, Tara 4 Nov).** For every agency in
   `reviews/agents/agencies.json` with a verified contact, no guide in lists.json, `guide_ask_sent` empty or
   more than 90 days ago, and no agent_ask to that agency in the last 30 days (those already carried the
   ask): queue one `guide_ask` email (agent_email_template.md), most books-to-date first, at most 10 a day,
   and set `guide_ask_sent`. Commit agencies.json.
3e. **Published guides.** Load any film/TV guide in agencies.json that is not yet in lists.json at the next run; and on the first weekday of each month, re-read every `rights_guide.url` of kind
   film/TV in agencies.json and load it into lists.json exactly as step 0b (status `available` only where
   the guide says film/TV rights are available).
4. **Chasers.** Books with status `asked` and `asked_at` more than 10 working days ago and an open
   request: queue one short, friendly chaser. Never more than one chaser per agency per book.
5. **Rights Pass holders.** If the Stripe connector is available, list subscriptions/checkout sessions for the
   Rights Pass payment link (https://buy.stripe.com/3cI28j9neam4fwidKn3ks05, £29/month). Add each new paying
   customer's email with `op: add_member`, type `pass`. If a subscription has ended, re-add with `until`
   set to its end date. If Stripe is not reachable, look for Stripe payment emails in Tara's Gmail
   (from:stripe.com "Rights Pass" newer_than:3d) and do the same. Send each new holder a short welcome
   from tara@theariel.tv via `op: queue_email` (kind `pass_welcome`).
5b. **Guide refresh.** On the first weekday of each month: for every agency in lists.json whose guide is
   more than 3 months old and whose `last_refresh_asked` is empty or more than 3 months ago, queue the
   `list_refresh` note and set `last_refresh_asked`. Never more than once a quarter per agency.
6. **Summary** to Tara (SendUserMessage): answers recorded, requesters told, emails queued (and when they
   send), introductions drafted, anything that needs her.
