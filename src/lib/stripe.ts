import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiVersion: '2026-05-27.dahlia' as any,
});

export type PlanId = 'free' | 'starter' | 'growth' | 'agency';
export type BillingPeriod = 'monthly' | 'annual';

export const PLANS: Record<
  PlanId,
  {
    name: string;
    monthlyPrice: number | null;
    annualPrice: number | null;
    maxClients: number | null;
    maxUsers: number;
    stripePriceIds: { monthly: string | null; annual: string | null };
  }
> = {
  free: {
    name: 'Free',
    monthlyPrice: null,
    annualPrice: null,
    maxClients: 1,
    maxUsers: 1,
    stripePriceIds: { monthly: null, annual: null },
  },
  starter: {
    name: 'Starter',
    monthlyPrice: 99,
    annualPrice: 990,
    maxClients: 5,
    maxUsers: 2,
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? null,
      annual: process.env.STRIPE_PRICE_STARTER_ANNUAL ?? null,
    },
  },
  growth: {
    name: 'Growth',
    monthlyPrice: 249,
    annualPrice: 2490,
    maxClients: 15,
    maxUsers: 5,
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY ?? null,
      annual: process.env.STRIPE_PRICE_GROWTH_ANNUAL ?? null,
    },
  },
  agency: {
    name: 'Agency',
    monthlyPrice: 549,
    annualPrice: 5490,
    maxClients: null,
    maxUsers: 10,
    stripePriceIds: {
      monthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY ?? null,
      annual: process.env.STRIPE_PRICE_AGENCY_ANNUAL ?? null,
    },
  },
};
