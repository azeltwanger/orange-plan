import { base44 } from '@/api/base44Client';

/**
 * CENTRALIZED HOLDINGS SYNC UTILITY
 * 
 * CORE PRINCIPLE:
 * - Tax lots (buy transactions) are the SOURCE OF TRUTH
 * - Holdings are DERIVED from lots (calculated, not independently stored)
 * - After ANY change to lots/transactions, holdings MUST recalculate
 * 
 * This function should be called after:
 * 1. Recording a sale
 * 2. Recording a buy
 * 3. CSV import
 * 4. Deleting a transaction
 * 5. Editing a transaction
 * 6. Manual lot edits
 */

/**
 * Sync a single holding from its tax lots
 * @param {string} ticker - Asset ticker (e.g., "BTC")
 * @param {string} accountId - Account ID (REQUIRED to prevent mixing tax-free and taxable lots)
 */
export async function syncHoldingFromLots(ticker, accountId) {
  // REQUIRE account_id - don't sync without it to prevent mixing accounts
  if (!accountId) {
    console.error("❌ syncHoldingFromLots requires account_id");
    return;
  }
  
  try {
    // Get all transactions
    const allTransactions = await base44.entities.Transaction.list();
    
    // Only get lots for THIS SPECIFIC ACCOUNT
    const lotsForAccount = allTransactions.filter(tx => 
      tx.asset_ticker === ticker && 
      tx.type === 'buy' &&
      tx.account_id === accountId
    );
    
    // Calculate total remaining quantity from this account's lots only
    const totalFromLots = lotsForAccount.reduce((sum, lot) => {
      const qty = lot.remaining_quantity ?? lot.quantity ?? 0;
      return sum + qty;
    }, 0);
    
    // Get all holdings
    const allHoldings = await base44.entities.Holding.list();
    
    // Find the holding for this specific ticker AND account
    const matchingHolding = allHoldings.find(h => 
      h.ticker === ticker && h.account_id === accountId
    );
    
    if (matchingHolding) {
      const currentQty = matchingHolding.quantity || 0;
      const currentCostBasis = matchingHolding.cost_basis_total || 0;
      
      // Calculate new total cost basis from lots
      const newTotalCostBasis = lotsForAccount.reduce((sum, lot) => sum + (lot.cost_basis || 0), 0);
      
      const diffQty = Math.abs(totalFromLots - currentQty);
      const diffCostBasis = Math.abs(newTotalCostBasis - currentCostBasis);

      if (diffQty > 0.00000001 || diffCostBasis > 0.01) {
        await base44.entities.Holding.update(matchingHolding.id, {
          quantity: totalFromLots,
          cost_basis_total: newTotalCostBasis
        });
        console.log(`✅ Updated holding ${ticker}: qty=${totalFromLots}, basis=$${newTotalCostBasis}`);
      }
    } else {
      // CREATE new holding if none exists
      if (totalFromLots > 0) {
        const account = await base44.entities.Account.get(accountId);
        const newTotalCostBasis = lotsForAccount.reduce((sum, lot) => sum + (lot.cost_basis || 0), 0);
        
        await base44.entities.Holding.create({
          asset_name: ticker,
          asset_type: ticker === 'BTC' ? 'btc' : 'stocks',
          ticker: ticker,
          quantity: totalFromLots,
          cost_basis_total: newTotalCostBasis,
          current_price: 0,
          account_type: account?.account_type || 'taxable',
          tax_treatment: account?.tax_treatment || 'taxable',
          account_id: accountId,
        });
        console.log(`✅ Created new holding ${ticker}: qty=${totalFromLots}, basis=$${newTotalCostBasis}`);
      }
    }
    
    return totalFromLots;
    
  } catch (error) {
    console.error("Sync error:", error);
    throw error;
  }
}

/**
 * Sync all holdings for a specific account (useful after CSV import)
 * @param {string} accountId - Account ID (optional)
 */
export async function syncAllHoldingsForAccount(accountId = null) {
  try {
    const allTransactions = await base44.entities.Transaction.list('-date');
    const accountTransactions = allTransactions.filter(tx => {
      const txAccountId = tx.account_id || null;
      return txAccountId === accountId;
    });
    
    const tickers = [...new Set(accountTransactions.map(tx => tx.asset_ticker))];
    
    for (const ticker of tickers) {
      await syncHoldingFromLots(ticker, accountId);
    }
  } catch (error) {
    console.error("Error syncing all holdings:", error);
    throw error;
  }
}

/**
 * Sync all holdings across all accounts (nuclear option - use sparingly)
 */
export async function syncAllHoldings() {
  try {
    const allHoldings = await base44.entities.Holding.list();
    
    for (const holding of allHoldings) {
      if (holding.ticker && holding.account_id) {
        await syncHoldingFromLots(holding.ticker, holding.account_id);
      }
    }
  } catch (error) {
    console.error("Error syncing all holdings:", error);
    throw error;
  }
}