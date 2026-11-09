# Who's Buying What - weekly run (spec v1, 2026-11-08)

Runs every **Thursday evening (UK)** in the cloud. Produces Friday's edition of Who's Buying What,
publishes it at theariel.tv/commissioners/whos-buying-what/, keeps the commissioners list current,
and the newsletter backend (BRR Apps Script, Commissioners.js `wbwTick`) pulls
`commissioners/whos-buying-what/latest.json` within the hour and emails it at **07:00 Friday London**
to everyone in tab CommissionerLeads with watch = TRUE.

Idea: Peter Morgan, 8 Nov 2026. Funding section: Tara (Howard found a funder to pitch this way).

## Sourcing rules (legal - never bend)
- **Main items** (commissions, funding, moves, briefs) come ONLY from the organisations' OWN
  announcements: broadcaster/streamer press pages, funders' own grantee/news pages, official
  commissioning pages. Write every item in our own words (1-2 short factual sentences). Never copy
  sentences. Every item links to the official page you opened.
- **Penske Media** (deadline.com, variety.com, hollywoodreporter.com, indiewire.com and other PMC
  sites): do NOT open or read their articles (their terms bar AI/automated tools from article pages).
  Use them ONLY through `wbw_trades.py`, which reads their RSS headline feeds. In "trades", the headline
  stays exactly as published, credited, linked straight to the article. Never summarise or reword it.
- **Pairing (encouraged):** when a trades headline is about a factual/doc commission, look for the
  broadcaster's or producer's OWN announcement of the same project. If you find it, make it a main
  item from the official page (title, channel, commissioner, producer, in your own words) and add
  `"also": {"source": "Deadline", "url": "<the article url from the feed>"}` so readers can click
  through to the trade story. Drop it from `trades` to avoid listing it twice. Never fill the
  commissioner or any other detail from the trade article; if the official page doesn't name the
  commissioner, leave it out.
- **Realscreen, Broadcast, any paywall or bot block**: leave alone. Never work around a block.
- Advanced Television, C21, Televisual, TBI: do not copy or summarise their articles. If they break a
  story you can confirm on an official page, cite the official page.
- No hallucination. Omit anything you cannot verify on an official page.
- No em dashes. No AI / tech language. Factual, documentary and unscripted only (skip scripted drama,
  comedy, scripted true-crime films, sport rights, news bulletins).

## Steps
1. **Repo.** Attach and clone `TaraButton/the-ariel` (push access). `cd` into it. `git pull`.
   Edition id = today's date (Thursday, YYYY-MM-DD). If `_tools/commissioners/editions/<id>.json`
   exists, stop: already done. Window = last Friday 00:00 to now (London).
2. **Trades.** `SSL_CERT_FILE=/root/.ccr/ca-bundle.crt python3 -I _tools/commissioners/wbw_trades.py --since <window start> --out /tmp/wbw-trades.json`.
   Keep only headlines about documentary/factual/unscripted commissions, acquisitions, sales, deals,
   exec moves or funding (drop scripted films/series even if "true crime", interviews, awards-season
   features). Max 15. Copy each kept object unchanged into `trades`.
3. **Official announcements.** For the window, check each source's own press listing and open the
   releases that are factual/doc commissions, renewals, acquisitions, exec moves or briefs:
   - UK: BBC Media Centre (listing is JS-rendered; use the public search API
     `corporate.api.bbci.co.uk`), channel4.com/press, itv.com/presscentre, paramount-mediahub.co.uk
     (Channel 5), skygroup.sky newsroom (RSS https://www.skygroup.sky/rss), corporate.uktv.co.uk,
     press.wbd.com/gb.
   - US: about.netflix.com/en/newsroom, press.amazonmgmstudios.com, apple.com/tv-pr, press.wbd.com
     (HBO, Discovery), cnnpressroom.blogs.cnn.com, paramount press, nbcuniversal / nbcnews press,
     press.hulu.com (RSS), dgepress.com (Disney, RSS), espnpressroom.com (RSS), nationalgeographic
     press, pbs.org/about/about-pbs/news, aenetworks press, foxnation press.
   - Commissioning pages: re-check the 4Producers, ITV commissioning, BBC commissioning and UKTV briefs
     pages for briefs that are new or changed since last week.
4. **Funding ("Who funded what").** Check funders' own news/grantee pages for grants, fund rounds and
   open calls announced in the window: Sundance Institute Documentary Fund, Catapult Film Fund,
   Chicken & Egg Pictures, IDA (Enterprise / Pare Lorentz / Logan), Doc Society (incl. BFI Doc Society
   Fund), ITVS, Field of Vision, Hot Docs (Crossroads, Blue Ice, Forum), Sheffield DocFest MeetMarket,
   IDFA Bertha Fund, CPH:DOX, Firelight Media, Black Public Media, Perspective Fund, Hartley Film
   Foundation, Gotham Documentary Development, Impact Partners and other equity financiers (their own
   site or official release only). Fields: region, funder, title (the film), what (who made it, what
   it is about, own words), amount (only if stated), url.
   The full funder list, with apply pages, is `_tools/funders/data/*.json`: check each one's apply_url
   too. **Keep the Documentary Funding Directory current:** when a funder's own page announces a new
   round, deadline or amount, update that entry (status, next_deadline YYYY-MM-DD, next_window,
   last_deadline, amount, sources, checked = today; confidence "high" only if the page states it
   clearly). Add a new funder only from its own site. Never use a Penske or paywalled source.
5. **Write** `_tools/commissioners/editions/<id>.json`:
   `{"edition_id","date_label":"13 November 2026","window":"Announcements 7 - 13 November 2026",
   "intro":"1-2 sentences, own words, what stood out","commissions":[{region,broadcaster,title,what,commissioner,producer,date,url}],
   "funding":[{region,funder,title,what,amount,url}],"moves":[{region,name,change,date,url}],
   "briefs":[{region,broadcaster,title,what,deadline,url}],"trades":[{headline,url,source,date}]}`
   Omit `send_after` (the backend sends at 07:00 Friday). If every section is empty, still publish
   with a one-line intro saying it was a quiet week, and say so in the summary.
6. **Update the list.** For each commission with a named commissioner already in
   `_tools/commissioners/data/*.json`, add it to their `recent_commissions` (newest first, keep 3, date
   YYYY-MM, official url). For each move: update title/broadcaster, or mark `confidence: "check"` with a
   note if the new role is unclear; add new commissioners only with an official source. Never add an
   email unless the broadcaster prints it on its own page (with `email_source_url`). Bump `checked`.
7. **Build.** `python3 _tools/commissioners/build.py && python3 _tools/commissioners/build_pages.py && python3 _tools/commissioners/wbw_build.py && python3 _tools/funders/build.py && python3 _tools/find/build.py && python3 _tools/sitemap_add.py`.
   All must succeed (wbw_build refuses Penske URLs in main items and non-https links).
8. **Publish.** `git add _tools commissioners documentary-funding find-funding-and-buyers sitemap.xml && git commit -m "Who's Buying What: <id>" &&
   git fetch origin main && git rebase origin/main && git push origin HEAD:main`. Confirm
   https://theariel.tv/commissioners/whos-buying-what/<id>.html loads within a few minutes.
9. **Summary.** Counts per section and per broadcaster, sources that could not be reached, list
   changes made, anything unsure. Never send email yourself; the backend does it.
