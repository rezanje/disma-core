const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, '..', 'src', 'app', 'finance', 'approvals', 'page.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

// I will extract the new TabsContent and replace the old ones.
const newTabsContent = `          <TabsContent value="settlement" className="space-y-8">
            {sourcingSettlements.length === 0 ? (
              <EmptyState title="Sourcing Settlement Clear" desc="Tidak ada laporan Sourcing yang butuh persetujuan saat ini." />
            ) : (
              <div className="grid gap-8">
                {sourcingSettlements.map(purchase => {
                  const pItems = purchaseItems.filter(pi => pi.purchaseId === purchase.id && pi.isChecked)
                  const pOps = expenses.filter(e => e.purchaseId === purchase.id && e.status === 'Pending Audit' && e.category !== 'Setoran Pengembalian')
                  const pReimbs = reimbursements.filter(r => r.purchaseId === purchase.id && r.status === 'Pending')
                  const pReturn = expenses.find(e => e.purchaseId === purchase.id && e.category === 'Setoran Pengembalian')
                  
                  return (
                    <Card key={purchase.id} className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
                      <div className="flex flex-col xl:flex-row">
                        <div className="xl:w-1/3 p-8 bg-slate-50 border-r border-slate-100">
                           <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-6">Ref: {purchase.id.slice(0,8)}</h3>
                           <div className="space-y-4">
                              <div className="flex justify-between text-xs font-black uppercase"><span className="text-slate-400">Budget Given</span><span>{formatRupiah(purchase.budgetAmount || 0)}</span></div>
                              <div className="flex justify-between text-xs font-black uppercase"><span className="text-slate-400">Total HPP Barang</span><span className="text-slate-800">{formatRupiah(purchase.actualSpent || 0)}</span></div>
                              <div className="flex justify-between text-xs font-black uppercase"><span className="text-slate-400">Total Biaya Ops</span><span className="text-amber-500">{formatRupiah(pOps.reduce((s, e) => s + e.amount, 0))}</span></div>
                              <div className="flex justify-between text-xs font-black uppercase"><span className="text-slate-400">Total Reimburse/Kasbon</span><span className="text-rose-500">{formatRupiah(pReimbs.reduce((s, r) => s + r.amount, 0))}</span></div>
                              <div className="flex justify-between text-xs font-black uppercase pt-4 border-t border-slate-200"><span className="text-slate-400">Uang Sisa (Kembalian)</span><span className="text-emerald-500 font-black">{formatRupiah(purchase.changeReturned || 0)}</span></div>
                           </div>

                           {purchase.reconciliationProofUrl && (
                             <div 
                               className="mt-6 aspect-square w-full rounded-2xl bg-white border border-slate-200 p-2 cursor-pointer hover:border-indigo-400 transition-all overflow-hidden"
                               onClick={() => setPreviewImage(purchase.reconciliationProofUrl!)}
                             >
                                <img src={purchase.reconciliationProofUrl} className="w-full h-full object-cover rounded-xl" />
                             </div>
                           )}

                           <Button className="w-full h-14 mt-8 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px]" onClick={() => handleVerifyReconciliation(purchase.id)}><ShieldCheck className="w-4 h-4 mr-2" /> Setujui Sesi Sourcing Ini</Button>
                        </div>
                        <div className="xl:w-2/3 p-8">
                           <h4 className="text-[10px] font-black text-slate-400 uppercase mb-4">Rincian Penggunaan Dana</h4>
                           
                           <div className="mb-6">
                             <h5 className="text-[9px] font-black text-slate-400 uppercase mb-2 border-b border-slate-100 pb-2">HPP Barang (Market)</h5>
                             <div className="grid gap-2">
                               {pItems.map(item => (
                                  <div key={item.id} className="flex justify-between items-center p-3 bg-slate-50/50 rounded-xl">
                                     <span className="text-[10px] font-bold text-slate-800 uppercase">{products.find(p => p.id === item.productId)?.name}</span>
                                     <span className="text-[10px] font-black text-slate-900">{formatRupiah(item.actualUnitPrice * item.qtyPurchased)}</span>
                                  </div>
                               ))}
                               {pItems.length === 0 && <span className="text-[10px] text-slate-400 italic">Belum ada barang dibeli</span>}
                             </div>
                           </div>

                           <div className="mb-6">
                             <h5 className="text-[9px] font-black text-slate-400 uppercase mb-2 border-b border-slate-100 pb-2">Biaya Operasional Sourcing (Bensin, Parkir, Dll)</h5>
                             <div className="grid gap-2">
                               {pOps.map(op => (
                                  <div key={op.id} className="flex justify-between items-center p-3 bg-amber-50/50 rounded-xl">
                                     <span className="text-[10px] font-bold text-amber-800 uppercase">{op.category}: {op.description}</span>
                                     <span className="text-[10px] font-black text-amber-900">{formatRupiah(op.amount)}</span>
                                  </div>
                               ))}
                               {pOps.length === 0 && <span className="text-[10px] text-slate-400 italic">Tidak ada biaya ops tambahan</span>}
                             </div>
                           </div>

                           <div className="mb-6">
                             <h5 className="text-[9px] font-black text-slate-400 uppercase mb-2 border-b border-slate-100 pb-2">Pengajuan Kasbon / Talangan</h5>
                             <div className="grid gap-2">
                               {pReimbs.map(r => (
                                  <div key={r.id} className="flex justify-between items-center p-3 bg-rose-50/50 rounded-xl">
                                     <span className="text-[10px] font-bold text-rose-800 uppercase">{r.title}</span>
                                     <span className="text-[10px] font-black text-rose-900">{formatRupiah(r.amount)}</span>
                                  </div>
                               ))}
                               {pReimbs.length === 0 && <span className="text-[10px] text-slate-400 italic">Tidak ada nombokan/kasbon</span>}
                             </div>
                           </div>

                           {pReturn && (
                           <div>
                             <h5 className="text-[9px] font-black text-slate-400 uppercase mb-2 border-b border-slate-100 pb-2">Setoran Kembalian</h5>
                             <div className="flex justify-between items-center p-3 bg-emerald-50/50 rounded-xl">
                                <span className="text-[10px] font-bold text-emerald-800 uppercase">Sisa Uang Dikembalikan ke Bank</span>
                                <span className="text-[10px] font-black text-emerald-900">{formatRupiah(pReturn.amount)}</span>
                             </div>
                           </div>
                           )}

                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* ONLINE & LAINNYA TABS */}
          <TabsContent value="audit_online" className="space-y-8">
             {awaitingOnlineAudit.length === 0 ? (
               <EmptyState title="Online Audit Clear" desc="Semua belanja online sudah diverifikasi." />
             ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                   {awaitingOnlineAudit.map(exp => {
                      const user = users.find(u => u.id === exp.reporterId)
                      return (
                         <Card key={exp.id} className="border-none shadow-xl rounded-[2.5rem] bg-white group hover:scale-[1.02] transition-all">
                            <CardHeader className="p-6 pb-2">
                               <div className="flex justify-between items-start mb-4">
                                  <Badge className="bg-blue-50 text-blue-600 border-none font-black text-[9px] tracking-widest">HPP RECONCILIATION</Badge>
                                  <span className="text-[10px] font-black text-slate-400">{new Date(exp.date).toLocaleDateString()}</span>
                               </div>
                               <CardTitle className="text-sm font-black uppercase leading-tight text-slate-800 line-clamp-1">{exp.description}</CardTitle>
                               <CardDescription className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">BY {user?.name || 'ADMIN FINANCE'}</CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 pt-4 space-y-6">
                               <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50">
                                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">Nilai Transaksi</span>
                                  <span className="text-2xl font-black text-slate-900 leading-none">{formatRupiah(exp.amount)}</span>
                               </div>
                               <div className="flex gap-2 pt-2">
                                  <Button 
                                    variant="outline" 
                                    className="flex-1 h-12 rounded-2xl border-rose-100 text-rose-500 font-black uppercase text-[9px] hover:bg-rose-50"
                                    onClick={() => updateExpense(exp.id, { status: 'Rejected' })}
                                  >Tolak</Button>
                                  <Button 
                                    className="flex-[2] h-12 rounded-2xl bg-slate-900 text-white font-black uppercase text-[9px] shadow-lg shadow-slate-200"
                                    onClick={() => handleAuditExpense(exp.id, 'Approved')}
                                  >Approve Audit</Button>
                               </div>
                            </CardContent>
                         </Card>
                      )
                   })}
                </div>
             )}
          </TabsContent>

          <TabsContent value="audit_ops_lain" className="space-y-8">
             {pendingExpensesLain.length === 0 ? (
               <EmptyState title="Audit Ops Clear" desc="Semua biaya operasional di luar Sourcing sudah diverifikasi." />
             ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                   {pendingExpensesLain.map(exp => {
                      const user = users.find(u => u.id === exp.reporterId)
                      return (
                         <Card key={exp.id} className="border-none shadow-xl rounded-[2.5rem] bg-white group hover:scale-[1.02] transition-all">
                            <CardHeader className="p-6 pb-2">
                               <div className="flex justify-between items-start mb-4">
                                  <Badge className="bg-slate-50 text-slate-600 border-none font-black text-[9px] tracking-widest">{exp.category}</Badge>
                                  <span className="text-[10px] font-black text-slate-400">{new Date(exp.date).toLocaleDateString()}</span>
                               </div>
                               <CardTitle className="text-sm font-black uppercase leading-tight text-slate-800 line-clamp-1">{exp.description}</CardTitle>
                               <CardDescription className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">BY {user?.name || 'ADMIN FINANCE'}</CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 pt-4 space-y-6">
                               <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50">
                                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">Nilai Transaksi</span>
                                  <span className="text-2xl font-black text-slate-900 leading-none">{formatRupiah(exp.amount)}</span>
                               </div>
                               <div className="flex gap-2 pt-2">
                                  <Button 
                                    variant="outline" 
                                    className="flex-1 h-12 rounded-2xl border-rose-100 text-rose-500 font-black uppercase text-[9px] hover:bg-rose-50"
                                    onClick={() => updateExpense(exp.id, { status: 'Rejected' })}
                                  >Tolak</Button>
                                  <Button 
                                    className="flex-[2] h-12 rounded-2xl bg-slate-900 text-white font-black uppercase text-[9px] shadow-lg shadow-slate-200"
                                    onClick={() => handleAuditExpense(exp.id, 'Approved')}
                                  >Approve Audit</Button>
                               </div>
                            </CardContent>
                         </Card>
                      )
                   })}
                </div>
             )}
          </TabsContent>`;

const regex = /<TabsContent value="audit".*?<\/TabsContent>[\s\S]*?<TabsContent value="reimburse".*?<\/TabsContent>[\s\S]*?<TabsContent value="rekon".*?<\/TabsContent>/;
content = content.replace(regex, newTabsContent);

fs.writeFileSync(pagePath, content, 'utf8');
console.log('TabsContent replaced!');
