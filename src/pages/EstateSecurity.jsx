import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, differenceInDays, differenceInMonths } from 'date-fns';
import { Plus, Pencil, Trash2, Shield, Key, Users, FileText, Bell, CheckCircle, AlertTriangle, Lock, HardDrive, Building2, Wallet, Mail, Clock, Download, Eye, EyeOff, Zap, Copy, ChevronRight, Info, TrendingUp, PiggyBank, Coins, Package, ClipboardList } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Auto-calculated security scores based on custody type
const SECURITY_SCORES = {
  multisig: 10,
  passphrase: 9,
  hardware_wallet: 8,
  custodian: 6,
  exchange: 4,
  hot_wallet: 2,
};

const SECURITY_FEATURES = {
  multisig: ['Multi-signature protection', '2-of-3 or 3-of-5 keys', 'Distributed custody', 'No single point of failure'],
  passphrase: ['25th word protection', 'Hidden wallet', 'Plausible deniability', 'Air-gapped recommended'],
  hardware_wallet: ['Dedicated secure chip', 'PIN protected', 'Physical device', 'Cold storage'],
  custodian: ['Insured holdings', 'Regulated entity', 'Third-party risk'],
  exchange: ['Hot wallet exposure', 'Counterparty risk', 'Convenient but risky'],
  hot_wallet: ['Always online', 'Highest attack surface', 'Only for small amounts'],
};

// Verification guidance per custody type
const VERIFICATION_STEPS = {
  multisig: [
    'Verify all signing devices are functional',
    'Test a small transaction with required signatures',
    'Confirm backup seeds for each key are secure',
    'Review co-signer contact info is current',
  ],
  passphrase: [
    'Verify hardware device powers on and PIN works',
    'Confirm passphrase unlocks the hidden wallet',
    'Check firmware is up to date',
    'Test receiving a small amount to verify address',
  ],
  hardware_wallet: [
    'Power on device and verify PIN works',
    'Check firmware version and update if needed',
    'Verify seed backup is readable and secure',
    'Confirm device shows correct balance',
  ],
  custodian: [
    'Log in to account and verify balance',
    'Confirm 2FA is enabled and working',
    'Review beneficiary designations on account',
    'Check insurance coverage is current',
  ],
  exchange: [
    'Log in and verify account balance',
    'Confirm 2FA and security settings',
    'Review withdrawal addresses whitelist',
    'Check for any security alerts',
  ],
  hot_wallet: [
    'Open wallet app and verify balance',
    'Confirm backup phrase is secured',
    'Check for app updates',
    'Review connected sites/permissions',
  ],
};

// Asset types for non-BTC assets
const ASSET_TYPES = [
  { value: 'btc', label: 'Bitcoin (BTC)', icon: 'Zap' },
  { value: 'stocks', label: 'Stocks/ETFs', icon: 'TrendingUp' },
  { value: 'real_estate', label: 'Real Estate', icon: 'Building2' },
  { value: 'bank', label: 'Bank Accounts', icon: 'Wallet' },
  { value: 'retirement', label: '401k/IRA', icon: 'PiggyBank' },
  { value: 'crypto_other', label: 'Other Crypto', icon: 'Coins' },
  { value: 'insurance', label: 'Life Insurance', icon: 'Shield' },
  { value: 'other', label: 'Other Assets', icon: 'Package' },
];

export default function EstateSecurity() {
  const [btcPrice, setBtcPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [protocolFormOpen, setProtocolFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingProtocol, setEditingProtocol] = useState(null);
  const [activeTab, setActiveTab] = useState('custody');
  const [showProtocolPreview, setShowProtocolPreview] = useState(false);
  const [deadMansSwitchEnabled, setDeadMansSwitchEnabled] = useState(false);
  const [lastCheckin, setLastCheckin] = useState(null);
  const queryClient = useQueryClient();

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
  }, []);

  const currentPrice = btcPrice || 97000;

  const [formData, setFormData] = useState({
    item_type: 'custody_location',
    title: '',
    description: '',
    custody_type: 'hardware_wallet',
    asset_type: 'btc',
    btc_amount: '',
    usd_value: '',
    beneficiary_name: '',
    beneficiary_allocation_percent: '',
    beneficiary_email: '',
    reminder_date: '',
    reminder_frequency: '',
    last_verified: '',
    notes: '',
    access_instructions: '',
    linked_holding_id: '',
  });

  const [protocolForm, setProtocolForm] = useState({
    title: '',
    custody_location_id: '',
    step_number: 1,
    instruction: '',
    location_hint: '',
    requires_passphrase: false,
    passphrase_hint: '',
    verification_method: '',
    notes: '',
  });

  const { data: estateItems = [] } = useQuery({
    queryKey: ['estateItems'],
    queryFn: () => base44.entities.EstateItem.list(),
  });

  const { data: holdings = [] } = useQuery({
    queryKey: ['holdings'],
    queryFn: () => base44.entities.Holding.list(),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => base44.entities.Account.list(),
  });

  const { data: recoveryProtocols = [] } = useQuery({
    queryKey: ['recoveryProtocols'],
    queryFn: () => base44.entities.RecoveryProtocol.list(),
  });

  const { data: userSettings = [] } = useQuery({
    queryKey: ['userSettings'],
    queryFn: () => base44.entities.UserSettings.list(),
  });

  // Mutations
  const createItem = useMutation({
    mutationFn: (data) => base44.entities.EstateItem.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['estateItems'] }); setFormOpen(false); resetForm(); },
  });

  const updateItem = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EstateItem.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['estateItems'] }); setFormOpen(false); setEditingItem(null); resetForm(); },
  });

  const deleteItem = useMutation({
    mutationFn: (id) => base44.entities.EstateItem.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['estateItems'] }),
  });

  const createProtocol = useMutation({
    mutationFn: (data) => base44.entities.RecoveryProtocol.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['recoveryProtocols'] }); setProtocolFormOpen(false); resetProtocolForm(); },
  });

  const updateProtocol = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RecoveryProtocol.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['recoveryProtocols'] }); setProtocolFormOpen(false); setEditingProtocol(null); resetProtocolForm(); },
  });

  const deleteProtocol = useMutation({
    mutationFn: (id) => base44.entities.RecoveryProtocol.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recoveryProtocols'] }),
  });

  const resetForm = () => {
    setFormData({
      item_type: 'custody_location', title: '', description: '', custody_type: 'hardware_wallet',
      asset_type: 'btc', btc_amount: '', usd_value: '', beneficiary_name: '', beneficiary_allocation_percent: '', 
      beneficiary_email: '', reminder_date: '', reminder_frequency: '', last_verified: '', notes: '', access_instructions: '',
      linked_holding_id: '',
    });
  };

  const resetProtocolForm = () => {
    setProtocolForm({
      title: '', custody_location_id: '', step_number: 1, instruction: '',
      location_hint: '', requires_passphrase: false, passphrase_hint: '', verification_method: '', notes: '',
    });
  };

  useEffect(() => {
    if (editingItem) {
      setFormData({
        item_type: editingItem.item_type || 'custody_location',
        title: editingItem.title || '',
        description: editingItem.description || '',
        custody_type: editingItem.custody_type || 'hardware_wallet',
        asset_type: editingItem.description?.includes('asset_type:') 
          ? editingItem.description.split('asset_type:')[1]?.split(',')[0] 
          : 'btc',
        btc_amount: editingItem.btc_amount || '',
        usd_value: editingItem.description?.includes('usd_value:') 
          ? editingItem.description.split('usd_value:')[1]?.split(',')[0] 
          : '',
        beneficiary_name: editingItem.beneficiary_name || '',
        beneficiary_allocation_percent: editingItem.beneficiary_allocation_percent || '',
        beneficiary_email: editingItem.beneficiary_email || '',
        reminder_date: editingItem.reminder_date || '',
        reminder_frequency: editingItem.reminder_frequency || '',
        last_verified: editingItem.last_verified || '',
        notes: editingItem.notes || '',
        access_instructions: editingItem.description?.includes('access:') 
          ? editingItem.description.split('access:')[1] 
          : '',
        linked_holding_id: editingItem.linked_holding_id || '',
      });
    }
  }, [editingItem]);

  useEffect(() => {
    if (editingProtocol) {
      setProtocolForm({
        title: editingProtocol.title || '',
        custody_location_id: editingProtocol.custody_location_id || '',
        step_number: editingProtocol.step_number || 1,
        instruction: editingProtocol.instruction || '',
        location_hint: editingProtocol.location_hint || '',
        requires_passphrase: editingProtocol.requires_passphrase || false,
        passphrase_hint: editingProtocol.passphrase_hint || '',
        verification_method: editingProtocol.verification_method || '',
        notes: editingProtocol.notes || '',
      });
    }
  }, [editingProtocol]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const securityScore = formData.item_type === 'custody_location' && formData.asset_type === 'btc'
      ? SECURITY_SCORES[formData.custody_type] || 5
      : 0;
    
    // Store extra fields in description for non-BTC assets
    const descParts = [];
    if (formData.asset_type) descParts.push(`asset_type:${formData.asset_type}`);
    if (formData.usd_value) descParts.push(`usd_value:${formData.usd_value}`);
    if (formData.access_instructions) descParts.push(`access:${formData.access_instructions}`);
    
    const data = {
      ...formData,
      description: descParts.join(','),
      btc_amount: parseFloat(formData.btc_amount) || 0,
      security_score: securityScore,
      beneficiary_allocation_percent: parseFloat(formData.beneficiary_allocation_percent) || 0,
      linked_holding_id: formData.linked_holding_id || null,
    };
    
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data });
    } else {
      createItem.mutate(data);
    }
  };

  const handleSubmitProtocol = (e) => {
    e.preventDefault();
    const data = {
      ...protocolForm,
      step_number: parseInt(protocolForm.step_number) || 1,
    };
    
    if (editingProtocol) {
      updateProtocol.mutate({ id: editingProtocol.id, data });
    } else {
      createProtocol.mutate(data);
    }
  };

  // Filter by type
  const custodyLocations = estateItems.filter(i => i.item_type === 'custody_location');
  const btcCustody = custodyLocations.filter(c => !c.description?.includes('asset_type:') || c.description?.includes('asset_type:btc'));
  const manualOtherAssets = custodyLocations.filter(c => c.description?.includes('asset_type:') && !c.description?.includes('asset_type:btc'));
  const otherAssetEstateItems = estateItems.filter(i => i.item_type === 'other_asset');
  const beneficiaries = estateItems.filter(i => i.item_type === 'beneficiary');
  const reminders = estateItems.filter(i => i.item_type === 'reminder');
  const protocols = estateItems.filter(i => i.item_type === 'security_protocol');

  // Get non-BTC holdings grouped by account
  const nonBtcHoldings = holdings.filter(h => h.ticker !== 'BTC' && h.asset_type !== 'crypto');
  const btcHoldings = holdings.filter(h => h.ticker === 'BTC');
  
  // Group non-BTC holdings by account
  const holdingsByAccount = nonBtcHoldings.reduce((acc, h) => {
    const accountId = h.account_id || 'unassigned';
    if (!acc[accountId]) acc[accountId] = [];
    acc[accountId].push(h);
    return acc;
  }, {});

  // Calculate allocated BTC from existing custody locations
  const allocatedBtcByHolding = btcCustody.reduce((acc, c) => {
    if (c.linked_holding_id) {
      acc[c.linked_holding_id] = (acc[c.linked_holding_id] || 0) + (c.btc_amount || 0);
    }
    return acc;
  }, {});

  // Combine manual other assets with auto-synced holdings
  const otherAssets = manualOtherAssets;

  // Calculate weighted security score - only for BTC custody (crypto assets that need security scoring)
  const btcCustodyForScore = custodyLocations.filter(c => 
    !c.description?.includes('asset_type:') || c.description?.includes('asset_type:btc') || c.description?.includes('asset_type:crypto_other')
  );
  const totalCustodyBtc = btcCustodyForScore.reduce((sum, c) => sum + (c.btc_amount || 0), 0);
  
  // Calculate total value for weighting (BTC value + other crypto value)
  const getTotalValueForScoring = () => {
    let totalValue = 0;
    btcCustodyForScore.forEach(c => {
      if (c.btc_amount) {
        totalValue += c.btc_amount * currentPrice;
      }
    });
    return totalValue;
  };
  const totalValueForScoring = getTotalValueForScoring();
  
  // Weighted security score based on USD value of holdings
  const weightedSecurityScore = btcCustodyForScore.length > 0 && totalValueForScoring > 0
    ? btcCustodyForScore.reduce((sum, c) => {
        const custodyValue = (c.btc_amount || 0) * currentPrice;
        const weight = custodyValue / totalValueForScoring;
        const score = c.security_score || SECURITY_SCORES[c.custody_type] || 5;
        return sum + (score * weight);
      }, 0)
    : 0;

  const totalBtcHoldings = holdings.filter(h => h.ticker === 'BTC').reduce((sum, h) => sum + h.quantity, 0);
  const totalAllocation = beneficiaries.reduce((sum, b) => sum + (b.beneficiary_allocation_percent || 0), 0);

  // Protocol coverage
  const custodyWithProtocols = custodyLocations.filter(c => 
    recoveryProtocols.some(p => p.custody_location_id === c.id)
  ).length;
  const protocolCoverage = custodyLocations.length > 0 
    ? (custodyWithProtocols / custodyLocations.length) * 100 
    : 0;

  // Dead man's switch check
  const settings = userSettings[0] || {};
  const monthsSinceCheckin = settings.dead_mans_switch_last_checkin 
    ? differenceInMonths(new Date(), new Date(settings.dead_mans_switch_last_checkin))
    : null;

  const handleCheckin = async () => {
    const existingSettings = userSettings[0];
    const data = {
      dead_mans_switch_enabled: true,
      dead_mans_switch_last_checkin: new Date().toISOString(),
      dead_mans_switch_email_sent: false,
    };
    
    if (existingSettings) {
      await base44.entities.UserSettings.update(existingSettings.id, data);
    } else {
      await base44.entities.UserSettings.create(data);
    }
    queryClient.invalidateQueries({ queryKey: ['userSettings'] });
  };

  const handleTestDeadMansSwitch = async () => {
    if (!confirm('This will test the Dead Mans Switch by sending the inheritance protocol to all beneficiaries with email addresses. Continue?')) {
      return;
    }
    
    try {
      const { data } = await base44.functions.invoke('checkDeadMansSwitch', {});
      alert(`Test complete!\n\nChecked users: ${data.total_users_checked}\n\nResults: ${JSON.stringify(data.results, null, 2)}`);
    } catch (error) {
      alert(`Test failed: ${error.message}`);
    }
  };

  // Calculate total value of other assets
  const totalOtherAssetsValue = otherAssets.reduce((sum, a) => {
    const usdVal = a.description?.includes('usd_value:') 
      ? parseFloat(a.description.split('usd_value:')[1]?.split(',')[0]) || 0 
      : 0;
    return sum + usdVal;
  }, 0);

  // Calculate total estate value (BTC + other manual assets + auto-synced holdings)
  const totalHoldingsValue = nonBtcHoldings.reduce((sum, h) => sum + (h.quantity * (h.current_price || 0)), 0);
  const totalEstateValue = (totalCustodyBtc * currentPrice) + totalOtherAssetsValue + totalHoldingsValue;

  // Generate protocol report
  const generateProtocolReport = () => {
    let report = `INHERITANCE PROTOCOL DOCUMENT\n`;
    report += `Generated: ${format(new Date(), 'MMMM d, yyyy')}\n`;
    report += `${'='.repeat(60)}\n\n`;

    report += `ESTATE SUMMARY\n`;
    report += `${'-'.repeat(40)}\n`;
    report += `Bitcoin Holdings: ${totalCustodyBtc.toFixed(8)} BTC ($${(totalCustodyBtc * currentPrice).toLocaleString()})\n`;
    report += `Other Assets Value: $${totalOtherAssetsValue.toLocaleString()}\n`;
    report += `Total Estate Value: $${((totalCustodyBtc * currentPrice) + totalOtherAssetsValue).toLocaleString()}\n\n`;

    report += `BENEFICIARIES\n`;
    report += `${'-'.repeat(40)}\n`;
    beneficiaries.forEach(b => {
      report += `• ${b.beneficiary_name || b.title}: ${b.beneficiary_allocation_percent}%\n`;
      if (b.beneficiary_email) report += `  Email: ${b.beneficiary_email}\n`;
    });
    report += `\n`;

    report += `BITCOIN CUSTODY & RECOVERY\n`;
    report += `${'-'.repeat(40)}\n`;
    btcCustody.forEach(custody => {
      report += `\n📍 ${custody.title}\n`;
      report += `   Type: ${custody.custody_type?.replace('_', ' ')}\n`;
      report += `   Amount: ${custody.btc_amount || 0} BTC\n`;
      report += `   Security Score: ${custody.security_score || SECURITY_SCORES[custody.custody_type]}/10\n`;
      
      const custodyProtocols = recoveryProtocols
        .filter(p => p.custody_location_id === custody.id)
        .sort((a, b) => a.step_number - b.step_number);
      
      if (custodyProtocols.length > 0) {
        report += `\n   RECOVERY STEPS:\n`;
        custodyProtocols.forEach(p => {
          report += `   ${p.step_number}. ${p.instruction}\n`;
          if (p.location_hint) report += `      Location: ${p.location_hint}\n`;
          if (p.requires_passphrase) report += `      ⚠️ Requires passphrase: ${p.passphrase_hint}\n`;
          if (p.verification_method) report += `      Verify: ${p.verification_method}\n`;
        });
      } else {
        report += `   ⚠️ NO RECOVERY PROTOCOL DEFINED\n`;
      }
    });

    if (otherAssets.length > 0) {
      report += `\n\nOTHER ASSETS CHECKLIST\n`;
      report += `${'-'.repeat(40)}\n`;
      otherAssets.forEach(asset => {
        const assetType = asset.description?.includes('asset_type:') 
          ? asset.description.split('asset_type:')[1]?.split(',')[0] 
          : 'other';
        const usdValue = asset.description?.includes('usd_value:') 
          ? parseFloat(asset.description.split('usd_value:')[1]?.split(',')[0]) || 0 
          : 0;
        const accessInstructions = asset.description?.includes('access:') 
          ? asset.description.split('access:')[1] 
          : '';
        
        report += `\n☐ ${asset.title}\n`;
        report += `   Type: ${ASSET_TYPES.find(t => t.value === assetType)?.label || assetType}\n`;
        if (usdValue) report += `   Value: $${usdValue.toLocaleString()}\n`;
        if (accessInstructions) report += `   Access: ${accessInstructions}\n`;
        if (asset.notes) report += `   Notes: ${asset.notes}\n`;
      });
    }

    report += `\n\n${'='.repeat(60)}\n`;
    report += `IMPORTANT: Keep this document secure. Store copies with your\n`;
    report += `attorney, in a safe deposit box, and with trusted family members.\n`;

    return report;
  };

  const handleDownloadProtocol = () => {
    const report = generateProtocolReport();
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inheritance-protocol-${format(new Date(), 'yyyy-MM-dd')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEmailProtocol = async () => {
    try {
      const report = generateProtocolReport();
      const emails = beneficiaries
        .filter(b => b.beneficiary_email)
        .map(b => b.beneficiary_email);
      
      if (emails.length === 0) {
        alert('No beneficiary emails configured. Add email addresses to beneficiaries first.');
        return;
      }
      
      const results = [];
      for (const email of emails) {
        try {
          await base44.integrations.Core.SendEmail({
            to: email,
            subject: 'Orange Plan - Inheritance Protocol Document',
            body: `This is your inheritance protocol document from Orange Plan.\n\n${report}`,
          });
          results.push({ email, success: true });
        } catch (err) {
          results.push({ email, success: false, error: err.message });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;
      
      if (failedCount === 0) {
        alert(`✓ Protocol successfully sent to ${successCount} beneficiaries.`);
      } else {
        const failedEmails = results.filter(r => !r.success).map(r => `${r.email}: ${r.error}`).join('\n');
        alert(`Sent to ${successCount} beneficiaries.\n\nFailed (${failedCount}):\n${failedEmails}`);
      }
    } catch (error) {
      alert(`Error sending protocol: ${error.message}`);
    }
  };

  const custodyIcons = {
    hardware_wallet: HardDrive,
    exchange: Building2,
    multisig: Key,
    passphrase: Lock,
    custodian: Building2,
    hot_wallet: Zap,
  };

  const custodyColors = {
    hardware_wallet: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    exchange: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    multisig: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
    passphrase: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    custodian: 'bg-rose-400/10 text-rose-400 border-rose-400/20',
    hot_wallet: 'bg-red-400/10 text-red-400 border-red-400/20',
  };

  const openAddForm = (type) => {
    resetForm();
    setFormData(prev => ({ ...prev, item_type: type }));
    setEditingItem(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Estate Planning</h1>
          <p className="text-zinc-500 mt-1">Custody, inheritance, and recovery protocols</p>
        </div>
        <Button variant="outline" onClick={handleDownloadProtocol} className="bg-transparent border-zinc-700">
          <Download className="w-4 h-4 mr-2" />
          Export Protocol
        </Button>
      </div>

      {/* Dead Man's Switch Banner */}
      <div className={cn(
        "card-premium rounded-2xl p-6 border",
        settings.dead_mans_switch_enabled 
          ? monthsSinceCheckin >= 5 ? "border-rose-500/30 bg-rose-500/5" : "border-emerald-500/30"
          : "border-zinc-800/50"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              "p-3 rounded-xl",
              settings.dead_mans_switch_enabled ? "bg-emerald-400/10" : "bg-zinc-800"
            )}>
              <Clock className={cn("w-6 h-6", settings.dead_mans_switch_enabled ? "text-emerald-400" : "text-zinc-500")} />
            </div>
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                Dead Man's Switch
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger><Info className="w-4 h-4 text-zinc-500" /></TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-zinc-800 border-zinc-700">
                      <p>After 6 months of no check-ins, your inheritance protocol will be automatically emailed to all beneficiaries.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </h3>
              <p className="text-sm text-zinc-500 mt-0.5">
                Automatically sends your inheritance protocol to beneficiaries if you don't check in for 6 months
              </p>
              {settings.dead_mans_switch_enabled ? (
                <p className="text-sm text-zinc-500">
                  Last check-in: {settings.dead_mans_switch_last_checkin 
                    ? format(new Date(settings.dead_mans_switch_last_checkin), 'MMM d, yyyy')
                    : 'Never'
                  }
                  {monthsSinceCheckin !== null && (
                    <span className={cn("ml-2", monthsSinceCheckin >= 5 ? "text-rose-400" : "text-zinc-400")}>
                      ({monthsSinceCheckin} months ago)
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-sm text-zinc-500">Not enabled - your beneficiaries won't receive automatic notifications</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCheckin} className={settings.dead_mans_switch_enabled ? "bg-emerald-600 hover:bg-emerald-700" : "brand-gradient"}>
              <CheckCircle className="w-4 h-4 mr-2" />
              {settings.dead_mans_switch_enabled ? "Check In" : "Enable & Check In"}
            </Button>
            {settings.dead_mans_switch_enabled && (
              <Button onClick={handleTestDeadMansSwitch} variant="outline" className="bg-transparent border-zinc-700" size="sm">
                Test
              </Button>
            )}
          </div>
        </div>
        {monthsSinceCheckin >= 5 && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <p className="text-sm text-rose-400">⚠️ Warning: You haven't checked in for {monthsSinceCheckin} months. After 6 months, your protocol will be sent to beneficiaries.</p>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-premium rounded-xl p-5 border border-zinc-800/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Security Score</span>
            <div className={cn(
              "p-1.5 rounded-lg",
              weightedSecurityScore >= 7 ? "bg-emerald-400/10" : weightedSecurityScore >= 4 ? "bg-amber-400/10" : "bg-rose-400/10"
            )}>
              <Shield className={cn(
                "w-4 h-4",
                weightedSecurityScore >= 7 ? "text-emerald-400" : weightedSecurityScore >= 4 ? "text-amber-400" : "text-rose-400"
              )} />
            </div>
          </div>
          <p className={cn(
            "text-2xl font-bold",
            weightedSecurityScore >= 7 ? "text-emerald-400" : weightedSecurityScore >= 4 ? "text-amber-400" : "text-rose-400"
          )}>
            {weightedSecurityScore.toFixed(1)}/10
          </p>
          <Progress value={weightedSecurityScore * 10} className="h-2 mt-3 bg-zinc-800" />
          <p className="text-xs text-zinc-500 mt-2">Weighted by BTC amount</p>
        </div>

        <div className="card-premium rounded-xl p-5 border border-zinc-800/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Protocol Coverage</span>
            <div className={cn("p-1.5 rounded-lg", protocolCoverage === 100 ? "bg-emerald-400/10" : "bg-amber-400/10")}>
              <FileText className={cn("w-4 h-4", protocolCoverage === 100 ? "text-emerald-400" : "text-amber-400")} />
            </div>
          </div>
          <p className={cn("text-2xl font-bold", protocolCoverage === 100 ? "text-emerald-400" : "text-amber-400")}>
            {protocolCoverage.toFixed(0)}%
          </p>
          <p className="text-xs text-zinc-500 mt-1">{custodyWithProtocols}/{custodyLocations.length} locations documented</p>
        </div>

        <div className="card-premium rounded-xl p-5 border border-zinc-800/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Total Custody</span>
            <div className="p-1.5 rounded-lg bg-orange-400/10">
              <Key className="w-4 h-4 text-orange-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-orange-400">{totalCustodyBtc.toFixed(4)} BTC</p>
          <p className="text-xs text-zinc-500 mt-1">${(totalCustodyBtc * currentPrice).toLocaleString()}</p>
        </div>

        <div className="card-premium rounded-xl p-5 border border-zinc-800/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Beneficiaries</span>
            <div className={cn("p-1.5 rounded-lg", totalAllocation === 100 ? "bg-emerald-400/10" : "bg-amber-400/10")}>
              <Users className={cn("w-4 h-4", totalAllocation === 100 ? "text-emerald-400" : "text-amber-400")} />
            </div>
          </div>
          <p className="text-2xl font-bold text-purple-400">{beneficiaries.length}</p>
          <p className={cn("text-xs mt-1", totalAllocation === 100 ? "text-emerald-400" : "text-amber-400")}>
            {totalAllocation}% allocated
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-zinc-800/50 p-1 flex-wrap">
          <TabsTrigger value="custody" className="data-[state=active]:bg-zinc-700">Bitcoin Custody</TabsTrigger>
          <TabsTrigger value="other-assets" className="data-[state=active]:bg-zinc-700">Other Assets</TabsTrigger>
          <TabsTrigger value="protocols" className="data-[state=active]:bg-zinc-700">Recovery Protocols</TabsTrigger>
          <TabsTrigger value="beneficiaries" className="data-[state=active]:bg-zinc-700">Beneficiaries</TabsTrigger>
          <TabsTrigger value="checklist" className="data-[state=active]:bg-zinc-700">
            <ClipboardList className="w-4 h-4 mr-1" />
            Full Checklist
          </TabsTrigger>
        </TabsList>

        {/* Custody Tab */}
        <TabsContent value="custody">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold">Bitcoin Custody Locations</h3>
                <p className="text-sm text-zinc-500">Security scores are auto-calculated based on custody type</p>
              </div>
              <Button size="sm" onClick={() => { resetForm(); setFormData(prev => ({ ...prev, item_type: 'custody_location', asset_type: 'btc' })); setFormOpen(true); }} className="brand-gradient text-white">
                <Plus className="w-4 h-4 mr-2" />
                Add BTC Location
              </Button>
            </div>

            {/* Security Score Legend */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-6 p-4 rounded-xl bg-zinc-800/30">
              {Object.entries(SECURITY_SCORES).map(([type, score]) => {
                const Icon = custodyIcons[type] || Wallet;
                const displayName = type === 'passphrase' ? 'HW + Passphrase' : type.replace('_', ' ');
                return (
                  <div key={type} className="flex items-center gap-2 text-sm">
                    <Icon className="w-4 h-4 text-zinc-400" />
                    <span className="text-zinc-500 capitalize">{displayName}</span>
                    <span className={cn(
                      "font-semibold",
                      score >= 8 ? "text-emerald-400" : score >= 5 ? "text-amber-400" : "text-rose-400"
                    )}>{score}</span>
                  </div>
                );
              })}
            </div>

            {/* BTC Holdings to Allocate - only show if there are unallocated holdings */}
            {btcHoldings.length > 0 && btcHoldings.some(h => (h.quantity - (allocatedBtcByHolding[h.id] || 0)) > 0) && (
              <div className="mb-6 p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
                <h4 className="text-sm font-medium text-orange-400 mb-3">Bitcoin Holdings to Allocate</h4>
                <div className="space-y-2">
                  {btcHoldings.filter(h => (h.quantity - (allocatedBtcByHolding[h.id] || 0)) > 0).map(h => {
                    const account = accounts.find(a => a.id === h.account_id);
                    const allocated = allocatedBtcByHolding[h.id] || 0;
                    const remaining = h.quantity - allocated;
                    return (
                      <div key={h.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50">
                        <div>
                          <p className="font-medium">{account?.name || h.asset_name || 'Bitcoin'}</p>
                          <p className="text-xs text-zinc-500">{h.quantity.toFixed(8)} BTC total</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-amber-400">
                            {remaining.toFixed(8)} unallocated
                          </p>
                          <p className="text-xs text-zinc-500">{allocated.toFixed(8)} in custody locations</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {btcCustody.length === 0 ? (
              <div className="text-center py-12">
                <Key className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">No Bitcoin custody locations added yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {btcCustody.map((location) => {
                  const Icon = custodyIcons[location.custody_type] || Wallet;
                  const colorClass = custodyColors[location.custody_type] || 'bg-zinc-400/10 text-zinc-400';
                  const autoScore = SECURITY_SCORES[location.custody_type] || 5;
                  const hasProtocol = recoveryProtocols.some(p => p.custody_location_id === location.id);

                  return (
                    <div key={location.id} className="p-5 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors border border-zinc-800">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center border", colorClass)}>
                            <Icon className="w-6 h-6" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-lg">{location.title}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm text-zinc-500 capitalize">{location.custody_type?.replace('_', ' ')}</span>
  
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!hasProtocol && (
                            <Badge variant="outline" className="border-amber-400/50 text-amber-400">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              No Protocol
                            </Badge>
                          )}
                          <button onClick={() => { setEditingItem(location); setFormOpen(true); }} className="p-2 rounded-lg hover:bg-zinc-700">
                            <Pencil className="w-4 h-4 text-zinc-400" />
                          </button>
                          <button onClick={() => deleteItem.mutate(location.id)} className="p-2 rounded-lg hover:bg-rose-600/50">
                            <Trash2 className="w-4 h-4 text-zinc-400" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-zinc-500">BTC Amount</p>
                          <p className="text-lg font-semibold text-orange-400">{location.btc_amount || 0} BTC</p>
                        </div>
                        <div>
                          <p className="text-sm text-zinc-500">Security Score</p>
                          <p className={cn(
                            "text-lg font-semibold",
                            autoScore >= 8 ? "text-emerald-400" : autoScore >= 5 ? "text-amber-400" : "text-rose-400"
                          )}>
                            {autoScore}/10
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-zinc-500">USD Value</p>
                          <p className="text-lg font-semibold text-zinc-300">${((location.btc_amount || 0) * currentPrice).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-zinc-500">Last Verified</p>
                          <p className="text-lg font-semibold text-zinc-300">
                            {location.last_verified ? format(new Date(location.last_verified), 'MMM d, yyyy') : 'Never'}
                          </p>
                        </div>
                      </div>

                      {/* Security features */}
                      <div className="mt-4 pt-4 border-t border-zinc-800">
                        <div className="flex flex-wrap gap-2">
                          {SECURITY_FEATURES[location.custody_type]?.map((feature, i) => (
                            <Badge key={i} variant="outline" className="text-xs border-zinc-700 text-zinc-400">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Verification Steps */}
                      {VERIFICATION_STEPS[location.custody_type] && (
                        <div className="mt-4 pt-4 border-t border-zinc-800">
                          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Verification Checklist</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {VERIFICATION_STEPS[location.custody_type].map((step, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm text-zinc-400">
                                <CheckCircle className="w-3.5 h-3.5 text-zinc-600" />
                                {step}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Other Assets Tab */}
        <TabsContent value="other-assets">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold">Other Assets</h3>
                <p className="text-sm text-zinc-500">Auto-synced from your holdings, grouped by account</p>
              </div>
              <Button size="sm" onClick={() => { resetForm(); setFormData(prev => ({ ...prev, item_type: 'custody_location', asset_type: 'stocks' })); setFormOpen(true); }} className="brand-gradient text-white">
                <Plus className="w-4 h-4 mr-2" />
                Add Other Asset
              </Button>
            </div>

            {/* Auto-synced Holdings by Account */}
            {Object.keys(holdingsByAccount).length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-zinc-400 mb-3">From Your Holdings</h4>
                <div className="space-y-4">
                  {Object.entries(holdingsByAccount).map(([accountId, accountHoldings]) => {
                    const account = accounts.find(a => a.id === accountId);
                    const accountName = account?.name || (accountId === 'unassigned' ? 'Unassigned' : 'Unknown Account');
                    const accountType = account?.account_type?.replace(/_/g, ' ') || '';
                    const totalValue = accountHoldings.reduce((sum, h) => sum + (h.quantity * (h.current_price || 0)), 0);
                    
                    return (
                      <div key={accountId} className="p-4 rounded-xl bg-zinc-800/30 border border-zinc-800">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-400/10 flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                              <p className="font-medium">{accountName}</p>
                              <p className="text-xs text-zinc-500 capitalize">{accountType}</p>
                            </div>
                          </div>
                          <p className="text-lg font-semibold text-emerald-400">${totalValue.toLocaleString()}</p>
                        </div>
                        <div className="space-y-2">
                          {accountHoldings.map(h => (
                            <div key={h.id} className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/50">
                              <div className="flex items-center gap-2">
                                {h.asset_type === 'real_estate' ? <Building2 className="w-4 h-4 text-purple-400" /> :
                                 h.asset_type === 'stocks' ? <TrendingUp className="w-4 h-4 text-blue-400" /> :
                                 h.asset_type === 'bonds' ? <PiggyBank className="w-4 h-4 text-amber-400" /> :
                                 <Package className="w-4 h-4 text-zinc-400" />}
                                <span className="text-sm">{h.asset_name}</span>
                                <span className="text-xs text-zinc-500">{h.ticker}</span>
                              </div>
                              <span className="text-sm text-zinc-300">${(h.quantity * (h.current_price || 0)).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Manually Added Assets */}
            {otherAssets.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-zinc-400 mb-3">Manually Added</h4>
              </div>
            )}

            {otherAssets.length === 0 && Object.keys(holdingsByAccount).length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">No other assets yet</p>
                <p className="text-xs text-zinc-600 mt-2">Add holdings in Summary or manually add assets here</p>
              </div>
            ) : otherAssets.length === 0 ? null : (
              <div className="space-y-4">
                {otherAssets.map((asset) => {
                  const assetType = asset.description?.includes('asset_type:') 
                    ? asset.description.split('asset_type:')[1]?.split(',')[0] 
                    : 'other';
                  const usdValue = asset.description?.includes('usd_value:') 
                    ? parseFloat(asset.description.split('usd_value:')[1]?.split(',')[0]) || 0 
                    : 0;
                  const accessInstructions = asset.description?.includes('access:') 
                    ? asset.description.split('access:')[1] 
                    : '';
                  const assetInfo = ASSET_TYPES.find(t => t.value === assetType);
                  
                  return (
                    <div key={asset.id} className="p-5 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors border border-zinc-800">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-blue-400/10 flex items-center justify-center border border-blue-400/20">
                            {assetType === 'stocks' && <TrendingUp className="w-6 h-6 text-blue-400" />}
                            {assetType === 'real_estate' && <Building2 className="w-6 h-6 text-purple-400" />}
                            {assetType === 'bank' && <Wallet className="w-6 h-6 text-emerald-400" />}
                            {assetType === 'retirement' && <PiggyBank className="w-6 h-6 text-amber-400" />}
                            {assetType === 'crypto_other' && <Coins className="w-6 h-6 text-orange-400" />}
                            {assetType === 'insurance' && <Shield className="w-6 h-6 text-cyan-400" />}
                            {(assetType === 'other' || !assetType) && <Package className="w-6 h-6 text-zinc-400" />}
                          </div>
                          <div>
                            <h4 className="font-semibold text-lg">{asset.title}</h4>
                            <span className="text-sm text-zinc-500">{assetInfo?.label || 'Other Asset'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setEditingItem(asset); setFormOpen(true); }} className="p-2 rounded-lg hover:bg-zinc-700">
                            <Pencil className="w-4 h-4 text-zinc-400" />
                          </button>
                          <button onClick={() => deleteItem.mutate(asset.id)} className="p-2 rounded-lg hover:bg-rose-600/50">
                            <Trash2 className="w-4 h-4 text-zinc-400" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-zinc-500">Estimated Value</p>
                          <p className="text-lg font-semibold text-emerald-400">${usdValue.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-zinc-500">Last Verified</p>
                          <p className="text-lg font-semibold text-zinc-300">
                            {asset.last_verified ? format(new Date(asset.last_verified), 'MMM d, yyyy') : 'Never'}
                          </p>
                        </div>
                      </div>

                      {accessInstructions && (
                        <div className="mt-4 p-3 rounded-lg bg-zinc-800/50">
                          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Access Instructions</p>
                          <p className="text-sm text-zinc-300">{accessInstructions}</p>
                        </div>
                      )}

                      {asset.notes && (
                        <p className="mt-3 text-sm text-zinc-500">{asset.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Total Other Assets */}
            {(otherAssets.length > 0 || Object.keys(holdingsByAccount).length > 0) && (
              <div className="mt-6 p-4 rounded-xl bg-zinc-800/30 border border-zinc-700">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Total Other Assets Value</span>
                  <span className="text-xl font-bold text-emerald-400">
                    ${(totalOtherAssetsValue + nonBtcHoldings.reduce((sum, h) => sum + (h.quantity * (h.current_price || 0)), 0)).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Recovery Protocols Tab */}
        <TabsContent value="protocols">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold">Recovery Protocols</h3>
                <p className="text-sm text-zinc-500">Step-by-step instructions for each custody location</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowProtocolPreview(!showProtocolPreview)} className="bg-transparent border-zinc-700">
                  {showProtocolPreview ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                  Preview
                </Button>
                <Button size="sm" onClick={() => { setEditingProtocol(null); resetProtocolForm(); setProtocolFormOpen(true); }} className="brand-gradient text-white">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Step
                </Button>
              </div>
            </div>

            {showProtocolPreview && (
              <div className="mb-6 p-6 rounded-xl bg-zinc-900 border border-zinc-700 font-mono text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">
                {generateProtocolReport()}
              </div>
            )}

            {custodyLocations.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">Add custody locations first to create recovery protocols</p>
              </div>
            ) : (
              <div className="space-y-6">
                {custodyLocations.map(custody => {
                  const custodyProtocols = recoveryProtocols
                    .filter(p => p.custody_location_id === custody.id)
                    .sort((a, b) => a.step_number - b.step_number);
                  
                  const Icon = custodyIcons[custody.custody_type] || Wallet;
                  
                  return (
                    <div key={custody.id} className="p-5 rounded-xl bg-zinc-800/30 border border-zinc-800">
                      <div className="flex items-center gap-3 mb-4">
                        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", custodyColors[custody.custody_type])}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-semibold">{custody.title}</h4>
                          <p className="text-sm text-zinc-500">{custody.btc_amount || 0} BTC</p>
                        </div>
                        {custodyProtocols.length === 0 && (
                          <Badge className="ml-auto bg-amber-500/20 text-amber-400">Needs Protocol</Badge>
                        )}
                      </div>

                      {custodyProtocols.length > 0 ? (
                        <div className="space-y-2 ml-4 border-l-2 border-zinc-700 pl-4">
                          {custodyProtocols.map(protocol => (
                            <div key={protocol.id} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors">
                              <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-xs font-semibold text-orange-400 shrink-0">
                                {protocol.step_number}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium">{protocol.instruction}</p>
                                {protocol.location_hint && (
                                  <p className="text-sm text-zinc-500 mt-1">📍 {protocol.location_hint}</p>
                                )}
                                {protocol.requires_passphrase && (
                                  <p className="text-sm text-purple-400 mt-1">🔐 Passphrase: {protocol.passphrase_hint}</p>
                                )}
                                {protocol.verification_method && (
                                  <p className="text-sm text-zinc-500 mt-1">✓ {protocol.verification_method}</p>
                                )}
                              </div>
                              <div className="flex gap-1">
                                <button onClick={() => { setEditingProtocol(protocol); setProtocolFormOpen(true); }} className="p-1.5 rounded hover:bg-zinc-700">
                                  <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                                </button>
                                <button onClick={() => deleteProtocol.mutate(protocol.id)} className="p-1.5 rounded hover:bg-rose-600/50">
                                  <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <button 
                          onClick={() => { resetProtocolForm(); setProtocolForm(prev => ({ ...prev, custody_location_id: custody.id })); setProtocolFormOpen(true); }}
                          className="w-full p-4 rounded-lg border-2 border-dashed border-zinc-700 hover:border-orange-500/50 transition-colors text-zinc-500 hover:text-orange-400"
                        >
                          <Plus className="w-5 h-5 mx-auto mb-1" />
                          Add recovery steps for this location
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        </TabsContent>

        {/* Beneficiaries Tab */}
        <TabsContent value="beneficiaries">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold">Beneficiaries</h3>
                <p className={cn("text-sm", totalAllocation === 100 ? "text-emerald-400" : "text-amber-400")}>
                  Total allocated: {totalAllocation}% of ${totalEstateValue.toLocaleString()} estate
                </p>
              </div>
              <Button size="sm" onClick={() => { resetForm(); setFormData(prev => ({ ...prev, item_type: 'beneficiary' })); setFormOpen(true); }} className="brand-gradient text-white">
                <Plus className="w-4 h-4 mr-2" />
                Add Beneficiary
              </Button>
            </div>

            {totalAllocation !== 100 && beneficiaries.length > 0 && (
              <div className={cn(
                "p-4 rounded-xl mb-6 flex items-center gap-3",
                totalAllocation > 100 ? "bg-rose-400/10 border border-rose-400/20" : "bg-amber-400/10 border border-amber-400/20"
              )}>
                <AlertTriangle className={cn("w-5 h-5", totalAllocation > 100 ? "text-rose-400" : "text-amber-400")} />
                <p className={cn("text-sm", totalAllocation > 100 ? "text-rose-400" : "text-amber-400")}>
                  {totalAllocation > 100 ? `Allocation exceeds 100% by ${totalAllocation - 100}%` : `${100 - totalAllocation}% of estate is unallocated`}
                </p>
              </div>
            )}

            {beneficiaries.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">No beneficiaries added yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {beneficiaries.map((beneficiary) => (
                  <div key={beneficiary.id} className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors border border-zinc-800">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-purple-400/10 flex items-center justify-center">
                        <span className="text-purple-400 font-semibold text-lg">
                          {beneficiary.beneficiary_name?.[0]?.toUpperCase() || '?'}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{beneficiary.beneficiary_name || beneficiary.title}</p>
                        {beneficiary.beneficiary_email ? (
                          <p className="text-sm text-zinc-500">{beneficiary.beneficiary_email}</p>
                        ) : (
                          <p className="text-sm text-amber-400">No email configured</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xl font-bold text-purple-400">{beneficiary.beneficiary_allocation_percent || 0}%</p>
                        <p className="text-xs text-zinc-500">
                          ≈ ${(((beneficiary.beneficiary_allocation_percent || 0) / 100) * totalEstateValue).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingItem(beneficiary); setFormOpen(true); }} className="p-1.5 rounded-lg hover:bg-zinc-700">
                          <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                        <button onClick={() => deleteItem.mutate(beneficiary.id)} className="p-1.5 rounded-lg hover:bg-rose-600/50">
                          <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Full Checklist Tab */}
        <TabsContent value="checklist">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold">Complete Inheritance Checklist</h3>
                <p className="text-sm text-zinc-500">Everything your beneficiaries need in one place</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleDownloadProtocol} className="bg-transparent border-zinc-700">
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
                <Button onClick={handleEmailProtocol} className="brand-gradient text-white">
                  <Mail className="w-4 h-4 mr-2" />
                  Email to Beneficiaries
                </Button>
              </div>
            </div>

            {/* Estate Summary */}
            <div className="p-5 rounded-xl bg-orange-500/5 border border-orange-500/20 mb-6">
              <h4 className="font-semibold text-orange-400 mb-4">Estate Summary</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-zinc-500">Bitcoin Holdings</p>
                  <p className="text-xl font-bold text-orange-400">{totalCustodyBtc.toFixed(4)} BTC</p>
                  <p className="text-sm text-zinc-500">${(totalCustodyBtc * currentPrice).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Other Assets</p>
                  <p className="text-xl font-bold text-emerald-400">${totalOtherAssetsValue.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Total Estate Value</p>
                  <p className="text-xl font-bold text-white">${((totalCustodyBtc * currentPrice) + totalOtherAssetsValue).toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Beneficiaries Summary */}
            <div className="p-5 rounded-xl bg-zinc-800/30 border border-zinc-800 mb-6">
              <h4 className="font-semibold mb-4">Beneficiaries</h4>
              {beneficiaries.length === 0 ? (
                <p className="text-zinc-500 text-sm">No beneficiaries configured</p>
              ) : (
                <div className="space-y-2">
                  {beneficiaries.map(b => (
                    <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-400/10 flex items-center justify-center">
                          <span className="text-purple-400 font-semibold text-sm">
                            {b.beneficiary_name?.[0]?.toUpperCase() || '?'}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{b.beneficiary_name || b.title}</p>
                          {b.beneficiary_email && <p className="text-xs text-zinc-500">{b.beneficiary_email}</p>}
                        </div>
                      </div>
                      <span className="text-purple-400 font-semibold">{b.beneficiary_allocation_percent}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bitcoin Assets Checklist */}
            <div className="p-5 rounded-xl bg-zinc-800/30 border border-zinc-800 mb-6">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-orange-400" />
                Bitcoin Recovery Checklist
              </h4>
              {btcCustody.length === 0 ? (
                <p className="text-zinc-500 text-sm">No Bitcoin custody locations configured</p>
              ) : (
                <div className="space-y-3">
                  {btcCustody.map(custody => {
                    const hasProtocol = recoveryProtocols.some(p => p.custody_location_id === custody.id);
                    return (
                      <div key={custody.id} className="p-4 rounded-lg bg-zinc-800/50">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium">{custody.title}</p>
                            <p className="text-sm text-zinc-500">{custody.btc_amount} BTC • {custody.custody_type?.replace('_', ' ')}</p>
                          </div>
                          {hasProtocol ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400">Protocol Ready</Badge>
                          ) : (
                            <Badge className="bg-amber-500/20 text-amber-400">Needs Protocol</Badge>
                          )}
                        </div>
                        {hasProtocol && (
                          <div className="mt-3 space-y-1">
                            {recoveryProtocols
                              .filter(p => p.custody_location_id === custody.id)
                              .sort((a, b) => a.step_number - b.step_number)
                              .map(p => (
                                <div key={p.id} className="flex items-center gap-2 text-sm">
                                  <span className="text-orange-400 font-mono">{p.step_number}.</span>
                                  <span className="text-zinc-300">{p.instruction}</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Other Assets Checklist */}
            {otherAssets.length > 0 && (
              <div className="p-5 rounded-xl bg-zinc-800/30 border border-zinc-800">
                <h4 className="font-semibold mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-400" />
                  Other Assets Checklist
                </h4>
                <div className="space-y-3">
                  {otherAssets.map(asset => {
                    const assetType = asset.description?.includes('asset_type:') 
                      ? asset.description.split('asset_type:')[1]?.split(',')[0] 
                      : 'other';
                    const usdValue = asset.description?.includes('usd_value:') 
                      ? parseFloat(asset.description.split('usd_value:')[1]?.split(',')[0]) || 0 
                      : 0;
                    const accessInstructions = asset.description?.includes('access:') 
                      ? asset.description.split('access:')[1] 
                      : '';
                    
                    return (
                      <div key={asset.id} className="p-4 rounded-lg bg-zinc-800/50">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle className="w-4 h-4 text-zinc-600" />
                          <p className="font-medium">{asset.title}</p>
                          <span className="text-emerald-400 ml-auto">${usdValue.toLocaleString()}</span>
                        </div>
                        {accessInstructions && (
                          <p className="text-sm text-zinc-400 ml-6">Access: {accessInstructions}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Item Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Item' : 'Add Item'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Title</Label>
              <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="bg-zinc-900 border-zinc-800" required />
            </div>

            {formData.item_type === 'custody_location' && (
              <>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Asset Type</Label>
                  <Select value={formData.asset_type} onValueChange={(value) => setFormData({ ...formData, asset_type: value })}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                      {ASSET_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.asset_type === 'btc' ? (
                  <>
                    {/* Link to existing BTC holding */}
                    {btcHoldings.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-zinc-400">Link to Holding (Optional)</Label>
                        <Select value={formData.linked_holding_id} onValueChange={(value) => setFormData({ ...formData, linked_holding_id: value })}>
                          <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue placeholder="Select a BTC holding to allocate from" /></SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                            <SelectItem value={null}>No link (manual entry)</SelectItem>
                            {btcHoldings.map(h => {
                              const account = accounts.find(a => a.id === h.account_id);
                              const allocated = allocatedBtcByHolding[h.id] || 0;
                              const remaining = h.quantity - allocated;
                              if (remaining <= 0 && formData.linked_holding_id !== h.id) return null;
                              return (
                                <SelectItem key={h.id} value={h.id}>
                                  {account?.name || h.asset_name} - {remaining.toFixed(8)} BTC available
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        {formData.linked_holding_id && (
                          <p className="text-xs text-zinc-500">
                            Linking helps track how your BTC holdings are distributed across custody locations
                          </p>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-zinc-400">Custody Type</Label>
                        <Select value={formData.custody_type} onValueChange={(value) => setFormData({ ...formData, custody_type: value })}>
                          <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                            <SelectItem value="multisig">Multisig (10/10)</SelectItem>
                            <SelectItem value="passphrase">Passphrase/25th Word (9/10)</SelectItem>
                            <SelectItem value="hardware_wallet">Hardware Wallet (8/10)</SelectItem>
                            <SelectItem value="custodian">Custodian (6/10)</SelectItem>
                            <SelectItem value="exchange">Exchange (4/10)</SelectItem>
                            <SelectItem value="hot_wallet">Hot Wallet (2/10)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-zinc-400">BTC Amount</Label>
                        <Input type="number" step="any" value={formData.btc_amount} onChange={(e) => setFormData({ ...formData, btc_amount: e.target.value })} className="bg-zinc-900 border-zinc-800" />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label className="text-zinc-400">Estimated Value (USD)</Label>
                      <Input type="number" value={formData.usd_value} onChange={(e) => setFormData({ ...formData, usd_value: e.target.value })} placeholder="100000" className="bg-zinc-900 border-zinc-800" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-400">Access Instructions</Label>
                      <Input value={formData.access_instructions} onChange={(e) => setFormData({ ...formData, access_instructions: e.target.value })} placeholder="Account #, login info location, contact person..." className="bg-zinc-900 border-zinc-800" />
                    </div>
                  </>
                )}

                {/* Only show Last Verified for BTC and other crypto assets */}
                {(formData.asset_type === 'btc' || formData.asset_type === 'crypto_other') && (
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Last Verified</Label>
                    <Input type="date" value={formData.last_verified} onChange={(e) => setFormData({ ...formData, last_verified: e.target.value })} className="bg-zinc-900 border-zinc-800" />
                  </div>
                )}
              </>
            )}

            {formData.item_type === 'beneficiary' && (
              <>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Name</Label>
                  <Input value={formData.beneficiary_name} onChange={(e) => setFormData({ ...formData, beneficiary_name: e.target.value })} className="bg-zinc-900 border-zinc-800" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Email (for dead man's switch)</Label>
                  <Input type="email" value={formData.beneficiary_email} onChange={(e) => setFormData({ ...formData, beneficiary_email: e.target.value })} placeholder="beneficiary@email.com" className="bg-zinc-900 border-zinc-800" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Allocation %</Label>
                  <Input type="number" min="0" max="100" value={formData.beneficiary_allocation_percent} onChange={(e) => setFormData({ ...formData, beneficiary_allocation_percent: e.target.value })} className="bg-zinc-900 border-zinc-800" />
                </div>
              </>
            )}



            <div className="space-y-2">
              <Label className="text-zinc-400">Notes</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="bg-zinc-900 border-zinc-800 resize-none" rows={2} />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="flex-1 bg-transparent border-zinc-800">Cancel</Button>
              <Button type="submit" className="flex-1 brand-gradient text-white font-semibold">{editingItem ? 'Update' : 'Add'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Protocol Form Dialog */}
      <Dialog open={protocolFormOpen} onOpenChange={setProtocolFormOpen}>
        <DialogContent className="bg-[#0f0f10] border-zinc-800 text-zinc-100 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProtocol ? 'Edit Recovery Step' : 'Add Recovery Step'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitProtocol} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Custody Location</Label>
              <Select value={protocolForm.custody_location_id} onValueChange={(value) => setProtocolForm({ ...protocolForm, custody_location_id: value })}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
                  {custodyLocations.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.title} ({c.btc_amount || 0} BTC)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400">Step #</Label>
                <Input type="number" min="1" value={protocolForm.step_number} onChange={(e) => setProtocolForm({ ...protocolForm, step_number: e.target.value })} className="bg-zinc-900 border-zinc-800" />
              </div>
              <div className="col-span-3 space-y-2">
                <Label className="text-zinc-400">Title</Label>
                <Input value={protocolForm.title} onChange={(e) => setProtocolForm({ ...protocolForm, title: e.target.value })} placeholder="e.g., Locate hardware wallet" className="bg-zinc-900 border-zinc-800" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400">Instruction</Label>
              <Textarea value={protocolForm.instruction} onChange={(e) => setProtocolForm({ ...protocolForm, instruction: e.target.value })} placeholder="Detailed step-by-step instruction..." className="bg-zinc-900 border-zinc-800 resize-none" rows={3} required />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400">Location Hint</Label>
              <Input value={protocolForm.location_hint} onChange={(e) => setProtocolForm({ ...protocolForm, location_hint: e.target.value })} placeholder="Where to find this item (without revealing secrets)" className="bg-zinc-900 border-zinc-800" />
            </div>

            <div className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/30">
              <Switch 
                checked={protocolForm.requires_passphrase} 
                onCheckedChange={(checked) => setProtocolForm({ ...protocolForm, requires_passphrase: checked })}
                className="data-[state=checked]:bg-orange-500 data-[state=unchecked]:bg-zinc-700"
              />
              <div className="flex-1">
                <Label className="text-zinc-300">Requires Passphrase</Label>
                {protocolForm.requires_passphrase && (
                  <Input value={protocolForm.passphrase_hint} onChange={(e) => setProtocolForm({ ...protocolForm, passphrase_hint: e.target.value })} placeholder="Hint for passphrase (not the actual passphrase!)" className="bg-zinc-900 border-zinc-800 mt-2" />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400">Verification Method</Label>
              <Input value={protocolForm.verification_method} onChange={(e) => setProtocolForm({ ...protocolForm, verification_method: e.target.value })} placeholder="How to verify this step succeeded" className="bg-zinc-900 border-zinc-800" />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setProtocolFormOpen(false)} className="flex-1 bg-transparent border-zinc-800">Cancel</Button>
              <Button type="submit" className="flex-1 brand-gradient text-white font-semibold">{editingProtocol ? 'Update' : 'Add'} Step</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}