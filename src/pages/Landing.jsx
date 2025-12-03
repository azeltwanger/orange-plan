import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { 
  TrendingUp, 
  Shield, 
  Target, 
  PieChart, 
  ArrowRight, 
  CheckCircle,
  Zap,
  BarChart3,
  Calculator,
  Wallet,
  LineChart,
  Lock
} from 'lucide-react';
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: PieChart,
    title: 'Net Worth Tracking',
    description: 'Unified view of crypto, stocks, real estate, and retirement accounts.'
  },
  {
    icon: Target,
    title: 'Retirement Modeling',
    description: 'Monte Carlo simulations with multiple withdrawal strategies.'
  },
  {
    icon: Calculator,
    title: 'Tax Optimization',
    description: 'FIFO, LIFO, HIFO lot selection and harvest opportunities.'
  },
  {
    icon: Wallet,
    title: 'Cash Flow',
    description: 'Income, expenses, and automatic savings calculations.'
  },
  {
    icon: BarChart3,
    title: 'DCA Planning',
    description: 'Automated investment plans with allocation strategies.'
  },
  {
    icon: Shield,
    title: 'Estate Security',
    description: 'Inheritance protocols and beneficiary management.'
  },
];

export default function Landing() {
  const [btcPrice, setBtcPrice] = useState(null);
  
  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
      .then(r => r.json())
      .then(data => setBtcPrice(data.bitcoin.usd))
      .catch(() => setBtcPrice(97000));
  }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 overflow-hidden">
      <style>{`
        .brand-gradient {
          background: linear-gradient(135deg, #F7931A 0%, #FF6B00 100%);
        }
        .brand-gradient-text {
          background: linear-gradient(135deg, #F7931A 0%, #FFB347 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-glow {
          background: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(247, 147, 26, 0.15), transparent);
        }
        .card-shine {
          background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%);
        }
      `}</style>

      {/* Ambient background */}
      <div className="fixed inset-0 hero-glow pointer-events-none" />
      
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#09090b]/60 backdrop-blur-2xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg brand-gradient flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-lg">Orange Plan</span>
          </div>
          <Link to={createPageUrl('Dashboard')}>
            <Button size="sm" className="brand-gradient text-white font-medium hover:opacity-90 shadow-lg shadow-orange-500/25">
              Open App
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 mb-8 text-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-orange-400/90">Live BTC: ${btcPrice?.toLocaleString() || '---'}</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            Financial planning for
            <br />
            <span className="brand-gradient-text">the Bitcoin standard</span>
          </h1>
          
          <p className="text-lg text-zinc-400 max-w-xl mx-auto mb-10 leading-relaxed">
            Track your net worth, model retirement scenarios, optimize taxes, 
            and secure your legacy—all in one unified dashboard.
          </p>
          
          <Link to={createPageUrl('Dashboard')}>
            <Button size="lg" className="brand-gradient text-white font-semibold hover:opacity-90 shadow-xl shadow-orange-500/30 px-8 h-12">
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>

        {/* Dashboard Preview */}
        <div className="max-w-5xl mx-auto mt-20">
          <div className="relative">
            {/* Glow effect */}
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-orange-500/20 via-orange-500/5 to-transparent blur-sm" />
            
            <div className="relative rounded-2xl border border-white/10 bg-zinc-900/80 backdrop-blur-xl overflow-hidden">
              {/* Window controls */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-black/20">
                <div className="w-3 h-3 rounded-full bg-zinc-700" />
                <div className="w-3 h-3 rounded-full bg-zinc-700" />
                <div className="w-3 h-3 rounded-full bg-zinc-700" />
                <span className="ml-4 text-xs text-zinc-600">Net Worth Dashboard</span>
              </div>
              
              <div className="p-6 md:p-8">
                {/* Stats row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Net Worth</p>
                    <p className="text-2xl font-bold brand-gradient-text">$847,290</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Bitcoin</p>
                    <p className="text-2xl font-bold text-orange-400">1.847 BTC</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Monthly Savings</p>
                    <p className="text-2xl font-bold text-emerald-400">$3,200</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Retirement</p>
                    <p className="text-2xl font-bold text-purple-400">92%</p>
                  </div>
                </div>
                
                {/* Chart placeholder */}
                <div className="h-48 rounded-xl bg-gradient-to-br from-white/[0.02] to-transparent border border-white/5 flex items-end justify-center p-4">
                  <div className="flex items-end gap-1 h-full">
                    {[40, 55, 45, 60, 75, 65, 80, 70, 85, 90, 82, 95].map((h, i) => (
                      <div 
                        key={i} 
                        className="w-6 md:w-8 rounded-t bg-gradient-to-t from-orange-500/60 to-orange-400/30"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-3">Complete financial toolkit</h2>
            <p className="text-zinc-500">Everything you need, nothing you don't.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature, i) => (
              <div 
                key={i}
                className="group p-5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-orange-500/20 hover:bg-white/[0.04] transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center mb-4 group-hover:bg-orange-500/20 transition-colors">
                  <feature.icon className="w-5 h-5 text-orange-400" />
                </div>
                <h3 className="font-semibold mb-1.5">{feature.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-4">
                Built for clarity,
                <br />
                <span className="text-zinc-500">not complexity</span>
              </h2>
              <p className="text-zinc-400 mb-8 leading-relaxed">
                No spreadsheets. No manual calculations. Just a clean interface 
                that gives you actionable insights about your financial future.
              </p>
              
              <div className="space-y-3">
                {[
                  'Automatic transaction → holdings sync',
                  'Tax lot tracking with optimal selection',
                  'Monte Carlo retirement simulations',
                  'Multi-account type support (401k, IRA, taxable)',
                  'Real-time price updates',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-orange-400 flex-shrink-0" />
                    <span className="text-sm text-zinc-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 bg-orange-500/5 rounded-2xl blur-3xl" />
              <div className="relative space-y-3">
                {[
                  { icon: TrendingUp, label: 'Projection Success', value: '94%', color: 'emerald' },
                  { icon: Calculator, label: 'Tax Saved (YTD)', value: '$4,280', color: 'orange' },
                  { icon: Lock, label: 'Security Score', value: '9.2', color: 'purple' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg bg-${item.color}-500/10 flex items-center justify-center`}>
                        <item.icon className={`w-4 h-4 text-${item.color}-400`} />
                      </div>
                      <span className="text-sm text-zinc-400">{item.label}</span>
                    </div>
                    <span className={`text-lg font-semibold text-${item.color}-400`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <div className="p-10 rounded-2xl bg-gradient-to-b from-orange-500/10 to-transparent border border-orange-500/10">
            <h2 className="text-2xl font-bold mb-3">Ready to take control?</h2>
            <p className="text-zinc-500 mb-8">
              Start tracking your wealth in minutes.
            </p>
            <Link to={createPageUrl('Dashboard')}>
              <Button size="lg" className="brand-gradient text-white font-semibold hover:opacity-90 shadow-xl shadow-orange-500/30 px-8">
                Open Dashboard
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md brand-gradient flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-medium text-zinc-400">Orange Plan</span>
          </div>
          <p className="text-xs text-zinc-600">© 2024</p>
        </div>
      </footer>
    </div>
  );
}