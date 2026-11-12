# Money representation, database integrity and migrations (Phase 1)

## Money = integer minor units
All money is stored and calculated as **integer minor units** (cents, paise; yen for JPY):
`Project.totalBudgetMinor`, `Milestone.amountMinor`, `PaymentRecord.amountMinor`.
Floating point is never used for monetary arithmetic; sums are integer sums.

* Whitelisted currencies (`USD EUR GBP CAD AUD SGD INR JPY`) with per-currency exponent (JPY has 0 decimals). Source of truth:
  `shared/src/money.ts`; mirrored by a CHECK constraint in SQL (a test keeps them in sync).
* Input: decimal string or number. Strictly parsed: no exponent notation, signs or separators, no more decimals than the
  currency allows (so `0.1+0.2 = 0.30000000000000004` is **rejected**, not rounded), amount > 0, ≤ 10,000,000.00.
* Output: every money value is `{ amountMinor: <int>, amount: "<exact decimal string>" }` (projects: `totalBudgetMinor` / `totalBudget`).
  `minorToDecimalString(minor, currency)` produces the exact PayPal `amount.value` format (`"1500.00"`, JPY `"1500"`).
* Milestone amounts must sum **exactly** to the project budget (validated on the server on creation and on every amount edit).
* AI budget splits use the largest-remainder method on integer minor units, so parts always sum exactly to the total.

## Schema changes
Restrict (not Cascade) deletes for milestones, submissions, reviews and **payment records**; unique payment ids
(`orderId`, `authorizationId`, `captureId`); `(milestoneId, revision)` and `(submissionId, sequence)` unique; `(projectId, orderIndex)` unique;
indexes on frequently filtered columns; CHECK constraints for roles, statuses, providers, currencies, positive amounts and
`LOCAL-DEV-*` ids ⇔ provider `LOCAL_DEV`. New: `Project.deadline`. `AIReview.confidenceScore` → `legacyConfidenceScore`
(+ `evidenceCoveragePercent`, `scoringPolicyVersion`, `recommendationReasons`, `modelOverallScore`, `modelRecommendation`).
Old float columns are **kept** as `legacyTotalBudget` / `legacyAmount` (never read by the app) for audit and rollback.

Prisma 5.22 on SQLite has no enums, so strict values are enforced by CHECK constraints **and** by the shared Zod schemas.
Caveat: if a future `prisma migrate dev` redefines a table, SQLite CHECK constraints are not preserved by Prisma's generated SQL;
re-add them in that migration (or move to a database/Prisma version with enums).

## Applying the migrations — READ FIRST
**Back up your database file first** (copy `server/prisma/dev.db`). The migration never deletes business data and is
all-or-nothing (the old tables are dropped only after every copy succeeded), but a backup is cheap insurance.

Your database was created with `prisma db push`, so first **baseline** it, then deploy:
```
cd server
npx prisma migrate resolve --applied 0_init        # tell Prisma the current DB already matches the baseline
npx prisma migrate deploy                          # applies 1_phase1_integrity
npx prisma generate
npx prisma migrate status                          # should report "Database schema is up to date"
```
A brand-new database: `npx prisma migrate deploy` then `npm run prisma:seed`.

What the Phase 1 migration does to existing rows: floats → integer minor units (legacy value kept); legacy "PayPal" demo payments
(`DEMO-PP-*`/`TEST-PP-*`) → `LOCAL_DEV` / `LOCAL-DEV-*`; submissions get `revision` 1..n per milestone; reviews get
`sequence` 1..n per submission and upper-case recommendations (model claims preserved).

If the migration aborts (e.g. an amount with sub-cent precision such as `10.005`, an unsupported currency such as `XYZ`, or two
milestones with the same order index), **the original tables are untouched**. Fix that row and re-run `migrate deploy`.
(If Prisma reports the migration as failed: `npx prisma migrate resolve --rolled-back 1_phase1_integrity`, fix, deploy again.)

## Verifying drift
`prisma migrate diff` needs Prisma's schema engine. The repo's `migration.test.ts` additionally verifies, with a real SQLite engine,
that the migrated database has exactly the columns/unique constraints/indexes declared in `schema.prisma`. Still run once locally:
```
npx prisma validate && npx prisma migrate status
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "file:./shadow.db" --exit-code
```
(exit code 0 = no drift).
