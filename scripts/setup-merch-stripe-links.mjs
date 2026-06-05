#!/usr/bin/env node
/**
 * Creates 15 descriptively named Stripe products + payment links for merch.
 * Run: STRIPE_SECRET_KEY=sk_live_... node scripts/setup-merch-stripe-links.mjs
 *
 * Output: JSON map for js/merch-payment-links.js
 */
import Stripe from 'stripe';

const COLORS = [
  { slug: 'black', label: 'Black' },
  { slug: 'brown', label: 'Brown' },
  { slug: 'blue', label: 'Blue' },
];
const SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const AMOUNT = 3500;
const SITE_URL = 'https://builtbymeez.com';
const SHIPPING_COUNTRIES = [
  'US', 'CA', 'GB', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'CH', 'SE', 'NO', 'DK',
  'IE', 'PT', 'AT', 'FI', 'PL', 'CZ', 'MX', 'BR', 'JP', 'NZ', 'SG', 'HK', 'IN',
];

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('Set STRIPE_SECRET_KEY');
  process.exit(1);
}

const stripe = new Stripe(key);

async function deactivateOldMerchLinks() {
  const oldSlugs = new Set(['logo-tshirt']);
  let startingAfter;
  let deactivated = 0;

  for (;;) {
    const page = await stripe.paymentLinks.list({ limit: 100, starting_after: startingAfter });
    for (const link of page.data) {
      const meta = link.metadata || {};
      const isMerch = meta.product_type === 'merch'
        || /^logo-tshirt-/.test(meta.merch_slug || '')
        || (link.line_items?.data?.some?.((item) => {
          const productId = typeof item.price?.product === 'string'
            ? item.price.product
            : item.price?.product?.id;
          return productId === 'prod_UeNIfqoPJFKKH2';
        }) ?? false);

      if (link.active && isMerch) {
        await stripe.paymentLinks.update(link.id, { active: false });
        deactivated += 1;
        console.log('Deactivated', link.id, link.url);
      }
    }
    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  // Deactivate links with empty metadata that match known old buy.stripe URLs pattern
  // (handled above via product id check on expanded list)
  console.log('Deactivated links:', deactivated);
}

async function createVariant(color, size) {
  const name = `Built By Me EZ Logo T-Shirt — ${color.label} / ${size}`;
  const merchSlug = `logo-tshirt-${color.slug}-${size.toLowerCase()}`;

  const product = await stripe.products.create({
    name,
    description: `${color.label} colorway, size ${size}. Official Built By Me EZ merch.`,
    metadata: {
      product_type: 'merch',
      color: color.label,
      size,
      color_slug: color.slug,
      merch_slug: merchSlug,
    },
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: AMOUNT,
    currency: 'usd',
    nickname: `${color.label} ${size}`,
    metadata: {
      color: color.label,
      size,
      color_slug: color.slug,
      merch_slug: merchSlug,
    },
  });

  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: {
      product_type: 'merch',
      color: color.label,
      size,
      color_slug: color.slug,
      merch_slug: merchSlug,
      link_title: name,
    },
    payment_intent_data: {
      description: name,
      metadata: {
        product_type: 'merch',
        color: color.label,
        size,
        merch_slug: merchSlug,
      },
    },
    shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES },
    after_completion: {
      type: 'redirect',
      redirect: { url: `${SITE_URL}/products/order-confirmation.html` },
    },
  });

  return { color: color.slug, size, url: paymentLink.url, productId: product.id, linkId: paymentLink.id };
}

async function main() {
  const map = { black: {}, brown: {}, blue: {} };
  const created = [];

  for (const color of COLORS) {
    for (const size of SIZES) {
      const result = await createVariant(color, size);
      map[color.slug][size] = result.url;
      created.push(result);
      console.log('Created', result.linkId, '→', result.url);
    }
  }

  console.log('\n--- Deactivating old merch payment links ---');
  await deactivateOldMerchLinks();

  console.log('\n--- Paste into js/merch-payment-links.js ---\n');
  console.log(JSON.stringify(map, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
