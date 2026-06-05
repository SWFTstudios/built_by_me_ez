#!/usr/bin/env node
/**
 * Deactivate legacy merch Stripe Payment Links (keeps new descriptive links + package links).
 * Run: STRIPE_SECRET_KEY=sk_live_... node scripts/deactivate-old-merch-links.mjs
 */
import Stripe from 'stripe';

const KEEP_PLINK_IDS = new Set([
  // Package training links — do not deactivate
  'plink_1Tf15mEO3guv2SPL6ZLnpP9y',
  'plink_1Tf15mEO3guv2SPLzdEApHbM',
  'plink_1Tf15mEO3guv2SPLBqBWPzyf',
  'plink_1Tf15mEO3guv2SPLTY0eNDEX',
  'plink_1Tf15mEO3guv2SPL0T8rX4q1',
  'plink_1Tf15mEO3guv2SPLOfIDwspL',
  // New descriptive merch links (2026-06-05)
  'plink_1Tf5szEO3guv2SPLHpeVIs3E',
  'plink_1Tf5szEO3guv2SPLfcpnlYVs',
  'plink_1Tf5szEO3guv2SPLlkOodszb',
  'plink_1Tf5szEO3guv2SPLTDwXTRxY',
  'plink_1Tf5t0EO3guv2SPL5N3SFSkT',
  'plink_1Tf5t0EO3guv2SPL0TF11gpB',
  'plink_1Tf5t0EO3guv2SPLvPAuNbil',
  'plink_1Tf5t0EO3guv2SPLnUpdJz8c',
  'plink_1Tf5t0EO3guv2SPLZFthQ5bq',
  'plink_1Tf5t0EO3guv2SPL5AyBgthy',
  'plink_1Tf5t3EO3guv2SPL1N0G67sJ',
  'plink_1Tf5t3EO3guv2SPL2x4jx4QO',
  'plink_1Tf5t3EO3guv2SPLInSKDTdC',
  'plink_1Tf5t3EO3guv2SPLNOtMRlLb',
  'plink_1Tf5t3EO3guv2SPLXbMlyYZp',
]);

const OLD_URL_SUFFIXES = new Set([
  '00w9AT0kJ8858k8a5S04809', 'aFa00jaZncolbwk1zm0480a', 'bJe14n8Rf3RP0RGfqc0480c',
  '28EeVd6J7agd7g4di40480b', '14AaEX7Nb5ZXcAoa5S0480d',
  'eVq28rd7vcol57Wgug0480f', '4gM3cv1oN0FDfMAem80480g', '14A7sLd7v5ZXbwk0vi0480i',
  'eVqeVdgjHewteIw3Hu0480h', '8x2fZh1oNgEB9ocgug0480j',
  '9B66oH1oN1JHbwk2Dq0480l', '28EdR92sRbkh7g41zm0480k', 'bJe5kDaZn741cAo4Ly0480m',
  '3cI9ATgjH2NL1VK91O0480n', '4gM28r3wVgEB43Sgug0480o',
  'eVqcN5ebz3RP6c02Dq04802', '9B600j9VjfAx1VK6TG04800', '6oU3cv1oN741eIwb9W04801',
  'bJebJ13wV0FDcAo7XK0480e',
]);

const SHARED_PRODUCT = 'prod_UeNIfqoPJFKKH2';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('Set STRIPE_SECRET_KEY');
  process.exit(1);
}

const stripe = new Stripe(key);

function urlSuffix(url) {
  return (url || '').split('/').pop() || '';
}

function shouldDeactivate(link, lineItems) {
  if (!link.active || KEEP_PLINK_IDS.has(link.id)) return false;
  if (OLD_URL_SUFFIXES.has(urlSuffix(link.url))) return true;

  const meta = link.metadata || {};
  if (meta.color_slug && meta.product_type === 'merch') return false;

  const usesSharedProduct = lineItems.some((item) => {
    const productId = typeof item.price?.product === 'string'
      ? item.price.product
      : item.price?.product?.id;
    return productId === SHARED_PRODUCT;
  });
  if (usesSharedProduct) return true;

  return meta.product_type === 'merch' && !meta.color_slug;
}

async function main() {
  const deactivated = [];
  let startingAfter;

  for (;;) {
    const page = await stripe.paymentLinks.list({
      limit: 100,
      starting_after: startingAfter,
      expand: ['data.line_items'],
    });

    for (const link of page.data) {
      const lineItems = link.line_items?.data ?? [];
      if (!shouldDeactivate(link, lineItems)) continue;

      await stripe.paymentLinks.update(link.id, { active: false });
      deactivated.push(link.id);
      console.log('Deactivated', link.id, link.url);
    }

    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  console.log('\nDeactivated link IDs:', JSON.stringify(deactivated, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
