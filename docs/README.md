# Built By Me EZ — Documentation

Paginated case study documentation for the [Built By Me EZ](https://builtbymeez.com) website: how it was built, the code techniques behind each feature, and how those features benefit the developer, the business owner, and end customers.

**Start here:** [Chapter 1 — Brand and Vision](01-brand-and-vision.md)

---

## Table of Contents

| # | Chapter | Summary |
|---|---------|---------|
| 1 | [Brand and Vision](01-brand-and-vision.md) | Built By Me EZ brand, owner Omar Ndiaye, market positioning, and the business transformation thesis |
| 2 | [Architecture Overview](02-architecture-overview.md) | Full-stack map: Webflow, Cloudflare Pages, Worker, Stripe, Cal.com, Airtable |
| 3 | [Frontend and Design](03-frontend-and-design.md) | Webflow export, Google Stitch redesign, CSS/JS patterns, cache strategy |
| 4 | [Training Packages and Booking](04-training-packages-and-booking.md) | Pay-first packages, token-gated booking portal, Cal.com session credits |
| 5 | [Merch Ecommerce](05-merch-ecommerce.md) | Unified product page, 15 Stripe Payment Links, webhook fulfillment |
| 6 | [Lead Capture and CRM](06-lead-capture-and-crm.md) | Soft leads, Airtable CRM, client lifecycle stages |
| 7 | [Backend Worker](07-backend-worker.md) | Cloudflare Worker endpoints, KV storage, webhooks, security |
| 8 | [Deployment and Operations](08-deployment-and-operations.md) | Pages deploy, secrets, Stripe/Cal setup, maintenance scripts |
| 9 | [Stakeholder Impact](09-stakeholder-impact.md) | Developer, client, and customer benefits — case study narrative |
| 10 | [Future Roadmap](10-future-roadmap.md) | Known gaps, CMS placeholders, recommended next phases |

---

## Related Documentation

- [Worker Setup Guide](../workers/package-booking/README.md) — operator runbook for secrets, Stripe webhooks, Airtable, and Cal.com
- [Project README](../README.md) — repository hub with architecture diagram and quick start

---

## How to Read This Series

Each chapter is written to stand alone but builds on earlier concepts. Non-technical readers can focus on chapters **1**, **4–6** (feature benefits), and **9**. Developers should read **2–3**, **7–8** for implementation detail.

Navigation: every chapter ends with **Previous | Next** links.
