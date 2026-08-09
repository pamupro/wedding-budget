/**
 * planner-dashboard.js
 * Wedding Planner Dashboard — Multi-wedding support with billing
 */

let userId = null;
let accessToken = null;
let currentWeddingId = null;
let allWeddings = [];
let billingInfo = null;
const SITE_BASE = location.origin + location.pathname.replace(/\/[^\/]*$/, '');

// ────────────────────────────────────────────────────────────────
// INIT
// ────────────────────────────────────────────────────────────────
async function init() {
  console.log('[Planner Dashboard] Initializing...');

  userId = localStorage.getItem('wl_uid');
  accessToken = localStorage.getItem('wl_token');

  if (!userId || !accessToken) {
    window.location.href = 'login.html';
    return;
  }

  try {
    // Validate and refresh token if needed
    accessToken = await DB.getValidToken(accessToken);
    if (!accessToken) {
      window.location.href = 'login.html';
      return;
    }
    localStorage.setItem('wl_token', accessToken);
  } catch (e) {
    console.error('[Planner] Auth error:', e);
    window.location.href = 'login.html';
    return;
  }

  // Load all data
  await loadWeddings();
  await loadBillingInfo();
  setupEventListeners();
  updateTopbar();
}

// ────────────────────────────────────────────────────────────────
// LOAD WEDDINGS
// ────────────────────────────────────────────────────────────────
async function loadWeddings() {
  try {
    // Fetch all weddings for this user
    const response = await fetch(`${DB.SUPABASE_URL}/rest/v1/weddings?user_id=eq.${userId}&is_active=eq.true&order=created_at.desc`, {
      headers: {
        'apikey': DB.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('[Planner] Failed to load weddings:', response.status);
      return;
    }

    allWeddings = await response.json();
    console.log(`[Planner] Loaded ${allWeddings.length} weddings`);

    // Set first wedding as active if not already set
    if (allWeddings.length > 0 && !currentWeddingId) {
      currentWeddingId = allWeddings[0].id;
    }

    renderWeddingsGrid();
    renderWeddingSwitcher();
  } catch (e) {
    console.error('[Planner] Error loading weddings:', e);
    showToast('Failed to load weddings', 'error');
  }
}

// ────────────────────────────────────────────────────────────────
// LOAD BILLING INFO
// ────────────────────────────────────────────────────────────────
async function loadBillingInfo() {
  try {
    const response = await fetch(`${DB.SUPABASE_URL}/rest/v1/billing_subscriptions?user_id=eq.${userId}`, {
      headers: {
        'apikey': DB.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn('[Planner] No billing info found, using defaults');
      billingInfo = getDefaultBillingInfo();
      return;
    }

    const data = await response.json();
    billingInfo = data.length > 0 ? data[0] : getDefaultBillingInfo();
    console.log('[Planner] Billing info loaded:', billingInfo.account_type);
    renderBillingSection();
  } catch (e) {
    console.error('[Planner] Error loading billing info:', e);
    billingInfo = getDefaultBillingInfo();
    renderBillingSection();
  }
}

function getDefaultBillingInfo() {
  return {
    id: null,
    user_id: userId,
    account_type: 'free',
    planner_tier: null,
    max_weddings: 1,
    weddings_used: allWeddings.length,
    stripe_customer_id: null,
    status: 'active',
    created_at: new Date().toISOString()
  };
}

// ────────────────────────────────────────────────────────────────
// RENDER: WEDDINGS GRID
// ────────────────────────────────────────────────────────────────
function renderWeddingsGrid() {
  const container = document.getElementById('weddingsContainer');
  if (!container) return;

  let html = '<div class="weddings-grid">';

  // Render existing weddings
  if (allWeddings.length === 0) {
    html += `
      <div class="empty-state" style="grid-column: 1/-1; padding: 60px 20px;">
        <div style="font-size: 48px; margin-bottom: 12px;">💒</div>
        <h3 style="font-family: 'Fraunces', serif; font-size: 20px; color: var(--charcoal); margin-bottom: 8px;">No Weddings Yet</h3>
        <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">Create your first wedding to get started.</p>
        <button class="add-wedding-btn" onclick="openModal('addWeddingModal)">+ Add Wedding</button>
      </div>
    `;
  } else {
    allWeddings.forEach(wedding => {
      const isActive = wedding.id === currentWeddingId;
      const date = wedding.wedding_date ? new Date(wedding.wedding_date).toLocaleDateString('en-GB', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      }) : 'TBD';

      html += `
        <div class="wedding-card" data-wedding-id="${wedding.id}">
          <div class="wedding-card-header">
            <div class="wedding-card-title">${escapeHtml(wedding.couple_name1)} & ${escapeHtml(wedding.couple_name2)}</div>
            <div class="wedding-card-date">${date}</div>
          </div>

          <div class="wedding-card-info">
            <div class="info-item">
              <span class="info-label">Venue</span>
              <div class="info-value">${escapeHtml(wedding.venue_name || 'TBD')}</div>
            </div>
            <div class="info-item">
              <span class="info-label">Guests</span>
              <div class="info-value">${wedding.guest_count || 0}</div>
            </div>
          </div>

          <div class="wedding-card-actions">
            <button class="card-action-btn primary" onclick="goToWeddingDashboard('${wedding.id}')">
              Open → 
            </button>
            <button class="card-action-btn secondary" onclick="editWedding('${wedding.id}')">
              Edit
            </button>
          </div>
        </div>
      `;
    });
  }

  // Add "Create New Wedding" card
  const canAddMore = allWeddings.length < billingInfo.max_weddings;
  const addWeddingDisabled = !canAddMore && billingInfo.account_type === 'free';

  if (!addWeddingDisabled) {
    html += `
      <div class="add-wedding-card" onclick="openModal('addWeddingModal')" style="cursor: pointer;">
        <div class="add-wedding-icon">✨</div>
        <div class="add-wedding-text">Add New Wedding</div>
        <div class="add-wedding-subtext">${canAddMore ? 'Create another wedding project' : 'Upgrade to add more weddings'}</div>
        <button class="add-wedding-btn">+ Add</button>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;

  // Add click handlers to cards
  document.querySelectorAll('.wedding-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.closest('button')) {
        goToWeddingDashboard(card.dataset.weddingId);
      }
    });
  });
}

// ────────────────────────────────────────────────────────────────
// RENDER: WEDDING SWITCHER DROPDOWN
// ────────────────────────────────────────────────────────────────
function renderWeddingSwitcher() {
  const dropdown = document.getElementById('weddingSwitcherDropdown');
  if (!dropdown) return;

  let html = '';

  allWeddings.forEach(wedding => {
    const isActive = wedding.id === currentWeddingId;
    const date = wedding.wedding_date ? new Date(wedding.wedding_date).toLocaleDateString('en-GB', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    }) : 'TBD';

    html += `
      <button class="wedding-switcher-item ${isActive ? 'active' : ''}" onclick="switchWedding('${wedding.id}')">
        <span class="wedding-item-name">${escapeHtml(wedding.couple_name1)} & ${escapeHtml(wedding.couple_name2)}</span>
        <span class="wedding-item-date">${date}</span>
      </button>
    `;
  });

  if (allWeddings.length > 0) {
    html += '<div class="wedding-switcher-divider"></div>';
  }

  html += `
    <button class="wedding-switcher-add" onclick="openModal('addWeddingModal'); closeSwitcher()">
      + Add New Wedding
    </button>
  `;

  dropdown.innerHTML = html;
}

// ────────────────────────────────────────────────────────────────
// RENDER: BILLING SECTION
// ────────────────────────────────────────────────────────────────
function renderBillingSection() {
  const container = document.getElementById('billingGrid');
  if (!container) return;

  const tierName = {
    'free': 'Free',
    'pro': 'Pro',
    'planner': 'Planner'
  }[billingInfo.account_type] || 'Free';

  const tierPrice = {
    'free': '£0',
    'pro': '£14.99',
    'planner': '£40 + £12/wedding'
  }[billingInfo.account_type] || '£0';

  html = `
    <div class="billing-item">
      <span class="billing-item-label">Current Plan</span>
      <div class="billing-item-value">${tierName}</div>
    </div>

    <div class="billing-item">
      <span class="billing-item-label">Weddings Used</span>
      <div class="billing-item-value">${billingInfo.weddings_used} / ${billingInfo.max_weddings}</div>
    </div>

    <div class="billing-item">
      <span class="billing-item-label">Price</span>
      <div class="billing-item-value">${tierPrice}</div>
    </div>

    <div class="billing-item">
      <span class="billing-item-label">Status</span>
      <div class="billing-item-value" style="color: var(--sage); font-size: 14px;">
        ${billingInfo.status === 'active' ? '✓ Active' : billingInfo.status}
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Update billing status badge
  const statusBadge = document.getElementById('billingStatus');
  if (statusBadge) {
    statusBadge.textContent = billingInfo.status === 'active' ? 'Active' : 'Inactive';
  }
}

// ────────────────────────────────────────────────────────────────
// WEDDING OPERATIONS
// ────────────────────────────────────────────────────────────────

// Switch to wedding without leaving dashboard
function switchWedding(weddingId) {
  currentWeddingId = weddingId;
  updateTopbar();
  renderWeddingsGrid();
  renderWeddingSwitcher();
  closeSwitcher();
  console.log(`[Planner] Switched to wedding: ${weddingId}`);
}

// Go to wedding's full dashboard
function goToWeddingDashboard(weddingId) {
  localStorage.setItem('wl_active_wedding', weddingId);
  window.location.href = `/dashboard.html?wedding=${weddingId}`;
}

// Create new wedding
async function createWedding() {
  const name1 = document.getElementById('coupleName1Input').value.trim();
  const name2 = document.getElementById('coupleName2Input').value.trim();
  const date = document.getElementById('weddingDateInput').value;
  const venue = document.getElementById('venueNameInput').value.trim();

  if (!name1 || !name2 || !date) {
    showToast('Please fill in all required fields', 'error');
    return;
  }

  // Check if user can add more weddings
  if (allWeddings.length >= billingInfo.max_weddings && billingInfo.account_type === 'free') {
    showToast('Upgrade your plan to add more weddings', 'error');
    openModal('pricingModal');
    return;
  }

  try {
    const response = await fetch(`${DB.SUPABASE_URL}/rest/v1/weddings`, {
      method: 'POST',
      headers: {
        'apikey': DB.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        couple_name1: name1,
        couple_name2: name2,
        wedding_date: date,
        venue_name: venue,
        is_active: true
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const newWedding = await response.json();
    console.log('[Planner] Wedding created:', newWedding.id);

    // Log usage
    logUsage('wedding_created', { wedding_id: newWedding.id });

    // Reload and switch to new wedding
    await loadWeddings();
    switchWedding(newWedding.id);
    closeModal('addWeddingModal');
    showToast(`${name1} & ${name2}'s wedding added!`, 'success');

    // Clear form
    document.getElementById('coupleName1Input').value = '';
    document.getElementById('coupleName2Input').value = '';
    document.getElementById('weddingDateInput').value = '';
    document.getElementById('venueNameInput').value = '';
  } catch (e) {
    console.error('[Planner] Error creating wedding:', e);
    showToast('Failed to create wedding', 'error');
  }
}

// Edit wedding (stub for now)
function editWedding(weddingId) {
  // TODO: Implement edit modal
  console.log('[Planner] Edit wedding:', weddingId);
  showToast('Edit feature coming soon', 'info');
}

// ────────────────────────────────────────────────────────────────
// BILLING OPERATIONS
// ────────────────────────────────────────────────────────────────

async function upgradeToStarter() {
  if (billingInfo.account_type === 'planner') {
    showToast('You already have the Starter plan!', 'info');
    return;
  }

  console.log('[Planner] Initiating Starter upgrade ($40)...');

  try {
    // Create Stripe checkout session
    const response = await fetch('/api/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        plan: 'planner_starter',
        price: 4000 // £40 in pence
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create checkout session');
    }

    const { url } = await response.json();
    window.location.href = url;
  } catch (e) {
    console.error('[Planner] Upgrade error:', e);
    showToast('Failed to start upgrade process', 'error');
  }
}

function logUsage(eventType, metadata = {}) {
  // Log usage for analytics/compliance
  fetch(`${DB.SUPABASE_URL}/rest/v1/usage_logs`, {
    method: 'POST',
    headers: {
      'apikey': DB.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      user_id: userId,
      event_type: eventType,
      metadata: metadata
    })
  }).catch(e => console.warn('[Planner] Usage log failed:', e));
}

// ────────────────────────────────────────────────────────────────
// UI HELPERS
// ────────────────────────────────────────────────────────────────

function updateTopbar() {
  const topbar = document.querySelector('.topbar');
  const nameEl = document.getElementById('topbarWeddingName');
  const backBtn = document.getElementById('topbarBackBtn');

  if (currentWeddingId && allWeddings.length > 0) {
    const wedding = allWeddings.find(w => w.id === currentWeddingId);
    if (wedding && nameEl) {
      nameEl.textContent = `${wedding.couple_name1} & ${wedding.couple_name2}`;
    }
  }

  // Show back button only if coming from wedding dashboard
  const fromDashboard = new URLSearchParams(window.location.search).get('from') === 'dashboard';
  if (backBtn) {
    backBtn.classList.toggle('show', fromDashboard);
    backBtn.onclick = () => goToWeddingDashboard(currentWeddingId);
  }

  // Add scroll effect
  window.addEventListener('scroll', () => {
    if (window.scrollY > 10) {
      topbar.classList.add('scrolled');
    } else {
      topbar.classList.remove('scrolled');
    }
  });
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('show');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('show');
  }
}

function closeSwitcher() {
  const dropdown = document.getElementById('weddingSwitcherDropdown');
  if (dropdown) {
    dropdown.classList.remove('show');
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%) translateY(0);
    background: ${type === 'error' ? 'var(--rose)' : type === 'success' ? 'var(--sage)' : 'var(--charcoal)'};
    color: white;
    padding: 10px 22px;
    border-radius: 99px;
    font-size: 13px;
    font-weight: 500;
    z-index: 999;
    box-shadow: var(--shadow-lg);
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ────────────────────────────────────────────────────────────────
// EVENT LISTENERS
// ────────────────────────────────────────────────────────────────

function setupEventListeners() {
  // Wedding switcher dropdown toggle
  const switcherBtn = document.getElementById('weddingSwitcherBtn');
  const switcherDropdown = document.getElementById('weddingSwitcherDropdown');
  if (switcherBtn && switcherDropdown) {
    switcherBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      switcherDropdown.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!switcherBtn.contains(e.target) && !switcherDropdown.contains(e.target)) {
        switcherDropdown.classList.remove('show');
      }
    });
  }

  // Modal close buttons
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('show');
      }
    });
  });

  // Create wedding button
  const createBtn = document.getElementById('createWeddingBtn');
  if (createBtn) {
    createBtn.addEventListener('click', createWedding);
  }

  // Upgrade plan button
  const upgradeBtn = document.getElementById('upgradePlanBtn');
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => openModal('pricingModal'));
  }

  // Settings button
  const settingsBtn = document.getElementById('topbarSettingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      window.location.href = '/settings.html';
    });
  }

  // Sign out button
  const signoutBtn = document.getElementById('topbarSignoutBtn');
  if (signoutBtn) {
    signoutBtn.addEventListener('click', () => {
      localStorage.removeItem('wl_uid');
      localStorage.removeItem('wl_token');
      window.location.href = 'login.html';
    });
  }

  // View invoices button
  const invoicesBtn = document.getElementById('viewInvoicesBtn');
  if (invoicesBtn) {
    invoicesBtn.addEventListener('click', () => {
      window.location.href = '/invoices.html';
    });
  }
}

// ────────────────────────────────────────────────────────────────
// INIT ON LOAD
// ────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
