# Chapter 10 — Future Roadmap

This chapter documents known gaps, planned improvements, and recommendations for the next phases of Built By Me EZ's digital platform.

---

## Current State Summary

The platform delivers:

- Six multi-session training packages with pay-first booking
- Two drop-in session pages with Cal.com embeds
- Unified merch storefront (3 colorways × 5 sizes)
- Lead capture with date picker on package pages
- Airtable CRM sync across five tables
- Automated email notifications

The following areas remain incomplete or could be enhanced.

---

## Known Gaps

### CMS content placeholders

Webflow CMS templates exist but are not populated:

| Template | File | Status |
|----------|------|--------|
| Trainer profiles | `detail_trainers.html` | Empty shell |
| Blog posts | `detail_post.html` | Empty shell |
| Categories | `detail_category.html` | Empty shell |

Homepage sections reference trainers and blog content with `w-dyn-empty` placeholders and lorem ipsum copy. Nav links for Trainers and Gallery are hidden.

**Recommendation:** Populate CMS in Webflow and re-export, or replace with static content pages.

### Homepage placeholder links

Several CTAs still point to `#`:

- Mission section "Join Now"
- Programs "view all"
- Some footer links

**Recommendation:** Link to package pages, consultation form, or remove until content exists.

### Missing `builtbymeez.js` in repository

The Webflow interactions bundle is referenced on every page but may not be in git. Local development and fresh clones won't have working sliders/nav without re-exporting from Webflow.

**Recommendation:** Include `js/builtbymeez.js` in repo or document CDN fallback.

### Dual merch checkout paths

Two implementations exist:

| Path | Status |
|------|--------|
| Payment Links (frontend redirect) | **Production primary** |
| Checkout Sessions API (`/create-merch-checkout`) | Fallback; requires valid `STRIPE_SECRET_KEY` |

**Recommendation:** Document Payment Links as canonical; deprecate or remove Worker API path if unused.

### Worker secret key

`STRIPE_SECRET_KEY` on the Worker may be invalid or placeholder. This does not affect Payment Link checkout but breaks the API fallback and maintenance scripts if not corrected.

**Recommendation:** Re-set secret from Stripe Dashboard if API-based checkout or scripts are needed.

---

## Recommended Next Phases

### Phase 1 — Content and polish (1–2 weeks)

- [ ] Populate trainer bios and photos
- [ ] Replace lorem ipsum mission/programs copy
- [ ] Fix placeholder `#` links
- [ ] Add `builtbymeez.js` to repository
- [ ] GA4 conversion events (package pay click, merch checkout, lead submit)

### Phase 2 — Conversion optimization (2–4 weeks)

- [ ] A/B test package page CTA copy
- [ ] Add testimonials to package pages
- [ ] SMS notification option for order confirmations (Twilio)
- [ ] Abandoned lead follow-up automation (Airtable automations)

### Phase 3 — Expanded commerce (1–2 months)

- [ ] Additional merch products (hoodies, hats)
- [ ] Inventory tracking per size/color
- [ ] Discount codes via Stripe Promotion Codes
- [ ] Gift cards or package gifting flow

### Phase 4 — Member experience (2–3 months)

- [ ] Client login portal (view remaining sessions, booking history)
- [ ] Progress tracking integration
- [ ] Referral program with unique links
- [ ] Email drip sequence for leads (ConvertKit, Mailchimp, or Airtable automations)

### Phase 5 — Operations scale (ongoing)

- [ ] Multi-trainer support (if Omar expands team)
- [ ] Automated session reminders via Cal.com
- [ ] Revenue dashboard (Stripe + Airtable sync to charting tool)
- [ ] Mobile app wrapper (PWA or native shell)

---

## Technical Debt

| Item | Priority | Effort |
|------|----------|--------|
| Consolidate merch checkout to Payment Links only | Medium | Low |
| Split Worker into modules if file grows | Low | Medium |
| Add automated tests for webhook handlers | Medium | Medium |
| CI pipeline: `verify-merch-links.mjs` on deploy | Low | Low |
| TypeScript migration for Worker | Low | High |
| Consolidate two design systems (Webflow + IRON_CORE) | Low | High |

---

## Case Study Publication Checklist

When preparing the Built By Me EZ case study for portfolio or marketing:

### Assets to collect

- [ ] Before/after screenshots of key pages
- [ ] Architecture diagram (from Chapter 2)
- [ ] Omar testimonial quote
- [ ] Customer testimonial (if permitted)
- [ ] Stripe Dashboard revenue screenshot (anonymized if needed)
- [ ] Airtable dashboard screenshot
- [ ] Mobile responsive screenshots

### Metrics to gather (90 days post-launch)

- [ ] Total package sales count and revenue
- [ ] Merch orders by colorway
- [ ] Lead submissions vs conversions
- [ ] Average sessions booked per package
- [ ] Estimated admin hours saved (Omar self-report)

### Story angles

1. **Solo trainer scaling** — technology replacing manual admin
2. **Design-to-code pipeline** — Webflow + Stitch + custom JS
3. **Serverless architecture** — Cloudflare stack for small business
4. **CRM without custom admin** — Airtable as operations hub
5. **Ecommerce without Shopify** — Stripe Payment Links for variant matrix

---

## Architecture Evolution Options

If the business outgrows the current stack:

| Trigger | Consider |
|---------|----------|
| >100 merch SKUs | Shopify or Snipcart integration |
| Complex membership tiers | Stripe Billing subscriptions |
| Multi-location | Separate Cal.com teams per location |
| High webhook volume | Queue-based processing (Cloudflare Queues) |
| Custom mobile app | Headless API layer on Worker |

The current architecture is intentionally simple. Migrate components only when clear pain points emerge.

---

## Documentation Maintenance

Keep this documentation current when:

- Adding new package types or prices
- Changing Stripe Payment Link URLs
- Modifying Airtable table schemas
- Adding new Worker endpoints
- Changing Cal.com event slugs

Update the relevant chapter and increment cache-bust versions on affected JS files.

---

## Closing

Built By Me EZ demonstrates that a solo fitness business can operate with infrastructure previously available only to larger organizations—without enterprise cost or complexity. The platform is live, documented, and ready to evolve with Omar's business.

**Live site:** [builtbymeez.com](https://builtbymeez.com)  
**Documentation index:** [docs/README.md](README.md)  
**Operator guide:** [Worker Setup Guide](../workers/package-booking/README.md)

---

[← Chapter 9 — Stakeholder Impact](09-stakeholder-impact.md) | [Documentation Index →](README.md)
