process.env.NODE_ENV = 'test';
import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app';

describe('ProofPay Core Endpoints Test Suite', () => {
  const app = createApp();

  it('GET /api/v1/health should return status 200 and HEALTHY', async () => {
    const res = await request(app).get('/api/v1/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'HEALTHY');
    assert.equal(res.body.service, 'ProofPay API Engine');
    assert.ok(res.body.paymentProviderMode);
    assert.equal(res.body.database, 'CONNECTED');
  });

  it('GET /api/v1/demo/users should respond with seeded demo accounts', async () => {
    const res = await request(app).get('/api/v1/demo/users');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.users));
    assert.equal(res.body.users.length >= 2, true);
    const client = res.body.users.find((u: any) => u.role === 'CLIENT');
    assert.ok(client);
    assert.equal(client.name, 'Elena Vance');
  });

  it('GET /api/v1/projects should return projects list with stats', async () => {
    const res = await request(app).get('/api/v1/projects').set('x-demo-role', 'CLIENT');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.projects));
    assert.equal(res.body.projects.length >= 1, true);
    const proj = res.body.projects[0];
    assert.ok(proj.title);
    assert.ok(proj.stats);
    assert.equal(typeof proj.stats.totalMilestones, 'number');
  });

  it('GET /api/v1/projects/:id should return single project details', async () => {
    const listRes = await request(app).get('/api/v1/projects').set('x-demo-role', 'CLIENT');
    const firstProj = listRes.body.projects[0];
    const res = await request(app).get(`/api/v1/projects/${firstProj.id}`).set('x-demo-role', 'CLIENT');
    assert.equal(res.status, 200);
    assert.equal(res.body.project.id, firstProj.id);
    assert.ok(Array.isArray(res.body.project.milestones));
  });

  it('POST /api/v1/projects should validate and create a new project with milestones', async () => {
    const newProj = {
      title: 'Automated Treasury Management Service',
      description: 'End-to-end treasury balance tracking with liquidity anomaly detection.',
      totalBudget: 4500,
      currency: 'USD',
      milestones: [
        {
          title: 'Bank Feed Connector',
          description: 'OAuth2 direct integration with Open Banking APIs.',
          amount: 2000,
          currency: 'USD',
          acceptanceCriteria: ['Passes sandbox mock webhook tests', 'Idempotent storage'],
        },
        {
          title: 'Liquidity Dashboard',
          description: 'Real-time charts and export reporting.',
          amount: 2500,
          currency: 'USD',
          acceptanceCriteria: ['Responsive layout', 'Export to CSV and PDF'],
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/projects')
      .set('x-demo-role', 'CLIENT')
      .send(newProj);

    assert.equal(res.status, 201);
    assert.ok(res.body.project);
    assert.equal(res.body.project.title, newProj.title);
    assert.equal(res.body.project.milestones.length, 2);
  });
});
