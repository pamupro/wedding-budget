/*!
 * WeddingLedger Support Widget v2
 * Self-contained — works on every page, logged-in or not
 */
(function () {
  'use strict';

  var SB   = 'https://bqggtyguhedlyfffjkkw.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxZ2d0eWd1aGVkbHlmZmZqa2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTA0NzYsImV4cCI6MjA4ODMyNjQ3Nn0.x3tpbzhI-W4kR7MPFexPW-MZ5Ei_bkE7Nw5Q00Tx7J4';

  function mount() {
    if (window.location.pathname.indexOf('admin') !== -1) return;
    injectCSS();
    buildDOM();
    wireUp();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  function injectCSS() {
    if (document.getElementById('wl-sw-css')) return;
    var s = document.createElement('style');
    s.id = 'wl-sw-css';
    s.textContent = '#wl-fab{position:fixed;bottom:24px;right:20px;z-index:2147483640;width:52px;height:52px;border-radius:50%;background:#1a1612;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,.35);transition:transform .2s,background .2s;font-size:22px;line-height:1;}#wl-fab:hover{background:#a07828;transform:scale(1.08);}#wl-panel{position:fixed;bottom:84px;right:20px;z-index:2147483639;width:340px;max-height:560px;background:#faf7f2;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.22),0 0 0 1px rgba(26,22,18,.08);display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.5;color:#1a1612;}#wl-panel.wl-open{display:flex;animation:wlUp .2s cubic-bezier(.32,.72,0,1);}@keyframes wlUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}.wl-head{background:#1a1612;padding:16px 18px 14px;flex-shrink:0;}.wl-head-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;}.wl-logo{font-size:15px;font-weight:600;color:#faf7f2;}.wl-logo em{color:#c9a84c;font-style:italic;}.wl-x{background:rgba(255,255,255,.1);border:none;color:rgba(255,255,255,.6);width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:.15s;}.wl-x:hover{background:rgba(255,255,255,.2);color:#fff;}.wl-sub{font-size:11px;color:rgba(255,255,255,.38);margin-top:1px;}.wl-live{display:flex;align-items:center;gap:5px;font-size:10px;color:rgba(255,255,255,.38);margin-top:6px;}.wl-dot{width:6px;height:6px;border-radius:50%;background:#3ab450;animation:wlPulse 2s infinite;}@keyframes wlPulse{0%,100%{opacity:1}50%{opacity:.4}}.wl-view{display:none;flex-direction:column;flex:1;overflow-y:auto;}.wl-view.wl-on{display:flex;}.wl-home-body{padding:18px;flex:1;}.wl-hi{font-size:17px;font-weight:700;color:#1a1612;margin-bottom:5px;}.wl-hi em{color:#a07828;font-style:italic;}.wl-home-sub{font-size:12px;color:#7a6e5e;margin-bottom:16px;line-height:1.6;}.wl-opts{display:flex;flex-direction:column;gap:8px;}.wl-opt{display:flex;align-items:center;gap:11px;padding:12px 14px;background:#fff;border:1px solid rgba(26,22,18,.09);border-radius:11px;cursor:pointer;transition:all .15s;text-align:left;font-family:inherit;width:100%;color:#1a1612;}.wl-opt:hover{border-color:#a07828;box-shadow:0 2px 10px rgba(160,120,40,.1);transform:translateY(-1px);}.wl-opt-ico{width:36px;height:36px;border-radius:9px;background:#fdf3dc;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;}.wl-opt-t{font-size:13px;font-weight:600;color:#1a1612;}.wl-opt-s{font-size:11px;color:#7a6e5e;}.wl-arr{color:#b0a090;font-size:12px;margin-left:auto;}.wl-form-body{padding:14px 18px 18px;flex:1;overflow-y:auto;}.wl-back{display:flex;align-items:center;gap:5px;background:none;border:none;font-size:12px;font-weight:600;color:#7a6e5e;cursor:pointer;padding:0;margin-bottom:12px;font-family:inherit;transition:.15s;}.wl-back:hover{color:#1a1612;}.wl-ftitle{font-size:15px;font-weight:700;color:#1a1612;margin-bottom:14px;}.wl-ftitle em{color:#a07828;font-style:italic;}.wl-field{margin-bottom:10px;}.wl-lbl{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#7a6e5e;margin-bottom:4px;display:block;}.wl-inp,.wl-sel,.wl-ta{width:100%;padding:9px 11px;border:1px solid rgba(26,22,18,.12);border-radius:8px;font-family:inherit;font-size:13px;color:#1a1612;background:#fff;outline:none;transition:border-color .15s,box-shadow .15s;box-sizing:border-box;}.wl-inp:focus,.wl-sel:focus,.wl-ta:focus{border-color:#a07828;box-shadow:0 0 0 3px rgba(160,120,40,.08);}.wl-inp::placeholder,.wl-ta::placeholder{color:#b0a090;font-style:italic;}.wl-inp[readonly]{background:#f5f1ea;color:#7a6e5e;}.wl-ta{resize:none;min-height:88px;line-height:1.5;}.wl-row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}.wl-err{font-size:11px;color:#b83030;margin-bottom:8px;display:none;background:#fef0f0;border-radius:7px;padding:7px 10px;}.wl-sub-btn{width:100%;padding:11px;background:#1a1612;border:none;border-radius:50px;font-family:inherit;font-size:13px;font-weight:600;color:#faf7f2;cursor:pointer;transition:background .15s;margin-top:4px;}.wl-sub-btn:hover{background:#a07828;}.wl-sub-btn:disabled{opacity:.55;cursor:not-allowed;}.wl-ok-body{padding:28px 18px;text-align:center;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;}.wl-ok-ico{font-size:44px;margin-bottom:12px;}.wl-ok-t{font-size:18px;font-weight:700;color:#1a1612;margin-bottom:6px;}.wl-ok-t em{color:#a07828;font-style:italic;}.wl-ok-s{font-size:12px;color:#7a6e5e;line-height:1.6;margin-bottom:16px;max-width:240px;}.wl-ref{background:#fdf3dc;border:1px solid rgba(160,120,40,.2);border-radius:7px;padding:7px 14px;font-size:11px;font-weight:700;color:#a07828;letter-spacing:.06em;margin-bottom:16px;display:inline-block;}.wl-done{padding:9px 24px;background:transparent;border:1.5px solid rgba(26,22,18,.15);border-radius:50px;font-family:inherit;font-size:13px;font-weight:600;color:#1a1612;cursor:pointer;transition:.15s;}.wl-done:hover{background:#1a1612;color:#faf7f2;}.wl-tix-body{padding:12px 14px;flex:1;overflow-y:auto;}.wl-tix-item{background:#fff;border:1px solid rgba(26,22,18,.09);border-radius:10px;padding:11px 13px;margin-bottom:8px;}.wl-tix-row{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:3px;}.wl-tix-subj{font-size:13px;font-weight:600;color:#1a1612;flex:1;}.wl-tix-st{font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;letter-spacing:.06em;text-transform:uppercase;flex-shrink:0;}.wl-st-open{background:#fdf3dc;color:#a07828;}.wl-st-in_progress{background:#e8f0ff;color:#2a5aaa;}.wl-st-resolved{background:#eef7f1;color:#2a6a3a;}.wl-st-closed{background:#f0f0f0;color:#7a6e5e;}.wl-tix-meta{font-size:11px;color:#b0a090;}.wl-reply{margin-top:9px;padding:9px 11px;background:#f0faf4;border-left:3px solid #2a6a3a;border-radius:0 7px 7px 0;font-size:12px;color:#1a1612;line-height:1.5;}.wl-reply-lbl{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#2a6a3a;margin-bottom:3px;}.wl-empty{text-align:center;padding:28px 12px;color:#b0a090;font-size:13px;}.wl-empty-ico{font-size:32px;margin-bottom:8px;}@media(max-width:400px){#wl-panel{width:calc(100vw - 16px);right:8px;bottom:76px;}#wl-fab{right:12px;bottom:16px;}.wl-row2{grid-template-columns:1fr;}}';
    document.head.appendChild(s);
  }

  function buildDOM() {
    var fab = document.createElement('button');
    fab.id = 'wl-fab';
    fab.setAttribute('aria-label', 'Support');
    fab.innerHTML = '&#x1F4AC;';
    document.body.appendChild(fab);

    var panel = document.createElement('div');
    panel.id = 'wl-panel';
    panel.innerHTML = '<div class="wl-head"><div class="wl-head-row"><div class="wl-logo">Wedding<em>Ledger</em></div><button class="wl-x" id="wl-close">&#x2715;</button></div><div class="wl-sub">Support &mdash; how can we help?</div><div class="wl-live"><span class="wl-dot"></span>Usually replies within a few hours</div></div><div class="wl-view wl-on" id="wlvHome"><div class="wl-home-body"><div class="wl-hi">Hi there <em>&#x1F44B;</em></div><div class="wl-home-sub">Got a question about WeddingLedger? We\'re here to help.</div><div class="wl-opts"><button class="wl-opt" id="wlBtnNew"><div class="wl-opt-ico">&#x2709;&#xFE0F;</div><div><div class="wl-opt-t">Send us a message</div><div class="wl-opt-s">We\'ll reply to your email</div></div><span class="wl-arr">&#x2192;</span></button><button class="wl-opt" id="wlBtnTix" style="display:none"><div class="wl-opt-ico">&#x1F4CB;</div><div><div class="wl-opt-t">My support tickets</div><div class="wl-opt-s">View your previous messages</div></div><span class="wl-arr">&#x2192;</span></button></div></div></div><div class="wl-view" id="wlvForm"><div class="wl-form-body"><button class="wl-back" id="wlBackForm">&#x2190; Back</button><div class="wl-ftitle">Send a <em>message</em></div><div class="wl-row2"><div class="wl-field"><label class="wl-lbl">Name</label><input class="wl-inp" id="wlFName" placeholder="Your name"></div><div class="wl-field"><label class="wl-lbl">Email</label><input class="wl-inp" type="email" id="wlFEmail" placeholder="your@email.com"></div></div><div class="wl-field"><label class="wl-lbl">Subject</label><select class="wl-sel" id="wlFSubject"><option value="General Enquiry">General Enquiry</option><option value="Billing &amp; Payments">Billing &amp; Payments</option><option value="Technical Issue">Technical Issue</option><option value="Account Help">Account Help</option><option value="Feature Request">Feature Request</option><option value="Other">Other</option></select></div><div class="wl-field"><label class="wl-lbl">Message</label><textarea class="wl-ta" id="wlFMsg" placeholder="Tell us what\'s on your mind\u2026"></textarea></div><div class="wl-err" id="wlFErr"></div><button class="wl-sub-btn" id="wlFSubmit">Send Message &#x2192;</button></div></div><div class="wl-view" id="wlvOk"><div class="wl-ok-body"><div class="wl-ok-ico">&#x1F48D;</div><div class="wl-ok-t">Message <em>sent!</em></div><div class="wl-ok-s">Thank you! We\'ll get back to you soon.</div><div class="wl-ref" id="wlRef">Ticket #&mdash;</div><button class="wl-done" id="wlDone">Done</button></div></div><div class="wl-view" id="wlvTix"><div class="wl-tix-body" id="wlTixList"><button class="wl-back" id="wlBackTix">&#x2190; Back</button><div class="wl-empty"><div class="wl-empty-ico">&#x1F4ED;</div>Loading\u2026</div></div></div>';
    document.body.appendChild(panel);
  }

  function wireUp() {
    var uid   = localStorage.getItem('wl_uid')   || null;
    var token = localStorage.getItem('wl_token') || null;
    var panel = document.getElementById('wl-panel');
    var fab   = document.getElementById('wl-fab');
    var isOpen = false;

    if (uid && token) {
      var tixBtn = document.getElementById('wlBtnTix');
      if (tixBtn) tixBtn.style.display = 'flex';
      fetch(SB + '/rest/v1/profiles?user_id=eq.' + uid + '&select=name1,email', {
        headers: { apikey: ANON, Authorization: 'Bearer ' + token }
      }).then(function(r){ return r.json(); }).then(function(rows){
        if (!rows || !rows[0]) return;
        var n = document.getElementById('wlFName');
        var e = document.getElementById('wlFEmail');
        if (n && rows[0].name1) { n.value = rows[0].name1; n.readOnly = true; }
        if (e && rows[0].email) { e.value = rows[0].email; e.readOnly = true; }
      }).catch(function(){});
    }

    function toggle() {
      isOpen = !isOpen;
      if (isOpen) { panel.classList.add('wl-open'); fab.textContent = '\u2715'; fab.style.fontSize = '18px'; }
      else { panel.classList.remove('wl-open'); fab.innerHTML = '&#x1F4AC;'; fab.style.fontSize = '22px'; }
    }

    fab.addEventListener('click', toggle);
    document.getElementById('wl-close').addEventListener('click', function(){ isOpen = true; toggle(); });

    function showView(id) {
      document.querySelectorAll('#wl-panel .wl-view').forEach(function(v){ v.classList.remove('wl-on'); });
      var el = document.getElementById('wlv' + id);
      if (el) el.classList.add('wl-on');
      if (id === 'Tix') loadTix();
    }

    function g(id){ return document.getElementById(id); }

    g('wlBtnNew').addEventListener('click',    function(){ showView('Form'); });
    g('wlBackForm').addEventListener('click',  function(){ showView('Home'); });
    g('wlDone').addEventListener('click',      function(){ showView('Home'); });
    var tixBtn2 = g('wlBtnTix');
    if (tixBtn2) tixBtn2.addEventListener('click', function(){ showView('Tix'); });
    var backTix = g('wlBackTix');
    if (backTix) backTix.addEventListener('click', function(){ showView('Home'); });

    g('wlFSubmit').addEventListener('click', function(){
      var name    = (g('wlFName').value  || '').trim();
      var email   = (g('wlFEmail').value || '').trim();
      var subject = g('wlFSubject').value;
      var msg     = (g('wlFMsg').value   || '').trim();
      var errEl   = g('wlFErr');
      var btn     = g('wlFSubmit');

      errEl.style.display = 'none';
      function showE(m){ errEl.textContent = m; errEl.style.display = 'block'; }
      if (!name)  { showE('Please enter your name.'); return; }
      if (!email || email.indexOf('@') < 1) { showE('Please enter a valid email.'); return; }
      if (!msg)   { showE('Please write a message.'); return; }

      btn.disabled = true; btn.textContent = 'Sending\u2026';

      var payload = { name: name, email: email, subject: subject, message: msg, source: 'widget' };
      if (uid) payload.user_id = uid;

      fetch(SB + '/rest/v1/support_tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + (token || ANON), Prefer: 'return=representation' },
        body: JSON.stringify(payload)
      }).then(function(r){ return r.json(); }).then(function(rows){
        var t = Array.isArray(rows) ? rows[0] : rows;
        var ref = (t && t.id) ? 'WL-' + t.id.substring(0,8).toUpperCase() : 'WL-' + Date.now().toString(36).toUpperCase();
        g('wlRef').textContent = ref;
        if (!uid) { g('wlFName').value = ''; g('wlFEmail').value = ''; }
        g('wlFMsg').value = '';
        showView('Ok');
      }).catch(function(){ showE('Could not send \u2014 please try again.'); })
        .finally(function(){ btn.disabled = false; btn.textContent = 'Send Message \u2192'; });
    });

    function loadTix() {
      var wrap = g('wlTixList');
      var html = '<button class="wl-back" id="wlBackTix3">\u2190 Back</button>';
      if (!uid || !token) {
        wrap.innerHTML = html + '<div class="wl-empty"><div class="wl-empty-ico">\uD83D\uDD12</div>Sign in to view your tickets</div>';
        g('wlBackTix3').addEventListener('click', function(){ showView('Home'); });
        return;
      }
      wrap.innerHTML = html + '<div class="wl-empty"><div class="wl-empty-ico">\uD83D\uDCED</div>Loading\u2026</div>';
      g('wlBackTix3').addEventListener('click', function(){ showView('Home'); });

      fetch(SB + '/rest/v1/support_tickets?user_id=eq.' + uid + '&order=created_at.desc', {
        headers: { apikey: ANON, Authorization: 'Bearer ' + token }
      }).then(function(r){ return r.json(); }).then(function(tix){
        var stLabel = { open:'Open', in_progress:'In Progress', resolved:'Resolved', closed:'Closed' };
        if (!tix || !tix.length) {
          wrap.innerHTML = html + '<div class="wl-empty"><div class="wl-empty-ico">\uD83D\uDCED</div>No tickets yet</div>';
          g('wlBackTix3').addEventListener('click', function(){ showView('Home'); });
          return;
        }
        var out = html;
        tix.forEach(function(t){
          var d = new Date(t.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
          out += '<div class="wl-tix-item"><div class="wl-tix-row"><div class="wl-tix-subj">' + esc(t.subject) + '</div><span class="wl-tix-st wl-st-' + (t.status||'open') + '">' + (stLabel[t.status]||'Open') + '</span></div><div class="wl-tix-meta">' + d + '</div>' + (t.admin_reply ? '<div class="wl-reply"><div class="wl-reply-lbl">\u2713 Reply from WeddingLedger</div>' + esc(t.admin_reply) + '</div>' : '') + '</div>';
        });
        wrap.innerHTML = out;
        g('wlBackTix3').addEventListener('click', function(){ showView('Home'); });
      }).catch(function(){
        wrap.innerHTML = html + '<div class="wl-empty">Could not load tickets.</div>';
        g('wlBackTix3').addEventListener('click', function(){ showView('Home'); });
      });
    }

    function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  }
})();
