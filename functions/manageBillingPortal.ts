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

    if (!user.stripe_customer_id) {
      return Response.json({ error: 'No subscription found' }, { status: 400 });
    }

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${req.headers.get('origin')}/settings`,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error('Billing portal error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});