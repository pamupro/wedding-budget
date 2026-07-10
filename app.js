// Global error handler - catches any JS crash and shows it visibly
window.onerror = function(msg, src, line, col, err) {
  console.error('[WL CRASH]', msg, 'at', src, line+':'+col);
  const b = document.createElement('div');
  b.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#c04040;color:white;padding:12px 16px;font-family:monospace;font-size:12px;z-index:99999;word-break:break-all';
  b.textContent = '⚠️ JS Error: ' + msg + ' (line ' + line + ')';
  document.body && document.body.prepend(b);
  return false;
};

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

// Base currency is GBP. All amounts stored in GBP internally.
// Live rates fetched from exchangerate-api (free tier)
const CURRENCIES = {
  GBP:{ symbol:'£',   locale:'en-GB', rate:1,      name:'British Pound'   },
  USD:{ symbol:'$',   locale:'en-US', rate:1.27,   name:'US Dollar'       },
  EUR:{ symbol:'€',   locale:'de-DE', rate:1.17,   name:'Euro'            },
  LKR:{ symbol:'LKR', locale:'en-LK', rate:383,    name:'Sri Lankan Rupee'},
  AUD:{ symbol:'A$',  locale:'en-AU', rate:1.97,   name:'Australian Dollar'},
  INR:{ symbol:'₹',   locale:'en-IN', rate:107,    name:'Indian Rupee'    },
  SGD:{ symbol:'S$',  locale:'en-SG', rate:1.71,   name:'Singapore Dollar'},
};

// ─── STATE ───────────────────────────────────────────────────────────────────
let vendors=[], payments=[], tasks=[];
let notes='', spendLimit=0, spendLimitOriginal=null, spendLimitCurrency='';

// Site base adapts to any domain — no changes needed after a custom-domain move
const SITE_BASE = location.origin + location.pathname.replace(/\/[^\/]*$/, '');

// Spend limit is stored as JSON {gbp, original, currency} so the exact typed
// amount survives. Legacy plain-number values are treated as GBP.
function parseSpendLimitSetting(raw){
  try{ const o=JSON.parse(raw); if(o&&typeof o==='object'&&'gbp' in o){ return {gbp:parseFloat(o.gbp)||0, original:(o.original!=null?parseFloat(o.original):null), currency:o.currency||''}; } }catch(e){}
  return {gbp:parseFloat(raw)||0, original:null, currency:''};
}
function spendLimitActive(){ return amtActive(spendLimit, spendLimitOriginal, spendLimitCurrency); }
function spendLimitFieldValue(){
  if(!spendLimit&&!spendLimitOriginal) return '';
  if(spendLimitCurrency===activeCurrency&&spendLimitOriginal!=null) return spendLimitOriginal;
  return Math.round(spendLimit*(CURRENCIES[activeCurrency].rate||1)*100)/100;
}
async function persistSpendLimit(typed){
  const gbp=typed/(CURRENCIES[activeCurrency].rate||1);
  spendLimit=gbp; spendLimitOriginal=typed; spendLimitCurrency=activeCurrency;
  await DB.upsertSetting(userId,'spend_limit',JSON.stringify({gbp:gbp,original:typed,currency:activeCurrency}),accessToken);
}
let shareToken=null, shareEnabled=false;
let sharePermissions={vendors:true,dueDates:true,budget:true,checklist:false,notes:false};
let selectedIcon='💒', activeCurrency='GBP', isPro=false;

// When partners are linked, all data is stored under one userId (alphabetically first)
// This ensures both partners see the same data
function getDataUserId() {
  if(!profile?.partner_id) return userId;
  // Get the partner's actual user_id from their profile
  // Use the one that was created first (stored in partnerProfile)
  // Simple approach: always use current user's data, partner reads/writes same data
  // via RLS policies that allow partner access
  return userId; // both partners write to their own userId but can read each other's
}
let activePaymentVendorId=null, activeEditVendorId=null;
let userId=null, accessToken=null, profile=null;
let weddingDate=new Date('2027-02-11T09:00:00');

// ─── INIT ────────────────────────────────────────────────────────────────────
async function init() {
  console.log('[WL] ✅ app.js v2 loaded, init() running, uid=', localStorage.getItem('wl_uid')?.slice(0,8));
  const urlRef = new URLSearchParams(window.location.search).get('ref');
  if(urlRef) localStorage.setItem('wl_ref', urlRef);

  userId = localStorage.getItem('wl_uid');
  accessToken = localStorage.getItem('wl_token');

  if (!userId || !accessToken) {
    window.location.href = 'login.html';
    return;
  }

  showLoadingState(true);

  try {
    accessToken = await DB.getValidToken(accessToken);
    if (!accessToken) return;
    localStorage.setItem('wl_token', accessToken);
  } catch(e) {
    window.location.href = 'login.html';
    return;
  }

  renderIconSelector();
  startCountdown();
  initCurrencyUI();
  loadPlatformSettings();

  try {
    await loadProfile();
    await loadPartnerData();
    loadReferralCode();
    updateWeddingPageUrl();
    const mnEl = document.getElementById('mobileNavNames');
    if(mnEl) {
      const n1 = profile?.name1||'', n2 = profile?.name2||'';
      mnEl.textContent = (n1||n2) ? n1+(n2?' & '+n2:'') : 'WeddingLedger';
    }
    await Promise.all([loadVendors(), loadPayments(), loadTasks(), loadSettings()]);
    fetchLiveRates();
  } catch(e) {
    console.error('Init error:', e);
    showLoadingState(false);
    const msg = e.message || '';
    if (msg.includes('JWT') || msg.includes('401') || msg.includes('invalid')) {
      doLogout();
      return;
    }
    const hero = document.getElementById('coupleHero');
    if (hero) {
      hero.innerHTML = `<div style="text-align:center;padding:32px 24px;background:#fff8f0;border:1px solid #f5c0a0;margin:16px;border-radius:12px">
        <div style="font-size:16px;color:#c04040;margin-bottom:8px">⚠️ Could not load your dashboard</div>
        <div style="font-size:13px;color:#888;margin-bottom:16px">${e.message || 'Connection error'}</div>
        <button onclick="location.reload()" style="background:var(--gold);color:white;border:none;border-radius:99px;padding:10px 24px;font-family:'Instrument Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer">
          🔄 Try Again
        </button>
      </div>`;
    }
    showToast('Error loading data — click Try Again', true);
    return;
  } finally {
    showLoadingState(false);
  }
}

function showLoadingState(on) {
  // Show/hide a subtle loading indicator on the stats
  const ids = ['stat-total','stat-paid','stat-remaining'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = on ? '…' : el.textContent;
  });
}

function doLogout() {
  localStorage.removeItem('wl_token');
  localStorage.removeItem('wl_refresh');
  localStorage.removeItem('wl_uid');
  window.location.href='login.html';
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────
async function loadProfile() {
  const rows=await DB.query(`profiles?user_id=eq.${userId}&select=*`,accessToken);
  if (rows&&rows.length) {
    profile=rows[0]; isPro=profile.is_pro===true;
    renderHero();
    updateProBadge();
    const params = new URLSearchParams(location.search);
    const justSignedUp = params.get('welcome') === '1';
    // Auto-open onboarding only for users who DIDN'T come through the new wizard
    if (!profile.name1 && !profile.name2 && !justSignedUp) {
      setTimeout(()=>openWelcomeModal(), 500);
    }
    if (justSignedUp) {
      const nm = profile.name1 ? (', ' + profile.name1) : '';
      setTimeout(()=>showToast(`Welcome to WeddingLedger${nm}! 🎉 Everything's ready — you can edit any detail anytime.`), 600);
      history.replaceState(null,'',location.pathname);  // clean the URL
    }
    // Pro purchase path (from wizard or guest limit)
    if (!isPro && params.get('upgrade') === '1') {
      setTimeout(()=>openUpgradeModal(), 700);
    }
  } else {
    // No profile row at all — create one then show welcome
    try {
      const r = await fetch(`${DB.SUPABASE_URL}/rest/v1/profiles`, {
        method:'POST',
        headers:{...DB._h(accessToken),'Prefer':'return=representation'},
        body:JSON.stringify({user_id:userId})
      });
      const rows2 = await r.json();
      profile = Array.isArray(rows2) ? rows2[0] : rows2;
    } catch(e) { profile = {user_id:userId}; }
    setTimeout(()=>openWelcomeModal(), 500);
    updateProBadge();
  }
}

function renderHero() {
  if (!profile) return;
  const n1=profile.name1||'', n2=profile.name2||'';
  const el=document.getElementById('coupleNames');
  if (el) el.textContent=n1&&n2?`${n1} & ${n2}`:n1||n2||'';
  const hero=document.getElementById('coupleHero');
  if (hero) {
    if (n1||n2) {
      const wdStr=profile.wedding_date?formatDateLong(profile.wedding_date):'';
      hero.innerHTML=`<div class="dash-hero">
        <div class="dash-hero-eyebrow">💍 Your Wedding Budget</div>
        <div class="dash-hero-names">
          ${esc(n1)}${n2?` <em>&amp;</em> ${esc(n2)}`:''}
        </div>
        ${wdStr?`<div class="dash-hero-date">${wdStr}</div>`:''}
        <div class="dash-hero-divider">✦ &nbsp; ✦ &nbsp; ✦</div>
      </div>`;
    } else {
      hero.innerHTML=''; // cleared until names set
    }
  }
  const mobileNames=document.getElementById('mobileNavNames');
  if (mobileNames) mobileNames.textContent=n1&&n2?`${n1} & ${n2}`:n1||n2||'My Wedding';
  if (profile.wedding_date) weddingDate=new Date(profile.wedding_date+'T09:00:00');
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
  // If linked to partner, use the primary account's data (lower UUID = primary)
  const dataUserId = getDataUserId();
  let ownVendors = await DB.query(`vendors?user_id=eq.${userId}&order=created_at.asc`,accessToken);
  // If partner linked, also load their vendors and merge
  if(profile?.partner_id) {
    try {
      // Get partner's user_id from their profile
      const pRows = await DB.query(`profiles?id=eq.${profile.partner_id}&select=user_id`, accessToken);
      if(pRows && pRows[0]) {
        const partnerUserId = pRows[0].user_id;
        const partnerVendors = await DB.query(`vendors?user_id=eq.${partnerUserId}&order=created_at.asc`, accessToken);
        ownVendors = [...ownVendors, ...partnerVendors];
      }
    } catch(e) { console.log('Could not load partner vendors:', e); }
  }
  vendors = ownVendors;
  if (!vendors.length) {
    const list=isPro?DEFAULT_VENDORS:DEFAULT_VENDORS.slice(0,FREE_VENDOR_LIMIT);
    for (const v of list) {
      const r=await DB.post('vendors',{user_id:userId,category:v.category,icon:v.icon,name:'',total_cost:0,notes:'',due_date:null,due_amount:null,due_note:''},accessToken);
      vendors.push(r[0]);
    }
  }
  renderVendors(); updateStats(); updateVendorLimitUI(); renderChart();
}

async function loadPayments() {
  const dataUserId2 = getDataUserId();
  payments=await DB.query(`payments?user_id=eq.${dataUserId2}&order=payment_date.asc`,accessToken);
  renderVendors(); updateStats(); renderNotifications();
}

async function loadTasks() {
  const dataUserId3 = getDataUserId();
  tasks=await DB.query(`tasks?user_id=eq.${dataUserId3}&order=created_at.asc`,accessToken);
  if (!tasks.length) {
    for (const text of DEFAULT_TASKS) {
      const r=await DB.post('tasks',{user_id:userId,text,done:false},accessToken);
      tasks.push(r[0]);
    }
  }
  renderTasks();
}


// ─── PLATFORM SETTINGS (admin-configured, loaded for all users) ──────────────
async function loadPlatformSettings() {
  try {
    const rows = await DB.query('settings?key=in.(sub_price,paypal_plan_id)&user_id=eq.a151e7e9-25db-4d03-9a17-1ddcf8aa53a2&limit=10', accessToken);
    if(rows) rows.forEach(r => {
      if(r.key === 'sub_price')              window.WL_SUB_PRICE         = r.value;
      if(r.key === 'paypal_plan_id')         window.WL_PLAN_ID           = r.value;
    });
  } catch(e) { /* non-critical */ }
}

async function loadSettings() {
  const rows=await DB.query(`settings?user_id=eq.${userId}`,accessToken);
  rows.forEach(r=>{
    if(r.key==='spend_limit'){const sl=parseSpendLimitSetting(r.value);spendLimit=sl.gbp;spendLimitOriginal=sl.original;spendLimitCurrency=sl.currency;const fv=spendLimitFieldValue();const el=document.getElementById('spendLimit');if(el)el.value=fv;const el2=document.getElementById('settingsSpendLimit');if(el2)el2.value=fv;}
    if(r.key==='wedding_notes'){notes=r.value;const el=document.getElementById('weddingNotes');if(el)el.value=notes;}
    if(r.key==='share_token') shareToken=r.value;
    if(r.key==='share_enabled') shareEnabled=r.value==='true';
    if(r.key==='share_permissions'){try{sharePermissions=JSON.parse(r.value);}catch(e){}}
    if(r.key==='currency'){activeCurrency=r.value||'GBP';setCurrencyUI(activeCurrency);}
    if(r.key==='pref_currency' && r.value){ activeCurrency=r.value; setCurrencyUI(activeCurrency); }
    if(r.key==='vendor_limit'){
      // Admin-assigned custom vendor limit
      const lim=parseInt(r.value)||0;
      if(lim>0&&profile){profile.custom_vendor_limit=lim;}
    }
    // Platform-wide subscription price (set by admin, stored under a system user)
    if(r.key==='sub_price') window.WL_SUB_PRICE = r.value;
    if(r.key==='paypal_plan_id') window.WL_PLAN_ID = r.value;
  });
  updateStats();updateVendorLimitUI();
}

// ─── CURRENCY ────────────────────────────────────────────────────────────────
function initCurrencyUI() {
  const sel=document.getElementById('currencySelect'); if(!sel) return;
  sel.innerHTML=''; // clear first
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
  renderVendors(); updateStats(); renderChart();
  try{ await DB.upsertSetting(userId,'currency',code,accessToken); }catch(e){ console.warn('Currency save failed:',e); }
  const rate = CURRENCIES[code].rate;
  const msg = code==='GBP'
    ? 'Currency: British Pound (£) ✓'
    : `Currency: ${CURRENCIES[code].name} — £1 = ${CURRENCIES[code].symbol}${rate.toLocaleString()} ✓`;
  showToast(msg);
  updateLiveRateBadge();
}

// Format GBP amount into active currency for display
function fmt(gbp){
  if(!gbp && gbp!==0) return '—';
  const c = CURRENCIES[activeCurrency];
  const v = gbp * (c.rate || 1);
  // Use 0 decimal for large currencies (LKR, INR), 2 for others
  const decimals = (c.rate > 50) ? 0 : 2;
  return c.symbol + v.toLocaleString(c.locale, {minimumFractionDigits:decimals, maximumFractionDigits:decimals});
}

// ─── EXACT AMOUNTS (no rounding drift) ─────────────────────────────────────
// Rows store BOTH the GBP value and the exact amount the user typed
// (amount_original / total_cost_original) with its currency. When viewing in
// the same currency it was entered in, we show the typed amount verbatim —
// zero conversion, zero drift. Conversion only happens across currencies.
function amtActive(gbp, original, curr){
  if(original!==null && original!==undefined && original!=='' && curr===activeCurrency) return parseFloat(original)||0;
  return (parseFloat(gbp)||0)*(CURRENCIES[activeCurrency].rate||1);
}
// Format a value that is ALREADY in the active currency
function fmtActive(v){
  const c=CURRENCIES[activeCurrency];
  const decimals=(c.rate>50)?0:2;
  return c.symbol+(parseFloat(v)||0).toLocaleString(c.locale,{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
}
function fmtExact(gbp, original, curr){ return fmtActive(amtActive(gbp, original, curr)); }
function vTotalA(v){ return amtActive(v.total_cost, v.total_cost_original, v.currency); }
function vDueA(v){ return (v.due_amount!==null&&v.due_amount!==undefined) ? amtActive(v.due_amount, v.due_amount_original, v.currency) : null; }
function pAmtA(p){ return amtActive(p.amount, p.amount_original, p.currency); }

// Always show £ equivalent as secondary line
// If already in GBP — no secondary line needed
// If in another currency — show live £ rate
function fmtGBP(gbp){
  if(!gbp && gbp!==0) return null;
  if(activeCurrency === 'GBP') return null; // already showing £, no need for secondary
  // Show £ equivalent using live rate
  return '£' + Number(gbp).toLocaleString('en-GB', {minimumFractionDigits:2, maximumFractionDigits:2});
}

// NEW: show the "other currency" conversion below £ primary
// Used when activeCurrency=GBP to show e.g. "LKR 175,001" isn't needed
// Used when activeCurrency=LKR to show "£421.76" — this is fmtGBP above
// Fetch live exchange rates and update CURRENCIES
async function fetchLiveRates(){
  try {
    const r = await fetch('https://api.exchangerate-api.com/v4/latest/GBP');
    if(!r.ok) return;
    const d = await r.json();
    // Update each currency's rate from live data
    Object.keys(CURRENCIES).forEach(code => {
      if(d.rates[code]) CURRENCIES[code].rate = d.rates[code];
    });
    console.log('✅ Live exchange rates updated');
    // Re-render with fresh rates
    renderVendors(); updateStats();
    updateLiveRateBadge();
  } catch(e) {
    console.log('Using fallback rates:', e.message);
  }
}

function updateLiveRateBadge(){
  const badge = document.getElementById('liveRateBadge');
  if(!badge) return;
  if(activeCurrency === 'GBP'){
    badge.style.display = 'none';
    return;
  }
  const c = CURRENCIES[activeCurrency];
  badge.textContent = `£1 = ${c.symbol}${c.rate.toLocaleString('en-GB',{maximumFractionDigits:2})}`;
  badge.style.display = 'inline';
  badge.title = 'Live exchange rate';
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
    ${n>=lim&&!isCustom?`<button onclick="openUpgradeModal()" style="margin-left:14px;background:var(--gold);color:white;border:none;border-radius:99px;padding:6px 16px;font-size:11px;cursor:pointer;font-family:'Instrument Sans',sans-serif;font-weight:500;white-space:nowrap">Upgrade →</button>`:''}`;
}

// ─── RENDER VENDORS ───────────────────────────────────────────────────────────
function renderVendors() {
  const grid=document.getElementById('vendorsGrid'); if(!grid) return;
  grid.innerHTML='';
  const upcoming=[];

  vendors.forEach((v,idx)=>{
    const vPmts=payments.filter(p=>p.vendor_id===v.id);
    // Work in the ACTIVE currency using exact entered amounts (no drift)
    const EPS=0.005;
    const totalV=vTotalA(v);
    const totalPaid=vPmts.reduce((s,p)=>s+pAmtA(p),0);
    const remaining=Math.max(0,totalV-totalPaid);
    // GBP equivalents for the secondary £ line
    const totalGBPv=parseFloat(v.total_cost)||0;
    const totalPaidGBP=vPmts.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);

    // Status
    let sCls='status-pending',sTxt='Not Paid';
    if(totalV>0&&totalPaid>=totalV-EPS){sCls='status-paid';sTxt='✓ Fully Paid';}
    else if(totalPaid>0){sCls='status-partial';sTxt='⏳ Partial';}

    // Due date
    let dueBadgeHtml='';
    if(v.due_date){
      const today=new Date();today.setHours(0,0,0,0);
      const dd=new Date(v.due_date+'T00:00:00');
      const diff=Math.round((dd-today)/86400000);
      const dv=vDueA(v);
      const dueAmt=(dv!==null&&dv>0)?dv:remaining;
      if(dueAmt>0&&totalPaid<totalV-EPS){
        upcoming.push({v,dueAmt,diffDays:diff});
        let cls='due-upcoming', lbl='📅 Due '+formatDateShort(v.due_date);
        if(diff<0){cls='due-overdue';lbl=`⚠ Overdue ${Math.abs(diff)}d`;}
        else if(diff<=7){cls='due-soon';lbl=`⏰ Due in ${diff}d`;}
        else if(diff<=30){cls='due-upcoming';lbl='📅 Due '+formatDateShort(v.due_date);}
        dueBadgeHtml=`<span class="due-badge ${cls}">${lbl}</span>`;
      }
    }

    // Show total & paid OR total & remaining depending on status
    const isFullyPaid=totalV>0&&totalPaid>=totalV-EPS;
    const secondLabel=isFullyPaid?'Paid':'Remaining / Due';
    const secondValue=isFullyPaid?totalPaid:remaining;
    const secondClass=isFullyPaid?'green':'red';
    const gbpSecond=fmtGBP(isFullyPaid?totalPaidGBP:Math.max(0,totalGBPv-totalPaidGBP));
    const gbpTotal=fmtGBP(totalGBPv);

    // Payment history rows
    const pmtCount=vPmts.length;
    const pmtRows=pmtCount
      ?vPmts.map(p=>`<div class="payment-item">
          <span class="pi-amount">${fmtExact(p.amount,p.amount_original,p.currency)}</span>
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
          <div class="vc-amt-value">${fmtActive(totalV)}</div>
          ${gbpTotal?`<div class="vc-amt-gbp">${gbpTotal}</div>`:''}
        </div>
        <div class="vc-amt">
          <div class="vc-amt-label">${secondLabel}</div>
          <div class="vc-amt-value ${secondClass}">${fmtActive(secondValue)}</div>
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
    const gbp=fmtGBP(u.dueAmt/(CURRENCIES[activeCurrency].rate||1));
    return `<div class="upcoming-item">
      <div class="upcoming-icon">${u.v.icon||'💒'}</div>
      <div class="upcoming-info">
        <div class="upcoming-vendor">${esc(u.v.category)}${u.v.name?' — '+esc(u.v.name):''}</div>
        <div class="upcoming-date">${formatDate(u.v.due_date)} · <span class="due-badge ${cls}" style="font-size:9px">${lbl}</span></div>
      </div>
      <div>
        <div class="upcoming-amount">${fmtActive(u.dueAmt)}</div>
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
    const totalV=vTotalA(v);
    const paid=vPmts.reduce((s,p)=>s+pAmtA(p),0);
    const rem=Math.max(0,totalV-paid);
    const dv=vDueA(v);
    const dueAmt=(dv!==null&&dv>0)?dv:rem;
    if(dueAmt<=0.005||paid>=totalV-0.005) return null;
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
          <div style="font-size:13px;font-weight:600;color:var(--charcoal)">${fmtActive(u.dueAmt)}</div>
          ${fmtGBP(u.dueAmt/(CURRENCIES[activeCurrency].rate||1))?`<div style="font-size:10px;color:var(--muted)">${fmtGBP(u.dueAmt/(CURRENCIES[activeCurrency].rate||1))}</div>`:''}
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
  const rawCost=parseFloat(document.getElementById('newVendorTotal').value)||0;
  const gbpCost=rawCost/CURRENCIES[activeCurrency].rate; // always store in GBP
  const data={user_id:userId,icon:selectedIcon,
    category:document.getElementById('newVendorCategory').value.trim()||'Custom',
    name,total_cost:gbpCost,total_cost_original:rawCost,currency:activeCurrency,
    notes:document.getElementById('newVendorNotes').value.trim(),
    due_date:null,due_amount:null,due_note:''};
  const r=await DB.post('vendors',data,accessToken);
  vendors.push(r[0]);
  ['newVendorName','newVendorCategory','newVendorTotal','newVendorNotes'].forEach(id=>document.getElementById(id).value='');
  renderVendors();updateStats();updateVendorLimitUI();renderChart();showToast('Vendor added! 🎉');
}

async function deleteVendor(id){
  if(!confirm('Delete this vendor and all its payments?')) return;
  for(const p of payments.filter(p=>p.vendor_id===id)) await DB.del('payments',p.id,accessToken);
  await DB.del('vendors',id,accessToken);
  payments=payments.filter(p=>p.vendor_id!==id);
  vendors=vendors.filter(v=>v.id!==id);
  renderVendors();updateStats();updateVendorLimitUI();renderChart();showToast('Vendor deleted');
}

// ─── EDIT MODAL ──────────────────────────────────────────────────────────────
function openEditModal(id){
  const v=vendors.find(x=>x.id===id);if(!v) return;
  activeEditVendorId=id;
  document.getElementById('editVendorName').value=v.name||'';
  document.getElementById('editVendorCategory').value=v.category||'';
  document.getElementById('editVendorTotal').value=v.total_cost?(v.currency===activeCurrency&&v.total_cost_original!=null?v.total_cost_original:(v.total_cost*CURRENCIES[activeCurrency].rate).toFixed(2)):'';
  document.getElementById('editVendorNotes').value=v.notes||'';
  document.getElementById('editDueDate').value=v.due_date||'';
  document.getElementById('editDueAmount').value=v.due_amount?(v.currency===activeCurrency&&v.due_amount_original!=null?v.due_amount_original:(v.due_amount*CURRENCIES[activeCurrency].rate).toFixed(2)):'';
  document.getElementById('editDueNote').value=v.due_note||'';
  document.getElementById('editModal').style.display='flex';
}
function closeEditModal(){document.getElementById('editModal').style.display='none';activeEditVendorId=null;}
async function submitEdit(){
  const id=activeEditVendorId;const v=vendors.find(x=>x.id===id);if(!v) return;
  const rawTotal=parseFloat(document.getElementById('editVendorTotal').value)||0;
  const rawDueStr=document.getElementById('editDueAmount').value;
  const rawDue=rawDueStr?(parseFloat(rawDueStr)||0):null;
  const data={
    name:document.getElementById('editVendorName').value.trim(),
    category:document.getElementById('editVendorCategory').value.trim(),
    total_cost:rawTotal/CURRENCIES[activeCurrency].rate,
    total_cost_original:rawTotal,
    currency:activeCurrency,
    notes:document.getElementById('editVendorNotes').value.trim(),
    due_date:document.getElementById('editDueDate').value||null,
    due_amount:rawDue!==null?rawDue/CURRENCIES[activeCurrency].rate:null,
    due_amount_original:rawDue,
    due_note:document.getElementById('editDueNote').value.trim()
  };
  await DB.patch('vendors',id,data,accessToken);
  Object.assign(v,data);
  closeEditModal();renderVendors();updateStats();renderChart();showToast('Vendor updated ✓');
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
  // Convert to GBP for storage
  const gbpAmount=amount/CURRENCIES[activeCurrency].rate;
  const data={user_id:userId,vendor_id:activePaymentVendorId,
    amount:gbpAmount,amount_original:amount,currency:activeCurrency,payment_date:date,
    method:document.getElementById('pmtMethod').value,
    note:document.getElementById('pmtNote').value.trim()};
  const r=await DB.post('payments',data,accessToken);
  payments.push(r[0]);
  closePaymentModal();renderVendors();updateStats();renderChart();showToast('Payment recorded ✓');
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

// ─── PAYPAL & UPGRADE ────────────────────────────────────────────────────────



let paypalRendered = false;

function openUpgradeModal(){
  const modal = document.getElementById('upgradeModal');
  if(!modal) return;

  // One-time lifetime price (admin-configurable, defaults to £14.99)
  const price  = parseFloat(window.WL_SUB_PRICE || '14.99').toFixed(2);
  const amountEl = document.getElementById('upgradeAmount') || modal.querySelector('.upgrade-amount');
  if(amountEl) amountEl.textContent = '£' + price;

  modal.style.display='flex';
  if(typeof paypal !== 'undefined' && !paypalRendered){
    initPayPal();
  } else if(typeof paypal === 'undefined'){
    showPayPalFallback();
  }
}

function closeUpgradeModal(){
  document.getElementById('upgradeModal').style.display='none';
}

window.initPayPal = function(){
  if(typeof paypal === 'undefined'){
    showPayPalFallback();
    return;
  }

  const container = document.getElementById('paypalButtonContainer');
  if(!container) return;

  // Reset rendered state when plan changes
  container.innerHTML = '';
  paypalRendered = false;

  const fb = document.getElementById('paypalFallback');
  if(fb) fb.style.display = 'none';

  // Single one-time lifetime unlock
  const price = parseFloat(window.WL_SUB_PRICE || '14.99').toFixed(2);
  const dl = document.getElementById('paypalDirectLink');
  if(dl) dl.href = 'https://www.paypal.com/';

  paypal.Buttons({
    style:{ layout:'vertical', color:'gold', shape:'pill', label:'pay', height:48 },

    createOrder: function(data, actions){
      return actions.order.create({
        purchase_units:[{ amount:{ value: price, currency_code:'GBP' },
          description:'WeddingLedger Pro — Lifetime Access' }]
      });
    },

    onApprove: async function(data, actions){
      try{
        const paymentId = data.subscriptionID || data.orderID;
        await activatePro(paymentId, false);
        closeUpgradeModal();
        showToast("🎉 You're now Pro! All features unlocked.");
        renderVendors();
      } catch(e){
        showToast('Payment received but activation failed. Contact support.', true);
      }
    },

    onError: function(err){
      console.error('PayPal error:', err);
      showPayPalFallback();
      showToast('PayPal error — try the button below.', true);
    }

  }).render('#paypalButtonContainer')
    .then(()=>{ paypalRendered = true; })
    .catch(err=>{ console.error('PayPal render failed:', err); showPayPalFallback(); });
};

function showPayPalFallback(){
  const container = document.getElementById('paypalButtonContainer');
  if(!container) return;
  
  // Show both retry AND direct payment link
  container.innerHTML = `
    <div style="text-align:center;padding:16px;border:1px solid #e0d0c0;border-radius:12px;background:#fdf9f3">
      <p style="font-size:13px;color:#888;margin-bottom:12px">PayPal button failed to load</p>
      <button onclick="retryPayPal()" style="background:var(--gold);color:white;border:none;
        border-radius:99px;padding:11px 24px;font-family:'Instrument Sans',sans-serif;font-size:13px;
        font-weight:600;cursor:pointer;display:block;width:100%;margin-bottom:10px;">🔄 Retry PayPal</button>
      <div style="font-size:11px;color:#aaa;margin-bottom:10px">— or pay directly —</div>
      <a href="https://www.paypal.com/ncp/payment/REPLACE_WITH_PAYMENT_LINK" target="_blank"
        onclick="setTimeout(()=>{document.getElementById('manualActivationNotice').style.display='block'},3000)"
        style="display:block;background:#003087;color:white;border-radius:99px;padding:12px 24px;
        font-family:'Instrument Sans',sans-serif;font-size:13px;font-weight:600;text-decoration:none;text-align:center;">
        💳 Pay via PayPal
      </a>
      <p style="font-size:11px;color:#aaa;margin-top:8px">You'll be redirected to PayPal secure checkout</p>
    </div>`;
}

function retryPayPal(){
  // Reset and try loading SDK again
  const container = document.getElementById('paypalButtonContainer');
  if(container) container.innerHTML = '<div style="text-align:center;padding:12px;color:#888;font-size:13px">Loading PayPal…</div>';
  paypalRendered = false;
  
  // Remove old SDK script and reload
  const oldScript = document.querySelector('script[src*="paypal.com/sdk"]');
  if(oldScript) oldScript.remove();
  
  const s = document.createElement('script');
  s.src = document.querySelector('script[data-paypal-src]')?.dataset.paypalSrc || 
    'https://www.paypal.com/sdk/js?client-id=AcMxe9xGOHUIKBPp9c8yOL5XOc-eKbG3ydN4okrzXxnfICJQG3gk1598QcS2ERHQ9MDcQdmKiBo4IWX4&currency=GBP&intent=capture';
  s.onload = function(){ initPayPal(); };
  s.onerror = function(){ 
    if(container) container.innerHTML = '<div style="text-align:center;padding:12px;color:#c04040;font-size:13px">⚠️ PayPal unavailable — please try again later</div>';
  };
  document.head.appendChild(s);
}

async function activatePro(paymentId, isSubscription=false){
  try{
    const patch = {
      is_pro: true,
      paypal_order_id: paymentId,
      subscription_id: isSubscription ? paymentId : null,
      subscription_status: 'active',
      subscription_start: new Date().toISOString()
    };
    await DB.patch('profiles', profile.id, patch, accessToken);
    isPro = true;
    profile.is_pro = true;
    profile.subscription_status = 'active';
    profile.subscription_id = paymentId;
    closeUpgradeModal();
    updateProBadge();
    updateVendorLimitUI();
    renderVendors();
    // Confetti-style celebration
    showToast('🎉 Welcome to Pro! All features are now unlocked.');
  }catch(e){
    console.error('Activation error:', e);
    showToast('Payment received but activation failed — please contact support.', true);
  }
}

// Manual check for users who paid via redirect fallback
async function manualActivateCheck(){
  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = 'Checking…';
  btn.disabled = true;
  try{
    const rows = await DB.query(`profiles?user_id=eq.${userId}&select=is_pro,id`, accessToken);
    if(rows && rows[0] && rows[0].is_pro){
      isPro = true;
      profile.is_pro = true;
      closeUpgradeModal();
      updateProBadge();
      updateVendorLimitUI();
      renderVendors();
      showToast('🎉 Pro activated! All features unlocked.');
    } else {
      const notice = document.getElementById('manualActivationNotice');
      if(notice){
        notice.innerHTML = '<div style="font-size:14px;margin-bottom:8px">⏳ Payment not yet confirmed</div>' +
            '<p style="font-size:12px;color:#555;margin-bottom:10px;line-height:1.5">' +
            'Email your PayPal receipt to:<br><strong>pamupvt@gmail.com</strong><br>' +
            "We'll activate your Pro within a few hours.</p>" +
            '<button onclick="closeUpgradeModal()" style="background:var(--gold);color:white;border:none;' +
            'border-radius:99px;padding:9px 20px;font-family:sans-serif;font-size:13px;font-weight:600;cursor:pointer;">' +
            'Got it</button>';
      }
    }
  }catch(e){
    btn.textContent = originalText;
    btn.disabled = false;
    showToast('Could not check — try again.', true);
  }
}


// ─── STATS ───────────────────────────────────────────────────────────────────
function updateStats(){
  let total=0,paid=0,totalGBP=0,paidGBP=0;
  vendors.forEach(v=>{
    total+=vTotalA(v);
    totalGBP+=parseFloat(v.total_cost||0);
    const vp=payments.filter(p=>p.vendor_id===v.id);
    paid+=vp.reduce((s,p)=>s+pAmtA(p),0);
    paidGBP+=vp.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
  });
  const rem=total-paid,remGBP=totalGBP-paidGBP;
  const limA=spendLimitActive(), limGBP=spendLimit||0;
  const avail=limA>0?limA-total:null;
  const availGBP=limGBP>0?limGBP-totalGBP:null;
  const pct=limGBP>0?Math.min(100,Math.round((totalGBP/limGBP)*100)):0;

  setText('stat-total',fmtActive(total));
  setText('stat-paid',fmtActive(paid));
  setText('stat-remaining',fmtActive(rem));
  setText('stat-count',vendors.filter(v=>v.name).length);

  const setGBP=(id,val)=>{const el=document.getElementById(id);if(!el)return;const g=fmtGBP(val);el.textContent=g||'';el.style.display=g?'block':'none';};
  setGBP('stat-total-gbp',totalGBP);setGBP('stat-paid-gbp',paidGBP);setGBP('stat-remaining-gbp',remGBP);

  const fill=document.getElementById('progress-fill');
  if(fill){fill.style.width=pct+'%';fill.classList.toggle('danger',pct>=90);}
  setText('progress-pct',pct+'%');
  const gbpLine=v=>(activeCurrency!=='GBP'&&v!==null&&v!==undefined)?'<span class="sum-gbp">£'+Number(v).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})+'</span>':'';
  const setSum=(id,aVal,gVal)=>{const el=document.getElementById(id);if(el)el.innerHTML=fmtActive(aVal)+gbpLine(gVal);};
  setSum('sum-total',total,totalGBP);
  setSum('sum-paid',paid,paidGBP);
  setSum('sum-remaining',rem,remGBP);
  if(limA>0) setSum('sum-limit',limA,limGBP); else setText('sum-limit','Not set');
  const av=document.getElementById('sum-available');
  if(av){if(avail!==null){av.innerHTML=fmtActive(avail)+gbpLine(availGBP);av.style.color=avail>=0?'var(--sage)':'var(--danger)';}
  else{av.textContent='Set limit above';av.style.color='var(--muted)';}}
}

async function saveLimit(){
  // Entered in the ACTIVE currency; the exact typed amount is stored
  const input=parseFloat(document.getElementById('spendLimit').value)||0;
  await persistSpendLimit(input);
  const el=document.getElementById('settingsSpendLimit'); if(el) el.value=input||'';
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

// ─── PAYMENT TIMELINE ─────────────────────────────────────────────────────────

let timelineFilter = 'all';

function setTimelineFilter(f) {
  timelineFilter = f;
  ['all','paid','upcoming'].forEach(x => {
    const btn = document.getElementById('tl'+x.charAt(0).toUpperCase()+x.slice(1));
    if(btn) {
      btn.style.background = x===f ? 'var(--gold)' : 'var(--warm)';
      btn.style.color      = x===f ? 'white' : 'var(--charcoal)';
      btn.style.border     = x===f ? 'none' : '1.5px solid var(--border)';
    }
  });
  renderTimeline();
}

function renderTimeline() {
  const el = document.getElementById('paymentTimeline');
  if(!el) return;
  const today = new Date(); today.setHours(0,0,0,0);

  // Build combined list: actual payments + upcoming due amounts
  let items = [];

  // Actual payments
  payments.forEach(p => {
    const v = vendors.find(x => x.id === p.vendor_id);
    items.push({
      type:     'paid',
      date:     p.payment_date ? new Date(p.payment_date) : new Date(p.created_at),
      dateStr:  p.payment_date || p.created_at?.split('T')[0],
      amount:   parseFloat(p.amount||0),
      vendor:   v?.name || v?.category || 'Unknown',
      icon:     v?.icon || '💒',
      method:   p.method || 'Cash',
      note:     p.note || '',
      id:       p.id
    });
  });

  // Upcoming dues
  vendors.forEach(v => {
    if(v.due_amount && v.due_date) {
      const paidForVendor = payments.filter(p=>p.vendor_id===v.id).reduce((s,p)=>s+parseFloat(p.amount||0),0);
      const remaining = parseFloat(v.due_amount) - paidForVendor;
      if(remaining > 0) {
        items.push({
          type:    'upcoming',
          date:    new Date(v.due_date),
          dateStr: v.due_date,
          amount:  remaining,
          vendor:  v.name || v.category || 'Unknown',
          icon:    v.icon || '💒',
          method:  'Due',
          note:    v.due_note || '',
          id:      'due-'+v.id
        });
      }
    }
  });

  // Filter
  if(timelineFilter === 'paid')     items = items.filter(i => i.type === 'paid');
  if(timelineFilter === 'upcoming') items = items.filter(i => i.type === 'upcoming');

  // Sort by date descending
  items.sort((a,b) => b.date - a.date);

  if(!items.length) {
    el.innerHTML = `<div style="text-align:center;padding:32px;color:var(--muted);font-size:13px">No ${timelineFilter==='all'?'':''+timelineFilter+' '}payments yet</div>`;
    return;
  }

  // Group by month
  const groups = {};
  items.forEach(item => {
    const key = item.date.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    if(!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  el.innerHTML = Object.entries(groups).map(([month, its]) => `
    <div style="margin-bottom:20px">
      <div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;
        color:var(--muted);font-weight:600;margin-bottom:10px;padding-bottom:6px;
        border-bottom:1px solid var(--border)">${month}</div>
      ${its.map(item => `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;
          border-bottom:1px solid var(--border);last-child{border:none}">
          <div style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;
            justify-content:center;font-size:18px;flex-shrink:0;
            background:${item.type==='paid'?'#f0faf0':'#fff9e6'};
            border:2px solid ${item.type==='paid'?'#a0d0a0':'#f0d080'}">
            ${item.icon}
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
              <div style="font-size:13px;font-weight:600;color:var(--charcoal)">${esc(item.vendor)}</div>
              <div style="font-size:13px;font-weight:700;color:${item.type==='paid'?'var(--charcoal)':'var(--gold)'};white-space:nowrap">
                ${item.type==='upcoming'?'Due: ':''}${fmt(item.amount)}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:2px">
              <span style="font-size:11px;color:var(--muted)">${item.dateStr ? new Date(item.dateStr).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—'}</span>
              <span style="font-size:10px;padding:2px 8px;border-radius:99px;font-weight:600;
                background:${item.type==='paid'?'#e8f5e8':'#fff3cd'};
                color:${item.type==='paid'?'#2a5a2a':'#7a5a00'}">
                ${item.type==='paid'?item.method:'⏰ Upcoming'}
              </span>
            </div>
            ${item.note?`<div style="font-size:11px;color:var(--muted);font-style:italic;margin-top:3px">💬 ${esc(item.note)}</div>`:''}
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');
}

// ─── REFERRAL SYSTEM ──────────────────────────────────────────────────────────

function copyReferralCode() {
  const code = document.getElementById('myReferralCode')?.textContent;
  if(!code || code==='—') return;
  navigator.clipboard.writeText(code).then(()=>showToast('📋 Code copied!'));
}

function shareReferral() {
  const code = document.getElementById('myReferralCode')?.textContent;
  if(!code || code==='—') return;
  const url  = `${SITE_BASE}/index.html?ref=${code}`;
  const text = `Plan your wedding budget together! Use my referral code ${code} and we both get £2 off our first month 💍`;
  if(navigator.share) {
    navigator.share({ title:'WeddingLedger', text, url }).catch(()=>{});
  } else {
    navigator.clipboard.writeText(`${text}
${url}`).then(()=>showToast('🔗 Link copied!'));
  }
}

function loadReferralCode() {
  const el = document.getElementById('myReferralCode');
  if(el && profile?.referral_code) el.textContent = profile.referral_code;
}

// ─── WEDDING PAGE ─────────────────────────────────────────────────────────────

function updateWeddingPageUrl() {
  const slug = profile?.page_slug;
  const el = document.getElementById('weddingPageUrl');
  if(!el) return;
  if(slug) {
    const url = `${SITE_BASE}/wedding.html?slug=${slug}`;
    el.textContent = url;
    el.dataset.url = url;
  } else {
    el.textContent = 'Set your names in settings to generate your page URL';
  }
}

function copyWeddingUrl() {
  const url = document.getElementById('weddingPageUrl')?.dataset?.url;
  if(!url) { showToast('Set your names first to generate the URL', true); return; }
  navigator.clipboard.writeText(url).then(()=>showToast('💌 Wedding page URL copied!'));
}

function openWeddingPage() {
  const url = document.getElementById('weddingPageUrl')?.dataset?.url;
  if(!url) { showToast('Set your names first', true); return; }
  window.open(url, '_blank');
}




// ─── PARTNER LINKING ─────────────────────────────────────────────────────────

let partnerProfile = null;
let partnerPollTimer = null;

function openPartnerModal() {
  document.getElementById('partnerModal').style.display = 'flex';
  renderPartnerModal();
}
function closePartnerModal() {
  document.getElementById('partnerModal').style.display = 'none';
  if(partnerPollTimer) clearInterval(partnerPollTimer);
}

function renderPartnerModal() {
  const invite  = document.getElementById('partnerInviteSection');
  const pending = document.getElementById('partnerPendingSection');
  const linked  = document.getElementById('partnerLinkedSection');

  if(profile?.partner_id) {
    // Already linked
    invite.style.display = 'none'; pending.style.display = 'none'; linked.style.display = 'block';
    const emailEl = document.getElementById('linkedPartnerEmail');
    if(emailEl) emailEl.textContent = profile.partner_email || 'Your partner';
    updatePartnerBtn(true);
  } else if(profile?.partner_email && !profile?.partner_id) {
    // Invite pending
    invite.style.display = 'none'; linked.style.display = 'none'; pending.style.display = 'block';
    const pemailEl = document.getElementById('pendingPartnerEmail');
    if(pemailEl) pemailEl.textContent = profile.partner_email;
    // Poll every 5s to check if partner accepted
    if(partnerPollTimer) clearInterval(partnerPollTimer);
    partnerPollTimer = setInterval(checkIfPartnerAccepted, 5000);
  } else {
    // No invite yet
    invite.style.display = 'block'; pending.style.display = 'none'; linked.style.display = 'none';
    updatePartnerBtn(false);
  }
}

function updatePartnerBtn(linked) {
  const btn = document.getElementById('partnerBtn');
  if(!btn) return;
  if(linked) {
    btn.textContent = '💑 Partner Linked';
    btn.style.color = '#2a7a2a';
  } else {
    btn.textContent = '💌 Invite Partner';
    btn.style.color = 'var(--gold)';
  }
}

async function checkIfPartnerAccepted() {
  try {
    const rows = await DB.query(`profiles?user_id=eq.${userId}&select=partner_id,partner_email`, accessToken);
    if(rows && rows[0] && rows[0].partner_id) {
      profile.partner_id = rows[0].partner_id;
      profile.partner_email = rows[0].partner_email;
      clearInterval(partnerPollTimer);
      renderPartnerModal();
      showToast('💑 Partner accepted your invite!');
      // Reload data to get shared view
      await Promise.all([loadVendors(), loadPayments(), loadTasks()]);
      renderChart();
    }
  } catch(e) { console.error(e); }
}

async function sendPartnerInvite() {
  const email = document.getElementById('partnerEmail').value.trim();
  if(!email || !email.includes('@')) { showToast('Please enter a valid email', true); return; }
  if(email.toLowerCase() === (profile?.email || '').toLowerCase()) {
    showToast('You cannot invite yourself!', true); return;
  }

  const btn = document.querySelector('#partnerInviteSection .btn-primary');
  btn.textContent = 'Sending…'; btn.disabled = true;

  try {
    // Create invite record
    const r = await fetch(`${DB.SUPABASE_URL}/rest/v1/invites`, {
      method: 'POST',
      headers: { ...DB._h(accessToken), 'Prefer': 'return=representation' },
      body: JSON.stringify({ from_user_id: userId, to_email: email })
    });
    const rows = await r.json();
    if(!rows || !rows.length) throw new Error('Could not create invite');
    const invite = rows[0];

    // Save partner email to profile so we can show pending state
    await fetch(`${DB.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: { ...DB._h(accessToken), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ partner_email: email, invite_sent_at: new Date().toISOString() })
    });
    profile.partner_email = email;

    // Send invite email via Supabase Auth magic link (invites to the platform)
    const inviteUrl = `${SITE_BASE}/accept-invite.html?token=${invite.token}`;
    await fetch(`${DB.SUPABASE_URL}/auth/v1/magiclink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': DB.ANON_KEY },
      body: JSON.stringify({
        email,
        options: {
          emailRedirectTo: inviteUrl,
          data: { invite_token: invite.token, invite_url: inviteUrl }
        }
      })
    });

    // Fallback: also send a plain email with the invite link via Supabase
    // (The magic link above will include the redirect)
    showToast(`💌 Invite sent to ${email}!`);
    renderPartnerModal();
  } catch(e) {
    console.error(e);
    showToast('Could not send invite — please try again', true);
  } finally {
    btn.textContent = '💌 Send Invite Email'; btn.disabled = false;
  }
}

async function resendPartnerInvite() {
  const email = profile?.partner_email;
  if(!email) return;

  // Get existing pending invite token
  const rows = await DB.query(`invites?from_user_id=eq.${userId}&status=eq.pending&order=created_at.desc&limit=1`, accessToken);
  if(!rows || !rows.length) { showToast('No pending invite found', true); return; }

  const inviteUrl = `${SITE_BASE}/accept-invite.html?token=${rows[0].token}`;
  await fetch(`${DB.SUPABASE_URL}/auth/v1/magiclink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': DB.ANON_KEY },
    body: JSON.stringify({ email, options: { emailRedirectTo: inviteUrl } })
  });
  showToast(`💌 Invite resent to ${email}!`);
}

async function cancelPartnerInvite() {
  if(!confirm('Cancel the invite?')) return;
  // Mark invite expired
  await fetch(`${DB.SUPABASE_URL}/rest/v1/invites?from_user_id=eq.${userId}&status=eq.pending`, {
    method: 'PATCH',
    headers: { ...DB._h(accessToken), 'Prefer': 'return=minimal' },
    body: JSON.stringify({ status: 'expired' })
  });
  // Clear partner_email from profile
  await fetch(`${DB.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}`, {
    method: 'PATCH',
    headers: { ...DB._h(accessToken), 'Prefer': 'return=minimal' },
    body: JSON.stringify({ partner_email: null, invite_sent_at: null })
  });
  profile.partner_email = null;
  renderPartnerModal();
  showToast('Invite cancelled');
}

function confirmUnlinkPartner() {
  if(!confirm('Unlink your partner? You will both lose access to the shared budget.')) return;
  unlinkPartner();
}

async function unlinkPartner() {
  try {
    // Get own profile id
    const rows = await DB.query(`profiles?user_id=eq.${userId}&select=id`, accessToken);
    if(!rows||!rows.length) throw new Error('Profile not found');
    await fetch(`${DB.SUPABASE_URL}/rest/v1/rpc/unlink_partners`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': DB.ANON_KEY, 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ user_a: rows[0].id })
    });
    profile.partner_id = null;
    profile.partner_email = null;
    updatePartnerBtn(false);
    renderPartnerModal();
    closePartnerModal();
    showToast('Partner unlinked');
  } catch(e) {
    showToast('Could not unlink — try again', true);
  }
}

// When loading profile, check partner status and load shared data
async function loadPartnerData() {
  if(!profile?.partner_id) return;
  // Get partner's profile for display
  try {
    const rows = await DB.query(`profiles?id=eq.${profile.partner_id}&select=name1,name2,partner_email`, accessToken);
    if(rows && rows[0]) {
      partnerProfile = rows[0];
      profile.partner_email = profile.partner_email || rows[0].partner_email ||
        (rows[0].name1 ? rows[0].name1 + (rows[0].name2 ? ' & ' + rows[0].name2 : '') : 'Partner');
    }
    updatePartnerBtn(true);
  } catch(e) { console.error('Partner load error:', e); }
}

// ─── BUDGET CHART ────────────────────────────────────────────────────────────

let budgetChart = null;
let chartType = 'doughnut';

const CHART_COLORS = [
  '#C9A84C','#6F9A74','#C4674A','#5B7DB1','#8E5A8A',
  '#3F8E8C','#D08AA0','#E0A430','#9E4A5A','#7A8A4A',
  '#B87333','#3A5A80','#E07A5F','#9A8AC0','#4A7A50',
  '#6B7A8F','#B08AA8','#8A8A3F','#D0A060','#A05A3A'
];

function setChartType(type) {
  chartType = type;
  const btnD = document.getElementById('btnDoughnut');
  const btnB = document.getElementById('btnBar');
  if(btnD && btnB) {
    if(type === 'doughnut') {
      btnD.style.background = 'var(--gold)'; btnD.style.color = 'white';
      btnB.style.background = 'var(--warm)'; btnB.style.color = 'var(--charcoal)';
    } else {
      btnB.style.background = 'var(--gold)'; btnB.style.color = 'white';
      btnD.style.background = 'var(--warm)'; btnD.style.color = 'var(--charcoal)';
    }
  }
  renderChart();
}

function renderChart() {
  if(typeof Chart === 'undefined') { setTimeout(renderChart, 200); return; }  // deferred CDN still loading
  const canvas = document.getElementById('budgetChart');
  const empty  = document.getElementById('chartEmpty');
  if(!canvas) return;

  // Build category data
  const catMap = {};
  vendors.forEach(v => {
    if(!v.name || !v.total_cost) return;
    const cat = v.category || v.name;
    catMap[cat] = (catMap[cat] || 0) + vTotalA(v);
  });

  const labels = Object.keys(catMap);
  const data   = Object.values(catMap);

  if(!labels.length) {
    canvas.style.display = 'none';
    if(empty) empty.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  if(empty) empty.style.display = 'none';

  // Convert to active currency for display
  const displayData = data.map(v => parseFloat(v.toFixed(2))); // already in active currency
  const sym = CURRENCIES[activeCurrency].symbol;

  // Destroy existing chart
  if(budgetChart) { budgetChart.destroy(); budgetChart = null; }

  const ctx = canvas.getContext('2d');

  if(chartType === 'doughnut') {
    budgetChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: displayData, backgroundColor: CHART_COLORS.slice(0, labels.length),
          borderWidth: 2, borderColor: '#faf7f0', hoverOffset: 8 }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { font:{family:'Instrument Sans',size:12}, padding:16, color:'#5C4A2A' }},
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${sym}${ctx.parsed.toLocaleString()}` }}
        },
        cutout: '62%'
      }
    });
  } else {
    budgetChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: `Budget (${sym})`,
          data: displayData,
          backgroundColor: CHART_COLORS.slice(0, labels.length),
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${sym}${ctx.parsed.y.toLocaleString()}` }}
        },
        scales: {
          y: { ticks: { callback: v => sym + v.toLocaleString(), font:{family:'Instrument Sans'} },
               grid: { color: 'rgba(0,0,0,0.05)' }},
          x: { ticks: { font:{family:'Instrument Sans',size:11} }, grid: { display:false }}
        }
      }
    });
  }
}

// ─── PDF EXPORT ───────────────────────────────────────────────────────────────

async function exportPDF() {
  // Lazy-load jsPDF on first use (saves ~300kb on initial page load)
  if(typeof window.jspdf === 'undefined'){
    showToast('Loading PDF engine…');
    const s1 = document.createElement('script');
    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s1.onload = function(){
      const s2 = document.createElement('script');
      s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
      s2.onload = function(){ exportPDF(); };
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
    return;
  }
  const { jsPDF } = window.jspdf;
  if(!jsPDF) { showToast('PDF library not loaded yet — try again', true); return; }

  showToast('Generating PDF…');

  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const pageW = 210, pageH = 297, margin = 16;

  // jsPDF built-in fonts only support Latin characters — strip emoji/symbols
  const clean = s => String(s||'').replace(/[^\x20-\x7E\u00A0-\u00FF]/g,'').replace(/\s+/g,' ').trim();
  const c = CURRENCIES[activeCurrency];
  const dec = c.rate > 50 ? 0 : 2;
  const money = v => (activeCurrency==='GBP' ? '£' : clean(c.symbol)+' ')
    + Number(v||0).toLocaleString('en-GB',{minimumFractionDigits:dec,maximumFractionDigits:dec});

  // Theme colors
  const INK=[26,22,18], GOLD=[160,120,40], GOLD2=[201,168,76], MUTED=[102,90,73],
        SAGE=[42,106,58], ROSE=[184,48,48], CREAM=[250,247,242], PALE=[253,243,220];

  // ── EXACT DATA (uses the amounts you actually typed) ──
  const total = vendors.reduce((s,v)=>s+vTotalA(v),0);
  const paid  = payments.reduce((s,p)=>s+pAmtA(p),0);
  const rem   = total - paid;
  const pct   = total > 0 ? Math.round((paid/total)*100) : 0;
  const limA  = spendLimitActive();

  // ── HEADER ──
  doc.setFillColor(...CREAM);
  doc.rect(0, 0, pageW, 44, 'F');

  doc.setFont('helvetica','bolditalic'); doc.setFontSize(24); doc.setTextColor(...INK);
  doc.text('Wedding', margin, 17);
  const w1 = doc.getTextWidth('Wedding');
  doc.setTextColor(...GOLD);
  doc.text('Ledger', margin + w1, 17);

  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  doc.setTextColor(...GOLD);
  doc.text('W E D D I N G   B U D G E T   R E P O R T', margin, 24);

  const n1 = clean(profile?.name1||''), n2 = clean(profile?.name2||'');
  const coupleStr = n1 && n2 ? n1 + ' & ' + n2 : (n1 || n2 || 'Budget Report');
  doc.setFont('helvetica','bolditalic'); doc.setFontSize(14); doc.setTextColor(...INK);
  doc.text(coupleStr, margin, 33);

  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  const genStr = 'Generated ' + new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  doc.text(genStr, pageW - margin, 15, {align:'right'});
  if(profile?.wedding_date){
    const wd = new Date(profile.wedding_date + 'T00:00:00');
    doc.setFont('helvetica','bold'); doc.setTextColor(...INK);
    doc.text('Wedding day: ' + wd.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}), pageW - margin, 21, {align:'right'});
    const days = Math.max(0, Math.ceil((wd - new Date())/86400000));
    doc.setFont('helvetica','normal'); doc.setTextColor(...GOLD);
    doc.text(days + ' days to go', pageW - margin, 27, {align:'right'});
  }

  doc.setDrawColor(...GOLD2); doc.setLineWidth(0.7);
  doc.line(margin, 44, pageW - margin, 44);

  let y = 52;

  // ── SUMMARY CARDS ──
  const stats = [
    { label:'TOTAL BUDGET', value: money(total), color: INK },
    { label:'TOTAL PAID',   value: money(paid),  color: SAGE },
    { label:'REMAINING',    value: money(rem),   color: rem > 0.005 ? ROSE : SAGE },
    { label:'BUDGET PAID',  value: pct + '%',    color: GOLD },
  ];
  const gap = 4, boxW = (pageW - margin*2 - gap*3) / 4, boxH = 21;
  stats.forEach((s, i) => {
    const x = margin + i * (boxW + gap);
    doc.setFillColor(...CREAM);
    doc.setDrawColor(232,221,208); doc.setLineWidth(0.3);
    doc.roundedRect(x, y, boxW, boxH, 2.5, 2.5, 'FD');
    doc.setFontSize(6.3); doc.setTextColor(...MUTED); doc.setFont('helvetica','bold');
    doc.text(s.label, x + boxW/2, y + 7, {align:'center', charSpace:0.5});
    doc.setFontSize(11.5); doc.setFont('helvetica','bold'); doc.setTextColor(...s.color);
    doc.text(s.value, x + boxW/2, y + 15.5, {align:'center'});
  });
  y += boxH + 7;

  // ── PROGRESS BAR ──
  doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(...MUTED);
  doc.text('BUDGET USED', margin, y + 1, {charSpace:0.5});
  doc.text(pct + '%', pageW - margin, y + 1, {align:'right'});
  y += 3;
  const barW = pageW - margin*2;
  doc.setFillColor(238,231,220);
  doc.roundedRect(margin, y, barW, 3, 1.5, 1.5, 'F');
  if(pct > 0){
    doc.setFillColor(...(pct >= 90 ? ROSE : GOLD2));
    doc.roundedRect(margin, y, Math.max(3, barW * Math.min(100,pct)/100), 3, 1.5, 1.5, 'F');
  }
  y += 8;

  // ── SPEND LIMIT LINE ──
  if(limA > 0){
    doc.setFontSize(8.5); doc.setFont('helvetica','normal'); doc.setTextColor(...MUTED);
    const availA = limA - total;
    doc.setFont('helvetica','bold'); doc.setTextColor(...INK);
    doc.text('Spend limit: ' + money(limA), margin, y);
    doc.setTextColor(...(availA >= 0 ? SAGE : ROSE));
    doc.text('Available: ' + money(availA), pageW - margin, y, {align:'right'});
    y += 7;
  }

  // ── BUDGET CHART (keep aspect ratio, centred) ──
  const chartCanvas = document.getElementById('budgetChart');
  if(chartCanvas && chartCanvas.width > 0 && vendors.some(v => vTotalA(v) > 0)) {
    try {
      const imgData = chartCanvas.toDataURL('image/png');
      const ratio = chartCanvas.height / chartCanvas.width;
      let imgW = pageW - margin*2 - 40;
      let imgH = imgW * ratio;
      const maxH = 72;
      if(imgH > maxH){ imgH = maxH; imgW = imgH / ratio; }
      doc.addImage(imgData, 'PNG', (pageW - imgW)/2, y, imgW, imgH);
      y += imgH + 8;
    } catch(e) { console.log('Chart not captured:', e); }
  }

  // ── VENDOR BREAKDOWN ──
  const heading = (title) => {
    doc.setFontSize(13); doc.setFont('helvetica','bolditalic'); doc.setTextColor(...INK);
    doc.text(title, margin, y);
    doc.setDrawColor(...GOLD2); doc.setLineWidth(0.5);
    doc.line(margin, y + 1.8, margin + doc.getTextWidth(title), y + 1.8);
    y += 7;
  };
  if(y > 230){ doc.addPage(); y = margin + 4; }
  heading('Vendor Breakdown');

  const namedVendors = vendors.filter(v => v.name);
  const tableRows = namedVendors.map(v => {
      const vTotal = vTotalA(v);
      const vPaid  = payments.filter(p=>p.vendor_id===v.id).reduce((s,p)=>s+pAmtA(p),0);
      const vRem   = Math.max(0, vTotal - vPaid);
      const status = vTotal > 0 && vPaid >= vTotal - 0.005 ? 'Paid'
                   : vPaid > 0.005 ? 'Partial' : 'Not Paid';
      return [ clean(v.name) || '-', clean(v.category) || '-',
               money(vTotal), money(vPaid), money(vRem), status ];
    });
  const sumPaid = namedVendors.reduce((s,v)=>s+payments.filter(p=>p.vendor_id===v.id).reduce((a,p)=>a+pAmtA(p),0),0);
  const sumTotal = namedVendors.reduce((s,v)=>s+vTotalA(v),0);

  if(tableRows.length) {
    doc.autoTable({
      startY: y,
      head: [['Vendor','Category','Total','Paid','Remaining','Status']],
      body: tableRows,
      foot: [['Total','', money(sumTotal), money(sumPaid), money(Math.max(0,sumTotal-sumPaid)), '']],
      theme: 'plain',
      styles: { font:'helvetica', fontSize:8.5, cellPadding:{top:2.8,bottom:2.8,left:2.5,right:2.5}, textColor:[42,34,24], lineColor:[236,228,216], lineWidth:{bottom:0.2} },
      headStyles: { fillColor:GOLD2, textColor:[255,255,255], fontStyle:'bold', fontSize:8 },
      footStyles: { fillColor:PALE, textColor:INK, fontStyle:'bold', fontSize:8.5 },
      alternateRowStyles: { fillColor:[252,250,246] },
      columnStyles: { 0:{cellWidth:42,fontStyle:'bold'}, 1:{cellWidth:30}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right'}, 5:{cellWidth:18,halign:'center'} },
      didParseCell: d => {
        if(d.section==='body' && d.column.index===5){
          const t = d.cell.raw;
          d.cell.styles.textColor = t==='Paid' ? SAGE : t==='Partial' ? GOLD : MUTED;
          d.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left:margin, right:margin }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ── PAYMENT HISTORY ──
  if(payments.length) {
    if(y > 240) { doc.addPage(); y = margin + 4; }
    heading('Payment History');

    const pmtRows = payments.slice()
      .sort((a,b) => new Date(b.payment_date||0) - new Date(a.payment_date||0))
      .map(p => {
        const vendor = vendors.find(v=>v.id===p.vendor_id);
        return [
          vendor ? (clean(vendor.name) || clean(vendor.category) || '-') : '-',
          money(pAmtA(p)),
          p.payment_date ? new Date(p.payment_date+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '-',
          clean(p.method) || '-',
          clean(p.note) || ''
        ];
      });

    doc.autoTable({
      startY: y,
      head: [['Vendor','Amount','Date','Method','Note']],
      body: pmtRows,
      theme: 'plain',
      styles: { font:'helvetica', fontSize:8.5, cellPadding:{top:2.8,bottom:2.8,left:2.5,right:2.5}, textColor:[42,34,24], lineColor:[236,228,216], lineWidth:{bottom:0.2} },
      headStyles: { fillColor:[42,34,24], textColor:[255,255,255], fontStyle:'bold', fontSize:8 },
      alternateRowStyles: { fillColor:[252,250,246] },
      columnStyles: { 0:{fontStyle:'bold'}, 1:{halign:'right'} },
      margin: { left:margin, right:margin }
    });
  }

  // ── FOOTER on each page ──
  const pageCount = doc.internal.getNumberOfPages();
  for(let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(236,228,216); doc.setLineWidth(0.2);
    doc.line(margin, 288, pageW - margin, 288);
    doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.setFont('helvetica','italic');
    doc.text('WeddingLedger', margin, 292.5);
    doc.setFont('helvetica','normal');
    doc.text(SITE_BASE.replace(/^https?:\/\//,''), pageW/2, 292.5, {align:'center'});
    doc.text('Page ' + i + ' of ' + pageCount, pageW - margin, 292.5, {align:'right'});
  }

  // ── SAVE ──
  const fileName = 'WeddingLedger_' + (coupleStr.replace(/[^A-Za-z0-9]+/g,'_') || 'Report') + '.pdf';
  doc.save(fileName);
  showToast('PDF downloaded');
}

// ─── PASSWORD RESET & ACCOUNT RESET ─────────────────────────────────────────

async function sendPasswordReset(){
  const btn = event.target;
  btn.textContent = 'Sending…'; btn.disabled = true;
  try {
    // Get user email from Supabase auth
    const r = await fetch(`${DB.SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': DB.ANON_KEY, 'Authorization': `Bearer ${accessToken}` }
    });
    const user = await r.json();
    const email = user.email;
    if(!email) throw new Error('Could not get email');

    const res = await fetch(`${DB.SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': DB.ANON_KEY },
      body: JSON.stringify({ email })
    });
    if(!res.ok) throw new Error('Reset failed');
    showToast(`✅ Password reset email sent to ${email}`);
    btn.textContent = '✅ Email sent!';
    setTimeout(()=>{ btn.textContent='🔑 Reset Password — send email link'; btn.disabled=false; }, 4000);
  } catch(e) {
    showToast('Could not send reset email — try again', true);
    btn.textContent = '🔑 Reset Password — send email link'; btn.disabled = false;
  }
}

function confirmResetData(){
  const confirmed = window.confirm(
    '⚠️ Are you sure you want to delete ALL your vendors, payments and tasks?\n\nThis cannot be undone. Your account and settings will be kept.'
  );
  if(confirmed) resetAllData();
}

async function resetAllData(){
  showToast('Resetting data…');
  try {
    // Delete all payments first
    for(const p of [...payments]){
      await DB.del('payments', p.id, accessToken);
    }
    payments = [];

    // For vendors: clear their data but keep the 5 default ones
    const DEFAULT_CATEGORIES = ['Wedding Planner','Venue','Catering','Photography','Music / DJ'];
    const toDelete = [];
    const toKeep = [];

    // Sort: keep up to 5 that match default categories, delete the rest
    let kept = 0;
    for(const v of [...vendors]){
      if(kept < 5 && DEFAULT_CATEGORIES.includes(v.category)){
        toKeep.push(v);
        kept++;
      } else {
        toDelete.push(v);
      }
    }

    // Delete extra vendors
    for(const v of toDelete){
      await DB.del('vendors', v.id, accessToken);
    }

    // Clear kept vendors' data (reset name, cost, notes, due date)
    for(const v of toKeep){
      await fetch(`${DB.SUPABASE_URL}/rest/v1/vendors?id=eq.${v.id}`, {
        method:'PATCH',
        headers:{...DB._h(accessToken),'Prefer':'return=minimal'},
        body:JSON.stringify({name:'', total_cost:0, notes:'', due_date:null, due_amount:null, due_note:''})
      });
      v.name=''; v.total_cost=0; v.notes=''; v.due_date=null; v.due_amount=null; v.due_note='';
    }

    vendors = toKeep;

    // Delete all tasks
    for(const t of [...tasks]){
      await DB.del('tasks', t.id, accessToken);
    }
    tasks = [];

    // Reset spend limit
    spendLimit = 0;
    await DB.upsertSetting(userId,'spend_limit','0',accessToken);
    const el=document.getElementById('spendLimit'); if(el) el.value='';
    const el2=document.getElementById('settingsSpendLimit'); if(el2) el2.value='';

    renderVendors(); updateStats();
    closeSettingsModal();
    showToast('✅ Data reset — 5 default vendors kept');
  } catch(e) {
    showToast('Reset failed — please try again', true);
    console.error(e);
  }
}

// ─── WELCOME SETUP MODAL ─────────────────────────────────────────────────────
function openWelcomeModal() {
  const m = document.getElementById('welcomeModal');
  if (!m) return;
  // Pre-fill if data exists
  if (profile) {
    const n1 = document.getElementById('setupName1');
    const n2 = document.getElementById('setupName2');
    const d  = document.getElementById('setupDate');
    if (n1) n1.value = profile.name1||'';
    if (n2) n2.value = profile.name2||'';
    if (d)  d.value  = profile.wedding_date||'';
  }
  m.style.display = 'flex';
}

async function saveWelcomeSetup() {
  const n1  = document.getElementById('setupName1').value.trim();
  const n2  = document.getElementById('setupName2').value.trim();
  const wd  = document.getElementById('setupDate').value;
  const bud = document.getElementById('setupBudget').value;

  if (!n1) { showToast('Please enter at least your name', true); return; }

  const btn = document.querySelector('#welcomeModal .btn-primary');
  btn.textContent = 'Saving…'; btn.disabled = true;
  try {
    // Update profile
    await fetch(`${DB.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}`, {
      method:'PATCH',
      headers:{...DB._h(accessToken),'Prefer':'return=minimal'},
      body:JSON.stringify({name1:n1, name2:n2, wedding_date:wd||null})
    });
    profile.name1=n1; profile.name2=n2; profile.wedding_date=wd||null;
    // Save budget limit if set
    if (bud) {
      const typed = parseFloat(bud)||0;
      await persistSpendLimit(typed);
      const el=document.getElementById('spendLimit'); if(el) el.value=typed;
      const sl=document.getElementById('settingsSpendLimit'); if(sl) sl.value=typed;
    }
    renderHero();
    updateStats();
    document.getElementById('welcomeModal').style.display='none';
    showToast(`Welcome, ${n1}${n2?' & '+n2:''}! 🎉`);
  } catch(e) {
    showToast('Could not save — please try again', true);
    console.error(e);
  } finally {
    btn.textContent='Save & Start Planning 🎉'; btn.disabled=false;
  }
}

// ─── SETTINGS MODAL ──────────────────────────────────────────────────────────
function openSettingsModal() {
  const m = document.getElementById('settingsModal');
  if (!m) { window.location.href='settings.html'; return; }
  loadGalleryPhotos().then(()=>{
    if(window.renderDashPhotoStrip) window.renderDashPhotoStrip(galleryPhotos);
  });
  // Pre-fill with current values
  const n1 = document.getElementById('settingsName1');
  const n2 = document.getElementById('settingsName2');
  const d  = document.getElementById('settingsDate');
  const sl = document.getElementById('settingsSpendLimit');
  const sn = document.getElementById('settingsNotes');
  if (n1) n1.value = profile?.name1||'';
  if (n2) n2.value = profile?.name2||'';
  if (d)  d.value  = profile?.wedding_date||'';
  if (sl) sl.value = spendLimitFieldValue();
  if (sn) sn.value = notes||'';
  m.style.display='flex';
}

function closeSettingsModal() {
  document.getElementById('settingsModal').style.display='none';
}

async function saveProfileSettings() {
  const n1 = document.getElementById('settingsName1').value.trim();
  const n2 = document.getElementById('settingsName2').value.trim();
  const wd = document.getElementById('settingsDate').value;
  if (!n1) { showToast('Please enter your name', true); return; }
  const btn = document.querySelector('#settingsModal .btn-primary');
  btn.textContent='Saving…'; btn.disabled=true;
  try {
    // Generate slug from names
    const slug = (n1 + (n2?'-'+n2:'')).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const pageMsg = document.getElementById('settingsPageMessage')?.value.trim()||null;
    await fetch(`${DB.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}`, {
      method:'PATCH',
      headers:{...DB._h(accessToken),'Prefer':'return=minimal'},
      body:JSON.stringify({name1:n1, name2:n2, wedding_date:wd||null, page_slug:slug, page_message:pageMsg})
    });
    profile.name1=n1; profile.name2=n2; profile.wedding_date=wd||null; profile.page_slug=slug; profile.page_message=pageMsg;
    updateWeddingPageUrl();
    renderHero(); updateStats();
    showToast('Profile saved ✓');
  } catch(e) { showToast('Save failed', true); }
  finally { btn.textContent='Save Profile'; btn.disabled=false; }
}

async function saveSpendLimitFromSettings() {
  // Entered in the ACTIVE currency; the exact typed amount is stored
  const val = parseFloat(document.getElementById('settingsSpendLimit').value)||0;
  await persistSpendLimit(val);
  const el=document.getElementById('spendLimit'); if(el) el.value=val||'';
  updateStats(); showToast('Budget limit saved ✓');
}

async function saveNotesFromSettings() {
  const val = document.getElementById('settingsNotes').value.trim();
  notes = val;
  await DB.upsertSetting(userId,'wedding_notes',val,accessToken);
  const el=document.getElementById('weddingNotes'); if(el) el.value=val;
  showToast('Notes saved ✓');
}

// updateWeddingPageUrl called from init() after loadProfile()



// ── Gallery Photos ─────────────────────────────────────────────────────────────
let galleryPhotos = [];

async function loadGalleryPhotos() {
  galleryPhotos = [];
  try {
    const tok = await DB.getValidToken(localStorage.getItem('wl_token'));
    const uid = localStorage.getItem('wl_uid');
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${uid}&select=gallery_photos`, {
      headers: DB._h(tok)
    });
    const d = await r.json();
    if(d && d[0] && d[0].gallery_photos) {
      galleryPhotos = Array.isArray(d[0].gallery_photos)
        ? d[0].gallery_photos : JSON.parse(d[0].gallery_photos || '[]');
    }
  } catch(e) { console.error('loadGallery', e); }
  renderGalleryPreview();
}

function renderGalleryPreview() {
  const wrap = document.getElementById('galleryPreview');
  if(!wrap) return;
  if(!galleryPhotos.length) {
    wrap.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:12px;font-size:12px;color:var(--muted);font-style:italic">No photos yet — upload up to 6</div>';
    return;
  }
  wrap.innerHTML = galleryPhotos.map((p,i) => `
    <div style="position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)">
      <img src="${p.url}" style="width:100%;height:100%;object-fit:cover" loading="lazy">
      <button onclick="deleteGalleryPhoto(${i})"
        style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;
        border:none;background:rgba(0,0,0,.55);color:white;font-size:11px;cursor:pointer;
        display:flex;align-items:center;justify-content:center">✕</button>
    </div>`).join('') +
    (galleryPhotos.length < 6 ? `
    <label style="aspect-ratio:1;border-radius:10px;border:2px dashed var(--border);
      display:flex;align-items:center;justify-content:center;cursor:pointer;
      background:var(--warm);color:var(--muted);font-size:22px;transition:.2s"
      onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'">
      +<input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" multiple
        style="display:none" onchange="uploadGalleryPhotos(this)">
    </label>` : '');
}

async function uploadGalleryPhotos(input) {
  const files = Array.from(input.files);
  if(!files.length) return;
  const canAdd = 6 - galleryPhotos.length;
  const toUpload = files.slice(0, canAdd);

  const prog = document.getElementById('photoUploadProgress');
  const bar  = document.getElementById('photoProgressBar');
  const txt  = document.getElementById('photoProgressText');
  if(prog) prog.style.display = 'block';

  const tok = await DB.getValidToken(localStorage.getItem('wl_token'));
  const uid = localStorage.getItem('wl_uid');
  let done = 0;

  for(const file of toUpload) {
    try {
      if(txt) txt.textContent = `Uploading ${file.name}…`;
      // Compress if over 2MB
      const blob = file.size > 2*1024*1024 ? await compressImage(file, 0.8) : file;
      const ext  = file.name.split('.').pop().toLowerCase();
      const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/wedding-photos/${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tok}`,
          'Content-Type': file.type,
          'x-upsert': 'true'
        },
        body: blob
      });

      if(r.ok) {
        const url = `${SUPABASE_URL}/storage/v1/object/public/wedding-photos/${path}`;
        galleryPhotos.push({ url, path });
        done++;
        if(bar) bar.style.width = (done / toUpload.length * 100) + '%';
      } else {
        const err = await r.text();
        console.error('Upload failed:', r.status, err);
        showToast('Upload failed: ' + r.status);
      }
    } catch(e) {
      console.error('Upload error:', e);
      showToast('Upload error: ' + e.message);
    }
  }

  if(done > 0) {
    await saveGalleryPhotos();
    showToast(`📸 ${done} photo(s) uploaded!`);
    if(window.renderDashPhotoStrip) window.renderDashPhotoStrip(galleryPhotos);
  }

  if(prog) { prog.style.display = 'none'; if(bar) bar.style.width = '0%'; }
  input.value = '';
  renderGalleryPreview();
}

async function compressImage(file, quality) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const max = 1600;
      let w = img.width, h = img.height;
      if(w > max) { h = h * max / w; w = max; }
      if(h > max) { w = w * max / h; h = max; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => { URL.revokeObjectURL(url); resolve(blob); }, 'image/jpeg', quality);
    };
    img.src = url;
  });
}

async function deleteGalleryPhoto(idx) {
  const p = galleryPhotos[idx];
  if(!p) return;
  try {
    const tok = await DB.getValidToken(localStorage.getItem('wl_token'));
    await fetch(`${SUPABASE_URL}/storage/v1/object/wedding-photos/${p.path}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tok}` }
    });
  } catch(e) { console.error('delete photo', e); }
  galleryPhotos.splice(idx, 1);
  await saveGalleryPhotos();
  renderGalleryPreview();
  if(window.renderDashPhotoStrip) window.renderDashPhotoStrip(galleryPhotos);
  showToast('Photo removed');
}

async function saveGalleryPhotos() {
  try {
    const tok = await DB.getValidToken(localStorage.getItem('wl_token'));
    const uid = localStorage.getItem('wl_uid');
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${uid}`, {
      method: 'PATCH',
      headers: { ...DB._h(tok), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ gallery_photos: galleryPhotos })
    });
    if(!r.ok) { const t=await r.text(); console.error('saveGallery failed',r.status,t); }
  } catch(e) { console.error('saveGallery', e); }
}

// ── MOBILE NAV ────────────────────────────────────────────────────────────────
function openMobileNav() {
  const overlay = document.getElementById('mobileNavOverlay');
  const drawer  = document.getElementById('mobileNavDrawer');
  if(!overlay || !drawer) return;
  overlay.classList.add('open');
  drawer.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeMobileNav() {
  const overlay = document.getElementById('mobileNavOverlay');
  const drawer  = document.getElementById('mobileNavDrawer');
  if(!overlay || !drawer) return;
  overlay.classList.remove('open');
  drawer.classList.remove('open');
  document.body.style.overflow = '';
}

// ── BOOT ────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
