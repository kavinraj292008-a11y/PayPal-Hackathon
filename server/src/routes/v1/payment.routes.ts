
import { Router } from 'express';
import { prisma } from '../../db';
import { requireDemoRole } from '../../middleware/roleContext';
import { assertProjectParty } from '../../domain/access';
import { HttpError } from '../../errors';
import {
  createPayPalOrder,
  getPayPalOrder,
  authorizePayPalOrder,
  capturePayPalAuthorization,
} from '../../services/paypal.service';

export const paymentRouter = Router();

paymentRouter.use(requireDemoRole('CLIENT'));

function ensurePayPalConfigured() {
  if (
    !process.env.PAYPAL_CLIENT_ID ||
    !process.env.PAYPAL_CLIENT_SECRET ||
    process.env.PAYPAL_ENVIRONMENT !== 'sandbox'
  ) {
    throw new HttpError(
      503,
      'PAYPAL_NOT_CONFIGURED',
      'PayPal Sandbox credentials are not configured.',
    );
  }
}

function expectedAmount(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

// Public SDK configuration. Never expose the Client Secret.
paymentRouter.get('/config', (_req, res) => {
  const enabled = Boolean(
    process.env.PAYPAL_CLIENT_ID &&
    process.env.PAYPAL_CLIENT_SECRET &&
    process.env.PAYPAL_ENVIRONMENT === 'sandbox'
  );

  res.json({
    enabled,
    clientId: enabled ? process.env.PAYPAL_CLIENT_ID : '',
    currency: 'USD',
    environment: 'sandbox',
  });
});

// Create a PayPal order for a milestone.
paymentRouter.post('/milestones/:id/order', async (req, res, next) => {
  try {
    ensurePayPalConfigured();

    const milestone = await prisma.milestone.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    });

    if (!milestone) {
      throw new HttpError(404, 'MILESTONE_NOT_FOUND', 'Milestone not found.');
    }

    assertProjectParty(milestone.project, req.demoUser!);

    if (milestone.status !== 'AWAITING_PAYMENT_AUTH') {
      throw new HttpError(
        409,
        'INVALID_MILESTONE_STATUS',
        'This milestone is not awaiting payment authorization.',
      );
    }

    if (milestone.currency !== 'USD') {
      throw new HttpError(
        400,
        'UNSUPPORTED_PAYPAL_CURRENCY',
        'The current PayPal integration supports USD only.',
      );
    }

    if (!Number.isInteger(milestone.amountMinor) || milestone.amountMinor <= 0) {
      throw new HttpError(
        400,
        'INVALID_MILESTONE_AMOUNT',
        'The milestone amount must be a positive integer.',
      );
    }

    const existing = await prisma.paymentRecord.findFirst({
      where: {
        milestoneId: milestone.id,
        provider: 'PAYPAL',
        status: { in: ['AUTHORIZED', 'CAPTURED'] },
      },
    });

    if (existing) {
      throw new HttpError(
        409,
        'PAYMENT_ALREADY_PROCESSED',
        'A PayPal payment has already been authorized or captured for this milestone.',
      );
    }

    const order = await createPayPalOrder({
      milestoneId: milestone.id,
      description: milestone.title,
      amountMinor: milestone.amountMinor,
      currency: milestone.currency,
    });

    if (!order.id) {
      throw new HttpError(
        502,
        'PAYPAL_ORDER_CREATION_FAILED',
        'PayPal did not return a valid order ID.',
      );
    }

    const approvalUrl = order.links?.find(
      (link) => link.rel === 'approve',
    )?.href;

    if (!approvalUrl) {
      throw new HttpError(
        502,
        'PAYPAL_APPROVAL_URL_MISSING',
        'PayPal did not return an approval URL.',
      );
    }

    await prisma.paymentRecord.create({
      data: {
        milestoneId: milestone.id,
        provider: 'PAYPAL',
        orderId: order.id,
        amountMinor: milestone.amountMinor,
        currency: milestone.currency,
        status: 'CREATED',
        rawProviderMetadata: JSON.stringify(order),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.demoUser!.id,
        action: 'PAYPAL_ORDER_CREATED',
        entityType: 'PAYMENT',
        entityId: order.id,
        details: JSON.stringify({
          milestoneId: milestone.id,
          environment: 'sandbox',
        }),
      },
    });

    res.status(201).json({
      success: true,
      orderId: order.id,
      approvalUrl,
      environment: 'sandbox',
    });
  } catch (err) {
    next(err);
  }
});

// Verify buyer approval and authorize the PayPal order.
paymentRouter.post('/milestones/:id/authorize', async (req, res, next) => {
  try {
    ensurePayPalConfigured();

    const orderId = req.body?.orderId;

    if (typeof orderId !== 'string' || !orderId.trim()) {
      throw new HttpError(
        400,
        'ORDER_ID_REQUIRED',
        'A PayPal order ID is required.',
      );
    }

    const milestone = await prisma.milestone.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    });

    if (!milestone) {
      throw new HttpError(404, 'MILESTONE_NOT_FOUND', 'Milestone not found.');
    }

    assertProjectParty(milestone.project, req.demoUser!);

    if (milestone.status !== 'AWAITING_PAYMENT_AUTH') {
      throw new HttpError(
        409,
        'INVALID_MILESTONE_STATUS',
        'Milestone is not awaiting authorization.',
      );
    }

    const payment = await prisma.paymentRecord.findFirst({
      where: {
        milestoneId: milestone.id,
        orderId,
        provider: 'PAYPAL',
        status: 'CREATED',
      },
    });

    if (!payment) {
      throw new HttpError(
        404,
        'PAYMENT_NOT_FOUND',
        'Matching PayPal order not found.',
      );
    }

    const approvedOrder = await getPayPalOrder(orderId);
    const unit = approvedOrder.purchase_units?.[0];

    if (
      approvedOrder.status !== 'APPROVED' ||
      approvedOrder.intent !== 'AUTHORIZE' ||
      (unit?.reference_id !== milestone.id &&
        unit?.custom_id !== milestone.id) ||
      unit?.amount?.currency_code !== milestone.currency ||
      unit?.amount?.value !== expectedAmount(milestone.amountMinor)
    ) {
      throw new HttpError(
        409,
        'PAYPAL_ORDER_VALIDATION_FAILED',
        'PayPal approval, milestone reference, or amount did not match.',
      );
    }

    const result = await authorizePayPalOrder(orderId);
    const authorization =
      result.purchase_units?.[0]?.payments?.authorizations?.[0];

    if (
      !authorization?.id ||
      !authorization.amount ||
      authorization.amount.currency_code !== milestone.currency ||
      authorization.amount.value !== expectedAmount(milestone.amountMinor)
    ) {
      throw new HttpError(
        502,
        'PAYPAL_AUTHORIZATION_INVALID',
        'PayPal did not return a valid authorization for this milestone.',
      );
    }

    if (authorization.status !== 'CREATED') {
      throw new HttpError(
        409,
        'PAYPAL_AUTHORIZATION_NOT_CREATED',
        `PayPal authorization status: ${authorization.status}`,
      );
    }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.milestone.updateMany({
        where: {
          id: milestone.id,
          status: 'AWAITING_PAYMENT_AUTH',
        },
        data: { status: 'IN_PROGRESS' },
      });

      if (updated.count !== 1) {
        throw new HttpError(
          409,
          'MILESTONE_STATE_CONFLICT',
          'Milestone changed during authorization.',
        );
      }

      await tx.paymentRecord.update({
        where: { id: payment.id },
        data: {
          authorizationId: authorization.id,
          status: 'AUTHORIZED',
          expiresAt: authorization.expiration_time
            ? new Date(authorization.expiration_time)
            : null,
          rawProviderMetadata: JSON.stringify(result),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: req.demoUser!.id,
          action: 'FUNDS_AUTHORIZED',
          entityType: 'PAYMENT',
          entityId: payment.id,
          details: JSON.stringify({
            milestoneId: milestone.id,
            authorizationId: authorization.id,
            environment: 'sandbox',
          }),
        },
      });
    });

    res.json({
      success: true,
      milestoneId: milestone.id,
      authorizationId: authorization.id,
      status: 'AUTHORIZED',
      environment: 'sandbox',
      message: 'PayPal Sandbox payment authorized. No capture has occurred.',
    });
  } catch (err) {
    next(err);
  }
});

// Capture only after freelancer submission and explicit client approval.
paymentRouter.post('/milestones/:id/capture', async (req, res, next) => {
  try {
    ensurePayPalConfigured();

    const milestone = await prisma.milestone.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    });

    if (!milestone) {
      throw new HttpError(404, 'MILESTONE_NOT_FOUND', 'Milestone not found.');
    }

    assertProjectParty(milestone.project, req.demoUser!);

    if (!['SUBMITTED', 'AI_REVIEWED'].includes(milestone.status)) {
      throw new HttpError(
        409,
        'MILESTONE_NOT_READY',
        'The freelancer must submit the milestone before client approval and capture.',
      );
    }

    const payment = await prisma.paymentRecord.findFirst({
      where: {
        milestoneId: milestone.id,
        provider: 'PAYPAL',
        status: 'AUTHORIZED',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!payment?.authorizationId) {
      throw new HttpError(
        404,
        'AUTHORIZATION_NOT_FOUND',
        'No active PayPal authorization was found.',
      );
    }

    const result = await capturePayPalAuthorization(
      payment.authorizationId,
    );

    if (result.status !== 'COMPLETED' || !result.id) {
      throw new HttpError(
        409,
        'PAYPAL_CAPTURE_NOT_COMPLETED',
        `PayPal capture status: ${result.status}`,
      );
    }

    // Require an amount in the capture response; do not assume success
    // without verifying the amount and currency returned by PayPal.
    if (
      !result.amount ||
      result.amount.currency_code !== milestone.currency ||
      result.amount.value !== expectedAmount(milestone.amountMinor)
    ) {
      throw new HttpError(
        502,
        'PAYPAL_CAPTURE_AMOUNT_MISMATCH',
        'Captured amount or currency does not match the milestone.',
      );
    }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.milestone.updateMany({
        where: {
          id: milestone.id,
          status: milestone.status,
        },
        data: { status: 'COMPLETED' },
      });

      if (updated.count !== 1) {
        throw new HttpError(
          409,
          'MILESTONE_STATE_CONFLICT',
          'Milestone changed during capture.',
        );
      }

      await tx.paymentRecord.update({
        where: { id: payment.id },
        data: {
          captureId: result.id,
          status: 'CAPTURED',
          rawProviderMetadata: JSON.stringify(result),
        },
      });

      const nextMilestone = await tx.milestone.findFirst({
        where: {
          projectId: milestone.projectId,
          orderIndex: { gt: milestone.orderIndex },
          status: 'DRAFT',
        },
        orderBy: { orderIndex: 'asc' },
      });

      if (nextMilestone) {
        await tx.milestone.updateMany({
          where: {
            id: nextMilestone.id,
            status: 'DRAFT',
          },
          data: { status: 'AWAITING_PAYMENT_AUTH' },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: req.demoUser!.id,
          action: 'PAYMENT_CAPTURED',
          entityType: 'PAYMENT',
          entityId: payment.id,
          details: JSON.stringify({
            milestoneId: milestone.id,
            captureId: result.id,
            environment: 'sandbox',
          }),
        },
      });
    });

    res.json({
      success: true,
      milestoneId: milestone.id,
      captureId: result.id,
      status: 'CAPTURED',
      environment: 'sandbox',
    });
  } catch (err) {
    next(err);
  }
});
