# Chapter 7 — Backend Worker

The `package-booking` Cloudflare Worker is the server-side brain of Built By Me EZ. It handles Stripe and Cal.com webhooks, manages session credits in KV storage, syncs data to Airtable, and sends transactional emails—all without a traditional backend server.

**Source:** `workers/package-booking/index.js`  
**URL:** `https://package-booking.elombe.workers.dev`

For deployment and secrets setup, see the [Worker Setup Guide](../workers/package-booking/README.md).

---

## Endpoint Reference

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/webhook/stripe` | Stripe `checkout.session.completed` — training or merch |
| `POST` | `/webhook/cal` | Cal.com `BOOKING_CREATED` — decrement session credits |
| `GET` | `/validate?token=` | Validate booking token; return Cal link + credit balance |
| `POST` | `/resend-link` | Re-email booking portal URL by customer email |
| `POST` | `/save-lead` | Persist lead capture data to Airtable |
| `POST` | `/create-merch-checkout` | Create Stripe Checkout Session (API fallback) |
| `OPTIONS` | `*` | CORS preflight |

All JSON endpoints return appropriate CORS headers for allowed origins.

---

## Environment Bindings

### KV Namespace

| Binding | Key patterns | Purpose |
|---------|--------------|---------|
| `CREDITS_KV` | `credits:{email}` | Package credit balance + metadata |
| | `token:{token}` | Email lookup for portal validation |
| | `merch-order:{sessionId}` | Merch webhook idempotency |

Namespace ID: `66dd167618ac4c97927a7eeebfb56cd7`

### Secrets (via `wrangler secret put`)

| Secret | Purpose |
|--------|---------|
| `STRIPE_WEBHOOK_SECRET` | Verify Stripe webhook signatures (`whsec_...`) |
| `STRIPE_SECRET_KEY` | Stripe API calls (Checkout Sessions fallback) |
| `AIRTABLE_API_KEY` | Airtable REST API personal access token |

### Vars (in `wrangler.toml`)

| Var | Example | Purpose |
|-----|---------|---------|
| `SITE_URL` | `https://builtbymeez.com` | Email links, redirects |
| `FORM_SUBMIT_EMAIL` | `builtbymeez1@gmail.com` | Admin notification recipient |
| `CAL_USERNAME` | `omar-ndiaye-illqmu` | Cal.com embed paths |
| `AIRTABLE_BASE_ID` | `appnv92ohZuf9hmSL` | CRM base |
| `AIRTABLE_*_TABLE_ID` | various | Table IDs for each CRM entity |
| `STRIPE_PRICE_BLACK/BROWN/BLUE` | `price_...` | Merch Checkout Session fallback |

---

## Stripe Webhook Handler

**Path:** `POST /webhook/stripe`

### Verification

1. Read `Stripe-Signature` header
2. Compute HMAC-SHA256 with `STRIPE_WEBHOOK_SECRET`
3. Reject if timestamp > 5 minutes old (replay protection)
4. Parse event JSON

### Event routing

Only processes `checkout.session.completed`. Ignores all other event types.

```javascript
if (isMerchSession(session)) {
  return handleMerchCheckout(session, env, cors);
}
// else: training package flow
```

### Merch detection

```javascript
function isMerchSession(session) {
  if (session.metadata?.product_type === 'merch') return true;
  const ref = session.client_reference_id || session.metadata?.merch_slug || '';
  return ref.startsWith('logo-tshirt-');
}
```

### Training package flow

1. Resolve package slug from `client_reference_id` → metadata → amount fallback
2. Generate booking token
3. Write KV: `credits:{email}`, `token:{token}`
4. Send FormSubmit email (admin + customer CC with booking link)
5. Upsert Airtable Client + create Package Purchase

### Merch flow

1. Check idempotency key `merch-order:{sessionId}`
2. Parse color/size from metadata or `client_reference_id`
3. Create Merch Order in Airtable; upsert Client as Merch Customer
4. Send admin email + customer confirmation email
5. Store idempotency key in KV

---

## Cal.com Webhook Handler

**Path:** `POST /webhook/cal`

### Trigger

`triggerEvent === 'BOOKING_CREATED'`

### Processing

1. Extract attendee email from payload
2. Look up `credits:{email}` in KV
3. If found and `used < total`, increment `used`
4. Create Session Booking row in Airtable
5. Patch active Package Purchase (sessions used/remaining)

**Note:** Credit decrement uses email match, not booking token. This allows Cal.com's native booking flow without custom token passing.

---

## Booking Portal API

### `GET /validate?token=TOKEN`

Returns session info for `book-sessions.html`:

```json
{
  "ok": true,
  "label": "12-Session 1:1 Training",
  "remaining": 10,
  "total": 12,
  "calLink": "omar-ndiaye-illqmu/12-session-1-1-training-package"
}
```

Looks up `token:{token}` → email → `credits:{email}`.

### `POST /resend-link`

Body: `{ "email": "customer@example.com" }`

Re-sends booking portal URL via FormSubmit. Always returns `{ "ok": true }` regardless of whether email exists (anti-enumeration).

---

## Lead Capture API

### `POST /save-lead`

Body includes name, email, package slug, ideal dates, stripe link.

Creates Airtable Leads row and upserts Client as Prospect.

**No email sent by Worker** — FormSubmit handles user-facing notifications client-side.

---

## Email via FormSubmit

The Worker sends emails by POSTing to FormSubmit's AJAX endpoint:

```
https://formsubmit.co/ajax/{recipient}
```

### Email types

| Trigger | Recipient | CC | Subject pattern |
|---------|-----------|-----|-----------------|
| Package purchase | Admin | Customer | `New package sale: {label}` |
| Resend link | Admin | Customer | `Booking link resend` |
| Merch admin | Admin | — | `New merch order — {color} / {size}` |
| Merch customer | Customer | — | `Your Built By Me EZ order is confirmed` |

FormSubmit uses `_template: table` for readable HTML formatting.

---

## CORS Configuration

Allowed origins:

```javascript
const ALLOWED_ORIGINS = [
  'https://builtbymeez.com',
  'https://builtbymeez-website.pages.dev',
  'https://customer-onboarding-flow-upd.builtbymeez-website.pages.dev',
];
```

Preview deploys matching `*.builtbymeez-website.pages.dev` are also permitted dynamically.

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Webhook spoofing | Stripe signature verification with secret |
| Replay attacks | 5-minute timestamp window on webhooks |
| Email enumeration | Resend-link always returns success |
| Secret exposure | Secrets in Wrangler only; never in repo |
| CORS abuse | Origin allowlist |
| Duplicate merch orders | KV idempotency keys |
| Missing CRM credentials | Graceful skip with logging |

---

## Error Handling Philosophy

The Worker favors **continue on partial failure**:

- Missing Airtable → log skip, emails still send
- Missing email on merch session → return 200 to Stripe (prevent retry loops)
- Invalid booking token → return structured JSON error for portal UI

Stripe webhooks must return 200 quickly to avoid retries; heavy work is synchronous but bounded.

---

## Code Organization

The Worker is a single `index.js` file (~960 lines) organized by concern:

1. Constants (`PACKAGES`, `MERCH_BY_COLOR`, CORS origins)
2. Main `fetch` router
3. Stripe webhook + package/merch handlers
4. Cal webhook handler
5. Portal endpoints (`validate`, `resend-link`, `save-lead`)
6. Airtable helpers
7. Email helpers (FormSubmit)
8. Utility functions (size normalization, reference parsing)

**Design choice:** Monolithic Worker file keeps deployment simple for a solo-operator business. Split into modules if complexity grows.

---

[← Chapter 6 — Lead Capture and CRM](06-lead-capture-and-crm.md) | [Chapter 8 — Deployment and Operations →](08-deployment-and-operations.md)
