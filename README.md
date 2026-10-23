# ETechMatter Intelligence
**Real-Time U.S. IT Hardware Buying Signals** — for [ETechMatter](https://etechmatter.com)

Finds U.S. organizations that are actively asking to buy IT hardware, extracts the requirement, scores buying intent (explainably), matches it against the ETechMatter catalog, and puts the opportunity in front of a salesperson with the evidence and the next action.

```
source → fetch → normalize → parse → validate → deduplicate → classify → extract requirements
      → identify buyer → enrich → score intent → match products → store → alert
```

---

## 1. Project structure

```
etechmatter-intelligence/
├─ package.json                 npm workspaces (shared, server, web)
├─ .env.example                 every setting, documented (copy to server/.env)
├─ docker-compose.yml           PostgreSQL 16 for local dev
├─ packages/shared/             ONE engine used by the server AND the browser demo
│  ├─ src/types.ts              Opportunity, Product, SourceInfo, AlertRule … (full data model)
│  ├─ src/constants.ts          28 hardware categories + vocab, brands, 50 states + DC, labels
│  ├─ src/engine/classify.ts    contextual document classifier (RFQ vs plan vs news vs job vs ad vs award)
│  ├─ src/engine/extract.ts     requirement extraction (org, items, qty, brand/model/part #, deadline, budget, contacts, specs, warranty…)
│  ├─ src/engine/scoring.ts     explainable 0–100 intent score + HOT/WARM/LOW/IRRELEVANT gates
│  ├─ src/engine/matching.ts    catalog matching: EXACT / HIGH / ALTERNATIVE / NONE
│  ├─ src/engine/dedupe.ts      hard + soft duplicate detection ("Possible duplicate", never auto-deleted)
│  ├─ src/engine/analyze.ts     builds the evidence-backed Opportunity, value estimate, why-it-matters, next action
│  ├─ src/ai/                   AIProvider interface, heuristic provider, LLM prompt + JSON schema + validation + grounding
│  ├─ src/pipeline/             SourceConnector interface, BaseConnector, runSync() pipeline, alert rules
│  ├─ src/query/                natural-language search, filtering, aggregates/analytics, CSV
│  ├─ src/services/actions.ts   business actions (status, assign, notes, merge, quote…) shared by API & demo
│  ├─ src/store/                Repository interface + MemoryStore
│  ├─ src/seed/                 DEMO catalog, DEMO notices (raw text), Demo Feed connector, seeder
│  └─ test/engine.test.ts       13 tests (spec examples, grounding, matching, NL search, pipeline)
├─ server/                      Node.js + TypeScript REST API, scheduler, connectors
│  ├─ prisma/schema.prisma      PostgreSQL schema (all tables listed in §5)
│  ├─ prisma/seed.ts            npm run db:seed
│  ├─ src/index.ts              HTTP server (+ serves the built web app in production)
│  ├─ src/routes/api.ts         all REST endpoints
│  ├─ src/connectors/           samGov.ts · usaspending.ts · stateProcurement.ts · genericWeb.ts · http.ts (robots.txt, throttling, RSS) · registry.ts
│  ├─ src/ai/providers.ts       AnthropicProvider · OpenAIProvider · guarded fallback to rules engine
│  ├─ src/repo/                 PrismaRepository (SQL filtering/pagination) · factory (memory fallback)
│  ├─ src/services/             SyncService (scheduler + progress) · notifier (in-app, webhook, e-mail)
│  ├─ src/cli/sync.ts           npm run sync — one-shot sync for cron
│  └─ test/                     API integration tests + SAM.gov connector test (recorded-shape response)
└─ web/                         React 19 + TypeScript + Tailwind v4 (Vite)
   ├─ src/api/                  Api interface · httpApi (backend) · standaloneApi (in-browser engine)
   ├─ src/components/           Layout (sidebar/topbar/notifications), SyncDialog, charts, intel cards, UI kit
   ├─ src/pages/                Dashboard, Opportunities (+Hot Leads), OpportunityDetail, Map, Organizations,
   │                            Products, Pipeline, Alerts, Sources, Analytics, Admin (/admin)
   └─ tools/standalone/         zero-dependency single-file demo build (used for the hosted preview)
```

## 2. Files created
~85 source files, ~12,000 lines of TypeScript (tree above). Nothing is a stub except where a source genuinely needs your configuration (see §12).

## 3. Install
Requirements: **Node.js 20.12+** (22 recommended), **Docker** (for PostgreSQL) or any PostgreSQL 14+.

```bash
npm install                      # installs all three workspaces
cp .env.example server/.env      # then edit server/.env
```

## 4. Environment variables~
All documented in `.env.example`. The important ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection. If unset, the API runs on an in-memory store (data lost on restart). |
| `SAM_API_KEY` | SAM.gov public API key. Without it the SAM.gov source shows **"Live SAM.gov connector not configured"**. |
| `SAM_DAILY_REQUEST_LIMIT` | Your key's daily quota. The connector never exceeds it (see §8). |
| `AI_PROVIDER`, `AI_MODEL`, `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Optional LLM. Default `heuristic` needs no key. |
| `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY` | Optional alert e-mail. Webhooks need no key. |
| `WEB_DISCOVERY_URLS`, `STATE_PORTAL_FEEDS` | Public pages/feeds to monitor (also editable in /admin). |
| `APP_BASIC_AUTH` | Optional `user:password` protection for the whole app. |
| `SEED_DEMO_DATA`, `DEMO_FEED_ENABLED` | Demo data on/off. Turn both off in production. |

Keys live only on the server. The browser never receives them; `/api/config` reports "configured / not configured" only.

## 5. Database setup
```bash
npm run db:up                    # docker compose up -d db  (PostgreSQL 16 on :5432)
npm run db:migrate               # prisma migrate dev --name init  (creates tables + client)
npm run db:seed                  # optional: DEMO catalog, users, alert rules, sample notices
```
Tables: `User, Organization, Opportunity, OpportunityProduct, Product, ProductCategory, Source, SourceRun, Contact, OpportunityContact, OpportunityEvidence, OpportunityScore, Alert, AlertEvent, SalesActivity, Note, PipelineStage, AIAnalysis, HistoricalAward, AppSetting`.
Indexes on intent+score, discovered/published/deadline dates, state, source type, status, match level, org type, quantity, demo flag; unique `(sourceKey, sourceId)`.

## 6. Run the frontend
```bash
npm run dev:web                  # http://localhost:5173  (proxies /api → :4000)
```
If the API isn't reachable, the web app automatically switches to **standalone mode**: the same engine runs in the browser on DEMO DATA, and every live source is shown as not configured. Force a mode with `VITE_API_MODE=server|standalone`.

## 7. Run the backend
```bash
npm run dev:api                  # http://localhost:4000  (tsx watch; scheduler starts automatically)
npm run dev                      # both together
# production
npm run build && npm start       # API on :4000 also serves web/dist (open http://localhost:4000)
```

## 8. Connect SAM.gov
1. Sign in at sam.gov → your profile → **Account Details → Public API Key** → request a key.
2. `server/.env`: `SAM_API_KEY=...` and set `SAM_DAILY_REQUEST_LIMIT` to your key's daily quota.
3. Restart the API. **Sources → SAM.gov → Test connection** should say *Connected*.

How it works (`server/src/connectors/samGov.ts`): one call to `GET https://api.sam.gov/opportunities/v2/search` per run with `postedFrom/postedTo` (since last success, max `SAM_POSTED_LOOKBACK_DAYS`), `ptype` = solicitation, combined synopsis, presolicitation, sources sought, special notice, `limit=1000`, paginated up to `SAM_MAX_PAGES_PER_RUN`. Notices are filtered locally to IT-hardware NAICS/PSC codes or hardware vocabulary, then normalized with structured POC, place of performance, deadline and notice type (all **SOURCE VERIFIED**). Award notices are excluded from buying signals.
**Rate limits:** SAM.gov keys have daily request caps, and personal non-federal keys are low. A 15-minute schedule is 96 requests/day, so either raise the interval in /admin (e.g. 144 min for a 10/day key) or rely on the budget guard, which stops at `SAM_DAILY_REQUEST_LIMIT` and resumes after midnight UTC. Check your key's actual quota in your SAM.gov account.

## 9. Trigger the first sync
- In the app: **SYNC NOW** (top bar). The dialog shows the real pipeline stages and ends with "N new opportunities discovered" plus a per-source result (SKIPPED sources say exactly why).
- API: `curl -X POST localhost:4000/api/sync` → `{runId}` → `GET /api/sync/:runId`.
- CLI / system cron: `npm run sync` (all sources) or `npm run sync -- sam_gov`.
- Scheduler: checks every 30 s which sources are due (SAM.gov 15 min, state/local 60 min, web 120 min, USAspending daily — all editable in **/admin → Sources & refresh**). One sync runs at a time.

## 10. Add products
- **Products → Add product** (SKU, manufacturer, model, part #, category, description, specs, price, availability, MOQ, warranty, URL), or
- **Products → Import CSV** (template included; existing SKUs are updated; tick "Replace demo catalog items"), or `POST /api/products/import` with `{ "csv": "..." }`.
- Import automatically re-runs matching for every stored opportunity (`POST /api/opportunities/rematch`).

## 11. How AI intent detection works
1. **Classify context, not keywords** — the document is typed as PROCUREMENT_NOTICE, PLANNED_PURCHASE, AWARD_NOTICE, NEWS_ARTICLE, JOB_POSTING, ADVERTISEMENT or OTHER. "Request for quotation for 250 Dell laptops" → HOT; "plans to refresh laptops next year" → WARM; an article about Dell laptops → IRRELEVANT; an IT-manager job ad → IRRELEVANT unless it also contains an explicit purchase request.
2. **Extract** org, items (qty/brand/model/part #/specs), deadline, budget, delivery, warranty, installation, support, vendor requirements, certifications, contacts. Missing → `null`. Model numbers are masked so "Latitude 5550" is never read as a quantity.
3. **Ground** — with an LLM provider, output must be schema-valid JSON; every quantity, date, budget, name, e-mail and phone must appear verbatim in the source or it is removed, and anything without a verbatim quote is tagged **AI INFERENCE**. Failures fall back to the rules engine.
4. **Score (0–100, explainable)** — weighted, editable signals: explicit RFQ/RFP +25, sources sought +15, exact product +18, category only +8, quantity +14, deadline +10 (+4 if ≤7 days), U.S. +6, contact +10 (org only +4), published ≤7 days +8, budget +5; news −30, job −30, ad −25, award/historical −20, duplicate −20, deadline passed −40, non-U.S. −30, no hardware −100. Gates: news/ads/jobs can never be HOT; plans and sources sought from an identified buyer are WARM; awards are LOW. HOT ≥75, WARM ≥50, LOW ≥25.
5. **Match + prioritize** — overall score = 55% intent + 15% urgency + 30% catalog match. Estimated value = stated budget, else quantity × catalog price (labelled ESTIMATE).
Every opportunity stores evidence snippets (source URL, text, published date, retrieval time); an opportunity cannot be created without them.

## 12. What is live vs mock/demo right now
| Component | Status |
|---|---|
| Dashboard, feed, filters, NL search, detail page, map, pipeline, alerts, analytics, admin, CSV export | **Working** |
| Ingestion pipeline, dedupe, scoring, matching, alert evaluation, scheduler, SourceRun history | **Working** (same code path for scheduled, manual and demo) |
| SAM.gov connector | **Implemented, live once `SAM_API_KEY` is set.** Tested against a recorded-shape response; not yet run against the real API (no key available here). |
| USAspending connector (historical) | **Implemented, public API, no key.** Not reachable from the build sandbox; runs on your machine. Stored separately, never shown as demand. |
| State & local portals | **Adapter framework working** (RSS/JSON with field mapping, robots.txt enforced). *Configuration required*: add each portal's public feed. |
| Public web discovery | **Working for configured public URLs/feeds** (robots.txt, throttling, pre-filter). *Configuration required*: add URLs. No search-engine scraping. |
| AI provider | Rules engine **live by default**; Claude/OpenAI **live when a key + model are set**. |
| E-mail alerts | Resend supported with `EMAIL_API_KEY`; webhooks work with any URL; in-app/browser alerts always on. |
| Opportunities, organizations, contacts, catalog, historical awards you see on first run | **DEMO DATA** — fictional organizations, `*.example` e-mails, 555-01xx phones, placeholder prices. Badged in the UI and marked "DEMO DATA" in CSV. |

**Verification done in the build environment:** 13 engine tests + 10 API/connector tests pass; the server was run and exercised end-to-end over HTTP; the React UI was compiled and exercised in a headless browser against both the real API and standalone mode. **Not executed there** (no package registry access): `prisma migrate` / the PostgreSQL repository and the Vite + Tailwind production build. Run `npm run typecheck`, `npm test`, `npm run db:migrate` and `npm run build` after install; report anything that fails and it can be fixed quickly.

## 13. Exact next steps for production
1. `npm install`, `npm run db:up`, `npm run db:migrate`; set `SEED_DEMO_DATA=false`, `DEMO_FEED_ENABLED=false`.
2. Add `SAM_API_KEY`, set the real `SAM_DAILY_REQUEST_LIMIT`, tune the SAM interval to fit the quota; press **Test connection**.
3. Import the real ETechMatter catalog CSV (replace demo items).
4. Add 10–20 high-value public bid feeds in **/admin → Sources** (state portals, large school districts, universities, public hospitals) — only feeds whose terms and robots.txt allow automated access.
5. Optionally set `AI_PROVIDER=anthropic` (or `openai`) + `AI_MODEL` for better extraction on messy web pages; the grounding layer keeps it honest.
6. Set `APP_BASIC_AUTH` (or put the app behind your SSO/VPN) and `APP_BASE_URL`; configure `EMAIL_PROVIDER=resend` for e-mail alerts.
7. Deploy: one Node process (`npm run build && npm start`) + managed PostgreSQL (e.g. Render, Railway, Fly.io, AWS). Keep one instance running the scheduler (`SCHEDULER_ENABLED=true` on exactly one).
8. After two weeks of live data: review HOT precision, adjust intent weights in **/admin → Intent rules**, and add per-user auth/roles and contact enrichment from licensed providers if needed.

---

### API reference
```
GET  /api/health                    GET  /api/config
GET  /api/dashboard
GET  /api/opportunities?intent=HOT&categories=Servers&states=TX&discovered=today&deadlineWithin=7d&qtyMin=50&match=EXACT,HIGH&sourceTypes=FEDERAL_PROCUREMENT&data=live&sort=score&page=1&pageSize=20
GET  /api/opportunities/stats       GET  /api/opportunities/hot       GET  /api/opportunities/recent
GET  /api/opportunities/export.csv?<same filters>
GET  /api/opportunities/:id
POST /api/opportunities/:id/status          {status: NEW|REVIEWED|CONTACTED|QUOTED|NEGOTIATION|WON|LOST}
POST /api/opportunities/:id/assign          {owner}
POST /api/opportunities/:id/notes           {body}
POST /api/opportunities/:id/pipeline        {nextFollowUp, expectedCloseDate, quoteValue, lastContactedAt}
POST /api/opportunities/:id/save            {saved}
POST /api/opportunities/:id/merge           {duplicateId}
POST /api/opportunities/:id/dismiss-duplicate {duplicateId}
POST /api/opportunities/rematch
POST /api/search                    {query: "hospitals in Texas looking for servers", filters?, page?, pageSize?}
GET  /api/map   GET /api/organizations   GET /api/analytics   GET /api/historical
GET  /api/products   POST /api/products   PUT/DELETE /api/products/:id   POST /api/products/import   GET /api/products/template.csv
GET  /api/categories   POST /api/categories {name}
GET  /api/sources   GET /api/sources/runs   POST /api/sources/test {key}   PUT /api/sources/:key {enabled, intervalMinutes, config}
POST /api/sync {sources?}   GET /api/sync/:runId   GET /api/sync/status
GET  /api/alerts   POST /api/alerts   PUT/DELETE /api/alerts/:id   GET /api/alerts/events   POST /api/alerts/events/read
GET  /api/settings   PUT /api/settings   GET /api/users   POST /api/users
```

### Adding a new source
Implement `SourceConnector` (extend `BaseConnector`: `fetch`, `normalize`; `parse`/`validate`/`deduplicate` have defaults), add it to `server/src/connectors/registry.ts`. The pipeline, scheduler, Sources page and admin pick it up automatically.

### Compliance guardrails built in
Official APIs first; robots.txt checked before every web fetch; identifying user-agent; per-host throttling; 401/403/429 reported, never bypassed; no logins, CAPTCHAs, paywalls, private groups or profiles; contacts only when published in the source; nothing invented — missing values stay `null`.
