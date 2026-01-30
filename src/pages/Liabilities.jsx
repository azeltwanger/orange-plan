import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus, Pencil, Trash2, AlertTriangle, CheckCircle, TrendingDown, Zap, Lock, Unlock, Building, Shield, Info, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import EmptyState from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { assignCollateralLots, getCollateralizedLotIds } from '@/components/shared/lotSelectionHelpers';

// BTC Collateral Loan Constants
const INITIAL_LTV = 0.50; // 50% LTV at loan origination
const LIQUIDATION_LTV = 0.80; // 80% LTV triggers liquidation

export default function Liabilities() {
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingLiability, setEditingLiability] = useState(null);
  const [showCollateralSettings, setShowCollateralSettings] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const queryClient = useQueryClient();

  // BTC Collateral Management Settings (Ledn defaults)
  const [autoTopUp, setAutoTopUp] = useState(true);
  const [topUpTriggerLtv, setTopUpTriggerLtv] = useState(70);
  const [topUpTargetLtv, setTopUpTargetLtv] = useState(50); // Ledn resets to 50% LTV after top-up
  const [liquidationLtv, setLiquidationLtv] = useState(80);
  const [releaseTriggerLtv, setReleaseTriggerLtv] = useState(30);
  const [releaseTargetLtv, setReleaseTargetLtv] = useState(40);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        const data = await response.json();
        setBtcPrice(data.bitcoin.usd);
        setPriceLoading(false);
      } catch (err) {
        setBtcPrice(97000);
        setPriceLoading(false);
      }
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  const currentPrice = btcPrice || 97000;

  const [formData, setFormData] = useState({
    name: '',
    type: 'unsecured',
    principal_amount: '',
    current_balance: '',
    interest_rate: '',
    monthly_payment: '',
    collateral_btc_amount: '',
    collateral_asset_id: '_none_',
    liquidation_price: '',
    collateral_release_ltv: '30',
    renewal_date: '',
    lender: '',
    due_date: '',
    notes: '',
  });

  const { data: liabilities = [] } = useQuery({
    queryKey: ['liabilities'],
    queryFn: () => base44.entities.Liability.list(),
  });

  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
  });

  const { data: collateralizedLoans = [] } = useQuery({
    queryKey: ['collateralizedLoans'],
    queryFn: () => base44.entities.CollateralizedLoan.list(),
  });

  const { data: userSettings = [] } = useQuery({
    queryKey: ['userSettings'],
    queryFn: () => base44.entities.UserSettings.list(),
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => base44.entities.Transaction.list(),
  });

  // Check if critical data is loading
  const isLoadingData = !liabilities || !holdings || !collateralizedLoans || !userSettings;

  // Load settings from UserSettings
  useEffect(() => {
    if (userSettings.length > 0 && !settingsLoaded) {
      const settings = userSettings[0];
      if (settings.auto_top_up_btc_collateral !== undefined) setAutoTopUp(settings.auto_top_up_btc_collateral);
      if (settings.btc_top_up_trigger_ltv !== undefined) setTopUpTriggerLtv(settings.btc_top_up_trigger_ltv);
      if (settings.btc_top_up_target_ltv !== undefined) setTopUpTargetLtv(settings.btc_top_up_target_ltv);
      if (settings.btc_liquidation_ltv !== undefined) setLiquidationLtv(settings.btc_liquidation_ltv);
      if (settings.btc_release_trigger_ltv !== undefined) setReleaseTriggerLtv(settings.btc_release_trigger_ltv);
      if (settings.btc_release_target_ltv !== undefined) setReleaseTargetLtv(settings.btc_release_target_ltv);
      setSettingsLoaded(true);
    }
  }, [userSettings, settingsLoaded]);

  // Save collateral settings mutation
  const saveCollateralSettings = useMutation({
    mutationFn: async (data) => {
      if (userSettings.length > 0) {
        return base44.entities.UserSettings.update(userSettings[0].id, data);
      } else {
        return base44.entities.UserSettings.create(data);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['userSettings'] }),
  });

  // Auto-save collateral settings when they change
  useEffect(() => {
    if (!settingsLoaded) return;
    const timeoutId = setTimeout(() => {
      saveCollateralSettings.mutate({
        auto_top_up_btc_collateral: autoTopUp,
        btc_top_up_trigger_ltv: topUpTriggerLtv,
        btc_top_up_target_ltv: topUpTargetLtv,
        btc_liquidation_ltv: liquidationLtv,
        btc_release_trigger_ltv: releaseTriggerLtv,
        btc_release_target_ltv: releaseTargetLtv,
      });
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [settingsLoaded, autoTopUp, topUpTriggerLtv, topUpTargetLtv, liquidationLtv, releaseTriggerLtv, releaseTargetLtv]);

  const createLiability = useMutation({
    mutationFn: (data) => base44.entities.Liability.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['liabilities'] });
      setFormOpen(false);
      resetForm();
    },
  });

  const updateLiability = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Liability.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['liabilities'] });
      setFormOpen(false);
      setEditingLiability(null);
      resetForm();
    },
  });

  const deleteLiability = useMutation({
    mutationFn: (id) => base44.entities.Liability.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['liabilities'] }),
  });

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'unsecured',
      principal_amount: '',
      current_balance: '',
      interest_rate: '',
      monthly_payment: '',
      collateral_btc_amount: '',
      collateral_asset_id: '_none_',
      liquidation_price: '',
      collateral_release_ltv: '30',
      lender: '',
      due_date: '',
      notes: '',
    });
  };

  useEffect(() => {
    if (editingLiability) {
      setFormData({
        name: editingLiability.name || '',
        type: editingLiability.type || 'unsecured',
        principal_amount: editingLiability.principal_amount || '',
        current_balance: editingLiability.current_balance || '',
        interest_rate: editingLiability.interest_rate || '',
        monthly_payment: editingLiability.monthly_payment || '',
        collateral_btc_amount: editingLiability.collateral_btc_amount || '',
        collateral_asset_id: editingLiability.collateral_asset_id || '_none_',
        liquidation_price: editingLiability.liquidation_price || '',
        collateral_release_ltv: editingLiability.collateral_release_ltv || '30',
        renewal_date: editingLiability.renewal_date || '',
        lender: editingLiability.lender || '',
        due_date: editingLiability.due_date || '',
        notes: editingLiability.notes || '',
      });
    }
  }, [editingLiability]);

  // Auto-calculate liquidation price based on 50% LTV start, 80% liquidation
  const calculateLiquidationPrice = (loanAmount, btcCollateral) => {
    if (!loanAmount || !btcCollateral) return 0;
    // Liquidation occurs when loan / (BTC * price) = 80%
    // So price = loan / (BTC * 0.80)
    return loanAmount / (btcCollateral * LIQUIDATION_LTV);
  };

  // Update liquidation price when collateral or balance changes
  useEffect(() => {
    if (formData.type === 'btc_collateralized' && formData.collateral_btc_amount && formData.current_balance) {
      const calcLiqPrice = calculateLiquidationPrice(
        parseFloat(formData.current_balance),
        parseFloat(formData.collateral_btc_amount)
      );
      setFormData(prev => ({ ...prev, liquidation_price: calcLiqPrice.toFixed(0) }));
    }
  }, [formData.collateral_btc_amount, formData.current_balance, formData.type]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      principal_amount: parseFloat(formData.principal_amount) || 0,
      current_balance: parseFloat(formData.current_balance) || 0,
      interest_rate: parseFloat(formData.interest_rate) || 0,
      monthly_payment: parseFloat(formData.monthly_payment) || 0,
      collateral_btc_amount: parseFloat(formData.collateral_btc_amount) || 0,
      liquidation_price: parseFloat(formData.liquidation_price) || 0,
      collateral_release_ltv: parseFloat(formData.collateral_release_ltv) || 30,
      renewal_date: formData.renewal_date || null,
    };

    // For BTC collateralized loans, assign specific tax lots
    if (data.type === 'btc_collateralized' && data.collateral_btc_amount > 0) {
      console.log('=== SAVING BTC LOAN ===');
      console.log('Loan name:', data.name);
      console.log('Loan ID (if editing):', editingLiability?.id);
      console.log('Collateral BTC needed:', data.collateral_btc_amount);
      
      // Get user's cost basis method
      const settings = userSettings[0];
      const costBasisMethod = settings?.cost_basis_method || 'HIFO';
      
      console.log('All liabilities loaded:', liabilities.length);
      console.log('Liabilities with collateral_lots:', liabilities.filter(l => l.collateral_lots?.length > 0).map(l => ({ name: l.name, id: l.id, lotsCount: l.collateral_lots.length })));
      
      // Get lot IDs already used as collateral (exclude current loan if editing)
      const existingCollateralIds = getCollateralizedLotIds(
        liabilities, 
        collateralizedLoans, 
        editingLiability?.id
      );
      
      console.log('Existing collateral IDs to exclude:', existingCollateralIds.length);
      
      // Filter to BTC buy transactions only
      const btcLots = transactions.filter(t => 
        t.type === 'buy' && 
        t.asset_ticker === 'BTC' &&
        (t.account_type === 'taxable' || !t.account_type)
      );
      
      console.log('BTC lots available for collateral:', btcLots.length);
      
      // Assign lots based on cost basis method
      const result = assignCollateralLots(
        btcLots,
        data.collateral_btc_amount,
        costBasisMethod,
        existingCollateralIds
      );
      
      console.log('Assignment result:', {
        success: result.success,
        lotsAssigned: result.lots?.length,
        totalBasis: result.totalBasis,
        error: result.error
      });
      
      if (result.lots) {
        console.log('Assigned lot IDs:', result.lots.map(l => l.lot_id));
      }
      
      if (!result.success) {
        alert(result.error || 'Could not assign collateral lots. Make sure you have enough BTC in taxable accounts.');
        return;
      }
      
      // Add lot assignment to loan data
      data.collateral_lots = result.lots;
      data.collateral_total_basis = result.totalBasis;
    } else {
      // Clear collateral lot data if not a BTC loan
      data.collateral_lots = null;
      data.collateral_total_basis = null;
    }

    if (editingLiability) {
      updateLiability.mutate({ id: editingLiability.id, data });
    } else {
      createLiability.mutate(data);
    }
  };

  // Calculate totals
  const totalAssets = holdings.reduce((sum, h) => {
    if (h.ticker === 'BTC') return sum + (h.quantity * currentPrice);
    return sum + (h.quantity * (h.current_price || 0));
  }, 0);

  // Combine liabilities and collateralized loans for display
  const allDebts = [
    ...liabilities.map(l => ({ ...l, entity_type: 'Liability' })),
    ...collateralizedLoans.map(l => ({ ...l, entity_type: 'CollateralizedLoan', type: 'btc_collateralized' }))
  ];

  const totalLiabilities = allDebts.reduce((sum, l) => sum + (l.current_balance || 0), 0);
  const debtToAssetRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

  const securedDebt = allDebts.filter(l => l.type === 'secured').reduce((sum, l) => sum + (l.current_balance || 0), 0);
  const unsecuredDebt = allDebts.filter(l => l.type === 'unsecured').reduce((sum, l) => sum + (l.current_balance || 0), 0);
  const btcCollateralizedDebt = allDebts.filter(l => l.type === 'btc_collateralized').reduce((sum, l) => sum + (l.current_balance || 0), 0);

  // BTC collateral health
  const btcLoans = allDebts.filter(l => l.type === 'btc_collateralized');
  const totalCollateralBtc = btcLoans.reduce((sum, l) => sum + (l.collateral_btc_amount || 0), 0);
  const totalCollateralValue = totalCollateralBtc * currentPrice;
  
  // Current weighted average LTV
  const currentLTV = btcCollateralizedDebt > 0 && totalCollateralValue > 0 
    ? (btcCollateralizedDebt / totalCollateralValue) * 100 
    : 0;

  // Check for at-risk loans (within 20% of liquidation)
  const atRiskLoans = btcLoans.filter(l => {
    if (!l.liquidation_price || !l.collateral_btc_amount) return false;
    const collateralValue = l.collateral_btc_amount * currentPrice;
    const currentLoanLTV = (l.current_balance / collateralValue) * 100;
    return currentLoanLTV >= 60; // Warning when above 60% LTV (20% from 80% liquidation)
  });

  const typeIcons = {
    secured: Building,
    unsecured: Unlock,
    btc_collateralized: Zap,
  };

  const typeColors = {
    secured: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    unsecured: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
    btc_collateralized: 'bg-orange-400/10 text-orange-400 border-orange-400/20',
  };

  // Show loading skeleton while data is being fetched
  if (isLoadingData) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Leverage</h1>
          <p className="text-zinc-500 mt-2">Manage debt strategically. Protect your stack.</p>
        </div>
        <Button
          onClick={() => { setEditingLiability(null); resetForm(); setFormOpen(true); }}
          className="brand-gradient text-white font-semibold hover:opacity-90 shadow-lg shadow-orange-500/20"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Position
        </Button>
      </div>

      {/* BTC Collateral Management Settings */}
      {btcLoans.length > 0 && (
        <div className="card-premium rounded-2xl border border-zinc-800/50 overflow-hidden">
          <button
            onClick={() => setShowCollateralSettings(!showCollateralSettings)}
            className="w-full p-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Settings className="w-5 h-5 text-orange-400" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-zinc-200">BTC Collateral Management</h3>
                <p className="text-xs text-zinc-500">
                  {autoTopUp 
                    ? `Auto top-up enabled at ${topUpTriggerLtv}% LTV → ${topUpTargetLtv}% target` 
                    : 'Auto top-up disabled • Partial liquidation at 80% LTV'}
                </p>
              </div>
            </div>
            {showCollateralSettings ? (
              <ChevronUp className="w-5 h-5 text-zinc-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-zinc-500" />
            )}
          </button>
          
          {showCollateralSettings && (
            <div className="p-6 pt-2 border-t border-zinc-800/50 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label className="text-zinc-300 font-medium">Auto Top-Up Collateral</Label>
                  <p className="text-xs text-zinc-500 mt-1">
                    Automatically use liquid BTC to top up collateral when LTV rises, preventing liquidation
                  </p>
                </div>
                <Switch
                  checked={autoTopUp}
                  onCheckedChange={setAutoTopUp}
                  className="data-[state=checked]:bg-orange-500"
                />
              </div>

              {autoTopUp && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 p-4 rounded-xl bg-zinc-800/30">
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">Top-Up Trigger LTV (%)</Label>
                    <Input
                      type="number"
                      value={topUpTriggerLtv}
                      onChange={(e) => setTopUpTriggerLtv(parseInt(e.target.value) || 70)}
                      min={50}
                      max={79}
                      className="bg-zinc-900 border-zinc-700"
                    />
                    <p className="text-[10px] text-zinc-500">When LTV reaches this level, attempt top-up</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">Top-Up Target LTV (%)</Label>
                    <Input
                      type="number"
                      value={topUpTargetLtv}
                      onChange={(e) => setTopUpTargetLtv(parseInt(e.target.value) || 50)}
                      min={20}
                      max={70}
                      className="bg-zinc-900 border-zinc-700"
                    />
                    <p className="text-[10px] text-zinc-500">Top-up brings LTV back to this level</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">Liquidation LTV (%)</Label>
                    <Input
                      type="number"
                      value={liquidationLtv}
                      onChange={(e) => setLiquidationLtv(parseInt(e.target.value) || 80)}
                      min={75}
                      max={95}
                      className="bg-zinc-900 border-zinc-700"
                    />
                    <p className="text-[10px] text-zinc-500">Full liquidation if top-up fails at this level</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">Release Trigger LTV (%)</Label>
                    <Input
                      type="number"
                      value={releaseTriggerLtv}
                      onChange={(e) => setReleaseTriggerLtv(parseInt(e.target.value) || 30)}
                      min={10}
                      max={40}
                      className="bg-zinc-900 border-zinc-700"
                    />
                    <p className="text-[10px] text-zinc-500">When LTV falls below this, release excess collateral</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">Release Target LTV (%)</Label>
                    <Input
                      type="number"
                      value={releaseTargetLtv}
                      onChange={(e) => setReleaseTargetLtv(parseInt(e.target.value) || 40)}
                      min={30}
                      max={50}
                      className="bg-zinc-900 border-zinc-700"
                    />
                    <p className="text-[10px] text-zinc-500">After release, LTV is brought back to this level</p>
                  </div>
                </div>
              )}

              <div className="p-4 rounded-xl bg-zinc-800/20 border border-zinc-700/50">
                <h4 className="text-sm font-medium text-zinc-300 mb-2">How it works in projections:</h4>
                <p className="text-xs text-zinc-500 mb-3 italic">Based on lender loan terms</p>
                <ul className="text-xs text-zinc-500 space-y-1.5">
                  {autoTopUp ? (
                    <>
                      <li>• When LTV reaches <span className="text-amber-400">{topUpTriggerLtv}%</span>, liquid BTC is used to add collateral</li>
                      <li>• Collateral is added until LTV drops to <span className="text-emerald-400">{topUpTargetLtv}%</span></li>
                      <li>• If insufficient liquid BTC and LTV reaches <span className="text-rose-400">{liquidationLtv}%</span>, <span className="text-rose-400">full liquidation</span> occurs (loan paid off, excess collateral returned)</li>
                    </>
                  ) : (
                    <>
                      <li>• No automatic collateral management</li>
                      <li>• At <span className="text-rose-400">{liquidationLtv}% LTV</span>, lender sells collateral to pay off loan entirely</li>
                    </>
                  )}
                  <li>• When LTV drops below <span className="text-purple-400">{releaseTriggerLtv}%</span>, excess collateral is released back to liquid (bringing LTV up to <span className="text-emerald-400">{releaseTargetLtv}%</span>)</li>
                </ul>
                <p className="text-xs text-zinc-500 mt-2 italic">
                  Note: Full liquidation is modeled (loan paid off, excess returned). Partial liquidation (Nexo-style) coming in future update.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* BTC Collateral Alert Banner */}
      {btcLoans.length > 0 && (
        <div className={cn(
          "card-premium rounded-2xl p-6 border",
          currentLTV >= 60 ? "border-rose-400/30" : currentLTV >= 40 ? "border-amber-400/30" : "border-emerald-400/30"
        )}>
          <div className="flex items-start gap-4">
            <div className={cn(
              "p-3 rounded-xl",
              currentLTV >= 60 ? "bg-rose-400/10" : currentLTV >= 40 ? "bg-amber-400/10" : "bg-emerald-400/10"
            )}>
              <Shield className={cn(
                "w-6 h-6",
                currentLTV >= 60 ? "text-rose-400" : currentLTV >= 40 ? "text-amber-400" : "text-emerald-400"
              )} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className={cn(
                  "font-semibold text-lg",
                  currentLTV >= 60 ? "text-rose-400" : currentLTV >= 40 ? "text-amber-400" : "text-emerald-400"
                )}>
                  {currentLTV >= 60 ? '⚠️ Collateral Alert' : currentLTV >= 40 ? 'Monitor Closely' : '✓ Healthy Position'}
                </h3>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-4 h-4 text-zinc-500" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-zinc-800 border-zinc-700">
                      <p>BTC loans start at 50% LTV. Liquidation occurs at 80% LTV. Keep your LTV below 60% for safety margin.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Current LTV</p>
                  <p className={cn(
                    "text-2xl font-bold",
                    currentLTV >= 60 ? "text-rose-400" : currentLTV >= 40 ? "text-amber-400" : "text-emerald-400"
                  )}>
                    {currentLTV.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Initial LTV</p>
                  <p className="text-2xl font-bold text-zinc-400">{(INITIAL_LTV * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Liquidation LTV</p>
                  <p className="text-2xl font-bold text-rose-400">{(LIQUIDATION_LTV * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Buffer to Liq.</p>
                  <p className={cn(
                    "text-2xl font-bold",
                    (LIQUIDATION_LTV * 100 - currentLTV) < 20 ? "text-rose-400" : "text-emerald-400"
                  )}>
                    {(LIQUIDATION_LTV * 100 - currentLTV).toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-zinc-500 mb-1">
                  <span>0%</span>
                  <span>Safe Zone</span>
                  <span>Warning</span>
                  <span>80% Liq.</span>
                </div>
                <div className="h-3 bg-zinc-800 rounded-full overflow-hidden relative">
                  <div className="absolute inset-y-0 left-0 w-[50%] bg-emerald-500/20" />
                  <div className="absolute inset-y-0 left-[50%] w-[20%] bg-amber-500/20" />
                  <div className="absolute inset-y-0 left-[70%] w-[30%] bg-rose-500/20" />
                  <div 
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-orange-500 transition-all duration-500"
                    style={{ width: `${Math.min(currentLTV, 100)}%` }}
                  />
                  <div 
                    className="absolute inset-y-0 w-1 bg-white shadow-lg"
                    style={{ left: `${Math.min(currentLTV, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards - Mobile Optimized */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <div className="card-premium rounded-xl p-4 lg:p-6 border border-rose-400/10">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Total Obligations</span>
            <div className="p-2 rounded-lg bg-rose-400/10">
              <TrendingDown className="w-4 h-4 text-rose-400" />
            </div>
          </div>
          <p className="text-2xl lg:text-3xl font-bold text-rose-400">${totalLiabilities.toLocaleString()}</p>
        </div>

        <div className="card-premium rounded-xl p-6 border border-zinc-700/30">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Leverage Ratio</span>
            <div className={cn("p-2 rounded-lg", debtToAssetRatio > 50 ? "bg-rose-400/10" : "bg-emerald-400/10")}>
              {debtToAssetRatio > 50 ? <AlertTriangle className="w-4 h-4 text-rose-400" /> : <CheckCircle className="w-4 h-4 text-emerald-400" />}
            </div>
          </div>
          <p className={cn("text-3xl font-bold", debtToAssetRatio > 50 ? "text-rose-400" : "text-emerald-400")}>
            {debtToAssetRatio.toFixed(1)}%
          </p>
          <p className="text-xs text-zinc-500 mt-1">Debt to Assets</p>
        </div>

        <div className="card-premium rounded-xl p-6 border border-orange-400/10">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">BTC Pledged</span>
            <div className="p-2 rounded-lg bg-orange-400/10">
              <Zap className="w-4 h-4 text-orange-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-orange-400">{totalCollateralBtc.toFixed(4)}</p>
          <p className="text-xs text-zinc-500 mt-1">${totalCollateralValue.toLocaleString()} value</p>
        </div>

        <div className="card-premium rounded-xl p-6 border border-zinc-700/30">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Risk Status</span>
            <div className={cn("p-2 rounded-lg", atRiskLoans.length > 0 ? "bg-rose-400/10" : "bg-emerald-400/10")}>
              {atRiskLoans.length > 0 ? <AlertTriangle className="w-4 h-4 text-rose-400" /> : <CheckCircle className="w-4 h-4 text-emerald-400" />}
            </div>
          </div>
          <p className={cn("text-3xl font-bold", atRiskLoans.length > 0 ? "text-rose-400" : "text-emerald-400")}>
            {atRiskLoans.length === 0 ? 'Clear' : `${atRiskLoans.length} Alert${atRiskLoans.length > 1 ? 's' : ''}`}
          </p>
          <p className="text-xs text-zinc-500 mt-1">{atRiskLoans.length === 0 ? 'All positions healthy' : 'Requires attention'}</p>
        </div>
      </div>

      {/* Debt by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-premium rounded-xl p-6 border border-blue-400/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-blue-400/10">
              <Building className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <span className="font-semibold text-zinc-200">Secured</span>
              <p className="text-xs text-zinc-500">Mortgages, auto loans</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-zinc-100">${securedDebt.toLocaleString()}</p>
        </div>

        <div className="card-premium rounded-xl p-6 border border-purple-400/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-purple-400/10">
              <Unlock className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <span className="font-semibold text-zinc-200">Unsecured</span>
              <p className="text-xs text-zinc-500">Credit cards, personal</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-zinc-100">${unsecuredDebt.toLocaleString()}</p>
        </div>

        <div className="card-premium rounded-xl p-6 border border-orange-400/10 glow-subtle">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-orange-400/10">
              <Zap className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <span className="font-semibold text-zinc-200">BTC-Backed</span>
              <p className="text-xs text-zinc-500">Collateralized loans</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-orange-400">${btcCollateralizedDebt.toLocaleString()}</p>
        </div>
      </div>

      {/* Liabilities List */}
      <div className="card-premium rounded-2xl p-6 lg:p-8 border border-zinc-800/50">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold">All Positions</h3>
          <span className="text-sm text-zinc-500">{allDebts.length} {allDebts.length === 1 ? 'position' : 'positions'}</span>
        </div>

        {allDebts.length === 0 ? (
          <EmptyState
            icon={Lock}
            title="No Debt Positions"
            description="Track liabilities to understand true net worth and manage leverage safely"
            actionText="Add First Position"
            onAction={() => { resetForm(); setFormOpen(true); }}
          />
        ) : (
          <div className="space-y-4">
            {allDebts.map((liability) => {
              const Icon = typeIcons[liability.type] || Lock;
              const colorClass = typeColors[liability.type] || 'bg-zinc-400/10 text-zinc-400 border-zinc-400/20';
              const paidOff = liability.principal_amount > 0 
                ? ((liability.principal_amount - liability.current_balance) / liability.principal_amount) * 100 
                : 0;

              // Calculate collateral health for BTC loans
              let collateralHealth = null;
              if (liability.type === 'btc_collateralized' && liability.collateral_btc_amount > 0) {
                const collateralValue = liability.collateral_btc_amount * currentPrice;
                const currentLoanLTV = (liability.current_balance / collateralValue) * 100;
                const liqPrice = calculateLiquidationPrice(liability.current_balance, liability.collateral_btc_amount);
                const priceDropToLiq = ((currentPrice - liqPrice) / currentPrice) * 100;
                
                collateralHealth = {
                  ltv: currentLoanLTV,
                  liqPrice: liqPrice,
                  priceDropToLiq: priceDropToLiq,
                  isHealthy: currentLoanLTV < 50,
                  isWarning: currentLoanLTV >= 50 && currentLoanLTV < 65,
                  isDanger: currentLoanLTV >= 65,
                };
              }

              return (
                <div key={liability.id} className={cn(
                  "p-6 rounded-xl border transition-all duration-300 hover:border-zinc-700",
                  liability.type === 'btc_collateralized' && collateralHealth?.isDanger ? "bg-rose-500/5 border-rose-500/20" :
                  liability.type === 'btc_collateralized' && collateralHealth?.isWarning ? "bg-amber-500/5 border-amber-500/20" :
                  "bg-zinc-800/20 border-zinc-800/50"
                )}>
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-4">
                      <div className={cn("w-14 h-14 rounded-xl flex items-center justify-center border", colorClass)}>
                        <Icon className="w-7 h-7" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-lg text-zinc-100">{liability.name}</h4>
                        <div className="flex items-center gap-2 text-sm text-zinc-500 mt-1">
                          <span className="capitalize">{liability.type?.replace('_', ' ')}</span>
                          {liability.lender && (
                            <>
                              <span className="text-zinc-700">•</span>
                              <span>{liability.lender}</span>
                            </>
                          )}
                          {liability.interest_rate > 0 && (
                            <>
                              <span className="text-zinc-700">•</span>
                              <span className="text-amber-400">{liability.interest_rate}% APR</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {liability.entity_type === 'Liability' && (
                        <>
                          <button
                            onClick={() => { setEditingLiability(liability); setFormOpen(true); }}
                            className="p-2.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-700 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
                            aria-label={`Edit ${liability.name}`}
                          >
                            <Pencil className="w-4 h-4 text-zinc-400" />
                          </button>
                          <button
                            onClick={() => { setItemToDelete({ type: 'liability', item: liability }); setDeleteConfirmOpen(true); }}
                            className="p-2.5 rounded-lg bg-zinc-800/50 hover:bg-rose-600/30 transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50"
                            aria-label={`Delete ${liability.name}`}
                          >
                            <Trash2 className="w-4 h-4 text-zinc-400" />
                          </button>
                        </>
                      )}
                      {liability.entity_type === 'CollateralizedLoan' && (
                        <span className="px-3 py-1 rounded-lg bg-orange-500/10 text-orange-400 text-xs font-medium">
                          Collateralized Loan
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Outstanding</p>
                      <p className="text-2xl font-bold text-rose-400">${(liability.current_balance || 0).toLocaleString()}</p>
                    </div>
                    {liability.principal_amount > 0 && (
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Original</p>
                        <p className="text-2xl font-bold text-zinc-300">${(liability.principal_amount || 0).toLocaleString()}</p>
                      </div>
                    )}
                    {liability.monthly_payment > 0 && (
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Monthly</p>
                        <p className="text-2xl font-bold text-zinc-300">${(liability.monthly_payment || 0).toLocaleString()}</p>
                      </div>
                    )}
                    {liability.type === 'btc_collateralized' && liability.collateral_btc_amount > 0 && (
                      <div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Collateral</p>
                        <p className="text-2xl font-bold text-orange-400">{liability.collateral_btc_amount} BTC</p>
                      </div>
                    )}
                  </div>

                  {liability.principal_amount > 0 && liability.type !== 'btc_collateralized' && (
                    <div className="mb-5">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-zinc-500">Payoff Progress</span>
                        <span className="font-semibold text-emerald-400">{paidOff.toFixed(1)}%</span>
                      </div>
                      <Progress value={paidOff} className="h-2 bg-zinc-800" />
                    </div>
                  )}

                  {collateralHealth && (
                    <div className={cn(
                      "p-4 rounded-xl",
                      collateralHealth.isHealthy ? "bg-emerald-500/10 border border-emerald-500/20" :
                      collateralHealth.isWarning ? "bg-amber-500/10 border border-amber-500/20" :
                      "bg-rose-500/10 border border-rose-500/20"
                    )}>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Current LTV</p>
                          <p className={cn(
                            "text-xl font-bold",
                            collateralHealth.isHealthy ? "text-emerald-400" :
                            collateralHealth.isWarning ? "text-amber-400" : "text-rose-400"
                          )}>
                            {collateralHealth.ltv.toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Liquidation Price</p>
                          <p className="text-xl font-bold text-rose-400">${collateralHealth.liqPrice.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">BTC Price</p>
                          <p className="text-xl font-bold text-orange-400">${currentPrice.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Cushion</p>
                          <p className={cn(
                            "text-xl font-bold",
                            collateralHealth.priceDropToLiq > 30 ? "text-emerald-400" :
                            collateralHealth.priceDropToLiq > 15 ? "text-amber-400" : "text-rose-400"
                          )}>
                            -{collateralHealth.priceDropToLiq.toFixed(0)}%
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 mt-3">
                        {collateralHealth.isHealthy ? '✓ Healthy position. You have significant buffer before liquidation.' :
                         collateralHealth.isWarning ? '⚠️ Monitor this position. Consider adding collateral or reducing loan.' :
                         '🚨 High risk! Add collateral immediately or repay part of the loan.'}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{editingLiability ? 'Edit Position' : 'Add Debt Position'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., BlockFi Loan, Chase Mortgage"
                className="bg-zinc-900 border-zinc-800 focus:border-orange-500/50"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="secured">Secured</SelectItem>
                    <SelectItem value="unsecured">Unsecured</SelectItem>
                    <SelectItem value="btc_collateralized">BTC Collateralized</SelectItem>
                    <SelectItem value="real_estate_collateralized">Real Estate Collateralized</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Lender</Label>
                <Input
                  value={formData.lender}
                  onChange={(e) => setFormData({ ...formData, lender: e.target.value })}
                  placeholder="Unchained, Ledn..."
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Original Amount</Label>
                <Input
                  type="number"
                  value={formData.principal_amount}
                  onChange={(e) => setFormData({ ...formData, principal_amount: e.target.value })}
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Current Balance</Label>
                <Input
                  type="number"
                  value={formData.current_balance}
                  onChange={(e) => setFormData({ ...formData, current_balance: e.target.value })}
                  className="bg-zinc-900 border-zinc-800"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Interest Rate (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.interest_rate}
                  onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value })}
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Monthly Payment</Label>
                <Input
                  type="number"
                  value={formData.monthly_payment}
                  onChange={(e) => setFormData({ ...formData, monthly_payment: e.target.value })}
                  className="bg-zinc-900 border-zinc-800"
                />
              </div>
            </div>
            {formData.type === 'btc_collateralized' && (
              <>
                <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
                  <p className="text-xs text-orange-400 mb-2 font-medium">BTC Collateral Settings</p>
                  <p className="text-xs text-zinc-500">Standard terms: 50% initial LTV, liquidation at 80% LTV</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">BTC Collateral</Label>
                    <Input
                      type="number"
                      step="any"
                      value={formData.collateral_btc_amount}
                      onChange={(e) => setFormData({ ...formData, collateral_btc_amount: e.target.value })}
                      placeholder="0.00000000"
                      className="bg-zinc-900 border-zinc-800 font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-xs uppercase tracking-wider">Liquidation Price</Label>
                    <Input
                      type="number"
                      value={formData.liquidation_price}
                      className="bg-zinc-900 border-zinc-800 text-zinc-500"
                      readOnly
                    />
                    <p className="text-[10px] text-zinc-600">Auto-calculated at 80% LTV</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Collateral Release LTV (%)</Label>
                  <Input
                    type="number"
                    step="1"
                    value={formData.collateral_release_ltv}
                    onChange={(e) => setFormData({ ...formData, collateral_release_ltv: e.target.value })}
                    placeholder="30"
                    className="bg-zinc-900 border-zinc-800"
                  />
                  <p className="text-[10px] text-zinc-500">LTV threshold at which collateral becomes liquid again (typically 30%)</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Annual Renewal Date</Label>
                  <Input
                    type="date"
                    value={formData.renewal_date}
                    onChange={(e) => setFormData({ ...formData, renewal_date: e.target.value })}
                    className="bg-zinc-900 border-zinc-800"
                  />
                  <p className="text-[10px] text-zinc-500">Loans auto-renew annually if LTV ≤ 60%. Interest rolls into balance at renewal.</p>
                </div>
                </>
                )}
            {formData.type === 'real_estate_collateralized' && (
              <div className="space-y-2">
                <Label className="text-zinc-400 text-xs uppercase tracking-wider">Collateralized Asset</Label>
                <Select
                  value={formData.collateral_asset_id || '_none_'}
                  onValueChange={(value) => setFormData({ ...formData, collateral_asset_id: value === '_none_' ? '' : value })}
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-800">
                    <SelectValue placeholder="Select asset..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="_none_">None selected</SelectItem>
                    {holdings.filter(h => h.asset_type === 'real_estate').map(h => (
                      <SelectItem key={h.id} value={h.id}>{h.asset_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-zinc-500">Link the real estate asset used as collateral</p>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="bg-zinc-900 border-zinc-800 resize-none"
                rows={2}
                placeholder="Any additional details..."
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="flex-1 bg-transparent border-zinc-800 hover:bg-zinc-800">
                Cancel
              </Button>
              <Button type="submit" className="flex-1 brand-gradient text-white font-semibold">
                {editingLiability ? 'Update' : 'Add'} Position
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-md animate-in fade-in-0 zoom-in-95 duration-200">
          <DialogHeader>
            <DialogTitle>Delete Liability?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-zinc-400">
              Are you sure you want to delete <span className="font-semibold text-zinc-200">{itemToDelete?.item?.name}</span>?
            </p>
            <p className="text-sm text-rose-400">This action cannot be undone.</p>
            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                onClick={() => { setDeleteConfirmOpen(false); setItemToDelete(null); }} 
                className="flex-1 bg-transparent border-zinc-700"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  if (itemToDelete?.type === 'liability') {
                    deleteLiability.mutate(itemToDelete.item.id);
                  }
                  setDeleteConfirmOpen(false);
                  setItemToDelete(null);
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white"
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}