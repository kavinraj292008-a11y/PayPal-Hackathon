# ProofPay ⚡

**AI-Assisted Milestone Payment Coordination Platform for Freelancers & Clients**

ProofPay coordinates freelance project milestones by decomposing project briefs into verifiable acceptance criteria, assessing submitted deliverable evidence using Google Gemini AI, and managing milestone payment commitments on PayPal rails using the **PayPal Orders API v2** (`intent: AUTHORIZE` $\rightarrow$ Human Client Sign-off $\rightarrow$ `CAPTURE`).

---

## 🛡️ Regulatory & Architectural Principles

1. **Non-Custodial Coordination**: ProofPay is **not** a bank, money transmitter, or custodial escrow agent. ProofPay does not custody user funds. All milestone funds remain held directly on PayPal rails under PayPal's authorization framework until captured.
2. **Independent Milestone Workflows**: Each milestone has its own independent PayPal order lifecycle: created, authorized, tracked for expiration, and captured upon human sign-off.
3. **Strict Human-in-the-Loop AI Governance**: AI evaluation (powered server-side by Google Gemini) is strictly evidentiary and advisory. The AI audits accessible deliverables against agreed criteria, highlights gaps, and assesses confidence. **The AI is technologically barred from authorizing or capturing payments.**
4. **Authenticity Guarantee**: ProofPay never fakes PayPal transaction IDs or simulates payments as genuine PayPal orders.

---

## 🏗️ Architecture & Technology Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons.
- **Backend**: Node.js, Express, TypeScript, Prisma ORM.
- **Database**: SQLite (local embedded storage for zero-config hackathon execution).
- **AI Engine**: Google Gemini API via official SDK with structured JSON schema outputs.
- **Payments**: PayPal REST API v2 (`Orders API v2` with `AUTHORIZE` and `CAPTURE` workflow).
- **Workspace**: Monorepo with typed `@proofpay/shared` contracts.

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- Node.js (v18 or newer; v20+ recommended)
- npm (v9+)

### 2. Installation
Install all monorepo dependencies across `shared`, `server`, and `client`:

```bash
npm install
```

### 3. Initialize Database & Seed Demo Data
Push the Prisma schema to SQLite and populate demo users and project records:

```bash
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
```

### 4. Run Development Servers
Start both the backend API (port 5000) and frontend client (port 5173):

```bash
npm run dev
```

Open your browser at `http://localhost:5173`.

---

## 🧪 Testing & Verification

Run server tests:
```bash
npm run test
```

Run full monorepo production build:
```bash
npm run build
```

---

## 👥 Demo Mode Personas

ProofPay features an instant demo switcher with seeded data:
- **Client**: `Elena Vance` (`elena.vance@demo.proofpay.io`) — VP of Product at Horizon FinTech.
- **Freelancer**: `Marcus Chen` (`marcus.chen@demo.proofpay.io`) — Senior Systems Architect.

---

## 📄 License
MIT License. See [LICENSE](./LICENSE) for details.

## Demo mode & simulated payments
Roles are demo-only (not authentication) and PayPal is not yet integrated; all
payment records are SIMULATED. See [docs/DEMO_MODE_AND_PAYMENTS.md](docs/DEMO_MODE_AND_PAYMENTS.md).

See also: [docs/AI_SECURITY_AND_SCORING.md](docs/AI_SECURITY_AND_SCORING.md) and
[docs/DATABASE_AND_MIGRATIONS.md](docs/DATABASE_AND_MIGRATIONS.md) (Phase 1: money precision, AI hardening, migrations).
