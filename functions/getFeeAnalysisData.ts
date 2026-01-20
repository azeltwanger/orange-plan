import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch fresh data directly from database
        const transactions = await base44.entities.Transaction.list();
        const holdings = await base44.entities.Holding.list();
        
        return Response.json({ transactions, holdings });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});