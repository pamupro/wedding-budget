# 🚀 Quick Setup Guide (5-10 Minutes)

## What You're Getting
✅ Beautiful professional planner dashboard
✅ Wedding switcher (no page reloads)
✅ Back button navigation  
✅ Stripe payment integration ready
✅ Pricing: £40 for 3 weddings, £12 for each additional

---

## Files You Need

1. **planner-professional.html** - Main planner dashboard
2. **dashboard-professional.html** - Wedding-specific dashboard
3. **stripe-payment-setup.md** - Payment integration guide
4. **PLANNER-UPGRADE-README.md** - Full documentation

---

## 5-Minute Deploy (No Payments Yet)

### Step 1: Copy Files (1 minute)
```bash
cd your-wedding-ledger-project

# Copy the new professional files
cp planner-professional.html .
cp dashboard-professional.html .
```

### Step 2: Update Links in Your Existing Code (2 minutes)

Find any links to the old planner/dashboard and update:

**Old → New:**
```
dashboard.html → dashboard-professional.html
planner.html → planner-professional.html
```

**In your HTML:**
```html
<!-- Change this: -->
<a href="dashboard.html">Open Wedding</a>

<!-- To this: -->
<a href="dashboard-professional.html">Open Wedding</a>
```

### Step 3: Test It (2 minutes)

1. Open `planner-professional.html` in your browser
2. Try these actions:
   - ✓ View weddings
   - ✓ Add a new wedding
   - ✓ Click wedding to open dashboard
   - ✓ Click "Studio" to go back
   - ✓ Use wedding switcher dropdown

### Step 4: Verify Database Connection (Optional)

The dashboards automatically connect to your Supabase. If weddings don't show:

1. Check browser console (F12) for errors
2. Verify your Supabase URL in existing code
3. Ensure user is logged in (check localStorage: `wl_auth_token`)

**Done!** You now have a professional dashboard! 🎉

---

## Adding Stripe Payments (10 Minutes)

### Step 1: Create Stripe Account (Free)
https://stripe.com/register

### Step 2: Get Your Keys
1. Login to Stripe Dashboard
2. Go to **Developers → API Keys**
3. Copy:
   - **Publishable Key** (public) - starts with `pk_`
   - **Secret Key** (secret) - starts with `sk_`

### Step 3: Create Products

**Product 1: Starter Plan**
- Name: "WeddingLedger Starter Plan"
- Price: £40.00 GBP (one-time)
- Copy the **Price ID** (starts with `price_`)

**Product 2: Additional Wedding**
- Name: "Additional Wedding"
- Price: £12.00 GBP (one-time)
- Copy the **Price ID**

### Step 4: Update HTML Files

In **planner-professional.html**, find these lines (around line 240):

```javascript
const STRIPE_PUBLIC_KEY = 'pk_test_YOUR_STRIPE_KEY';
const PAYMENT_ENDPOINT = '/api/create-payment-intent';
```

Replace with your real keys:
```javascript
const STRIPE_PUBLIC_KEY = 'pk_live_PASTE_YOUR_KEY_HERE';
const PAYMENT_ENDPOINT = 'https://yourdomain.com/api/create-payment-intent';
```

### Step 5: Set Up Backend Endpoint

You need ONE backend endpoint to handle payments. Choose your preferred option:

**Option A: Node.js/Express** (Easiest)
```javascript
// Create: api/create-payment-intent.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: req.body.product === 'add_wedding' 
          ? process.env.STRIPE_ADDITIONAL_PRICE_ID
          : process.env.STRIPE_STARTER_PRICE_ID,
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.APP_URL}/planner-professional.html?success=true`,
      cancel_url: `${process.env.APP_URL}/planner-professional.html`,
    });
    
    res.json({ sessionId: session.id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
```

**Option B: Supabase Edge Function** (See full setup guide)

### Step 6: Add Environment Variables

Create `.env` in your project root:
```bash
STRIPE_SECRET_KEY=sk_live_YOUR_KEY_HERE
STRIPE_STARTER_PRICE_ID=price_xxxxx
STRIPE_ADDITIONAL_PRICE_ID=price_yyyyy
APP_URL=https://yourdomain.com
```

### Step 7: Test Payments

1. Use Stripe test card: `4242 4242 4242 4242`
2. Use any future date and CVC
3. Try to add wedding beyond limit
4. Click upgrade button
5. Complete payment
6. Verify wedding allowance increases

### Step 8: Set Up Webhooks (Optional but Recommended)

1. In Stripe Dashboard → **Webhooks**
2. Add endpoint: `https://yourdomain.com/api/webhook-stripe`
3. Select events: `checkout.session.completed`
4. Copy webhook signing secret
5. Add to `.env`:
```bash
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

**Webhooks ensure payments are recorded even if the user closes the browser.**

---

## Database Setup (Optional but Important)

Add these tables to track payments:

```sql
-- Payments table
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  stripe_session_id TEXT NOT NULL UNIQUE,
  product_type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending',
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User plan tracking
CREATE TABLE user_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  plan_type VARCHAR(50) DEFAULT 'starter',
  wedding_allowance INTEGER DEFAULT 3,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_user_plans_user_id ON user_plans(user_id);
```

---

## Verify It's Working

✅ **Checklist:**
- [ ] Planner dashboard loads
- [ ] Can see existing weddings
- [ ] Can add new wedding
- [ ] Can open wedding dashboard
- [ ] "Studio" button works (goes back)
- [ ] Wedding switcher dropdown works
- [ ] Can switch weddings instantly
- [ ] All sidebar navigation works
- [ ] Stats display correctly
- [ ] Upgrade button appears when limit reached
- [ ] Payment button redirects to Stripe

---

## Common Issues & Fixes

### "Weddings not loading"
```javascript
// Check browser console (F12 → Console tab)
// Clear and reload:
localStorage.clear()
location.reload()
```

### "Payment button not working"
```javascript
// 1. Verify Stripe keys are correct
// 2. Check payment endpoint URL is accessible
// 3. Test endpoint: fetch('/api/create-payment-intent', {method:'POST'})
```

### "Dropdown not closing"
- Try in Chrome private/incognito mode
- Clear browser cache
- Check no JavaScript errors in console

### "Database queries failing"
- Verify Supabase URL in HTML
- Check auth token exists: `localStorage.getItem('wl_auth_token')`
- Ensure user is logged in

---

## Next Steps

### Immediate
1. Deploy the HTML files ✅
2. Test basic functionality ✅
3. Set up Stripe (optional but recommended)

### Short-term (This Week)
- [ ] Configure webhooks for payment confirmations
- [ ] Send payment confirmation emails
- [ ] Add analytics tracking
- [ ] Customize branding/colors

### Medium-term (This Month)
- [ ] Add more wedding details (budget goals, etc.)
- [ ] Send automatic reminders before wedding date
- [ ] Generate wedding budget PDFs
- [ ] Add team collaboration features

---

## Customization Ideas

### Change Pricing
In `planner-professional.html`:
```javascript
// Line ~400 - Change these numbers
const STARTER_PRICE = 4000;  // In pence (£40.00)
const ADDITIONAL_PRICE = 1200; // In pence (£12.00)
```

### Change Emoji Options
```javascript
// Line ~150
const EMOJIS = ['💍', '💒', '👰', '🤵', '💐', '🎊', '🍾', '💝', '✨', '💕'];
// Add or remove emojis
```

### Change Colors
Edit CSS at the top of each HTML file:
```css
:root {
  --gold: #a07828;      /* Primary color */
  --ink: #1a1612;       /* Text color */
  /* ... etc ... */
}
```

### Change Feature Limits
```javascript
// Allow 5 weddings instead of 3:
let allowance = 5;  // Change from 3
```

---

## Support Resources

**Documentation:**
- Full guide: `PLANNER-UPGRADE-README.md`
- Payment setup: `stripe-payment-setup.md`

**External Help:**
- Stripe Docs: https://stripe.com/docs
- Supabase Docs: https://supabase.com/docs
- JavaScript Console: F12 → Console for error messages

**Testing Tools:**
- Stripe Test Cards: https://stripe.com/docs/testing
- Browser DevTools: F12 (Chrome, Firefox, Safari)

---

## You're All Set! 🎉

Your wedding planner dashboard is now:
- ✅ Modern and professional
- ✅ Easy to navigate
- ✅ Ready for payments (when configured)
- ✅ Responsive on all devices
- ✅ Secure and reliable

**Questions?** Review the full documentation or check your browser console for specific errors.

---

**Timeline:**
- Basic setup: 5-10 minutes
- Stripe integration: 10-20 minutes  
- Full deployment: 30 minutes

**Status:** Ready to launch! 🚀
