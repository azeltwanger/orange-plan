import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import Stripe from 'npm:stripe@17.5.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  
  if (!signature) {
    return Response.json({ error: 'No signature' }, { status: 400 });
  }

  let event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return Response.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  const base44 = createClientFromRequest(req);

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        
        // Find user by stripe_customer_id
        const users = await base44.asServiceRole.entities.User.filter({ 
          stripe_customer_id: customerId 
        });
        
        if (users.length > 0) {
          const user = users[0];
          await base44.asServiceRole.entities.User.update(user.id, {
            subscription_status: subscription.status,
            subscription_id: subscription.id,
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        
        const users = await base44.asServiceRole.entities.User.filter({ 
          stripe_customer_id: customerId 
        });
        
        if (users.length > 0) {
          const user = users[0];
          await base44.asServiceRole.entities.User.update(user.id, {
            subscription_status: 'canceled',
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        
        const users = await base44.asServiceRole.entities.User.filter({ 
          stripe_customer_id: customerId 
        });
        
        if (users.length > 0) {
          const user = users[0];
          await base44.asServiceRole.entities.User.update(user.id, {
            subscription_status: 'past_due',
          });
        }
        break;
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});