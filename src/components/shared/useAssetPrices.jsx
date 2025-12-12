import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

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
        const knownCrypto = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC', 'LINK', 'LTC', 'BCH', 'ATOM', 'UNI', 'SHIB'];
        const cryptoTickers = tickers.filter(t => knownCrypto.includes(t.toUpperCase()));
        const stockTickers = tickers.filter(t => !knownCrypto.includes(t.toUpperCase()));

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

        // Fetch stock prices from Yahoo Finance backend
        if (stockTickers.length > 0) {
          try {
            const response = await base44.functions.invoke('getStockPrices', {
              tickers: stockTickers,
              days: 365
            });
            
            if (response.data) {
              for (const [ticker, data] of Object.entries(response.data)) {
                if (data.currentPrice > 0) {
                  newPrices[ticker.toUpperCase()] = {
                    price: data.currentPrice,
                    currency: data.currency || 'USD',
                    change24h: 0,
                  };
                }
              }
            }
          } catch (err) {
            console.warn('Failed to fetch stock prices:', err);
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