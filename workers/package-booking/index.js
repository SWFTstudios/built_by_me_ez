/**
 * Built By Me EZ — Package Booking Worker
 *
 * Endpoints:
 *   POST /webhook/stripe  — Stripe checkout.session.completed
 *   POST /webhook/cal     — Cal.com BOOKING_CREATED (decrements credit)
 *   GET  /validate        — ?token=TOKEN  → session info for booking portal
 *   POST /resend-link     — {email} → re-emails the booking link
 *   POST /save-lead            — saves interest lead to Airtable (client FormSubmit handles user email)
 *   POST /create-merch-checkout — creates Stripe Checkout Session for t-shirt orders
 *
 * KV keys:
 *   credits:{email}   → { packageSlug, calSlug, label, total, used, token, paidAt }
 *   token:{token}     → { email }
 *
 * Required environment bindings (set via Cloudflare dashboard or wrangler):
 *   CREDITS_KV            — KV namespace
 *   STRIPE_WEBHOOK_SECRET — whsec_... from Stripe dashboard
 *   STRIPE_SECRET_KEY       — sk_live_... or sk_test_... for Checkout Sessions API
 *   SITE_URL              — e.g. https://builtbymeez.com
 *   FORM_SUBMIT_EMAIL     — builtbymeez1@gmail.com (wrangler.toml [vars])
 *   CAL_USERNAME          — e.g. omar-ndiaye-illqmu
 *   AIRTABLE_API_KEY      — personal access token (pat...) from airtable.com/create/tokens
 *   AIRTABLE_BASE_ID      — set in wrangler.toml [vars]
 *   AIRTABLE_TABLE_ID     — set in wrangler.toml [vars]
 *   AIRTABLE_MERCH_TABLE_ID — Merch Orders table in wrangler.toml [vars]
 */

const ALLOWED_ORIGINS = [
  'https://builtbymeez.com',
  'https://builtbymeez-website.pages.dev',
  'https://customer-onboarding-flow-upd.builtbymeez-website.pages.dev',
];

const PACKAGES = {
  '8-session-1-1':  { sessions: 8,  calSlug: '8-session-training-package',      label: '8-Session 1:1 Training' },
  '12-session-1-1': { sessions: 12, calSlug: '12-session-1-1-training-package', label: '12-Session 1:1 Training' },
  '16-session-1-1': { sessions: 16, calSlug: '16-session-package',              label: '16-Session 1:1 Training' },
  '8-session-semi': { sessions: 8,  calSlug: '8-session-semi-private-package',  label: '8-Session Semi-Private' },
  '12-session-semi':{ sessions: 12, calSlug: '12-session-semi-private-package', label: '12-Session Semi-Private' },
  '16-session-semi':{ sessions: 16, calSlug: '16-session-semi-private-package', label: '16-Session Semi-Private' },
};

// Unambiguous amount (cents) → package slug fallback when client_reference_id is missing.
// $700 maps to two packages so it's excluded here — metadata is required for those.
const AMOUNT_TO_PACKAGE = {
  47500: '8-session-1-1',
  95000: '16-session-1-1',
  40000: '8-session-semi',
  55000: '12-session-semi',
};

const ALLOWED_SIZES = new Set(['XS', 'S', 'M', 'L', 'XL']);

const MERCH_BY_COLOR = {
  black: {
    slug: 'logo-tshirt-black',
    color: 'Black',
    label: 'Built By Me EZ Logo T-Shirt | Black',
    priceKey: 'STRIPE_PRICE_BLACK',
  },
  brown: {
    slug: 'logo-tshirt-brown',
    color: 'Brown',
    label: 'Built By Me EZ Logo T-Shirt | Brown',
    priceKey: 'STRIPE_PRICE_BROWN',
  },
  blue: {
    slug: 'logo-tshirt-blue',
    color: 'Blue',
    label: 'Built By Me EZ Logo T-Shirt | Blue',
    priceKey: 'STRIPE_PRICE_BLUE',
  },
};

const MERCH_BY_SLUG = Object.fromEntries(
  Object.values(MERCH_BY_COLOR).map((item) => [item.slug, item]),
);

// Matches legacy merch Payment Link shipping countries (US-focused + international).
const MERCH_SHIPPING_COUNTRIES = [
  'US', 'CA', 'GB', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'CH', 'SE', 'NO', 'DK',
  'IE', 'PT', 'AT', 'FI', 'PL', 'CZ', 'MX', 'BR', 'JP', 'NZ', 'SG', 'HK', 'IN',
];

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const siteUrl = env.SITE_URL || 'https://builtbymeez.com';
  let allowOrigin = siteUrl;
  if (ALLOWED_ORIGINS.includes(origin)) {
    allowOrigin = origin;
  } else if (origin.endsWith('.builtbymeez-website.pages.dev')) {
    allowOrigin = origin;
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === '/webhook/stripe' && request.method === 'POST') {
        return handleStripeWebhook(request, env, cors);
      }
      if (url.pathname === '/webhook/cal' && request.method === 'POST') {
        return handleCalWebhook(request, env, cors);
      }
      if (url.pathname === '/validate' && request.method === 'GET') {
        return handleValidate(request, env, cors);
      }
      if (url.pathname === '/resend-link' && request.method === 'POST') {
        return handleResendLink(request, env, cors);
      }
      if (url.pathname === '/save-lead' && request.method === 'POST') {
        return handleSaveLead(request, env, cors);
      }
      if (url.pathname === '/create-merch-checkout' && request.method === 'POST') {
        return handleCreateMerchCheckout(request, env, cors);
      }
      return new Response('Not found', { status: 404, headers: cors });
    } catch (err) {
      console.error('Worker error:', err);
      return new Response('Internal server error', { status: 500, headers: cors });
    }
  },
};

// ---------------------------------------------------------------------------
// Stripe webhook
// ---------------------------------------------------------------------------

async function handleStripeWebhook(request, env, cors) {
  const rawBody = await request.text();
  const sigHeader = request.headers.get('Stripe-Signature') || '';

  try {
    await verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe signature error:', err.message);
    return new Response('Unauthorized', { status: 401, headers: cors });
  }

  const event = JSON.parse(rawBody);
  if (event.type !== 'checkout.session.completed') {
    return new Response('OK', { status: 200, headers: cors });
  }

  const session = event.data.object;

  if (isMerchSession(session)) {
    return handleMerchCheckout(session, env, cors);
  }

  const email = session.customer_details?.email?.toLowerCase().trim();
  if (!email) {
    console.error('No email in checkout session', session.id);
    return new Response('OK', { status: 200, headers: cors });
  }

  // Resolve package: prefer client_reference_id (set via URL param on the payment link),
  // then metadata.package_slug, then amount fallback.
  const ref = session.client_reference_id || session.metadata?.package_slug;
  const packageSlug = ref && PACKAGES[ref]
    ? ref
    : AMOUNT_TO_PACKAGE[session.amount_total];

  if (!packageSlug) {
    console.error(`Cannot resolve package for amount ${session.amount_total} / ref "${ref}"`);
    return new Response('OK', { status: 200, headers: cors });
  }

  const pkg = PACKAGES[packageSlug];
  const token = generateToken();
  const paidAt = new Date().toISOString();

  const creditsKey = `credits:${email}`;
  const tokenKey = `token:${token}`;

  const record = {
    packageSlug,
    calSlug: pkg.calSlug,
    label: pkg.label,
    total: pkg.sessions,
    used: 0,
    token,
    paidAt,
    stripeSessionId: session.id,
  };

  await Promise.all([
    env.CREDITS_KV.put(creditsKey, JSON.stringify(record)),
    env.CREDITS_KV.put(tokenKey, JSON.stringify({ email }), { expirationTtl: 60 * 60 * 24 * 365 }),
  ]);

  const bookingUrl = `${getSiteUrl(env)}/book-sessions.html?token=${token}`;
  await sendPackageBookingEmail(env, email, pkg, bookingUrl);

  return new Response('OK', { status: 200, headers: cors });
}

// ---------------------------------------------------------------------------
// Merch checkout (Stripe Checkout Sessions)
// ---------------------------------------------------------------------------

async function handleCreateMerchCheckout(request, env, cors) {
  const stripeKey = getStripeSecretKey(env);
  if (!stripeKey) {
    return jsonResponse({ ok: false, error: 'Checkout is not configured' }, 503, cors);
  }
  if (!isValidStripeSecretKey(stripeKey)) {
    return jsonResponse({
      ok: false,
      error: isPreviewOrigin(request)
        ? 'Invalid STRIPE_SECRET_KEY — re-run: npx wrangler secret put STRIPE_SECRET_KEY (use sk_live_... from Stripe Dashboard)'
        : 'Checkout is not configured',
    }, 503, cors);
  }

  const body = await request.json();
  const name = body.name?.trim();
  const email = body.email?.toLowerCase().trim();
  const size = normalizeSize(body.size);
  const colorSlug = body.colorSlug?.toLowerCase().trim();

  if (!name || name.length < 3) {
    return jsonResponse({ ok: false, error: 'Please enter your full name' }, 400, cors);
  }
  if (!email) {
    return jsonResponse({ ok: false, error: 'Email is required' }, 400, cors);
  }
  if (!size || !ALLOWED_SIZES.has(size)) {
    return jsonResponse({ ok: false, error: 'Please select a valid size' }, 400, cors);
  }

  const merch = MERCH_BY_COLOR[colorSlug];
  if (!merch) {
    return jsonResponse({ ok: false, error: 'Invalid product color' }, 400, cors);
  }

  const priceId = env[merch.priceKey];
  if (!priceId) {
    console.error(`Missing Stripe price for ${colorSlug}`);
    return jsonResponse({ ok: false, error: 'Product is not configured' }, 503, cors);
  }

  const siteUrl = getSiteUrl(env);

  try {
    const session = await stripeRequest(env, 'checkout/sessions', buildMerchCheckoutParams({
      email,
      name,
      size,
      colorSlug,
      merch,
      priceId,
      siteUrl,
    }));

    return jsonResponse({ ok: true, url: session.url }, 200, cors);
  } catch (err) {
    console.error('Stripe checkout session error:', err.message);
    const error = isPreviewOrigin(request) ? err.message : 'Unable to start checkout';
    return jsonResponse({ ok: false, error }, 502, cors);
  }
}

function buildMerchCheckoutParams({ email, name, size, colorSlug, merch, priceId, siteUrl }) {
  const params = {
    mode: 'payment',
    customer_email: email,
    client_reference_id: merch.slug,
    'metadata[product_type]': 'merch',
    'metadata[name]': name,
    'metadata[size]': size,
    'metadata[color]': merch.color,
    'metadata[merch_slug]': merch.slug,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'payment_method_types[0]': 'card',
    billing_address_collection: 'required',
    'automatic_tax[enabled]': 'true',
    success_url: `${siteUrl}/products/order-confirmation.html?color=${colorSlug}`,
    cancel_url: `${siteUrl}/products/built-by-me-ez-logo-t-shirt-${colorSlug}.html`,
  };

  MERCH_SHIPPING_COUNTRIES.forEach((country, index) => {
    params[`shipping_address_collection[allowed_countries][${index}]`] = country;
  });

  return params;
}

function isMerchSession(session) {
  if (session.metadata?.product_type === 'merch') return true;
  const ref = session.client_reference_id || session.metadata?.merch_slug || '';
  return ref.startsWith('logo-tshirt-');
}

async function handleMerchCheckout(session, env, cors) {
  const idempotencyKey = `merch-order:${session.id}`;
  const existing = await env.CREDITS_KV.get(idempotencyKey);
  if (existing) {
    return new Response('OK', { status: 200, headers: cors });
  }

  const email = session.customer_details?.email?.toLowerCase().trim();
  if (!email) {
    console.error('No email in merch checkout session', session.id);
    return new Response('OK', { status: 200, headers: cors });
  }

  const slug = session.client_reference_id
    || session.metadata?.merch_slug
    || '';
  const merch = MERCH_BY_SLUG[slug];
  const name = session.metadata?.name?.trim() || 'Not provided';
  const size = normalizeSize(session.metadata?.size) || 'Not provided';
  const color = session.metadata?.color || merch?.color || 'Unknown';
  const productLabel = merch?.label || `Built By Me EZ Logo T-Shirt | ${color}`;
  const amountCents = session.amount_total || 0;
  const amountFormatted = formatUsd(amountCents);
  const orderDate = new Date().toISOString();

  const order = {
    name,
    email,
    productLabel,
    color,
    size,
    amountCents,
    amountFormatted,
    stripeSessionId: session.id,
    orderDate,
  };

  await saveMerchOrderToAirtable(env, order);
  await sendMerchAdminEmail(env, order);
  await sendMerchCustomerEmail(env, order);

  await env.CREDITS_KV.put(idempotencyKey, JSON.stringify({ processedAt: orderDate }), {
    expirationTtl: 60 * 60 * 24 * 365,
  });

  return new Response('OK', { status: 200, headers: cors });
}

async function saveMerchOrderToAirtable(env, order) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !env.AIRTABLE_MERCH_TABLE_ID) {
    console.log('[AIRTABLE SKIP] Missing merch table credentials — order not saved:', order.email);
    return;
  }

  const res = await fetch(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_MERCH_TABLE_ID}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [{
          fields: {
            Name: order.name,
            Email: order.email,
            Product: order.productLabel,
            Color: order.color,
            Size: order.size,
            Amount: order.amountCents / 100,
            Status: 'Paid',
            'Stripe Session ID': order.stripeSessionId,
            'Order Date': order.orderDate.slice(0, 10),
          },
        }],
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    console.error('Airtable merch order error:', err);
  }
}

async function sendMerchAdminEmail(env, order) {
  await sendFormSubmit(env, {
    subject: `New merch order — ${order.color} / ${order.size}`,
    fields: {
      'Customer Name': order.name,
      'Customer Email': order.email,
      Product: order.productLabel,
      Color: order.color,
      Size: order.size,
      'Amount Paid': order.amountFormatted,
      'Stripe Session ID': order.stripeSessionId,
      'Order Date': order.orderDate,
      Message: 'Fulfill this t-shirt order and confirm shipping with the customer.',
    },
  });
}

async function sendMerchCustomerEmail(env, order) {
  await sendFormSubmitTo(order.email, {
    subject: 'Your Built By Me EZ order is confirmed',
    fields: {
      'Customer Name': order.name,
      Product: order.productLabel,
      Color: order.color,
      Size: order.size,
      'Amount Paid': order.amountFormatted,
      'Order Date': order.orderDate,
      Message: 'Thank you for your order. We will follow up with shipping details soon. Questions? Reply to builtbymeez1@gmail.com.',
    },
  });
}

// ---------------------------------------------------------------------------
// Cal.com webhook (decrement credit when a session is booked)
// ---------------------------------------------------------------------------

async function handleCalWebhook(request, env, cors) {
  const body = await request.json();

  // Cal.com sends triggerEvent = "BOOKING_CREATED"
  if (body.triggerEvent !== 'BOOKING_CREATED') {
    return new Response('OK', { status: 200, headers: cors });
  }

  const attendeeEmail = body.payload?.attendees?.[0]?.email?.toLowerCase().trim();
  if (!attendeeEmail) {
    return new Response('OK', { status: 200, headers: cors });
  }

  const creditsKey = `credits:${attendeeEmail}`;
  const raw = await env.CREDITS_KV.get(creditsKey);
  if (!raw) {
    return new Response('OK', { status: 200, headers: cors });
  }

  const record = JSON.parse(raw);
  if (record.used < record.total) {
    record.used += 1;
    await env.CREDITS_KV.put(creditsKey, JSON.stringify(record));
  }

  return new Response('OK', { status: 200, headers: cors });
}

// ---------------------------------------------------------------------------
// Validate token (called by book-sessions.html)
// ---------------------------------------------------------------------------

async function handleValidate(request, env, cors) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return jsonResponse({ valid: false, error: 'Missing token' }, 400, cors);
  }

  const tokenRaw = await env.CREDITS_KV.get(`token:${token}`);
  if (!tokenRaw) {
    return jsonResponse({ valid: false, error: 'Invalid or expired token' }, 404, cors);
  }

  const { email } = JSON.parse(tokenRaw);
  const creditsRaw = await env.CREDITS_KV.get(`credits:${email}`);
  if (!creditsRaw) {
    return jsonResponse({ valid: false, error: 'No credits found for this token' }, 404, cors);
  }

  const record = JSON.parse(creditsRaw);
  const calUsername = env.CAL_USERNAME || 'omar-ndiaye-illqmu';

  return jsonResponse({
    valid: true,
    email,
    label: record.label,
    calLink: `${calUsername}/${record.calSlug}`,
    total: record.total,
    used: record.used,
    remaining: record.total - record.used,
    paidAt: record.paidAt,
  }, 200, cors);
}

// ---------------------------------------------------------------------------
// Resend booking link (if client lost their email)
// ---------------------------------------------------------------------------

async function handleResendLink(request, env, cors) {
  const { email: rawEmail } = await request.json();
  const email = rawEmail?.toLowerCase().trim();
  if (!email) {
    return jsonResponse({ ok: false, error: 'Email required' }, 400, cors);
  }

  const creditsRaw = await env.CREDITS_KV.get(`credits:${email}`);
  if (!creditsRaw) {
    // Don't reveal whether the email exists
    return jsonResponse({ ok: true }, 200, cors);
  }

  const record = JSON.parse(creditsRaw);
  const pkg = PACKAGES[record.packageSlug];
  const bookingUrl = `${getSiteUrl(env)}/book-sessions.html?token=${record.token}`;
  await sendPackageBookingEmail(env, email, pkg, bookingUrl, 'Booking link resend');

  return jsonResponse({ ok: true }, 200, cors);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateToken() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyStripeSignature(payload, sigHeader, secret) {
  const parts = sigHeader.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts['t'];
  const sig = parts['v1'];
  if (!timestamp || !sig) throw new Error('Malformed Stripe-Signature header');

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`));
  const computed = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (computed !== sig) throw new Error('Signature mismatch');

  // Reject if older than 5 minutes to prevent replay attacks
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (age > 300) throw new Error('Timestamp too old');
}

function getSiteUrl(env) {
  return (env.SITE_URL || 'https://builtbymeez.com').replace(/\/$/, '');
}

async function sendFormSubmit(env, { subject, fields, cc }) {
  const formEmail = env.FORM_SUBMIT_EMAIL || 'builtbymeez1@gmail.com';
  await postFormSubmit(formEmail, { subject, fields, cc });
}

async function sendFormSubmitTo(recipientEmail, { subject, fields }) {
  await postFormSubmit(recipientEmail, { subject, fields });
}

async function postFormSubmit(formEmail, { subject, fields, cc }) {
  const body = {
    _subject: subject,
    _template: 'table',
    _captcha: 'false',
    ...fields,
  };
  if (cc) body._cc = cc;

  try {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(formEmail)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error('FormSubmit error:', res.status, await res.text());
    }
  } catch (err) {
    console.error('FormSubmit error:', err);
  }
}

async function sendPackageBookingEmail(env, clientEmail, pkg, bookingUrl, typeLabel) {
  await sendFormSubmit(env, {
    subject: typeLabel || `New package sale: ${pkg.label}`,
    cc: clientEmail,
    fields: {
      email: clientEmail,
      package: pkg.label,
      sessions: String(pkg.sessions),
      booking_url: bookingUrl,
      type: typeLabel || 'Package purchase',
      message: `Booking link for customer: ${bookingUrl}`,
    },
  });
}

// ---------------------------------------------------------------------------
// Save lead (date-interest form → Airtable + user confirmation email)
// ---------------------------------------------------------------------------

async function handleSaveLead(request, env, cors) {
  const body = await request.json();
  const email = body.email?.toLowerCase().trim();
  if (!email) {
    return jsonResponse({ ok: false, error: 'Email required' }, 400, cors);
  }

  await saveLeadToAirtable(env, body);

  return jsonResponse({ ok: true }, 200, cors);
}

async function saveLeadToAirtable(env, { name, email, package_label, ideal_dates }) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !env.AIRTABLE_TABLE_ID) {
    console.log('[AIRTABLE SKIP] Missing credentials — lead not saved:', email);
    return;
  }

  const res = await fetch(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_TABLE_ID}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [{
          fields: {
            Name:          name || 'Not provided',
            Email:         email,
            Package:       package_label || '',
            Stage:         'Potential',
            'Ideal Dates': Array.isArray(ideal_dates) ? ideal_dates.join('\n') : (ideal_dates || ''),
            Source:        'Website — Date Interest Form',
            'Submitted At': new Date().toISOString(),
          },
        }],
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    console.error('Airtable save-lead error:', err);
  }
}

function jsonResponse(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function normalizeSize(raw) {
  if (!raw) return '';
  const value = String(raw).trim().toUpperCase();
  if (value === 'LARGE') return 'L';
  if (value.startsWith('XS')) return 'XS';
  if (value.startsWith('XL')) return 'XL';
  if (value.startsWith('S')) return 'S';
  if (value.startsWith('M')) return 'M';
  if (value.startsWith('L')) return 'L';
  return ALLOWED_SIZES.has(value) ? value : '';
}

function formatUsd(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function getStripeSecretKey(env) {
  return (env.STRIPE_SECRET_KEY || '').trim();
}

function isValidStripeSecretKey(key) {
  if (!key) return false;
  if (key.startsWith('pk_') || key.startsWith('whsec_') || key.startsWith('rk_')) return false;
  return /^sk_(live|test)_/.test(key) && key.length > 24;
}

function isPreviewOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  return origin.endsWith('.builtbymeez-website.pages.dev')
    || origin.includes('localhost')
    || origin.includes('127.0.0.1');
}

async function stripeRequest(env, path, params) {
  const secret = getStripeSecretKey(env);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    body.append(key, value);
  }

  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe API error (${res.status})`);
  }
  return data;
}
