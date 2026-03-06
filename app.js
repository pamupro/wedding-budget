/**
 * app.js — WeddingLedger Dashboard
 * Multi-user, auth-gated, with due dates + share link
 */

const ICONS = ['💒','🌸','📸','🎥','💐','🎵','💎','💄','💇','👗','🥂','🍰','🚗','✈️','🏨','📋','📝','💌','🎪','🎭','🕯️','🌹','👰','🤵'];

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

// ─── STATE ────────────────────────────────────────────────────────────────────
let vendors = [], payments = [], tasks = [];
let notes = '', spendLimit = 0, shareToken = null, shareEnabled = false;
let selectedIcon = '💒';
let activePaymentVendorId = null, activeEditVendorId = null;
let userId = null, accessToken = null, profile = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  // Auth check
  userId = localStorage.getItem('wl_uid');
  accessToken = localStorage.getItem('wl_token');
  if (!userId || !accessToken) { window.location.href = 'login.html'; return; }

  renderIconSelector();
  countdown && countdown();

  try {
    await loadProfile();
    await Promise.all([loadVendors(), loadPayments(), loadTasks(), loadSettings()]);
  } catch(e) {
    console.error(e);
    if (e.message && e.message.includes('JWT')) {
      doLogout(); return;
    }
    showToast('Error loading data: ' + e.message, true);
  }
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function doLogout() {
  localStorage.removeItem('wl_token');
  localStorage.removeItem('wl_uid');
  
  window.location.href = 'login.html';
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
async function loadProfile() {
  const rows = await DB.query(`profiles?user_id=eq.${userId}&select=*`, accessToken);
  if (rows && rows.length) {
    profile = rows[0];
    const n1 = profile.name1 || '', n2 = profile.name2 || '';
    const coupleEl = document.getElementById('coupleNames');
    if (coupleEl && (n1 || n2)) coupleEl.textContent = n1 && n2 ? `${n1} & ${n2}` : n1 || n2;

    // Pre-fill countdown with wedding date from profile
    if (profile.wedding_date) weddingDate = new Date(profile.wedding_date + 'T09:00:00');
  }
}

// ─── LOAD DATA ────────────────────────────────────────────────────────────────
async function loadVendors() {
  vendors = await DB.query(`vendors?user_id=eq.${userId}&order=created_at.asc`, accessToken);
  if (!vendors.length) {
    for (const v of DEFAULT_VENDORS) {
      const row = await DB.post('vendors', { user_id: userId, category: v.category, icon: v.icon, name: '', total_cost: 0, notes: '', due_date: null, due_amount: null, due_note: '' }, accessToken);
      vendors.push(row[0]);
    }
  }
  renderVendors(); updateStats();
}

async function loadPayments() {
  payments = await DB.query(`payments?user_id=eq.${userId}&order=payment_date.asc`, accessToken);
  renderVendors(); updateStats();
}

async function loadTasks() {
  tasks = await DB.query(`tasks?user_id=eq.${userId}&order=created_at.asc`, accessToken);
  if (!tasks.length) {
    for (const text of DEFAULT_TASKS) {
      const row = await DB.post('tasks', { user_id: userId, text, done: false }, accessToken);
      tasks.push(row[0]);
    }
  }
  renderTasks();
}

async function loadSettings() {
  const rows = await DB.query(`settings?user_id=eq.${userId}`, accessToken);
  rows.forEach(r => {
    if (r.key === 'spend_limit') { spendLimit = parseFloat(r.value) || 0; const el = document.getElementById('spendLimit'); if(el) el.value = spendLimit || ''; }
    if (r.key === 'wedding_notes') { notes = r.value; const el = document.getElementById('weddingNotes'); if(el) el.value = notes; }
    if (r.key === 'share_token') shareToken = r.value;
    if (r.key === 'share_enabled') shareEnabled = r.value === 'true';
  });
  updateStats();
}

// ─── VENDORS ─────────────────────────────────────────────────────────────────
function renderVendors() {
  const grid = document.getElementById('vendorsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const upcoming = [];

  vendors.forEach((v, idx) => {
    const vPayments = payments.filter(p => p.vendor_id === v.id);
    const totalPaid = vPayments.reduce((s,p) => s + parseFloat(p.amount||0), 0);
    const remaining = Math.max(0, (v.total_cost||0) - totalPaid);

    let statusClass = 'status-pending', statusText = 'Not Paid';
    if (v.total_cost > 0 && totalPaid >= v.total_cost) { statusClass='status-paid'; statusText='Fully Paid'; }
    else if (totalPaid > 0) { statusClass='status-partial'; statusText='Partially Paid'; }

    // Due date badge
    let dueBadgeHtml = '', duePanelHtml = '';
    if (v.due_date) {
      const dueDate = new Date(v.due_date);
      const today = new Date(); today.setHours(0,0,0,0);
      const diffDays = Math.round((dueDate - today) / 86400000);
      const dueAmt = v.due_amount ? parseFloat(v.due_amount) : remaining;
      const alreadyPaid = dueAmt <= 0 || totalPaid >= (v.total_cost||0);

      if (!alreadyPaid) {
        upcoming.push({ v, dueDate, diffDays, dueAmt });
        let cls = 'due-upcoming', label = `Due ${formatDate(v.due_date)}`;
        if (diffDays < 0) { cls='due-overdue'; label=`Overdue by ${Math.abs(diffDays)}d`; }
        else if (diffDays <= 7) { cls='due-soon'; label=`Due in ${diffDays}d`; }
        else if (diffDays <= 30) { cls='due-upcoming'; label=`Due in ${diffDays}d`; }
        dueBadgeHtml = `<span class="due-badge ${cls}">📅 ${label}</span>`;
        duePanelHtml = `
          <div style="background:rgba(201,168,76,0.05);border:1px solid rgba(201,168,76,0.2);border-radius:8px;padding:10px 12px;margin-top:8px;">
            <div style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">Due Payment</div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
              <div style="font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--charcoal);font-weight:600;">LKR ${fmtNum(dueAmt)}</div>
              <div style="font-size:12px;color:var(--muted);">by ${formatDate(v.due_date)}</div>
              ${v.due_note ? `<div style="font-size:11px;color:var(--muted);width:100%">${escHtml(v.due_note)}</div>` : ''}
            </div>
          </div>`;
      }
    }

    // Payment rows
    let pmtRows = vPayments.length
      ? vPayments.map(p => `
          <div class="payment-item">
            <span class="payment-item-amount">LKR ${fmtNum(p.amount)}</span>
            <span class="payment-item-date">${formatDate(p.payment_date)}</span>
            <span class="payment-item-method">${escHtml(p.method||'')}</span>
            <span class="payment-item-note">${escHtml(p.note||'')}</span>
            <button class="payment-delete-btn" onclick="deletePayment('${p.id}')">✕</button>
          </div>`).join('')
      : '<div class="no-payments">No payments recorded yet.</div>';

    const card = document.createElement('div');
    card.className = 'vendor-card';
    card.style.animationDelay = (idx*0.03)+'s';
    card.innerHTML = `
      <div class="vendor-card-header">
        <div class="vendor-icon">${v.icon||'💒'}</div>
        <div class="vendor-name-wrap">
          <div class="vendor-category">${escHtml(v.category||'Vendor')}</div>
          <div class="vendor-name-display">${v.name ? escHtml(v.name) : '<span style="color:var(--muted);font-style:italic;font-size:14px">Not yet assigned</span>'}</div>
        </div>
        <div class="vendor-actions">
          <button class="vendor-action-btn edit" onclick="openEditModal('${v.id}')" title="Edit">✏️</button>
          <button class="vendor-action-btn" onclick="deleteVendor('${v.id}')" title="Delete">🗑</button>
        </div>
      </div>
      <div class="vendor-card-body">
        <div class="vendor-amounts-row">
          <div class="amount-badge"><div class="amount-badge-label">Total Cost</div><div class="amount-badge-value">LKR ${fmtNum(v.total_cost)}</div></div>
          <div class="amount-badge"><div class="amount-badge-label">Total Paid</div><div class="amount-badge-value paid-color">LKR ${fmtNum(totalPaid)}</div></div>
          <div class="amount-badge"><div class="amount-badge-label">Remaining</div><div class="amount-badge-value remain-color">LKR ${fmtNum(remaining)}</div></div>
        </div>
        ${duePanelHtml}
        <div class="payments-section">
          <div class="payments-title">📜 Payment History <span style="color:var(--gold);font-weight:600">(${vPayments.length})</span></div>
          <div class="payments-list">${pmtRows}</div>
        </div>
      </div>
      <div class="vendor-card-footer">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <div class="vendor-status ${statusClass}"><div class="status-dot"></div>${statusText}</div>
          ${dueBadgeHtml}
        </div>
        <button class="add-payment-btn" onclick="openPaymentModal('${v.id}')">+ Add Payment</button>
      </div>`;
    grid.appendChild(card);
  });

  renderUpcoming(upcoming);
}

function renderUpcoming(upcoming) {
  const section = document.getElementById('upcomingSection');
  const list = document.getElementById('upcomingList');
  if (!section || !list) return;
  const active = upcoming.filter(u => u.diffDays <= 30).sort((a,b) => a.diffDays - b.diffDays);
  if (!active.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  list.innerHTML = active.map(u => {
    const cls = u.diffDays < 0 ? 'due-overdue' : u.diffDays <= 7 ? 'due-soon' : 'due-upcoming';
    const label = u.diffDays < 0 ? `${Math.abs(u.diffDays)} days overdue` : u.diffDays === 0 ? 'Due today' : `Due in ${u.diffDays} days`;
    return `<div class="upcoming-item">
      <div class="upcoming-icon">${u.v.icon||'💒'}</div>
      <div class="upcoming-info">
        <div class="upcoming-vendor">${escHtml(u.v.category)}${u.v.name ? ' — '+escHtml(u.v.name) : ''}</div>
        <div class="upcoming-date">${formatDate(u.v.due_date)} · <span class="due-badge ${cls}" style="font-size:9px">${label}</span></div>
      </div>
      <div class="upcoming-amount">LKR ${fmtNum(u.dueAmt)}</div>
    </div>`;
  }).join('');
}

async function deleteVendor(id) {
  if (!confirm('Delete this vendor and all its payments?')) return;
  const vPayments = payments.filter(p => p.vendor_id === id);
  for (const p of vPayments) await DB.del('payments', p.id, accessToken);
  await DB.del('vendors', id, accessToken);
  payments = payments.filter(p => p.vendor_id !== id);
  vendors = vendors.filter(v => v.id !== id);
  renderVendors(); updateStats(); showToast('Vendor deleted');
}

async function addVendor() {
  const name = document.getElementById('newVendorName').value.trim();
  if (!name) { showToast('Please enter a vendor name', true); return; }
  const data = {
    user_id: userId,
    category: document.getElementById('newVendorCategory').value.trim() || 'Custom Vendor',
    icon: selectedIcon, name,
    total_cost: parseFloat(document.getElementById('newVendorTotal').value)||0,
    notes: document.getElementById('newVendorNotes').value.trim(),
    due_date: null, due_amount: null, due_note: ''
  };
  const rows = await DB.post('vendors', data, accessToken);
  vendors.push(rows[0]);
  ['newVendorName','newVendorCategory','newVendorTotal','newVendorNotes'].forEach(id => document.getElementById(id).value='');
  renderVendors(); updateStats(); showToast('Vendor added! 🎉');
}

// ─── EDIT MODAL ───────────────────────────────────────────────────────────────
function openEditModal(id) {
  const v = vendors.find(x => x.id === id); if (!v) return;
  activeEditVendorId = id;
  document.getElementById('editVendorId').value = id;
  document.getElementById('editVendorName').value = v.name||'';
  document.getElementById('editVendorCategory').value = v.category||'';
  document.getElementById('editVendorTotal').value = v.total_cost||'';
  document.getElementById('editVendorNotes').value = v.notes||'';
  document.getElementById('editDueDate').value = v.due_date||'';
  document.getElementById('editDueAmount').value = v.due_amount||'';
  document.getElementById('editDueNote').value = v.due_note||'';
  document.getElementById('editModal').style.display = 'flex';
}
function closeEditModal() { document.getElementById('editModal').style.display='none'; activeEditVendorId=null; }

async function submitEdit() {
  const id = activeEditVendorId;
  const v = vendors.find(x => x.id === id); if (!v) return;
  const data = {
    name: document.getElementById('editVendorName').value.trim(),
    category: document.getElementById('editVendorCategory').value.trim(),
    total_cost: parseFloat(document.getElementById('editVendorTotal').value)||0,
    notes: document.getElementById('editVendorNotes').value.trim(),
    due_date: document.getElementById('editDueDate').value || null,
    due_amount: parseFloat(document.getElementById('editDueAmount').value)||null,
    due_note: document.getElementById('editDueNote').value.trim()
  };
  await DB.patch('vendors', id, data, accessToken);
  Object.assign(v, data);
  closeEditModal(); renderVendors(); updateStats(); showToast('Vendor updated ✓');
}

// ─── PAYMENT MODAL ────────────────────────────────────────────────────────────
function openPaymentModal(vendorId) {
  activePaymentVendorId = vendorId;
  const v = vendors.find(x => x.id === vendorId);
  const el = document.getElementById('modalVendorName');
  if (el && v) el.textContent = `${v.icon} ${v.category}${v.name?' — '+v.name:''}`;
  document.getElementById('pmtAmount').value = '';
  document.getElementById('pmtDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('pmtMethod').value = 'Cash';
  document.getElementById('pmtNote').value = '';
  document.getElementById('paymentModal').style.display = 'flex';
}
function closePaymentModal() { document.getElementById('paymentModal').style.display='none'; activePaymentVendorId=null; }

async function submitPayment() {
  const amount = parseFloat(document.getElementById('pmtAmount').value);
  if (!amount || amount <= 0) { showToast('Enter a valid amount', true); return; }
  const date = document.getElementById('pmtDate').value;
  if (!date) { showToast('Select a payment date', true); return; }
  const data = {
    user_id: userId,
    vendor_id: activePaymentVendorId,
    amount, payment_date: date,
    method: document.getElementById('pmtMethod').value,
    note: document.getElementById('pmtNote').value.trim()
  };
  const rows = await DB.post('payments', data, accessToken);
  payments.push(rows[0]);
  closePaymentModal(); renderVendors(); updateStats(); showToast('Payment recorded ✓');
}

async function deletePayment(paymentId) {
  if (!confirm('Delete this payment entry?')) return;
  await DB.del('payments', paymentId, accessToken);
  payments = payments.filter(p => p.id !== paymentId);
  renderVendors(); updateStats(); showToast('Payment deleted');
}

// ─── SHARE ────────────────────────────────────────────────────────────────────
function openShareModal() {
  document.getElementById('shareToggle').checked = shareEnabled;
  document.getElementById('shareUrlSection').style.display = shareEnabled ? 'block' : 'none';
  if (shareToken) document.getElementById('shareUrlText').textContent = getShareUrl();
  document.getElementById('shareModal').style.display = 'flex';
}
function closeShareModal() { document.getElementById('shareModal').style.display = 'none'; }

function getShareUrl() {
  return `${window.location.origin}${window.location.pathname.replace('dashboard.html','share.html')}?token=${shareToken}`;
}

async function toggleShare() {
  shareEnabled = document.getElementById('shareToggle').checked;
  if (shareEnabled && !shareToken) {
    shareToken = 'share_' + userId + '_' + Math.random().toString(36).substr(2,12);
    await DB.upsertSetting(userId, 'share_token', shareToken, accessToken);
  }
  await DB.upsertSetting(userId, 'share_enabled', String(shareEnabled), accessToken);
  document.getElementById('shareUrlSection').style.display = shareEnabled ? 'block' : 'none';
  if (shareToken) document.getElementById('shareUrlText').textContent = getShareUrl();
  showToast(shareEnabled ? 'Sharing enabled ✓' : 'Sharing disabled');
}

function copyShareUrl() {
  navigator.clipboard.writeText(getShareUrl()).then(() => showToast('Link copied to clipboard! 📋'));
}

// ─── STATS ───────────────────────────────────────────────────────────────────
function updateStats() {
  let totalCost = 0, totalPaid = 0;
  vendors.forEach(v => {
    totalCost += parseFloat(v.total_cost||0);
    totalPaid += payments.filter(p => p.vendor_id===v.id).reduce((s,p) => s+parseFloat(p.amount||0), 0);
  });
  const remaining = totalCost - totalPaid;
  const limit = spendLimit || 0;
  const available = limit > 0 ? limit - totalCost : null;
  const pct = limit > 0 ? Math.min(100, Math.round((totalCost/limit)*100)) : 0;

  setText('stat-total', fmt(totalCost)); setText('stat-paid', fmt(totalPaid));
  setText('stat-remaining', fmt(remaining)); setText('stat-count', vendors.filter(v=>v.name).length);
  const fill = document.getElementById('progress-fill');
  if (fill) { fill.style.width=pct+'%'; fill.classList.toggle('danger', pct>=90); }
  setText('progress-pct', pct+'%');
  setText('sum-total', fmt(totalCost)); setText('sum-paid', fmt(totalPaid));
  setText('sum-remaining', fmt(remaining)); setText('sum-limit', limit>0?fmt(limit):'Not set');
  const avEl = document.getElementById('sum-available');
  if (avEl) {
    if (available !== null) { avEl.textContent=fmt(available); avEl.style.color=available>=0?'#90c890':'#f08080'; }
    else { avEl.textContent='Set limit above'; avEl.style.color='var(--muted)'; }
  }
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
async function saveLimit() {
  const val = parseFloat(document.getElementById('spendLimit').value)||0;
  spendLimit = val;
  await DB.upsertSetting(userId, 'spend_limit', val, accessToken);
  updateStats(); showToast('Spend limit saved ✓');
}
async function saveNotes() {
  const val = document.getElementById('weddingNotes').value;
  notes = val;
  await DB.upsertSetting(userId, 'wedding_notes', val, accessToken);
  showToast('Notes saved ✓');
}

// ─── TASKS ───────────────────────────────────────────────────────────────────
function renderTasks() {
  const grid = document.getElementById('checklistGrid'); if (!grid) return;
  grid.innerHTML = '';
  tasks.forEach(task => {
    const item = document.createElement('div');
    item.className = 'checklist-item' + (task.done?' done':'');
    item.innerHTML = `<div class="checklist-check">${task.done?'✓':''}</div><span class="checklist-text">${escHtml(task.text)}</span><button class="checklist-del" onclick="event.stopPropagation();deleteTask('${task.id}')">✕</button>`;
    item.onclick = () => toggleTask(task.id);
    grid.appendChild(item);
  });
}
async function toggleTask(id) {
  const t = tasks.find(x=>x.id===id); if(!t) return;
  t.done = !t.done;
  await DB.patch('tasks', id, {done:t.done}, accessToken);
  renderTasks();
}
async function deleteTask(id) {
  await DB.del('tasks', id, accessToken);
  tasks = tasks.filter(t=>t.id!==id); renderTasks();
}
async function addTask() {
  const input = document.getElementById('newTaskInput');
  const text = input.value.trim(); if(!text) return;
  const rows = await DB.post('tasks', {user_id:userId, text, done:false}, accessToken);
  tasks.push(rows[0]); input.value=''; renderTasks();
}

// ─── ICON SELECTOR ────────────────────────────────────────────────────────────
function renderIconSelector() {
  const wrap = document.getElementById('iconSelector'); if(!wrap) return;
  wrap.innerHTML = '';
  ICONS.forEach(ic => {
    const btn = document.createElement('button');
    btn.className = 'icon-btn'+(ic===selectedIcon?' active':'');
    btn.textContent = ic;
    btn.onclick = () => { selectedIcon=ic; renderIconSelector(); };
    wrap.appendChild(btn);
  });
}

// ─── MODAL OVERLAY CLOSE ─────────────────────────────────────────────────────
['paymentModal','editModal','shareModal'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', function(e){ if(e.target===this) this.style.display='none'; });
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function fmt(n) { return 'LKR ' + fmtNum(n); }
function fmtNum(n) { return Number(n||0).toLocaleString('en-LK'); }
function setText(id,val){ const el=document.getElementById(id); if(el) el.textContent=val; }
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function formatDate(d){ if(!d) return ''; const dt=new Date(d+'T00:00:00'); return dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }
let weddingDate = new Date('2027-02-11T09:00:00');
function countdown(){
  const diff = weddingDate - new Date();
  if(diff<=0){['cd-days','cd-hours','cd-mins','cd-secs'].forEach(id=>setText(id,'0'));return;}
  setText('cd-days',Math.floor(diff/86400000));
  setText('cd-hours',pad(Math.floor((diff%86400000)/3600000)));
  setText('cd-mins',pad(Math.floor((diff%3600000)/60000)));
  setText('cd-secs',pad(Math.floor((diff%60000)/1000)));
}
function pad(n){ return String(n).padStart(2,'0'); }
let toastTimer;
function showToast(msg, isError=false){
  const t=document.getElementById('toast'); if(!t) return;
  t.textContent=msg; t.className='toast show'+(isError?' error':'');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>{t.className='toast';},3000);
}

init();
if(typeof setInterval!=='undefined') setInterval(countdown,1000);
