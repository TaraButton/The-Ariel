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

## Steps
1. **Replies.** Search Gmail: `to:tara@theariel.tv newer_than:3d -from:me` plus any thread whose subject
   starts "Screen rights" or "<book> in this week's London Review of Reviews". For each agent reply,
   decide the status per book: available / optioned / not_available / handled_elsewhere (+ handled_by) /
   still unknown. Note whether they agreed to public display. Call `op: set_rights` with the rows.
   The backend automatically emails every open requester for that book with the answer.
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
4. **Chasers.** Books with status `asked` and `asked_at` more than 10 working days ago and an open
   request: queue one short, friendly chaser. Never more than one chaser per agency per book.
5. **Rights Pass holders.** If the Stripe connector is available, list subscriptions/checkout sessions for the
   Rights Pass payment link (https://buy.stripe.com/3cI28j9neam4fwidKn3ks05, £29/month). Add each new paying
   customer's email with `op: add_member`, type `pass`. If a subscription has ended, re-add with `until`
   set to its end date. If Stripe is not reachable, look for Stripe payment emails in Tara's Gmail
   (from:stripe.com "Rights Pass" newer_than:3d) and do the same. Send each new holder a short welcome
   from tara@theariel.tv via `op: queue_email` (kind `pass_welcome`).
6. **Summary** to Tara (SendUserMessage): answers recorded, requesters told, emails queued (and when they
   send), introductions drafted, anything that needs her.
