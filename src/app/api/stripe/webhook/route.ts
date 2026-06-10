import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function planFromPriceId(priceId: string): string {
  const env = process.env;
  if (priceId === env.STRIPE_PRICE_STARTER_MONTHLY || priceId === env.STRIPE_PRICE_STARTER_ANNUAL) return 'starter';
  if (priceId === env.STRIPE_PRICE_GROWTH_MONTHLY || priceId === env.STRIPE_PRICE_GROWTH_ANNUAL) return 'growth';
  if (priceId === env.STRIPE_PRICE_AGENCY_MONTHLY || priceId === env.STRIPE_PRICE_AGENCY_ANNUAL) return 'agency';
  return 'free';
}

function billingPeriodFromPriceId(priceId: string): string | null {
  const env = process.env;
  const monthly = [env.STRIPE_PRICE_STARTER_MONTHLY, env.STRIPE_PRICE_GROWTH_MONTHLY, env.STRIPE_PRICE_AGENCY_MONTHLY];
  const annual = [env.STRIPE_PRICE_STARTER_ANNUAL, env.STRIPE_PRICE_GROWTH_ANNUAL, env.STRIPE_PRICE_AGENCY_ANNUAL];
  if (monthly.includes(priceId)) return 'monthly';
  if (annual.includes(priceId)) return 'annual';
  return null;
}

async function upsertSubscription(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.supabase_user_id;
  if (!userId) {
    console.error('Missing supabase_user_id in subscription metadata', subscription.id);
    return;
  }

  // current_period_end is now on SubscriptionItem in API 2026-05-27
  const item = subscription.items.data[0];
  const priceId = item?.price.id ?? '';
  const currentPeriodEnd = item?.current_period_end
    ? new Date((item.current_period_end as number) * 1000).toISOString()
    : null;

  const { error } = await supabaseAdmin.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_customer_id: subscription.customer as string,
      stripe_subscription_id: subscription.id,
      plan: planFromPriceId(priceId),
      billing_period: billingPeriodFromPriceId(priceId),
      status: subscription.status,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) console.error('Failed to upsert subscription', error);
}

async function cancelSubscription(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.supabase_user_id;
  if (!userId) return;

  const { error } = await supabaseAdmin.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_customer_id: subscription.customer as string,
      stripe_subscription_id: subscription.id,
      plan: 'free',
      billing_period: null,
      status: 'canceled',
      current_period_end: null,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) console.error('Failed to cancel subscription in DB', error);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return new Response('Server misconfiguration', { status: 500 });
  }

  if (!sig) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed', err);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await upsertSubscription(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await cancelSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error('Error processing Stripe webhook', err);
  }

  return new Response(null, { status: 200 });
}
