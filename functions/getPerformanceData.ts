import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all data in parallel
    const [holdings, transactions, accounts] = await Promise.all([
      base44.entities.Holding.list(),
      base44.entities.Transaction.list('-date'),
      base44.entities.Account.list(),
    ]);

    return Response.json({
      holdings,
      transactions,
      accounts,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});