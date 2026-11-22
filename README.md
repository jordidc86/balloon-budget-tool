# PashaQuotes

Maintained application for https://pashaquotes.netlify.app. This source replaces the previously unversioned production build. The original deployment is retained for inspection; do not republish its obsolete save API after the managed-write guard is enabled.

## Reference assignment

The database assigns the reference and issue date on the first successful save. References use `YYYY-NNN`, shared across both manufacturers. Existing references are preserved exactly. Historical `202635` reserves sequence 35, alongside the legacy `2026-001` to `2026-030`; the production high-water mark was initialized to 35.

A persistent UUID creation key makes retried first saves idempotent. PostgreSQL locks the creation key and the yearly counter in the same transaction as the inserted quotation. Failed transactions do not consume a number. Updates require the saved UUID and expected revision and cannot alter the reference, issue date or manufacturer. Number reservations remain in the registry even if a record is removed administratively. Revision snapshots preserve saved versions. QA uses a separate schema and `QA-` references.

## Data and validation

The API validates quantities, discounts and manufacturer-specific products, recalculates totals, and returns the stored canonical document. Existing issued fixed prices remain unchanged when a historic quote is edited; new products use the current catalog. The confirmed IV Open Basket price is EUR 8,350 for new quotations. Products without a known price are labeled 'Price on request' and require an agreed price, rather than being silently free.

Pasha frame options are matched to the selected basket's explicit frame type. Kits use IDs and are validated in tests. Pasha's issuer is the Turkish Pasha Balloons Üretimi Anonim Şirketi; provenance is recorded in `data/issuers.json`.

Access requires an approved representative's confirmed Supabase account and password. The API validates the session with Supabase Auth on every request and checks enabled membership. Database wrappers enforce ownership for reads, writes, creation-key retries and version history. Unassigned historical records cannot be claimed by guessing a reference. The owner explicitly assigned the 31 original quotations to jordi@pashaballoons.eu. Browser drafts and local copies use separate namespaces for each verified user. There is no quotation search, global list or commercial-status workflow.

Migration 003 prepares ownership and private RPCs. Migration 004 revokes obsolete RPC and REST table access at production cutover, so old deployments cannot bypass the new owner checks. It also renames the original Prisma archive to `pasha_legacy_archive`, retaining all 30 archive rows while closing old routes that used an owner connection. The backup script recognizes both archive names. Supabase service credentials are server-only; anonymous and authenticated roles cannot call management RPCs or edit the tables directly. Reference immutability remains enforced independently of authentication.

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

Private live tests require two controlled confirmed test identities, provided through `QA_ACCESS_TOKEN`, `QA_OTHER_TOKEN`, `QA_USER_ID` and `QA_OTHER_ID`, or the private local test-account file. Tests cover forged/missing sessions, cross-user reads and updates, creation-key theft, owner-only immutable snapshots and pagination. Controlled test membership is disabled after release testing.

## Accounts and version history

Representatives can use **Create account** at `/register` to choose an email and password, repeat the password and confirm their email. Migration 005 enrolls the confirmed identity automatically, without exposing existing quotations or giving administrative permissions. Reconfirmation never re-enables an account that an administrator blocked. The form supports confirmation resends and keeps provider rate limits intact. Automatic registration is enabled only when both `AUTH_EMAIL_READY=true` and `AUTH_SELF_REGISTRATION=true`; configure and test the production SMTP sender first, leave email confirmation enabled, and set the Supabase Auth Site URL to `https://pashaquotes.netlify.app`. Without the sender, the draft form explains that registration is temporarily unavailable and cannot submit an unusable signup. `scripts/check-registration.py` verifies confirmation, account blocking and ownership transitions inside a transaction that is rolled back, including official counters.

`scripts/accounts.py approved@email.example` enables only that explicitly approved representative. `--activation` creates a one-time password-setup link in a private local file; it does not print a password or send mail. `--assign-unowned` is an explicit administrative operation and must only be used with an owner-approved assignment. Existing ownership is immutable. The owner can receive activation links through the connected Gmail account; adding an email address alone does not configure unattended SMTP. Automatic password-recovery emails are shown only when a working sender is configured and `AUTH_EMAIL_READY=true`. Until then, password recovery requires the administrator to generate and deliver a fresh link to the account owner. Do not enable the email flag without testing delivery. No passwords are emailed.

Open a saved quotation and choose **Version history**. Only that quotation's owner can load its revisions. The dialog shows saved customer details, terms, item quantities, notes, prices and totals, plus differences from the currently loaded saved revision. Older versions are paginated. Viewing history does not write a new version or consume a number.

## External backups

`python scripts/backup.py create` exports a consistent read-only snapshot, quotation versions, permanent reservations, counters, membership and owner identity mapping. It includes recovery migrations and a SHA-256 manifest. Passwords, session tokens, runtime secrets and QA quotation records are excluded. Archives are created outside the public repository with private filesystem permissions. Creation verifies the archive by restoring all saved tables into a separate transactional schema, comparing every row, and rolling back the test. `python scripts/backup.py verify --archive /path/backup.zip` repeats verification. The test never restores over live tables.

Daily copying to the restricted Google Drive folder **PashaQuotes - Copias de seguridad privadas**, owned by jordi@pashaballoons.eu, is configured as a local Codex automation at 04:15 Europe/Berlin. It creates and verifies a new archive, checks destination permissions, uploads through the connected Drive account and verifies the uploaded file. Only failures notify the owner. The automation requires this computer and Codex to be running; it is not a Netlify server-side backup job. Existing recovery points are retained. A full restore to a replacement project must recreate the required schema and user identities, preserve owner UUID mappings and restore counters at least to their saved high-water marks before reopening writes. Never restore an older counter over a later issued reference.

`python scripts/deploy.py qa` creates a draft test deployment. `python scripts/deploy.py production` creates a draft with production database routing; publishing is a separate `python scripts/deploy.py publish` action. Runtime secrets are injected only into the function environment and never written into source, bundles or receipts.

## Browser behavior

Drafts are retained locally when storage is available. Local-storage errors do not reverse a successful database save. Save/print operations share a synchronous lock. The print window opens during the click, before any network wait; unchanged saved quotations can be reprinted without a new save or number. PDFs use the confirmed server document, escaped content, repeated table headings and rows that avoid page breaks. End-of-month validity dates are clamped correctly.

If a concurrent editor has changed a quotation, the second save returns a conflict without overwriting it. A draft with a lost response can be retried without receiving a new number.

## Operational limits

The database remains on its existing free plan. The app detects database unavailability, retains drafts and supports safe retries; it cannot guarantee provider uptime or override the provider's free-plan pausing policy. No paid plan has been activated.

The owner chose the free availability-check option on 2026-11-21. Netlify runs `keep-alive` every six hours (`17 */6 * * *`, UTC). It calls the read-only production health RPC, verifies the schema and production routing, and records success or failure in function logs. It does not create or update quotations, allocate references, send emails or configure external alerts. Scheduled functions run only on published deployments; Netlify can run them manually from the function page. The schedule is defined in `netlify.toml` and is also preserved by the API deploy script. Queries reduce inactivity risk but are not a guarantee against free-plan pausing. If a pause occurs, resume the project in the Supabase dashboard; this check does not automatically resume paused projects.
