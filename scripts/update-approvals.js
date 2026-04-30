const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, '..', 'src', 'app', 'finance', 'approvals', 'page.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

// Replace TabsList
content = content.replace(
  /<TabsList className="bg-slate-100\/80 p-2 h-16 rounded-\[2rem\].*?<\/TabsList>/s,
  `<TabsList className="bg-slate-100/80 p-2 h-16 rounded-[2rem] -mx-2 md:mx-0 mb-10 overflow-x-auto overflow-y-hidden justify-start md:justify-center border border-white scrollbar-hide">
            <TabsTrigger value="pencairan" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <Wallet className="w-4 h-4 text-emerald-500" /> Pencairan PO ({needsTransfer.length})
            </TabsTrigger>
            <TabsTrigger value="settlement" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <CheckCircle2 className="w-4 h-4 text-orange-500" /> Sourcing Settlement ({sourcingSettlements.length})
            </TabsTrigger>
            <TabsTrigger value="audit_online" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <Globe className="w-4 h-4 text-blue-500" /> Audit Online ({awaitingOnlineAudit.length})
            </TabsTrigger>
            <TabsTrigger value="audit_ops_lain" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <FileText className="w-4 h-4 text-slate-500" /> Audit Ops ({pendingExpensesLain.length})
            </TabsTrigger>
            <TabsTrigger value="delivery" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <Truck className="w-4 h-4 text-blue-500" /> Delivery ({awaitingDeliveryAudit.length})
            </TabsTrigger>
          </TabsList>`
);

// We need to define sourcingSettlements and pendingExpensesLain
const filterLogicReplacement = `
  // --- DATA FILTERING ---
  const needsTransfer = purchases.filter(p => {
    const items = purchaseItems.filter(pi => pi.purchaseId === p.id)
    const hasMarketItems = items.some(pi => pi.purchaseMethod === 'Pasar' || !pi.purchaseMethod)
    return p.status === 'Pending' && !p.budgetTransferDate && hasMarketItems
  })
  
  const sourcingSettlements = purchases.filter(p => {
    if (!p.budgetTransferDate) return false;
    if (p.reconciliationStatus === 'Terverifikasi') return false;
    const hasPendingExpenses = expenses.some(e => e.purchaseId === p.id && e.status === 'Pending Audit');
    const hasPendingReimbs = reimbursements.some(r => r.purchaseId === p.id && r.status === 'Pending');
    return p.reconciliationStatus === 'Laporan Masuk' || hasPendingExpenses || hasPendingReimbs;
  }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const pendingExpensesLain = expenses.filter(e => e.status === 'Pending Audit' && !e.purchaseId && e.category !== 'Belanja Online' && e.category !== 'Sourcing (HPP)');
  const awaitingOnlineAudit = expenses.filter(e => e.status === 'Pending Audit' && (e.category === 'Belanja Online' || e.category === 'Sourcing (HPP)'));
  const awaitingDeliveryAudit = deliveries.filter(d => d.status === 'Awaiting Audit')
`;

content = content.replace(/\/\/ --- DATA FILTERING ---[\s\S]*?\/\/ --- ACTIONS ---/, filterLogicReplacement + '\n  // --- ACTIONS ---');

fs.writeFileSync(pagePath, content, 'utf8');
console.log('Tabs updated');
