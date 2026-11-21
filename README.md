# PashaQuotes

Maintained application for https://pashaquotes.netlify.app. This source replaces the previously unversioned production build. The original deployment is retained for inspection; do not republish its obsolete save API after the managed-write guard is enabled.

## Reference assignment

The database assigns the reference and issue date on the first successful save. References use `YYYY-NNN`, shared across both manufacturers. Existing references are preserved exactly. Historical `202635` reserves sequence 35, alongside the legacy `2026-001` to `2026-030`; the production high-water mark was initialized to 35.

A persistent UUID creation key makes retried first saves idempotent. PostgreSQL locks the creation key and the yearly counter in the same transaction as the inserted quotation. Failed transactions do not consume a number. Updates require the saved UUID and expected revision and cannot alter the reference, issue date or manufacturer. Number reservations remain in the registry even if a record is removed administratively. Revision snapshots preserve saved versions. QA uses a separate schema and `QA-` references.

## Data and validation

The API validates quantities, discounts and manufacturer-specific products, recalculates totals, and returns the stored canonical document. Existing issued fixed prices remain unchanged when a historic quote is edited; new products use the current catalog. The confirmed IV Open Basket price is EUR 8,350 for new quotations. Products without a known price are labeled 'Price on request' and require an agreed price, rather than being silently free.

Pasha frame options are matched to the selected basket's explicit frame type. Kits use IDs and are validated in tests. Pasha's issuer is the Turkish Pasha Balloons Üretimi Anonim Şirketi; provenance is recorded in `data/issuers.json`.

Access intentionally remains open at the owner's request. There is no per-representative authentication or isolation. Reference immutability is enforced independently of browser controls. Supabase service credentials are server-only; anonymous roles cannot invoke the management RPCs or edit the tables directly.

## Build and tests

Use Node.js 22 or later:

```sh
npm ci
npm test
npm run build
```

`dist` contains the static application. Netlify functions live in `netlify/functions`. The build script also bundles standalone functions for the API deploy workflow. The committed lockfile pins dependencies.

For database administration install `psycopg[binary]` from `scripts/requirements.txt`. Supply `DATABASE_URL`, or use the existing authenticated Netlify CLI configuration. Credentials are kept in memory. `scripts/database.py` backs up both historical tables privately, installs the additive schema and imports historical records. Do not reimport from obsolete data sources after cutover. The second migration enables the mandatory managed-save guard and must be applied at release.

`QUOTATION_MODE=qa` uses the isolated `quote_qa` schema. `scripts/run-qa.py` runs live persistence, retry, conflict and concurrency tests and verifies that official counters remain unchanged. It never sends invitations or emails. Test records are isolated from business records.

`python scripts/deploy.py qa` creates a draft test deployment. `python scripts/deploy.py production` creates a draft with production database routing; publishing is a separate `python scripts/deploy.py publish` action. Runtime secrets are injected only into the function environment and never written into source, bundles or receipts.

## Browser behavior

Drafts are retained locally when storage is available. Local-storage errors do not reverse a successful database save. Save/print operations share a synchronous lock. The print window opens during the click, before any network wait; unchanged saved quotations can be reprinted without a new save or number. PDFs use the confirmed server document, escaped content, repeated table headings and rows that avoid page breaks. End-of-month validity dates are clamped correctly.

If a concurrent editor has changed a quotation, the second save returns a conflict without overwriting it. A draft with a lost response can be retried without receiving a new number.

## Operational limits

The database remains on its existing free plan. The app detects database unavailability, retains drafts and supports safe retries; it cannot guarantee provider uptime or override the provider's free-plan pausing policy. No paid plan has been activated.

The owner chose the free availability-check option on 2026-11-21. Netlify runs `keep-alive` every six hours (`17 */6 * * *`, UTC). It calls the read-only production health RPC, verifies the schema and production routing, and records success or failure in function logs. It does not create or update quotations, allocate references, send emails or configure external alerts. Scheduled functions run only on published deployments; Netlify can run them manually from the function page. The schedule is defined in `netlify.toml` and is also preserved by the API deploy script. Queries reduce inactivity risk but are not a guarantee against free-plan pausing. If a pause occurs, resume the project in the Supabase dashboard; this check does not automatically resume paused projects.
