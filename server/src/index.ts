import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`🚀 ProofPay API Server running on http://localhost:${env.PORT}`);
  console.log(`   - Environment: ${env.NODE_ENV}`);
  console.log(`   - Health check: http://localhost:${env.PORT}/api/v1/health`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
