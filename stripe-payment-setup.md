# WeddingLedger Stripe Payment Integration Setup

## Overview
This guide sets up Stripe payment processing for the wedding planner pricing model:
- **Starter Plan**: £40 one-time for 3 weddings (includes all pro features)
- **Additional Weddings**: £12 per wedding after the initial 3

## Prerequisites
- Stripe account (create at https://stripe.com)
- Node.js & Express for backend (or use Supabase Functions)
- Basic understanding of REST APIs

---

## Step 1: Create Stripe Products & Prices

### In Stripe Dashboard:

1. Go to **Products** > **Add Product**

#### Product 1: Starter Plan
- **Name**: WeddingLedger Starter Plan
- **Description**: 3 weddings + all pro features
- **Price**: £40.00 GBP
- **Billing Period**: One-time

#### Product 2: Additional Wedding
- **Name**: Additional Wedding
- **Description**: Add more weddings to your account
- **Price**: £12.00 GBP
- **Billing Period**: One-time

**Save the Price IDs** - You'll need these for checkout:
```
STARTER_PRICE_ID = price_xxxxx  (for £40)
ADDITIONAL_PRICE_ID = price_yyyyy  (for £12)
```

---

## Step 2: Set Up Backend Payment Endpoint

### Option A: Using Node.js/Express

Create `/api/create-payment-intent.js`:

```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { product, amount } = req.body;
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user from token
    const token = authHeader.substring(7);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Determine price ID based on product
    let priceId;
    if (product === 'starter_plan') {
      priceId = process.env.STRIPE_STARTER_PRICE_ID;
    } else if (product === 'add_wedding') {
      priceId = process.env.STRIPE_ADDITIONAL_PRICE_ID;
    } else {
      return res.status(400).json({ error: 'Invalid product' });
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'ideal', 'giropay'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.APP_URL}/planner-professional.html?session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/planner-professional.html`,
      customer_email: user.email,
      metadata: {
        userId: user.id,
        product: product,
      },
    });

    // Store pending payment in database
    await supabase
      .from('payments')
      .insert({
        user_id: user.id,
        stripe_session_id: session.id,
        product_type: product,
        amount: amount,
        status: 'pending',
      });

    res.json({ sessionId: session.id });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ error: error.message });
  }
};
```

### Option B: Using Supabase Edge Functions

Create `supabase/functions/create-checkout/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = require("stripe")(Deno.env.get("STRIPE_SECRET_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { product } = await req.json();
    const authHeader = req.headers.get("authorization");
    
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    let priceId;
    if (product === "starter_plan") {
      priceId = Deno.env.get("STRIPE_STARTER_PRICE_ID");
    } else if (product === "add_wedding") {
      priceId = Deno.env.get("STRIPE_ADDITIONAL_PRICE_ID");
    } else {
      throw new Error("Invalid product");
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "ideal", "giropay"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "payment",
      success_url: `${Deno.env.get("APP_URL")}/planner-professional.html?success=true`,
      cancel_url: `${Deno.env.get("APP_URL")}/planner-professional.html`,
      customer_email: user.email,
      metadata: { userId: user.id, product },
    });

    // Store payment record
    await supabase.from("payments").insert({
      user_id: user.id,
      stripe_session_id: session.id,
      product_type: product,
      status: "pending",
    });

    return new Response(
      JSON.stringify({ sessionId: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

---

## Step 3: Set Up Webhook Listener

This handles payment success/failure:

### Webhook Endpoint `/api/webhook-stripe.js`:

```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const body = req.rawBody;

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      // Get payment record
      const { data: payment } = await supabase
        .from('payments')
        .select('*')
        .eq('stripe_session_id', session.id)
        .single();

      if (payment) {
        // Update payment status
        await supabase
          .from('payments')
          .update({
            status: 'succeeded',
            stripe_payment_intent: session.payment_intent,
            paid_at: new Date().toISOString(),
          })
          .eq('id', payment.id);

        // Update user's wedding allowance
        if (payment.product_type === 'starter_plan') {
          // First time buyer - set allowance to 3
          await supabase
            .from('user_plans')
            .upsert({
              user_id: payment.user_id,
              plan_type: 'pro',
              wedding_allowance: 3,
              paid_at: new Date().toISOString(),
            });
        } else if (payment.product_type === 'add_wedding') {
          // Additional wedding - increment allowance
          const { data: plan } = await supabase
            .from('user_plans')
            .select('wedding_allowance')
            .eq('user_id', payment.user_id)
            .single();

          if (plan) {
            await supabase
              .from('user_plans')
              .update({
                wedding_allowance: (plan.wedding_allowance || 3) + 1,
              })
              .eq('user_id', payment.user_id);
          }
        }

        // Send confirmation email
        await supabase.functions.invoke('send-payment-confirmation', {
          body: { email: session.customer_email, product: payment.product_type },
        });
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
};
```

---

## Step 4: Database Schema Updates

Add these tables to your Supabase:

### Create `payments` table:
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  stripe_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent TEXT,
  product_type VARCHAR(50),
  amount INTEGER,
  status VARCHAR(50) DEFAULT 'pending',
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_session_id ON payments(stripe_session_id);
```

### Create `user_plans` table:
```sql
CREATE TABLE user_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id),
  plan_type VARCHAR(50) DEFAULT 'starter',
  wedding_allowance INTEGER DEFAULT 3,
  paid_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_plans_user_id ON user_plans(user_id);
```

---

## Step 5: Environment Variables

Add to your `.env` file:

```bash
# Stripe
STRIPE_PUBLIC_KEY=pk_live_xxxxxxxxxxxxx
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# Pricing
STRIPE_STARTER_PRICE_ID=price_xxxxx
STRIPE_ADDITIONAL_PRICE_ID=price_yyyyy

# URLs
APP_URL=https://yourdomain.com
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=xxxxxxxxxxxxx
```

---

## Step 6: Update HTML Files

The payment functions are already integrated in:
- `planner-professional.html` - Contains `openStripePayment()` function
- Automatically calls your payment endpoint

Just update the `PAYMENT_ENDPOINT` and `STRIPE_PUBLIC_KEY` constants in the HTML:

```javascript
const STRIPE_PUBLIC_KEY = 'pk_live_YOUR_ACTUAL_KEY';
const PAYMENT_ENDPOINT = 'https://yourdomain.com/api/create-payment-intent';
```

---

## Step 7: Test Payment Flow

1. Use Stripe test cards:
   - **Success**: `4242 4242 4242 4242`
   - **Decline**: `4000 0000 0000 0002`
   - **Any future date & CVC**

2. Visit `planner-professional.html`
3. Try to add a wedding beyond your limit
4. Click "Add Wedding for £12"
5. Complete test payment
6. Verify wedding allowance increases

---

## Security Checklist

- ✅ Never expose `STRIPE_SECRET_KEY` in frontend
- ✅ Always verify auth tokens on backend
- ✅ Use HTTPS only
- ✅ Validate webhook signatures
- ✅ Store payment records securely
- ✅ Use Stripe's PCI compliance
- ✅ Enable Stripe radar for fraud detection

---

## Support & Docs

- **Stripe Docs**: https://stripe.com/docs
- **Stripe Testing**: https://stripe.com/docs/testing
- **Checkout Session API**: https://stripe.com/docs/api/checkout/sessions
- **Webhooks Guide**: https://stripe.com/docs/webhooks

---

## Pricing Model Summary

| Plan | Price | Weddings | Features |
|------|-------|----------|----------|
| Starter | £40 one-time | 3 | All pro features |
| Additional | £12 each | +1 per payment | All pro features |

---

**Last Updated**: 2026-08-08
**Status**: Ready for Implementation
