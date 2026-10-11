const $=i=>document.getElementById(i);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const DEF={sheets:'3210x2250, 2250x1605',kerf:3,bl:6000,ded:12};
let orders={},settings={...DEF},db=null,gPlan=[],tPlan=[];
const toast=m=>{const t=$('toast');t.textContent=m;t.style.display='block';setTimeout(()=>t.style.display='none',2200)};

/* ---------- Veri katmanı: Firebase (canlı) ya da yerel ---------- */
const cfg=window.FIREBASE_CONFIG||{};
function localSave(){localStorage.setItem('cam_local',JSON.stringify({orders,settings}))}
function initStore(){
  if(cfg.databaseURL){
    firebase.initializeApp(cfg);
    firebase.auth().signInAnonymously().then(()=>{
      db=firebase.database().ref();
      db.child('orders').on('value',s=>{orders=s.val()||{};render()});
      db.child('settings').on('value',s=>{settings={...DEF,...(s.val()||{})};fillSettings();render()});
      firebase.database().ref('.info/connected').on('value',s=>setSync(s.val()?'☁️ Canlı':'⚠️ Bağlantı yok',s.val()));
    }).catch(e=>{setSync('⚠️ Giriş hatası',false);console.error(e)});
  }else{
    try{const d=JSON.parse(localStorage.getItem('cam_local')||'{}');orders=d.orders||{};settings={...DEF,...(d.settings||{})}}catch(e){}
    setSync('📴 Yerel mod',false);fillSettings();render();
  }
}
function setSync(t,ok){const s=$('sync');s.textContent=t;s.className='admin-badge '+(ok?'role-admin':'role-guest')}
function saveOrder(o){if(db)db.child('orders/'+o.id).set(o);else{orders[o.id]=o;localSave();render()}}
function delOrder(id){if(db)db.child('orders/'+id).remove();else{delete orders[id];localSave();render()}}
function saveSettings(s){if(db)db.child('settings').set(s);else{settings=s;localSave();render()}}

/* ---------- Sekmeler ---------- */
document.querySelectorAll('.tab-btn').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tab-btn').forEach(x=>x.classList.toggle('active',x===b));
  document.querySelectorAll('.tab-content').forEach(x=>x.classList.toggle('active',x.id==='tab-'+b.dataset.t));
});

/* ---------- Siparişler ---------- */
$('add').onclick=()=>{
  const w=+$('f-w').value,h=+$('f-h').value,q=+$('f-q').value;
  if(!(w>0&&h>0&&q>0))return toast('En, boy ve adet girin');
  const no=Math.max(0,...Object.values(orders).map(o=>o.no||0))+1,id='o'+Date.now();
  saveOrder({id,no,m:$('f-m').value.trim(),a:$('f-a').value.trim(),w,h,q,t:+$('f-t').value,c:+$('f-c').value,camDone:false,citaDone:false,ts:Date.now()});
  ['f-w','f-h'].forEach(i=>$(i).value='');$('f-q').value=1;toast('Sipariş #'+no+' eklendi');
};
$('flt').onchange=render;
window.tog=(id,k)=>{const o=orders[id];o[k]=!o[k];saveOrder(o)};
window.del=id=>{if(confirm('Sipariş silinsin mi?'))delOrder(id)};
const list=()=>Object.values(orders).sort((a,b)=>(a.no||0)-(b.no||0));
function renderOrders(){
  const f=$('flt').value,rows=list().filter(o=>f==='hepsi'||!o.camDone||!o.citaDone);
  $('olist').innerHTML='<tr><th>No</th><th>Müşteri / Apartman</th><th>Ölçü</th><th>Adet</th><th>Cam</th><th>Çıta</th><th>Durum</th><th></th></tr>'+
  (rows.map(o=>`<tr><td>#${o.no}</td><td>${esc(o.m)}<br><span class="mu">${esc(o.a)}</span></td><td>${o.w}×${o.h}</td><td>${o.q}</td><td>${o.t} mm</td><td>${o.c} mm</td>
  <td><span class="pill ${o.camDone?'d':''}" onclick="tog('${o.id}','camDone')">Cam ${o.camDone?'✔':'…'}</span> <span class="pill ${o.citaDone?'d':''}" onclick="tog('${o.id}','citaDone')">Çıta ${o.citaDone?'✔':'…'}</span></td>
  <td><button class="btn btn-danger btn-sm" onclick="del('${o.id}')">🗑</button></td></tr>`).join('')||'<tr><td colspan="8" class="mu">Sipariş yok.</td></tr>');
}

/* ---------- Cam kesim motoru (şerit/guillotine yerleşim) ---------- */
function pack(ps,SW,SH,k){
  const sheets=[],bad=[],items=[];
  ps.forEach(p=>{const a=Math.max(p.w,p.h),b=Math.min(p.w,p.h);
    if(a<=SW&&b<=SH)items.push({...p,a,b});else if(b<=SW&&a<=SH)items.push({...p,a:b,b:a});else bad.push(p)});
  items.sort((x,y)=>y.b-x.b||y.a-x.a);
  items.forEach(p=>{const pw=p.a+k,ph=p.b+k;let ok=false;
    for(const s of sheets){
      for(const sh of s.sh)if(ph<=sh.h&&sh.x+pw<=SW+k){s.p.push({...p,x:sh.x,y:sh.y});sh.items.push(p);sh.x+=pw;ok=true;break}
      if(ok)break;
      if(s.y+ph<=SH+k){const sh={y:s.y,h:ph,x:pw,items:[p]};s.sh.push(sh);s.p.push({...p,x:0,y:s.y});s.y+=ph;ok=true;break}}
    if(!ok)sheets.push({y:ph,sh:[{y:0,h:ph,x:pw,items:[p]}],p:[{...p,x:0,y:0}]})});
  return{sheets,bad};
}
function planGlass(){
  const k=+settings.kerf||0,sizes=String(settings.sheets).split(',').map(s=>s.trim().split(/x|×/i).map(Number)).filter(s=>s[0]>0&&s[1]>0).map(([a,b])=>[Math.max(a,b),Math.min(a,b)]);
  const gr={};list().filter(o=>!o.camDone).forEach(o=>{for(let i=0;i<o.q*2;i++)(gr[o.t]=gr[o.t]||[]).push({w:o.w,h:o.h,id:o.id,n:o.no})});
  return Object.keys(gr).map(t=>{let best=null;
    sizes.forEach(([SW,SH])=>{const r=pack(gr[t],SW,SH,k),cost=r.sheets.length*SW*SH;
      if(!best||r.bad.length<best.bad.length||(r.bad.length===best.bad.length&&cost<best.cost))best={...r,SW,SH,cost}});
    const area=best.sheets.reduce((s,x)=>s+x.p.reduce((u,p)=>u+p.a*p.b,0),0);
    return{t,...best,pcs:gr[t].length,eff:best.sheets.length?100*area/best.cost:0};
  });
}
function renderGlass(){
  gPlan=planGlass();let out='';
  gPlan.forEach(g=>{
    out+=`<div class="box"><h3>${g.t} mm cam — ${g.sheets.length} levha (${g.SW}×${g.SH})</h3><p class="mu">${g.pcs} parça · verim %${g.eff.toFixed(1)} · en uygun levha ölçüsü otomatik seçildi</p>`;
    if(g.bad.length)out+=`<p class="err">Hiçbir levhaya sığmayan parça: ${g.bad.map(p=>p.w+'×'+p.h+' (#'+p.n+')').join(', ')}</p>`;
    g.sheets.forEach((s,i)=>{const fs=g.SW/50;
      out+=`<p><b>Levha ${i+1}</b></p><svg class="pl" viewBox="0 0 ${g.SW} ${g.SH}"><rect width="${g.SW}" height="${g.SH}" fill="none" stroke="currentColor" stroke-width="4"/>`+
      s.p.map(p=>`<rect x="${p.x}" y="${p.y}" width="${p.a}" height="${p.b}" fill="#BFE3F2" stroke="#0B6E99" stroke-width="3"/><text x="${p.x+p.a/2}" y="${p.y+p.b/2}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" fill="#14202b">${p.a}×${p.b} #${p.n}</text>`).join('')+'</svg>'+
      s.sh.map((sh,j)=>`<div class="ins"><b>${j+1}. şerit</b> (${sh.items[0].b} mm yükseklikte kes): ${sh.items.map(p=>p.a+'×'+p.b+' <span class="mu">#'+p.n+'</span>').join(' · ')}</div>`).join('')});
    out+='</div>'});
  $('o-cam').innerHTML=out||'<div class="box mu">Kesilecek cam yok.</div>';
}

/* ---------- Çıta kesim motoru ---------- */
function planCita(){
  const L=+settings.bl,k=+settings.kerf||0,d=+settings.ded||0,gr={};
  list().filter(o=>!o.citaDone).forEach(o=>{for(let j=0;j<o.q;j++){const a=o.w-d,b=o.h-d;[a,a,b,b].forEach(v=>(gr[o.c]=gr[o.c]||[]).push({v,id:o.id,n:o.no}))}});
  return Object.keys(gr).sort((a,b)=>a-b).map(c=>{const ps=gr[c].sort((x,y)=>y.v-x.v),bars=[];
    ps.forEach(p=>{let b=bars.find(b=>b.u+p.v+k<=L+k);if(!b){b={u:0,p:[]};bars.push(b)}b.p.push(p);b.u+=p.v+k});
    bars.forEach(b=>b.fire=L-b.p.reduce((s,p)=>s+p.v,0)-(b.p.length-1)*k);
    const tot=ps.reduce((s,p)=>s+p.v,0);return{c,bars,L,tot,eff:100*tot/(bars.length*L)}});
}
function renderCita(){
  tPlan=planCita();let out='';
  tPlan.forEach(g=>{out+=`<div class="box"><h3>${g.c} mm çıta — ${g.bars.length} adet ${g.L} mm boy</h3><p class="mu">Toplam ${g.tot} mm · verim %${g.eff.toFixed(1)}</p>`;
    g.bars.forEach((b,i)=>{out+=`<div class="ins"><b>Çıta ${i+1}:</b> ${b.p.map(p=>p.v+' <span class="mu">#'+p.n+'</span>').join(' + ')} · fire ${b.fire} mm</div><div class="bar">`+
      b.p.map(p=>`<div style="width:${100*p.v/g.L}%">${p.v}</div>`).join('')+`<div class="wa" style="width:${Math.max(0,100*b.fire/g.L)}%"></div></div>`});
    out+='</div>'});
  $('o-cita').innerHTML=out||'<div class="box mu">Kesilecek çıta yok.</div>';
}

/* ---------- Kesildi işaretle & Excel ---------- */
function markDone(plan,key,ids){
  if(!ids.size)return toast('Plan boş');
  if(!confirm(ids.size+' sipariş kesildi olarak işaretlensin mi?'))return;
  ids.forEach(id=>{const o=orders[id];if(o){o[key]=true;saveOrder(o)}});toast('İşaretlendi');
}
$('dc').onclick=()=>markDone(gPlan,'camDone',new Set(gPlan.flatMap(g=>g.sheets.flatMap(s=>s.p.map(p=>p.id)))));
$('dt').onclick=()=>markDone(tPlan,'citaDone',new Set(tPlan.flatMap(g=>g.bars.flatMap(b=>b.p.map(p=>p.id)))));
$('rc').onclick=$('rt').onclick=()=>{render();toast('Plan yenilendi')};
const who=id=>{const o=orders[id]||{};return[o.m||'',o.a||'']};
function xl(rows,name){const ws=XLSX.utils.aoa_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Plan');XLSX.writeFile(wb,name+'.xlsx')}
$('xc').onclick=()=>{const r=[['Cam mm','Levha','Levha ölçüsü','Sipariş','Müşteri','Apartman','En','Boy','Şerit y.']];
  gPlan.forEach(g=>g.sheets.forEach((s,i)=>s.p.forEach(p=>r.push([g.t,i+1,g.SW+'x'+g.SH,'#'+p.n,...who(p.id),p.a,p.b,p.y]))));xl(r,'cam-kesim')};
$('xt').onclick=()=>{const r=[['Çıta mm','Çıta no','Parça (mm)','Sipariş','Müşteri','Apartman','Fire']];
  tPlan.forEach(g=>g.bars.forEach((b,i)=>b.p.forEach(p=>r.push([g.c,i+1,p.v,'#'+p.n,...who(p.id),b.fire]))));xl(r,'cita-kesim')};

/* ---------- Ayarlar ---------- */
function fillSettings(){$('s-sheets').value=settings.sheets;$('s-kerf').value=settings.kerf;$('s-bl').value=settings.bl;$('s-ded').value=settings.ded}
$('ssave').onclick=()=>{saveSettings({sheets:$('s-sheets').value,kerf:+$('s-kerf').value,bl:+$('s-bl').value,ded:+$('s-ded').value});toast('Kaydedildi')};
function render(){renderOrders();renderGlass();renderCita()}
initStore();
