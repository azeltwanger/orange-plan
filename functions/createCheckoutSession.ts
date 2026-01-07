import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

// Price IDs that are one-time payments (not subscriptions)
const ONE_TIME_PRICE_IDS = ['price_1Sn2QpC0uFkeocVNM294BaeJ'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { priceId } = await req.json();

    if (!priceId) {
      return Response.json({ error: 'Price ID is required' }, { status: 400 });
    }

    // Determine if this is a one-time payment or subscription
    const isOneTime = ONE_TIME_PRICE_IDS.includes(priceId);

    // Create checkout session with user ID in metadata
    const sessionConfig = {
      mode: isOneTime ? 'payment' : 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        base44_user_id: user.id,
      },
      success_url: `${req.headers.get('origin')}/Dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get('origin')}/Dashboard`,
    };

    // Add customer email for better UX
    sessionConfig.customer_email = user.email;

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return Response.json({ url: session.url });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});