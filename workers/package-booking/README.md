# Package Booking Worker — Setup Guide

Cloudflare Worker that powers training package booking and merch t-shirt checkout.

## Architecture

### Training packages
```
Client → Stripe Payment Link
         ↓ webhook (checkout.session.completed)
Cloudflare Worker → writes KV, emails booking link via FormSubmit
         ↓ client opens link
book-sessions.html → GET /validate?token=TOKEN → Worker reads KV → Cal.com embed
         ↓ client books
Cal.com webhook → POST /webhook/cal → Worker decrements credit
```

### Merch (t-shirts)
```
Product page form → POST /create-merch-checkout → Stripe Checkout Session
         ↓ payment complete
Stripe webhook (checkout.session.completed) → Worker
         ↓
Airtable Merch Orders + admin email + customer confirmation email
```

---

## 1. Cloudflare Setup

### Create the KV namespace
```bash
npx wrangler kv:namespace create CREDITS_KV
# Copy the `id` from output → paste into wrangler.toml
```

### Set secrets
```bash
npx wrangler secret put STRIPE_WEBHOOK_SECRET   # whsec_... from Stripe → Webhooks
npx wrangler secret put STRIPE_SECRET_KEY         # sk_live_... from Stripe → Developers → API keys → Secret key
npx wrangler secret put AIRTABLE_API_KEY          # pat_... (optional but recommended)
npx wrangler secret put SITE_URL                  # https://builtbymeez.com (no trailing slash)
```

**Important:** `STRIPE_SECRET_KEY` must be the full **Secret key** (`sk_live_...`), not a publishable key (`pk_live_...`) or restricted key. If checkout returns `Invalid API Key provided`, re-run the command above and paste the key again from [Stripe API keys](https://dashboard.stripe.com/apikeys) with no extra spaces.

### Deploy
```bash
cd workers/package-booking
npx wrangler deploy
# Worker URL: https://package-booking.elombe.workers.dev
```

---

## 2. Stripe Setup

### Training packages — one Payment Link per package

| Package | Sessions | Price | `client_reference_id` param |
|---------|----------|-------|------------------------|
| 8 Session 1:1 | 8 | $475 | `8-session-1-1` |
| 12 Session 1:1 | 12 | $700 | `12-session-1-1` |
| 16 Session 1:1 | 16 | $950 | `16-session-1-1` |
| 8 Session Semi-Private | 8 | $400 | `8-session-semi` |
| 12 Session Semi-Private | 12 | $550 | `12-session-semi` |
| 16 Session Semi-Private | 16 | $700 | `16-session-semi` |

**Important:** Append `?client_reference_id=SLUG` to each payment link URL in the HTML.

### Merch — unified product catalog

| Stripe object | ID / value |
|---------------|------------|
| Product | `Built By Me EZ Logo T-Shirt` (`prod_UeNIfqoPJFKKH2`) |
| Price — Black | `price_1Tf4YUEO3guv2SPL6ZRUC0JV` ($35) |
| Price — Brown | `price_1Tf4YUEO3guv2SPLG0WPBcAN` ($35) |
| Price — Blue | `price_1Tf4YUEO3guv2SPLKrK0mBrh` ($35) |

These price IDs are configured in `wrangler.toml` as `STRIPE_PRICE_BLACK`, `STRIPE_PRICE_BROWN`, and `STRIPE_PRICE_BLUE`.

T-shirt pages use **Checkout Sessions** (not Payment Links). After verifying the new flow in production, deactivate the legacy merch Payment Links:

| Color | Legacy Payment Link |
|-------|---------------------|
| Black | `https://buy.stripe.com/eVqcN5ebz3RP6c02Dq04802` |
| Brown | `https://buy.stripe.com/9B600j9VjfAx1VK6TG04800` |
| Blue | `https://buy.stripe.com/6oU3cv1oN741eIwb9W04801` |

In Stripe Dashboard → Settings → Emails, enable **successful payment receipts** for customers.

### Register the webhook
1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://package-booking.elombe.workers.dev/webhook/stripe`
3. Events: `checkout.session.completed`
4. Copy the **Signing secret** → set as `STRIPE_WEBHOOK_SECRET`

The same webhook handles both training packages and merch. Merch sessions are identified by `metadata.product_type = merch` or `client_reference_id` starting with `logo-tshirt-`.

---

## 3. Airtable Setup

### Leads table (existing)
- Base: `appSi0KcCQ41rm4XK`
- Table: `tblByao55M5tzJWHf` (`AIRTABLE_TABLE_ID`)

### Merch Orders table
- Table: `Merch Orders` (`tblag8GKEST2f6DnW`, `AIRTABLE_MERCH_TABLE_ID`)
- Fields: Name, Email, Product, Color, Size, Amount, Status, Stripe Session ID, Order Date

---

## 4. Cal.com Setup (credit auto-decrement)

1. Cal.com Dashboard → Developer → Webhooks → Add webhook
2. URL: `https://package-booking.elombe.workers.dev/webhook/cal`
3. Trigger: `BOOKING_CREATED`
4. Add for each of the 6 package event types

---

## 5. Email (FormSubmit)

- **Training packages:** admin notification to `builtbymeez1@gmail.com` with customer CC
- **Merch orders:** separate admin notification + direct customer confirmation email
- **Lead capture:** handled client-side in `js/lead-capture.js`

---

## 6. Frontend configuration

Set `WORKER_URL` on pages that call the Worker:

```js
var WORKER_URL = 'https://package-booking.elombe.workers.dev';
```

| Page(s) | Script |
|---------|--------|
| `book-sessions.html` | inline `WORKER_URL` |
| Package pages | inline `WORKER_URL` + `js/lead-capture.js` |
| `products/built-by-me-ez-logo-t-shirt-*.html` | inline `WORKER_URL` + `js/merch-checkout.js` |

Merch product pages require `data-merch-color="black|brown|blue"` on `<body>`.

---

## 7. Merch test checklist

- [ ] Form blocks submit without a size selected
- [ ] `/create-merch-checkout` returns a Stripe Checkout URL for each color
- [ ] Webhook writes one row to Airtable Merch Orders (no duplicates on retry)
- [ ] Admin email arrives at `builtbymeez1@gmail.com`
- [ ] Customer receives order confirmation email
- [ ] Stripe receipt email enabled
- [ ] Success redirect lands on `products/order-confirmation.html`
- [ ] Training package checkout still provisions KV credits (regression)
- [ ] Legacy merch Payment Links deactivated after go-live

