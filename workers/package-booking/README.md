# Package Booking Worker — Setup Guide

Cloudflare Worker that powers the pay-first, self-serve session booking flow.

## Architecture

```
Client → Stripe Payment Link
         ↓ webhook (checkout.session.completed)
Cloudflare Worker → writes KV, emails booking link via FormSubmit
         ↓ client opens link
book-sessions.html → GET /validate?token=TOKEN → Worker reads KV → Cal.com embed
         ↓ client books
Cal.com webhook → POST /webhook/cal → Worker decrements credit
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
npx wrangler secret put AIRTABLE_API_KEY        # pat_... (optional but recommended)
npx wrangler secret put SITE_URL                # https://builtbymeez.com (no trailing slash)
```

### Deploy
```bash
npx wrangler deploy
# Note the Worker URL: https://package-booking.elombe.workers.dev
```

---

## 2. Stripe Setup

### Create one Payment Link per package in the Stripe dashboard:

| Package | Sessions | Price | `client_reference_id` param |
|---------|----------|-------|------------------------|
| 8 Session 1:1 | 8 | $475 | `8-session-1-1` |
| 12 Session 1:1 | 12 | $700 | `12-session-1-1` |
| 16 Session 1:1 | 16 | $950 | `16-session-1-1` |
| 8 Session Semi-Private | 8 | $400 | `8-session-semi` |
| 12 Session Semi-Private | 12 | $550 | `12-session-semi` |
| 16 Session Semi-Private | 16 | $700 | `16-session-semi` |

**Important:** Append `?client_reference_id=SLUG` to each payment link URL in the HTML, e.g.:
```
https://buy.stripe.com/YOUR_LINK_ID?client_reference_id=12-session-1-1
```
This tells the Worker which package was purchased.

### Register the webhook
1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://package-booking.elombe.workers.dev/webhook/stripe`
3. Events: `checkout.session.completed`
4. Copy the **Signing secret** → set as `STRIPE_WEBHOOK_SECRET`

---

## 3. Cal.com Setup (credit auto-decrement)

1. Cal.com Dashboard → Developer → Webhooks → Add webhook
2. URL: `https://package-booking.elombe.workers.dev/webhook/cal`
3. Trigger: `BOOKING_CREATED`
4. Add for each of the 6 package event types

---

## 4. Email (FormSubmit)

Booking confirmation emails are sent via [FormSubmit](https://formsubmit.co) to `builtbymeez1@gmail.com` (configured in `wrangler.toml` as `FORM_SUBMIT_EMAIL`). The customer receives a CC copy via `_cc` (AJAX does not support `_autoresponse`).

Lead capture confirmation emails are handled client-side in `js/lead-capture.js`.

---

## 5. Update book-sessions.html

After deploying the Worker, open `book-sessions.html` and replace `WORKER_URL_PLACEHOLDER`:
```js
var WORKER_URL = 'https://package-booking.elombe.workers.dev';
```

---

## 6. Package page payment links

Payment link URLs are configured in the 6 package HTML pages on branch `customer-onboarding-flow-update-6.5.26` (`.pay-now-btn` href and `.section-lead-capture` `data-stripe-link`), each with the correct `?client_reference_id=SLUG` suffix.

See the Stripe setup summary in the project chat / deployment notes for Product ID, Price ID, Payment Link ID, and full URLs.
