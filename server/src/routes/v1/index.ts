import { Router } from 'express';
import { healthRouter } from './health.routes';
import { demoRouter } from './demo.routes';
import { projectRouter } from './project.routes';
import { milestoneRouter } from './milestone.routes';
import { aiRouter } from './ai.routes';
import { submissionRouter } from './submission.routes';
import { paymentRouter } from './payment.routes';

export const v1Router = Router();

v1Router.use('/health', healthRouter);
v1Router.use('/demo', demoRouter);
v1Router.use('/projects', projectRouter);
v1Router.use('/milestones', milestoneRouter);
v1Router.use('/ai', aiRouter);
v1Router.use('/', submissionRouter);
v1Router.use('/payments', paymentRouter);