/**
 * app.js — WeddingLedger v3.1
 * Equal-height vendor cards, collapsible payment history,
 * clean due date badges, notification bell, currency, upgrade
 */

const ICONS = ['💒','🌸','📸','🎥','💐','🎵','💎','💄','💇','👗','🥂','🍰','🚗','✈️','🏨','📋','📝','💌','🎪','🎭','🕯️','🌹','👰','🤵'];
const FREE_VENDOR_LIMIT = 5;

const DEFAULT_VENDORS = [
  {category:'Wedding Planner',icon:'📋'},{category:'Hotel / Venue',icon:'🏨'},
  {category:'Florist',icon:'💐'},{category:'Band / DJ',icon:'🎵'},
  {category:'Makeup Artist',icon:'💄'},{category:'Hairdresser',icon:'💇'},
  {category:'Jewelleries',icon:'💎'},{category:'Photographer',icon:'📸'},
  {category:'Videographer',icon:'🎥'},{category:'Invitation Cards',icon:'💌'},
  {category:'Welcome Cards',icon:'📝'},{category:'Catering',icon:'🥂'},
  {category:'Wedding Cake',icon:'🍰'},{category:'Transport',icon:'🚗'},
];

const DEFAULT_TASKS = [
  'Book venue & confirm date','Finalize guest list','Send invitations',
  'Book photographer & videographer','Choose wedding dress & suit','Plan honeymoon',
  'Arrange hotel accommodation for guests','Select menu with caterer',
  'Book makeup artist & hairdresser','Order wedding cake',
  'Choose floral arrangements','Finalise seating plan','Confirm all vendor bookings',
];

const CURRENCIES = {
  LKR:{ symbol:'LKR', locale:'en-LK', rate:1,      name:'Sri Lankan Rupee' },
  GBP:{ symbol:'£',   locale:'en-GB', rate:0.0024, name:'British Pounds'   },
  EUR:{ symbol:'€',   locale:'de-DE', rate:0.0028, name:'Euro'             },
  USD:{ symbol:'$',   locale:'en-US', rate:0.0031, name:'US Dollar'        },
};

// ─── STATE ───────────────────────────────────────────────────────────────────
let vendors=[], payments=[], tasks=[];
let notes='', spendLimit=0;
let shareToken=null, shareEnabled=false;
let sharePermissions={vendors:true,dueDates:true,budget:true,checklist:false,notes:false};
let selectedIcon='💒', activeCurrency='LKR', isPro=false;
let activePaymentVendorId=null, activeEditVendorId=null;
let userId=null, accessToken=null, profile=null;
let weddingDate=new Date('2027-02-11T09:00:00');

// ─── INIT ────────────────────────────────────────────────────────────────────
async function init() {
  userId=localStorage.getItem('wl_uid');
  accessToken=localStorage.getItem('wl_token');
  if (!userId||!accessToken) { window.location.href='login.html'; return; }
  renderIconSelector(); startCountdown(); initCurrencyUI();
  try {
    await loadProfile();
    await Promise.all([loadVendors(),loadPayments(),loadTasks(),loadSettings()]);
  } catch(e) {
    console.error(e);
    if (e.message&&e.message.includes('JWT')) { doLogout(); return; }
    showToast('Error loading data', true);
  }
}

function doLogout() {
  localStorage.removeItem('wl_token'); localStorage.removeItem('wl_uid');
  window.location.href='login.html';
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────
async function loadProfile() {
  const rows=await DB.query(`profiles?user_id=eq.${userId}&select=*`,accessToken);
  if (rows&&rows.length) {
    profile=rows[0]; isPro=profile.is_pro===true;
    const n1=profile.name1||'', n2=profile.name2||'';
    const el=document.getElementById('coupleNames');
    if (el&&(n1||n2)) el.textContent=n1&&n2?`${n1} & ${n2}`:n1||n2;
    const hero=document.getElementById('coupleHero');
    if (hero&&(n1||n2)) {
      const wdStr=profile.wedding_date?formatDateLong(profile.wedding_date):'';
      hero.innerHTML=`<div class="couple-hero">
        <div class="couple-hero-sparkle">✦</div>
        <div class="couple-hero-tag">💍 Your Wedding Budget</div>
        <div class="couple-hero-names">
          <span class="hero-name1">${esc(n1)}</span>
          ${n2?`<span class="hero-amp"> &amp; </span><span class="hero-name2">${esc(n2)}</span>`:''}
        </div>
        ${wdStr?`<div class="couple-hero-date">📅 ${wdStr}</div>`:''}
        <div class="couple-hero-divider"><span>✦</span></div>
      </div>`;
    }
    // Also update mobile nav names
    const mobileNames=document.getElementById('mobileNavNames');
    if (mobileNames&&(n1||n2)) mobileNames.textContent=n1&&n2?`${n1} & ${n2}`:n1||n2;
    if (profile.wedding_date) weddingDate=new Date(profile.wedding_date+'T09:00:00');
    updateProBadge();
  }
}

function updateProBadge() {
  const badge=isPro
    ?'<span class="pro-badge">✨ Pro</span>'
    :'<button class="upgrade-small-btn" onclick="openUpgradeModal()">⬆ Upgrade</button>';
  const b=document.getElementById('proBadge'); if(b) b.innerHTML=badge;
  const mb=document.getElementById('mobileProBadge'); if(mb) mb.innerHTML=badge;
}

// ─── LOAD DATA ───────────────────────────────────────────────────────────────
async function loadVendors() {
  vendors=await DB.query(`vendors?user_id=eq.${userId}&order=created_at.asc`,accessToken);
  if (!vendors.length) {
    const list=isPro?DEFAULT_VENDORS:DEFAULT_VENDORS.slice(0,FREE_VENDOR_LIMIT);
    for (const v of list) {
      const r=await DB.post('vendors',{user_id:userId,category:v.category,icon:v.icon,name:'',total_cost:0,notes:'',due_date:null,due_amount:null,due_note:''},accessToken);
      vendors.push(r[0]);
    }
  }
  renderVendors(); updateStats(); updateVendorLimitUI();
}

async function loadPayments() {
  payments=await DB.query(`payments?user_id=eq.${userId}&order=payment_date.asc`,accessToken);
  renderVendors(); updateStats(); renderNotifications();
}

async function loadTasks() {
  tasks=await DB.query(`tasks?user_id=eq.${userId}&order=created_at.asc`,accessToken);
  if (!tasks.length) {
    for (const text of DEFAULT_TASKS) {
      const r=await DB.post('tasks',{user_id:userId,text,done:false},accessToken);
      tasks.push(r[0]);
    }
  }
  renderTasks();
}

async function loadSettings() {
  const rows=await DB.query(`settings?user_id=eq.${userId}`,accessToken);
  rows.forEach(r=>{
    if(r.key==='spend_limit'){spendLimit=parseFloat(r.value)||0;const el=document.getElementById('spendLimit');if(el)el.value=spendLimit||'';}
    if(r.key==='wedding_notes'){notes=r.value;const el=document.getElementById('weddingNotes');if(el)el.value=notes;}
    if(r.key==='share_token') shareToken=r.value;
    if(r.key==='share_enabled') shareEnabled=r.value==='true';
    if(r.key==='share_permissions'){try{sharePermissions=JSON.parse(r.value);}catch(e){}}
    if(r.key==='currency'){activeCurrency=r.value||'LKR';setCurrencyUI(activeCurrency);}
    if(r.key==='vendor_limit'){
      // Admin-assigned custom vendor limit
      const lim=parseInt(r.value)||0;
      if(lim>0&&profile){profile.custom_vendor_limit=lim;}
    }
  });
  updateStats();updateVendorLimitUI();
}

// ─── CURRENCY ────────────────────────────────────────────────────────────────
function initCurrencyUI() {
  const sel=document.getElementById('currencySelect'); if(!sel) return;
  Object.keys(CURRENCIES).forEach(code=>{
    const opt=document.createElement('option');
    opt.value=code; opt.textContent=`${CURRENCIES[code].symbol} ${code}`;
    sel.appendChild(opt);
  });
  sel.value=activeCurrency; sel.onchange=()=>changeCurrency(sel.value);
}
function setCurrencyUI(code){activeCurrency=code;const sel=document.getElementById('currencySelect');if(sel)sel.value=code;}
async function changeCurrency(code){
  activeCurrency=code;
  await DB.upsertSetting(userId,'currency',code,accessToken);
  renderVendors();updateStats();showToast(`Currency: ${CURRENCIES[code].name} ✓`);
}

// Convert LKR amount to active currency for display
function fmt(lkr){
  const c=CURRENCIES[activeCurrency];
  const v=lkr*c.rate;
  return c.symbol+' '+v.toLocaleString(c.locale,{minimumFractionDigits:0,maximumFractionDigits:0});
}
// Always return GBP conversion if not already GBP (for secondary display)
function fmtGBP(lkr){
  if(activeCurrency==='GBP') return null;
  const v=lkr*CURRENCIES.GBP.rate;
  return '£'+v.toLocaleString('en-GB',{minimumFractionDigits:0,maximumFractionDigits:0});
}

// ─── VENDOR LIMIT UI ─────────────────────────────────────────────────────────
function updateVendorLimitUI(){
  const bar=document.getElementById('vendorLimitBar'); if(!bar) return;
  const lim=getVendorLimit();
  if(isPro&&!(profile?.custom_vendor_limit>0)){bar.style.display='none';return;}
  bar.style.display='flex';
  const n=vendors.length, pct=Math.min(100,(n/lim)*100);
  const isCustom=profile?.custom_vendor_limit>0;
  bar.innerHTML=`
    <div style="flex:1">
      <div style="font-size:11px;color:var(--muted);margin-bottom:5px;">${isCustom?'Custom':'Free'} vendors: <strong style="color:${n>=lim?'var(--danger)':'var(--charcoal)'}">${n}/${lim}</strong>${n>=lim?' — <span style="color:var(--danger)">Limit reached</span>':''}</div>
      <div style="background:var(--border);border-radius:99px;height:5px;"><div style="width:${pct}%;background:${n>=lim?'var(--danger)':'var(--gold)'};border-radius:99px;height:5px;transition:width 0.3s"></div></div>
    </div>
    ${n>=lim&&!isCustom?`<button onclick="openUpgradeModal()" style="margin-left:14px;background:var(--gold);color:white;border:none;border-radius:99px;padding:6px 16px;font-size:11px;cursor:pointer;font-family:Jost,sans-serif;font-weight:500;white-space:nowrap">Upgrade →</button>`:''}`;
}

// ─── RENDER VENDORS ───────────────────────────────────────────────────────────
function renderVendors() {
  const grid=document.getElementById('vendorsGrid'); if(!grid) return;
  grid.innerHTML='';
  const upcoming=[];

  vendors.forEach((v,idx)=>{
    const vPmts=payments.filter(p=>p.vendor_id===v.id);
    const totalPaid=vPmts.reduce((s,p)=>s+parseFloat(p.amount||0),0);
    const remaining=Math.max(0,(v.total_cost||0)-totalPaid);

    // Status
    let sCls='status-pending',sTxt='Not Paid';
    if(v.total_cost>0&&totalPaid>=v.total_cost){sCls='status-paid';sTxt='✓ Fully Paid';}
    else if(totalPaid>0){sCls='status-partial';sTxt='⏳ Partial';}

    // Due date
    let dueBadgeHtml='';
    if(v.due_date){
      const today=new Date();today.setHours(0,0,0,0);
      const dd=new Date(v.due_date+'T00:00:00');
      const diff=Math.round((dd-today)/86400000);
      const dueAmt=v.due_amount?parseFloat(v.due_amount):remaining;
      if(dueAmt>0&&totalPaid<(v.total_cost||0)){
        upcoming.push({v,dueAmt,diffDays:diff});
        let cls='due-upcoming', lbl='📅 Due '+formatDateShort(v.due_date);
        if(diff<0){cls='due-overdue';lbl=`⚠ Overdue ${Math.abs(diff)}d`;}
        else if(diff<=7){cls='due-soon';lbl=`⏰ Due in ${diff}d`;}
        else if(diff<=30){cls='due-upcoming';lbl='📅 Due '+formatDateShort(v.due_date);}
        dueBadgeHtml=`<span class="due-badge ${cls}">${lbl}</span>`;
      }
    }

    // Show total & paid OR total & remaining depending on status
    const isFullyPaid=v.total_cost>0&&totalPaid>=v.total_cost;
    const secondLabel=isFullyPaid?'Paid':'Remaining / Due';
    const secondValue=isFullyPaid?totalPaid:remaining;
    const secondClass=isFullyPaid?'green':'red';
    const gbpSecond=fmtGBP(secondValue);
    const gbpTotal=fmtGBP(v.total_cost||0);

    // Payment history rows
    const pmtCount=vPmts.length;
    const pmtRows=pmtCount
      ?vPmts.map(p=>`<div class="payment-item">
          <span class="pi-amount">${fmt(parseFloat(p.amount||0))}</span>
          <span class="pi-date">${formatDate(p.payment_date)}</span>
          <span class="pi-method">${esc(p.method||'')}</span>
          <span class="pi-note">${esc(p.note||'')}</span>
          <button class="pi-del" onclick="event.stopPropagation();deletePayment('${p.id}')">✕</button>
        </div>`).join('')
      :'<div class="no-payments">No payments recorded yet.</div>';

    const card=document.createElement('div');
    card.className='vendor-card';
    card.style.animationDelay=(idx*0.03)+'s';
    card.innerHTML=`
      <!-- Top: icon + name + actions -->
      <div class="vc-top">
        <div class="vc-icon">${v.icon||'💒'}</div>
        <div class="vc-names">
          <div class="vc-category">${esc(v.category||'Vendor')}</div>
          <div class="vc-name${v.name?'':' unassigned'}">${v.name?esc(v.name):'Not yet assigned'}</div>
        </div>
        <div class="vc-actions">
          <button class="vc-action" onclick="openEditModal('${v.id}')" title="Edit">✏️</button>
          <button class="vc-action" onclick="deleteVendor('${v.id}')" title="Delete">🗑</button>
        </div>
      </div>

      <!-- Amount boxes: 2 columns like reference image -->
      <div class="vc-amounts">
        <div class="vc-amt">
          <div class="vc-amt-label">Total</div>
          <div class="vc-amt-value">${fmt(v.total_cost||0)}</div>
          ${gbpTotal?`<div class="vc-amt-gbp">${gbpTotal}</div>`:''}
        </div>
        <div class="vc-amt">
          <div class="vc-amt-label">${secondLabel}</div>
          <div class="vc-amt-value ${secondClass}">${fmt(secondValue)}</div>
          ${gbpSecond?`<div class="vc-amt-gbp">${gbpSecond}</div>`:''}
        </div>
      </div>

      <!-- Footer: status + due badge + add payment -->
      <div class="vc-footer">
        <div class="vc-badges">
          <span class="status-badge ${sCls}">${sTxt}</span>
          ${dueBadgeHtml}
        </div>
        <button class="add-payment-btn" onclick="openPaymentModal('${v.id}')">+ Add Payment</button>
      </div>

      <!-- Collapsible payment history -->
      <button class="vc-history-toggle" onclick="toggleHistory(this)" id="hist-btn-${v.id}">
        <span>📜 Payment History (${pmtCount})</span>
        <span class="toggle-arrow">▼</span>
      </button>
      <div class="vc-history" id="hist-${v.id}">${pmtRows}</div>
    `;
    grid.appendChild(card);
  });

  renderUpcomingPanel(upcoming);
  renderNotifications();
}

// Toggle payment history
function toggleHistory(btn) {
  btn.classList.toggle('open');
  const histId=btn.id.replace('hist-btn-','hist-');
  const hist=document.getElementById(histId);
  if(hist) hist.classList.toggle('open');
}

// ─── UPCOMING PANEL ───────────────────────────────────────────────────────────
function renderUpcomingPanel(upcoming) {
  const sec=document.getElementById('upcomingSection'),list=document.getElementById('upcomingList');
  if(!sec||!list) return;
  const active=upcoming.filter(u=>u.diffDays<=30).sort((a,b)=>a.diffDays-b.diffDays);
  if(!active.length){sec.style.display='none';return;}
  sec.style.display='block';
  list.innerHTML=active.map(u=>{
    const cls=u.diffDays<0?'due-overdue':u.diffDays<=7?'due-soon':'due-upcoming';
    const lbl=u.diffDays<0?`${Math.abs(u.diffDays)} days overdue`:u.diffDays===0?'Due today':`Due in ${u.diffDays} days`;
    const gbp=fmtGBP(u.dueAmt);
    return `<div class="upcoming-item">
      <div class="upcoming-icon">${u.v.icon||'💒'}</div>
      <div class="upcoming-info">
        <div class="upcoming-vendor">${esc(u.v.category)}${u.v.name?' — '+esc(u.v.name):''}</div>
        <div class="upcoming-date">${formatDate(u.v.due_date)} · <span class="due-badge ${cls}" style="font-size:9px">${lbl}</span></div>
      </div>
      <div>
        <div class="upcoming-amount">${fmt(u.dueAmt)}</div>
        ${gbp?`<div class="upcoming-gbp">${gbp}</div>`:''}
      </div>
    </div>`;
  }).join('');
}

// ─── NOTIFICATION BELL ───────────────────────────────────────────────────────
function renderNotifications() {
  const dot=document.getElementById('notifDot'),panel=document.getElementById('notifPanel');
  if(!panel) return;
  const today=new Date();today.setHours(0,0,0,0);
  const items=vendors.map(v=>{
    if(!v.due_date) return null;
    const vPmts=payments.filter(p=>p.vendor_id===v.id);
    const paid=vPmts.reduce((s,p)=>s+parseFloat(p.amount||0),0);
    const rem=Math.max(0,(v.total_cost||0)-paid);
    const dueAmt=v.due_amount?parseFloat(v.due_amount):rem;
    if(dueAmt<=0||paid>=(v.total_cost||0)) return null;
    const dd=new Date(v.due_date+'T00:00:00');
    const diff=Math.round((dd-today)/86400000);
    if(diff>60) return null;
    return {v,dueAmt,diffDays:diff};
  }).filter(Boolean).sort((a,b)=>a.diffDays-b.diffDays);

  if(dot) dot.style.display=items.length?'block':'none';
  if(!items.length){
    panel.innerHTML='<div style="padding:24px 16px;text-align:center;color:var(--muted);font-size:13px;">No upcoming payments 🎉</div>';
    return;
  }
  panel.innerHTML=`
    <div style="padding:12px 16px;border-bottom:1px solid var(--border);font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);font-weight:600">Upcoming Payments (${items.length})</div>
    ${items.map(u=>{
      const cls=u.diffDays<0?'due-overdue':u.diffDays<=7?'due-soon':'due-upcoming';
      const lbl=u.diffDays<0?`${Math.abs(u.diffDays)}d overdue`:u.diffDays===0?'Today!':u.diffDays===1?'Tomorrow':`In ${u.diffDays}d`;
      return `<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
        <div style="font-size:20px;flex-shrink:0">${u.v.icon||'💒'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;color:var(--charcoal);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.v.category)}${u.v.name?' — '+esc(u.v.name):''}</div>
          <div style="margin-top:3px"><span class="due-badge ${cls}" style="font-size:9px">${lbl}</span></div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:13px;font-weight:600;color:var(--charcoal)">${fmt(u.dueAmt)}</div>
          ${fmtGBP(u.dueAmt)?`<div style="font-size:10px;color:var(--muted)">${fmtGBP(u.dueAmt)}</div>`:''}
        </div>
      </div>`;
    }).join('')}`;
}

function toggleNotifPanel(){
  const p=document.getElementById('notifPanel');
  if(p) p.style.display=p.style.display==='block'?'none':'block';
}
document.addEventListener('click',function(e){
  const bell=document.getElementById('notifBell'),panel=document.getElementById('notifPanel');
  if(panel&&panel.style.display==='block'&&bell&&!bell.contains(e.target)&&!panel.contains(e.target))
    panel.style.display='none';
});

// ─── ADD VENDOR ──────────────────────────────────────────────────────────────
function getVendorLimit(){
  if(profile&&profile.custom_vendor_limit>0) return profile.custom_vendor_limit;
  if(isPro) return 9999;
  return FREE_VENDOR_LIMIT;
}

async function addVendor(){
  const lim=getVendorLimit();
  if(vendors.length>=lim){
    if(!isPro&&!profile?.custom_vendor_limit) openUpgradeModal();
    else showToast(`Vendor limit of ${lim} reached`,true);
    return;
  }
  const name=document.getElementById('newVendorName').value.trim();
  if(!name){showToast('Please enter a vendor name',true);return;}
  const data={user_id:userId,icon:selectedIcon,
    category:document.getElementById('newVendorCategory').value.trim()||'Custom',
    name,total_cost:parseFloat(document.getElementById('newVendorTotal').value)||0,
    notes:document.getElementById('newVendorNotes').value.trim(),
    due_date:null,due_amount:null,due_note:''};
  const r=await DB.post('vendors',data,accessToken);
  vendors.push(r[0]);
  ['newVendorName','newVendorCategory','newVendorTotal','newVendorNotes'].forEach(id=>document.getElementById(id).value='');
  renderVendors();updateStats();updateVendorLimitUI();showToast('Vendor added! 🎉');
}

async function deleteVendor(id){
  if(!confirm('Delete this vendor and all its payments?')) return;
  for(const p of payments.filter(p=>p.vendor_id===id)) await DB.del('payments',p.id,accessToken);
  await DB.del('vendors',id,accessToken);
  payments=payments.filter(p=>p.vendor_id!==id);
  vendors=vendors.filter(v=>v.id!==id);
  renderVendors();updateStats();updateVendorLimitUI();showToast('Vendor deleted');
}

// ─── EDIT MODAL ──────────────────────────────────────────────────────────────
function openEditModal(id){
  const v=vendors.find(x=>x.id===id);if(!v) return;
  activeEditVendorId=id;
  document.getElementById('editVendorName').value=v.name||'';
  document.getElementById('editVendorCategory').value=v.category||'';
  document.getElementById('editVendorTotal').value=v.total_cost||'';
  document.getElementById('editVendorNotes').value=v.notes||'';
  document.getElementById('editDueDate').value=v.due_date||'';
  document.getElementById('editDueAmount').value=v.due_amount||'';
  document.getElementById('editDueNote').value=v.due_note||'';
  document.getElementById('editModal').style.display='flex';
}
function closeEditModal(){document.getElementById('editModal').style.display='none';activeEditVendorId=null;}
async function submitEdit(){
  const id=activeEditVendorId;const v=vendors.find(x=>x.id===id);if(!v) return;
  const data={
    name:document.getElementById('editVendorName').value.trim(),
    category:document.getElementById('editVendorCategory').value.trim(),
    total_cost:parseFloat(document.getElementById('editVendorTotal').value)||0,
    notes:document.getElementById('editVendorNotes').value.trim(),
    due_date:document.getElementById('editDueDate').value||null,
    due_amount:parseFloat(document.getElementById('editDueAmount').value)||null,
    due_note:document.getElementById('editDueNote').value.trim()
  };
  await DB.patch('vendors',id,data,accessToken);
  Object.assign(v,data);
  closeEditModal();renderVendors();updateStats();showToast('Vendor updated ✓');
}

// ─── PAYMENT MODAL ───────────────────────────────────────────────────────────
function openPaymentModal(vendorId){
  activePaymentVendorId=vendorId;
  const v=vendors.find(x=>x.id===vendorId);
  const el=document.getElementById('modalVendorName');
  if(el&&v) el.textContent=`${v.icon} ${v.category}${v.name?' — '+v.name:''}`;
  document.getElementById('pmtAmount').value='';
  document.getElementById('pmtDate').value=new Date().toISOString().split('T')[0];
  document.getElementById('pmtMethod').value='Cash';
  document.getElementById('pmtNote').value='';
  const lbl=document.getElementById('pmtCurrencyLabel');
  if(lbl) lbl.textContent=CURRENCIES[activeCurrency].symbol;
  document.getElementById('paymentModal').style.display='flex';
}
function closePaymentModal(){document.getElementById('paymentModal').style.display='none';activePaymentVendorId=null;}
async function submitPayment(){
  const amount=parseFloat(document.getElementById('pmtAmount').value);
  if(!amount||amount<=0){showToast('Enter a valid amount',true);return;}
  const date=document.getElementById('pmtDate').value;
  if(!date){showToast('Select a date',true);return;}
  // Convert to LKR for storage
  const lkrAmount=amount/CURRENCIES[activeCurrency].rate;
  const data={user_id:userId,vendor_id:activePaymentVendorId,
    amount:lkrAmount,payment_date:date,
    method:document.getElementById('pmtMethod').value,
    note:document.getElementById('pmtNote').value.trim()};
  const r=await DB.post('payments',data,accessToken);
  payments.push(r[0]);
  closePaymentModal();renderVendors();updateStats();showToast('Payment recorded ✓');
}
async function deletePayment(id){
  if(!confirm('Delete this payment?')) return;
  await DB.del('payments',id,accessToken);
  payments=payments.filter(p=>p.id!==id);
  renderVendors();updateStats();showToast('Payment deleted');
}

// ─── SHARE MODAL ─────────────────────────────────────────────────────────────
function openShareModal(){
  document.getElementById('shareToggle').checked=shareEnabled;
  document.getElementById('shareUrlSection').style.display=shareEnabled?'block':'none';
  if(shareToken) document.getElementById('shareUrlText').textContent=getShareUrl();
  document.getElementById('shareVendors').checked=sharePermissions.vendors??true;
  document.getElementById('shareDueDates').checked=sharePermissions.dueDates??true;
  document.getElementById('shareBudget').checked=sharePermissions.budget??true;
  document.getElementById('shareChecklist').checked=sharePermissions.checklist??false;
  document.getElementById('shareNotes').checked=sharePermissions.notes??false;
  document.getElementById('shareModal').style.display='flex';
}
function closeShareModal(){document.getElementById('shareModal').style.display='none';}
function getShareUrl(){return `${window.location.origin}${window.location.pathname.replace('dashboard.html','share.html')}?token=${shareToken}`;}
async function toggleShare(){
  shareEnabled=document.getElementById('shareToggle').checked;
  if(shareEnabled&&!shareToken){
    shareToken='share_'+userId+'_'+Math.random().toString(36).substr(2,12);
    await DB.upsertSetting(userId,'share_token',shareToken,accessToken);
  }
  await DB.upsertSetting(userId,'share_enabled',String(shareEnabled),accessToken);
  document.getElementById('shareUrlSection').style.display=shareEnabled?'block':'none';
  if(shareToken) document.getElementById('shareUrlText').textContent=getShareUrl();
  showToast(shareEnabled?'Sharing enabled ✓':'Sharing disabled');
}
async function saveSharePermissions(){
  sharePermissions={
    vendors:document.getElementById('shareVendors').checked,
    dueDates:document.getElementById('shareDueDates').checked,
    budget:document.getElementById('shareBudget').checked,
    checklist:document.getElementById('shareChecklist').checked,
    notes:document.getElementById('shareNotes').checked
  };
  await DB.upsertSetting(userId,'share_permissions',JSON.stringify(sharePermissions),accessToken);
  showToast('Share settings saved ✓');
}
function copyShareUrl(){navigator.clipboard.writeText(getShareUrl()).then(()=>showToast('Link copied! 📋'));}

// ─── UPGRADE MODAL ───────────────────────────────────────────────────────────
// openUpgradeModal defined in PayPal section below
function closeUpgradeModal(){document.getElementById('upgradeModal').style.display='none';}

window.initPayPal=function(){
  if(typeof paypal==='undefined'){
    // SDK failed to load — show the fallback button
    showPayPalFallback();
    return;
  }
  // Hide fallback, show SDK button
  const fb=document.getElementById('paypalFallback');
  if(fb) fb.style.display='none';
  const container=document.getElementById('paypalButtonContainer');
  if(!container) return;

  paypal.Buttons({
    style:{layout:'vertical',color:'gold',shape:'pill',label:'pay'},
    createOrder:function(data,actions){
      return actions.order.create({
        purchase_units:[{
          amount:{value:'12.00',currency_code:'USD'},
          description:'WeddingLedger Pro — Unlimited Vendors'
        }]
      });
    },
    onApprove:async function(data,actions){
      const btn=container.querySelector('button,iframe');
      if(btn) btn.disabled=true;
      showToast('Processing your payment…');
      const order=await actions.order.capture();
      await activatePro(order.id);
    },
    onCancel:function(){
      showToast('Payment cancelled — you can try again anytime.');
    },
    onError:function(err){
      showToast('Payment failed, please try again.',true);
      console.error(err);
    }
  }).render('#paypalButtonContainer');
};

function showPayPalFallback(){
  // Show manual PayPal button as fallback
  const fb=document.getElementById('paypalFallback');
  const container=document.getElementById('paypalButtonContainer');
  if(fb) fb.style.display='block';
  if(container) container.style.display='none';
  // Set the direct PayPal link (replace with your PayPal.me or hosted button URL)
  const link=document.getElementById('paypalDirectLink');
  if(link) link.href='https://www.paypal.com/paypalme/YOUR_PAYPAL_USERNAME/12';
}

// Called when upgrade modal opens — ensure PayPal is initialised
function openUpgradeModal(){
  document.getElementById('upgradeModal').style.display='flex';
  // Re-try init in case SDK loaded after page load
  if(typeof paypal!=='undefined'){
    const container=document.getElementById('paypalButtonContainer');
    if(container&&!container.hasChildNodes()) initPayPal();
  } else {
    showPayPalFallback();
  }
}

async function activatePro(orderId){
  try{
    await DB.patch('profiles',profile.id,{is_pro:true,paypal_order_id:orderId},accessToken);
    isPro=true; profile.is_pro=true; profile.paypal_order_id=orderId;
    closeUpgradeModal();
    updateProBadge();
    updateVendorLimitUI();
    renderVendors();
    showToast('🎉 Welcome to Pro! All features are now unlocked.');
  }catch(e){
    showToast('Payment received but activation failed — contact support.',true);
    console.error(e);
  }
}

// ─── STATS ───────────────────────────────────────────────────────────────────
function updateStats(){
  let total=0,paid=0;
  vendors.forEach(v=>{
    total+=parseFloat(v.total_cost||0);
    paid+=payments.filter(p=>p.vendor_id===v.id).reduce((s,p)=>s+parseFloat(p.amount||0),0);
  });
  const rem=total-paid,lim=spendLimit||0;
  const avail=lim>0?lim-total:null;
  const pct=lim>0?Math.min(100,Math.round((total/lim)*100)):0;

  setText('stat-total',fmt(total));
  setText('stat-paid',fmt(paid));
  setText('stat-remaining',fmt(rem));
  setText('stat-count',vendors.filter(v=>v.name).length);

  const setGBP=(id,val)=>{const el=document.getElementById(id);if(!el)return;const g=fmtGBP(val);el.textContent=g||'';el.style.display=g?'block':'none';};
  setGBP('stat-total-gbp',total);setGBP('stat-paid-gbp',paid);setGBP('stat-remaining-gbp',rem);

  const fill=document.getElementById('progress-fill');
  if(fill){fill.style.width=pct+'%';fill.classList.toggle('danger',pct>=90);}
  setText('progress-pct',pct+'%');
  setText('sum-total',fmt(total));setText('sum-paid',fmt(paid));
  setText('sum-remaining',fmt(rem));setText('sum-limit',lim>0?fmt(lim):'Not set');
  const av=document.getElementById('sum-available');
  if(av){if(avail!==null){av.textContent=fmt(avail);av.style.color=avail>=0?'var(--sage)':'var(--danger)';}
  else{av.textContent='Set limit above';av.style.color='var(--muted)';}}
}

async function saveLimit(){
  const input=parseFloat(document.getElementById('spendLimit').value)||0;
  const lkr=input/CURRENCIES[activeCurrency].rate;
  spendLimit=lkr;
  await DB.upsertSetting(userId,'spend_limit',lkr,accessToken);
  updateStats();showToast('Spend limit saved ✓');
}
async function saveNotes(){
  const val=document.getElementById('weddingNotes').value;
  notes=val;await DB.upsertSetting(userId,'wedding_notes',val,accessToken);showToast('Notes saved ✓');
}

// ─── TASKS ───────────────────────────────────────────────────────────────────
function renderTasks(){
  const grid=document.getElementById('checklistGrid');if(!grid) return;
  grid.innerHTML='';
  tasks.forEach(task=>{
    const item=document.createElement('div');
    item.className='checklist-item'+(task.done?' done':'');
    item.innerHTML=`<div class="checklist-check">${task.done?'✓':''}</div><span class="checklist-text">${esc(task.text)}</span><button class="checklist-del" onclick="event.stopPropagation();deleteTask('${task.id}')">✕</button>`;
    item.onclick=()=>toggleTask(task.id);grid.appendChild(item);
  });
}
async function toggleTask(id){const t=tasks.find(x=>x.id===id);if(!t)return;t.done=!t.done;await DB.patch('tasks',id,{done:t.done},accessToken);renderTasks();}
async function deleteTask(id){await DB.del('tasks',id,accessToken);tasks=tasks.filter(t=>t.id!==id);renderTasks();}
async function addTask(){const inp=document.getElementById('newTaskInput');const text=inp.value.trim();if(!text)return;const r=await DB.post('tasks',{user_id:userId,text,done:false},accessToken);tasks.push(r[0]);inp.value='';renderTasks();}

// ─── ICON SELECTOR ───────────────────────────────────────────────────────────
function renderIconSelector(){
  const wrap=document.getElementById('iconSelector');if(!wrap)return;
  wrap.innerHTML='';
  ICONS.forEach(ic=>{const btn=document.createElement('button');btn.className='icon-btn'+(ic===selectedIcon?' active':'');btn.textContent=ic;btn.onclick=()=>{selectedIcon=ic;renderIconSelector();};wrap.appendChild(btn);});
}

// ─── COUNTDOWN ───────────────────────────────────────────────────────────────
function startCountdown(){
  function tick(){
    const diff=weddingDate-new Date();
    if(diff<=0){['cd-days','cd-hours','cd-mins','cd-secs'].forEach(id=>setText(id,'0'));return;}
    setText('cd-days',Math.floor(diff/86400000));
    setText('cd-hours',pad(Math.floor((diff%86400000)/3600000)));
    setText('cd-mins',pad(Math.floor((diff%3600000)/60000)));
    setText('cd-secs',pad(Math.floor((diff%60000)/1000)));
  }
  tick();setInterval(tick,1000);
}

// ─── MODAL OVERLAY CLOSE ─────────────────────────────────────────────────────
['paymentModal','editModal','shareModal','upgradeModal'].forEach(id=>{
  const el=document.getElementById(id);
  if(el) el.addEventListener('click',function(e){if(e.target===this)this.style.display='none';});
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function setText(id,v){const el=document.getElementById(id);if(el)el.textContent=v;}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function formatDate(d){if(!d)return '';return new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});}
function formatDateShort(d){if(!d)return '';return new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'}).toUpperCase();}
function formatDateLong(d){if(!d)return '';return new Date(d+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});}
function pad(n){return String(n).padStart(2,'0');}
let toastTimer;
function showToast(msg,isError=false){
  const t=document.getElementById('toast');if(!t)return;
  t.textContent=msg;t.className='toast show'+(isError?' error':'');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.className='toast';},3500);
}

init();
