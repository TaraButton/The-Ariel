(function(){
  var D = window.COMM_DATA || [];
  // topic lexicon: idea words -> topics; commissioner text is tagged with the same topics
  var T = {
    music:['music','musician','band','album','singer','song','songwriter','rock','pop','punk','jazz','hip hop','rap','festival','concert','tour','gig','orchestra','opera','classical','composer','artist','record','beatles','dj'],
    crime:['crime','criminal','murder','killer','serial','police','detective','trial','court','prison','jail','heist','fraud','scam','gang','cold case','missing','disappearance','investigation','justice','miscarriage','true crime','con artist','cult'],
    history:['history','historical','war','ww2','wwii','ww1','empire','medieval','victorian','tudor','royal','monarchy','1940s','1950s','1960s','60s','1970s','70s','1980s','80s','archive','century','ancient','battle','cold war'],
    science:['science','scientist','space','physics','medicine','medical','doctor','doctors','hospital','a&e','health','nhs','technology','engineering','climate','brain','genetics','disease','pandemic','surgery','surgeon'],
    nature:['nature','wildgenre','wildlife','animal','animals','ocean','sea','planet','environment','bird','birds','lion','shark','forest','wild'],
    sport:['sport','sports','football','cricket','rugby','tennis','boxing','olympic','olympics','athlete','f1','formula','racing','golf','cycling','fighter','team'],
    arts:['art','arts','artist','painter','painting','sculpture','theatre','dance','ballet','literature','writer','poet','author','film','cinema','design','fashion','architecture','culture','photography'],
    religion:['religion','religious','faith','church','islam','muslim','christian','jewish','god','belief','spiritual','ethics'],
    politics:['politics','political','government','election','minister','parliament','policy','prime minister','labour','tory','trump','power','corruption','whistleblower','investigative','exposé','expose','dispatches','panorama','current affairs','scandal'],
    business:['business','money','billionaire','billionaires','company','corporate','brand','startup','finance','bank','wealth','rich','economy','industry','tycoon','tech founder','silicon valley','founder'],
    obsdoc:['family','families','school','schools','hospital','a&e','emergency','ambulance','police custody','24 hours','community','obs doc','observational','behind the scenes','fly on the wall','teenagers','children','ageing','care home','nhs'],
    celebrity:['celebrity','famous','star','presenter','talent','comedian','influencer','reality','personality','icon','legend'],
    entertainment:['format','game','competition','challenge','reality','dating','makeover','quiz','fact ent','factual entertainment','social experiment','survival'],
    lifestyle:['food','cooking','cook','chef','property','home','homes','house','garden','travel','holiday','motoring','cars','car','diy','renovation','money saving','pets','dog','dogs'],
    youth:['young','youth','gen z','teen','teenage','student','tiktok','youtube','online','digital','short form','e4','bbc three','three']
  };
  var KEYS = Object.keys(T);
  var LABEL = {music:'music',crime:'crime',history:'history',science:'science & medicine',nature:'natural history',sport:'sport',arts:'arts',religion:'religion & ethics',politics:'current affairs',business:'business & money',obsdoc:'observational docs',celebrity:'talent-led',entertainment:'factual entertainment',lifestyle:'lifestyle',youth:'younger audiences'};
  function norm(s){return ' '+String(s||'').toLowerCase().replace(/[^a-z0-9+&' ]+/g,' ').replace(/\s+/g,' ')+' ';}
  function topics(text){var t=norm(text).replace(/ natural history /g,' wildgenre nature '),out={};KEYS.forEach(function(k){T[k].forEach(function(w){if(t.indexOf(' '+w+' ')>-1||(w.length>5&&t.indexOf(w)>-1))out[k]=(out[k]||0)+1;});});return out;}
  var STOP=' a an the and or of to in on for with about my our their is was be into from by at as that this who what how doc docs documentary series film new uk british '.split(' ');
  function words(s){return norm(s).trim().split(' ').filter(function(w){return w.length>2&&STOP.indexOf(w)<0;});}
  D.forEach(function(c){
    c._remitT = topics(c.title+' '+c.remit);
    c._comm = (c.rc||[]).map(function(r){return {r:r,t:topics(r.title+' '+r.desc),txt:norm(r.title+' '+r.desc)};});
    c._all = norm(c.title+' '+c.remit+' '+(c.rc||[]).map(function(r){return r.title+' '+r.desc;}).join(' '));
  });
  function score(idea){
    var it=topics(idea), iw=words(idea), res=[];
    D.forEach(function(c){
      var s=0, why=[], best=null, bestS=0;
      Object.keys(it).forEach(function(k){ if(c._remitT[k]){ s+=4; why.push('remit covers '+LABEL[k]); } });
      c._comm.forEach(function(m){
        var ms=0; Object.keys(it).forEach(function(k){ if(m.t[k]) ms+=3; });
        iw.forEach(function(w){ if(m.txt.indexOf(' '+w+' ')>-1) ms+=2; });
        if(ms>bestS){bestS=ms;best=m.r;}
        s+=ms*0.6;
      });
      iw.forEach(function(w){ if(c._all.indexOf(' '+w+' ')>-1) s+=0.5; });
      if(s<4) return;
      if(/^(head|director|controller|vp|svp|evp|chief)/i.test(c.title)) s+=0.5;
      if(c.check) s*=0.8;
      res.push({c:c,s:s,why:why.slice(0,2),best:best,bestS:bestS});
    });
    res.sort(function(a,b){return b.s-a.s;});
    return {res:res, topics:Object.keys(it)};
  }
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch];});}
  function cardHTML(m){
    var c=m.c, reasons=[];
    if(m.best&&m.bestS>=3) reasons.push('Commissioned <a href="'+esc(m.best.url)+'" target="_blank" rel="noopener">'+esc(m.best.title)+'</a>'+(m.best.date?' ('+esc(m.best.date)+')':''));
    m.why.forEach(function(w){reasons.push(esc(w.charAt(0).toUpperCase()+w.slice(1)));});
    var pitch = c.pu ? '<a href="'+esc(c.pu)+'" target="_blank" rel="noopener">'+esc(c.pr||'Official pitch route')+'</a>' : esc(c.pr||'');
    return '<div class="qm-card"><div class="qm-b">'+esc(c.b)+'</div><h4>'+esc(c.n)+'</h4><p class="qm-role">'+esc(c.title)+'</p>'+
      (reasons.length?'<ul>'+reasons.map(function(r){return '<li>'+r+'</li>';}).join('')+'</ul>':'')+
      (pitch?'<p class="qm-pitch"><strong>How to pitch:</strong> '+pitch+'</p>':'')+'</div>';
  }
  var form=document.getElementById('qm'), out=document.getElementById('qmOut'), gate=document.getElementById('qmGate'), more=document.getElementById('qmMore'), last=null;
  if(!form) return;
  form.addEventListener('submit',function(ev){
    ev.preventDefault();
    var idea=form.idea.value.trim();
    if(idea.length<4){out.innerHTML='<p class="qm-note">Describe the idea in a few words, for example "music doc about a 1960s artist".</p>';return;}
    last=score(idea);
    if(!last.res.length){out.innerHTML='<p class="qm-note">No clear match yet. Try naming the genre or subject, for example "true crime", "history", "music", "science".</p>';gate.hidden=true;more.innerHTML='';return;}
    var top=last.res.slice(0,3);
    out.innerHTML='<p class="qm-note">Best fits for <em>'+esc(idea)+'</em>'+(last.topics.length?' (read as: '+last.topics.map(function(k){return LABEL[k];}).join(', ')+')':'')+':</p><div class="qm-grid">'+top.map(cardHTML).join('')+'</div>';
    var rest=last.res.length-3;
    gate.hidden = rest<=0;
    document.getElementById('qmRest').textContent = rest>0 ? rest : '';
    more.innerHTML='';
    if(window.arielBeaconQM) window.arielBeaconQM();
  });
  var g=document.getElementById('qmGateForm');
  g.addEventListener('submit',function(ev){
    ev.preventDefault();
    var em=g.email.value.trim(), msg=document.getElementById('qmMsg');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)){msg.textContent='Please check your email address.';return;}
    var btn=g.querySelector('button');btn.disabled=true;msg.textContent='';
    fetch(window.COMM_EP,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'commissioner_list',email:em,watch:g.watch.checked,idea:form.idea.value.trim(),website:g.website.value,source:'quick-match'})})
      .then(function(r){return r.json();}).then(function(d){
        if(!d||!d.ok) throw new Error('x');
        gate.hidden=true;
        more.innerHTML='<p class="qm-note">All matches, best first. We have also emailed you the full commissioners list.</p><div class="qm-grid">'+last.res.slice(3,15).map(cardHTML).join('')+'</div>';
      }).catch(function(){msg.textContent='That did not go through. Please try again.';})
      .then(function(){btn.disabled=false;});
  });
})();
