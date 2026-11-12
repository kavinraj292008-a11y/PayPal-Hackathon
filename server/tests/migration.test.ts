/**
 * Migration tests: run the REAL SQL migrations in prisma/migrations against a real SQLite
 * engine (node:sqlite). Covers legacy-data preservation, constraints, uniqueness, Restrict
 * deletes and agreement with schema.prisma. Requires Node >= 22.5.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
let DatabaseSync: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch {
  DatabaseSync = null;
}
const skip = DatabaseSync ? false : 'node:sqlite is not available (needs Node >= 22.5)';

const PRISMA_DIR = path.resolve(__dirname, '..', 'prisma');
const sql = (name: string) => fs.readFileSync(path.join(PRISMA_DIR, 'migrations', name, 'migration.sql'), 'utf8');
const INIT = sql('0_init');
const PHASE1 = sql('1_phase1_integrity');
const NOW = '2026-01-01 00:00:00';

const fresh = () => {
  const db = new DatabaseSync(':memory:');
  db.exec(INIT);
  return db;
};
// node:sqlite returns null-prototype rows; copy to plain objects so deepStrictEqual works
const plain = (r: any) => (r ? { ...r } : r);
const all = (db: any, q: string, ...args: unknown[]) => db.prepare(q).all(...args).map(plain);
const one = (db: any, q: string, ...args: unknown[]) => plain(db.prepare(q).get(...args));
const mustFail = (db: any, q: string, why: string) =>
  assert.throws(() => db.exec(q), (e: any) => /constraint|CHECK|UNIQUE|FOREIGN/i.test(String(e.message)), why);

function seedLegacy(db: any) {
  db.exec(`
    INSERT INTO User VALUES ('c1','c@x','Elena','CLIENT','t',NULL,NULL,1,'${NOW}','${NOW}'),('f1','f@x','Marcus','FREELANCER','t',NULL,NULL,1,'${NOW}','${NOW}');
    INSERT INTO Project VALUES ('p1','Proj','D',6000.0,'USD','ACTIVE','c1','f1','${NOW}','${NOW}');
    INSERT INTO Milestone VALUES
      ('m1','p1',1,'M1','d',1500.5,'USD',NULL,'COMPLETED','[]','${NOW}','${NOW}'),
      ('m2','p1',2,'M2','d',19.99,'USD',NULL,'SUBMITTED','["a"]','${NOW}','${NOW}'),
      ('m3','p1',3,'M3','d',4479.51,'USD',NULL,'DRAFT','[]','${NOW}','${NOW}');
    INSERT INTO DeliverableSubmission VALUES
      ('s1','m2','f1','first','https://x',NULL,NULL,'${NOW}','${NOW}'),
      ('s2','m2','f1','second','https://y',NULL,'evidence','2026-01-02 00:00:00','${NOW}');
    INSERT INTO AIReview VALUES
      ('r1','s2','PARTIAL',72,0.72,'sum','request_revision','[{"criterionId":"criterion-1","status":"satisfied"}]','[]','[]','[]','[]','[]','[]','cr','[]','adv','gemini-x',NULL,'2026-01-03 00:00:00'),
      ('r2','s2','COMPLIANT',90,0.9,'sum','APPROVE_RECOMMENDED','[]','[]','[]','[]','[]','[]','[]','cr','[]','adv','gemini-x',NULL,'2026-01-04 00:00:00');
    INSERT INTO PaymentRecord VALUES
      ('pay1','m1','PAYPAL','DEMO-PP-ORD-1','DEMO-PP-AUTH-1','DEMO-PP-CAP-1',1500.5,'USD','CAPTURED',NULL,NULL,'${NOW}','${NOW}'),
      ('pay2','m2','LOCAL_DEV','LOCAL-DEV-ORDER-m2','LOCAL-DEV-AUTH-m2',NULL,19.99,'USD','AUTHORIZED',NULL,NULL,'${NOW}','${NOW}');
    INSERT INTO AuditLog VALUES ('a1','c1','X','MILESTONE','m1',NULL,'${NOW}');
  `);
}
const migrated = () => {
  const db = fresh();
  seedLegacy(db);
  db.exec(PHASE1);
  db.exec('PRAGMA foreign_keys=ON');
  return db;
};

describe('Phase 1 migration: legacy data is preserved and converted exactly', { skip }, () => {
  it('converts float money to integer minor units without loss and keeps legacy values', () => {
    const db = migrated();
    assert.deepEqual(all(db, 'SELECT id, amountMinor, legacyAmount FROM Milestone ORDER BY orderIndex'), [
      { id: 'm1', amountMinor: 150050, legacyAmount: 1500.5 },
      { id: 'm2', amountMinor: 1999, legacyAmount: 19.99 }, // 19.99*100 = 1998.9999999999998 in floats
      { id: 'm3', amountMinor: 447951, legacyAmount: 4479.51 },
    ]);
    assert.deepEqual(one(db, 'SELECT totalBudgetMinor, legacyTotalBudget, currency, deadline FROM Project'), {
      totalBudgetMinor: 600000, legacyTotalBudget: 6000, currency: 'USD', deadline: null,
    });
    // totals still balance exactly
    assert.equal(one(db, 'SELECT SUM(amountMinor) AS s FROM Milestone').s, 600000);
    assert.equal(one(db, "SELECT COUNT(*) AS n FROM Milestone WHERE typeof(amountMinor) <> 'integer'").n, 0);
  });

  it('loses no rows and preserves ids, relationships and history', () => {
    const db = migrated();
    const counts = (t: string) => one(db, `SELECT COUNT(*) AS n FROM ${t}`).n;
    assert.deepEqual(['User', 'Project', 'Milestone', 'DeliverableSubmission', 'AIReview', 'PaymentRecord', 'AuditLog'].map(counts), [2, 1, 3, 2, 2, 2, 1]);
    assert.deepEqual(all(db, 'PRAGMA foreign_key_check'), []);
    assert.equal(one(db, "SELECT status FROM Milestone WHERE id='m1'").status, 'COMPLETED');
    assert.equal(one(db, "SELECT uploadedEvidenceText AS e FROM DeliverableSubmission WHERE id='s2'").e, 'evidence');
  });

  it('relabels legacy "PayPal" demo payments as LOCAL_DEV, keeping the financial history', () => {
    const db = migrated();
    assert.deepEqual(all(db, 'SELECT id, provider, orderId, authorizationId, captureId, amountMinor, status FROM PaymentRecord ORDER BY id'), [
      { id: 'pay1', provider: 'LOCAL_DEV', orderId: 'LOCAL-DEV-ORD-1', authorizationId: 'LOCAL-DEV-AUTH-1', captureId: 'LOCAL-DEV-CAP-1', amountMinor: 150050, status: 'CAPTURED' },
      { id: 'pay2', provider: 'LOCAL_DEV', orderId: 'LOCAL-DEV-ORDER-m2', authorizationId: 'LOCAL-DEV-AUTH-m2', captureId: null, amountMinor: 1999, status: 'AUTHORIZED' },
    ]);
    assert.equal(one(db, "SELECT COUNT(*) AS n FROM PaymentRecord WHERE orderId LIKE 'DEMO-PP-%' OR provider='PAYPAL'").n, 0);
  });

  it('numbers submissions and reviews, upper-cases recommendations, keeps the model claims', () => {
    const db = migrated();
    assert.deepEqual(all(db, 'SELECT id, revision FROM DeliverableSubmission ORDER BY revision'), [{ id: 's1', revision: 1 }, { id: 's2', revision: 2 }]);
    assert.deepEqual(all(db, 'SELECT id, sequence, recommendation, modelRecommendation, modelOverallScore, legacyConfidenceScore, scoringPolicyVersion FROM AIReview ORDER BY sequence'), [
      { id: 'r1', sequence: 1, recommendation: 'REQUEST_REVISION', modelRecommendation: 'request_revision', modelOverallScore: 72, legacyConfidenceScore: 0.72, scoringPolicyVersion: 'legacy' },
      { id: 'r2', sequence: 2, recommendation: 'APPROVE_RECOMMENDED', modelRecommendation: 'APPROVE_RECOMMENDED', modelOverallScore: 90, legacyConfidenceScore: 0.9, scoringPolicyVersion: 'legacy' },
    ]);
  });

  it('is all-or-nothing: an inexact legacy amount aborts and leaves the original tables untouched', () => {
    const db = fresh();
    seedLegacy(db);
    db.exec("UPDATE Milestone SET amount = 10.005 WHERE id = 'm3'"); // sub-cent precision cannot be stored exactly
    assert.throws(() => db.exec(PHASE1), /constraint|CHECK/i);
    // originals intact: still the legacy shape and data
    assert.ok(all(db, 'PRAGMA table_info(Milestone)').some((c: any) => c.name === 'amount'));
    assert.ok(!all(db, 'PRAGMA table_info(Milestone)').some((c: any) => c.name === 'amountMinor'));
    assert.equal(one(db, "SELECT amount FROM Milestone WHERE id='m3'").amount, 10.005);
    assert.equal(one(db, 'SELECT COUNT(*) AS n FROM PaymentRecord').n, 2);
    assert.equal(one(db, "SELECT orderId FROM PaymentRecord WHERE id='pay1'").orderId, 'DEMO-PP-ORD-1');
    // fix the data and re-run: the migration is re-runnable after a failed attempt
    db.exec("UPDATE Milestone SET amount = 10.01 WHERE id = 'm3'");
    db.exec(PHASE1);
    assert.equal(one(db, "SELECT amountMinor FROM Milestone WHERE id='m3'").amountMinor, 1001);
  });

  it('refuses unsupported legacy currencies instead of guessing; normalises casing', () => {
    const db = fresh();
    seedLegacy(db);
    db.exec("UPDATE Project SET currency='usd'; UPDATE Milestone SET currency='usd'; UPDATE PaymentRecord SET currency='usd'");
    db.exec(PHASE1);
    assert.equal(one(db, 'SELECT DISTINCT currency AS c FROM Milestone').c, 'USD');

    const bad = fresh();
    seedLegacy(bad);
    bad.exec("UPDATE Project SET currency='XYZ'");
    assert.throws(() => bad.exec(PHASE1), /constraint|CHECK/i);
    assert.ok(all(bad, 'PRAGMA table_info(Project)').some((c: any) => c.name === 'totalBudget'));
  });

  it('handles zero-decimal currencies', () => {
    const db = fresh();
    seedLegacy(db);
    db.exec("UPDATE Project SET currency='JPY', totalBudget=6000; UPDATE Milestone SET currency='JPY', amount=2000; UPDATE PaymentRecord SET currency='JPY', amount=2000");
    db.exec(PHASE1);
    assert.equal(one(db, 'SELECT totalBudgetMinor AS t FROM Project').t, 6000);
    assert.equal(one(db, "SELECT amountMinor AS a FROM Milestone WHERE id='m1'").a, 2000);
  });

  it('creates every Phase 1 index and tolerates an empty database', () => {
    const db = fresh();
    db.exec(PHASE1);
    const idx = all(db, "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'").map((r: any) => r.name).sort();
    assert.deepEqual(idx, [
      'AIReview_submissionId_createdAt_idx', 'AIReview_submissionId_sequence_key', 'AuditLog_entityType_entityId_idx', 'AuditLog_userId_idx',
      'DeliverableSubmission_authorId_idx', 'DeliverableSubmission_milestoneId_revision_key',
      'Milestone_projectId_orderIndex_key', 'Milestone_projectId_status_idx',
      'PaymentRecord_authorizationId_key', 'PaymentRecord_captureId_key', 'PaymentRecord_milestoneId_createdAt_idx', 'PaymentRecord_orderId_key', 'PaymentRecord_status_idx',
      'Project_clientId_idx', 'Project_freelancerId_idx', 'Project_status_idx', 'User_email_key',
    ]);
  });
});

describe('Phase 1 schema: constraints enforced by the database itself', { skip }, () => {
  const ins = {
    milestone: (id: string, over: Record<string, string | number> = {}) => {
      const v = { status: 'DRAFT', amountMinor: 100, currency: 'USD', orderIndex: 9, ...over };
      return `INSERT INTO Milestone (id,projectId,orderIndex,title,description,amountMinor,currency,status,acceptanceCriteria,createdAt,updatedAt) VALUES ('${id}','p1',${v.orderIndex},'t','d',${v.amountMinor},'${v.currency}','${v.status}','[]','${NOW}','${NOW}')`;
    },
    payment: (id: string, o: Record<string, string | null | number> = {}) => {
      const v: any = { provider: 'LOCAL_DEV', orderId: `LOCAL-DEV-${id}`, auth: null, cap: null, status: 'CREATED', amountMinor: 100, ...o };
      const q = (x: any) => (x === null ? 'NULL' : `'${x}'`);
      return `INSERT INTO PaymentRecord (id,milestoneId,provider,orderId,authorizationId,captureId,amountMinor,currency,status,createdAt,updatedAt) VALUES ('${id}','m1',${q(v.provider)},${q(v.orderId)},${q(v.auth)},${q(v.cap)},${v.amountMinor},'USD',${q(v.status)},'${NOW}','${NOW}')`;
    },
  };

  it('rejects invalid roles, statuses, currencies and non-positive amounts', () => {
    const db = migrated();
    mustFail(db, `INSERT INTO User (id,email,name,role,title,createdAt,updatedAt) VALUES ('x','x@x','n','ADMIN','t','${NOW}','${NOW}')`, 'role');
    mustFail(db, ins.milestone('bad1', { status: 'PAID' }), 'milestone status');
    mustFail(db, ins.milestone('bad2', { currency: 'XYZ' }), 'currency');
    mustFail(db, ins.milestone('bad3', { amountMinor: 0 }), 'zero');
    mustFail(db, ins.milestone('bad4', { amountMinor: -5 }), 'negative');
    mustFail(db, ins.milestone('bad5', { orderIndex: 0 }), 'order index');
    mustFail(db, ins.payment('pb1', { status: 'REFUNDED' }), 'payment status');
    mustFail(db, ins.payment('pb2', { amountMinor: 0 }), 'payment amount');
    mustFail(db, `UPDATE AIReview SET recommendation='approve_recommended' WHERE id='r1'`, 'recommendation vocabulary');
    mustFail(db, `UPDATE AIReview SET overallScore=101 WHERE id='r1'`, 'score range');
    db.exec(ins.milestone('good1')); // control: a valid row is accepted
  });

  it('keeps simulated payments clearly distinguishable as LOCAL_DEV', () => {
    const db = migrated();
    mustFail(db, ins.payment('pl1', { provider: 'PAYPAL', orderId: 'LOCAL-DEV-ORDER-fake' }), 'PAYPAL provider with a dev id');
    mustFail(db, ins.payment('pl2', { provider: 'LOCAL_DEV', orderId: 'ORD-LOOKS-REAL' }), 'LOCAL_DEV with a real-looking id');
    db.exec(ins.payment('pl3', { provider: 'PAYPAL', orderId: '5O190127TN364715T' })); // future real provider shape is allowed
  });

  it('rejects duplicate identifiers and duplicate submissions/reviews', () => {
    const db = migrated();
    db.exec(ins.payment('u1', { orderId: 'LOCAL-DEV-U1', auth: 'LOCAL-DEV-AUTH-U1', cap: 'LOCAL-DEV-CAP-U1' }));
    mustFail(db, ins.payment('u2', { orderId: 'LOCAL-DEV-U1' }), 'duplicate orderId');
    mustFail(db, ins.payment('u3', { orderId: 'LOCAL-DEV-U3', auth: 'LOCAL-DEV-AUTH-U1' }), 'duplicate authorizationId');
    mustFail(db, ins.payment('u4', { orderId: 'LOCAL-DEV-U4', cap: 'LOCAL-DEV-CAP-U1' }), 'duplicate captureId');
    db.exec(ins.payment('u5', { orderId: 'LOCAL-DEV-U5' })); // NULL ids never collide
    db.exec(ins.payment('u6', { orderId: 'LOCAL-DEV-U6' }));
    mustFail(db, ins.milestone('dup-order', { orderIndex: 1 }), 'duplicate (projectId, orderIndex)');
    mustFail(db, `INSERT INTO DeliverableSubmission (id,milestoneId,authorId,revision,summary,deliverableUrl,createdAt,updatedAt) VALUES ('sx','m2','f1',1,'s','https://x','${NOW}','${NOW}')`, 'duplicate (milestoneId, revision)');
    mustFail(db, `INSERT INTO AIReview (id,submissionId,sequence,overallStatus,summary,criteriaAnalysis,strengths,gapsIdentified,missingEvidence,evidenceLimitations,clientRecommendation,freelancerActionItems,advisoryNotice,createdAt) VALUES ('rx','s2',1,'PARTIAL','s','[]','[]','[]','[]','[]','c','[]','a','${NOW}')`, 'duplicate (submissionId, sequence)');
  });

  it('never cascade-deletes financial or audit history (Restrict)', () => {
    const db = migrated();
    assert.equal(one(db, 'PRAGMA foreign_keys').foreign_keys, 1);
    mustFail(db, "DELETE FROM Milestone WHERE id='m1'", 'milestone with a payment record');
    mustFail(db, "DELETE FROM Project WHERE id='p1'", 'project with milestones');
    mustFail(db, "DELETE FROM DeliverableSubmission WHERE id='s2'", 'submission with reviews');
    mustFail(db, "DELETE FROM Milestone WHERE id='m2'", 'milestone with submissions and payments');
    assert.equal(one(db, 'SELECT COUNT(*) AS n FROM PaymentRecord').n, 2);
    // a milestone with no history can still be removed
    db.exec("DELETE FROM Milestone WHERE id='m3'");
    assert.equal(one(db, 'SELECT COUNT(*) AS n FROM Milestone').n, 2);
  });
});

describe('Phase 1 schema: migrations agree with prisma/schema.prisma', { skip }, () => {
  const schema = fs.readFileSync(path.join(PRISMA_DIR, 'schema.prisma'), 'utf8');
  const SCALARS = new Set(['String', 'Int', 'Float', 'Boolean', 'DateTime']);
  const models: Record<string, { columns: string[]; uniques: string[][]; indexes: string[][] }> = {};
  for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const [, name, body] = m;
    const columns: string[] = [];
    const uniques: string[][] = [];
    const indexes: string[][] = [];
    for (const raw of body.split('\n')) {
      const line = raw.replace(/\/\/.*$/, '').trim();
      if (!line) continue;
      const f = /^(\w+)\s+(\w+)(\?|\[\])?/.exec(line);
      if (line.startsWith('@@unique')) uniques.push(/\[(.*?)\]/.exec(line)![1].split(',').map((x) => x.trim()));
      else if (line.startsWith('@@index')) indexes.push(/\[(.*?)\]/.exec(line)![1].split(',').map((x) => x.trim()));
      else if (f && SCALARS.has(f[2]) && f[3] !== '[]') {
        columns.push(f[1]);
        if (/@unique\b/.test(line) || /@id\b/.test(line) && false) uniques.push([f[1]]);
      }
    }
    models[name] = { columns, uniques, indexes };
  }

  it('every Prisma model has exactly the columns the migrations create', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(INIT);
    db.exec(PHASE1);
    for (const [model, def] of Object.entries(models)) {
      const cols = all(db, `PRAGMA table_info("${model}")`).map((c: any) => c.name).sort();
      assert.deepEqual(cols, [...def.columns].sort(), `columns of ${model}`);
    }
    assert.equal(Object.keys(models).length, 7);
  });

  it('every @unique / @@unique / @@index in the schema exists as an index', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(INIT);
    db.exec(PHASE1);
    for (const [model, def] of Object.entries(models)) {
      const real = all(db, `PRAGMA index_list("${model}")`).map((i: any) => ({
        unique: i.unique === 1,
        cols: all(db, `PRAGMA index_info("${i.name}")`).map((c: any) => c.name).join(','),
      }));
      for (const u of def.uniques) assert.ok(real.some((r: any) => r.unique && r.cols === u.join(',')), `${model} unique(${u})`);
      for (const ix of def.indexes) assert.ok(real.some((r: any) => r.cols === ix.join(',')), `${model} index(${ix})`);
    }
  });

  it('the supported-currency CHECK lists match the shared whitelist', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CURRENCY_CODES } = require('@proofpay/shared');
    const listed = [...PHASE1.matchAll(/"currency" IN \(([^)]*)\)/g)].map((m) => m[1].replace(/['\s]/g, '').split(',').sort().join(','));
    assert.equal(listed.length, 3); // Project, Milestone, PaymentRecord
    for (const l of listed) assert.equal(l, [...CURRENCY_CODES].sort().join(','));
  });
});
