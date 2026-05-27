/**
 * Built By Me EZ — Package Booking Worker
 *
 * Endpoints:
 *   POST /webhook/stripe  — Stripe checkout.session.completed
 *   POST /webhook/cal     — Cal.com BOOKING_CREATED (decrements credit)
 *   GET  /validate        — ?token=TOKEN  → session info for booking portal
 *   POST /resend-link     — {email} → re-emails the booking link
 *
 * KV keys:
 *   credits:{email}   → { packageSlug, calSlug, label, total, used, token, paidAt }
 *   token:{token}     → { email }
 *
 * Required environment bindings (set via Cloudflare dashboard or wrangler):
 *   CREDITS_KV           — KV namespace
 *   STRIPE_WEBHOOK_SECRET — whsec_... from Stripe dashboard
 *   RESEND_API_KEY        — re_... from resend.com
 *   SITE_URL              — e.g. https://builtbymeez.com
 *   CAL_USERNAME          — e.g. omar-ndiaye-illqmu
 */

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    const cors = {
      'Access-Control-Allow-Origin': env.SITE_URL || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

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

  const bookingUrl = `${env.SITE_URL}/book-sessions.html?token=${token}`;
  await sendBookingEmail(env, email, pkg, bookingUrl);
  await notifyOmar(env, email, pkg, bookingUrl);

  return new Response('OK', { status: 200, headers: cors });
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
  const bookingUrl = `${env.SITE_URL}/book-sessions.html?token=${record.token}`;
  await sendBookingEmail(env, email, pkg, bookingUrl);

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

async function sendBookingEmail(env, email, pkg, bookingUrl) {
  if (!env.RESEND_API_KEY) {
    console.log(`[EMAIL SKIP] Would send booking link to ${email}: ${bookingUrl}`);
    return;
  }

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Built By Me EZ <noreply@builtbymeez.com>',
      to: email,
      subject: `Your ${pkg.label} booking link is ready`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111;">
          <img src="${env.SITE_URL}/images/Built-By-ME-EZ-Logo-Favicon.avif" alt="Built By Me EZ" width="120" style="margin-bottom:24px;">
          <h1 style="font-size:24px;margin-bottom:8px;">You're all set!</h1>
          <p>Payment confirmed for your <strong>${pkg.label}</strong> package (${pkg.sessions} sessions).</p>
          <p>Use the link below to book your sessions. Each time you book, your session count decrements automatically.</p>
          <a href="${bookingUrl}"
             style="display:inline-block;margin:20px 0;padding:14px 28px;background:#ff4d00;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;">
            Book My Sessions →
          </a>
          <p style="font-size:13px;color:#555;">This link is personal to you. Bookmark it — you'll use it to book all ${pkg.sessions} sessions.</p>
          <p style="font-size:13px;color:#555;">Questions? Call <a href="tel:+12017598043" style="color:#ff4d00;">+1 (201) 759-8043</a> or email <a href="mailto:builtbymeez1@gmail.com" style="color:#ff4d00;">builtbymeez1@gmail.com</a>.</p>
        </div>`,
    }),
  });
}

async function notifyOmar(env, clientEmail, pkg, bookingUrl) {
  if (!env.RESEND_API_KEY) return;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Built By Me EZ <noreply@builtbymeez.com>',
      to: 'builtbymeez1@gmail.com',
      subject: `New package sale: ${pkg.label}`,
      html: `
        <p><strong>New package purchase!</strong></p>
        <p>Client: ${clientEmail}<br>
           Package: ${pkg.label} (${pkg.sessions} sessions)<br>
           Booking link: <a href="${bookingUrl}">${bookingUrl}</a></p>`,
    }),
  });
}

function jsonResponse(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
