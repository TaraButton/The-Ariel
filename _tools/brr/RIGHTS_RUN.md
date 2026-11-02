# British Review of Reviews - rights run (spec v1, 2026-11-02)

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
- **Only real numbers.** Any demand line in an agent email comes from `op: demand` for that book. Describe
  people only as what they told us: "producers" only for requests whose role is Producer / Development
  executive / Commissioner or whose tier is member/pass; otherwise "readers". Never round up, never imply
  a number we do not have. If the numbers are zero, leave the line out.
- Never invent an agent, email address or rights status. Email only addresses recorded with a source URL
  in the agents file (verified on the agency's own site), or the address an agent has written from.
- Never write as if The Ariel were a commissioner or buyer. No editorial verdicts on the book. No decks or
  pitch documents asked for. (See Tara's supplier email playbook.)
- No em dashes. No AI language.
- Mark a book `available` only when the agent (or rights holder) has said so in writing. `show_public` is
  `yes` only if they said we may show it.

## Steps
1. **Replies.** Search Gmail: `to:tara@theariel.tv newer_than:3d -from:me` plus any thread whose subject
   starts "Screen rights" or "<book> in this week's British Review of Reviews". For each agent reply,
   decide the status per book: available / optioned / not_available / handled_elsewhere (+ handled_by) /
   still unknown. Note whether they agreed to public display. Call `op: set_rights` with the rows.
   The backend automatically emails every open requester for that book with the answer.
   If an agent offers more titles or wants to join, tell Tara (do not onboard them yourself).
2. **Introductions.** If a requester has replied asking for an introduction to the agent of an `available`
   book, draft the introduction as a Gmail draft from tara@theariel.tv to both (Tara sends it). Log it in
   the Rights row notes.
3. **Open requests.** `op: open_requests`. For each open request whose book has status `unknown` and no
   `asked_at`, and an agent with a verified email in the agents file, queue one warm email per agency
   (`op: queue_email`, kind `agent_ask`, ref = comma-separated book_ids). Wording: a reader of the
   British Review of Reviews has asked whether the screen rights to <book> are available; use the real
   role/number per the rules above ("a producer has asked" only when true). One line back is plenty.
   For `pass_interest` requests: tell Tara (the Rights Pass link may not be live yet).
4. **Chasers.** Books with status `asked` and `asked_at` more than 10 working days ago and an open
   request: queue one short, friendly chaser. Never more than one chaser per agency per book.
5. **Summary** to Tara (SendUserMessage): answers recorded, requesters told, emails queued (and when they
   send), introductions drafted, anything that needs her.
