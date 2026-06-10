import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe, PLANS, PlanId, BillingPeriod } from '@/lib/stripe';
import { getUserSubscription } from '@/lib/subscriptions';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { plan, period } = await request.json() as { plan: PlanId; period: BillingPeriod };

  const planConfig = PLANS[plan];
  if (!planConfig || plan === 'free') {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const priceId = planConfig.stripePriceIds[period];
  if (!priceId) {
    return NextResponse.json({ error: 'Price not configured — add price IDs to env vars' }, { status: 500 });
  }

  const existingSub = await getUserSubscription(user.id);
  let customerId = existingSub?.stripe_customer_id ?? undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
  }

  const host = request.headers.get('host') ?? '';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `${proto}://${host}`;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/agency?subscription=success`,
    cancel_url: `${baseUrl}/pricing`,
    subscription_data: {
      metadata: { supabase_user_id: user.id, plan, period },
    },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
