# Agency rights pages (spec v1, 10 Nov 2026)

One page per literary agency on theariel.tv, pre-filled by The Ariel, kept current by the agency.
Why: agents are a stock, not a flow (Aug 2026 measurement). A page they own, and a rights guide that
builds itself from it, turns their list into something they update, and gives us the backlist.

## What each agency gets
| URL | Who sees it | What it does |
|---|---|---|
| `/rights/<slug>/edit/?k=TOKEN` | the agency only | confirm rights (one click for all), change status, option lapse date + optioned to, add titles (single, paste from spreadsheet, forthcoming / on submission / proposal), covers (upload), pitch, praise, bio, publishers, material, length, agents, guide settings, book-fair stands, enquiry contact, sharing |
| `/rights/<slug>/` | private / password / public (agency chooses) | their online catalogue: search, sort, filter, Enquire on every title |
| `/rights/<slug>/guide/` | same as the catalogue (or `?k=` for the draft) | print-ready A4 rights guide: cover (theirs or designed from their jackets), contents, how-to-enquire with QR, fair stands, Under option & adapted, sections, author index, contact page. Every title has a clickable Enquire link and a QR code. Save as PDF from the browser keeps the links. |
| `/rights/<slug>/?t=ID` | anyone with the link | enquiry page for one title. Works even when the catalogue is private, because the agency printed that title in its own guide. |

Enquiries are introductions (Tara, 9 Nov): one email from tara@theariel.tv to the agency contact, cc the producer
(and the agency's optional cc), Reply-To the producer, bcc Tara. Logged in tab AgencyEnquiries with `via`
(pdf / qr / catalogue / web) so we know which channel works. Agencies never see producer match counts.

## Rules carried over
- Pre-filled titles come only from the agency's own website or guide. Status is set to available unless
  their site says otherwise (optioned / adapted / check). Each pre-filled title is marked unconfirmed until the
  agency confirms or edits it. Never invent pitches, dates or rights.
- Auto covers come from Open Library, matched on title + author surname, flagged "cover found automatically".
- Years: only from the agency's own site. Open Library years were unreliable and are not used.
- Private data (tokens, contact emails, unconfirmed lists) never goes in this public repo: it lives in the
  Review of Reviews sheet (tabs AgencyPages, AgencyTitles, AgencyImages, AgencyEnquiries, AgencyLog).
- Uploaded images are resized in the browser and stored base64 across cells in AgencyImages (no Drive scope needed).

## Adding an agency
1. Build the seed JSON (`{agency:{slug,name,...}, titles:[...]}`) from their site or guide. Keep it in
   `The Ariel HQ/Business Strategy/Agent_Outreach/Agency_Pages/` (not the repo).
2. `python3 _tools/agency_pages/build.py <slug> "<Agency name>"` writes the three page shells. Commit + push.
3. Seed: POST `{"action":"admin","secret":<admin_secret>,"op":"agency_seed","seed":<json>}` to the endpoint in
   `_tools/brr/config.json` (admin secret: Config tab of the British Review of Reviews sheet, never print it).
   The reply has `edit_url` (the agency's private link). `op:"agency_link"` returns it again later.
4. Make the draft PDF: open `edit_url` with `/guide/` in place of `/edit/`, Save as PDF (or headless Chromium
   `page.pdf({preferCSSPageSize:true, printBackground:true})`).
5. Email the agency: their private link + the draft PDF. Follow the supplier email playbook: no apology for
   having built it, no producer numbers.

## Admin ops
`agency_seed {seed, replace}` · `agency_link {slug}` · `agency_list` (visibility, last save, last view).
