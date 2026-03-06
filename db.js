/**
 * db.js — WeddingLedger Database (Supabase)
 */

const SUPABASE_URL      = 'https://bqggtyguhedlyfffjkkw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxZ2d0eWd1aGVkbHlmZmZqa2t3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTA0NzYsImV4cCI6MjA4ODMyNjQ3Nn0.x3tpbzhI-W4kR7MPFexPW-MZ5Ei_bkE7Nw5Q00Tx7J4';

const DB = {
  SUPABASE_URL,
  ANON_KEY: SUPABASE_ANON_KEY,

  _h(token) {
    return {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`,
      'Prefer': 'return=representation'
    };
  },

  async query(path, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: this._h(token) });
    if (!r.ok) { const e = await r.json(); throw new Error(e.message || JSON.stringify(e)); }
    return r.json();
  },

  async post(table, data, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST', headers: this._h(token), body: JSON.stringify(data)
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.message || JSON.stringify(e)); }
    return r.json();
  },

  async patch(table, id, data, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH', headers: this._h(token), body: JSON.stringify(data)
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.message || JSON.stringify(e)); }
    return r.json();
  },

  async del(table, id, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'DELETE', headers: this._h(token)
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.message || JSON.stringify(e)); }
    return true;
  },

  async upsertSetting(userId, key, value, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/settings?user_id=eq.${userId}&key=eq.${key}`, {
      method: 'PATCH', headers: this._h(token), body: JSON.stringify({ value: String(value) })
    });
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) {
      await this.post('settings', { user_id: userId, key, value: String(value) }, token);
    }
  }
};
