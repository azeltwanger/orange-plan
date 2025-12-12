import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await response.json();
      
      // Convert rates to "foreign currency -> USD" format
      const toUSD = {};
      for (const [currency, rate] of Object.entries(data.rates)) {
        toUSD[currency] = 1 / rate;
      }
      toUSD['USD'] = 1;
      
      return Response.json({ rates: toUSD, updated: data.date });
    } catch (error) {
      // Fallback rates if API fails
      return Response.json({ 
        rates: { USD: 1, JPY: 0.0067, EUR: 1.08, GBP: 1.27, HKD: 0.13, CAD: 0.74, AUD: 0.65, CHF: 1.12, CNY: 0.14 },
        updated: null,
        fallback: true
      });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});