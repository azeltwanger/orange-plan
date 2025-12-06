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
  Book
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
}];

const newToFeatures = [
  {
    icon: Target,
    title: 'Retirement Planning',
    description: 'Map out your path to financial independence with detailed projections.',
    link: '#'
  },
  {
    icon: Scale,
    title: 'Cash Flow',
    description: 'Analyze cash flow with Sankey diagrams.',
    link: '#'
  },
  {
    icon: Receipt,
    title: 'Tax Analytics',
    description: 'Review detailed tax estimates and analytics.',
    link: '#'
  },
  {
    icon: LayoutDashboard,
    title: 'Net Worth',
    description: 'Calculate and track your net worth over time.',
    link: '#'
  },
  {
    icon: Gauge,
    title: 'Chance of Success',
    description: 'Gauge your chance of success with Monte Carlo simulations.',
    link: '#'
  },
  {
    icon: DollarSign,
    title: 'Pricing',
    description: 'Review pricing and choose the plan that\'s right for you.',
    link: 'Pricing'
  },
  {
    icon: Briefcase,
    title: 'Advisors',
    description: 'Explore the Pro version for financial advisors.',
    link: '#'
  },
  {
    icon: HeartPulse,
    title: 'Financial Wellness',
    description: 'Share Orange Plan as a benefit for your employees.',
    link: '#'
  },
  {
    icon: PlayCircle,
    title: 'Video Walkthrough',
    description: 'Learn about Orange Plan with our Getting Started video.',
    link: 'https://www.youtube.com'
  },
  {
    icon: Newspaper,
    title: 'Blog',
    description: 'Read the latest posts, updates, and articles.',
    link: '#'
  },
  {
    icon: Book,
    title: 'Financial Terms',
    description: 'Orange Plan\'s glossary of financial terms.',
    link: '#'
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
          background: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(247, 147, 26, 0.15), transparent);
        }
        .card-shine {
          background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%);
        }
      `}</style>

      {/* Ambient background */}
      <div className="fixed inset-0 hero-glow pointer-events-none" />
      
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#09090b]/80 backdrop-blur-2xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg brand-gradient flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-lg">Orange Plan</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to={createPageUrl('Pricing')} className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">
              Pricing
            </Link>
            <Link to={createPageUrl('Dashboard')} className="text-sm text-zinc-400 hover:text-white transition-colors hidden sm:block">
              Sign in
            </Link>
            <Link to={createPageUrl('Dashboard')}>
              <Button size="sm" className="brand-gradient text-white font-medium hover:opacity-90 shadow-lg shadow-orange-500/25">
                Try for free
              </Button>
            </Link>
          </div>
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
            Build Your Bitcoin
            <br />
            <span className="brand-gradient-text">Financial Plan</span>
          </h1>
          
          <p className="text-lg text-zinc-400 max-w-xl mx-auto mb-10 leading-relaxed">
            Track your net worth, model retirement scenarios, compare fees, optimize taxes, 
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
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                <span className="ml-4 text-xs text-zinc-600">Financial Projections</span>
              </div>

              <div className="p-6 md:p-8">
                {/* Top section with chart and side panel */}
                <div className="flex gap-6 mb-6">
                  {/* Main Chart Area */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wider">Net Worth Projection</p>
                        <p className="text-2xl font-bold brand-gradient-text">$2.4M by 2045</p>
                      </div>
                      <div className="flex gap-2">
                        <span className="px-2 py-1 rounded text-[10px] bg-orange-500/20 text-orange-400">BTC</span>
                        <span className="px-2 py-1 rounded text-[10px] bg-blue-500/20 text-blue-400">Stocks</span>
                        <span className="px-2 py-1 rounded text-[10px] bg-emerald-500/20 text-emerald-400">401k</span>
                      </div>
                    </div>

                    {/* Realistic area chart */}
                    <div className="h-40 rounded-xl bg-gradient-to-br from-white/[0.02] to-transparent border border-white/5 p-4 relative overflow-hidden">
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
                  <div className="w-48 hidden md:block space-y-3">
                    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
                      <p className="text-[10px] text-zinc-500">Net Worth</p>
                      <p className="text-lg font-bold text-white">$847,290</p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
                      <p className="text-[10px] text-zinc-500">Retirement Ready</p>
                      <p className="text-lg font-bold text-emerald-400">92%</p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
                      <p className="text-[10px] text-zinc-500">Monthly Savings</p>
                      <p className="text-lg font-bold text-blue-400">$3,200</p>
                    </div>
                    <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
                      <p className="text-[10px] text-zinc-500">Tax Saved YTD</p>
                      <p className="text-lg font-bold text-purple-400">$4,280</p>
                    </div>
                  </div>
                </div>

                {/* Bottom stats row */}
                <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                    <p className="text-lg font-bold text-orange-400">1.847</p>
                    <p className="text-[10px] text-zinc-500">BTC Stack</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                    <p className="text-lg font-bold text-blue-400">$342K</p>
                    <p className="text-[10px] text-zinc-500">Stocks</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                    <p className="text-lg font-bold text-emerald-400">$285K</p>
                    <p className="text-[10px] text-zinc-500">401k</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center hidden md:block">
                    <p className="text-lg font-bold text-purple-400">$45K</p>
                    <p className="text-[10px] text-zinc-500">Roth IRA</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center hidden md:block">
                    <p className="text-lg font-bold text-rose-400">-$82K</p>
                    <p className="text-[10px] text-zinc-500">Liabilities</p>
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
            {features.map((feature, i) =>
            <div
              key={i}
              className="group p-5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-orange-500/20 hover:bg-white/[0.04] transition-all duration-300">

                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center mb-4 group-hover:bg-orange-500/20 transition-colors">
                  <feature.icon className="w-5 h-5 text-orange-400" />
                </div>
                <h3 className="font-semibold mb-1.5">{feature.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{feature.description}</p>
              </div>
            )}
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
                'Real-time price updates'].
                map((item, i) =>
                <div key={i} className="flex items-center gap-3">
                    <CheckCircle className="w-4 h-4 text-orange-400 flex-shrink-0" />
                    <span className="text-sm text-zinc-300">{item}</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 bg-orange-500/5 rounded-2xl blur-3xl" />
              <div className="relative space-y-3">
                {[
                { icon: TrendingUp, label: 'Projection Success', value: '94%', color: 'emerald' },
                { icon: Calculator, label: 'Tax Saved (YTD)', value: '$4,280', color: 'orange' },
                { icon: Lock, label: 'Security Score', value: '9.2', color: 'purple' }].
                map((item, i) =>
                <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg bg-${item.color}-500/10 flex items-center justify-center`}>
                        <item.icon className={`w-4 h-4 text-${item.color}-400`} />
                      </div>
                      <span className="text-sm text-zinc-400">{item.label}</span>
                    </div>
                    <span className={`text-lg font-semibold text-${item.color}-400`}>{item.value}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* New to Orange Plan? Section */}
      <section className="py-24 px-6 bg-[#0f0f10] border-t border-white/5 relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-orange-500/5 blur-[100px] rounded-full pointer-events-none" />
        
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">New to Orange Plan?</h2>
            <p className="text-zinc-500 text-lg">Check out these links and resources to get started</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {newToFeatures.map((item, i) => {
              const isLink = item.link !== '#';
              const Component = isLink ? Link : 'div';
              const props = isLink ? {
                to: item.link.startsWith('http') ? item.link : createPageUrl(item.link),
                target: item.link.startsWith('http') ? "_blank" : "_self",
                rel: item.link.startsWith('http') ? "noopener noreferrer" : ""
              } : {};

              return (
                <Component
                  key={i}
                  {...props}
                  className={`group p-6 rounded-2xl bg-white/[0.03] border border-white/5 transition-all duration-300 flex items-start gap-5 ${isLink ? 'hover:border-orange-500/30 hover:bg-white/[0.06] hover:-translate-y-1 hover:shadow-2xl hover:shadow-orange-500/10 cursor-pointer' : ''}`}
                >
                  <div className={`w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${isLink ? 'group-hover:bg-orange-500/20 group-hover:scale-110' : ''}`}>
                    <item.icon className="w-6 h-6 text-orange-400" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className={`font-semibold text-lg mb-2 text-zinc-100 transition-colors ${isLink ? 'group-hover:text-white' : ''}`}>{item.title}</h3>
                    <p className={`text-sm text-zinc-400 leading-relaxed transition-colors ${isLink ? 'group-hover:text-zinc-300' : ''}`}>{item.description}</p>
                  </div>
                </Component>
              );
            })}
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

      {/* Privacy Note */}
      <section className="py-16 px-6 border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold">Privacy matters.</h3>
          </div>
          <p className="text-sm text-zinc-500 max-w-lg mx-auto">
            We never sell your data. Many free apps rely on ads or selling user data to make money. 
            We don't. Your financial information stays private, just as it should.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md brand-gradient flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-medium text-zinc-400">Orange Plan</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-zinc-500">
            <Link to={createPageUrl('Pricing')} className="hover:text-zinc-300 transition-colors">Pricing</Link>
            <Link to={createPageUrl('Dashboard')} className="hover:text-zinc-300 transition-colors">Dashboard</Link>
          </div>
          <p className="text-xs text-zinc-600">© 2024 Orange Plan</p>
        </div>
      </footer>
    </div>);

}