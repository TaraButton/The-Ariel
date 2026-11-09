#!/usr/bin/env python3
"""Build theariel.tv/find-funding-and-buyers/ - describe a documentary once, get eligible funds AND likely
commissioners, each with the evidence behind it. Runs entirely in the browser on our own verified data.

  python3 _tools/find/build.py     (run after commissioners/build.py and funders/build.py)
"""
import json, re, sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
import importlib.util
sys.path.insert(0, str(ROOT / "_tools" / "commissioners"))
_s = importlib.util.spec_from_file_location("cbuild", ROOT / "_tools" / "commissioners" / "build.py")
CB = importlib.util.module_from_spec(_s); _s.loader.exec_module(CB)
_s = importlib.util.spec_from_file_location("fbuild", ROOT / "_tools" / "funders" / "build.py")
FB = importlib.util.module_from_spec(_s); _s.loader.exec_module(FB)

OUT = ROOT / "find-funding-and-buyers"
e = FB.e

def main():
    today = date.today()
    groups = CB.load()
    comm = [{"b": g["broadcaster"], "r": g["region"], "n": c.get("name", ""), "title": c.get("title", ""), "remit": c.get("remit", ""),
             "pr": c.get("pitch_route", ""), "pu": c.get("pitch_url", ""), "check": c.get("confidence") == "check",
             "rc": [{"title": r.get("title", ""), "desc": r.get("desc", ""), "date": r.get("date", ""), "url": r.get("url", "")} for r in (c.get("recent_commissions") or [])[:3]]}
            for g in groups for c in g.get("commissioners", [])]
    fs = FB.load()
    funds = []
    for x in fs:
        d = FB.pdate(x.get("next_deadline"))
        nd = x.get("next_deadline") if d and d >= today else ""
        nb = next((n for n in x.get("notable") or [] if n.get("url")), None)
        funds.append({"id": x["id"], "n": x["name"], "r": x.get("region"), "o": {c: FB.open_val(x, c) for c, _ in FB.COUNTRIES},
                      "s": x.get("stages") or [], "f": x.get("formats") or [], "sub": x.get("subjects") or [], "m": x.get("money") or "",
                      "a": x.get("max_award") or x.get("amount") or "", "d": nd, "st": x.get("status") or "", "w": x.get("next_window") or "",
                      "nb": {"t": nb.get("title"), "u": nb["url"]} if nb else None})
    J = lambda o: json.dumps(o, ensure_ascii=False).replace("</", "<" + chr(92) + "/")
    qm_js = (ROOT / "_tools" / "commissioners" / "quickmatch.js").read_text()
    endpoint = json.loads((ROOT / "_tools/brr/config.json").read_text())["endpoint"]
    style = re.search(r"<style>.*?</style>", (ROOT / "documentary-funding" / "index.html").read_text(), re.S).group(0)
    title = "Find Funding and Buyers for Your Documentary | The Ariel"
    desc = (f"Describe your documentary once and see which funds you can apply to and which commissioners are most likely to want it, "
            f"with the evidence for each: {len(funds)} funds and {len(comm)} UK and US commissioners, checked against their own sites. Free.")
    ld = {"@context": "https://schema.org", "@type": "WebApplication", "name": "Find funding and buyers for your documentary",
          "url": "https://theariel.tv/find-funding-and-buyers/", "applicationCategory": "BusinessApplication", "offers": {"@type": "Offer", "price": "0", "priceCurrency": "GBP"},
          "description": desc}
    page = f'''<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}"><link rel="canonical" href="https://theariel.tv/find-funding-and-buyers/">
<meta property="og:type" content="website"><meta property="og:site_name" content="The Ariel"><meta property="og:title" content="Find funding and buyers for your documentary">
<meta property="og:description" content="{e(desc)}"><meta property="og:url" content="https://theariel.tv/find-funding-and-buyers/"><meta property="og:image" content="https://theariel.tv/link-card.png">
<meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/ariel-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Lato:wght@400;700;900&display=swap" rel="stylesheet">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
{style}
<style>
.ff{{background:var(--paper);border:2px solid var(--gold);border-radius:8px;padding:20px;margin-top:22px}}
.ff label{{font-size:13px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--gold-deep);display:block}}
.ff textarea,.ff select,.ff input{{width:100%;min-height:44px;padding:10px 12px;border:1px solid var(--line);border-radius:6px;font:inherit;font-size:16px;background:#fff;margin-top:4px}}
.ff textarea{{min-height:84px;border:2px solid var(--gold)}}
.fgrid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;margin-top:12px}}
.ff button,.gate button{{min-height:48px;margin-top:14px;padding:0 24px;border:0;border-radius:4px;background:var(--ink);color:#fff;font:inherit;font-weight:900;cursor:pointer}}
.cols{{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:22px}}
.col h2{{font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;margin:0 0 4px}}
.res{{list-style:none;padding:0;margin:0}} .res>li{{background:var(--paper);border:1px solid var(--line);border-top:3px solid var(--gold);border-radius:6px;padding:12px 14px;margin:0 0 10px}}
.res h3{{font-family:'Cormorant Garamond',Georgia,serif;font-size:23px;margin:2px 0 0;line-height:1.15}} .res h3 a{{color:var(--ink)}}
.res ul{{margin:6px 0 0;padding-left:18px;font-size:15px}} .res ul li{{margin:3px 0}} #fres ul li{{border:0;padding:0}} .tag{{font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-deep)}}
.el{{display:inline-block;font-size:12px;font-weight:900;padding:2px 8px;border-radius:999px;margin-right:6px}}
.el.y{{background:#E3EFE5;color:var(--ok)}} .el.c{{background:var(--tint);color:var(--gold-deep)}} .el.k{{background:#EEE;color:var(--muted)}}
.gate{{background:var(--tint);border-radius:6px;padding:16px 18px;margin-top:18px}} .gate form{{display:flex;gap:10px;flex-wrap:wrap;align-items:center}}
.gate input[type=email]{{flex:1;min-width:220px;min-height:48px;padding:10px 14px;border:1px solid var(--line);border-radius:4px;font:inherit;font-size:16px}}
.gate .chk{{display:flex;gap:8px;align-items:center;width:100%;font-size:14px}} .hp{{position:absolute;left:-9999px}}
.empty{{color:var(--muted)}} .qm-b{{font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-deep)}} .qm-role{{margin:2px 0 4px;font-weight:700;font-size:15px}} .qm-pitch{{margin:6px 0 0;font-size:14px}} .res h4{{font-family:'Cormorant Garamond',Georgia,serif;font-size:23px;margin:2px 0 0}}
@media (max-width:820px){{.cols{{grid-template-columns:1fr}}}}
</style>
</head><body>
<header class="bar"><div class="wrap"><a href="/">The Ariel</a><span><a class="cta" href="/documentary-funding/">Funding</a> &nbsp; <a class="cta" href="/commissioners/">Commissioners</a> &nbsp; <a class="cta" href="/commissioners/whos-buying-what/">Who&#8217;s Buying What</a></span></div></header>
<section class="hero"><div class="wrap">
  <span class="badge">Free</span>
  <h1>Find funding and buyers for your documentary</h1>
  <p class="dek">Describe your film once. We&#8217;ll show the funds whose published rules fit it and the commissioners most likely to want it, with the evidence behind each suggestion: {len(funds)} funds and {len(comm)} UK and US commissioners, all checked against their own websites.</p>
</div></section>
<main class="wrap">
<form class="ff" id="ff" onsubmit="return false">
  <label for="idea">Your documentary in a sentence</label>
  <textarea id="idea" maxlength="400" placeholder="e.g. a feature documentary about a British musician, with access to the artist and their archive"></textarea>
  <div class="fgrid">
    <div><label for="c">You are based in</label><select id="c"><option value="uk">The UK</option><option value="us">The US</option><option value="canada">Canada</option><option value="eu">An EU country</option><option value="other">Somewhere else</option></select></div>
    <div><label for="s">Stage</label><select id="s"><option value="">Any stage</option><option value="development">Development</option><option value="production">Production</option><option value="post">Post-production</option><option value="impact">Impact / outreach</option></select></div>
    <div><label for="f">Format</label><select id="f"><option value="">Any format</option><option value="feature">Feature</option><option value="series">Series</option><option value="short">Short</option></select></div>
    <div><label for="b">Buyers in</label><select id="b"><option value="all">UK and US</option><option value="UK">UK</option><option value="US">US</option></select></div>
  </div>
  <button type="button" id="go">Find funding and buyers</button>
</form>
<div class="cols" id="out" hidden>
  <section class="col"><h2>Funds you could apply to</h2><p class="meta" id="fnote"></p><ol class="res" id="fres"></ol></section>
  <section class="col"><h2>Commissioners most likely to want it</h2><p class="meta" id="cnote"></p><ol class="res" id="cres"></ol></section>
</div>
<div class="gate" id="gate" hidden>
  <p><strong>See every match and keep up to date.</strong> Enter your email to see the full lists. We&#8217;ll also email you the complete commissioners list, and Who&#8217;s Buying What every Friday if you tick the box: new commissions and funding rounds as they are announced.</p>
  <form id="gf"><input type="email" name="email" placeholder="you@company.com" autocomplete="email" aria-label="Email"><input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button type="submit">Show all matches</button>
  <label class="chk"><input type="checkbox" name="watch" checked> Send me Who&#8217;s Buying What each Friday</label></form>
  <p id="gmsg" role="status" style="color:var(--warn);margin:8px 0 0"></p>
</div>
<div class="note"><p>How this works: funds are matched on their published eligibility rules (where you are based, stage, format and any subject focus); commissioners on their remits and what they have actually commissioned recently. It is a starting point, not advice: always read a funder&#8217;s guidelines and a broadcaster&#8217;s pitch rules before you approach them. Browse everything yourself in the <a href="/documentary-funding/">funding directory</a> and the <a href="/commissioners/">commissioners list</a>.</p></div>
</main>
<footer>The Ariel &middot; Personalised story intelligence for screen &middot; <a href="/">theariel.tv</a> &middot; <a href="/documentary-funding/">Documentary funding</a> &middot; <a href="/commissioners/">UK &amp; US commissioners</a> &middot; <a href="/talent-agencies/">Talent agencies</a></footer>
<script>window.COMM_EP={json.dumps(endpoint)};window.COMM_DATA={J(comm)};window.FUNDS={J(funds)};</script>
<script>{qm_js}</script>
<script>
(function(){{var F=window.FUNDS,QM=window.QM,today="{today.isoformat()}",LIM=6,last=null,unlocked=false;
function esc(s){{return String(s==null?'':s).replace(/[&<>"]/g,function(c){{return{{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}}[c];}});}}
function fmt(d){{var p=d.split('-');return new Date(+p[0],+p[1]-1,+p[2]).toLocaleDateString('en-GB',{{day:'numeric',month:'short',year:'numeric'}});}}
var PL={{uk:'the UK',us:'the US',canada:'Canada',eu:'the EU',other:'your country'}};
function funds(idea,c,s,f){{var it=(idea||'').toLowerCase(),tp=QM.topics(idea);
return F.map(function(x){{var o=x.o[c];if(o==='no')return null;
if(s&&x.s.length&&x.s.indexOf(s)<0)return null;
if(f&&x.f.length&&x.f.indexOf(f)<0&&!(f==='short'&&x.s.indexOf('shorts')>-1))return null;
var why=[],sc=0,subHit=false;
if(x.sub.length){{subHit=x.sub.some(function(z){{z=z.toLowerCase();return it.indexOf(z)>-1||(tp[z]&&true)||(z==='science'&&tp.science);}});if(!subHit)return null;why.push('Focuses on '+x.sub.join(', ')+', like your film');sc+=5;}}
if(o==='yes'){{why.push('Its rules let producers based in '+PL[c]+' apply');sc+=4;}}else if(o==='conditions'){{why.push('Producers based in '+PL[c]+' can apply, with conditions');sc+=2;}}else why.push('Its rules do not say who can apply from '+PL[c]+': check');
if(s&&x.s.indexOf(s)>-1){{why.push('Funds '+(s==='post'?'post-production':s));sc+=1;}}
if(x.d&&x.d>=today){{sc+=3;}}else if(x.st==='rolling'||x.st==='open')sc+=2;else if(x.st==='closed'||x.st==='invitation only')sc-=2;
if(x.nb)why.push('Backed <a href="'+esc(x.nb.u)+'" target="_blank" rel="noopener">'+esc(x.nb.t)+'</a>');
return {{x:x,o:o,sc:sc,why:why}};}}).filter(Boolean).sort(function(a,b){{return b.sc-a.sc||(a.x.d||'9').localeCompare(b.x.d||'9');}});}}
function fli(m){{var x=m.x,o=m.o;var b=o==='yes'?'<span class="el y">You can apply</span>':o==='conditions'?'<span class="el c">Conditions apply</span>':'<span class="el k">Check eligibility</span>';
var when=(x.d&&x.d>=today)?'Deadline '+fmt(x.d):x.st==='rolling'?'Rolling':x.st==='open'?'Open now':x.st==='invitation only'?'Invitation only':x.st==='closed'?('Closed'+(x.w?': '+x.w:'')):(x.w||'Next round not announced');
return '<li>'+b+'<span class="tag">'+esc(x.r)+'</span><h3><a href="/documentary-funding/'+x.id+'/">'+esc(x.n)+'</a></h3><p class="meta" style="margin:2px 0 0">'+esc(when)+(x.a?' &middot; '+esc(x.a):'')+'</p><ul>'+m.why.map(function(w){{return '<li>'+(w.indexOf('<a ')>-1?w:esc(w))+'</li>';}}).join('')+'</ul></li>';}}
function render(){{var fr=last.f,cr=last.c.res,n=unlocked?20:LIM;
document.getElementById('fres').innerHTML=fr.length?fr.slice(0,n).map(fli).join(''):'<li class="empty">No funds match all of that. Try "Any stage" or "Any format".</li>';
document.getElementById('cres').innerHTML=cr.length?cr.slice(0,n).map(function(m){{return '<li>'+QM.cardHTML(m).replace(/^<div class="qm-card">|<\\/div>$/g,'')+'</li>';}}).join(''):'<li class="empty">No clear commissioner match yet. Name the genre or subject, for example music, history, true crime or science.</li>';
document.getElementById('fnote').textContent=fr.length+' funds may fit'+(fr.length>n?' (showing '+n+')':'')+'. Open calls and the clearest eligibility first.';
document.getElementById('cnote').textContent=cr.length+' commissioners may fit'+(cr.length>n?' (showing '+n+')':'')+(last.c.topics.length?'. Read your idea as: '+last.c.topics.map(function(k){{return QM.LABEL[k];}}).join(', ')+'.':'.');
document.getElementById('gate').hidden=unlocked||(fr.length<=LIM&&cr.length<=LIM);}}
document.getElementById('go').addEventListener('click',function(){{var idea=document.getElementById('idea').value.trim();
if(idea.length<4){{document.getElementById('idea').focus();return;}}
window.QM_REGION=document.getElementById('b').value;
last={{f:funds(idea,document.getElementById('c').value,document.getElementById('s').value,document.getElementById('f').value),c:QM.score(idea)}};
document.getElementById('out').hidden=false;render();document.getElementById('out').scrollIntoView({{behavior:'smooth'}});}});
var g=document.getElementById('gf');g.addEventListener('submit',function(ev){{ev.preventDefault();var em=g.email.value.trim(),msg=document.getElementById('gmsg');
if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{{2,}}$/.test(em)){{msg.textContent='Please check your email address.';return;}}
var btn=g.querySelector('button');btn.disabled=true;msg.textContent='';
fetch(window.COMM_EP,{{method:'POST',headers:{{'Content-Type':'text/plain;charset=utf-8'}},body:JSON.stringify({{action:'commissioner_list',email:em,watch:g.watch.checked,idea:document.getElementById('idea').value.trim(),website:g.website.value,source:'funding-and-buyers'}})}})
.then(function(r){{return r.json();}}).then(function(d){{if(!d||!d.ok)throw new Error('x');unlocked=true;render();}}).catch(function(){{msg.textContent='That did not go through. Please try again.';}}).then(function(){{btn.disabled=false;}});}});
}})();
</script>
</body></html>'''
    OUT.mkdir(exist_ok=True)
    (OUT / "index.html").write_text(page, encoding="utf-8")
    print(f"built find-funding-and-buyers ({len(funds)} funds, {len(comm)} commissioners)")

if __name__ == "__main__":
    main()
