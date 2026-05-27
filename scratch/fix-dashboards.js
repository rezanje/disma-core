const fs = require('fs');
const path = require('path');

// 1. Fix FinanceDashboard.tsx
const financeFile = path.join(__dirname, '../src/components/dashboard/FinanceDashboard.tsx');
if (fs.existsSync(financeFile)) {
  let content = fs.readFileSync(financeFile, 'utf8');

  // Insert helper if not present
  if (!content.includes('const formatInvoiceId')) {
    const target = 'export default function FinanceDashboard() {';
    const helper = `const formatInvoiceId = (id: string) => {
  if (!id) return ""
  if (id.startsWith("inv-import-")) {
    return \`INV-#IMP-\${id.replace("inv-import-", "").toUpperCase()}\`
  }
  if (id.startsWith("inv-")) {
    return \`INV-#\${id.replace("inv-", "").substring(0, 6).toUpperCase()}\`
  }
  return \`INV-#\${id.substring(0, 6).toUpperCase()}\`
}

`;
    content = content.replace(target, helper + target);
  }

  // Restore the deleted block inside collectionPriorities map
  const deletedTarget = `                  <div className="flex-1 min-w-0">

                    <div className="flex items-center gap-2">`;
  const restoredBlock = `                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-black text-slate-800 truncate block max-w-[150px]">{item.clientName}</span>
                      <Badge variant="outline" className="font-mono text-[9px] text-slate-400">
                        {formatInvoiceId(item.invoice.id)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">`;
  content = content.replace(deletedTarget, restoredBlock);

  // Replace recent invoices id
  const recentTarget = `<span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">INV-#{inv.id.substring(0,6)}</span>`;
  const recentReplacement = `<span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{formatInvoiceId(inv.id)}</span>`;
  content = content.replace(recentTarget, recentReplacement);

  fs.writeFileSync(financeFile, content, 'utf8');
  console.log('FinanceDashboard.tsx successfully updated!');
} else {
  console.error('FinanceDashboard.tsx not found!');
}
