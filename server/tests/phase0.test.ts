/**
 * Phase 0 security & integrity tests (hermetic: in-memory Prisma stand-in,
 * mocked Gemini, no network, no PayPal, no database file).
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createFakePrisma } from './helpers/fakePrisma';

const fake = createFakePrisma();
let app: any;
let aiDeps: any;
let auditCalls = 0;

const CLIENT = 'CLIENT';
const FREELANCER = 'FREELANCER';
const api = (role?: string) => {
  const h: Record<string, string> = {};
  if (role !== undefined) h['x-demo-role'] = role;
  return {
    get: (u: string) => request(app).get(`/api/v1${u}`).set(h),
    post: (u: string) => request(app).post(`/api/v1${u}`).set(h),
    patch: (u: string) => request(app).patch(`/api/v1${u}`).set(h),
  };
};

const goodAudit = {
  model: 'test-model',
  auditedAt: new Date().toISOString(),
  rawResponse: '{}',
  attempts: 1,
  summary: 'ok',
  verdicts: [
    { criterionId: 'criterion-1', status: 'SATISFIED', reasoning: 'fine', evidenceReference: 'x' },
    { criterionId: 'criterion-2', status: 'SATISFIED', reasoning: 'fine', evidenceReference: 'y' },
  ],
  missingRequirements: [],
  risks: [],
  evidenceLimitations: [],
  injectionSuspected: false,
  modelClaims: { overallScore: 90, recommendation: 'approve_recommended' },
};

async function seedBase() {
  await fake.client.user.create({ data: { id: 'demo-client-elena', email: 'e@x', name: 'Elena Vance', role: 'CLIENT', isDemoAccount: true } });
  await fake.client.user.create({ data: { id: 'demo-freelancer-marcus', email: 'm@x', name: 'Marcus Chen', role: 'FREELANCER', isDemoAccount: true } });
}

async function mkProject(clientId = 'demo-client-elena', freelancerId: string | null = 'demo-freelancer-marcus') {
  return fake.client.project.create({
    data: { title: 'P', description: 'D', totalBudgetMinor: 500000, status: 'ACTIVE', clientId, freelancerId },
  });
}

async function mkMilestone(
  projectId: string,
  status: string,
  extra: Record<string, any> = {}
) {
  const used = fake.all('milestone').filter((m) => m.projectId === projectId).map((m) => m.orderIndex);
  return fake.client.milestone.create({
    data: {
      projectId,
      orderIndex: (used.length ? Math.max(...used) : 0) + 1,
      title: 'M1',
      description: 'Milestone one',
      amountMinor: 100000,
      status,
      acceptanceCriteria: JSON.stringify(['Criterion A', 'Criterion B']),
      ...extra,
    },
  });
}

async function mkSubmission(milestoneId: string) {
  const n = fake.all('deliverableSubmission').filter((s) => s.milestoneId === milestoneId).length;
  return fake.client.deliverableSubmission.create({
    data: {
      milestoneId,
      revision: n + 1,
      authorId: 'demo-freelancer-marcus',
      summary: 'Delivered everything as agreed',
      deliverableUrl: 'https://example.com/pr/1',
    },
  });
}

const statusOf = (id: string) => fake.all('milestone').find((m) => m.id === id)!.status;

describe('ProofPay Phase 0 — authorization, state machine, payment honesty', () => {
  const originalLog = console.log;
  after(() => {
    console.log = originalLog;
  });

  before(async () => {
    // The seed prints emoji progress lines; keep the test runner's output channel clean.
    console.log = () => {};
    process.env.NODE_ENV = 'test';
    process.env.GEMINI_API_KEY = ''; // guarantee no real Gemini call is possible
    process.env.PAYPAL_CLIENT_ID = 'sandbox-client-id-present';
    process.env.PAYPAL_CLIENT_SECRET = 'present-but-unused';
    delete process.env.DEMO_MODE;
    (globalThis as any).prismaGlobal = fake.client;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createApp } = require('../src/app');
    ({ aiDeps } = require('../src/routes/v1/ai.routes'));
    aiDeps.auditDeliverable = async () => {
      auditCalls += 1;
      return goodAudit;
    };
    aiDeps.generateMilestones = async () => {
      throw new Error('Gemini must not be called in tests');
    };
    app = createApp();
  });

  beforeEach(async () => {
    fake.reset();
    auditCalls = 0;
    delete process.env.DEMO_MODE;
    process.env.NODE_ENV = 'test';
    await seedBase();
  });

  // ---------------------------------------------------------------- roles
  describe('Role enforcement', () => {
    it('rejects a missing role with 401 on every protected route group', async () => {
      const p = await mkProject();
      const m = await mkMilestone(p.id, 'IN_PROGRESS');
      const checks = [
        await api().get('/projects'),
        await api().get(`/projects/${p.id}`),
        await api().get(`/milestones/${m.id}`),
        await api().patch(`/milestones/${m.id}`).send({ title: 'x1' }),
        await api().post(`/milestones/${m.id}/transition`).send({ to: 'SUBMITTED' }),
        await api().post(`/milestones/${m.id}/submissions`).send({}),
        await api().post('/ai/audit-submission/whatever'),
        await api().post('/projects').send({}),
      ];
      for (const r of checks) {
        assert.equal(r.status, 401);
        assert.equal(r.body.code, 'DEMO_ROLE_REQUIRED');
      }
      assert.equal(statusOf(m.id), 'IN_PROGRESS');
    });

    it('rejects invalid roles with 403 and never defaults them to CLIENT', async () => {
      const p = await mkProject();
      const m = await mkMilestone(p.id, 'AWAITING_PAYMENT_AUTH');
      for (const bad of ['ADMIN', 'client', 'Client', 'freelancer', 'CLIENT,FREELANCER', 'null', 'x']) {
        const r = await api(bad).post(`/milestones/${m.id}/transition`).send({ to: 'IN_PROGRESS' });
        assert.equal(r.status, 403, `role "${bad}"`);
        assert.equal(r.body.code, 'INVALID_DEMO_ROLE');
      }
      assert.equal(statusOf(m.id), 'AWAITING_PAYMENT_AUTH');
      assert.equal(fake.all('paymentRecord').length, 0);
    });

    it('health and demo user listing stay public', async () => {
      assert.equal((await api().get('/health')).status, 200);
      assert.equal((await api().get('/demo/users')).status, 200);
    });

    it('client cannot perform freelancer-only submission actions', async () => {
      const p = await mkProject();
      const m = await mkMilestone(p.id, 'IN_PROGRESS');
      const r = await api(CLIENT)
        .post(`/milestones/${m.id}/submissions`)
        .send({ summary: 'Client pretending to deliver', deliverableUrl: 'https://example.com/a' });
      assert.equal(r.status, 403);
      assert.equal(r.body.code, 'ROLE_NOT_PERMITTED');
      assert.equal(fake.all('deliverableSubmission').length, 0);
      assert.equal(statusOf(m.id), 'IN_PROGRESS');
    });

    it('freelancer cannot approve, request revision, authorize, edit or create projects', async () => {
      const p = await mkProject();
      const reviewed = await mkMilestone(p.id, 'AI_REVIEWED');
      const awaiting = await mkMilestone(p.id, 'AWAITING_PAYMENT_AUTH', { orderIndex: 2 });

      const approve = await api(FREELANCER).post(`/milestones/${reviewed.id}/transition`).send({ to: 'COMPLETED' });
      assert.equal(approve.status, 403);
      const revise = await api(FREELANCER).post(`/milestones/${reviewed.id}/transition`).send({ to: 'REVISION_REQUESTED' });
      assert.equal(revise.status, 403);
      const authorize = await api(FREELANCER).post(`/milestones/${awaiting.id}/transition`).send({ to: 'IN_PROGRESS' });
      assert.equal(authorize.status, 403);
      const edit = await api(FREELANCER).patch(`/milestones/${awaiting.id}`).send({ amount: 1 });
      assert.equal(edit.status, 403);
      const create = await api(FREELANCER).post('/projects').send({});
      assert.equal(create.status, 403);

      assert.equal(statusOf(reviewed.id), 'AI_REVIEWED');
      assert.equal(statusOf(awaiting.id), 'AWAITING_PAYMENT_AUTH');
      assert.equal(fake.all('paymentRecord').length, 0, 'no payment record may be created');
    });

    it('enforces project ownership for reads and writes', async () => {
      const other = await mkProject('some-other-client', 'demo-freelancer-marcus');
      const m = await mkMilestone(other.id, 'AWAITING_PAYMENT_AUTH');
      const write = await api(CLIENT).post(`/milestones/${m.id}/transition`).send({ to: 'IN_PROGRESS' });
      assert.equal(write.status, 403);
      assert.equal(write.body.code, 'NOT_PROJECT_PARTICIPANT');
      assert.equal((await api(CLIENT).get(`/projects/${other.id}`)).status, 403);
      assert.equal((await api(CLIENT).get(`/milestones/${m.id}`)).status, 403);
      assert.equal((await api(CLIENT).get('/projects')).body.projects.length, 0);

      const unassigned = await mkProject('demo-client-elena', 'someone-else');
      const m2 = await mkMilestone(unassigned.id, 'IN_PROGRESS');
      const sub = await api(FREELANCER)
        .post(`/milestones/${m2.id}/submissions`)
        .send({ summary: 'Not my project at all', deliverableUrl: 'https://example.com/z' });
      assert.equal(sub.status, 403);
      assert.equal(fake.all('deliverableSubmission').length, 0);
    });
  });

  // -------------------------------------------------------- state machine
  describe('Milestone state machine', () => {
    it('rejects invalid transitions with 409', async () => {
      const p = await mkProject();
      const cases: Array<[string, string]> = [
        ['IN_PROGRESS', 'COMPLETED'],
        ['AWAITING_PAYMENT_AUTH', 'COMPLETED'],
        ['DRAFT', 'IN_PROGRESS'],
        ['COMPLETED', 'IN_PROGRESS'],
        ['COMPLETED', 'REVISION_REQUESTED'],
        ['REVISION_REQUESTED', 'COMPLETED'],
      ];
      for (const [from, to] of cases) {
        const m = await mkMilestone(p.id, from);
        const r = await api(CLIENT).post(`/milestones/${m.id}/transition`).send({ to });
        assert.equal(r.status, 409, `${from} -> ${to}`);
        assert.equal(r.body.code, 'INVALID_TRANSITION');
        assert.equal(statusOf(m.id), from);
      }
    });

    it('does not let a client fabricate system-only states via the transition endpoint', async () => {
      const p = await mkProject();
      const m = await mkMilestone(p.id, 'IN_PROGRESS');
      const r = await api(CLIENT).post(`/milestones/${m.id}/transition`).send({ to: 'SUBMITTED' });
      assert.equal(r.status, 403);
      const m2 = await mkMilestone(p.id, 'SUBMITTED', { orderIndex: 2 });
      const r2 = await api(CLIENT).post(`/milestones/${m2.id}/transition`).send({ to: 'AI_REVIEWED' });
      assert.equal(r2.status, 403);
      assert.equal(statusOf(m.id), 'IN_PROGRESS');
      assert.equal(statusOf(m2.id), 'SUBMITTED');
    });

    it('rejects unknown target statuses and status changes through PATCH', async () => {
      const p = await mkProject();
      const m = await mkMilestone(p.id, 'IN_PROGRESS');
      assert.equal((await api(CLIENT).post(`/milestones/${m.id}/transition`).send({ to: 'PAID' })).status, 400);
      const patch = await api(CLIENT).patch(`/milestones/${m.id}`).send({ status: 'COMPLETED' });
      assert.equal(patch.status, 400);
      assert.equal(patch.body.code, 'STATUS_CHANGE_NOT_ALLOWED');
      assert.equal(statusOf(m.id), 'IN_PROGRESS');
    });

    it('returns 404 for unknown milestone ids', async () => {
      assert.equal((await api(CLIENT).post('/milestones/nope/transition').send({ to: 'IN_PROGRESS' })).status, 404);
    });

    it('allows the full happy path and unlocks the next milestone', async () => {
      const p = await mkProject();
      const m1 = await mkMilestone(p.id, 'AWAITING_PAYMENT_AUTH');
      const m2 = await mkMilestone(p.id, 'DRAFT', { orderIndex: 2 });

      assert.equal((await api(CLIENT).post(`/milestones/${m1.id}/transition`).send({ to: 'IN_PROGRESS' })).status, 200);
      const sub = await api(FREELANCER)
        .post(`/milestones/${m1.id}/submissions`)
        .send({ summary: 'All done and evidenced', deliverableUrl: 'https://example.com/pr/9' });
      assert.equal(sub.status, 201);
      assert.equal(statusOf(m1.id), 'SUBMITTED');
      const audit = await api(CLIENT).post(`/ai/audit-submission/${sub.body.submission.id}`);
      assert.equal(audit.status, 200);
      assert.equal(statusOf(m1.id), 'AI_REVIEWED');
      assert.equal((await api(CLIENT).post(`/milestones/${m1.id}/transition`).send({ to: 'COMPLETED' })).status, 200);
      assert.equal(statusOf(m1.id), 'COMPLETED');
      assert.equal(statusOf(m2.id), 'AWAITING_PAYMENT_AUTH');
    });

    it('locks amount and acceptance criteria once a milestone is funded/active', async () => {
      const p = await mkProject();
      for (const status of ['IN_PROGRESS', 'SUBMITTED', 'AI_REVIEWED', 'REVISION_REQUESTED', 'PAYMENT_APPROVED']) {
        const m = await mkMilestone(p.id, status);
        const amt = await api(CLIENT).patch(`/milestones/${m.id}`).send({ amount: 1 });
        assert.equal(amt.status, 409, status);
        assert.equal(amt.body.code, 'MILESTONE_TERMS_LOCKED');
        const crit = await api(CLIENT).patch(`/milestones/${m.id}`).send({ acceptanceCriteria: ['easier'] });
        assert.equal(crit.status, 409, status);
        assert.equal(fake.all('milestone').find((x) => x.id === m.id)!.amountMinor, 100000);
      }
    });

    it('still allows criteria edits and budget-neutral amount edits before funding, and title edits while active', async () => {
      const p = await mkProject();
      fake.all('project').find((x) => x.id === p.id)!.totalBudgetMinor = 100000; // single 1000.00 milestone = whole budget
      const pre = await mkMilestone(p.id, 'AWAITING_PAYMENT_AUTH');
      // Only the budget-neutral value is accepted.
      const bad = await api(CLIENT).patch(`/milestones/${pre.id}`).send({ amount: '1200.00' });
      assert.equal(bad.status, 409);
      assert.equal(bad.body.code, 'BUDGET_MISMATCH');
      const ok = await api(CLIENT).patch(`/milestones/${pre.id}`).send({ amount: '1000.00', acceptanceCriteria: ['Alpha', 'Beta', 'Gamma'] });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.milestone.amountMinor, 100000);
      assert.equal(ok.body.milestone.amount, '1000.00');
      assert.deepEqual(ok.body.milestone.acceptanceCriteria, ['Alpha', 'Beta', 'Gamma']);

      const active = await mkMilestone(p.id, 'IN_PROGRESS', { orderIndex: 2 });
      assert.equal((await api(CLIENT).patch(`/milestones/${active.id}`).send({ title: 'Renamed' })).status, 200);
    });

    it('makes completed milestones fully read-only', async () => {
      const p = await mkProject();
      const m = await mkMilestone(p.id, 'COMPLETED');
      const r = await api(CLIENT).patch(`/milestones/${m.id}`).send({ title: 'Changed' });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'MILESTONE_FROZEN');
    });
  });

  // -------------------------------------------------- submissions / audits
  describe('Submissions and AI audits cannot alter completed or draft state', () => {
    it('rejects submissions to completed, draft, unfunded and already-submitted milestones', async () => {
      const p = await mkProject();
      for (const status of ['COMPLETED', 'DRAFT', 'AWAITING_PAYMENT_AUTH', 'SUBMITTED', 'AI_REVIEWED', 'PAYMENT_APPROVED']) {
        const m = await mkMilestone(p.id, status);
        const r = await api(FREELANCER)
          .post(`/milestones/${m.id}/submissions`)
          .send({ summary: 'Trying to resubmit', deliverableUrl: 'https://example.com/r' });
        assert.equal(r.status, 409, status);
        assert.equal(r.body.code, 'MILESTONE_NOT_ACCEPTING_SUBMISSIONS');
        assert.equal(statusOf(m.id), status, `${status} must not change`);
      }
      assert.equal(fake.all('deliverableSubmission').length, 0);
    });

    it('accepts submissions for IN_PROGRESS and REVISION_REQUESTED', async () => {
      const p = await mkProject();
      for (const status of ['IN_PROGRESS', 'REVISION_REQUESTED']) {
        const m = await mkMilestone(p.id, status);
        const r = await api(FREELANCER)
          .post(`/milestones/${m.id}/submissions`)
          .send({ summary: 'A valid deliverable', deliverableUrl: 'https://example.com/ok' });
        assert.equal(r.status, 201, status);
        assert.equal(statusOf(m.id), 'SUBMITTED');
      }
    });

    it('a duplicate concurrent submission creates exactly one submission', async () => {
      const p = await mkProject();
      const m = await mkMilestone(p.id, 'IN_PROGRESS');
      const body = { summary: 'Double click delivery', deliverableUrl: 'https://example.com/dd' };
      const [a, b] = await Promise.all([
        api(FREELANCER).post(`/milestones/${m.id}/submissions`).send(body),
        api(FREELANCER).post(`/milestones/${m.id}/submissions`).send(body),
      ]);
      assert.deepEqual([a.status, b.status].sort(), [201, 409]);
      assert.equal(fake.all('deliverableSubmission').length, 1);
    });

    it('rejects audits of completed (and other non-auditable) milestones without changing them', async () => {
      const p = await mkProject();
      for (const status of ['COMPLETED', 'IN_PROGRESS', 'DRAFT', 'REVISION_REQUESTED', 'PAYMENT_APPROVED']) {
        const m = await mkMilestone(p.id, status);
        const s = await mkSubmission(m.id);
        const r = await api(CLIENT).post(`/ai/audit-submission/${s.id}`);
        assert.equal(r.status, 409, status);
        assert.equal(r.body.code, 'MILESTONE_NOT_AUDITABLE');
        assert.equal(statusOf(m.id), status, `${status} must not regress`);
      }
      assert.equal(auditCalls, 0, 'Gemini must not even be invoked');
      assert.equal(fake.all('aIReview').length, 0);
    });

    it('audit is advisory: moves SUBMITTED->AI_REVIEWED, keeps history, never touches payments', async () => {
      const p = await mkProject();
      const m = await mkMilestone(p.id, 'SUBMITTED');
      const s = await mkSubmission(m.id);
      await fake.client.paymentRecord.create({
        data: { milestoneId: m.id, provider: 'LOCAL_DEV', orderId: 'LOCAL-DEV-ORDER-x', amountMinor: 100000, status: 'AUTHORIZED' },
      });
      const paymentSnapshot = JSON.stringify(fake.all('paymentRecord'));
      fake.writes.length = 0;

      const r1 = await api(CLIENT).post(`/ai/audit-submission/${s.id}`);
      assert.equal(r1.status, 200);
      assert.equal(statusOf(m.id), 'AI_REVIEWED');
      // re-audit allowed, status must not regress, history is appended
      const r2 = await api(CLIENT).post(`/ai/audit-submission/${s.id}`);
      assert.equal(r2.status, 200);
      assert.equal(statusOf(m.id), 'AI_REVIEWED');
      assert.equal(fake.all('aIReview').length, 2);

      assert.equal(JSON.stringify(fake.all('paymentRecord')), paymentSnapshot, 'payment records untouched');
      assert.equal(fake.writes.filter((w) => w.model === 'paymentRecord').length, 0);
    });

    it('prevents concurrent duplicate audits of the same milestone', async () => {
      const p = await mkProject();
      const m = await mkMilestone(p.id, 'SUBMITTED');
      const s = await mkSubmission(m.id);

      let release!: () => void;
      const gate = new Promise<void>((res) => (release = res));
      aiDeps.auditDeliverable = async () => {
        auditCalls += 1;
        await gate;
        return goodAudit;
      };

      const first = api(CLIENT).post(`/ai/audit-submission/${s.id}`).then((r: any) => r);
      // let the first request reach the (blocked) Gemini call
      await new Promise((r) => setTimeout(r, 100));
      const second = await api(CLIENT).post(`/ai/audit-submission/${s.id}`);
      assert.equal(second.status, 409);
      assert.equal(second.body.code, 'AUDIT_IN_PROGRESS');
      release();
      assert.equal((await first).status, 200);
      assert.equal(auditCalls, 1);
      assert.equal(fake.all('aIReview').length, 1);

      aiDeps.auditDeliverable = async () => {
        auditCalls += 1;
        return goodAudit;
      };
    });

    it('discards an audit if the client approved while Gemini was running', async () => {
      const p = await mkProject();
      const m = await mkMilestone(p.id, 'SUBMITTED');
      const s = await mkSubmission(m.id);
      aiDeps.auditDeliverable = async () => {
        // simulate the client approving mid-audit
        await fake.client.milestone.updateMany({ where: { id: m.id }, data: { status: 'COMPLETED' } });
        return goodAudit;
      };
      const r = await api(CLIENT).post(`/ai/audit-submission/${s.id}`);
      assert.equal(r.status, 409);
      assert.equal(statusOf(m.id), 'COMPLETED');
      assert.equal(fake.all('aIReview').length, 0);
      aiDeps.auditDeliverable = async () => {
        auditCalls += 1;
        return goodAudit;
      };
    });

    it('rejects audits of a stale (non-latest) submission', async () => {
      const p = await mkProject();
      const m = await mkMilestone(p.id, 'SUBMITTED');
      const old = await mkSubmission(m.id);
      await mkSubmission(m.id);
      const r = await api(CLIENT).post(`/ai/audit-submission/${old.id}`);
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'STALE_SUBMISSION');
    });
  });

  // ----------------------------------------------------------- demo reset
  describe('Demo reset protection', () => {
    it('is forbidden when DEMO_MODE is not explicitly true', async () => {
      const p = await mkProject();
      const r = await api(CLIENT).post('/demo/reset');
      assert.equal(r.status, 403);
      assert.equal(r.body.code, 'DEMO_RESET_FORBIDDEN');
      assert.equal(fake.all('project').length, 1, 'data must remain');
      void p;
    });

    it('is forbidden when DEMO_MODE has any value other than true', async () => {
      for (const v of ['1', 'yes', 'false', 'TRUEISH']) {
        process.env.DEMO_MODE = v;
        assert.equal((await api(CLIENT).post('/demo/reset')).status, 403, v);
      }
    });

    it('is forbidden in production even if DEMO_MODE=true', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DEMO_MODE = 'true';
      const r = await api(CLIENT).post('/demo/reset');
      assert.equal(r.status, 403);
      assert.equal(r.body.code, 'DEMO_RESET_FORBIDDEN');
      assert.equal(fake.all('user').length, 2);
    });

    it('is forbidden even without a role header when the environment disallows it', async () => {
      assert.equal((await api().post('/demo/reset')).status, 403);
    });

    it('requires a valid role even when the environment allows it', async () => {
      process.env.DEMO_MODE = 'true';
      assert.equal((await api().post('/demo/reset')).status, 401);
      assert.equal((await api('ADMIN').post('/demo/reset')).status, 403);
    });

    it('runs only with NODE_ENV!=production AND DEMO_MODE=true', async () => {
      process.env.DEMO_MODE = 'true';
      const r = await api(CLIENT).post('/demo/reset');
      assert.equal(r.status, 200);
      assert.equal(r.body.success, true);
      assert.ok(fake.all('project').length >= 1, 're-seeded demo projects');
    });
  });

  // ------------------------------------------------------ payment honesty
  describe('Simulated payment labelling', () => {
    it('authorization creates a LOCAL_DEV SIMULATED record with non-PayPal ids', async () => {
      const p = await mkProject();
      const m = await mkMilestone(p.id, 'AWAITING_PAYMENT_AUTH');
      const r = await api(CLIENT).post(`/milestones/${m.id}/transition`).send({ to: 'IN_PROGRESS' });
      assert.equal(r.status, 200);
      const pay = r.body.milestone.currentPayment;
      assert.equal(pay.provider, 'LOCAL_DEV');
      assert.equal(pay.simulated, true);
      assert.match(pay.simulatedLabel, /SIMULATED/);
      assert.equal(pay.status, 'AUTHORIZED');
      assert.match(pay.orderId, /^LOCAL-DEV-/);
      assert.match(pay.authorizationId, /^LOCAL-DEV-/);
      assert.equal(pay.captureId ?? null, null);
      assert.match(r.body.paymentNotice, /SIMULATED/);
      for (const v of [pay.orderId, pay.authorizationId]) assert.doesNotMatch(v, /PP-|PAYPAL/i);
    });

    it('client approval releases only a simulated record and never a PayPal-shaped id', async () => {
      const p = await mkProject();
      const m = await mkMilestone(p.id, 'AWAITING_PAYMENT_AUTH');
      await api(CLIENT).post(`/milestones/${m.id}/transition`).send({ to: 'IN_PROGRESS' });
      fake.all('milestone').find((x) => x.id === m.id)!.status = 'AI_REVIEWED';
      const r = await api(CLIENT).post(`/milestones/${m.id}/transition`).send({ to: 'COMPLETED' });
      assert.equal(r.status, 200);
      const pay = r.body.milestone.currentPayment;
      assert.equal(pay.provider, 'LOCAL_DEV');
      assert.equal(pay.simulated, true);
      assert.match(pay.captureId, /^LOCAL-DEV-CAPTURE-/);
      assert.equal(fake.all('paymentRecord').length, 1, 'authorization record updated, not duplicated');
      const audit = fake.all('auditLog').map((a) => a.action);
      assert.ok(audit.includes('MILESTONE_AI_REVIEWED_TO_COMPLETED'));
    });

    it('legacy mislabelled PAYPAL/DEMO-PP rows are presented as simulated by the API', async () => {
      const p = await mkProject();
      const m = await mkMilestone(p.id, 'COMPLETED');
      await fake.client.paymentRecord.create({
        data: {
          milestoneId: m.id, provider: 'PAYPAL', orderId: 'DEMO-PP-ORD-88219A',
          authorizationId: 'DEMO-PP-AUTH-88219A', captureId: 'DEMO-PP-CAP-88219A', amountMinor: 100000, status: 'CAPTURED',
        },
      });
      const detail = await api(CLIENT).get(`/milestones/${m.id}`);
      assert.equal(detail.body.milestone.currentPayment.simulated, true);
      const proj = await api(CLIENT).get(`/projects/${p.id}`);
      assert.equal(proj.body.project.milestones[0].currentPayment.simulated, true);
      assert.equal(proj.body.project.stats.paymentsAreSimulated, true);
      const list = await api(CLIENT).get('/projects');
      assert.equal(list.body.projects[0].milestones[0].paymentRecords[0].simulated, true);
    });

    it('stats derive captured/authorized amounts from payment records, not status alone', async () => {
      const p = await mkProject();
      await mkMilestone(p.id, 'COMPLETED'); // approved but no payment record
      const proj = await api(CLIENT).get(`/projects/${p.id}`);
      assert.equal(proj.body.project.stats.capturedAmountMinor, 0);
      assert.equal(proj.body.project.stats.approvedAmountMinor, 100000);
    });

    it('seeded demo data contains no PayPal-labelled or PayPal-shaped records', async () => {
      process.env.DEMO_MODE = 'true';
      assert.equal((await api(CLIENT).post('/demo/reset')).status, 200);
      const recs = fake.all('paymentRecord');
      assert.ok(recs.length >= 1);
      for (const rec of recs) {
        assert.equal(rec.provider, 'LOCAL_DEV');
        for (const v of [rec.orderId, rec.authorizationId, rec.captureId].filter(Boolean)) {
          assert.doesNotMatch(v, /PP-|PAYPAL/i);
        }
      }
    });

    it('health does not claim PayPal Sandbox just because a Client ID is configured', async () => {
      const res = await api().get('/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.paymentProviderMode, 'LOCAL_DEV_SIMULATED');
      assert.equal(res.body.paypal.active, false);
      assert.equal(res.body.paypal.integration, 'NOT_IMPLEMENTED');
      assert.equal(res.body.paypal.credentialsConfigured, true);
      assert.equal(res.body.authentication, 'NONE_DEMO_ROLE_HEADER_ONLY');
    });
  });
});
