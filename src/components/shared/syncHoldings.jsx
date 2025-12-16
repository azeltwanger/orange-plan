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
  console.log("=== SYNC HOLDING FROM LOTS ===");
  console.log("Ticker:", ticker);
  console.log("Account ID:", accountId);
  
  // REQUIRE account_id - don't sync without it to prevent mixing accounts
  if (!accountId) {
    console.error("❌ syncHoldingFromLots requires account_id to prevent mixing tax-free and taxable lots");
    return;
  }
  
  try {
    // Get all transactions
    const allTransactions = await base44.entities.Transaction.list();
    
    // CRITICAL FIX: Only get lots for THIS SPECIFIC ACCOUNT
    // This prevents mixing taxable and tax-free (Roth IRA) lots
    const lotsForAccount = allTransactions.filter(tx => 
      tx.asset_ticker === ticker && 
      tx.type === 'buy' &&
      tx.account_id === accountId  // CRITICAL: Must match account
    );
    
    console.log(`Found lots for ${ticker} in account ${accountId}:`, lotsForAccount.length);
    
    // Calculate total remaining quantity from this account's lots only
    const totalFromLots = lotsForAccount.reduce((sum, lot) => {
      const qty = lot.remaining_quantity ?? lot.quantity ?? 0;
      return sum + qty;
    }, 0);
    
    console.log("Total from lots:", totalFromLots);
    
    // Get all holdings
    const allHoldings = await base44.entities.Holding.list();
    
    // Find the holding for this specific ticker AND account
    const matchingHolding = allHoldings.find(h => 
      h.ticker === ticker && h.account_id === accountId
    );
    
    if (matchingHolding) {
      const currentQty = matchingHolding.quantity || 0;
      const diff = Math.abs(totalFromLots - currentQty);
      
      if (diff > 0.00000001) {
        console.log(`MISMATCH DETECTED - Updating ${ticker} in account ${accountId}: ${currentQty} -> ${totalFromLots}`);
        await base44.entities.Holding.update(matchingHolding.id, {
          quantity: totalFromLots
        });
        console.log("✅ Updated holding");
      } else {
        console.log("✅ Holding already in sync");
      }
    } else {
      console.log(`⚠️ No holding found for ${ticker} in account ${accountId} - skipping creation (should be created manually)`);
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
    const allHoldings = await base44.entities.Holding.list();
    
    console.log(`Found ${allHoldings.length} holdings to sync`);
    
    // Sync each holding separately by its account_id
    for (const holding of allHoldings) {
      if (holding.ticker && holding.account_id) {
        await syncHoldingFromLots(holding.ticker, holding.account_id);
      } else {
        console.log(`⚠️ Skipping holding without ticker or account_id:`, holding.id);
      }
    }
    
    console.log("===========================================");
    
  } catch (error) {
    console.error("❌ Error syncing all holdings:", error);
    throw error;
  }
}