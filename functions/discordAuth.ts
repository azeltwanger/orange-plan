import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = Deno.env.get('DISCORD_CLIENT_ID');
  const redirectUri = 'https://bit-planner-6c9e9213.base44.app/api/apps/692fa8fc6fdc92b66c9e9213/functions/discordCallback';
  
  // State contains user ID to link after callback
  const state = btoa(JSON.stringify({ userId: user.id }));
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds.join',
    state: state,
    prompt: 'consent'
  });

  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  
  return Response.json({ url: discordAuthUrl });
});