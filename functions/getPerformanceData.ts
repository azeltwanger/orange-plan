import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

const COINGECKO_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  AVAX: 'avalanche-2',
  MATIC: 'matic-network',
  LINK: 'chainlink',
  LTC: 'litecoin',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  XLM: 'stellar',
  ALGO: 'algorand',
};

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

    // Get unique crypto tickers
    const tickerSet = new Set();
    holdings.forEach(h => h.ticker && tickerSet.add(h.ticker));
    transactions.forEach(t => t.asset_ticker && tickerSet.add(t.asset_ticker));
    
    const cryptoTickers = [...tickerSet].filter(t => COINGECKO_IDS[t]);
    const stockTickers = [...tickerSet].filter(t => !COINGECKO_IDS[t] && t !== 'USD' && t !== 'CASH');

    // Fetch current prices for crypto
    const currentPrices = {};
    if (cryptoTickers.length > 0) {
      try {
        const ids = cryptoTickers.map(t => COINGECKO_IDS[t]).join(',');
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
        const data = await response.json();
        
        for (const ticker of cryptoTickers) {
          const id = COINGECKO_IDS[ticker];
          if (data[id]?.usd) {
            currentPrices[ticker] = data[id].usd;
          }
        }
      } catch (err) {
        console.error('Failed to fetch current prices:', err);
      }
    }

    // Fetch historical prices for crypto (1 year default)
    const historicalPrices = {};
    const pricePromises = cryptoTickers.map(async (ticker) => {
      try {
        const id = COINGECKO_IDS[ticker];
        if (!id) return;
        
        const response = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365`);
        if (!response.ok) return;
        
        const data = await response.json();
        if (data.prices && data.prices.length > 0) {
          historicalPrices[ticker] = data.prices.map(([timestamp, price]) => ({
            date: new Date(timestamp).toISOString(),
            price
          }));
        }
      } catch (err) {
        console.error(`Failed to fetch historical prices for ${ticker}:`, err);
      }
    });

    // Fetch all historical prices in parallel
    await Promise.all(pricePromises);

    return Response.json({
      holdings,
      transactions,
      accounts,
      currentPrices,
      historicalPrices,
      cryptoTickers,
      stockTickers,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});