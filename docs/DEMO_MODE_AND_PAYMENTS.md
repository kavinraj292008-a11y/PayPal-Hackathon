# Demo mode, roles and simulated payments (Phase 0)

## Roles are NOT authentication
ProofPay currently runs in **DEMO MODE**. The `x-demo-role` request header
(`CLIENT` or `FREELANCER`) is chosen by whoever sends the request. It provides
role *separation for the demo* only:

- The server rejects a missing role (401) and an unknown role (403). It never defaults to CLIENT.
- Each route enforces which role may call it and whether that demo user is the
  client / assigned freelancer of the project (403 otherwise).
- Anyone who can reach the API can still claim either persona. **Never treat
  these roles as production identity.** Real authentication (sessions/JWT/OAuth,
  per-user accounts) is required before any real users or real money.

## Demo reset
`POST /api/v1/demo/reset` wipes and re-seeds all data. It works only when
`NODE_ENV !== "production"` **and** `DEMO_MODE=true` in the server environment
(see `.env.example`). Otherwise it returns 403 `DEMO_RESET_FORBIDDEN`.

## Payments are simulated
PayPal is **not integrated**. All payment records use provider `LOCAL_DEV` with
ids prefixed `LOCAL-DEV-…`. The API marks them `simulated: true` and the UI
shows a SIMULATED badge. "Authorize" and "Approve" create/update only these
local records: no funds are reserved, captured or transferred. (A PayPal
authorization is also not escrow.) `/api/v1/health` reports
`paymentProviderMode: "LOCAL_DEV_SIMULATED"` regardless of PayPal credentials.

## Milestone lifecycle
Defined once in `server/src/domain/milestoneStateMachine.ts`:

```
DRAFT -> AWAITING_PAYMENT_AUTH   (system, when the previous milestone is approved)
AWAITING_PAYMENT_AUTH -> IN_PROGRESS            (client, simulated funding)
IN_PROGRESS | REVISION_REQUESTED -> SUBMITTED   (freelancer, via /submissions only)
SUBMITTED -> AI_REVIEWED                        (advisory AI audit only)
SUBMITTED | AI_REVIEWED -> REVISION_REQUESTED   (client)
SUBMITTED | AI_REVIEWED | PAYMENT_APPROVED -> COMPLETED   (client approval)
```
Invalid transitions return 409; permitted-by-state but wrong actor/route returns 403.
Amount and acceptance criteria are editable only in DRAFT / AWAITING_PAYMENT_AUTH.
The AI audit can never change approval or payment state.

## One-time data fix for existing databases
Databases seeded before Phase 0 contain records mislabelled as PayPal. Either
re-seed (`DEMO_MODE=true`, then use Reset or `npm run prisma:seed`) or run
`npm run db:relabel-simulated` in `server/` to relabel them without deleting history.
(The API already presents such legacy rows as simulated.)

## Phase 1 additions
* Amounts are integer minor units; API money is `{amountMinor, amount}` (see DATABASE_AND_MIGRATIONS.md).
* Simulated payment ids are unique per attempt (`LOCAL-DEV-ORDER-<milestoneId>-<n>`); the database refuses `PAYPAL` rows with
  `LOCAL-DEV-*` ids and `LOCAL_DEV` rows with anything else.
* The AI audit recommendation is computed by the server (see AI_SECURITY_AND_SCORING.md) and never changes approval or payment state.
