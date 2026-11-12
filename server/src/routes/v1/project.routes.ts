import { Router } from 'express';
import { prisma } from '../../db';
import { CreateProjectSchema } from '@proofpay/shared';
import { requireDemoRole } from '../../middleware/roleContext';
import { assertProjectParty } from '../../domain/access';
import { HttpError } from '../../errors';
import { presentProject } from '../../domain/presenters';

export const projectRouter = Router();

// Every project endpoint requires an explicit, valid demo role (401/403 otherwise).
projectRouter.use(requireDemoRole());

const detailInclude = {
  client: true,
  freelancer: true,
  milestones: {
    orderBy: { orderIndex: 'asc' },
    include: {
      paymentRecords: { orderBy: { createdAt: 'desc' } },
      submissions: {
        orderBy: { createdAt: 'desc' },
        include: {
          author: true,
          aiReviews: { orderBy: { createdAt: 'desc' } },
        },
      },
    },
  },
} as const;

// GET /api/v1/projects - list projects the caller participates in
projectRouter.get('/', async (req, res, next) => {
  try {
    const user = req.demoUser!;
    const projects = await prisma.project.findMany({
      where: user.role === 'CLIENT' ? { clientId: user.id } : { freelancerId: user.id },
      include: {
        client: true,
        freelancer: true,
        milestones: {
          orderBy: { orderIndex: 'asc' },
          include: {
            paymentRecords: { orderBy: { createdAt: 'desc' } },
            submissions: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ projects: projects.map(presentProject) });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/projects/:id
projectRouter.get('/:id', async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: detailInclude as any,
    });
    if (!project) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    }
    assertProjectParty(project, req.demoUser!);
    res.json({ project: presentProject(project) });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/projects - create project with milestones (CLIENT only).
// All money/date/currency/budget validation happens in the shared schema (server-side).
projectRouter.post('/', requireDemoRole('CLIENT'), async (req, res, next) => {
  try {
    const validated = CreateProjectSchema.parse(req.body);

    // The project client is always the acting demo CLIENT (never taken from the request body).
    const clientId = req.demoUser!.id;

    // Freelancer must be an existing FREELANCER account (specified or the default demo one).
    const freelancer = validated.freelancerId
      ? await prisma.user.findFirst({ where: { id: validated.freelancerId, role: 'FREELANCER' } })
      : await prisma.user.findFirst({ where: { role: 'FREELANCER', isDemoAccount: true } });
    if (!freelancer) {
      throw new HttpError(400, 'FREELANCER_NOT_FOUND', 'The selected freelancer does not exist or is not a freelancer.');
    }

    const created = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          title: validated.title,
          description: validated.description,
          totalBudgetMinor: validated.totalBudgetMinor,
          currency: validated.currency,
          deadline: validated.deadline,
          status: 'ACTIVE',
          clientId,
          freelancerId: freelancer.id,
        },
      });

      for (let i = 0; i < validated.milestones.length; i++) {
        const m = validated.milestones[i];
        await tx.milestone.create({
          data: {
            projectId: project.id,
            orderIndex: i + 1,
            title: m.title,
            description: m.description,
            amountMinor: m.amountMinor,
            currency: m.currency,
            deadline: m.deadline,
            status: i === 0 ? 'AWAITING_PAYMENT_AUTH' : 'DRAFT',
            acceptanceCriteria: JSON.stringify(m.acceptanceCriteria),
          },
        });
      }
      return project;
    });

    const full = await prisma.project.findUnique({
      where: { id: created.id },
      include: detailInclude as any,
    });
    res.status(201).json({ project: presentProject(full) });
  } catch (err) {
    next(err);
  }
});
