import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  
  if (!code || !state) {
    return new Response('Missing code or state', { status: 400 });
  }

  let userId;
  try {
    const decoded = JSON.parse(atob(state));
    userId = decoded.userId;
  } catch {
    return new Response('Invalid state', { status: 400 });
  }

  const clientId = Deno.env.get('DISCORD_CLIENT_ID');
  const clientSecret = Deno.env.get('DISCORD_CLIENT_SECRET');
  const redirectUri = 'https://bit-planner-6c9e9213.base44.app/api/apps/692fa8fc6fdc92b66c9e9213/functions/discordCallback';
  const botToken = Deno.env.get('DISCORD_BOT_TOKEN');
  const guildId = Deno.env.get('DISCORD_SERVER_ID');
  const paidRoleId = Deno.env.get('DISCORD_PAID_ROLE_ID');

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    const tokens = await tokenResponse.json();
    
    if (!tokens.access_token) {
      return new Response('Failed to get access token', { status: 400 });
    }

    // Get Discord user info
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    
    const discordUser = await userResponse.json();
    const discordUserId = discordUser.id;

    // Add user to guild (server)
    await fetch(`https://discord.com/api/guilds/${guildId}/members/${discordUserId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_token: tokens.access_token,
      }),
    });

    // Update user record with Discord ID
    const base44 = createClientFromRequest(req);
    await base44.asServiceRole.entities.User.update(userId, {
      discordUserId: discordUserId,
      discordUsername: discordUser.username,
    });

    // Get user to check if they have paid access
    const user = await base44.asServiceRole.entities.User.get(userId);
    
    // If user has paid access, assign the role
    if (user.hasAccess || user.subscriptionStatus === 'active') {
      await fetch(`https://discord.com/api/guilds/${guildId}/members/${discordUserId}/roles/${paidRoleId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
      });
    }

    // Redirect back to app
    return Response.redirect('https://bit-planner-6c9e9213.base44.app/Settings?discord=linked', 302);
    
  } catch (error) {
    console.error('Discord OAuth error:', error);
    return new Response('OAuth failed: ' + error.message, { status: 500 });
  }
});