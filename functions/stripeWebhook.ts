import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

// Helper function to assign Discord role
async function assignDiscordRole(discordUserId) {
  const botToken = Deno.env.get('DISCORD_BOT_TOKEN');
  const guildId = Deno.env.get('DISCORD_SERVER_ID');
  const paidRoleId = Deno.env.get('DISCORD_PAID_ROLE_ID');
  
  if (discordUserId && botToken && guildId && paidRoleId) {
    try {
      await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}/roles/${paidRoleId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('Failed to assign Discord role:', error);
    }
  }
}

// Helper function to remove Discord role
async function removeDiscordRole(discordUserId) {
  const botToken = Deno.env.get('DISCORD_BOT_TOKEN');
  const guildId = Deno.env.get('DISCORD_SERVER_ID');
  const paidRoleId = Deno.env.get('DISCORD_PAID_ROLE_ID');
  
  if (discordUserId && botToken && guildId && paidRoleId) {
    try {
      await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}/roles/${paidRoleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bot ${botToken}`,
        },
      });
    } catch (error) {
      console.error('Failed to remove Discord role:', error);
    }
  }
}

Deno.serve(async (req) => {
  // Initialize base44 client first (before any async operations)
  const base44 = createClientFromRequest(req);

  const signature = req.headers.get('stripe-signature');
  
  if (!signature) {
    return Response.json({ error: 'No signature' }, { status: 400 });
  }

  let event;
  try {
    const body = await req.text();
    // Use constructEventAsync for Deno's async crypto
    event = await stripe.webhooks.constructEventAsync(
      body, 
      signature, 
      Deno.env.get('STRIPE_WEBHOOK_SECRET')
    );
  } catch (err) {
    return Response.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.base44_user_id;
        const customerId = session.customer;
        
        if (userId) {
          // Update user with access and stripe customer ID
          await base44.asServiceRole.entities.User.update(userId, {
            hasAccess: true,
            subscriptionStatus: 'active',
            stripe_customer_id: customerId,
          });
          
          // Assign Discord role if user has linked Discord
          const user = await base44.asServiceRole.entities.User.get(userId);
          if (user.discordUserId) {
            await assignDiscordRole(user.discordUserId);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        
        const users = await base44.asServiceRole.entities.User.filter({ 
          stripe_customer_id: customerId 
        });
        
        if (users.length > 0) {
          const user = users[0];
          
          // Check if subscription is set to cancel at period end
          if (subscription.cancel_at_period_end === true) {
            // User cancelled but keeps access until period ends
            await base44.asServiceRole.entities.User.update(user.id, {
              subscriptionStatus: 'cancelling',
              // Keep hasAccess: true - they still have access until period ends
            });
          } else if (subscription.status === 'active') {
            // Subscription is active (maybe they reactivated)
            await base44.asServiceRole.entities.User.update(user.id, {
              hasAccess: true,
              subscriptionStatus: 'active',
            });
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        // Fires when the subscription period actually ends
        const subscription = event.data.object;
        const customerId = subscription.customer;
        
        const users = await base44.asServiceRole.entities.User.filter({ 
          stripe_customer_id: customerId 
        });
        
        if (users.length > 0) {
          const user = users[0];
          await base44.asServiceRole.entities.User.update(user.id, {
            subscriptionStatus: 'cancelled',
            hasAccess: false,
          });
          
          // Remove Discord role
          if (user.discordUserId) {
            await removeDiscordRole(user.discordUserId);
          }
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
            subscriptionStatus: 'cancelled',
            hasAccess: false,
          });
          
          // Remove Discord role
          if (user.discordUserId) {
            await removeDiscordRole(user.discordUserId);
          }
        }
        break;
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});