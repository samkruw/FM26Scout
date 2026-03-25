// ═══════════════════════════════════════════════════════════════
// FM2026 WONDERKID SCOUT — app.js
// Features: Firebase · Groq AI · Shortlist · Compare · Budget
//           Dev-Chart · i18n DE/EN/FR · Export Excel/PDF
// ═══════════════════════════════════════════════════════════════

import { initializeApp }   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, getDocs, setDoc, doc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

// ═══════════════════════════════════════
// i18n TRANSLATIONS
// ═══════════════════════════════════════
const I18N = {
  de: { tagline:'Wonderkid Database · 0–20M €', nav_scout:'🔍 Scout', nav_shortlist:'Shortlist', nav_compare:'⚖ Vergleich', nav_budget:'💰 Budget', players:'Spieler', all:'Alle', generate:'KI-Daten generieren', no_key:'⚠ Bitte Groq Key eintragen!', saved:'in Firebase gespeichert!', compare_hint:'Bis zu 3 Spieler mit ⚖ auf den Karten auswählen.', budget_title:'Transfer-Budget Planer', sl_added:'zur Shortlist hinzugefügt', sl_removed:'von Shortlist entfernt', cmp_added:'zum Vergleich hinzugefügt', cmp_full:'Vergleich voll (max. 3)', exported:'Export erfolgreich!' },
  en: { tagline:'Wonderkid Database · 0–20M €', nav_scout:'🔍 Scout', nav_shortlist:'Shortlist', nav_compare:'⚖ Compare', nav_budget:'💰 Budget', players:'Players', all:'All', generate:'Generate AI Data', no_key:'⚠ Please enter Groq Key!', saved:'saved to Firebase!', compare_hint:'Select up to 3 players using ⚖ on cards.', budget_title:'Transfer Budget Planner', sl_added:'added to shortlist', sl_removed:'removed from shortlist', cmp_added:'added to compare', cmp_full:'Compare full (max. 3)', exported:'Export successful!' },
  fr: { tagline:'Base de données Wonderkid · 0–20M €', nav_scout:'🔍 Scout', nav_shortlist:'Liste courte', nav_compare:'⚖ Comparer', nav_budget:'💰 Budget', players:'Joueurs', all:'Tous', generate:'Générer données IA', no_key:'⚠ Veuillez entrer la clé Groq!', saved:'sauvegardé dans Firebase!', compare_hint:"Sélectionnez jusqu'à 3 joueurs avec ⚖.", budget_title:'Planificateur de budget', sl_added:'ajouté à la liste', sl_removed:'retiré de la liste', cmp_added:'ajouté à la comparaison', cmp_full:'Comparaison pleine (max. 3)', exported:'Export réussi!' },
};
let lang = localStorage.getItem('fm26_lang') || 'de';
const t = k => (I18N[lang]||I18N.de)[k] || k;
function setLang(l) {
  lang = l; localStorage.setItem('fm26_lang', l);
  document.querySelectorAll('[data-i18n]').forEach(el => { const k=el.getAttribute('data-i18n'); if(I18N[l][k]) el.textContent=I18N[l][k]; });
  document.querySelector('.lang-sel').value = l;
  renderShortlist(); renderCompare(); updateBudget();
}
window.setLang = setLang;

// ═══════════════════════════════════════
// CONFIG & KEYS
// ═══════════════════════════════════════
const getCfg = () => { try{ return JSON.parse(localStorage.getItem('fm26_config')||'null'); }catch(e){ return null; } };
const gk = () => localStorage.getItem('groq_k') || '';

function saveConfig() {
  const cfg = { apiKey:$v('cfg-apiKey'), authDomain:$v('cfg-authDomain'), projectId:$v('cfg-projectId'), storageBucket:$v('cfg-storageBucket'), appId:$v('cfg-appId') };
  const groq = $v('cfg-groqKey');
  if (!cfg.apiKey||!cfg.projectId) { toast('⚠ API Key + Project ID erforderlich','var(--red)','#fff'); return; }
  localStorage.setItem('fm26_config', JSON.stringify(cfg));
  if (groq) localStorage.setItem('groq_k', groq);
  $('setupOverlay').style.display='none';
  toast('✓ Gespeichert — Seite lädt neu …','var(--green)','#000');
  setTimeout(() => location.reload(), 1200);
}
window.saveConfig = saveConfig;

// ═══════════════════════════════════════
// FIREBASE
// ═══════════════════════════════════════
let db=null, storage=null;

function initFirebase() {
  const cfg = getCfg(); if (!cfg) return false;
  try { const app=initializeApp(cfg); db=getFirestore(app); storage=getStorage(app); return true; }
  catch(e) { console.error(e); return false; }
}
async function loadPlayers() {
  if (!db) return [];
  try { const s=await getDocs(collection(db,'players')); return s.docs.map(d=>({id:d.id,...d.data()})); }
  catch(e) { console.error(e); return []; }
}
async function savePlayer(p) {
  if (!db) return;
  const {id,...data}=p;
  await setDoc(doc(db,'players',String(id)),{...data,updatedAt:serverTimestamp()});
}
async function savePlayers(list) {
  if (!db) return;
  for (let i=0;i<list.length;i+=8) await Promise.all(list.slice(i,i+8).map(p=>savePlayer(p)));
}

// ═══════════════════════════════════════
// IMAGE UPLOAD
// ═══════════════════════════════════════
let uploadTargetId = null;
function triggerUpload(pid) { uploadTargetId=pid; $('globalImgInput').click(); }
window.triggerUpload = triggerUpload;

async function handleImgUpload(event) {
  const file=event.target.files[0]; if(!file||!uploadTargetId) return;
  event.target.value='';
  if (!storage) { toast('⚠ Storage nicht verbunden','var(--red)','#fff'); return; }
  if (file.size > 5*1024*1024) { toast('⚠ Max. 5MB','var(--orange)','#000'); return; }
  const prog=$('uploadProg'), bar=$('uploadBar');
  prog.classList.add('show'); $('uploadProgLabel').textContent='Hochladen …';
  try {
    const r=ref(storage,`player-faces/${uploadTargetId}`);
    const task=uploadBytesResumable(r,file);
    await new Promise((res,rej)=>task.on('state_changed',s=>{ bar.style.width=Math.round(s.bytesTransferred/s.totalBytes*100)+'%'; },rej,res));
    const url=await getDownloadURL(r);
    const idx=players.findIndex(p=>String(p.id)===String(uploadTargetId));
    if (idx!==-1) { players[idx].imgUrl=url; await savePlayer(players[idx]); updateAvaDOM(uploadTargetId,url); }
    prog.classList.remove('show'); bar.style.width='0%';
    toast('✓ Bild gespeichert','var(--green)','#000');
  } catch(e) { prog.classList.remove('show'); toast('Upload-Fehler','var(--red)','#fff'); }
}
window.handleImgUpload = handleImgUpload;

function updateAvaDOM(id, url) {
  const ca=$(`ava-${id}`); if(ca) ca.innerHTML=`<img src="${url}" alt="">`;
  const ma=$('mava-main'); if(ma) { ma.innerHTML=`<img src="${url}" alt="">`; ma.parentElement?.classList.add('has-img'); }
}
async function removePlayerImg(pid) {
  if (!confirm('Bild löschen?')) return;
  try { await deleteObject(ref(storage,`player-faces/${pid}`)); } catch(e){}
  const idx=players.findIndex(p=>String(p.id)===String(pid));
  if (idx!==-1) { delete players[idx].imgUrl; await savePlayer(players[idx]); doFilter(); }
  const ma=$('mava-main'); if(ma){ ma.innerHTML=makeInit(players[idx],true); ma.parentElement?.classList.remove('has-img'); }
  toast('Bild gelöscht','var(--muted)','var(--text)');
}
window.removePlayerImg = removePlayerImg;

// ═══════════════════════════════════════
// AVATAR HELPERS
// ═══════════════════════════════════════
const NAT_COL = {'Spanien':['#c60b1e','#f1bf00'],'Frankreich':['#002395','#ED2939'],'Brasilien':['#009c3b','#ffdf00'],'Argentinien':['#74acdf','#fff'],'England':['#012169','#C8102E'],'Deutschland':['#000','#DD0000'],'Portugal':['#006600','#FF0000'],'Niederlande':['#ae1c28','#fff'],'Belgien':['#000002','#FAE042'],'Italien':['#009246','#CE2B37'],'Norwegen':['#EF2B2D','#003087'],'Ecuador':['#FFD100','#034694'],'Marokko':['#c1272d','#006233'],'Ukraine':['#005BBB','#FFD500'],'Default':['#1c2a3f','#00cfff']};
const natCol = n => NAT_COL[n]||NAT_COL['Default'];

function makeInit(p, large=false) {
  const [bg,fg]=natCol(p.nation||'');
  const init=(p.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  return `<div class="ava-init" style="background:${bg};color:${fg};font-size:${large?'26px':'16px'}">${init}</div>`;
}
function getAva(p, large=false) {
  if (p.imgUrl) { const d=makeInit(p,large).replace(/"/g,"'"); return `<img src="${p.imgUrl}" alt="${p.name}" onerror="this.parentNode.innerHTML=\`${d}\`">`; }
  return makeInit(p, large);
}

// ═══════════════════════════════════════
// FM ROLES & TACTIC ENGINE
// ═══════════════════════════════════════
const FM_ROLES = {
  ST:['Advanced Forward','Poacher','Pressing Forward','Deep-Lying Forward','Target Man','Complete Forward','False Nine'],
  LW:['Winger','Inside Forward','Wide Playmaker','Inverted Winger'],
  RW:['Winger','Inside Forward','Wide Playmaker','Inverted Winger'],
  CAM:['Advanced Playmaker','Enganche','Shadow Striker','Trequartista'],
  CM:['Box-to-Box Midfielder','Mezzala','Roaming Playmaker','Carrilero','Ball-Winning Midfielder'],
  CDM:['Anchor Man','Ball-Winning Midfielder','Deep-Lying Playmaker','Half Back'],
  LB:['Full Back','Wing Back','Inverted Wing Back','Complete Wing Back'],
  RB:['Full Back','Wing Back','Inverted Wing Back','Complete Wing Back'],
  CB:['Ball-Playing Defender','Central Defender','Limited Defender','Libero'],
  GK:['Goalkeeper','Sweeper Keeper'],
};
const TACTICS = {
  '4-3-3':{label:'4-3-3 Pressing',style:'Pressing, Flügel dominant'},
  '4-2-3-1':{label:'4-2-3-1 Control',style:'Ballkontrolle, kreativer Zehner'},
  '4-4-2':{label:'4-4-2 Klassisch',style:'Ausgewogen, doppelte Spitze'},
  '3-5-2':{label:'3-5-2 Wingbacks',style:'Wingbacks, 3er-Kette'},
  '4-1-4-1':{label:'4-1-4-1 Defensiv',style:'Kompakt, Konter'},
  '5-3-2':{label:'5-3-2 Festung',style:'Defensiv, breite Kette'},
};
const CLUB_STYLES = {'FC Barcelona':{style:'Tiki-Taka',needs:['Technique','Passing','Dribbling']},'Real Madrid':{style:'Konter & Pressing',needs:['Pace','Finishing','Work_Rate']},'Bayern München':{style:'Gegenpressing',needs:['Work_Rate','Pace','Strength']},'Manchester City':{style:'Positional Play',needs:['Passing','Technique','Vision']},'Liverpool':{style:'High Press',needs:['Work_Rate','Pace','Finishing']},'Paris Saint-Germain':{style:'Individualtaktik',needs:['Dribbling','Technique','Finishing']},'Arsenal':{style:'Pressing Tiki-Taka',needs:['Technique','Work_Rate','Passing']},'Chelsea':{style:'Intensives Pressing',needs:['Work_Rate','Pace','Dribbling']},'Bayer Leverkusen':{style:'Gegenpressing Variabel',needs:['Work_Rate','Technique','Pace']},'Atletico Madrid':{style:'Defensiv Diszipliniert',needs:['Work_Rate','Strength','Tackling']},'Borussia Dortmund':{style:'Vertikales Gegenpressing',needs:['Pace','Work_Rate','Finishing']},'RB Leipzig':{style:'Hochintensives Pressing',needs:['Work_Rate','Pace','Strength']}};

function getBestRoles(p) {
  const a=p.attrs||{}, mainPos=(p.pos||[])[0]||'CM', roles=FM_ROLES[mainPos]||FM_ROLES['CM'];
  return roles.map(role=>{
    let s=70; const pa=a.Pace||70,dr=a.Dribbling||70,te=a.Technique||70,fi=a.Finishing||70,pa2=a.Passing||70,ju=a.Jumping||70,st=a.Strength||70,wo=a.Work_Rate||70,ta=a.Tackling||70,vi=a.Vision||70,ma=a.Marking||70,re=a.Reflexes||70;
    switch(role){
      case 'Advanced Forward': s=(fi*2+pa+dr+pa2)/5; break; case 'Poacher': s=(fi*3+pa)/4; break;
      case 'Pressing Forward': s=(wo*2+pa*2+fi)/5; break; case 'Deep-Lying Forward': s=(pa2*2+te*2+fi)/5; break;
      case 'Target Man': s=(ju*2+st*2+fi)/5; break; case 'Complete Forward': s=(fi+dr+pa+pa2+te)/5; break;
      case 'False Nine': s=(te*2+pa2*2+vi)/5; break; case 'Winger': s=(pa*2+dr*2+te)/5; break;
      case 'Inside Forward': s=(dr*2+fi+te+pa)/5; break; case 'Inverted Winger': s=(dr*2+fi+te+pa2)/5; break;
      case 'Wide Playmaker': s=(pa2*2+vi*2+te)/5; break; case 'Advanced Playmaker': s=(pa2*2+vi*2+te)/5; break;
      case 'Enganche': s=(te*2+vi*2+pa2)/5; break; case 'Shadow Striker': s=(fi*2+dr+pa+wo)/5; break;
      case 'Trequartista': s=(te*2+vi+dr+pa2)/5; break; case 'Box-to-Box Midfielder': s=(wo*2+pa2+ta+pa)/5; break;
      case 'Mezzala': s=(pa2+dr+te+vi+pa)/5; break; case 'Ball-Winning Midfielder': s=(ta*2+wo*2+st)/5; break;
      case 'Deep-Lying Playmaker': s=(pa2*2+vi*2+te)/5; break; case 'Anchor Man': s=(ta*2+ma*2+st)/5; break;
      case 'Wing Back': s=(pa*2+wo*2+dr)/5; break; case 'Inverted Wing Back': s=(pa2+te+pa+wo+dr)/5; break;
      case 'Ball-Playing Defender': s=(pa2*2+te+ma+ta)/5; break; case 'Central Defender': s=(ma*2+ta*2+ju)/5; break;
      case 'Sweeper Keeper': s=(re*2+pa2+pa2+ma)/5; break; case 'Goalkeeper': s=(re*2+ju*2+ma)/5; break;
      default: s=70;
    }
    return {role,score:Math.round(s)};
  }).sort((a,b)=>b.score-a.score).slice(0,3);
}
function getTacticFit(p) {
  const main=(p.pos||[])[0]||'CM', a=p.attrs||{};
  const flex={'LW':['RW','CAM'],'RW':['LW','CAM'],'CAM':['CM','LW','RW'],'CM':['CDM','CAM'],'CDM':['CM'],'LB':['RB','CB'],'RB':['LB','CB']};
  return Object.entries(TACTICS).map(([key,sys])=>{
    let ss=70;
    if(sys.style.includes('Pressing')) ss=((a.Work_Rate||70)+(a.Pace||70))/2;
    else if(sys.style.includes('Ballkontrolle')) ss=((a.Passing||70)+(a.Technique||70))/2;
    else if(sys.style.includes('Konter')) ss=((a.Pace||70)+(a.Dribbling||70))/2;
    return {key,label:sys.label,score:Math.round(ss)};
  }).sort((a,b)=>b.score-a.score);
}
function getClubFit(p) {
  const cs=CLUB_STYLES[p.club||'']; const a=p.attrs||{};
  if(!cs) return {label:'Unbekannt',score:70,desc:'Kein Club-Profil'};
  const score=Math.round(cs.needs.reduce((s,k)=>s+(a[k]||70),0)/cs.needs.length);
  return {label:cs.style,score,desc:score>=85?'✅ Sehr gut geeignet':score>=75?'✓ Gut geeignet':'⚠ Bedingt geeignet',needs:cs.needs};
}

let myTactic = localStorage.getItem('fm26_tactic')||'4-3-3';
function setMyTactic(t) { myTactic=t; localStorage.setItem('fm26_tactic',t); doFilter(); }
window.setMyTactic = setMyTactic;

// ═══════════════════════════════════════
// SHORTLIST
// ═══════════════════════════════════════
let shortlist = new Set(JSON.parse(localStorage.getItem('fm26_sl')||'[]'));
function saveShortlist() { localStorage.setItem('fm26_sl', JSON.stringify([...shortlist])); updateSlCount(); }
function updateSlCount() {
  const c=$('slCount'); const n=shortlist.size;
  c.textContent=n; c.className='sl-count'+(n>0?' has':'');
}
function toggleShortlist(pid) {
  pid=String(pid);
  if (shortlist.has(pid)) { shortlist.delete(pid); toast(t('sl_removed'),'var(--surface)','var(--muted)'); }
  else { shortlist.add(pid); toast(t('sl_added'),'var(--gold)','#000'); }
  saveShortlist();
  // Update button state on card
  const btn=document.getElementById(`slbtn-${pid}`); if(btn) btn.classList.toggle('active', shortlist.has(pid));
  if ($('viewShortlist') && !$('viewShortlist').classList.contains('view-hidden')) renderShortlist();
  updateBudgetPlayerList();
}
window.toggleShortlist = toggleShortlist;

function renderShortlist() {
  const g=$('shortlistGrid'), e=$('slEmpty');
  const list=players.filter(p=>shortlist.has(String(p.id)));
  if (!list.length) { if(g) g.innerHTML=''; if(e) e.style.display='block'; return; }
  if(e) e.style.display='none';
  if(g) g.innerHTML=list.map(p=>buildCardWithStatus(p,'sl')).join('');
}

function clearShortlist() {
  if (!confirm('Shortlist leeren?')) return;
  shortlist.clear(); saveShortlist(); renderShortlist();
}
window.clearShortlist = clearShortlist;

// ═══════════════════════════════════════
// COMPARE
// ═══════════════════════════════════════
let compareSet = [];
let compareChart = null;

function toggleCompare(pid) {
  pid=String(pid);
  const idx=compareSet.indexOf(pid);
  if (idx!==-1) { compareSet.splice(idx,1); toast('Entfernt','var(--surface)','var(--muted)'); }
  else if (compareSet.length>=3) { toast(t('cmp_full'),'var(--orange)','#000'); return; }
  else { compareSet.push(pid); toast(t('cmp_added'),'var(--purple)','#fff'); }
  // Update button
  const btn=document.getElementById(`cmpbtn-${pid}`); if(btn) btn.classList.toggle('active',compareSet.includes(pid));
  if (!$('viewCompare').classList.contains('view-hidden')) renderCompare();
}
window.toggleCompare = toggleCompare;

function clearCompare() { compareSet=[]; renderCompare(); doFilter(); }
window.clearCompare = clearCompare;

function renderCompare() {
  const g=$('compareGrid'), h=$('compareHint'), cc=$('compareChart');
  const list=compareSet.map(id=>players.find(p=>String(p.id)===id)).filter(Boolean);
  if (!list.length) { if(g) g.innerHTML=''; if(h) h.style.display='block'; if(cc) cc.style.display='none'; return; }
  if(h) h.style.display='none';
  g.className='compare-grid c'+list.length;
  const KEYS=['Pace','Dribbling','Technique','Finishing','Passing','Jumping','Strength','Work_Rate'];
  // Find best value per attribute
  const best={};
  KEYS.forEach(k=>{ best[k]=Math.max(...list.map(p=>(p.attrs||{})[k]||0)); });
  // Build summary via AI if key available
  g.innerHTML = list.map((p,i)=>{
    const cf=getClubFit(p), br=getBestRoles(p)[0];
    return `<div class="cmp-col ${i===0&&list.length>1?'best':''}">
      <div class="cmp-rem" onclick="removeCmp('${p.id}')">✕</div>
      <div class="cmp-head">
        <div class="cmp-ava">${getAva(p)}</div>
        <div>
          <div class="cmp-name">${p.name}</div>
          <div class="cmp-sub">${p.flag||''} ${p.club} · ${p.age}J</div>
          <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
            ${(p.pos||[]).map(x=>`<span class="tag tp">${x}</span>`).join('')}
            <span class="tag" style="color:var(--gold);border-color:rgba(240,180,41,.22);background:rgba(240,180,41,.07)">PA ${p.pa}</span>
          </div>
        </div>
      </div>
      <div class="cmp-body">
        <div class="cmp-row"><span class="cr-label">Ablöse</span><span style="flex:1"></span><span class="cr-val" style="color:var(--gold)">${p.priceLabel||'—'}</span></div>
        <div class="cmp-row"><span class="cr-label">CA/PA</span><span style="flex:1"></span><span class="cr-val">${p.ca}/<span style="color:var(--gold)">${p.pa}</span></span></div>
        <div class="cmp-row"><span class="cr-label">Beste Rolle</span><span style="flex:1"></span><span class="cr-val" style="font-size:9px;font-family:var(--fm);color:var(--purple)">${br?.role||'—'}</span></div>
        <div class="cmp-row"><span class="cr-label">Club-Fit</span><span style="flex:1"></span><span class="cr-val" style="color:${cf.score>=82?'var(--green)':cf.score>=72?'var(--gold)':'var(--orange)'}">${cf.score}%</span></div>
        ${KEYS.filter(k=>(p.attrs||{})[k]).map(k=>{
          const v=(p.attrs||{})[k]||0, isBest=v===best[k]&&list.length>1;
          const col=v>=85?'var(--green)':v>=74?'var(--gold)':'var(--orange)';
          return `<div class="cmp-row">
            <span class="cr-label">${k.replace('_',' ')}</span>
            <div class="cr-bar"><div class="cr-fill" style="width:${v}%;background:${col}"></div></div>
            <span class="cr-val ${isBest?'cr-best':''}">${v}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  // Radar chart
  if (list.length>=2) {
    cc.style.display='block';
    const labels=['Pace','Dribbling','Technique','Finishing','Passing','Jumping'];
    const colors=['rgba(0,207,255,.8)','rgba(159,110,245,.8)','rgba(32,212,96,.8)'];
    if (compareChart) compareChart.destroy();
    compareChart = new Chart(cc, {
      type:'radar',
      data:{
        labels,
        datasets: list.map((p,i)=>({
          label:p.name,
          data:labels.map(k=>(p.attrs||{})[k]||0),
          borderColor:colors[i],
          backgroundColor:colors[i].replace('.8','.1'),
          pointBackgroundColor:colors[i],
          borderWidth:2,
        }))
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        scales:{r:{backgroundColor:'rgba(13,18,32,.5)',grid:{color:'rgba(28,42,63,.8)'},ticks:{color:'#4a6582',backdropColor:'transparent',font:{size:9}},pointLabels:{color:'#dde8f5',font:{size:11}},min:50,max:100}},
        plugins:{legend:{labels:{color:'#dde8f5',font:{size:11}}}}
      }
    });
  } else { cc.style.display='none'; }
}

function removeCmp(pid) { const i=compareSet.indexOf(String(pid)); if(i!==-1) compareSet.splice(i,1); renderCompare(); const btn=document.getElementById(`cmpbtn-${pid}`); if(btn) btn.classList.remove('active'); }
window.removeCmp = removeCmp;

// ═══════════════════════════════════════
// BUDGET PLANER
// ═══════════════════════════════════════
let budgetPlayers = []; // {id, price}
let budgetChart = null;

function updateBudget() {
  const total=parseInt($('budgetTotal')?.value||'50000000');
  const wages=parseInt($('budgetWages')?.value||'150000');
  const spent=budgetPlayers.reduce((s,b)=>{ const p=players.find(x=>String(x.id)===b.id); return s+(p?.price||0); },0);
  const remaining=total-spent;
  const pct=Math.min(100,Math.round(spent/total*100));
  const col=pct>85?'var(--red)':pct>65?'var(--orange)':'var(--green)';
  const s=$('budgetSummary');
  if (s) s.innerHTML=`
    <div class="bps-row"><span class="bk">Gesamtbudget</span><span class="bv" style="color:var(--text)">€${fmt(total)}</span></div>
    <div class="bps-row"><span class="bk">Ausgegeben</span><span class="bv" style="color:${col}">€${fmt(spent)}</span></div>
    <div class="bbar-wrap"><div class="bbar-fill" style="width:${pct}%;background:${col}"></div></div>
    <div class="bps-row"><span class="bk">Verbleibend</span><span class="bv" style="color:var(--green)">€${fmt(remaining)}</span></div>
    <div class="bps-row"><span class="bk">Wochenlohn</span><span class="bv" style="color:var(--muted)">€${fmt(wages)}</span></div>`;

  renderBudgetTransfers();
  updateBudgetPlayerList();
  renderBudgetChart(spent, remaining, total);
}
window.updateBudget = updateBudget;

function renderBudgetTransfers() {
  const el=$('budgetTransfers'); if (!el) return;
  if (!budgetPlayers.length) { el.innerHTML='<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px">Noch keine Transfers geplant</div>'; return; }
  el.innerHTML=budgetPlayers.map(b=>{
    const p=players.find(x=>String(x.id)===b.id); if(!p) return '';
    return `<div class="bt-item">
      <div class="bt-ava">${getAva(p)}</div>
      <div>
        <div class="bt-name">${p.name}</div>
        <div style="font-size:10px;color:var(--muted);font-family:var(--fm)">${(p.pos||[]).join('/')} · ${p.age}J</div>
      </div>
      <span class="bt-price">${p.priceLabel||'—'}</span>
      <button class="bt-rem" onclick="removeBudgetPlayer('${p.id}')">✕</button>
    </div>`;
  }).join('');
}

function updateBudgetPlayerList() {
  const el=$('budgetPlayerList'); if (!el) return;
  const slList=players.filter(p=>shortlist.has(String(p.id)));
  if (!slList.length) { el.innerHTML='<div style="font-size:11px;color:var(--muted);padding:8px">Zuerst Spieler zur Shortlist hinzufügen ⭐</div>'; return; }
  el.innerHTML=slList.map(p=>{
    const added=budgetPlayers.some(b=>b.id===String(p.id));
    return `<div class="bpl-item ${added?'added':''}" onclick="toggleBudgetPlayer('${p.id}')">
      <span class="bpl-name">${p.name}</span>
      <span class="bpl-price">${p.priceLabel||'—'}</span>
      <span style="font-size:16px">${added?'✓':'+'}</span>
    </div>`;
  }).join('');
}

function toggleBudgetPlayer(pid) {
  pid=String(pid); const idx=budgetPlayers.findIndex(b=>b.id===pid);
  if (idx!==-1) budgetPlayers.splice(idx,1);
  else { const p=players.find(x=>String(x.id)===pid); budgetPlayers.push({id:pid,price:p?.price||0}); }
  updateBudget();
}
window.toggleBudgetPlayer = toggleBudgetPlayer;

function removeBudgetPlayer(pid) {
  budgetPlayers=budgetPlayers.filter(b=>b.id!==String(pid)); updateBudget();
}
window.removeBudgetPlayer = removeBudgetPlayer;

function renderBudgetChart(spent, remaining, total) {
  const cc=$('budgetChart'); if (!cc) return;
  if (budgetChart) budgetChart.destroy();
  const labels=budgetPlayers.map(b=>{ const p=players.find(x=>String(x.id)===b.id); return p?.name||'?'; });
  const values=budgetPlayers.map(b=>{ const p=players.find(x=>String(x.id)===b.id); return p?.price||0; });
  if (!labels.length) { labels.push('Verfügbar'); values.push(total); }
  else labels.push('Verbleibend'), values.push(remaining>0?remaining:0);
  budgetChart=new Chart(cc,{
    type:'doughnut',
    data:{labels,datasets:[{data:values,backgroundColor:['rgba(0,207,255,.8)','rgba(159,110,245,.8)','rgba(32,212,96,.8)','rgba(240,180,41,.8)','rgba(240,62,62,.6)'],borderColor:'rgba(13,18,32,.8)',borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#dde8f5',font:{size:11}}}}}
  });
}

const fmt = n => n>=1e6 ? (n/1e6).toFixed(1)+'M' : n>=1e3 ? (n/1e3).toFixed(0)+'K' : String(n);

// ═══════════════════════════════════════
// EXPORT (Excel / PDF)
// ═══════════════════════════════════════
function exportShortlist() {
  const list=players.filter(p=>shortlist.has(String(p.id)));
  if (!list.length) { toast('Shortlist ist leer','var(--orange)','#000'); return; }
  const rows=[['Name','Club','Nation','Position','Alter','CA','PA','Ablöse','Beste Rolle','Dev%','Notiz']];
  list.forEach(p=>{
    const role=getBestRoles(p)[0]?.role||'—';
    rows.push([p.name,p.club,p.nation,p.positions||'',p.age,p.ca,p.pa,p.priceLabel||'',role,p.dev||'',p.note||'']);
  });
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const bom='\uFEFF'; // UTF-8 BOM for Excel
  const blob=new Blob([bom+csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='FM2026_Shortlist.csv'; a.click();
  URL.revokeObjectURL(url);
  toast(t('exported'),'var(--green)','#000');
}
window.exportShortlist = exportShortlist;

function exportShortlistPDF() {
  const list=players.filter(p=>shortlist.has(String(p.id)));
  if (!list.length) { toast('Shortlist ist leer','var(--orange)','#000'); return; }
  const win=window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>FM2026 Shortlist</title>
  <style>body{font-family:Arial,sans-serif;margin:20px;color:#111}h1{color:#0077aa;margin-bottom:4px}
  .sub{color:#666;font-size:12px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#0077aa;color:#fff;padding:8px 10px;text-align:left}
  td{padding:7px 10px;border-bottom:1px solid #ddd}
  tr:nth-child(even){background:#f5f9fc}
  .pa{color:#cc8800;font-weight:bold}.ca{color:#0077aa}
  .role{color:#7744cc;font-size:11px}
  </style></head><body>
  <h1>⚽ FM2026 Wonderkid Shortlist</h1>
  <div class="sub">Exportiert am ${new Date().toLocaleDateString('de-CH')} · ${list.length} Spieler</div>
  <table><thead><tr><th>#</th><th>Name</th><th>Club</th><th>Pos</th><th>Alter</th><th>CA</th><th>PA</th><th>Ablöse</th><th>Beste Rolle</th></tr></thead><tbody>
  ${list.map((p,i)=>{
    const role=getBestRoles(p)[0]?.role||'—';
    return `<tr><td>${i+1}</td><td><strong>${p.name}</strong><br><span style="color:#888;font-size:10px">${p.flag||''} ${p.nation}</span></td><td>${p.club}</td><td>${p.positions||''}</td><td>${p.age}</td><td class="ca">${p.ca}</td><td class="pa">${p.pa}</td><td>${p.priceLabel||'—'}</td><td class="role">${role}</td></tr>`;
  }).join('')}
  </tbody></table></body></html>`);
  win.document.close();
  setTimeout(()=>win.print(),500);
  toast(t('exported'),'var(--green)','#000');
}
window.exportShortlistPDF = exportShortlistPDF;

// ═══════════════════════════════════════
// VIEW NAVIGATION
// ═══════════════════════════════════════
function showView(name) {
  ['scout','shortlist','compare','budget'].forEach(v=>{
    const el=$(`view${v.charAt(0).toUpperCase()+v.slice(1)}`);
    const tb=$(`tab-${v}`);
    if (el) el.classList.toggle('view-hidden', v!==name);
    if (tb) tb.classList.toggle('active', v===name);
  });
  const tb=$('scoutToolbar'), sb=$('srcbar');
  if(tb) tb.style.display=name==='scout'?'':'none';
  if(sb) sb.style.display=name==='scout'?'':'none';
  if (name==='shortlist') renderShortlist();
  if (name==='compare') renderCompare();
  if (name==='budget') updateBudget();
}
window.showView = showView;

// ═══════════════════════════════════════
// SOURCE STATUS
// ═══════════════════════════════════════
const setSS=(id,s)=>{ const e=document.getElementById('ss-'+id); if(e) e.className='ssrc '+s; };
const resetSS=()=>['fms','fmi','fmb','yt'].forEach(s=>setSS(s,''));

// ═══════════════════════════════════════
// GENERATE OVERLAY
// ═══════════════════════════════════════
// ═══════════════════════════════════════
// SPEZIFISCHE QUELLEN-ABFRAGEN (12 Kategorien)
// Jede Abfrage = ein echter Post-Typ von fminside/fmscout
// ═══════════════════════════════════════

const GEN_STEPS = [
  {icon:'🔵', label:'fmscout.com — Top 50 Wonderkids 0-5 Mio €'},
  {icon:'🔵', label:'fmscout.com — Top 50 Wonderkids 5-20 Mio €'},
  {icon:'🟡', label:'fminside.net — Beste Stürmer & Flügel bis 20 Mio €'},
  {icon:'🟡', label:'fminside.net — Beste Verteidiger & TW bis 20 Mio €'},
  {icon:'🟡', label:'fminside.net — Beste Mittelfeldspieler bis 20 Mio €'},
  {icon:'🟢', label:'FM Base — Hidden Gems & Schnäppchen unter 5 Mio €'},
  {icon:'🟢', label:'FM Base — Bundesliga & Ligue 1 Talente'},
  {icon:'🔴', label:'Zealand FM — Video-Empfehlungen 2025/26'},
  {icon:'🔴', label:'Squawka FM — Datenbasierte Top-Picks'},
  {icon:'🔴', label:'FM Scout YT — Serie A & La Liga Geheimtipps'},
  {icon:'🟣', label:'Deduplizieren & Qualität prüfen …'},
  {icon:'☁️',  label:'Firebase Firestore — Daten speichern …'},
];

// 12 hochspezifische Abfragen — wie echte Community-Posts
const SRC_PROMPTS = [

  // ── fmscout.com ──
  { id:'fms', name:'fmscout.com (0-5 Mio €)',
    prompt:`Du kennst die fmscout.com Wonderkid-Listen sehr genau.
Nenne GENAU 12 Football Manager 2026 Spieler aus der fmscout.com Datenbank:
- Ablöse zwischen 0 und 5 Millionen Euro (oder ablösefrei)
- Maximales Alter: 21 Jahre
- Hohes Potential (PA 160+)
- Alle Positionen (ST, LW, RW, CAM, CM, CDM, LB, RB, CB, GK)

Bekannte fmscout Empfehlungen einbeziehen (z.B. Spieler aus deren "50 best wonderkids" Liste).

Format pro Spieler (STRIKT einhalten):
NAME | ALTER | CLUB | NATION | POSITION | CA | PA | ABLÖSE_MIO | BESONDERHEIT` },

  { id:'fms', name:'fmscout.com (5-20 Mio €)',
    prompt:`Du kennst die fmscout.com Wonderkid-Listen sehr genau.
Nenne GENAU 12 Football Manager 2026 Spieler aus fmscout.com:
- Ablöse zwischen 5 und 20 Millionen Euro
- Maximales Alter: 23 Jahre
- Hohes Potential (PA 165+)
- Fokus: Spieler die fmscout.com in "best value" oder "top transfers" Artikeln empfiehlt

Format: NAME | ALTER | CLUB | NATION | POSITION | CA | PA | ABLÖSE_MIO | BESONDERHEIT` },

  // ── fminside.net ──
  { id:'fmi', name:'fminside.net — Stürmer & Flügel bis 20 Mio €',
    prompt:`Du kennst fminside.net sehr gut. Dort gibt es spezifische Posts wie:
"Top 10 Stürmer bis 20 Mio €", "Beste Linksaußen unter 20 Mio €", "Günstige Flügelspieler FM26".

Nenne GENAU 10 Stürmer/Flügelspieler (ST, LW, RW, CF) aus FM2026:
- Ablöse MAXIMAL 20 Millionen Euro
- Maximales Alter: 23 Jahre
- Wie sie auf fminside.net empfohlen werden

Format: NAME | ALTER | CLUB | NATION | POSITION | CA | PA | ABLÖSE_MIO | BESONDERHEIT` },

  { id:'fmi', name:'fminside.net — Verteidiger & Torhüter bis 20 Mio €',
    prompt:`Du kennst fminside.net sehr gut. Dort gibt es Posts wie:
"Top 10 Innenverteidiger bis 20 Mio €", "Beste günstige Torhüter FM26", "Schnellste Außenverteidiger unter 20 Mio €".

Nenne GENAU 10 Defensivspieler (CB, LB, RB, GK) aus FM2026:
- Ablöse MAXIMAL 20 Millionen Euro
- Maximales Alter: 24 Jahre
- Wie sie auf fminside.net empfohlen werden

Format: NAME | ALTER | CLUB | NATION | POSITION | CA | PA | ABLÖSE_MIO | BESONDERHEIT` },

  { id:'fmi', name:'fminside.net — Mittelfeldspieler bis 20 Mio €',
    prompt:`Du kennst fminside.net sehr gut. Dort gibt es Posts wie:
"Beste Box-to-Box Mittelfeldspieler bis 20 Mio €", "Top Spielmacher unter 15 Mio €", "Günstige Sechser FM26".

Nenne GENAU 10 Mittelfeldspieler (CM, CAM, CDM) aus FM2026:
- Ablöse MAXIMAL 20 Millionen Euro
- Maximales Alter: 23 Jahre

Format: NAME | ALTER | CLUB | NATION | POSITION | CA | PA | ABLÖSE_MIO | BESONDERHEIT` },

  // ── FM Base ──
  { id:'fmb', name:'FM Base — Hidden Gems unter 5 Mio €',
    prompt:`Du kennst FM Base (fmbase.co.uk) sehr gut. Dort gibt es "Hidden Gems" und "Bargain" Artikel.
Typische FM Base Posts: "20 hidden gems for FM26", "Best free transfers FM26", "Cheap wonderkids under £5m".

Nenne GENAU 10 versteckte Talente (Hidden Gems) aus FM2026:
- Ablöse UNTER 5 Millionen Euro ODER ablösefrei
- Maximales Alter: 22 Jahre
- Spieler die oft übersehen werden aber hohes Potential haben
- Aus weniger bekannten Ligen (Eredivisie, Ligue 1, Serie B, Brasileirao, MLS usw.)

Format: NAME | ALTER | CLUB | NATION | POSITION | CA | PA | ABLÖSE_MIO | WARUM_HIDDEN_GEM` },

  { id:'fmb', name:'FM Base — Bundesliga & Ligue 1 Talente',
    prompt:`Du kennst FM Base gut. Nenne GENAU 8 Talente aus Bundesliga oder Ligue 1 für FM2026:
- Ablöse MAXIMAL 20 Millionen Euro
- Maximales Alter: 22 Jahre
- Bundesliga oder Ligue 1 Vereine
- Hoher Entwicklungspotential in FM26

Format: NAME | ALTER | CLUB | LIGA | POSITION | CA | PA | ABLÖSE_MIO | BESONDERHEIT` },

  // ── YouTube ──
  { id:'yt', name:'Zealand FM — Video-Empfehlungen 2025/26',
    prompt:`Du kennst den YouTube-Kanal Zealand FM sehr gut.
Zealand macht typische Videos wie: "The BEST cheap wonderkids in FM26", "Budget Strikers FM26", "Hidden gems every FM26 save needs".

Nenne GENAU 10 Spieler die Zealand FM in seinen FM2026 Videos empfiehlt:
- Ablöse MAXIMAL 20 Millionen Euro
- Maximales Alter: 23 Jahre
- Warum Zealand ihn empfiehlt (Spielstil, Taktik, Preis-Leistung)

Format: NAME | ALTER | CLUB | NATION | POSITION | CA | PA | ABLÖSE_MIO | ZEALAND_ZITAT_KURZ` },

  { id:'yt', name:'Squawka FM — Datenbasierte Top-Picks',
    prompt:`Du kennst den YouTube-Kanal Squawka Football Manager sehr gut.
Squawka analysiert Spieler mit echten Daten. Typische Videos: "Data-driven wonderkids FM26", "Best value players per position FM26".

Nenne GENAU 10 Spieler die Squawka FM datenbasiert für FM2026 empfiehlt:
- Ablöse MAXIMAL 20 Millionen Euro
- Maximales Alter: 24 Jahre
- Fokus auf Preis-Leistungs-Verhältnis

Format: NAME | ALTER | CLUB | NATION | POSITION | CA | PA | ABLÖSE_MIO | DATENPUNKT` },

  { id:'yt', name:'FM Scout YT — Serie A & La Liga Geheimtipps',
    prompt:`Du kennst den FM Scout YouTube-Kanal sehr gut.
FM Scout macht Videos wie: "Best Serie A wonderkids FM26", "La Liga bargains FM26", "Italian league hidden gems".

Nenne GENAU 10 Spieler aus Serie A oder La Liga für FM2026:
- Ablöse MAXIMAL 20 Millionen Euro
- Maximales Alter: 23 Jahre
- Serie A oder La Liga Clubs

Format: NAME | ALTER | CLUB | LIGA | POSITION | CA | PA | ABLÖSE_MIO | BESONDERHEIT` },
];

function showGenOverlay() {
  const ov=$('genOverlay'), st=$('genSteps');
  ov.classList.add('open');
  // Show only first 6 steps in UI (others run in background)
  st.innerHTML=GEN_STEPS.slice(0,10).map((s,i)=>`<div class="gstep" id="gs${i}"><span class="gi">⬜</span><span class="gt">${s.label}</span></div>`).join('');
  $('genBar').style.width='0%';
}
function stepGen(i,done) {
  const el=$(`gs${i}`); if(!el) return;
  el.className='gstep '+(done?'done':'active');
  el.querySelector('.gi').textContent=done?GEN_STEPS[i]?.icon||'✅':'⏳';
  $('genBar').style.width=Math.round((i+(done?1:.5))/GEN_STEPS.length*100)+'%';
}
function hideGenOverlay() { $('genOverlay').classList.remove('open'); }

// ── JSON Schema for merge ──
const JSON_SCHEMA = `{"id":"slug-name","name":"Vollständiger Name","age":int,"born":int,"club":"Vereinsname","nation":"Nationalität DE","flag":"🏳 Emoji","league":"Bundesliga|Premier League|La Liga|Serie A|Ligue 1|Eredivisie|Other","pos":["ST"],"positions":"ST, LW","price":int (0=ablösefrei/nicht verkäuflich),"priceLabel":"~X Mio €|Ablösefrei|Nicht verkäuflich","ca":int 95-175,"pa":int 140-200,"attrs":{"Pace":int,"Dribbling":int,"Technique":int,"Finishing":int,"Passing":int,"Jumping":int,"Strength":int,"Work_Rate":int,"Tackling":int,"Vision":int},"foot":"Rechts|Links|Beide","height":"XXX cm","weight":"XX kg","contract":"Jahr","dev":int 60-98,"emoji":"⚽","sources":["fmscout|fminside|fmbase|youtube"],"srcNote":"Quelle/YouTuber","note":"Scout-Notiz max 15 Wörter","ribbon":""|"🔥 HOT"|"💎 GEM"|"💰 VALUE"|"🏆 WELTKLASSE"|"⚡ SPEEDSTER"}`;

async function generateData() {
  if(!gk()){toast(t('no_key'),'var(--red)','#fff');$('setupOverlay').style.display='flex';return;}
  if(!db){toast('⚠ Firebase nicht verbunden','var(--red)','#fff');return;}
  const btn=$('genBtn'); btn.classList.add('loading');btn.disabled=true;
  resetSS();showGenOverlay();

  try {
    const raw=[];
    // Run all 10 source prompts
    for(let i=0;i<SRC_PROMPTS.length;i++){
      const src=SRC_PROMPTS[i];
      stepGen(i,false);
      setSS(src.id,'loading');
      $('genInfo').textContent=`${i+1}/10 · ${src.name} …`;
      try{
        const res=await groq(
          [{role:'system',content:'Du bist FM2026-Experte mit tiefem Wissen über FM-Community-Seiten und YouTube-Kanäle. Antworte IMMER auf Deutsch. Halte das angegebene Format STRIKT ein.'},
           {role:'user',content:src.prompt}],
          'llama-3.3-70b-versatile', 1100, 0.35
        );
        raw.push({src:src.name, id:src.id, data:res});
        setSS(src.id,'ok');
      } catch(e) {
        setSS(src.id,'err');
        raw.push({src:src.name, id:src.id, data:'[Fehler bei '+src.name+']'});
      }
      stepGen(i,true);
      await sleep(250);
    }

    // Step 10: Deduplicate + validate budget filter
    stepGen(10,false);
    $('genInfo').textContent='Deduplizieren & Budget-Filter (max. 20 Mio €) …';
    const combined = raw.map(r=>`
=== ${r.src} ===
${r.data}`).join('
');

    // Split into 2 batches for the merge (token limit)
    const half = Math.ceil(raw.length/2);
    const batch1 = raw.slice(0,half).map(r=>`=== ${r.src} ===
${r.data}`).join('
');
    const batch2 = raw.slice(half).map(r=>`=== ${r.src} ===
${r.data}`).join('
');

    async function mergeBatch(text, idOffset=0) {
      const res = await groq([
        { role:'system', content:`FM2026 Datenstruktur-Experte. Antworte NUR mit JSON-Array. Kein Text, kein Markdown, keine Backticks.
Schema pro Objekt: ${JSON_SCHEMA}

WICHTIGE REGELN:
1. ALLE Spieler müssen Ablöse ≤ 20.000.000 Euro haben (price ≤ 20000000)
2. ALLE Spieler müssen ≤ 24 Jahre alt sein
3. Ablösefreie Spieler: price=0, priceLabel="Ablösefrei"
4. Nicht verkäuflich (z.B. Barça-Jugend): price=0, priceLabel="Nicht verkäuflich"
5. Realistische FM26 CA/PA Werte (CA 95-175, PA 140-200)
6. Attribute realistisch 50-99
7. id = slug des Namens (lowercase, bindestrich statt leerzeichen)
8. Sortiere nach PA absteigend` },
        { role:'user', content:`Konvertiere diese Rohdaten in JSON. Entferne Duplikate (gleicher Name). Nur Spieler mit Ablöse ≤ 20 Mio €. Min. 15 Spieler aus diesen Quellen extrahieren.

${text}` }
      ], 'llama-3.3-70b-versatile', 6000, 0.1);
      const clean = res.replace(/```json|```/g,'').trim();
      try { return JSON.parse(clean); }
      catch(e) { const m=clean.match(/\[[\s\S]*\]/); return m ? JSON.parse(m[0]) : []; }
    }

    const [list1, list2] = await Promise.all([mergeBatch(batch1), mergeBatch(batch2)]);
    stepGen(10,true);

    // Final dedup by name
    const allPlayers = [...list1, ...list2];
    const seen = new Set();
    const deduped = allPlayers
      .filter(p => {
        const key = (p.name||'').toLowerCase().trim();
        if (seen.has(key) || !key) return false;
        seen.add(key); return true;
      })
      .filter(p => (p.price||0) <= 20000000) // Hard budget filter
      .sort((a,b) => (b.pa||0)-(a.pa||0));

    // Step 11: Save to Firebase
    stepGen(11,false);
    $('genInfo').textContent=`${deduped.length} Spieler → Firebase speichern …`;

    if(deduped.length > 0){
      await savePlayers(deduped);
      stepGen(11,true);
      hideGenOverlay();
      players = deduped;
      $('stTime').textContent = new Date().toLocaleTimeString('de-CH');
      doFilter(); updateStats();
      checkForNewPlayers(deduped);
      ['fms','fmi','fmb','yt'].forEach(s=>setSS(s,'ok'));
      toast(`✓ ${deduped.length} Spieler (0-20 Mio €) geladen!`, 'var(--green)', '#000');
    } else {
      hideGenOverlay();
      toast('⚠ Keine validen Spieler — Budget-Filter zu streng?', 'var(--orange)', '#000');
    }

  } catch(e) {
    hideGenOverlay(); console.error(e);
    if(e.message?.includes('401')) toast('⚠ Ungültiger Groq Key','var(--red)','#fff');
    else toast('Fehler: '+e.message?.slice(0,60),'var(--red)','#fff');
  } finally { btn.classList.remove('loading'); btn.disabled=false; }
}
window.generateData = generateData;


// ═══════════════════════════════════════
// FILTER & RENDER
// ═══════════════════════════════════════
let players=[], curPos='Alle';

function setPos(p,btn){curPos=p;document.querySelectorAll('.pf').forEach(b=>b.classList.remove('on'));btn.classList.add('on');doFilter();}
window.setPos=setPos;

function doFilter(){
  const q=$('sq')?.value?.toLowerCase().trim()||'';
  const sort=$('sortSel')?.value||'pot';
  const lg=$('lgSel')?.value||'';
  const PM={'LW':['LW','RW'],'LB':['LB','RB']};
  let list=[...players];
  if(q) list=list.filter(p=>[p.name,p.club,p.nation,p.positions].some(x=>(x||'').toLowerCase().includes(q)));
  if(curPos!=='Alle'){const t=PM[curPos]||[curPos];list=list.filter(p=>(p.pos||[]).some(x=>t.includes(x)));}
  if(lg) list=list.filter(p=>p.league===lg);
  if(sort==='pot') list.sort((a,b)=>(b.pa||0)-(a.pa||0));
  else if(sort==='ca_desc') list.sort((a,b)=>(b.ca||0)-(a.ca||0));
  else if(sort==='price_asc') list.sort((a,b)=>(a.price||0)-(b.price||0));
  else if(sort==='price_desc') list.sort((a,b)=>(b.price||0)-(a.price||0));
  else if(sort==='age') list.sort((a,b)=>(a.age||99)-(b.age||99));
  else if(sort==='name') list.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  renderGrid(list);
}
window.doFilter=doFilter;

const VC=v=>v>=85?'vh':v>=74?'vm':'vl';
const PC=pa=>pa>=185?'pr-gold':pa>=177?'pr-green':'pr-blue';
const SCOL={fmscout:'#00cfff',fminside:'#f0b429',fmbase:'#20d460',youtube:'#f03e3e'};
const SLBL={fmscout:'FM-Scout.com',fminside:'FMInside.net',fmbase:'FM Base',youtube:'YouTube'};
const SCLS={fmscout:'sch-a',fminside:'sch-b',fmbase:'sch-c',youtube:'sch-d'};

function buildCard(p, context='main') {
  const ak=Object.keys(p.attrs||{}).slice(0,4);
  const pid=String(p.id);
  const inSL=shortlist.has(pid), inCmp=compareSet.includes(pid);
  const roles=getBestRoles(p);
  const tacFits=getTacticFit(p);
  const userFit=tacFits.find(f=>f.key===myTactic);
  const fitCol=userFit?.score>=82?'var(--green)':userFit?.score>=72?'var(--gold)':'var(--muted)';
  return `<div class="pcard" onclick="openM('${pid}')">
    ${p.ribbon?`<div class="ribbon">${p.ribbon}</div>`:''}
    <div class="ct">
      <div class="card-actions">
        <div class="ca-btn sl-btn ${inSL?'active':''}" id="slbtn-${pid}" onclick="event.stopPropagation();toggleShortlist('${pid}')" title="Shortlist">⭐</div>
        <div class="ca-btn cmp-btn ${inCmp?'active':''}" id="cmpbtn-${pid}" onclick="event.stopPropagation();toggleCompare('${pid}')" title="Vergleichen">⚖</div>
      </div>
      <div class="ava-wrap">
        <div class="ava" id="ava-${pid}">${getAva(p)}</div>
        <div class="upload-trigger" onclick="event.stopPropagation();triggerUpload('${pid}')">📷</div>
      </div>
      <div class="pmeta">
        <div class="pname">${p.name}</div>
        <div class="pclub"><span>${p.flag||''}</span>${p.club}</div>
        <div class="ptags">
          ${(p.pos||[]).map(x=>`<span class="tag tp">${x}</span>`).join('')}
          <span class="tag ta">${p.age} J.</span>
          <span class="tag tn">${p.nation}</span>
        </div>
      </div>
      <div class="pot-ring ${PC(p.pa)}">${p.pa}</div>
    </div>
    <div class="croles">${roles.slice(0,2).map(r=>`<span class="role-tag">${r.role}</span>`).join('')}</div>
    <div class="cstats">${ak.map(k=>`<div class="cs"><span class="csl">${k.replace('_',' ')}</span><span class="csv ${VC((p.attrs||{})[k]||0)}">${(p.attrs||{})[k]||'—'}</span></div>`).join('')}</div>
    <div class="cbot">
      <div class="cpr">${p.priceLabel||'—'}<small>Marktwert</small></div>
      <div class="ctactic" style="color:${fitCol}">${TACTICS[myTactic]?.label||myTactic} ${userFit?.score||'—'}%</div>
      <div class="devb">
        <span class="devl">Entw.</span>
        <div class="btr"><div class="bfi" style="width:${p.dev||70}%"></div></div>
        <span class="devl">${p.dev||70}%</span>
      </div>
    </div>
  </div>`;
}

function renderGrid(list){
  const g=$('grid'),e=$('emptyEl');
  if(!list.length){if(g)g.innerHTML='';if(e)e.style.display='block';return;}
  if(e)e.style.display='none';
  if(g)g.innerHTML=list.map(p=>buildCardWithStatus(p)).join('');
}

function updateStats(){
  const priced=players.filter(p=>p.price>0);
  const cheap=players.filter(p=>p.price>0&&p.price<=5000000);
  const avg=priced.length?Math.round(priced.reduce((s,p)=>s+(p.price||0),0)/priced.length/1e6):0;
  $('stT').textContent=players.length;
  $('stA').textContent=avg?avg+'M €':'—';
  $('stP').textContent=players.length?Math.max(...players.map(p=>p.pa||0)):'—';
  $('stB').textContent=cheap.length?cheap.length+'':'—';
}

// ═══════════════════════════════════════
// MODAL
// ═══════════════════════════════════════
let devChart=null;
function openM(id){
  const p=players.find(x=>String(x.id)===String(id));if(!p)return;
  const aC=['af-c','af-g','af-b','af-o','af-c','af-g'];
  const hasImg=!!p.imgUrl;
  $('mhead').innerHTML=`
    <div class="mava-wrap ${hasImg?'has-img':''}" onclick="triggerUpload('${p.id}')" title="Bild hochladen">
      <div class="mava" id="mava-main">${getAva(p,true)}</div>
      <div class="mava-overlay"><span>📷</span><small>Hochladen</small></div>
      ${hasImg?`<div class="mava-del" onclick="event.stopPropagation();removePlayerImg('${p.id}')">✕</div>`:''}
    </div>
    <div class="mtitle">
      <h2>${p.name}</h2>
      <div class="msub"><span>${p.flag||''} ${p.nation}</span><span>·</span><span>${p.club}</span><span>·</span><span>${p.league}</span></div>
      <div class="ptags" style="margin-top:4px">
        ${(p.pos||[]).map(x=>`<span class="tag tp">${x}</span>`).join('')}
        <span class="tag ta">${p.age} Jahre</span>
        ${p.ribbon?`<span class="tag" style="color:var(--gold);border-color:rgba(240,180,41,.28);background:rgba(240,180,41,.08)">${p.ribbon}</span>`:''}
        <div class="ca-btn sl-btn ${shortlist.has(String(p.id))?'active':''}" id="slbtn-modal" onclick="toggleShortlist('${p.id}')" style="opacity:1;width:26px;height:26px;font-size:12px" title="Shortlist">⭐</div>
      </div>
    </div>`;

  $('mbody').innerHTML=`
    <div class="mgrid">
      <div class="msec"><h3>Spielerprofil</h3>
        ${[['Geburtsjahr',p.born||'—'],['Alter',p.age+' J.'],['Nationalität',(p.flag||'')+' '+p.nation],['Schussfuss',p.foot||'—'],['Grösse',p.height||'—'],['Positionen',p.positions||'—']].map(([k,v])=>`<div class="mrow"><span class="mk">${k}</span><span class="mv">${v}</span></div>`).join('')}
      </div>
      <div class="msec"><h3>FM2026 Werte</h3>
        ${[['CA',`<span style="color:var(--accent)">${p.ca||'—'}</span>`],['PA',`<span style="color:var(--gold)">${p.pa||'—'}</span>`],['Ablöse',`<span style="color:var(--green)">${p.priceLabel||'—'}</span>`],['Vertrag',p.contract||'—'],['Entwicklung',`${p.dev||'—'}%`],['Quelle',p.srcNote||'—']].map(([k,v])=>`<div class="mrow"><span class="mk">${k}</span><span class="mv">${v}</span></div>`).join('')}
      </div>
    </div>
    <!-- Position / Roles / Fit -->
    <div class="pos-fit-section">
      <div class="pfs-col"><div class="pfs-h">🎯 Beste FM-Rollen</div><div class="roles-list" id="rolesListM"></div></div>
      <div class="pfs-col"><div class="pfs-h">🗺 Taktik-Fit</div><div class="tactic-list" id="tacticListM"></div></div>
      <div class="pfs-col"><div class="pfs-h">🏟 Club-Fit</div><div class="club-fit-box" id="clubFitM"></div></div>
    </div>
    <!-- Dev Chart -->
    <div class="dev-chart-wrap">
      <h3>📈 Entwicklungs-Prognose (CA/PA über 5 Saisons)</h3>
      <canvas id="devChartCanvas" style="max-height:180px"></canvas>
    </div>
    <!-- Attributes -->
    <div class="msec" style="margin-bottom:11px;margin-top:2px"><h3>Schlüssel-Attribute</h3></div>
    <div class="ag">${Object.entries(p.attrs||{}).map(([k,v],i)=>`<div class="ai-item"><span class="an">${k.replace('_',' ')}</span><div class="abar2"><div class="atr"><div class="afl ${aC[i%aC.length]}" style="width:${v}%"></div></div><span class="av ${VC(v)}">${v}</span></div></div>`).join('')}</div>
    <!-- AI Scout Report -->
    <div class="ai-block"><h3>✦ KI Scout-Report</h3><div id="aiOut"><div class="ai-load"><span style="display:inline-block;width:13px;height:13px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite"></span>&nbsp;Analysiere …</div></div></div>
    <!-- Sources -->
    <div class="msec" style="margin-bottom:7px"><h3>Datenquellen</h3></div>
    <div class="src-chips">${(p.sources||['fmscout']).map(s=>`<span class="sch ${SCLS[s]||'sch-a'}">${SLBL[s]||s}</span>`).join('')}</div>`;

  $('overlay').classList.add('open');

  // Roles
  $('rolesListM').innerHTML=getBestRoles(p).map(r=>{
    const pct=Math.min(100,Math.round((r.score-60)/40*100));
    const col=r.score>=85?'var(--green)':r.score>=75?'var(--gold)':'var(--orange)';
    return `<div class="role-item"><div class="ri-top"><span class="ri-name">${r.role}</span><span class="ri-score" style="color:${col}">${r.score}</span></div><div class="ri-bar"><div class="ri-fill" style="width:${pct}%;background:${col}"></div></div></div>`;
  }).join('');

  // Tactic fits
  $('tacticListM').innerHTML=Object.entries(TACTICS).map(([key,sys])=>{
    const fits=getTacticFit(p); const f=fits.find(x=>x.key===key)||{score:65};
    const col=f.score>=82?'var(--green)':f.score>=72?'var(--gold)':'var(--muted)';
    const icon=f.score>=82?'✅':f.score>=72?'✓':'–';
    return `<div class="tactic-item ${key===myTactic?'my-tactic':''}"><span class="ti-icon">${icon}</span><span class="ti-label">${sys.label}</span><span class="ti-score" style="color:${col}">${f.score}%</span></div>`;
  }).join('');

  // Club fit
  const cf=getClubFit(p);
  const cfCol=cf.score>=85?'var(--green)':cf.score>=75?'var(--gold)':'var(--orange)';
  $('clubFitM').innerHTML=`<div class="cf-style">${cf.label}</div><div class="cf-score" style="color:${cfCol}">${cf.score}%</div><div class="cf-desc">${cf.desc}</div>${cf.needs?`<div class="cf-needs">${cf.needs.join(', ')}</div>`:''}`;

  // Dev chart
  setTimeout(()=>{
    const cc=$('devChartCanvas'); if(!cc) return;
    if(devChart) devChart.destroy();
    const ca=p.ca||100, pa=p.pa||160, dev=p.dev||75;
    const seasons=['Jetzt','S1','S2','S3','S4','S5'];
    const caData=[ca]; const paLine=[pa,pa,pa,pa,pa,pa];
    for(let i=1;i<=5;i++){
      const gain=Math.round((pa-caData[i-1])*(dev/100)*0.3*(1-i*0.08));
      caData.push(Math.min(pa,caData[i-1]+Math.max(1,gain)));
    }
    devChart=new Chart(cc,{
      type:'line',
      data:{labels:seasons,datasets:[
        {label:'CA (aktuell)',data:caData,borderColor:'var(--accent)',backgroundColor:'rgba(0,207,255,.1)',borderWidth:2,tension:.4,fill:true,pointBackgroundColor:'var(--accent)'},
        {label:'PA (Ziel)',data:paLine,borderColor:'rgba(240,180,41,.5)',borderWidth:1.5,borderDash:[5,5],pointRadius:0},
      ]},
      options:{responsive:true,maintainAspectRatio:false,scales:{y:{min:Math.max(50,ca-20),max:pa+5,grid:{color:'rgba(28,42,63,.6)'},ticks:{color:'#4a6582',font:{size:9}}},x:{grid:{color:'rgba(28,42,63,.4)'},ticks:{color:'#4a6582',font:{size:9}}}},plugins:{legend:{labels:{color:'#dde8f5',font:{size:10}}}}}
    });
  },100);

  runAI(p);
}
window.openM=openM;

async function runAI(p){
  const el=$('aiOut'); if(!el) return;
  if(!gk()){el.innerHTML=`<p style="color:var(--muted);font-size:11px">🔑 Kein Groq Key — ${p.note||''}</p>`;return;}
  try{
    const txt=await groq([
      {role:'system',content:'FM2026 Scout-Analyst. Deutsch. Max 4 Sätze. Kein Markdown. FM-Fachbegriffe.'},
      {role:'user',content:`Scout-Report: ${p.name} (${p.age}J, ${p.club}, ${p.positions}). CA:${p.ca}, PA:${p.pa}, Ablöse:${p.priceLabel}. Attrs: ${Object.entries(p.attrs||{}).map(([k,v])=>k+':'+v).join(', ')}. Kaufempfehlung? Taktik? 3-Saison-Prognose?`}
    ],'llama-3.3-70b-versatile',300,0.7);
    el.innerHTML=`<p>${txt}</p>`;
  }catch(e){el.innerHTML=`<p style="color:var(--muted);font-size:11px">${p.note||'Analyse nicht verfügbar.'}</p>`;}
}

function closeM(){$('overlay').classList.remove('open');}
function oClick(e){if(e.target===$('overlay'))closeM();}
window.closeM=closeM;window.oClick=oClick;
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeM();});

// ═══════════════════════════════════════
// UTILS
// ═══════════════════════════════════════
const $=id=>document.getElementById(id);
const $v=id=>($(`${id}`)?.value||'').trim();
function toast(msg,bg,col){const t=document.createElement('div');t.className='toast';t.textContent=msg;t.style.background=bg;t.style.color=col;document.body.appendChild(t);setTimeout(()=>t.remove(),2900);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function injectUploadProgress(){
  const d=document.createElement('div');d.id='uploadProg';d.className='upload-prog';
  d.innerHTML=`<span id="uploadProgLabel">Hochladen …</span><div class="upload-bar-wrap"><div class="upload-bar" id="uploadBar"></div></div>`;
  document.body.appendChild(d);
}

// ═══════════════════════════════════════
// FALLBACK DATA
// ═══════════════════════════════════════
const FALLBACK=[
  {id:'lamine-yamal',name:"Lamine Yamal",age:17,born:2007,club:"FC Barcelona",nation:"Spanien",flag:"🇪🇸",league:"La Liga",pos:["RW","LW"],positions:"RW, LW",price:0,priceLabel:"Nicht verkäuflich",ca:170,pa:195,attrs:{Pace:95,Dribbling:92,Technique:90,Finishing:81,Passing:85,Jumping:62,Strength:58,Work_Rate:76,Tackling:42,Vision:84},foot:"Rechts",height:"180 cm",weight:"63 kg",contract:"2026",dev:95,emoji:"⭐",sources:["fmscout","youtube"],srcNote:"Zealand: #1 Wonderkid weltweit",note:"Weltbester Teenager. EM-Sieger mit 17.",ribbon:"🏆 WELTKLASSE"},
  {id:'endrick',name:"Endrick",age:18,born:2006,club:"Real Madrid",nation:"Brasilien",flag:"🇧🇷",league:"La Liga",pos:["ST"],positions:"ST",price:0,priceLabel:"Nicht verkäuflich",ca:148,pa:190,attrs:{Pace:88,Finishing:86,Strength:84,Dribbling:82,Technique:80,Passing:68,Jumping:80,Work_Rate:82,Tackling:45,Vision:71},foot:"Rechts",height:"173 cm",weight:"74 kg",contract:"2030",dev:92,emoji:"⚡",sources:["fmscout","youtube"],srcNote:"Real Madrid Stammkraft",note:"Real-Stammkraft. Physische Dominanz.",ribbon:"🇧🇷 TOPTALENT"},
  {id:'rayan-cherki',name:"Rayan Cherki",age:21,born:2003,club:"Bayer Leverkusen",nation:"Frankreich",flag:"🇫🇷",league:"Bundesliga",pos:["CAM","LW"],positions:"CAM, LW, RW",price:15000000,priceLabel:"~15 Mio €",ca:163,pa:187,attrs:{Dribbling:91,Technique:90,Passing:88,Pace:84,Finishing:80,Vision:87,Jumping:64,Strength:68,Work_Rate:76,Tackling:52},foot:"Rechts",height:"174 cm",weight:"66 kg",contract:"2027",dev:87,emoji:"🎨",sources:["fmscout","fminside","fmbase","youtube"],srcNote:"Alle 4 Quellen empfehlen ihn",note:"Lyon→Leverkusen. Technisch überragend.",ribbon:"💎 GEM"},
  {id:'pau-cubarsi',name:"Pau Cubarsí",age:17,born:2007,club:"FC Barcelona",nation:"Spanien",flag:"🇪🇸",league:"La Liga",pos:["CB"],positions:"CB",price:0,priceLabel:"Nicht verkäuflich",ca:145,pa:188,attrs:{Tackling:83,Passing:86,Marking:84,Pace:78,Strength:76,Vision:82,Jumping:82,Work_Rate:80,Dribbling:72,Finishing:38},foot:"Links",height:"184 cm",weight:"78 kg",contract:"2027",dev:93,emoji:"🛡️",sources:["fmscout","youtube"],srcNote:"FM Scout YT: Bester CB-Youngster",note:"Barça-Juwel. Spielaufbau wie Piqué.",ribbon:"💎 GEM"},
  {id:'desire-doue',name:"Désiré Doué",age:19,born:2005,club:"Paris Saint-Germain",nation:"Frankreich",flag:"🇫🇷",league:"Ligue 1",pos:["LW","CAM"],positions:"LW, CAM, RW",price:15000000,priceLabel:"~15 Mio €",ca:155,pa:184,attrs:{Dribbling:88,Pace:89,Technique:87,Finishing:78,Passing:80,Vision:82,Jumping:70,Strength:66,Work_Rate:80,Tackling:48},foot:"Rechts",height:"180 cm",weight:"72 kg",contract:"2029",dev:89,emoji:"🌊",sources:["fmscout","youtube"],srcNote:"Zealand: Top-5 LW/CAM Wonderkid",note:"PSG's bester Transfer 2024.",ribbon:"🔥 HOT"},
  {id:'warren-zaire-emery',name:"Warren Zaïre-Emery",age:19,born:2006,club:"Paris Saint-Germain",nation:"Frankreich",flag:"🇫🇷",league:"Ligue 1",pos:["CM","CDM"],positions:"CM, CDM",price:17000000,priceLabel:"~17 Mio €",ca:158,pa:186,attrs:{Passing:86,Work_Rate:90,Strength:80,Dribbling:82,Pace:79,Tackling:81,Vision:78,Jumping:76,Technique:82,Finishing:60},foot:"Rechts",height:"177 cm",weight:"73 kg",contract:"2029",dev:86,emoji:"⚙️",sources:["fmscout","fmbase"],srcNote:"FM Base: Bester Box-to-Box Wonderkid",note:"PSG & Frankreich Stammkraft.",ribbon:""},
  {id:'vitor-roque',name:"Vitor Roque",age:19,born:2005,club:"Real Betis (Leih)",nation:"Brasilien",flag:"🇧🇷",league:"La Liga",pos:["ST"],positions:"ST",price:8000000,priceLabel:"~8 Mio €",ca:145,pa:181,attrs:{Finishing:82,Strength:85,Dribbling:80,Pace:84,Technique:78,Jumping:80,Work_Rate:82,Passing:64,Tackling:42,Vision:68},foot:"Rechts",height:"176 cm",weight:"75 kg",contract:"Barça 2031",dev:86,emoji:"🦁",sources:["fmscout","fmbase"],srcNote:"FM Base: Günstigster Top-ST",note:"Günstig dank Leihstruktur.",ribbon:"💰 VALUE"},
  {id:'estevcao-willian',name:"Estêvão Willian",age:17,born:2007,club:"Palmeiras",nation:"Brasilien",flag:"🇧🇷",league:"Other",pos:["RW","LW"],positions:"RW, LW",price:0,priceLabel:"Verpflichtet: Chelsea",ca:138,pa:187,attrs:{Dribbling:89,Pace:87,Technique:88,Finishing:78,Passing:76,Vision:80,Jumping:64,Strength:62,Work_Rate:78,Tackling:40},foot:"Links",height:"176 cm",weight:"68 kg",contract:"Chelsea 2025+",dev:94,emoji:"✨",sources:["fmscout","youtube"],srcNote:"Squawka FM: Brasiliens nächster Superstar",note:"Chelsea-Juwel. Brasiliens talentiertester Youngster.",ribbon:"💎 GEM"},
  {id:'mathys-tel',name:"Mathys Tel",age:19,born:2005,club:"Bayern München",nation:"Frankreich",flag:"🇫🇷",league:"Bundesliga",pos:["ST","LW"],positions:"ST, LW, CAM",price:18000000,priceLabel:"~18 Mio €",ca:155,pa:185,attrs:{Pace:90,Dribbling:85,Finishing:82,Technique:84,Passing:74,Jumping:78,Strength:76,Work_Rate:80,Tackling:42,Vision:74},foot:"Links",height:"182 cm",weight:"75 kg",contract:"2029",dev:88,emoji:"🎯",sources:["fmscout","fminside","youtube"],srcNote:"Squawka FM: Bester ST Bundesliga",note:"Massiver Durchbruch 24/25.",ribbon:"🔥 HOT"},
  {id:'bilal-el-khannouss',name:"Bilal El Khannouss",age:20,born:2004,club:"Girona FC",nation:"Marokko",flag:"🇲🇦",league:"La Liga",pos:["CAM","CM"],positions:"CAM, CM",price:11000000,priceLabel:"~11 Mio €",ca:151,pa:180,attrs:{Passing:85,Vision:86,Dribbling:83,Technique:84,Pace:80,Finishing:76,Jumping:66,Strength:68,Work_Rate:82,Tackling:56},foot:"Links",height:"175 cm",weight:"70 kg",contract:"2028",dev:84,emoji:"🎯",sources:["fmscout","fminside"],srcNote:"FMInside Community Pick",note:"Marokko Mittelfeldregisseur.",ribbon:""},
];

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
window.addEventListener('DOMContentLoaded', async()=>{
  injectUploadProgress();
  const cfg=getCfg(); const splash=$('splash'); const status=$('splashStatus');

  // Apply language
  setLang(lang);
  const ls=$('myTacticSel'); if(ls) ls.value=myTactic;
  const langSel=document.querySelector('.lang-sel'); if(langSel) langSel.value=lang;
  updateSlCount();

  if (!cfg) {
    splash.style.opacity='0';
    setTimeout(()=>{splash.style.display='none';},500);
    $('setupOverlay').style.display='flex';
    return;
  }

  const ok=initFirebase();
  const fbDot=$('fbDot'), fbLbl=$('fbLabel');
  if (!ok) {
    if(fbLbl) fbLbl.textContent='Fehler';
    status.textContent='Firebase Fehler — Fallback aktiv';
    setTimeout(()=>{splash.style.opacity='0';setTimeout(()=>{splash.style.display='none';},500);players=FALLBACK;doFilter();updateStats();},2000);
    return;
  }
  if(fbDot) fbDot.classList.add('connected');
  if(fbLbl) fbLbl.textContent='Verbunden';
  status.textContent='Lade Spieler aus Firebase …';

  try {
    const loaded=await loadPlayers();
    setTimeout(async ()=>{
      splash.style.opacity='0';
      setTimeout(()=>{splash.style.display='none';},500);
      if(loaded.length>0){
        players=loaded;
        if($('stTime')) $('stTime').textContent='Firebase';
        ['fms','fmi','fmb','yt'].forEach(s=>setSS(s,'ok'));
        checkForNewPlayers(loaded);
      } else {
        players=FALLBACK;
        setTimeout(()=>toast('💡 Key eintragen → KI-Daten generieren für 30+ Spieler!','var(--surface)','var(--accent)'),800);
      }
      await loadScoutStatuses();
      doFilter();updateStats();updateSlCount();
      updateNotifyBtn();
      syncAuthUI();
      // Auth check
      if (!checkAuth()) return;
    },1500);
  } catch(e) {
    status.textContent='Fehler — Fallback';
    setTimeout(async ()=>{splash.style.opacity='0';setTimeout(()=>{splash.style.display='none';},500);players=FALLBACK;await loadScoutStatuses();doFilter();updateStats();},2000);
  }
});

// ═══════════════════════════════════════════════════════════════
// ✦ NEUE FEATURES: Scout-Status · Heatmap · Radar · Similar
//                  Push-Notifications · PDF Report · Login
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════
// SCOUT STATUS
// ═══════════════════════════════════════
const STATUS_CONFIG = {
  none:        { label:'–',            color:'var(--muted)',   bg:'transparent',                   icon:'–'  },
  watch:       { label:'Beobachten',   color:'#00cfff',        bg:'rgba(0,207,255,.12)',            icon:'👁' },
  interested:  { label:'Interessiert', color:'#f0b429',        bg:'rgba(240,180,41,.12)',           icon:'⭐' },
  offer:       { label:'Angebot',      color:'#20d460',        bg:'rgba(32,212,96,.12)',            icon:'📨' },
  rejected:    { label:'Abgelehnt',    color:'#f03e3e',        bg:'rgba(240,62,62,.12)',            icon:'❌' },
  signed:      { label:'Verpflichtet', color:'#9f6ef5',        bg:'rgba(159,110,245,.12)',          icon:'✅' },
};

// scoutStatuses stored in Firebase collection 'scout_status'
let scoutStatuses = {}; // { playerId: statusKey }

async function loadScoutStatuses() {
  if (!db) { try { scoutStatuses = JSON.parse(localStorage.getItem('fm26_status')||'{}'); } catch(e){} return; }
  try {
    const snap = await getDocs(collection(db, 'scout_status'));
    snap.docs.forEach(d => { scoutStatuses[d.id] = d.data().status || 'none'; });
  } catch(e) {
    try { scoutStatuses = JSON.parse(localStorage.getItem('fm26_status')||'{}'); } catch(e2) {}
  }
}

async function setScoutStatus(pid, status) {
  pid = String(pid);
  scoutStatuses[pid] = status;
  localStorage.setItem('fm26_status', JSON.stringify(scoutStatuses));
  if (db) {
    try { await setDoc(doc(db, 'scout_status', pid), { status, updatedAt: serverTimestamp() }); }
    catch(e) { console.warn('Status save error', e); }
  }
  // Update card badge live
  const badge = document.getElementById(`status-badge-${pid}`);
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.none;
  if (badge) {
    badge.textContent = cfg.icon;
    badge.style.background = cfg.bg;
    badge.style.color = cfg.color;
    badge.style.borderColor = cfg.color+'66';
    badge.title = cfg.label;
  }
  // Update modal status selector
  const sel = $('modal-status-sel');
  if (sel) sel.value = status;
  toast(`Status: ${cfg.label}`, cfg.bg || 'var(--surface)', cfg.color);
}
window.setScoutStatus = setScoutStatus;

function getStatusBadgeHtml(pid) {
  const st = scoutStatuses[String(pid)] || 'none';
  const cfg = STATUS_CONFIG[st];
  if (st === 'none') return `<div class="status-badge" id="status-badge-${pid}" style="opacity:.3">–</div>`;
  return `<div class="status-badge" id="status-badge-${pid}" style="background:${cfg.bg};color:${cfg.color};border-color:${cfg.color}66">${cfg.icon}</div>`;
}

function statusSelectorHtml(pid) {
  const current = scoutStatuses[String(pid)] || 'none';
  return `<div class="status-selector">
    <div class="ss-label">Scout-Status</div>
    <div class="ss-options">
      ${Object.entries(STATUS_CONFIG).filter(([k])=>k!=='none').map(([k,v])=>`
        <button class="ss-opt ${current===k?'active':''}" onclick="setScoutStatus('${pid}','${k}')"
          style="color:${v.color};border-color:${v.color}44;background:${current===k?v.bg:'transparent'}">
          ${v.icon} ${v.label}
        </button>`).join('')}
      <button class="ss-opt" onclick="setScoutStatus('${pid}','none')" style="color:var(--muted);border-color:var(--border)">
        ✕ Zurücksetzen
      </button>
    </div>
  </div>`;
}

// ═══════════════════════════════════════
// POSITIONS HEATMAP
// ═══════════════════════════════════════
// Football pitch SVG with colored zones based on player position
const POSITION_ZONES = {
  GK:  { x:50,  y:92, r:18, label:'Torhüter' },
  CB:  { x:50,  y:75, r:16, label:'Innenverteidiger' },
  LB:  { x:20,  y:72, r:14, label:'Linksverteidiger' },
  RB:  { x:80,  y:72, r:14, label:'Rechtsverteidiger' },
  CDM: { x:50,  y:58, r:15, label:'Defensives Mittelfeld' },
  CM:  { x:50,  y:48, r:15, label:'Zentrales Mittelfeld' },
  CAM: { x:50,  y:36, r:15, label:'Offensives Mittelfeld' },
  LM:  { x:15,  y:48, r:13, label:'Linkes Mittelfeld' },
  RM:  { x:85,  y:48, r:13, label:'Rechtes Mittelfeld' },
  LW:  { x:15,  y:28, r:13, label:'Linksaußen' },
  RW:  { x:85,  y:28, r:13, label:'Rechtsaußen' },
  ST:  { x:50,  y:14, r:16, label:'Stürmer' },
};

function buildHeatmapSvg(p) {
  const mainPos = (p.pos||[])[0] || 'CM';
  const allPos  = p.pos || [mainPos];

  const zones = Object.entries(POSITION_ZONES).map(([key, z]) => {
    const isPrimary   = key === mainPos;
    const isSecondary = allPos.includes(key) && !isPrimary;
    const opacity     = isPrimary ? 0.9 : isSecondary ? 0.55 : 0.08;
    const fill        = isPrimary ? '#00cfff' : isSecondary ? '#9f6ef5' : '#1c2a3f';
    const textCol     = (isPrimary||isSecondary) ? '#fff' : '#4a6582';
    return `
      <circle cx="${z.x}" cy="${z.y}" r="${z.r}" fill="${fill}" opacity="${opacity}"/>
      ${isPrimary ? `<text x="${z.x}" y="${z.y+4}" text-anchor="middle" font-size="9" fill="${textCol}" font-family="monospace" font-weight="bold">${key}</text>` : ''}
    `;
  }).join('');

  return `<svg viewBox="0 0 100 105" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:220px">
    <!-- Pitch background -->
    <rect x="5" y="2" width="90" height="101" rx="4" fill="#0d1a10" stroke="#1e3a22" stroke-width=".8"/>
    <!-- Center circle -->
    <circle cx="50" cy="52" r="12" fill="none" stroke="#1e3a22" stroke-width=".6"/>
    <line x1="5" y1="52" x2="95" y2="52" stroke="#1e3a22" stroke-width=".6"/>
    <!-- Penalty areas -->
    <rect x="22" y="2" width="56" height="18" rx="1" fill="none" stroke="#1e3a22" stroke-width=".6"/>
    <rect x="22" y="85" width="56" height="18" rx="1" fill="none" stroke="#1e3a22" stroke-width=".6"/>
    <!-- Goals -->
    <rect x="38" y="0" width="24" height="4" rx="1" fill="#2a4a2e" stroke="#1e3a22" stroke-width=".5"/>
    <rect x="38" y="101" width="24" height="4" rx="1" fill="#2a4a2e" stroke="#1e3a22" stroke-width=".5"/>
    ${zones}
    <!-- Legend -->
    <circle cx="10" cy="99" r="3" fill="#00cfff" opacity=".9"/>
    <text x="15" y="102" font-size="5.5" fill="#8ab0cc" font-family="monospace">Hauptpos.</text>
    <circle cx="42" cy="99" r="3" fill="#9f6ef5" opacity=".6"/>
    <text x="47" y="102" font-size="5.5" fill="#8ab0cc" font-family="monospace">Alternativ</text>
  </svg>`;
}

// ═══════════════════════════════════════
// SIMILAR PLAYERS (KI)
// ═══════════════════════════════════════
async function loadSimilarPlayers(p) {
  const el = $('similarPlayersSection');
  if (!el) return;
  if (!gk()) {
    el.innerHTML = `<p style="color:var(--muted);font-size:11px">🔑 Groq Key erforderlich für KI-Vorschläge</p>`;
    return;
  }
  el.innerHTML = `<div class="ai-load"><span style="display:inline-block;width:13px;height:13px;border:2px solid var(--border);border-top-color:var(--purple);border-radius:50%;animation:spin .7s linear infinite"></span>&nbsp;KI sucht ähnliche Spieler …</div>`;

  // First check locally
  const localSimilar = findSimilarLocally(p);
  if (localSimilar.length >= 2) {
    renderSimilarPlayers(localSimilar, el, p);
    return;
  }

  // Fallback: ask Groq
  try {
    const txt = await groq([
      { role:'system', content:'FM2026 Scout. Antworte NUR mit JSON-Array. Kein Text davor/danach.' },
      { role:'user', content:`Nenne 4 ähnliche Spieler zu ${p.name} (${p.age}J, ${p.positions}, CA:${p.ca}, PA:${p.pa}, Ablöse:${p.priceLabel}).
Kriterien: ähnliche Position, ähnliches Alter (±3J), möglichst günstiger oder ähnlicher Preis, gute Alternative.
JSON: [{"name":"string","club":"string","age":int,"pos":"string","price":"string","similarity":int,"reason":"string (max 8 Wörter)"}]` }
    ], 'llama-3.3-70b-versatile', 600, 0.5);
    const clean = txt.replace(/```json|```/g,'').trim();
    const parsed = JSON.parse(clean.match(/\[[\s\S]*\]/)?.[0]||'[]');
    renderSimilarPlayers(parsed, el, p, true);
  } catch(e) {
    el.innerHTML = `<p style="color:var(--muted);font-size:11px">Keine ähnlichen Spieler gefunden.</p>`;
  }
}

function findSimilarLocally(p) {
  const mainPos = (p.pos||[])[0];
  return players
    .filter(q => q.id !== p.id && (q.pos||[]).includes(mainPos) && Math.abs((q.age||99)-(p.age||0))<=3)
    .map(q => ({ ...q, similarity: calcSimilarity(p, q), reason: 'Ähnliche Attribute & Position', isLocal: true }))
    .sort((a,b) => b.similarity - a.similarity)
    .slice(0, 4);
}

function calcSimilarity(a, b) {
  const keys = ['Pace','Dribbling','Technique','Finishing','Passing'];
  const diffs = keys.map(k => Math.abs((a.attrs?.[k]||70)-(b.attrs?.[k]||70)));
  const avgDiff = diffs.reduce((s,v)=>s+v,0)/keys.length;
  return Math.max(0, Math.round(100 - avgDiff * 1.5));
}

function renderSimilarPlayers(list, el, basePlayer, fromAI=false) {
  if (!list.length) { el.innerHTML = `<p style="color:var(--muted);font-size:11px">Keine ähnlichen Spieler gefunden.</p>`; return; }
  el.innerHTML = list.map(q => {
    const sim = q.similarity || 75;
    const simCol = sim>=85?'var(--green)':sim>=70?'var(--gold)':'var(--muted)';
    const localP = players.find(x => x.name === q.name);
    return `<div class="similar-item ${localP?'clickable':''}" onclick="${localP?`openM('${localP.id}')`:''}" ${localP?'style="cursor:pointer"':''}>
      <div class="si-ava">${localP ? getAva(localP) : (q.flag||'👤')}</div>
      <div class="si-info">
        <div class="si-name">${q.name}</div>
        <div class="si-sub">${q.club||''} · ${q.age||'?'}J · ${q.pos||q.positions||''}</div>
        <div class="si-reason">${q.reason||''}</div>
      </div>
      <div class="si-right">
        <div class="si-sim" style="color:${simCol}">${sim}%</div>
        <div class="si-price">${q.price||q.priceLabel||'—'}</div>
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════
// PUSH NOTIFICATIONS (Web Push via Service Worker)
// ═══════════════════════════════════════
let notifyEnabled = localStorage.getItem('fm26_notify') === '1';

async function requestNotifyPermission() {
  if (!('Notification' in window)) {
    toast('Push-Benachrichtigungen nicht unterstützt','var(--orange)','#000'); return;
  }
  if (Notification.permission === 'granted') {
    enableNotifications(); return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') { enableNotifications(); }
  else { toast('Benachrichtigungen verweigert','var(--red)','#fff'); }
}
window.requestNotifyPermission = requestNotifyPermission;

function enableNotifications() {
  notifyEnabled = true;
  localStorage.setItem('fm26_notify','1');
  updateNotifyBtn();
  toast('🔔 Benachrichtigungen aktiviert!','var(--green)','#000');
  // Store last player count for change detection
  localStorage.setItem('fm26_lastcount', String(players.length));
}

function disableNotifications() {
  notifyEnabled = false;
  localStorage.setItem('fm26_notify','0');
  updateNotifyBtn();
  toast('🔕 Benachrichtigungen deaktiviert','var(--muted)','var(--text)');
}
window.disableNotifications = disableNotifications;

function updateNotifyBtn() {
  const btn = $('notifyBtn');
  if (!btn) return;
  btn.textContent = notifyEnabled ? '🔔 An' : '🔕 Aus';
  btn.style.color = notifyEnabled ? 'var(--green)' : 'var(--muted)';
  btn.style.borderColor = notifyEnabled ? 'rgba(32,212,96,.4)' : 'var(--border)';
}

function checkForNewPlayers(newList) {
  if (!notifyEnabled || Notification.permission !== 'granted') return;
  const lastCount = parseInt(localStorage.getItem('fm26_lastcount')||'0');
  if (newList.length > lastCount && lastCount > 0) {
    const diff = newList.length - lastCount;
    new Notification('FM2026 Scout 🔔', {
      body: `${diff} neue Wonderkid${diff>1?'s':''} in der Datenbank!`,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text y="28" font-size="28">⚽</text></svg>'
    });
  }
  localStorage.setItem('fm26_lastcount', String(newList.length));
}

// ═══════════════════════════════════════
// SCOUT REPORT PDF (per player)
// ═══════════════════════════════════════
async function printScoutReport(pid) {
  const p = players.find(x => String(x.id) === String(pid));
  if (!p) return;
  const roles = getBestRoles(p);
  const cf = getClubFit(p);
  const tacFits = getTacticFit(p);
  const st = scoutStatuses[String(pid)] || 'none';
  const stCfg = STATUS_CONFIG[st];

  // Generate AI report if key available
  let aiReport = p.note || '—';
  if (gk()) {
    try {
      aiReport = await groq([
        { role:'system', content:'FM2026 Scout. 5-6 Sätze. Professioneller Bericht. Kein Markdown.' },
        { role:'user', content:`Vollständiger Scout-Report für ${p.name} (${p.age}J, ${p.club}, ${p.positions}). CA:${p.ca}, PA:${p.pa}, Ablöse:${p.priceLabel}. Beste Rollen: ${roles.map(r=>r.role).join(', ')}. Club-Fit: ${cf.score}%. Status: ${stCfg.label}. Empfehlung?` }
      ], 'llama-3.3-70b-versatile', 400, 0.6);
    } catch(e) {}
  }

  const attrRows = Object.entries(p.attrs||{}).map(([k,v]) => {
    const bar = '█'.repeat(Math.round(v/10)) + '░'.repeat(10-Math.round(v/10));
    return `<tr><td>${k.replace('_',' ')}</td><td style="font-family:monospace;letter-spacing:-1px;color:${v>=85?'#20a060':v>=74?'#c08800':'#888'}">${bar}</td><td style="font-weight:bold;color:${v>=85?'#20a060':v>=74?'#c08800':'#555'}">${v}</td></tr>`;
  }).join('');

  const tacRows = tacFits.slice(0,4).map(f =>
    `<tr><td>${f.label}</td><td style="color:${f.score>=82?'#20a060':f.score>=72?'#c08800':'#888'}">${f.score}%</td></tr>`
  ).join('');

  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Scout Report — ${p.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;background:#fff;padding:32px;max-width:820px;margin:0 auto}
  .header{display:flex;align-items:flex-start;gap:24px;margin-bottom:28px;padding-bottom:20px;border-bottom:3px solid #003366}
  .ava{width:90px;height:90px;border-radius:12px;background:#e8f0fe;display:flex;align-items:center;justify-content:center;font-size:42px;flex-shrink:0;overflow:hidden}
  .ava img{width:100%;height:100%;object-fit:cover}
  h1{font-size:28px;letter-spacing:1px;color:#003366;margin-bottom:4px}
  .sub{font-size:13px;color:#666;margin-bottom:8px}
  .status-chip{display:inline-block;padding:3px 12px;border-radius:12px;font-size:11px;font-weight:700;background:${stCfg.bg||'#eee'};color:${stCfg.color||'#333'};border:1px solid ${stCfg.color||'#ccc'}66}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:22px}
  .section{background:#f8faff;border:1px solid #dde;border-radius:10px;padding:16px}
  .section h3{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#003366;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #dde}
  table{width:100%;border-collapse:collapse;font-size:12px}
  td{padding:5px 6px;border-bottom:1px solid #eee}
  td:first-child{color:#555;width:50%}
  .ai-section{background:linear-gradient(135deg,#f0f6ff,#f5f0ff);border:1px solid #c0d0ee;border-radius:10px;padding:16px;margin-bottom:20px}
  .ai-section h3{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#003366;margin-bottom:10px}
  .ai-section p{font-size:13px;line-height:1.7;color:#334}
  .roles{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
  .role-chip{background:#e8f0fe;color:#003366;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600}
  .footer{margin-top:24px;padding-top:12px;border-top:1px solid #dde;font-size:10px;color:#aaa;display:flex;justify-content:space-between}
  @media print{body{padding:16px}@page{margin:15mm}}
</style></head><body>
<div class="header">
  <div class="ava">${p.imgUrl?`<img src="${p.imgUrl}" alt="">`:(p.emoji||'⚽')}</div>
  <div>
    <h1>${p.name}</h1>
    <div class="sub">${p.flag||''} ${p.nation} &nbsp;·&nbsp; ${p.club} &nbsp;·&nbsp; ${p.league}</div>
    <div class="sub">${p.positions||''} &nbsp;·&nbsp; ${p.age} Jahre &nbsp;·&nbsp; ${p.foot||'—'} &nbsp;·&nbsp; ${p.height||'—'}</div>
    <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
      <span class="status-chip">${stCfg.icon} ${stCfg.label}</span>
      <span style="font-size:12px;color:#666">Ablöse: <strong>${p.priceLabel||'—'}</strong></span>
      <span style="font-size:12px;color:#666">Vertrag: <strong>${p.contract||'—'}</strong></span>
    </div>
  </div>
</div>
<div class="grid2">
  <div class="section">
    <h3>FM2026 Werte</h3>
    <table>
      <tr><td>Current Ability (CA)</td><td style="color:#003366;font-weight:bold">${p.ca||'—'}</td></tr>
      <tr><td>Potential Ability (PA)</td><td style="color:#c08800;font-weight:bold">${p.pa||'—'}</td></tr>
      <tr><td>Entwicklungs-Index</td><td>${p.dev||'—'}%</td></tr>
      <tr><td>Club-Fit (${cf.label})</td><td style="color:${cf.score>=82?'#20a060':cf.score>=72?'#c08800':'#888'};font-weight:bold">${cf.score}%</td></tr>
      <tr><td>Empfohlen von</td><td style="font-size:11px">${p.srcNote||p.sources?.join(', ')||'—'}</td></tr>
    </table>
  </div>
  <div class="section">
    <h3>Taktik-Kompatibilität</h3>
    <table>${tacRows}</table>
  </div>
</div>
<div class="section" style="margin-bottom:20px">
  <h3>Schlüssel-Attribute</h3>
  <table>${attrRows}</table>
</div>
<div class="section" style="margin-bottom:20px">
  <h3>Beste FM-Rollen</h3>
  <div class="roles">${roles.map(r=>`<span class="role-chip">${r.role} (${r.score})</span>`).join('')}</div>
</div>
<div class="ai-section">
  <h3>✦ KI Scout-Analyse</h3>
  <p>${aiReport}</p>
</div>
<div class="footer">
  <span>FM2026 Wonderkid Scout · Generiert am ${new Date().toLocaleString('de-CH')}</span>
  <span>${p.name} · CA ${p.ca} · PA ${p.pa}</span>
</div>
</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 600);
}
window.printScoutReport = printScoutReport;

// ═══════════════════════════════════════
// LOGIN / PASSWORTSCHUTZ
// ═══════════════════════════════════════
const LOGIN_KEY = 'fm26_auth';
let isAuthenticated = false;

function checkAuth() {
  const stored = localStorage.getItem(LOGIN_KEY);
  const cfg = getCfg();
  if (!cfg?.appPassword) { isAuthenticated = true; return true; } // No password set
  if (stored === btoa(cfg.appPassword)) { isAuthenticated = true; return true; }
  showLoginScreen(); return false;
}

function showLoginScreen() {
  const existing = $('loginScreen');
  if (existing) return;
  const div = document.createElement('div');
  div.id = 'loginScreen';
  div.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:4000;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px';
  div.innerHTML = `
    <div style="font-family:var(--fh);font-size:42px;letter-spacing:5px;color:var(--accent)">FM2026 SCOUT</div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px;width:320px;display:flex;flex-direction:column;gap:14px">
      <div style="font-family:var(--fm);font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1.5px">🔒 Passwortschutz</div>
      <input type="password" id="loginPw" placeholder="Passwort eingeben …" style="background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px;color:var(--text);font-family:var(--fm);font-size:14px;outline:none;width:100%"
        onkeydown="if(event.key==='Enter')doLogin()">
      <button onclick="doLogin()" style="background:linear-gradient(135deg,rgba(0,207,255,.18),rgba(0,100,255,.14));border:1px solid rgba(0,207,255,.35);color:var(--accent);padding:12px;border-radius:9px;font-size:14px;font-family:var(--fb);font-weight:700;cursor:pointer">
        → Einloggen
      </button>
      <div id="loginErr" style="color:var(--red);font-size:11px;font-family:var(--fm);display:none;text-align:center">⚠ Falsches Passwort</div>
    </div>`;
  document.body.appendChild(div);
  setTimeout(() => $('loginPw')?.focus(), 100);
}

function doLogin() {
  const pw = $('loginPw')?.value || '';
  const cfg = getCfg();
  if (!cfg?.appPassword || btoa(pw) === btoa(cfg.appPassword)) {
    localStorage.setItem(LOGIN_KEY, btoa(pw));
    isAuthenticated = true;
    const ls = $('loginScreen'); if (ls) ls.remove();
    toast('✓ Eingeloggt!','var(--green)','#000');
  } else {
    const err = $('loginErr'); if (err) err.style.display = 'block';
    setTimeout(() => { if (err) err.style.display='none'; }, 2000);
  }
}
window.doLogin = doLogin;

function logout() {
  localStorage.removeItem(LOGIN_KEY);
  isAuthenticated = false;
  showLoginScreen();
}
window.logout = logout;

// ═══════════════════════════════════════
// PATCH: Extend openM with new sections
// ═══════════════════════════════════════
const _origOpenM = window.openM;
window.openM = function(id) {
  _origOpenM(id);
  const p = players.find(x => String(x.id) === String(id));
  if (!p) return;

  // Inject new sections after AI block
  const mbody = $('mbody');
  if (!mbody) return;

  // 1. Scout Status
  const statusDiv = document.createElement('div');
  statusDiv.id = 'modal-status-section';
  statusDiv.innerHTML = statusSelectorHtml(p.id);
  mbody.insertBefore(statusDiv, mbody.firstChild);

  // 2. Heatmap + Similar (append after src-chips)
  const extraDiv = document.createElement('div');
  extraDiv.innerHTML = `
    <div style="display:grid;grid-template-columns:200px 1fr;gap:14px;margin-top:14px;margin-bottom:14px">
      <div>
        <div class="msec" style="margin-bottom:8px"><h3>🗺 Positions-Heatmap</h3></div>
        <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px;display:flex;justify-content:center">
          ${buildHeatmapSvg(p)}
        </div>
      </div>
      <div>
        <div class="msec" style="margin-bottom:8px"><h3>🔗 Ähnliche Spieler (KI)</h3></div>
        <div id="similarPlayersSection" class="similar-list"></div>
      </div>
    </div>
    <div style="display:flex;justify-content:center;margin-bottom:14px">
      <button onclick="printScoutReport('${p.id}')" class="act-btn" style="gap:6px;display:flex;align-items:center">
        📄 Scout-Report PDF drucken
      </button>
    </div>`;
  mbody.appendChild(extraDiv);

  // Load similar players async
  loadSimilarPlayers(p);
};

// ═══════════════════════════════════════
// PATCH: Extend buildCard with status badge
// ═══════════════════════════════════════
const _origBuildCard = window.buildCard || buildCard;
function buildCardWithStatus(p, context) {
  const base = buildCard(p, context);
  const badge = getStatusBadgeHtml(p.id);
  // Insert badge after ribbon
  return base.replace('</div>\n    <div class="ct">', `</div>\n    ${badge}\n    <div class="ct">`);
}

// Override renderGrid to use patched buildCard
const _origRenderGrid = renderGrid;
function renderGridPatched(list) {
  const g=$('grid'),e=$('emptyEl');
  if(!list.length){if(g)g.innerHTML='';if(e)e.style.display='block';return;}
  if(e)e.style.display='none';
  if(g)g.innerHTML=list.map(p=>buildCardWithStatus(p)).join('');
}
// Override global
window.renderGridPatched = renderGridPatched;

// ═══════════════════════════════════════
// PATCH: extend init to load statuses + check auth + notify
// ═══════════════════════════════════════
const _origInit = window.addEventListener;
document.addEventListener('fm26-ready', async () => {
  await loadScoutStatuses();
  updateNotifyBtn();
  // Re-render with status badges
  renderGridPatched(players.slice(0,players.length));
});

// Dispatch after players loaded (monkey-patch doFilter)
const _df = doFilter;
window.doFilter = function() {
  _df();
  // Also patch shortlist render
};

// ── Extended saveConfig with password support ──
function saveConfigWithPw() {
  const pw = document.getElementById('cfg-appPassword')?.value?.trim() || '';
  // Read existing config first to preserve it
  const existing = getCfg() || {};
  const cfg = {
    ...existing,
    apiKey:        document.getElementById('cfg-apiKey')?.value?.trim() || existing.apiKey || '',
    authDomain:    document.getElementById('cfg-authDomain')?.value?.trim() || existing.authDomain || '',
    projectId:     document.getElementById('cfg-projectId')?.value?.trim() || existing.projectId || '',
    storageBucket: document.getElementById('cfg-storageBucket')?.value?.trim() || existing.storageBucket || '',
    appId:         document.getElementById('cfg-appId')?.value?.trim() || existing.appId || '',
  };
  if (pw) cfg.appPassword = pw;
  const groq = document.getElementById('cfg-groqKey')?.value?.trim() || '';
  if (!cfg.apiKey || !cfg.projectId) { toast('⚠ API Key + Project ID erforderlich','var(--red)','#fff'); return; }
  localStorage.setItem('fm26_config', JSON.stringify(cfg));
  if (groq) localStorage.setItem('groq_k', groq);
  if (pw) { localStorage.setItem('fm26_auth', btoa(pw)); }
  document.getElementById('setupOverlay').style.display = 'none';
  toast('✓ Gespeichert!','var(--green)','#000');
  setTimeout(() => location.reload(), 1200);
}
window.saveConfigWithPw = saveConfigWithPw;

// ── Show logout btn when password is set ──
function syncAuthUI() {
  const cfg = getCfg();
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.style.display = cfg?.appPassword ? 'flex' : 'none';
}
