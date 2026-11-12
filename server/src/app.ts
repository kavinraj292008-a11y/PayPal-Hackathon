
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { v1Router } from './routes/v1';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { roleContext } from './middleware/roleContext';

export function createApp() {
  const app = express();

  app.use(helmet());

  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-demo-role'],
  }));

  app.use(express.json({ limit: '256kb' }));

  app.use('/api/v1', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 150,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }));

  app.use(roleContext);

  app.use('/api/v1', v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
