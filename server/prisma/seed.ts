import { seedDemoData } from '../src/seed';
import { prisma } from '../src/db';

if (process.env.NODE_ENV !== 'test') {
  seedDemoData()
    .catch((err) => {
      console.error('❌ Error during seeding:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
