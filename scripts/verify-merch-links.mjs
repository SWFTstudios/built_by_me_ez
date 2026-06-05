#!/usr/bin/env node
/** Verify MERCH_PAYMENT_LINKS URLs are active Stripe payment links. */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'js/merch-payment-links.js'), 'utf8');
const match = src.match(/window\.MERCH_PAYMENT_LINKS\s*=\s*(\{[\s\S]*?\});/);
if (!match) {
  console.error('Could not parse MERCH_PAYMENT_LINKS');
  process.exit(1);
}
const links = eval('(' + match[1] + ')');

let ok = 0;
let fail = 0;
for (const [color, sizes] of Object.entries(links)) {
  for (const [size, url] of Object.entries(sizes)) {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    const status = res.ok || res.status === 405 ? 'OK' : 'FAIL';
    if (status === 'OK') ok++;
    else fail++;
    console.log(`${status} ${color}/${size} → ${url} (${res.status})`);
  }
}
console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
