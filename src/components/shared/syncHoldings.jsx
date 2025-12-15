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
  console.log("=== SYNC HOLDING FROM LOTS ===");
  console.log("Ticker:", ticker);
  console.log("Account ID:", accountId);
  
  try {
    // Get all transactions
    const allTransactions = await base44.entities.Transaction.list();
    
    // Get all buy transactions for this ticker (IGNORE account_id for now)
    // This ensures we capture ALL lots for the ticker
    const lotsForTicker = allTransactions.filter(tx => 
      tx.asset_ticker === ticker && 
      tx.type === 'buy'
    );
    
    console.log("Found lots for", ticker + ":", lotsForTicker.length);
    
    // Calculate total remaining quantity from all lots
    const totalFromLots = lotsForTicker.reduce((sum, lot) => {
      const qty = lot.remaining_quantity ?? lot.quantity ?? 0;
      return sum + qty;
    }, 0);
    
    console.log("Total from lots:", totalFromLots);
    
    // Get all holdings for this ticker
    const allHoldings = await base44.entities.Holding.list();
    const holdingsForTicker = allHoldings.filter(h => h.ticker === ticker);
    
    console.log("Found holdings for", ticker + ":", holdingsForTicker.length);
    
    // Sum current holdings
    const totalFromHoldings = holdingsForTicker.reduce((sum, h) => sum + (h.quantity || 0), 0);
    console.log("Current total in holdings:", totalFromHoldings);
    
    // If there's a mismatch, update holdings
    const diff = Math.abs(totalFromLots - totalFromHoldings);
    if (diff > 0.00000001) {
      console.log("MISMATCH DETECTED - Updating holdings...");
      
      if (holdingsForTicker.length === 1) {
        // Simple case: one holding, update it
        await base44.entities.Holding.update(holdingsForTicker[0].id, {
          quantity: totalFromLots
        });
        console.log("Updated single holding to:", totalFromLots);
        
      } else if (holdingsForTicker.length > 1) {
        // Multiple holdings: set first one to total, zero out others
        // (or implement smarter distribution by account_id if needed)
        await base44.entities.Holding.update(holdingsForTicker[0].id, {
          quantity: totalFromLots
        });
        for (let i = 1; i < holdingsForTicker.length; i++) {
          await base44.entities.Holding.update(holdingsForTicker[i].id, {
            quantity: 0
          });
        }
        console.log("Updated first holding to:", totalFromLots, "zeroed others");
        
      } else {
        // No holdings exist - create one
        console.log("No holding found, creating new one");
        await base44.entities.Holding.create({
          ticker: ticker,
          quantity: totalFromLots,
          account_id: accountId
        });
      }
    } else {
      console.log("Holdings already in sync");
    }
    
    console.log("=== SYNC COMPLETE ===\n");
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