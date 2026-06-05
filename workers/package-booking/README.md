# Package Booking Worker — Setup Guide

Cloudflare Worker that powers training package booking and merch t-shirt checkout.

## Architecture

### Training packages
```
Client → Stripe Payment Link (training packages + merch t-shirts)
         ↓ webhook (checkout.session.completed)
Cloudflare Worker → writes KV, emails booking link via FormSubmit
         ↓ client opens link
book-sessions.html → GET /validate?token=TOKEN → Worker reads KV → Cal.com embed
         ↓ client books
Cal.com webhook → POST /webhook/cal → Worker decrements credit
```

### Merch (t-shirts)
```
Product page → select colorway + size → redirect to Stripe Payment Link ($35)
         ↓ payment complete
Stripe webhook (checkout.session.completed) → Worker
         ↓
Airtable Merch Orders + admin email to builtbymeez1@gmail.com + customer confirmation email
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

### Merch — Payment Links (colorway + size)

T-shirt checkout uses **15 Stripe Payment Links** (5 sizes × 3 colorways). Each link has its **own Stripe product** with a descriptive name:

`Built By Me EZ Logo T-Shirt — {Black|Brown|Blue} / {XS|S|M|L|XL}`

URLs live in `js/merch-payment-links.js`. Each checkout URL appends:

- `client_reference_id=logo-tshirt-{color}-{size}` (for the Worker webhook)
- `prefilled_email={email}` when the customer entered one

Links include shipping address collection, redirect to `products/order-confirmation.html`, and metadata (`color`, `size`, `merch_slug`) for webhooks.

**Maintenance scripts** (require `STRIPE_SECRET_KEY`):

```bash
node scripts/setup-merch-stripe-links.mjs      # recreate all 15 links
node scripts/deactivate-old-merch-links.mjs    # deactivate legacy duplicates
```

In Stripe Dashboard → Settings → Emails, enable **successful payment receipts** for customers.

### Register the webhook
1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://package-booking.elombe.workers.dev/webhook/stripe`
3. Events: `checkout.session.completed`
4. Copy the **Signing secret** → set as `STRIPE_WEBHOOK_SECRET`

The same webhook handles both training packages and merch. Merch sessions are identified by `metadata.product_type = merch` or `client_reference_id` starting with `logo-tshirt-`.

---

## 3. Airtable Setup — Personal Trainer Demo CRM

Base: **[Personal Trainer Demo CRM](https://airtable.com/appnv92ohZuf9hmSL)** (`appnv92ohZuf9hmSL`)

The Worker syncs website activity into these tables:

| Table | ID | What lands here |
|-------|-----|-----------------|
| **Leads** | `tbluTQ38LPRru9Pxx` | Date-interest form submissions (prospects) |
| **Clients** | `tbllorzeIP6XnBrjF` | Unified contacts — auto-created/updated by email |
| **Package Purchases** | `tblWVjmTXCjPe0smR` | Stripe training package payments + session credits |
| **Session Bookings** | `tblaac1fAf4f61cQs` | Each Cal.com booking; updates sessions used |
| **Merch Orders** | `tbl7w4Trf30AmWYzW` | T-shirt checkout orders |

### Suggested Interface dashboard (grouped for trainers)

1. **Prospects** — `Leads` view filtered `Status = Interested` or `Follow Up`
2. **Active Clients** — `Clients` filtered `Stage = Active Client`
3. **Packages & Credits** — `Package Purchases` grouped by `Status`, sort by `Paid Date`
4. **Upcoming Sessions** — `Session Bookings` filtered `Status = Scheduled`
5. **Merch Fulfillment** — `Merch Orders` filtered `Status = Paid`

### Token scopes

Create a personal access token at [airtable.com/create/tokens](https://airtable.com/create/tokens) with **read/write** access to **Personal Trainer Demo CRM**, then:

```bash
npx wrangler secret put AIRTABLE_API_KEY
npx wrangler deploy
```

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
| `products/built-by-me-ez-logo-t-shirt.html` | `js/merch-payment-links.js` + `js/merch-product.js` + `js/merch-checkout.js` |

Merch product pages require `data-merch-color="black|brown|blue"` on `<body>`.

---

## 7. Merch test checklist

- [ ] Form blocks submit without a size selected
- [ ] Checkout opens Stripe Payment Link for each color + size
- [ ] Webhook writes one row to Airtable Merch Orders (no duplicates on retry)
- [ ] Admin email arrives at `builtbymeez1@gmail.com`
- [ ] Customer receives order confirmation email
- [ ] Stripe receipt email enabled
- [ ] Success redirect lands on `products/order-confirmation.html`
- [ ] Training package checkout still provisions KV credits (regression)
- [ ] Legacy merch Payment Links deactivated after go-live

