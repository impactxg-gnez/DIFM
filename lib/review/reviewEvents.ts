interface ReviewRequiredCreatedPayload {
  visit_id: string;
  job_id: string;
  capability: string;
  calculated_time: number;
  ladder_max_time: number;
  overflow_delta: number;
  selected_clarifiers: string[];
  reviewPriority: 'LOW' | 'MEDIUM' | 'HIGH';
  slaDeadline: string;
  created_at: string;
}

interface ReviewEventDeliveryResult {
  internalEventEmitted: boolean;
  webhookDelivered: boolean;
  adminNotificationQueued: boolean;
  whatsappNotificationQueued: boolean;
  emailNotificationQueued: boolean;
}

export async function emitReviewRequiredCreated(
  payload: ReviewRequiredCreatedPayload
): Promise<ReviewEventDeliveryResult> {
  const envelope = {
    event: 'REVIEW_REQUIRED_CREATED',
    occurred_at: new Date().toISOString(),
    payload,
  };

  // Internal event bus placeholder
  console.log('[ReviewEventBus]', envelope);

  // Webhook integration placeholder
  const reviewWebhookUrl = process.env.REVIEW_EVENTS_WEBHOOK_URL;
  let webhookDelivered = false;
  if (reviewWebhookUrl) {
    try {
      const response = await fetch(reviewWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      });
      webhookDelivered = response.ok;
    } catch (error) {
      console.error('[ReviewEventBus] webhook delivery failed', error);
    }
  }

  // Required admin notification placeholder
  const adminNotificationQueued = true;
  console.log('[ReviewNotification][ADMIN]', {
    event: 'REVIEW_REQUIRED_CREATED',
    visit_id: payload.visit_id,
    job_id: payload.job_id,
    reviewPriority: payload.reviewPriority,
  });

  // Optional channel placeholders (configurable)
  const whatsappNotificationQueued = process.env.ENABLE_REVIEW_WHATSAPP_NOTIFICATIONS === 'true';
  if (whatsappNotificationQueued) {
    console.log('[ReviewNotification][WHATSAPP]', {
      visit_id: payload.visit_id,
      job_id: payload.job_id,
    });
  }

  const emailNotificationQueued = process.env.ENABLE_REVIEW_EMAIL_NOTIFICATIONS === 'true';
  if (emailNotificationQueued) {
    console.log('[ReviewNotification][EMAIL]', {
      visit_id: payload.visit_id,
      job_id: payload.job_id,
    });
  }

  return {
    internalEventEmitted: true,
    webhookDelivered,
    adminNotificationQueued,
    whatsappNotificationQueued,
    emailNotificationQueued,
  };
}
