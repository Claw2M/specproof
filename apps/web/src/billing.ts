import crypto from 'node:crypto';

export type BillingPlanId = 'oss' | 'team' | 'scale' | 'enterprise';
export type BillingStatus = 'active' | 'trialing' | 'past_due' | 'canceled';
export type BillingProvider = 'manual' | 'lemonsqueezy' | 'stripe';

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

export interface LemonSqueezyWebhookResult {
  eventName: string;
  plan: BillingPlanId;
  status: BillingStatus;
  customerEmail: string | null;
  externalSubscriptionId: string | null;
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

function mapLemonSqueezyStatus(eventName: string, rawStatus?: string): BillingStatus {
  const status = String(rawStatus ?? '').toLowerCase();
  if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired' || status === 'cancelled' || status === 'expired') {
    return 'canceled';
  }
  if (status === 'past_due' || status === 'unpaid') {
    return 'past_due';
  }
  if (status === 'on_trial') {
    return 'trialing';
  }
  return 'active';
}

/**
 * Extracts normalized plan and subscription status from a Lemon Squeezy webhook payload.
 */
export function parseLemonSqueezyWebhook(payload: unknown): LemonSqueezyWebhookResult {
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
  const status = mapLemonSqueezyStatus(eventName, attrs.status);
  const plan = eventName === 'subscription_expired' ? 'oss' : normalizePlanSlug(planHint);

  return {
    eventName,
    plan,
    status,
    customerEmail: attrs.user_email ? String(attrs.user_email).trim() : null,
    externalSubscriptionId: obj.data?.id != null ? String(obj.data.id) : null,
  };
}
