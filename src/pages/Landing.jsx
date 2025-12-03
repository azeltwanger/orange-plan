import React from 'react';
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
  Wallet
} from 'lucide-react';
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: PieChart,
    title: 'Net Worth Tracking',
    description: 'Track all your assets in one place - crypto, stocks, real estate, and more.'
  },
  {
    icon: Target,
    title: 'Financial Projections',
    description: 'Model your financial future with Monte Carlo simulations and scenario planning.'
  },
  {
    icon: Calculator,
    title: 'Tax Optimization',
    description: 'Smart tax lot selection and gain/loss harvesting strategies.'
  },
  {
    icon: Wallet,
    title: 'Budget Management',
    description: 'Track income, expenses, and savings rate with detailed breakdowns.'
  },
  {
    icon: BarChart3,
    title: 'DCA Strategies',
    description: 'Plan and track your dollar-cost averaging investments.'
  },
  {
    icon: Shield,
    title: 'Estate Planning',
    description: 'Secure your legacy with inheritance protocols and beneficiary management.'
  },
];

const benefits = [
  'Track unlimited assets across all account types',
  'Real-time Bitcoin price integration',
  'Retirement planning with withdrawal strategies',
  'Tax-optimized selling with lot selection',
  'Life event planning and modeling',
  'Security scoring for custody solutions',
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0a0a0b] text-zinc-100">
      <style>{`
        .brand-gradient {
          background: linear-gradient(135deg, #F7931A 0%, #FF6B00 50%, #F7931A 100%);
        }
        .brand-gradient-text {
          background: linear-gradient(135deg, #F7931A 0%, #FFB347 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .glow-orange {
          box-shadow: 0 0 80px -20px rgba(247, 147, 26, 0.4);
        }
      `}</style>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0b]/80 backdrop-blur-xl border-b border-zinc-800/30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl brand-gradient flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Zap className="w-6 h-6 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-xl tracking-tight">Orange Plan</span>
          </div>
          <Link to={createPageUrl('Dashboard')}>
            <Button className="brand-gradient text-white font-semibold hover:opacity-90">
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/20 mb-8">
            <Zap className="w-4 h-4 text-orange-400" />
            <span className="text-sm text-orange-400 font-medium">Complete Financial Planning</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            Your Complete
            <br />
            <span className="brand-gradient-text">Wealth Dashboard</span>
          </h1>
          
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10">
            Track, plan, and optimize your entire financial life. From net worth tracking to retirement planning, 
            tax optimization, and estate security — all in one powerful platform.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to={createPageUrl('Dashboard')}>
              <Button size="lg" className="brand-gradient text-white font-semibold hover:opacity-90 shadow-lg shadow-orange-500/30 px-8">
                Start Planning
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>

          {/* Hero Visual */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0b] via-transparent to-transparent z-10" />
            <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-8 glow-orange">
              <div className="grid grid-cols-3 gap-6">
                <div className="p-6 rounded-xl bg-zinc-800/50 text-left">
                  <p className="text-sm text-zinc-500 mb-1">Net Worth</p>
                  <p className="text-3xl font-bold brand-gradient-text">$1,247,890</p>
                  <p className="text-sm text-emerald-400 mt-1">↑ 12.4% this year</p>
                </div>
                <div className="p-6 rounded-xl bg-zinc-800/50 text-left">
                  <p className="text-sm text-zinc-500 mb-1">Bitcoin Holdings</p>
                  <p className="text-3xl font-bold text-orange-400">2.847 BTC</p>
                  <p className="text-sm text-zinc-400 mt-1">45% of portfolio</p>
                </div>
                <div className="p-6 rounded-xl bg-zinc-800/50 text-left">
                  <p className="text-sm text-zinc-500 mb-1">Monthly Savings</p>
                  <p className="text-3xl font-bold text-emerald-400">$4,250</p>
                  <p className="text-sm text-zinc-400 mt-1">32% savings rate</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-6 bg-zinc-900/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything You Need</h2>
            <p className="text-zinc-400 max-w-xl mx-auto">
              Comprehensive tools to manage every aspect of your financial life.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="p-6 rounded-2xl bg-zinc-800/30 border border-zinc-800/50 hover:border-orange-500/20 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-orange-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-zinc-400 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Built for Serious
                <br />
                <span className="brand-gradient-text">Financial Planning</span>
              </h2>
              <p className="text-zinc-400 mb-8">
                Whether you're just starting to invest or managing a complex portfolio, 
                Orange Plan gives you the tools to make informed decisions and achieve your financial goals.
              </p>
              
              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-orange-400 flex-shrink-0" />
                    <span className="text-zinc-300">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute -inset-4 bg-orange-500/10 rounded-3xl blur-3xl" />
              <div className="relative rounded-2xl border border-zinc-800/50 bg-zinc-900/80 p-6 space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <p className="font-medium">Retirement Projection</p>
                      <p className="text-sm text-zinc-500">Monte Carlo Analysis</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-emerald-400">94%</p>
                </div>
                
                <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <Calculator className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-medium">Tax Savings</p>
                      <p className="text-sm text-zinc-500">This Year</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-emerald-400">$8,420</p>
                </div>
                
                <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="font-medium">Security Score</p>
                      <p className="text-sm text-zinc-500">Estate Planning</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-purple-400">9.2/10</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="rounded-3xl bg-gradient-to-b from-orange-500/10 to-transparent border border-orange-500/20 p-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Start Planning Your Financial Future
            </h2>
            <p className="text-zinc-400 mb-8 max-w-xl mx-auto">
              Take control of your wealth with comprehensive tracking, planning, and optimization tools.
            </p>
            <Link to={createPageUrl('Dashboard')}>
              <Button size="lg" className="brand-gradient text-white font-semibold hover:opacity-90 shadow-lg shadow-orange-500/30 px-8">
                Get Started Now
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-zinc-800/30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg brand-gradient flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold">Orange Plan</span>
          </div>
          <p className="text-sm text-zinc-500">© 2024 Orange Plan. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}