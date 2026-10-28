# THE STANDARD Economic Forum 2026 — Onsite Guide (2 sites, 1 codebase)

Mobile-first onsite guide for 4–6 Nov 2026, พารากอน ฮอลล์ ชั้น 5 สยามพารากอน.
One codebase builds two separate static sites:

| Site | Contents | Data |
|---|---|---|
| **attendee** | Agenda (day/stage filter, live status, bottom-sheet detail), speakers, FAQ, survey tab/CTA, inline 16:5 promo slot | Sheet B publish CSVs |
| **staff** | Same agenda + FAQ, 🔒 staff area (staff FAQ + public FAQ for answering attendees), STAFF ONLY bar, no promo/survey | Sheet B + Sheet C publish CSVs |

Staff code/data never enters the attendee build: the template's `<!-- @if staff -->` blocks are removed,
`src/js/audience/staff.js` is not copied, and `STAFF_FAQ_CSV_URL` is not read for attendee. `npm run check` enforces this.

Status: **functional MVP, local only** — not pushed, not deployed. Styling is **visual v2** (black/white + red/blue CI, approved by Bo)
(see "Design tokens"). Chatbot is out of scope for phase 1 (no chat button).

## Quick start

```bash
npm ci
npm test                    # unit tests (node --test)
npm run build:all           # dist/attendee + dist/staff from env (empty env -> "not connected" state)
npm run check               # leak gates: attendee has no staff markers/URLs; no template residue; no credentials
npm run build:fixtures      # same, with labelled sample data ("ข้อมูลตัวอย่าง — ไม่ใช่กำหนดการจริง")
npm run serve -- --dir dist/attendee --port 4173   # open http://localhost:4173/
npm run test:e2e            # Playwright, mobile viewports (Pixel 7 + iPhone 13 viewport)
```

E2E needs a Chromium for Playwright 1.56 (`npx playwright install chromium-headless-shell`).
On the Hermes build host browsers live in a custom dir:
`PLAYWRIGHT_BROWSERS_PATH=/opt/data/profiles/webdev/cache/ms-playwright npm run test:e2e`.
WebKit was not installable there, so the "iphone" project runs the iPhone viewport on Chromium —
**real iOS Safari must be checked on a device (QA).**

## Data model (Google Sheets)

| File | Tabs | Publish to web |
|---|---|---|
| A — DRAFT (private, Bo) | review only | **never** |
| B — PUBLIC | `Schedule` (edit), `Publish_Schedule`, `FAQ_Public`, `Publish_FAQ_Public` | only the two `Publish_*` tabs, CSV |
| C — STAFF | `FAQ_Staff`, `Publish_FAQ_Staff` | only `Publish_FAQ_Staff`, CSV |

`Publish_*` = `FILTER(...)` of rows with `publication_status = APPROVED` and `hold_flag <> HOLD`.
The site filters again on every render **including cached data**, so a row that loses approval disappears.

Schedule columns (required): `session_id, stage, date (YYYY-MM-DD), start, end (HH:MM), topic_main, publication_status, hold_flag`;
optional: `topic_sub, speakers, moderators` (one person per line, `ชื่อ — ตำแหน่ง`), `onsite_status`
(`ปกติ|เลื่อนเวลา|เปลี่ยนเวที|ยกเลิก|เพิ่มใหม่`), `onsite_note`, `stream_url` (https only).
FAQ columns: `faq_id, audience (public|staff), category, question, answer, publication_status, hold_flag[, sort_order]`.
Rows with bad dates, end ≤ start, unknown stage, empty answer etc. are dropped (never shown on the wrong day).

Today all 47 draft rows are REVIEW, so the correct public result is the **"Agenda กำลังรอการยืนยันจากทีมงาน"** empty state.

### Editing on event day (no deploy needed)
Edit Sheet B `Schedule` → change `onsite_status` / `onsite_note` → users get it on the next refresh
(auto every 5 min + jitter while the tab is visible, or the รีเฟรช button). Google's publish cache adds delay — measure before the event (plan T13).

### Behaviour when things break
- Network down / Google error / renamed column → keep last good cache, warning banner
  "เชื่อมต่อข้อมูลล่าสุดไม่ได้ — แสดงข้อมูลเมื่อ HH:MM น."; never overwrite cache with a bad response.
- No cache and no network → error state with "ลองใหม่". Empty data URL → "ยังไม่ได้เชื่อมข้อมูล" (no mock fallback).
- All times use **Asia/Bangkok** regardless of the phone's timezone.
- No service worker in phase 1: a full page reload with no network and no browser HTTP cache will not load.

## Env (per Netlify site)

See `.env.example`. Summary:

| Env | attendee | staff |
|---|---|---|
| `AUDIENCE` | `attendee` | `staff` |
| `SCHEDULE_CSV_URL`, `PUBLIC_FAQ_CSV_URL` | ✓ | ✓ (same values) |
| `STAFF_FAQ_CSV_URL` | **never** | ✓ (different spreadsheet — build refuses a shared pub key) |
| `SURVEY_URL` or `SURVEY_DISABLED=1` | when approved | — |
| `PROMO_IMAGE`/`PROMO_HREF`/`PROMO_ALT` or `PROMO_DISABLED=1` | when approved | — |
| `GA4_ID` | empty until Bo decides | empty |
| `RELEASE=1` | production context only | production context only |

URLs must look like `https://docs.google.com/spreadsheets/d/e/<key>/pub?...` or the build fails.
Do **not** write the staff site URL or any real CSV URL into this repo.

## Deploy: two Netlify sites (after Bo approves — nothing deployed yet)

1. Push this repo to `HithereitsBori/ECONOMIC2026` (`main`).
2. Netlify → Add new site → Import from GitHub → `ECONOMIC2026` → build settings come from `netlify.toml`
   (`npm run build:netlify`, publish `dist`). Name e.g. `ef2026-guide-preview` (Bo approves final name).
   Site env: `AUDIENCE=attendee`, `SCHEDULE_CSV_URL`, `PUBLIC_FAQ_CSV_URL` (+ survey/promo when ready).
3. Repeat → second site from the **same repo/branch**, name `ef2026-staff-<random>`; env `AUDIENCE=staff`,
   same public URLs + `STAFF_FAQ_CSV_URL`.
4. Add `RELEASE=1` to the **Production** context only. Deploy previews/branch deploys build with labelled sample data (`FIXTURES=1` in `netlify.toml`).
5. Preview without Git (CLI, draft URL only, no `--prod`):
   ```bash
   AUDIENCE=attendee FIXTURES=1 npm run build:netlify && netlify deploy --dir dist --site <attendee-site-id>
   AUDIENCE=staff FIXTURES=1 npm run build:netlify && netlify deploy --dir dist --site <staff-site-id>
   ```
6. Both sites send `X-Robots-Tag: noindex` and a strict CSP via `dist/_headers`.

## Design tokens (visual v2)

Source: UX task t_a5ae4006 (`tokens.css` + `mockup.html`), approved by Bo. Tokens live in the
`:root` / `body.aud-staff` blocks at the top of `src/styles.css`; components use `var(--…)` only.
- Attendee accent = red `--red-action #E10600`; staff accent = blue `--blue #2B5BFF` + navy STAFF ONLY bar.
  Never put small text on `--red #FF0000` (4.0:1) — it is only for large glow/graphic use.
- Radius 0–4px only, no pill, no decorative icons/emoji, no gradient in UI (light/streaks only in the hero `.mast`).
- No yellow anywhere: the TH/EN toggle from the mockup is **not** shipped (Thai-only until EN copy is reviewed).
- Compact hero (~150px) so Day tabs + first session are above the fold on 360–390px phones.
  e2e `layout.spec.mjs` guards this plus "no yellow background / no radius > 4px".
- Fonts: Archivo / Prompt / IBM Plex Sans Thai (Google Fonts, OFL) stand in for the brand fonts (rights unknown).
- Logo/KV: the header wordmark and hero lockup are CSS text placeholders. To use approved files, put them in
  `src/assets/` and replace `.wm` (header) / `.mast` background (hero) in `src/index.html` + `src/styles.css`.

## Content rules
- No invented venue facts (restrooms, parking stamp, water, registration) — placeholders say "รอข้อมูลยืนยัน". A unit test and `npm run check` scan for these words in `src/`.
- No passwords, personal phone numbers, VIP lists or security details in Sheet C — the staff link has no login.
- Fixtures (`tests/fixtures/`) are sample data; every value starts with `[ตัวอย่าง]`.

## Repo layout
`config/event.json` (dates, venue, stages, statuses) · `src/` (template, CSS, app, libs, audience modules) ·
`scripts/` (build, check-dist, denylist, serve) · `tests/unit`, `tests/e2e`, `tests/fixtures` ·
`tools/*.cjs` (image helpers, need `npm i sharp`).

Derived from an earlier event digital guide-book template (commit e214570): structure ideas and the image tools only;
no images, CSV URLs, analytics IDs, forms, mock data or git history were carried over.
