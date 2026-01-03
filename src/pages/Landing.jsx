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
  Lock,
  Gauge,
  Scale,
  Receipt,
  LayoutDashboard,
  DollarSign,
  Briefcase,
  HeartPulse,
  PlayCircle,
  Newspaper,
  Book,
  RefreshCw,
  ArrowLeftRight,
  Flag,
  Upload,
  Building2
} from 'lucide-react';
import { Button } from "@/components/ui/button";

const whyOrangePlan = [
  {
    icon: Calculator,
    title: 'Automatic Cost Basis Tracking',
    description: 'Spreadsheets break. Tax software doesn\'t understand Bitcoin. We calculate HIFO, LIFO, and FIFO automatically—so you know your exact tax bill before you sell.'
  },
  {
    icon: Scale,
    title: 'Bitcoin-Backed Loan Modeling',
    description: 'One bad day and your collateral gets liquidated. We model real LTV thresholds and alert you before margin calls hit.'
  },
  {
    icon: Target,
    title: 'Bitcoin Retirement Simulations',
    description: 'Traditional calculators assume 7% returns. Bitcoin doesn\'t work that way. Our Monte Carlo simulations actually understand volatility.'
  }
];

const features = [
  {
    icon: Receipt,
    title: 'Tax Harvesting',
    description: 'Find losses to offset gains. Automatically.'
  },
  {
    icon: Shield,
    title: 'Estate Planning',
    description: 'Dead man\'s switch. Beneficiaries. Peace of mind.'
  },
  {
    icon: Flag,
    title: 'Goal Tracking',
    description: 'Set it. Track it. Hit it.'
  },
  {
    icon: Wallet,
    title: 'Cash Flow',
    description: 'See exactly where your money goes.'
  },
  {
    icon: TrendingUp,
    title: 'Performance',
    description: 'Track returns across every account.'
  },
  {
    icon: Upload,
    title: 'CSV Import',
    description: 'Coinbase, Kraken, Strike—imported in seconds.'
  }
];




export default function Landing() {
  const [btcPrice, setBtcPrice] = useState(null);

  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd').
    then((r) => r.json()).
    then((data) => setBtcPrice(data.bitcoin.usd)).
    catch(() => setBtcPrice(97000));
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
          background: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(247, 147, 26, 0.08), transparent);
        }
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .marquee {
          animation: scroll 30s linear infinite;
        }
        .marquee:hover {
          animation-play-state: paused;
        }
      `}</style>

      {/* Ambient background */}
      <div className="fixed inset-0 hero-glow pointer-events-none" />
      
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#09090b]/70 backdrop-blur-2xl border-b border-white/[0.03]">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl brand-gradient flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-lg tracking-tight">Orange Plan</span>
          </div>
          <div className="flex items-center gap-8">
            <Link to={createPageUrl('Features')} className="text-sm text-zinc-500 hover:text-zinc-200 transition-colors hidden sm:block font-light">
              Features
            </Link>
            <Link to={createPageUrl('Pricing')} className="text-sm text-zinc-500 hover:text-zinc-200 transition-colors hidden sm:block font-light">
              Pricing
            </Link>
            <Link to={createPageUrl('Dashboard')} className="text-sm text-zinc-500 hover:text-zinc-200 transition-colors hidden sm:block font-light">
              Sign in
            </Link>
            <Link to={createPageUrl('Dashboard')}>
              <Button size="sm" className="brand-gradient text-white font-medium hover:opacity-90 shadow-xl shadow-orange-500/20 rounded-lg px-5 h-10">
                Try for free
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-40 pb-32 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/5 border border-orange-500/10 mb-12 text-sm font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-orange-400/80">Live BTC: ${btcPrice?.toLocaleString() || '---'}</span>
          </div>
          
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-[-0.02em] leading-[0.95] mb-8">
            Stop Guessing.
            <br />
            <span className="brand-gradient-text">Start Planning.</span>
          </h1>
          
          <p className="text-xl text-zinc-500 max-w-2xl mx-auto mb-14 leading-relaxed font-light">
            Most Bitcoiners have no idea what they'll owe in taxes, when they can retire, or if their loans are safe. Orange Plan fixes that.
          </p>
          
          <Link to={createPageUrl('Dashboard')}>
            <Button size="lg" className="brand-gradient text-white font-semibold hover:opacity-90 shadow-2xl shadow-orange-500/25 px-10 h-14 text-base rounded-xl">
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>

        {/* Dashboard Preview */}
        <div className="max-w-6xl mx-auto mt-32">
          <div className="relative">
            {/* Enhanced glow effect */}
            <div className="absolute -inset-8 rounded-3xl bg-gradient-to-b from-orange-500/10 via-orange-500/5 to-transparent blur-3xl" />

            <div className="relative rounded-3xl border border-white/[0.06] bg-zinc-900/80 overflow-hidden">
              {/* Window controls */}
              <div className="flex items-center gap-2 px-5 py-4 border-b border-white/[0.03] bg-black/10">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
                <span className="ml-4 text-xs text-zinc-600 font-light">Financial Projections</span>
              </div>

              <div className="p-8 md:p-10">
                {/* Top section with chart and side panel */}
                <div className="flex gap-8 mb-8">
                  {/* Main Chart Area */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <p className="text-xs text-zinc-600 uppercase tracking-wider font-medium">Net Worth Projection</p>
                        <p className="text-3xl font-bold brand-gradient-text mt-1">$2.4M by 2045</p>
                      </div>
                      <div className="flex gap-2">
                        <span className="px-3 py-1.5 rounded-lg text-[11px] bg-orange-500/15 text-orange-400 font-medium">BTC</span>
                        <span className="px-3 py-1.5 rounded-lg text-[11px] bg-blue-500/15 text-blue-400 font-medium">Stocks</span>
                        <span className="px-3 py-1.5 rounded-lg text-[11px] bg-emerald-500/15 text-emerald-400 font-medium">401k</span>
                      </div>
                    </div>

                    {/* Realistic area chart */}
                    <div className="h-48 rounded-2xl bg-gradient-to-br from-white/[0.015] to-transparent border-0 p-5 relative overflow-hidden">
                      <svg viewBox="0 0 400 120" className="w-full h-full" preserveAspectRatio="none">
                        {/* Grid lines */}
                        <line x1="0" y1="30" x2="400" y2="30" stroke="rgba(255,255,255,0.05)" />
                        <line x1="0" y1="60" x2="400" y2="60" stroke="rgba(255,255,255,0.05)" />
                        <line x1="0" y1="90" x2="400" y2="90" stroke="rgba(255,255,255,0.05)" />

                        {/* BTC area */}
                        <path d="M0,100 Q50,95 100,85 T200,60 T300,35 T400,15 L400,120 L0,120 Z" fill="url(#orangeGradient)" />
                        <path d="M0,100 Q50,95 100,85 T200,60 T300,35 T400,15" stroke="#F7931A" strokeWidth="2" fill="none" />

                        {/* Stocks area */}
                        <path d="M0,105 Q50,102 100,95 T200,80 T300,65 T400,50 L400,120 L0,120 Z" fill="url(#blueGradient)" />

                        {/* 401k area */}
                        <path d="M0,110 Q50,108 100,102 T200,92 T300,82 T400,72 L400,120 L0,120 Z" fill="url(#greenGradient)" />

                        <defs>
                          <linearGradient id="orangeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#F7931A" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#F7931A" stopOpacity="0.05" />
                          </linearGradient>
                          <linearGradient id="blueGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.05" />
                          </linearGradient>
                          <linearGradient id="greenGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#10B981" stopOpacity="0.05" />
                          </linearGradient>
                        </defs>
                      </svg>
                      {/* Year labels */}
                      <div className="absolute bottom-1 left-4 right-4 flex justify-between text-[10px] text-zinc-600">
                        <span>2025</span>
                        <span>2030</span>
                        <span>2035</span>
                        <span>2040</span>
                        <span>2045</span>
                      </div>
                    </div>
                  </div>

                  {/* Side Stats Panel */}
                  <div className="w-52 hidden lg:block space-y-4">
                    <div className="p-4 rounded-2xl bg-white/[0.015] border-0">
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">Net Worth</p>
                      <p className="text-xl font-bold text-white mt-1">$847,290</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/[0.015] border-0">
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">Retirement Confidence</p>
                      <p className="text-xl font-bold text-emerald-400 mt-1">92%</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/[0.015] border-0">
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">Monthly Savings</p>
                      <p className="text-xl font-bold text-blue-400 mt-1">$3,200</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/[0.015] border-0">
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium">Tax Savings Found</p>
                      <p className="text-xl font-bold text-purple-400 mt-1">$4,280</p>
                    </div>
                  </div>
                </div>

                {/* Bottom stats row */}
                <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
                  <div className="p-4 rounded-2xl bg-white/[0.015] border-0 text-center">
                    <p className="text-xl font-bold text-orange-400">1.847</p>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mt-1">BTC Stack</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/[0.015] border-0 text-center">
                    <p className="text-xl font-bold text-blue-400">$342K</p>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mt-1">Stocks</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/[0.015] border-0 text-center">
                    <p className="text-xl font-bold text-emerald-400">$285K</p>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mt-1">401k</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/[0.015] border-0 text-center hidden md:block">
                    <p className="text-xl font-bold text-purple-400">$45K</p>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mt-1">Roth IRA</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/[0.015] border-0 text-center hidden md:block">
                    <p className="text-xl font-bold text-rose-400">-$82K</p>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mt-1">Liabilities</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Scrolling Feature Ticker */}
      <section className="py-8 border-y border-white/[0.03] overflow-hidden">
        <div className="relative">
          <div className="flex marquee whitespace-nowrap">
            {[...Array(2)].map((_, setIndex) => (
              <div key={setIndex} className="flex items-center gap-8 px-4">
                {['Cost Basis Tracking', 'Monte Carlo Simulations', 'Bitcoin Loans', 'Tax Harvesting', 'Estate Planning', 'Goal Tracking', 'CSV Import', 'Multi-Account Support', 'Real-Time Prices'].map((feature, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400/60" />
                    <span className="text-sm text-zinc-500 font-light">{feature}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Section A - Tax Strategy */}
      <section className="py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight leading-tight">
                Know Your Tax Bill
                <br />
                <span className="text-zinc-600">Before You Sell</span>
              </h2>
              <p className="text-zinc-500 text-lg leading-relaxed font-light mb-8">
                HIFO, LIFO, FIFO—calculated automatically. See exactly what you'll owe on any sale. Find tax loss harvesting opportunities instantly.
              </p>
              <div className="flex items-center gap-4">
                <div className="w-5 h-5 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <CheckCircle className="w-3 h-3 text-orange-400" strokeWidth={2.5} />
                </div>
                <span className="text-sm text-zinc-400 font-light">Supports all major lot selection methods</span>
              </div>
            </div>
            <div className="relative">
              <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/80 overflow-hidden aspect-[4/3] flex items-center justify-center">
                <div className="text-center">
                  <Receipt className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-600 text-sm">Tax Strategy Preview</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Section B - Retirement Planning */}
      <section className="py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1 relative">
              <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/80 overflow-hidden aspect-[4/3] flex items-center justify-center">
                <div className="text-center">
                  <Target className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-600 text-sm">Retirement Planning Preview</p>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight leading-tight">
                Retire on Bitcoin
                <br />
                <span className="text-zinc-600">Without Selling It</span>
              </h2>
              <p className="text-zinc-500 text-lg leading-relaxed font-light mb-8">
                Model Bitcoin-backed loans, track LTV thresholds, and run Monte Carlo simulations that actually understand volatility.
              </p>
              <div className="flex items-center gap-4">
                <div className="w-5 h-5 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <CheckCircle className="w-3 h-3 text-orange-400" strokeWidth={2.5} />
                </div>
                <span className="text-sm text-zinc-400 font-light">10,000+ simulations per projection</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Section C - Dashboard Overview */}
      <section className="py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight leading-tight">
                Your Whole
                <br />
                <span className="text-zinc-600">Financial Picture</span>
              </h2>
              <p className="text-zinc-500 text-lg leading-relaxed font-light mb-8">
                Bitcoin, stocks, real estate, retirement accounts—all in one dashboard. Track performance, set goals, plan your estate.
              </p>
              <div className="flex items-center gap-4">
                <div className="w-5 h-5 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <CheckCircle className="w-3 h-3 text-orange-400" strokeWidth={2.5} />
                </div>
                <span className="text-sm text-zinc-400 font-light">401k, IRA, Roth, taxable—all supported</span>
              </div>
            </div>
            <div className="relative">
              <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/80 overflow-hidden aspect-[4/3] flex items-center justify-center">
                <div className="text-center">
                  <LayoutDashboard className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-600 text-sm">Dashboard Preview</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-24 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight leading-tight">
                Built for clarity,
                <br />
                <span className="text-zinc-600">not complexity</span>
              </h2>
              <p className="text-zinc-500 text-lg mb-10 leading-relaxed font-light">
                No spreadsheets. No manual calculations. Just a clean interface 
                that gives you actionable insights about your financial future.
              </p>
              
              <div className="space-y-4">
                {[
                'Transactions sync to holdings automatically',
                'HIFO/LIFO/FIFO lot selection built in',
                '10,000+ Monte Carlo simulations per projection',
                '401k, IRA, Roth, taxable—all supported',
                'Price updates every 60 seconds'].
                map((item, i) =>
                <div key={i} className="flex items-center gap-4">
                    <div className="w-5 h-5 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-3 h-3 text-orange-400" strokeWidth={2.5} />
                    </div>
                    <span className="text-sm text-zinc-400 font-light">{item}</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-4">
              {[
              { icon: TrendingUp, label: 'Retirement Confidence', value: '94%', color: 'emerald' },
              { icon: Calculator, label: 'Tax Savings Found', value: '$4,280', color: 'orange' },
              { icon: Building2, label: 'Accounts Supported', value: '7 types', color: 'purple' }].
              map((item, i) =>
              <div key={i} className="flex items-center justify-between p-5 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] transition-colors duration-200">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl bg-${item.color}-500/10 flex items-center justify-center`}>
                      <item.icon className={`w-4 h-4 text-${item.color}-400`} strokeWidth={1.5} />
                    </div>
                    <span className="text-sm text-zinc-500">{item.label}</span>
                  </div>
                  <span className={`text-xl font-semibold text-${item.color}-400`}>{item.value}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>



      {/* Social Proof */}
      <section className="py-32 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-5 tracking-tight">Built by Bitcoiners, for Bitcoiners</h2>
          <p className="text-zinc-500 text-lg max-w-xl mx-auto">
            We hold Bitcoin too. We built the tool we couldn't find anywhere else.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-5 tracking-tight">Your financial clarity starts here</h2>
          <p className="text-zinc-500 text-lg mb-10">
            Free to start. No credit card required.
          </p>
          <Link to={createPageUrl('Dashboard')}>
            <Button size="lg" className="brand-gradient text-white font-semibold hover:opacity-90 px-10 h-14 text-base rounded-xl">
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Privacy Note */}
      <section className="py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-3 mb-5">
            <Shield className="w-5 h-5 text-purple-400/80" strokeWidth={1.5} />
            <h3 className="font-semibold text-lg">Privacy matters.</h3>
          </div>
          <p className="text-sm text-zinc-500 max-w-lg mx-auto leading-relaxed font-light">
            We never sell your data. Many free apps rely on ads or selling user data to make money. 
            We don't. Your financial information stays private, just as it should.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/[0.03]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl brand-gradient flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-medium text-zinc-500 tracking-tight">Orange Plan</span>
          </div>
          <div className="flex items-center gap-8 text-sm text-zinc-600 font-light">
            <Link to={createPageUrl('Features')} className="hover:text-zinc-400 transition-colors">Features</Link>
            <Link to={createPageUrl('Pricing')} className="hover:text-zinc-400 transition-colors">Pricing</Link>
            <Link to={createPageUrl('Dashboard')} className="hover:text-zinc-400 transition-colors">Dashboard</Link>
          </div>
          <p className="text-xs text-zinc-700 font-light">© 2026 Orange Plan</p>
        </div>
      </footer>
    </div>);

}