/**
 * support-widget.js — WeddingLedger Support Chat
 * Drop <script src="support-widget.js"></script> on any page.
 * Works for logged-in users AND anonymous visitors.
 */
(function() {
  const SB   = 'https://bqggtyguhedlyfffjkkw.supabase.co';
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxZ2d0eWd1aGVkbHlmZmZqa2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTA0NzYsImV4cCI6MjA4ODMyNjQ3Nn0.x3tpbzhI-W4kR7MPFexPW-MZ5Ei_bkE7Nw5Q00Tx7J4';

  // ── Inject styles ──────────────────────────────────────────────────────────
  const css = `
  #wl-support-fab {
    position: fixed;
    bottom: 28px;
    right: 24px;
    z-index: 99998;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: #1a1612;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px rgba(26,22,18,.35);
    transition: transform .2s, background .2s;
    font-size: 22px;
  }
  #wl-support-fab:hover { background: #a07828; transform: scale(1.08); }
  #wl-support-fab .wl-fab-badge {
    position: absolute;
    top: -2px; right: -2px;
    width: 16px; height: 16px;
    background: #b83030;
    border-radius: 50%;
    border: 2px solid #faf7f2;
    display: none;
    font-size: 9px;
    color: white;
    font-family: 'Instrument Sans', sans-serif;
    font-weight: 700;
    align-items: center;
    justify-content: center;
  }

  #wl-support-panel {
    position: fixed;
    bottom: 92px;
    right: 24px;
    z-index: 99999;
    width: 360px;
    max-height: 580px;
    background: #faf7f2;
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(26,22,18,.22), 0 0 0 1px rgba(26,22,18,.08);
    display: none;
    flex-direction: column;
    overflow: hidden;
    font-family: 'Instrument Sans', sans-serif;
    animation: wlSlideUp .22s cubic-bezier(.32,.72,0,1);
  }
  #wl-support-panel.open { display: flex; }
  @keyframes wlSlideUp {
    from { opacity:0; transform: translateY(12px) scale(.97); }
    to   { opacity:1; transform: none; }
  }

  .wl-sp-head {
    background: #1a1612;
    padding: 18px 20px 16px;
    flex-shrink: 0;
  }
  .wl-sp-head-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2px;
  }
  .wl-sp-logo {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 16px;
    font-style: italic;
    font-weight: 300;
    color: #faf7f2;
  }
  .wl-sp-logo em { color: #c9a84c; }
  .wl-sp-close {
    background: rgba(255,255,255,.08);
    border: none;
    color: rgba(255,255,255,.5);
    width: 28px; height: 28px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 14px;
    display: flex; align-items: center; justify-content: center;
    transition: .15s;
  }
  .wl-sp-close:hover { background: rgba(255,255,255,.15); color: #fff; }
  .wl-sp-subtitle {
    font-size: 12px;
    color: rgba(255,255,255,.38);
    margin-top: 2px;
  }
  .wl-sp-online {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: rgba(255,255,255,.45);
    margin-top: 6px;
  }
  .wl-sp-online-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #3ab450;
    animation: wlPulse 2s infinite;
  }
  @keyframes wlPulse {
    0%,100% { opacity:1; transform:scale(1); }
    50% { opacity:.5; transform:scale(1.3); }
  }

  /* Views */
  .wl-sp-view { display: none; flex-direction: column; flex: 1; overflow-y: auto; }
  .wl-sp-view.active { display: flex; }

  /* Home view */
  .wl-sp-home-body { padding: 20px; flex: 1; }
  .wl-sp-greeting {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 18px;
    font-weight: 300;
    color: #1a1612;
    margin-bottom: 6px;
  }
  .wl-sp-greeting em { font-style: italic; color: #a07828; }
  .wl-sp-home-sub {
    font-size: 13px;
    color: #7a6e5e;
    margin-bottom: 20px;
    line-height: 1.6;
  }
  .wl-sp-options { display: flex; flex-direction: column; gap: 8px; }
  .wl-sp-option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: #fff;
    border: 1px solid rgba(26,22,18,.09);
    border-radius: 12px;
    cursor: pointer;
    transition: all .15s;
    text-align: left;
    font-family: 'Instrument Sans', sans-serif;
    width: 100%;
  }
  .wl-sp-option:hover {
    border-color: #a07828;
    box-shadow: 0 2px 12px rgba(160,120,40,.1);
    transform: translateY(-1px);
  }
  .wl-sp-option-icon {
    width: 38px; height: 38px;
    border-radius: 10px;
    background: #fdf3dc;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }
  .wl-sp-option-text { flex: 1; }
  .wl-sp-option-title {
    font-size: 13px;
    font-weight: 600;
    color: #1a1612;
    margin-bottom: 1px;
  }
  .wl-sp-option-sub {
    font-size: 11px;
    color: #7a6e5e;
  }
  .wl-sp-option-arrow {
    color: #b0a090;
    font-size: 12px;
  }

  /* Ticket form view */
  .wl-sp-form-body { padding: 16px 20px 20px; flex: 1; overflow-y: auto; }
  .wl-sp-back {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    font-size: 12px;
    font-weight: 600;
    color: #7a6e5e;
    cursor: pointer;
    padding: 0;
    margin-bottom: 14px;
    font-family: 'Instrument Sans', sans-serif;
    transition: color .15s;
  }
  .wl-sp-back:hover { color: #1a1612; }
  .wl-sp-form-title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 16px;
    font-weight: 300;
    color: #1a1612;
    margin-bottom: 14px;
  }
  .wl-sp-form-title em { font-style: italic; color: #a07828; }
  .wl-sp-field { margin-bottom: 10px; }
  .wl-sp-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: #7a6e5e;
    margin-bottom: 5px;
    display: block;
  }
  .wl-sp-input, .wl-sp-select, .wl-sp-textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid rgba(26,22,18,.12);
    border-radius: 8px;
    font-family: 'Instrument Sans', sans-serif;
    font-size: 13px;
    color: #1a1612;
    background: #fff;
    outline: none;
    transition: border-color .15s, box-shadow .15s;
    box-sizing: border-box;
  }
  .wl-sp-input:focus, .wl-sp-select:focus, .wl-sp-textarea:focus {
    border-color: #a07828;
    box-shadow: 0 0 0 3px rgba(160,120,40,.09);
  }
  .wl-sp-input::placeholder, .wl-sp-textarea::placeholder { color: #b0a090; font-style: italic; }
  .wl-sp-textarea { resize: none; min-height: 90px; line-height: 1.5; }
  .wl-sp-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .wl-sp-submit {
    width: 100%;
    padding: 12px;
    background: #1a1612;
    border: none;
    border-radius: 50px;
    font-family: 'Instrument Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #faf7f2;
    cursor: pointer;
    transition: background .15s, transform .1s;
    margin-top: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .wl-sp-submit:hover { background: #a07828; }
  .wl-sp-submit:disabled { opacity: .6; cursor: not-allowed; }

  /* Success view */
  .wl-sp-success-body {
    padding: 32px 20px;
    text-align: center;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .wl-sp-success-icon { font-size: 48px; margin-bottom: 14px; }
  .wl-sp-success-title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 20px;
    font-weight: 300;
    color: #1a1612;
    margin-bottom: 8px;
  }
  .wl-sp-success-title em { font-style: italic; color: #a07828; }
  .wl-sp-success-sub {
    font-size: 13px;
    color: #7a6e5e;
    line-height: 1.6;
    margin-bottom: 20px;
    max-width: 260px;
  }
  .wl-sp-ticket-ref {
    display: inline-block;
    background: #fdf3dc;
    border: 1px solid rgba(160,120,40,.2);
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 700;
    color: #a07828;
    letter-spacing: .08em;
    margin-bottom: 20px;
  }
  .wl-sp-done-btn {
    padding: 10px 28px;
    background: transparent;
    border: 1.5px solid rgba(26,22,18,.14);
    border-radius: 50px;
    font-family: 'Instrument Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: #1a1612;
    cursor: pointer;
    transition: .15s;
  }
  .wl-sp-done-btn:hover { background: #1a1612; color: #faf7f2; }

  /* My tickets view */
  .wl-sp-tickets-body { padding: 12px 16px; flex: 1; overflow-y: auto; }
  .wl-sp-ticket-item {
    background: #fff;
    border: 1px solid rgba(26,22,18,.09);
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 8px;
    cursor: pointer;
    transition: all .15s;
  }
  .wl-sp-ticket-item:hover { border-color: #a07828; box-shadow: 0 2px 8px rgba(160,120,40,.08); }
  .wl-sp-ticket-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }
  .wl-sp-ticket-subject { font-size: 13px; font-weight: 600; color: #1a1612; flex: 1; }
  .wl-sp-ticket-status {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 99px;
    letter-spacing: .06em;
    text-transform: uppercase;
    flex-shrink: 0;
  }
  .wl-sp-ticket-status.open      { background: #fdf3dc; color: #a07828; }
  .wl-sp-ticket-status.in_progress { background: #e8f0ff; color: #2a5aaa; }
  .wl-sp-ticket-status.resolved  { background: #eef7f1; color: #2a6a3a; }
  .wl-sp-ticket-status.closed    { background: #f0f0f0; color: #7a6e5e; }
  .wl-sp-ticket-meta { font-size: 11px; color: #b0a090; }
  .wl-sp-ticket-reply {
    margin-top: 10px;
    padding: 10px 12px;
    background: #f0faf4;
    border-left: 3px solid #2a6a3a;
    border-radius: 0 8px 8px 0;
    font-size: 12px;
    color: #1a1612;
    line-height: 1.5;
  }
  .wl-sp-ticket-reply-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: #2a6a3a;
    margin-bottom: 4px;
  }
  .wl-sp-empty {
    text-align: center;
    padding: 32px 16px;
    color: #b0a090;
    font-size: 13px;
  }
  .wl-sp-empty-icon { font-size: 36px; margin-bottom: 10px; }

  @media (max-width: 420px) {
    #wl-support-panel { width: calc(100vw - 24px); right: 12px; bottom: 80px; }
    #wl-support-fab { right: 16px; bottom: 20px; }
  }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── Build DOM ──────────────────────────────────────────────────────────────
  const fab = document.createElement('button');
  fab.id = 'wl-support-fab';
  fab.title = 'Support';
  fab.innerHTML = `<span style="font-size:22px">💬</span><span class="wl-fab-badge" id="wlFabBadge"></span>`;

  const panel = document.createElement('div');
  panel.id = 'wl-support-panel';
  panel.innerHTML = `
    <!-- Header -->
    <div class="wl-sp-head">
      <div class="wl-sp-head-row">
        <div class="wl-sp-logo">Wedding<em>Ledger</em></div>
        <button class="wl-sp-close" id="wlSpClose">✕</button>
      </div>
      <div class="wl-sp-subtitle">How can we help you today?</div>
      <div class="wl-sp-online"><span class="wl-sp-online-dot"></span>We typically reply within a few hours</div>
    </div>

    <!-- HOME VIEW -->
    <div class="wl-sp-view active" id="wlViewHome">
      <div class="wl-sp-home-body">
        <div class="wl-sp-greeting">Hi there <em>👋</em></div>
        <div class="wl-sp-home-sub">Got a question or need help with your wedding planning? We're here for you.</div>
        <div class="wl-sp-options">
          <button class="wl-sp-option" onclick="wlShowView('form')">
            <div class="wl-sp-option-icon">✉️</div>
            <div class="wl-sp-option-text">
              <div class="wl-sp-option-title">Send us a message</div>
              <div class="wl-sp-option-sub">We'll get back to you soon</div>
            </div>
            <span class="wl-sp-option-arrow">→</span>
          </button>
          <button class="wl-sp-option" id="wlMyTicketsBtn" onclick="wlShowView('tickets')" style="display:none">
            <div class="wl-sp-option-icon">📋</div>
            <div class="wl-sp-option-text">
              <div class="wl-sp-option-title">My support tickets</div>
              <div class="wl-sp-option-sub">View your previous messages</div>
            </div>
            <span class="wl-sp-option-arrow">→</span>
          </button>
        </div>
      </div>
    </div>

    <!-- FORM VIEW -->
    <div class="wl-sp-view" id="wlViewForm">
      <div class="wl-sp-form-body">
        <button class="wl-sp-back" onclick="wlShowView('home')">← Back</button>
        <div class="wl-sp-form-title">Send us a <em>message</em></div>
        <div class="wl-sp-row2">
          <div class="wl-sp-field">
            <label class="wl-sp-label">Your Name</label>
            <input class="wl-sp-input" id="wlName" placeholder="Jane Smith">
          </div>
          <div class="wl-sp-field">
            <label class="wl-sp-label">Email</label>
            <input class="wl-sp-input" type="email" id="wlEmail" placeholder="jane@email.com">
          </div>
        </div>
        <div class="wl-sp-field">
          <label class="wl-sp-label">Subject</label>
          <select class="wl-sp-select" id="wlSubject">
            <option value="General Enquiry">General Enquiry</option>
            <option value="Billing & Payments">Billing &amp; Payments</option>
            <option value="Technical Issue">Technical Issue</option>
            <option value="Account Help">Account Help</option>
            <option value="Feature Request">Feature Request</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="wl-sp-field">
          <label class="wl-sp-label">Message</label>
          <textarea class="wl-sp-textarea" id="wlMessage" placeholder="Tell us what's on your mind…"></textarea>
        </div>
        <div id="wlFormError" style="font-size:12px;color:#b83030;margin-bottom:8px;display:none"></div>
        <button class="wl-sp-submit" id="wlSubmitBtn" onclick="wlSubmitTicket()">
          <span>Send Message</span>
          <span>→</span>
        </button>
      </div>
    </div>

    <!-- SUCCESS VIEW -->
    <div class="wl-sp-view" id="wlViewSuccess">
      <div class="wl-sp-success-body">
        <div class="wl-sp-success-icon">💍</div>
        <div class="wl-sp-success-title">Message <em>sent!</em></div>
        <div class="wl-sp-success-sub">Thank you for reaching out. We'll get back to you at your email address as soon as possible.</div>
        <div class="wl-sp-ticket-ref" id="wlTicketRef">Ticket #—</div>
        <button class="wl-sp-done-btn" onclick="wlShowView('home')">Done</button>
      </div>
    </div>

    <!-- MY TICKETS VIEW -->
    <div class="wl-sp-view" id="wlViewTickets">
      <div class="wl-sp-tickets-body" id="wlTicketsList">
        <button class="wl-sp-back" onclick="wlShowView('home')">← Back</button>
        <div class="wl-sp-empty"><div class="wl-sp-empty-icon">📭</div>Loading your tickets…</div>
      </div>
    </div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  // ── Logic ──────────────────────────────────────────────────────────────────
  let _uid  = localStorage.getItem('wl_uid')  || null;
  let _tok  = localStorage.getItem('wl_token') || null;
  let _name = '', _email = '';

  // Pre-fill if logged in
  if (_uid && _tok) {
    document.getElementById('wlMyTicketsBtn').style.display = 'flex';
    // Try to get profile name/email
    fetch(`${SB}/rest/v1/profiles?user_id=eq.${_uid}&select=name1,email`, {
      headers: { apikey: ANON, Authorization: `Bearer ${_tok}` }
    }).then(r => r.json()).then(rows => {
      if (rows && rows[0]) {
        _name  = rows[0].name1 || '';
        _email = rows[0].email || '';
        const ni = document.getElementById('wlName');
        const ei = document.getElementById('wlEmail');
        if (ni && _name)  { ni.value = _name;  ni.readOnly = true; ni.style.background = '#f8f5ef'; }
        if (ei && _email) { ei.value = _email; ei.readOnly = true; ei.style.background = '#f8f5ef'; }
      }
    }).catch(() => {});
  }

  // Toggle panel
  fab.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      fab.innerHTML = `<span style="font-size:20px">✕</span><span class="wl-fab-badge" id="wlFabBadge"></span>`;
    } else {
      fab.innerHTML = `<span style="font-size:22px">💬</span><span class="wl-fab-badge" id="wlFabBadge"></span>`;
    }
  });
  document.getElementById('wlSpClose').addEventListener('click', () => {
    panel.classList.remove('open');
    fab.innerHTML = `<span style="font-size:22px">💬</span><span class="wl-fab-badge" id="wlFabBadge"></span>`;
  });

  // View switching
  window.wlShowView = function(name) {
    document.querySelectorAll('.wl-sp-view').forEach(v => v.classList.remove('active'));
    const v = document.getElementById('wlView' + name.charAt(0).toUpperCase() + name.slice(1));
    if (v) v.classList.add('active');
    if (name === 'tickets') wlLoadTickets();
  };

  // Submit ticket
  window.wlSubmitTicket = async function() {
    const name    = document.getElementById('wlName').value.trim();
    const email   = document.getElementById('wlEmail').value.trim();
    const subject = document.getElementById('wlSubject').value;
    const message = document.getElementById('wlMessage').value.trim();
    const errEl   = document.getElementById('wlFormError');
    const btn     = document.getElementById('wlSubmitBtn');

    errEl.style.display = 'none';
    if (!name)    { errEl.textContent = 'Please enter your name.';    errEl.style.display = 'block'; return; }
    if (!email || !email.includes('@')) { errEl.textContent = 'Please enter a valid email.'; errEl.style.display = 'block'; return; }
    if (!message) { errEl.textContent = 'Please write a message.';    errEl.style.display = 'block'; return; }

    btn.disabled = true;
    btn.querySelector('span').textContent = 'Sending…';

    try {
      const payload = { name, email, subject, message, source: 'widget' };
      if (_uid) payload.user_id = _uid;

      const r = await fetch(`${SB}/rest/v1/support_tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON,
          Authorization: `Bearer ${_tok || ANON}`,
          Prefer: 'return=representation'
        },
        body: JSON.stringify(payload)
      });
      const rows = await r.json();
      if (!r.ok) throw new Error(rows.message || 'Submit failed');

      const ticket = Array.isArray(rows) ? rows[0] : rows;
      const ref = ticket?.id ? 'WL-' + ticket.id.slice(0, 8).toUpperCase() : 'WL-' + Date.now().toString(36).toUpperCase();
      document.getElementById('wlTicketRef').textContent = 'Ticket ' + ref;

      // Clear form
      if (!_name)  document.getElementById('wlName').value    = '';
      if (!_email) document.getElementById('wlEmail').value   = '';
      document.getElementById('wlMessage').value = '';

      wlShowView('success');
    } catch (e) {
      errEl.textContent = 'Failed to send — please try again.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Send Message';
    }
  };

  // Load user's own tickets
  window.wlLoadTickets = async function() {
    const wrap = document.getElementById('wlTicketsList');
    if (!_uid || !_tok) {
      wrap.innerHTML = '<button class="wl-sp-back" onclick="wlShowView(\'home\')">← Back</button><div class="wl-sp-empty"><div class="wl-sp-empty-icon">🔒</div>Sign in to view your tickets</div>';
      return;
    }
    wrap.innerHTML = '<button class="wl-sp-back" onclick="wlShowView(\'home\')">← Back</button><div class="wl-sp-empty"><div class="wl-sp-empty-icon">📭</div>Loading…</div>';

    try {
      const r = await fetch(`${SB}/rest/v1/support_tickets?user_id=eq.${_uid}&order=created_at.desc`, {
        headers: { apikey: ANON, Authorization: `Bearer ${_tok}` }
      });
      const tickets = await r.json();
      if (!tickets || !tickets.length) {
        wrap.innerHTML = '<button class="wl-sp-back" onclick="wlShowView(\'home\')">← Back</button><div class="wl-sp-empty"><div class="wl-sp-empty-icon">📭</div>No tickets yet — send us a message if you need help!</div>';
        return;
      }
      let html = '<button class="wl-sp-back" onclick="wlShowView(\'home\')">← Back</button>';
      tickets.forEach(t => {
        const date = new Date(t.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const statusLabel = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' }[t.status] || t.status;
        html += `<div class="wl-sp-ticket-item">
          <div class="wl-sp-ticket-row">
            <div class="wl-sp-ticket-subject">${escHtml(t.subject)}</div>
            <span class="wl-sp-ticket-status ${t.status}">${statusLabel}</span>
          </div>
          <div class="wl-sp-ticket-meta">${date}</div>
          ${t.admin_reply ? `<div class="wl-sp-ticket-reply"><div class="wl-sp-ticket-reply-label">✓ Reply from WeddingLedger</div>${escHtml(t.admin_reply)}</div>` : ''}
        </div>`;
      });
      wrap.innerHTML = html;
    } catch (e) {
      wrap.innerHTML = '<button class="wl-sp-back" onclick="wlShowView(\'home\')">← Back</button><div class="wl-sp-empty">Could not load tickets — please try again.</div>';
    }
  };

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

})();
