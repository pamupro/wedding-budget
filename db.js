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
      // Give 5 min buffer
      return (payload.exp * 1000) < (Date.now() + 300000);
    } catch(e) { return false; } // if we can't parse, assume valid and let API decide
  },

  async refreshToken() {
    const refreshToken = localStorage.getItem('wl_refresh');
    if (!refreshToken || refreshToken === 'undefined' || refreshToken === 'null') return null;
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
        if (d.refresh_token) localStorage.setItem('wl_refresh', d.refresh_token);
        if (typeof accessToken !== 'undefined') accessToken = d.access_token;
        console.log('[WL] Token refreshed successfully');
        return d.access_token;
      }
    } catch(e) { console.error('[WL] Token refresh failed:', e); }
    return null;
  },

  async getValidToken(token) {
    // If token exists and is not expired, use it directly
    if (token && !this.isTokenExpired(token)) return token;

    // Token expired or missing — try to refresh
    console.log('[WL] Token expired, attempting refresh…');
    const refreshed = await this.refreshToken();
    if (refreshed) return refreshed;

    // Refresh failed — but DON'T wipe localStorage here.
    // Return the original token and let the API call return 401.
    // The query() method handles 401s properly.
    // Only redirect if we have NO token at all.
    if (!token) {
      console.log('[WL] No token at all → redirecting to login');
      window.location.href = 'login.html';
      return null;
    }

    // Return potentially-expired token and let API decide
    console.log('[WL] Refresh failed, using existing token (API will 401 if truly expired)');
    return token;
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
    console.log('[WL] query', path.split('?')[0], '→ HTTP', r.status);
    if (typeof dbg==='function') dbg('DB: '+path.split('?')[0]+' → HTTP '+r.status, r.ok);
    if (r.status === 401) {
      console.log('[WL] 401 on query, trying one refresh…');
      const refreshed = await this.refreshToken();
      if (refreshed) {
        const r2 = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: this._h(refreshed) });
        if (r2.ok) return r2.json();
      }
      // Truly expired — redirect to login now
      console.log('[WL] 401 after refresh → login');
      localStorage.removeItem('wl_token');
      localStorage.removeItem('wl_refresh');
      localStorage.removeItem('wl_uid');
      window.location.href = 'login.html';
      return [];
    }
    if (!r.ok) {
      const e = await r.json().catch(()=>({message: 'HTTP '+r.status}));
      throw new Error(e.message || JSON.stringify(e));
    }
    return r.json();
  },

  async post(table, data, token) {
    const t = await this.getValidToken(token);
    if (!t) return [];
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST', headers: this._h(t), body: JSON.stringify(data)
    });
    if (!r.ok) {
      const e = await r.json().catch(()=>({message: 'HTTP '+r.status}));
      throw new Error(e.message || JSON.stringify(e));
    }
    return r.json();
  },

  async patch(tableOrPath, idOrData, dataOrToken, token) {
    let path, data, tok;
    if (token !== undefined) {
      path = `${tableOrPath}?id=eq.${idOrData}`;
      data = dataOrToken; tok = token;
    } else {
      path = tableOrPath; data = idOrData; tok = dataOrToken;
    }
    const t = await this.getValidToken(tok);
    if (!t) return [];
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'PATCH', headers: this._h(t), body: JSON.stringify(data)
    });
    if (!r.ok) {
      const e = await r.json().catch(()=>({message: 'HTTP '+r.status}));
      throw new Error(e.message || JSON.stringify(e));
    }
    return r.json();
  },

  async del(tableOrPath, idOrToken, token) {
    let path, tok;
    if (token !== undefined) {
      path = `${tableOrPath}?id=eq.${idOrToken}`; tok = token;
    } else {
      path = tableOrPath; tok = idOrToken;
    }
    const t = await this.getValidToken(tok);
    if (!t) return false;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'DELETE', headers: this._h(t)
    });
    if (!r.ok) {
      const e = await r.json().catch(()=>({message: 'HTTP '+r.status}));
      throw new Error(e.message || JSON.stringify(e));
    }
    return true;
  },

  async upsertSetting(userId, key, value, token) {
    const t = await this.getValidToken(token);
    if (!t) return;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/settings?user_id=eq.${userId}&key=eq.${key}`, {
      method: 'PATCH', headers: this._h(t), body: JSON.stringify({ value: String(value) })
    });
    const rows = await r.json().catch(()=>[]);
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
