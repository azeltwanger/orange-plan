import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tickers, days } = await req.json();
    
    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return Response.json({ error: 'No tickers provided' }, { status: 400 });
    }

    // Calculate date range
    const now = Math.floor(Date.now() / 1000);
    const daysNum = days === 'max' ? 3650 : parseInt(days) || 365;
    const from = now - (daysNum * 24 * 60 * 60);

    const results = {};

    // Fetch historical data for each ticker
    await Promise.all(tickers.map(async (ticker) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${from}&period2=${now}&interval=1d`;
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (!response.ok) {
          console.error(`Failed to fetch ${ticker}: ${response.status}`);
          return;
        }

        const data = await response.json();
        const result = data.chart?.result?.[0];
        
        if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
          console.error(`No data for ${ticker}`);
          return;
        }

        const timestamps = result.timestamp;
        const closes = result.indicators.quote[0].close;
        
        // Get current price from meta
        const currentPrice = result.meta?.regularMarketPrice;

        results[ticker] = {
          currentPrice,
          historical: timestamps.map((ts, i) => ({
            date: ts * 1000, // Convert to milliseconds
            price: closes[i]
          })).filter(p => p.price != null)
        };
      } catch (err) {
        console.error(`Error fetching ${ticker}:`, err);
      }
    }));

    return Response.json(results);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});