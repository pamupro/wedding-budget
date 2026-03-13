/**
 * db.js — WeddingLedger Database (Supabase)
 */

const SUPABASE_URL      = 'https://bqggtyguhedlyfffjkkw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxZ2d0eWd1aGVkbHlmZmZqa2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTA0NzYsImV4cCI6MjA4ODMyNjQ3Nn0.x3tpbzhI-W4kR7MPFexPW-MZ5Ei_bkE7Nw5Q00Tx7J4';

const DB = {
  SUPABASE_URL,
  ANON_KEY: SUPABASE_ANON_KEY,

  // ── TOKEN MANAGEMENT ───────────────────────────────────────────────────────
  getToken() {
    return localStorage.getItem('wl_token') || '';
  },

  isTokenExpired(token) {
    if (!token) return true;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      // Expire 60s early to avoid edge cases
      return (payload.exp * 1000) < (Date.now() + 60000);
    } catch(e) { return true; }
  },

  async refreshToken() {
    const refreshToken = localStorage.getItem('wl_refresh');
    if (!refreshToken) return null;
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      if (!r.ok) return null;
      const d = await r.json();
      if (d.access_token) {
        localStorage.setItem('wl_token', d.access_token);
        localStorage.setItem('wl_refresh', d.refresh_token || refreshToken);
        // Update accessToken in app if available
        if (typeof accessToken !== 'undefined') {
          // eslint-disable-next-line no-global-assign
          accessToken = d.access_token;
        }
        return d.access_token;
      }
    } catch(e) { console.error('Token refresh failed:', e); }
    return null;
  },

  async getValidToken(token) {
    // If passed token is valid, use it; otherwise try refresh
    if (token && !this.isTokenExpired(token)) return token;
    const refreshed = await this.refreshToken();
    if (refreshed) return refreshed;
    // Refresh failed — redirect to login
    localStorage.removeItem('wl_token');
    localStorage.removeItem('wl_refresh');
    localStorage.removeItem('wl_uid');
    window.location.href = 'login.html';
    return null;
  },

  // ── HEADERS ────────────────────────────────────────────────────────────────
  _h(token) {
    return {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`,
      'Prefer': 'return=representation'
    };
  },

  // ── DB METHODS ─────────────────────────────────────────────────────────────
  async query(path, token) {
    const t = await this.getValidToken(token);
    if (!t) return [];
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: this._h(t) });
    if (r.status === 401) {
      // Token rejected — force re-login
      const refreshed = await this.refreshToken();
      if (!refreshed) { window.location.href = 'login.html'; return []; }
      const r2 = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: this._h(refreshed) });
      if (!r2.ok) { const e = await r2.json(); throw new Error(e.message || JSON.stringify(e)); }
      return r2.json();
    }
    if (!r.ok) { const e = await r.json(); throw new Error(e.message || JSON.stringify(e)); }
    return r.json();
  },

  async post(table, data, token) {
    const t = await this.getValidToken(token);
    if (!t) return [];
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST', headers: this._h(t), body: JSON.stringify(data)
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.message || JSON.stringify(e)); }
    return r.json();
  },

  async patch(tableOrPath, idOrData, dataOrToken, token) {
    // Supports two call styles:
    // patch('table', id, data, token)  — new style
    // patch('table?id=eq.X', data, token) — old style (query string)
    let path, data, tok;
    if(token !== undefined){
      // new style: (table, id, data, token)
      path = `${tableOrPath}?id=eq.${idOrData}`;
      data = dataOrToken; tok = token;
    } else {
      // old style: (querypath, data, token)
      path = tableOrPath; data = idOrData; tok = dataOrToken;
    }
    const t = await this.getValidToken(tok);
    if (!t) return [];
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'PATCH', headers: this._h(t), body: JSON.stringify(data)
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.message || JSON.stringify(e)); }
    return r.json();
  },

  async del(tableOrPath, idOrToken, token) {
    // Supports: del('table', id, token) or del('table?id=eq.X', token)
    let path, tok;
    if(token !== undefined){
      path = `${tableOrPath}?id=eq.${idOrToken}`; tok = token;
    } else {
      path = tableOrPath; tok = idOrToken;
    }
    const t = await this.getValidToken(tok);
    if (!t) return false;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'DELETE', headers: this._h(t)
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.message || JSON.stringify(e)); }
    return true;
  },

  async upsertSetting(userId, key, value, token) {
    const t = await this.getValidToken(token);
    if (!t) return;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/settings?user_id=eq.${userId}&key=eq.${key}`, {
      method: 'PATCH', headers: this._h(t), body: JSON.stringify({ value: String(value) })
    });
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) {
      await this.post('settings', { user_id: userId, key, value: String(value) }, t);
    }
  },

  async queryShare(table, shareToken) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?share_token=eq.${shareToken}&select=*`,
      { headers: this._h(SUPABASE_ANON_KEY) }
    );
    if (!r.ok) return [];
    return r.json();
  }
};
