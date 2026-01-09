import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import Stripe from 'npm:stripe@17.5.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check both possible field names for Stripe customer ID
    const stripeCustomerId = user.stripe_customer_id || user.stripeCustomerId;

    if (!stripeCustomerId) {
      return Response.json({ error: 'No subscription found. Please subscribe first.' }, { status: 400 });
    }

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${req.headers.get('origin')}/Settings`,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error('Billing portal error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});