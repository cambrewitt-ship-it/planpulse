import { createClient } from '@supabase/supabase-js';
import { PlanId, PLANS } from './stripe';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: PlanId;
  billing_period: 'monthly' | 'annual' | null;
  status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing';
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data as Subscription | null;
}

export async function getUserPlan(userId: string): Promise<PlanId> {
  const sub = await getUserSubscription(userId);
  if (!sub) return 'free';
  if (sub.status !== 'active' && sub.status !== 'trialing') return 'free';
  return sub.plan ?? 'free';
}

export function getPlanLimits(planId: PlanId) {
  return {
    maxClients: PLANS[planId].maxClients,
    maxUsers: PLANS[planId].maxUsers,
  };
}
