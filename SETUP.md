# 🌸 WeddingLedger — Setup Guide (v2)

## Files in this project
| File | Purpose |
|------|---------|
| `index.html` | Landing / marketing page |
| `login.html` | Sign up & sign in |
| `dashboard.html` | Main budget app (private) |
| `share.html` | Read-only view for wedding planner |
| `style.css` | All styles |
| `app.js` | All app logic |
| `db.js` | **Edit this** — your Supabase credentials |
| `supabase_setup.sql` | Run this once in Supabase |
| `.nojekyll` | Tells GitHub Pages not to use Jekyll |

---

## Step 1 — Supabase Project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Name it `wedding-ledger`, pick **Singapore** region, set a password
3. Wait ~2 min for it to start

---

## Step 2 — Run the SQL

1. In Supabase → **SQL Editor** → **New query**
2. Open `supabase_setup.sql`, copy everything, paste and **Run**
3. You should see "Success. No rows returned" ✅

---

## Step 3 — Enable Email Auth

1. Supabase → **Authentication** → **Providers**
2. Make sure **Email** is enabled (it is by default)
3. Optional: Turn off "Confirm email" for easier testing:
   - Authentication → **Settings** → disable "Enable email confirmations"

---

## Step 4 — Get your credentials

1. Supabase → **Settings** → **API**
2. Copy:
   - **Project URL** → `https://xxxxxx.supabase.co`
   - **anon / public key** → long string starting with `eyJ...`

---

## Step 5 — Edit db.js

Open `db.js` and replace lines 6–7:

```javascript
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...your-key...';
```

---

## Step 6 — Upload to GitHub & Enable Pages

### Upload all files:
1. Go to your `wedding-budget` repo on GitHub
2. Click **Add file** → **Upload files**
3. Upload ALL files from this folder (replace old ones)
4. Commit to `main`

### Make sure GitHub Pages is on:
- Settings → Pages → Source: **Deploy from branch** → main → / (root) → Save
- Make sure `.nojekyll` file is in the repo

---

## Step 7 — Test it

1. Visit `https://pamupro.github.io/wedding-budget/`
2. You should see the **landing page** 🎉
3. Click "Get Started Free" → Sign up with your email
4. Start adding your vendors!

---

## How sharing works

1. In your dashboard, click **🔗 Share with Planner**
2. Toggle sharing ON
3. Copy the link and send to your wedding planner
4. They can view everything but cannot change anything
5. Toggle OFF any time to instantly revoke access

---

## How due dates work

1. Click **✏️ Edit** on any vendor card
2. Scroll to "Due Date" section at the bottom of the edit form
3. Set:
   - **Due Date** — when the payment is expected (optional)
   - **Due Amount** — how much is due (leave blank = full remaining balance)
   - **Due Note** — e.g. "Final payment before event"
4. Vendors with upcoming due dates (within 30 days) appear in the yellow panel at the top

---

## Your website URLs

| Page | URL |
|------|-----|
| Landing page | `https://pamupro.github.io/wedding-budget/` |
| Login | `https://pamupro.github.io/wedding-budget/login.html` |
| Dashboard | `https://pamupro.github.io/wedding-budget/dashboard.html` |
| Share page | `https://pamupro.github.io/wedding-budget/share.html?token=...` |

💍 Congratulations Chamo & Pamu!
