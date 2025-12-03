import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, differenceInDays, differenceInMonths } from 'date-fns';
import { Plus, Pencil, Trash2, Shield, Key, Users, FileText, Bell, CheckCircle, AlertTriangle, Lock, HardDrive, Building2, Wallet, Mail, Clock, Download, Eye, EyeOff, Zap, Copy, ChevronRight, Info } from 'lucide-react';
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
  cold_storage: 9,
  hardware_wallet: 8,
  custodian: 6,
  exchange: 4,
  hot_wallet: 2,
  other: 5,
};

const SECURITY_FEATURES = {
  multisig: ['Multi-signature protection', '2-of-3 or 3-of-5 keys', 'Distributed custody', 'No single point of failure'],
  cold_storage: ['Air-gapped device', 'Never connected to internet', 'Maximum security'],
  hardware_wallet: ['Dedicated secure chip', 'PIN protected', 'Physical device'],
  custodian: ['Insured holdings', 'Regulated entity', 'Third-party risk'],
  exchange: ['Hot wallet exposure', 'Counterparty risk', 'Convenient but risky'],
  hot_wallet: ['Always online', 'Highest attack surface', 'Only for small amounts'],
};

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
    btc_amount: '',
    beneficiary_name: '',
    beneficiary_allocation_percent: '',
    beneficiary_email: '',
    reminder_date: '',
    reminder_frequency: '',
    last_verified: '',
    notes: '',
    has_passphrase: false,
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
      btc_amount: '', beneficiary_name: '', beneficiary_allocation_percent: '', beneficiary_email: '',
      reminder_date: '', reminder_frequency: '', last_verified: '', notes: '', has_passphrase: false,
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
        btc_amount: editingItem.btc_amount || '',
        beneficiary_name: editingItem.beneficiary_name || '',
        beneficiary_allocation_percent: editingItem.beneficiary_allocation_percent || '',
        beneficiary_email: editingItem.beneficiary_email || '',
        reminder_date: editingItem.reminder_date || '',
        reminder_frequency: editingItem.reminder_frequency || '',
        last_verified: editingItem.last_verified || '',
        notes: editingItem.notes || '',
        has_passphrase: editingItem.has_passphrase || false,
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
    const securityScore = formData.item_type === 'custody_location' 
      ? SECURITY_SCORES[formData.custody_type] + (formData.has_passphrase ? 1 : 0)
      : 0;
    
    const data = {
      ...formData,
      btc_amount: parseFloat(formData.btc_amount) || 0,
      security_score: Math.min(10, securityScore),
      beneficiary_allocation_percent: parseFloat(formData.beneficiary_allocation_percent) || 0,
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
  const beneficiaries = estateItems.filter(i => i.item_type === 'beneficiary');
  const reminders = estateItems.filter(i => i.item_type === 'reminder');
  const protocols = estateItems.filter(i => i.item_type === 'security_protocol');

  // Calculate weighted security score
  const totalCustodyBtc = custodyLocations.reduce((sum, c) => sum + (c.btc_amount || 0), 0);
  const weightedSecurityScore = custodyLocations.length > 0 && totalCustodyBtc > 0
    ? custodyLocations.reduce((sum, c) => {
        const weight = (c.btc_amount || 0) / totalCustodyBtc;
        return sum + (c.security_score || SECURITY_SCORES[c.custody_type] || 5) * weight;
      }, 0)
    : 0;

  const btcHoldings = holdings.filter(h => h.ticker === 'BTC').reduce((sum, h) => sum + h.quantity, 0);
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

  // Generate protocol report
  const generateProtocolReport = () => {
    let report = `INHERITANCE PROTOCOL DOCUMENT\n`;
    report += `Generated: ${format(new Date(), 'MMMM d, yyyy')}\n`;
    report += `Total BTC in Custody: ${totalCustodyBtc.toFixed(8)} BTC\n`;
    report += `Current Value: $${(totalCustodyBtc * currentPrice).toLocaleString()}\n\n`;
    report += `${'='.repeat(50)}\n\n`;

    report += `BENEFICIARIES\n`;
    report += `${'-'.repeat(30)}\n`;
    beneficiaries.forEach(b => {
      report += `• ${b.beneficiary_name || b.title}: ${b.beneficiary_allocation_percent}%\n`;
      if (b.beneficiary_email) report += `  Email: ${b.beneficiary_email}\n`;
    });
    report += `\n`;

    report += `CUSTODY LOCATIONS & RECOVERY STEPS\n`;
    report += `${'-'.repeat(30)}\n`;
    custodyLocations.forEach(custody => {
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
    const report = generateProtocolReport();
    const emails = beneficiaries
      .filter(b => b.beneficiary_email)
      .map(b => b.beneficiary_email);
    
    if (emails.length === 0) {
      alert('No beneficiary emails configured. Add email addresses to beneficiaries first.');
      return;
    }
    
    for (const email of emails) {
      await base44.integrations.Core.SendEmail({
        to: email,
        subject: 'Orange Plan - Inheritance Protocol Document',
        body: `This is your inheritance protocol document from Orange Plan.\n\n${report}`,
      });
    }
    alert(`Protocol sent to ${emails.length} beneficiaries.`);
  };

  const custodyIcons = {
    hardware_wallet: HardDrive,
    exchange: Building2,
    multisig: Key,
    cold_storage: Lock,
    custodian: Building2,
    hot_wallet: Zap,
    other: Wallet,
  };

  const custodyColors = {
    hardware_wallet: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    exchange: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    multisig: 'bg-purple-400/10 text-purple-400 border-purple-400/20',
    cold_storage: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
    custodian: 'bg-rose-400/10 text-rose-400 border-rose-400/20',
    hot_wallet: 'bg-red-400/10 text-red-400 border-red-400/20',
    other: 'bg-zinc-400/10 text-zinc-400 border-zinc-400/20',
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadProtocol} className="bg-transparent border-zinc-700">
            <Download className="w-4 h-4 mr-2" />
            Export Protocol
          </Button>
          <Button onClick={() => { setEditingItem(null); resetForm(); setFormOpen(true); }} className="brand-gradient text-white font-semibold hover:opacity-90 shadow-lg shadow-orange-500/20">
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>
        </div>
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
          <Button onClick={handleCheckin} className={settings.dead_mans_switch_enabled ? "bg-emerald-600 hover:bg-emerald-700" : "brand-gradient"}>
            <CheckCircle className="w-4 h-4 mr-2" />
            {settings.dead_mans_switch_enabled ? "Check In" : "Enable & Check In"}
          </Button>
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
          <TabsTrigger value="custody" className="data-[state=active]:bg-zinc-700">Custody</TabsTrigger>
          <TabsTrigger value="protocols" className="data-[state=active]:bg-zinc-700">Recovery Protocols</TabsTrigger>
          <TabsTrigger value="beneficiaries" className="data-[state=active]:bg-zinc-700">Beneficiaries</TabsTrigger>
          <TabsTrigger value="reminders" className="data-[state=active]:bg-zinc-700">Reminders</TabsTrigger>
        </TabsList>

        {/* Custody Tab */}
        <TabsContent value="custody">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold">Custody Locations</h3>
                <p className="text-sm text-zinc-500">Security scores are auto-calculated based on custody type</p>
              </div>
              <Button size="sm" onClick={() => openAddForm('custody_location')} className="brand-gradient text-white">
                <Plus className="w-4 h-4 mr-2" />
                Add Location
              </Button>
            </div>

            {/* Security Score Legend */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-6 p-4 rounded-xl bg-zinc-800/30">
              {Object.entries(SECURITY_SCORES).map(([type, score]) => {
                const Icon = custodyIcons[type] || Wallet;
                return (
                  <div key={type} className="flex items-center gap-2 text-sm">
                    <Icon className="w-4 h-4 text-zinc-400" />
                    <span className="text-zinc-500 capitalize">{type.replace('_', ' ')}</span>
                    <span className={cn(
                      "font-semibold",
                      score >= 8 ? "text-emerald-400" : score >= 5 ? "text-amber-400" : "text-rose-400"
                    )}>{score}</span>
                  </div>
                );
              })}
            </div>

            {custodyLocations.length === 0 ? (
              <div className="text-center py-12">
                <Key className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">No custody locations added yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {custodyLocations.map((location) => {
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
                              {location.has_passphrase && (
                                <Badge variant="outline" className="text-xs border-purple-400/50 text-purple-400">+Passphrase</Badge>
                              )}
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
                            {autoScore}{location.has_passphrase ? '+1' : ''}/10
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
                    </div>
                  );
                })}
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

            {/* Email Protocol Button */}
            {beneficiaries.some(b => b.beneficiary_email) && (
              <div className="mt-6 p-4 rounded-xl bg-zinc-800/30 border border-zinc-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Send Protocol to Beneficiaries</p>
                    <p className="text-sm text-zinc-500">Email the inheritance protocol to all beneficiaries with emails configured</p>
                  </div>
                  <Button onClick={handleEmailProtocol} variant="outline" className="border-zinc-700">
                    <Mail className="w-4 h-4 mr-2" />
                    Send Now
                  </Button>
                </div>
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
                  Total allocated: {totalAllocation}%
                </p>
              </div>
              <Button size="sm" onClick={() => openAddForm('beneficiary')} className="brand-gradient text-white">
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
                          ≈ {(((beneficiary.beneficiary_allocation_percent || 0) / 100) * totalCustodyBtc).toFixed(4)} BTC
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

        {/* Reminders Tab */}
        <TabsContent value="reminders">
          <div className="card-premium rounded-2xl p-6 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold">Protocol Reminders</h3>
              <Button size="sm" onClick={() => openAddForm('reminder')} className="brand-gradient text-white">
                <Plus className="w-4 h-4 mr-2" />
                Add Reminder
              </Button>
            </div>
            {reminders.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-500">No reminders set</p>
              </div>
            ) : (
              <div className="space-y-3">
                {reminders.map((reminder) => {
                  const daysUntil = reminder.reminder_date ? differenceInDays(new Date(reminder.reminder_date), new Date()) : null;
                  const isOverdue = daysUntil !== null && daysUntil < 0;
                  const isUpcoming = daysUntil !== null && daysUntil >= 0 && daysUntil <= 7;

                  return (
                    <div key={reminder.id} className={cn(
                      "flex items-center justify-between p-4 rounded-xl transition-colors border",
                      isOverdue ? "bg-rose-400/10 border-rose-500/30" : isUpcoming ? "bg-amber-400/10 border-amber-500/30" : "bg-zinc-800/30 border-zinc-800"
                    )}>
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          isOverdue ? "bg-rose-400/20" : isUpcoming ? "bg-amber-400/20" : "bg-blue-400/10"
                        )}>
                          <Bell className={cn(
                            "w-5 h-5",
                            isOverdue ? "text-rose-400" : isUpcoming ? "text-amber-400" : "text-blue-400"
                          )} />
                        </div>
                        <div>
                          <p className="font-medium">{reminder.title}</p>
                          <div className="flex items-center gap-2 text-sm text-zinc-500">
                            {reminder.reminder_date && <span>{format(new Date(reminder.reminder_date), 'MMM d, yyyy')}</span>}
                            {reminder.reminder_frequency && <><span>•</span><span className="capitalize">{reminder.reminder_frequency}</span></>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {daysUntil !== null && (
                          <Badge variant="outline" className={cn(
                            isOverdue ? "border-rose-400/50 text-rose-400" : isUpcoming ? "border-amber-400/50 text-amber-400" : "border-zinc-600 text-zinc-400"
                          )}>
                            {isOverdue ? `${Math.abs(daysUntil)}d overdue` : `${daysUntil}d`}
                          </Badge>
                        )}
                        <div className="flex gap-1">
                          <button onClick={() => { setEditingItem(reminder); setFormOpen(true); }} className="p-1.5 rounded-lg hover:bg-zinc-700">
                            <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                          </button>
                          <button onClick={() => deleteItem.mutate(reminder.id)} className="p-1.5 rounded-lg hover:bg-rose-600/50">
                            <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
              <Label className="text-zinc-400">Item Type</Label>
              <Select value={formData.item_type} onValueChange={(value) => setFormData({ ...formData, item_type: value })}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  <SelectItem value="custody_location">Custody Location</SelectItem>
                  <SelectItem value="beneficiary">Beneficiary</SelectItem>
                  <SelectItem value="reminder">Reminder</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-400">Title</Label>
              <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="bg-zinc-900 border-zinc-800" required />
            </div>

            {formData.item_type === 'custody_location' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-400">Custody Type</Label>
                    <Select value={formData.custody_type} onValueChange={(value) => setFormData({ ...formData, custody_type: value })}>
                      <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="multisig">Multisig (10/10)</SelectItem>
                        <SelectItem value="cold_storage">Cold Storage (9/10)</SelectItem>
                        <SelectItem value="hardware_wallet">Hardware Wallet (8/10)</SelectItem>
                        <SelectItem value="custodian">Custodian (6/10)</SelectItem>
                        <SelectItem value="exchange">Exchange (4/10)</SelectItem>
                        <SelectItem value="hot_wallet">Hot Wallet (2/10)</SelectItem>
                        <SelectItem value="other">Other (5/10)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400">BTC Amount</Label>
                    <Input type="number" step="any" value={formData.btc_amount} onChange={(e) => setFormData({ ...formData, btc_amount: e.target.value })} className="bg-zinc-900 border-zinc-800" />
                  </div>
                </div>
                <div className="flex items-center gap-4 p-3 rounded-xl bg-zinc-800/30">
                  <Switch checked={formData.has_passphrase} onCheckedChange={(checked) => setFormData({ ...formData, has_passphrase: checked })} />
                  <div>
                    <Label className="text-zinc-300">Uses Passphrase</Label>
                    <p className="text-xs text-zinc-500">Adds +1 to security score</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Last Verified</Label>
                  <Input type="date" value={formData.last_verified} onChange={(e) => setFormData({ ...formData, last_verified: e.target.value })} className="bg-zinc-900 border-zinc-800" />
                </div>
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

            {formData.item_type === 'reminder' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-400">Reminder Date</Label>
                  <Input type="date" value={formData.reminder_date} onChange={(e) => setFormData({ ...formData, reminder_date: e.target.value })} className="bg-zinc-900 border-zinc-800" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-400">Frequency</Label>
                  <Select value={formData.reminder_frequency || ''} onValueChange={(value) => setFormData({ ...formData, reminder_frequency: value })}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800"><SelectValue placeholder="One-time" /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      <SelectItem value="one_time">One-time</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
                <SelectContent className="bg-zinc-900 border-zinc-800">
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
              <Switch checked={protocolForm.requires_passphrase} onCheckedChange={(checked) => setProtocolForm({ ...protocolForm, requires_passphrase: checked })} />
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