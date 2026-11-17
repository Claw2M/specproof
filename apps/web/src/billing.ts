import crypto from 'node:crypto';

export type BillingPlanId = 'oss' | 'team' | 'scale' | 'enterprise';
export type BillingStatus = 'active' | 'trialing' | 'past_due' | 'canceled';
export type BillingProvider = 'manual' | 'lemonsqueezy' | 'polar' | 'stripe';

export interface PlanDefinition {
  id: BillingPlanId;
  label: string;
  monthlyPriceUsd: number | null;
  maxRepos: number | null;
}

export const PLAN_CATALOG: Record<BillingPlanId, PlanDefinition> = {
  oss: {
    id: 'oss',
    label: 'OSS Core',
    monthlyPriceUsd: 0,
    maxRepos: 1,
  },
  team: {
    id: 'team',
    label: 'Team Cloud',
    monthlyPriceUsd: 29,
    maxRepos: 5,
  },
  scale: {
    id: 'scale',
    label: 'Scale',
    monthlyPriceUsd: 79,
    maxRepos: null,
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    monthlyPriceUsd: 299,
    maxRepos: null,
  },
};

export interface WorkspaceBilling {
  plan: BillingPlanId;
  status: BillingStatus;
  provider: BillingProvider;
  maxRepos: number | null;
  customerEmail: string | null;
  externalSubscriptionId: string | null;
  checkoutUrl: string | null;
  updatedAt: string;
}

export interface WebhookParseResult {
  eventName: string;
  plan: BillingPlanId;
  status: BillingStatus;
  customerEmail: string | null;
  externalSubscriptionId: string | null;
}

export type LemonSqueezyWebhookResult = WebhookParseResult;

const POLAR_MAX_SKEW_SECONDS = 300;

/**
 * Verifies Polar Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`)
 * against the unmodified raw body buffer using constant-time HMAC-SHA256 comparison.
 */
export function verifyPolarWebhookSignature(
  rawBody: Buffer,
  headers: { webhookId?: string; webhookTimestamp?: string; webhookSignature?: string },
  secret: string,
  nowMs = Date.now(),
): boolean {
  const webhookId = headers.webhookId?.trim() ?? '';
  const tsRaw = headers.webhookTimestamp?.trim() ?? '';
  const sigHeader = headers.webhookSignature?.trim() ?? '';
  if (!webhookId || !tsRaw || !sigHeader || !secret.trim()) {
    return false;
  }

  const tsSeconds = Number(tsRaw);
  if (!Number.isFinite(tsSeconds) || Math.abs(nowMs / 1000 - tsSeconds) > POLAR_MAX_SKEW_SECONDS) {
    return false;
  }

  const signedContent = `${webhookId}.${tsRaw}.${rawBody.toString('utf8')}`;
  const trimmedSecret = secret.trim();
  const candidateKeys: Buffer[] = [Buffer.from(trimmedSecret, 'utf8')];
  if (trimmedSecret.startsWith('whsec_') && trimmedSecret.length > 'whsec_'.length) {
    candidateKeys.push(Buffer.from(trimmedSecret.slice('whsec_'.length), 'base64'));
  }

  const providedSigs = sigHeader
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.startsWith('v1,'))
    .map((part) => part.slice(3));

  if (providedSigs.length === 0) {
    return false;
  }

  for (const key of candidateKeys) {
    const expectedB64 = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
    const expectedBuf = Buffer.from(expectedB64, 'utf8');
    for (const candidate of providedSigs) {
      const suppliedBuf = Buffer.from(candidate, 'utf8');
      if (suppliedBuf.length === expectedBuf.length && crypto.timingSafeEqual(suppliedBuf, expectedBuf)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Extracts normalized plan and subscription status from a Polar.sh webhook event payload.
 */
export function parsePolarWebhook(payload: unknown): WebhookParseResult {
  const obj = (payload && typeof payload === 'object' ? payload : {}) as {
    type?: string;
    data?: {
      id?: string;
      subscription_id?: string | null;
      status?: string;
      customer_email?: string;
      customer?: { email?: string };
      metadata?: { plan?: string };
      product?: { name?: string; metadata?: { plan?: string } };
    };
  };

  const eventName = String(obj.type ?? 'unknown');
  const data = obj.data ?? {};
  const planHint =
    data.metadata?.plan ?? data.product?.metadata?.plan ?? data.product?.name ?? '';
  const isRevoked =
    eventName === 'subscription.revoked' ||
    eventName === 'subscription.canceled' ||
    String(data.status ?? '').toLowerCase() === 'revoked';
  const status = mapSubscriptionStatus(eventName, isRevoked ? 'canceled' : data.status);
  const plan = eventName === 'subscription.revoked' ? 'oss' : normalizePlanSlug(planHint);

  return {
    eventName,
    plan,
    status,
    customerEmail: data.customer?.email
      ? String(data.customer.email).trim()
      : data.customer_email
        ? String(data.customer_email).trim()
        : null,
    externalSubscriptionId: data.subscription_id
      ? String(data.subscription_id)
      : data.id
        ? String(data.id)
        : null,
  };
}

/**
 * Verifies a Lemon Squeezy webhook HMAC-SHA256 hex signature header (`X-Signature`).
 */
export function verifyLemonSqueezySignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
): boolean {
  const trimmed = signatureHeader.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(trimmed)) {
    return false;
  }
  const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(trimmed, 'hex'), Buffer.from(expectedHex, 'hex'));
}

function normalizePlanSlug(raw: unknown): BillingPlanId {
  const value = String(raw ?? '').toLowerCase();
  if (value.includes('enterprise')) return 'enterprise';
  if (value.includes('scale')) return 'scale';
  if (value.includes('team') || value.includes('pro')) return 'team';
  return 'oss';
}

function mapSubscriptionStatus(eventName: string, rawStatus?: string): BillingStatus {
  const status = String(rawStatus ?? '').toLowerCase();
  if (
    eventName === 'subscription_cancelled' ||
    eventName === 'subscription_expired' ||
    eventName === 'subscription.canceled' ||
    eventName === 'subscription.revoked' ||
    status === 'cancelled' ||
    status === 'canceled' ||
    status === 'expired' ||
    status === 'revoked'
  ) {
    return 'canceled';
  }
  if (status === 'past_due' || status === 'unpaid') {
    return 'past_due';
  }
  if (status === 'on_trial' || status === 'trialing') {
    return 'trialing';
  }
  return 'active';
}

/**
 * Extracts normalized plan and subscription status from a Lemon Squeezy webhook payload.
 */
export function parseLemonSqueezyWebhook(payload: unknown): WebhookParseResult {
  const obj = (payload && typeof payload === 'object' ? payload : {}) as {
    meta?: {
      event_name?: string;
      custom_data?: { plan?: string };
    };
    data?: {
      id?: string | number;
      attributes?: {
        status?: string;
        user_email?: string;
        variant_name?: string;
        product_name?: string;
      };
    };
  };

  const eventName = String(obj.meta?.event_name ?? 'unknown');
  const attrs = obj.data?.attributes ?? {};
  const planHint = obj.meta?.custom_data?.plan ?? attrs.variant_name ?? attrs.product_name ?? '';
  const status = mapSubscriptionStatus(eventName, attrs.status);
  const plan = eventName === 'subscription_expired' ? 'oss' : normalizePlanSlug(planHint);

  return {
    eventName,
    plan,
    status,
    customerEmail: attrs.user_email ? String(attrs.user_email).trim() : null,
    externalSubscriptionId: obj.data?.id != null ? String(obj.data.id) : null,
  };
}
