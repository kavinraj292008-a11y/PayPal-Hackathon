/**
 * Minimal in-memory stand-in for the subset of PrismaClient used by ProofPay's
 * routes. It exists so authorization / state-machine / payment-honesty tests are
 * hermetic (no database file, no native Prisma engine, no network).
 *
 * It is NOT Prisma: it does not validate against schema.prisma. Behaviour that
 * depends on real DB semantics (constraints, SQLite locking) is not covered by
 * tests that use it.
 */
type Row = Record<string, any>;

const RELATIONS: Record<string, Record<string, { model: string; many: boolean; fk: string }>> = {
  project: {
    client: { model: 'user', many: false, fk: 'clientId' },
    freelancer: { model: 'user', many: false, fk: 'freelancerId' },
    milestones: { model: 'milestone', many: true, fk: 'projectId' },
  },
  milestone: {
    project: { model: 'project', many: false, fk: 'projectId' },
    submissions: { model: 'deliverableSubmission', many: true, fk: 'milestoneId' },
    paymentRecords: { model: 'paymentRecord', many: true, fk: 'milestoneId' },
  },
  deliverableSubmission: {
    author: { model: 'user', many: false, fk: 'authorId' },
    aiReviews: { model: 'aIReview', many: true, fk: 'submissionId' },
    milestone: { model: 'milestone', many: false, fk: 'milestoneId' },
  },
};

const DEFAULTS: Record<string, () => Row> = {
  user: () => ({ isDemoAccount: false }),
  project: () => ({ status: 'DRAFT', currency: 'USD' }),
  milestone: () => ({ currency: 'USD', status: 'DRAFT', acceptanceCriteria: '[]' }),
  paymentRecord: () => ({ currency: 'USD', status: 'CREATED' }),
  aIReview: () => ({ overallScore: 0, recommendation: 'manual_review', criteriaResults: '[]', risks: '[]' }),
};

/** Mirrors the unique constraints in schema.prisma (Prisma error code P2002 on violation). */
const UNIQUES: Record<string, string[][]> = {
  user: [['email']],
  milestone: [['projectId', 'orderIndex']],
  deliverableSubmission: [['milestoneId', 'revision']],
  aIReview: [['submissionId', 'sequence']],
  paymentRecord: [['orderId'], ['authorizationId'], ['captureId']],
};

const MODELS = ['user', 'project', 'milestone', 'deliverableSubmission', 'aIReview', 'paymentRecord', 'auditLog'];

export function createFakePrisma() {
  let store = new Map<string, Row[]>();
  let counter = 0;
  const writes: Array<{ model: string; op: string }> = [];
  const BASE = Date.parse('2026-01-01T00:00:00Z');

  const rows = (m: string) => {
    if (!store.has(m)) store.set(m, []);
    return store.get(m)!;
  };

  const matches = (row: Row, where?: Row): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([k, cond]) => {
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        if ('in' in cond) return (cond.in as any[]).includes(row[k]);
        if ('startsWith' in cond) return typeof row[k] === 'string' && row[k].startsWith(cond.startsWith);
        if ('not' in cond) return row[k] !== cond.not;
      }
      return row[k] === cond;
    });
  };

  const hydrate = (model: string, row: Row, include?: Row): Row => {
    const out: Row = { ...row };
    if (!include) return out;
    for (const [rel, spec] of Object.entries(include)) {
      if (!spec) continue;
      const def = RELATIONS[model]?.[rel];
      if (!def) throw new Error(`fakePrisma: unknown relation ${model}.${rel}`);
      const sub = spec === true ? {} : (spec as Row);
      if (def.many) {
        let list = rows(def.model).filter((r) => r[def.fk] === row.id);
        list = sortRows(list, sub.orderBy);
        if (sub.take) list = list.slice(0, sub.take);
        out[rel] = list.map((r) => hydrate(def.model, r, sub.include));
      } else {
        const target = rows(def.model).find((r) => r.id === row[def.fk]);
        out[rel] = target ? hydrate(def.model, target, sub.include) : null;
      }
    }
    return out;
  };

  const sortRows = (list: Row[], orderBy?: Row) => {
    if (!orderBy) return [...list];
    const [field, dir] = Object.entries(orderBy)[0] as [string, string];
    return [...list].sort((a, b) => {
      const av = a[field] instanceof Date ? a[field].getTime() : a[field];
      const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
      return (av < bv ? -1 : av > bv ? 1 : 0) * (dir === 'desc' ? -1 : 1);
    });
  };

  const delegate = (model: string) => ({
    async create({ data, include }: { data: Row; include?: Row }) {
      writes.push({ model, op: 'create' });
      counter += 1;
      const row: Row = {
        ...(DEFAULTS[model]?.() ?? {}),
        id: `${model}-${counter}`,
        createdAt: new Date(BASE + counter),
        updatedAt: new Date(BASE + counter),
        ...data,
      };
      for (const cols of UNIQUES[model] ?? []) {
        if (cols.some((c) => row[c] === undefined || row[c] === null)) continue; // NULLs never collide
        if (rows(model).some((r) => cols.every((c) => r[c] === row[c]))) {
          writes.pop();
          throw Object.assign(new Error(`Unique constraint failed on the fields: (${cols.join(',')})`), { code: 'P2002' });
        }
      }
      rows(model).push(row);
      return hydrate(model, row, include);
    },
    async findUnique({ where, include }: { where: Row; include?: Row }) {
      const row = rows(model).find((r) => matches(r, where));
      return row ? hydrate(model, row, include) : null;
    },
    async findFirst({ where, orderBy, include }: { where?: Row; orderBy?: Row; include?: Row } = {}) {
      const row = sortRows(rows(model).filter((r) => matches(r, where)), orderBy)[0];
      return row ? hydrate(model, row, include) : null;
    },
    async findMany({ where, orderBy, take, include }: { where?: Row; orderBy?: Row; take?: number; include?: Row } = {}) {
      let list = sortRows(rows(model).filter((r) => matches(r, where)), orderBy);
      if (take) list = list.slice(0, take);
      return list.map((r) => hydrate(model, r, include));
    },
    async update({ where, data, include }: { where: Row; data: Row; include?: Row }) {
      writes.push({ model, op: 'update' });
      const row = rows(model).find((r) => matches(r, where));
      if (!row) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
      Object.assign(row, data, { updatedAt: new Date() });
      return hydrate(model, row, include);
    },
    async updateMany({ where, data }: { where?: Row; data: Row }) {
      writes.push({ model, op: 'updateMany' });
      const hit = rows(model).filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data, { updatedAt: new Date() }));
      return { count: hit.length };
    },
    async deleteMany({ where }: { where?: Row } = {}) {
      writes.push({ model, op: 'deleteMany' });
      const before = rows(model).length;
      store.set(model, rows(model).filter((r) => !matches(r, where)));
      return { count: before - rows(model).length };
    },
    async count({ where }: { where?: Row } = {}) {
      return rows(model).filter((r) => matches(r, where)).length;
    },
  });

  const client: any = {};
  for (const m of MODELS) client[m] = delegate(m);
  client.$queryRaw = async () => [{ 1: 1 }];
  client.$disconnect = async () => {};
  // Interactive transaction with rollback-on-throw (snapshot restore).
  client.$transaction = async (fn: (tx: any) => Promise<any>) => {
    const snapshot = structuredClone(store);
    try {
      return await fn(client);
    } catch (err) {
      store = snapshot;
      throw err;
    }
  };

  return {
    client,
    writes,
    reset() {
      store = new Map();
      counter = 0;
      writes.length = 0;
    },
    all: (model: string) => rows(model),
  };
}
