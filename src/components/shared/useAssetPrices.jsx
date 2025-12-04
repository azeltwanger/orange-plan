import { useState, useEffect } from 'react';

// Fetch prices for multiple assets (BTC, stocks, etc.)
export default function useAssetPrices(tickers = []) {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        setLoading(true);
        const newPrices = {};

        // Separate crypto and stock tickers
        const cryptoTickers = tickers.filter(t => ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK'].includes(t.toUpperCase()));
        const stockTickers = tickers.filter(t => !cryptoTickers.includes(t));

        // Fetch crypto prices from CoinGecko
        if (cryptoTickers.length > 0) {
          const cryptoIdMap = {
            'BTC': 'bitcoin',
            'ETH': 'ethereum',
            'SOL': 'solana',
            'XRP': 'ripple',
            'ADA': 'cardano',
            'DOGE': 'dogecoin',
            'DOT': 'polkadot',
            'AVAX': 'avalanche-2',
            'MATIC': 'matic-network',
            'LINK': 'chainlink',
          };
          
          const ids = cryptoTickers.map(t => cryptoIdMap[t.toUpperCase()]).filter(Boolean).join(',');
          if (ids) {
            const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
            const data = await response.json();
            
            Object.entries(cryptoIdMap).forEach(([ticker, id]) => {
              if (data[id]) {
                newPrices[ticker] = {
                  price: data[id].usd,
                  change24h: data[id].usd_24h_change,
                };
              }
            });
          }
        }

        // Fetch stock prices from Yahoo Finance (via a proxy or alternative API)
        // Using finnhub.io free tier as an example - users would need to add their API key
        if (stockTickers.length > 0) {
          // For now, we'll use a simple approach with Yahoo Finance unofficial API
          for (const ticker of stockTickers) {
            try {
              const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`);
              const data = await response.json();
              
              if (data.chart?.result?.[0]) {
                const result = data.chart.result[0];
                const currentPrice = result.meta.regularMarketPrice;
                const previousClose = result.meta.previousClose || result.meta.chartPreviousClose;
                const change24h = previousClose ? ((currentPrice - previousClose) / previousClose) * 100 : 0;
                
                newPrices[ticker.toUpperCase()] = {
                  price: currentPrice,
                  change24h: change24h,
                };
              }
            } catch (err) {
              console.warn(`Failed to fetch price for ${ticker}:`, err);
            }
          }
        }

        setPrices(newPrices);
        setError(null);
      } catch (err) {
        console.error('Error fetching asset prices:', err);
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    if (tickers.length > 0) {
      fetchPrices();
      const interval = setInterval(fetchPrices, 60000); // Refresh every minute
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [tickers.join(',')]);

  return { prices, loading, error };
}