import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Only allow admin users to run this cleanup
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
        }

        const allTransactions = await base44.entities.Transaction.list();
        const softDeletedTransactions = allTransactions.filter(t => t.is_deleted === true || t.data?.is_deleted === true);

        let deletedCount = 0;
        for (const tx of softDeletedTransactions) {
            await base44.entities.Transaction.delete(tx.id);
            deletedCount++;
        }

        return Response.json({ message: `Successfully deleted ${deletedCount} soft-deleted transactions.`, deletedCount });
    } catch (error) {
        console.error('Cleanup error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});