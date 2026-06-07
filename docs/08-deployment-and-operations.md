# Chapter 8 — Deployment and Operations

This chapter covers how to deploy the Built By Me EZ website and Worker, configure third-party services, and maintain the platform in production.

**Operator runbook:** [Worker Setup Guide](../workers/package-booking/README.md)

---

## Deployment Architecture

| Component | Platform | Trigger | Domain |
|-----------|----------|---------|--------|
| Static site | Cloudflare Pages | Git push to `main` | `builtbymeez.com` |
| Worker API | Cloudflare Workers | Manual `wrangler deploy` | `package-booking.elombe.workers.dev` |

Pages and Worker deploy independently. Frontend changes do not require Worker redeploy unless API contracts change.

---

## Cloudflare Pages (Static Site)

### Repository connection

The GitHub repo `SWFTstudios/built_by_me_ez` connects to Cloudflare Pages. Pushes to `main` trigger production deploys. Feature branches create preview URLs:

```
https://{branch-slug}.builtbymeez-website.pages.dev
```

### Publish directory

Site root (no build step). HTML, CSS, JS, and images deploy as-is.

### Cache headers

`_headers` at repo root configures Cloudflare Pages cache behavior:

```
/css/builtbymeez.css
  Cache-Control: public, max-age=300, must-revalidate

/js/merch-checkout.js
  Cache-Control: no-cache, must-revalidate
```

Merch scripts use `no-cache` because checkout logic is critical and changed frequently during development.

### Cache busting

Product page script tags include version query params:

```html
<script src="../js/merch-checkout.js?v=20260605"></script>
```

Increment the version when changing payment-related JavaScript.

---

## Cloudflare Worker

### Deploy

```bash
cd workers/package-booking
npx wrangler deploy
```

### First-time setup

1. Create KV namespace:
   ```bash
   npx wrangler kv:namespace create CREDITS_KV
   ```
2. Copy namespace ID into `wrangler.toml`
3. Set secrets (see below)
4. Deploy

### Verify deployment

```bash
curl "https://package-booking.elombe.workers.dev/validate?token=test"
# Expect JSON error (invalid token) — confirms Worker is responding
```

---

## Secrets Checklist

Never commit these to the repository. Set via Wrangler CLI:

```bash
cd workers/package-booking

npx wrangler secret put STRIPE_WEBHOOK_SECRET   # whsec_... from Stripe Dashboard
npx wrangler secret put STRIPE_SECRET_KEY       # sk_live_... from Stripe API keys
npx wrangler secret put AIRTABLE_API_KEY        # pat_... from airtable.com/create/tokens
```

### Verify secrets are set

```bash
npx wrangler secret list
```

Expected output includes `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `AIRTABLE_API_KEY`.

**Important:** `STRIPE_SECRET_KEY` must be the full secret key (`sk_live_...`), not a publishable key (`pk_live_...`). Merch Payment Links do not require a valid secret key for checkout start—only webhook fulfillment and optional API checkout.

---

## Stripe Configuration

### Webhook endpoint

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://package-booking.elombe.workers.dev/webhook/stripe`
3. Events: `checkout.session.completed`
4. Copy signing secret → set as `STRIPE_WEBHOOK_SECRET`

One webhook handles both training packages and merch orders.

### Customer emails

Stripe Dashboard → Settings → Customer emails:

- **Successful payments:** ON (sends Stripe receipt after checkout)
- **Refunds:** ON (optional)

### Payment Links

**Training packages (6 links):** Each link URL in package HTML includes `?client_reference_id={slug}`.

**Merch (15 links):** URLs in `js/merch-payment-links.js`. Recreate via:

```bash
STRIPE_SECRET_KEY=sk_live_... node scripts/setup-merch-stripe-links.mjs
```

Verify all links respond:

```bash
node scripts/verify-merch-links.mjs
```

Deactivate legacy duplicates:

```bash
STRIPE_SECRET_KEY=sk_live_... node scripts/deactivate-old-merch-links.mjs
```

---

## Cal.com Configuration

### Webhook

1. Cal.com Dashboard → Developer → Webhooks → Add webhook
2. URL: `https://package-booking.elombe.workers.dev/webhook/cal`
3. Trigger: `BOOKING_CREATED`
4. Add for each of the 6 package event types

### Event slugs

Must match Worker `PACKAGES` calSlug values:

- `8-session-training-package`
- `12-session-1-1-training-package`
- `16-session-package`
- `8-session-semi-private-package`
- `12-session-semi-private-package`
- `16-session-semi-private-package`

---

## Airtable Configuration

1. Create personal access token at [airtable.com/create/tokens](https://airtable.com/create/tokens)
2. Grant read/write access to **Personal Trainer Demo CRM** base
3. Set token as `AIRTABLE_API_KEY` secret
4. Table IDs are pre-configured in `wrangler.toml`

Configure Interface views per [Chapter 6](06-lead-capture-and-crm.md).

---

## Google Analytics

Homepage includes Google Analytics 4:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-QWVH0FBHWX"></script>
```

Track package page conversions, merch checkout starts, and consultation form submissions via GA4 events (future enhancement).

---

## Local Development

### Static site

Open HTML files directly or use a local server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

**Note:** `builtbymeez.js` (Webflow interactions) may be missing from repo—export from Webflow if sliders/nav don't work locally.

### Worker

```bash
cd workers/package-booking
npx wrangler dev
```

Use `.dev.vars` for local secrets (not committed).

Point frontend `WORKER_URL` to local dev URL for integration testing.

---

## Production Verification Checklist

After any deploy, verify:

- [ ] Homepage loads; nav and sliders work
- [ ] Package page Pay Now opens Stripe at correct price
- [ ] Merch page checkout redirects to Stripe at $35 (no error message)
- [ ] `book-sessions.html` validates test token or shows email lookup
- [ ] Stripe webhook shows successful deliveries in Dashboard
- [ ] Test purchase creates Airtable row + emails Omar

See also the merch QA checklist in the [Worker README](../workers/package-booking/README.md#7-merch-test-checklist).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| "Checkout is not configured yet" on merch | Browser cached old checkout JS | Hard refresh; verify `?v=` on script tags |
| "Unable to start checkout" on packages | Invalid `STRIPE_SECRET_KEY` (API path) | Payment Links should not hit Worker; check frontend |
| Webhook 400 errors | Wrong `STRIPE_WEBHOOK_SECRET` | Re-copy signing secret from Stripe Dashboard |
| No Airtable rows | Missing or invalid `AIRTABLE_API_KEY` | Check Worker logs; verify token scopes |
| Cal bookings don't decrement credits | Cal webhook not configured | Add webhook URL; verify attendee email matches checkout email |
| Booking link not received | FormSubmit delivery | Check spam; verify `FORM_SUBMIT_EMAIL` in wrangler.toml |

---

## Monitoring

- **Stripe Dashboard** → Developers → Webhooks → view delivery logs
- **Cloudflare Dashboard** → Workers → package-booking → Logs (real-time)
- **Airtable** → verify new rows after test transactions
- **FormSubmit** → check delivery status if emails missing

---

[← Chapter 7 — Backend Worker](07-backend-worker.md) | [Chapter 9 — Stakeholder Impact →](09-stakeholder-impact.md)
