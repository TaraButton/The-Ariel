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
- Never write blurbs (Tara, 10 Nov: agents hate AI text). A blurb is the publisher's description, word for word
  (emojis stripped, words untouched; the guide trims anything over ~1,100 characters). The private note on each
  title records the source URL, and the agency page says "publisher's description, word for word".
- Cover + blurb ladder, best first: (1) the agency's own website images (matched by image name, or by reading the
  jacket text, then checked by eye); (2) publisher pages (Hachette-group sites carry the full description in the
  hachetteJsonLinkingData JSON-LD); (3) Google Books API (key in The Ariel HQ/.../Agency_Pages/private-keys.md,
  needs country=GB; exact title + author match; drop title-page scans and mismatched descriptions after an eye check);
  (4) Open Library. Covers are flagged "found automatically" unless from the agency's own site.
- Years: only from the agency's own site. Open Library years were unreliable and are not used.
- Sheil Land run (10 Nov 2026): 261 titles, 216 covers, 200 blurbs. Scripts: Agency_Pages/sheil-land-source/.
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

## Data ownership and the agency's switches (Tara, 10 Nov 2026)
- What came from public sources (their website, published guides: titles, authors, publication details, statuses)
  is ours to keep and use for matching. Agencies cannot delete it.
- What only they told us (titles added by them, on-submission projects, option dates and holders, notes, their own
  pitches, uploaded covers/logo, contacts, fairs) is theirs: "Remove what I've added" (POST agency_clear) clears it
  and sets the page private. Personal contact details go with it.
- "Don't use this page" (visibility off) closes catalogue, guide and enquiry links; the record stays.
- No delete button. Terms line on their page: "Free for agencies. Your page is private unless you choose otherwise.
  Anything you add that isn't public, like unpublished titles, option dates and notes, is never shared and you can
  remove it any time."
- Publisher blurbs and covers are used only in the agency's own guide/catalogue, not elsewhere in The Ariel.

## Pre-send safeguards (10 Nov 2026)
- Outside their private page nothing reads "Available" until confirmed: unconfirmed titles show "To confirm" and the
  guide carries a DRAFT stamp on the cover and every page.
- Who holds an option is hidden unless they tick "Show who holds the option".
- Guide default: full pages for new (last 3 years), forthcoming/on-submission and featured titles; the rest as a
  compact linked list ("Every title" option available).
- Their logo on cover and catalogue; The Ariel only as "Made with The Ariel" on the back page and catalogue footer;
  no Ariel plug to producers after an enquiry.
- Enquiries tab shows only real introductions made to them (no producer match counts).
- Spreadsheet (CSV) export of everything on their page.
