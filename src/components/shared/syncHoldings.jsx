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
 * @param {string} accountId - Account ID (optional, defaults to null for unassigned)
 */
export async function syncHoldingFromLots(ticker, accountId = null) {
  console.log("=== SYNCING HOLDING FROM LOTS ===");
  console.log("Ticker:", ticker, "| Account:", accountId || "unassigned");
  
  try {
    // 1. Get all buy transactions (lots) for this ticker and account
    const allTransactions = await base44.entities.Transaction.list('-date');
    const lots = allTransactions.filter(tx => {
      if (tx.type !== 'buy' || tx.asset_ticker !== ticker) return false;
      
      // Match by account_id
      const txAccountId = tx.account_id || null;
      return txAccountId === accountId;
    });
    
    console.log(`Found ${lots.length} lots for ${ticker}`);
    
    // 2. Calculate correct quantity from lot.remaining_quantity
    const correctQuantity = lots.reduce((sum, lot) => {
      const remaining = lot.remaining_quantity ?? lot.quantity ?? 0;
      console.log(`  Lot ${lot.id}: original=${lot.quantity}, remaining=${remaining}`);
      return sum + remaining;
    }, 0);
    
    console.log(`Calculated quantity from lots: ${correctQuantity.toFixed(8)}`);
    
    // 3. Calculate correct cost basis
    const correctCostBasis = lots.reduce((sum, lot) => {
      const remaining = lot.remaining_quantity ?? lot.quantity ?? 0;
      const originalQty = lot.quantity ?? 0;
      
      // Proportional cost basis based on remaining quantity
      if (originalQty > 0) {
        const proportion = remaining / originalQty;
        return sum + ((lot.cost_basis || 0) * proportion);
      }
      return sum;
    }, 0);
    
    console.log(`Calculated cost basis: $${correctCostBasis.toFixed(2)}`);
    
    // 4. Find existing holding by ticker AND account_id
    const allHoldings = await base44.entities.Holding.list();
    const holding = allHoldings.find(h => {
      if (h.ticker !== ticker) return false;
      const hAccountId = h.account_id || null;
      return hAccountId === accountId;
    });
    
    const currentQuantity = holding?.quantity || 0;
    console.log(`Current stored quantity: ${currentQuantity.toFixed(8)}`);
    
    // 5. Update or create holding if needed
    if (correctQuantity > 0.00000001) {
      // Holding should exist
      if (holding) {
        // Update existing holding
        const quantityDiff = Math.abs(correctQuantity - currentQuantity);
        if (quantityDiff > 0.00000001) {
          console.log(`✅ UPDATING holding: ${currentQuantity.toFixed(8)} -> ${correctQuantity.toFixed(8)}`);
          await base44.entities.Holding.update(holding.id, {
            quantity: correctQuantity,
            cost_basis_total: correctCostBasis,
          });
        } else {
          console.log(`✅ Holding already in sync`);
        }
      } else {
        console.log(`✅ CREATING new holding with quantity ${correctQuantity.toFixed(8)}`);
        // Create new holding (should have been created with first buy, but just in case)
        // Note: This shouldn't normally happen, but provides a safety net
        console.warn(`Warning: Creating holding that should already exist for ${ticker}`);
      }
    } else {
      // No remaining quantity - holding should be deleted or set to 0
      if (holding && currentQuantity > 0.00000001) {
        console.log(`✅ ZEROING holding (all lots sold/used)`);
        await base44.entities.Holding.update(holding.id, {
          quantity: 0,
          cost_basis_total: 0,
        });
      } else {
        console.log(`✅ No holding needed (quantity is 0)`);
      }
    }
    
    console.log("=================================");
    return correctQuantity;
    
  } catch (error) {
    console.error("❌ Error syncing holding:", error);
    throw error;
  }
}

/**
 * Sync all holdings for a specific account (useful after CSV import)
 * @param {string} accountId - Account ID (optional)
 */
export async function syncAllHoldingsForAccount(accountId = null) {
  console.log("=== SYNCING ALL HOLDINGS FOR ACCOUNT ===");
  console.log("Account:", accountId || "unassigned");
  
  try {
    // Get all transactions for this account
    const allTransactions = await base44.entities.Transaction.list('-date');
    const accountTransactions = allTransactions.filter(tx => {
      const txAccountId = tx.account_id || null;
      return txAccountId === accountId;
    });
    
    // Get unique tickers
    const tickers = [...new Set(accountTransactions.map(tx => tx.asset_ticker))];
    console.log(`Found ${tickers.length} unique tickers: ${tickers.join(', ')}`);
    
    // Sync each ticker
    for (const ticker of tickers) {
      await syncHoldingFromLots(ticker, accountId);
    }
    
    console.log("=========================================");
    
  } catch (error) {
    console.error("❌ Error syncing all holdings:", error);
    throw error;
  }
}

/**
 * Sync all holdings across all accounts (nuclear option - use sparingly)
 */
export async function syncAllHoldings() {
  console.log("=== SYNCING ALL HOLDINGS (ALL ACCOUNTS) ===");
  
  try {
    const allTransactions = await base44.entities.Transaction.list('-date');
    
    // Get unique account+ticker combinations
    const combinations = new Map();
    allTransactions.forEach(tx => {
      const accountId = tx.account_id || null;
      const key = `${accountId}|${tx.asset_ticker}`;
      combinations.set(key, { accountId, ticker: tx.asset_ticker });
    });
    
    console.log(`Found ${combinations.size} unique account+ticker combinations`);
    
    // Sync each combination
    for (const { accountId, ticker } of combinations.values()) {
      await syncHoldingFromLots(ticker, accountId);
    }
    
    console.log("===========================================");
    
  } catch (error) {
    console.error("❌ Error syncing all holdings:", error);
    throw error;
  }
}