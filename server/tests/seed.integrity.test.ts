/**
 * The demo seed must satisfy the real database constraints. The seed runs against the in-memory
 * Prisma stand-in; every row it produces is then inserted into a real SQLite database built from
 * the actual migrations, so CHECK / UNIQUE / FOREIGN KEY violations and unknown columns fail here.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createFakePrisma } from './helpers/fakePrisma';

// eslint-disable-next-line @typescript-eslint/no-require-imports
let DatabaseSync: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch {
  DatabaseSync = null;
}
const skip = DatabaseSync ? false : 'node:sqlite is not available (needs Node >= 22.5)';

describe('Demo seed vs. real database constraints', { skip }, () => {
  it('every seeded row is accepted by the migrated SQLite schema', async () => {
    const fake = createFakePrisma();
    (globalThis as any).prismaGlobal = fake.client;
    process.env.NODE_ENV = 'test';
    const log = console.log;
    console.log = () => {};
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      await require('../src/seed').seedDemoData();
    } finally {
      console.log = log;
    }

    const dir = path.resolve(__dirname, '..', 'prisma', 'migrations');
    const db = new DatabaseSync(':memory:');
    db.exec(fs.readFileSync(path.join(dir, '0_init', 'migration.sql'), 'utf8'));
    db.exec(fs.readFileSync(path.join(dir, '1_phase1_integrity', 'migration.sql'), 'utf8'));
    db.exec('PRAGMA foreign_keys=ON');

    const tables: Array<[string, string]> = [
      ['user', 'User'], ['project', 'Project'], ['milestone', 'Milestone'], ['deliverableSubmission', 'DeliverableSubmission'],
      ['aIReview', 'AIReview'], ['paymentRecord', 'PaymentRecord'], ['auditLog', 'AuditLog'],
    ];
    let total = 0;
    for (const [model, table] of tables) {
      const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map((c: any) => c.name as string);
      for (const row of fake.all(model)) {
        const keys = Object.keys(row);
        for (const k of keys) assert.ok(cols.includes(k), `seed writes unknown column ${table}.${k}`);
        const values = keys.map((k) => {
          const v = row[k];
          return v instanceof Date ? v.toISOString() : typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v;
        });
        db.prepare(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...values);
        total += 1;
      }
    }
    assert.ok(total >= 8, `only ${total} rows seeded`);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    const sum = db.prepare('SELECT SUM(amountMinor) AS s FROM Milestone').get() as any;
    const budget = db.prepare('SELECT SUM(totalBudgetMinor) AS s FROM Project').get() as any;
    assert.equal(sum.s, budget.s, 'seeded milestone amounts sum exactly to the project budget');
  });
});
