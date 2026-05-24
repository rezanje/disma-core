# AR Collections Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tabs structure to the AR Collections (Daily Chase) page to allow the finance admin to view either individual invoices, consolidated client debt summary, or overdue alerts.

**Architecture:** We will use the shadcn/ui Tabs component. We will calculate client-level aggregations and overdue invoice filters using React `useMemo` hooks.

**Tech Stack:** React, Next.js (App Router), Tailwind CSS, shadcn/ui, Zustand (Store)

---

### Task 1: Add Tabs Component Structure and Import Tabs List

**Files:**
- Modify: `src/app/finance/collections/page.tsx`

- [ ] **Step 1: Import Tabs UI Components**
  Add the import of `Tabs, TabsContent, TabsList, TabsTrigger` from `@/components/ui/tabs` at the top of the file:
  ```typescript
  import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
  ```

- [ ] **Step 2: Add activeTab state**
  Define `activeTab` state in the `ARCollectionsPage` component:
  ```typescript
  const [activeTab, setActiveTab] = useState<string>("invoice")
  ```

- [ ] **Step 3: Render Tabs wrapper layout**
  Wrap the table container inside the `Tabs` component:
  ```tsx
  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
    <TabsList className="bg-slate-100 p-1 rounded-2xl h-12 w-fit mb-4">
      <TabsTrigger value="invoice" className="rounded-xl px-6 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
        Invoice Individual
      </TabsTrigger>
      <TabsTrigger value="client" className="rounded-xl px-6 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
        Rekap per Klien
      </TabsTrigger>
      <TabsTrigger value="alert" className="rounded-xl px-6 font-black uppercase text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm">
        Alert Jatuh Tempo
      </TabsTrigger>
    </TabsList>
    
    <TabsContent value="invoice" className="m-0">
      {/* Existing individual invoices table */}
    </TabsContent>
    
    <TabsContent value="client" className="m-0">
      {/* Client grouped table */}
    </TabsContent>
    
    <TabsContent value="alert" className="m-0">
      {/* Overdue alerts table */}
    </TabsContent>
  </Tabs>
  ```

- [ ] **Step 4: Verify type safety**
  Run: `npx tsc --noEmit`
  Expected: Success

- [ ] **Step 5: Commit changes**
  ```bash
  git add src/app/finance/collections/page.tsx
  git commit -m "feat: add basic tabs structure to AR Collections"
  ```

---

### Task 2: Implement Sorting by Amount Due for Individual Invoices Tab

**Files:**
- Modify: `src/app/finance/collections/page.tsx`

- [ ] **Step 1: Add sort order logic in filteredInvoices**
  Update the sorting in the `filteredInvoices` `useMemo` so that individual invoices can be sorted by outstanding amount descending:
  ```typescript
  const filteredInvoices = useMemo(() => {
    return enrichedInvoices.filter(inv => {
      const matchesSearch = inv.clientName.toLowerCase().includes(search.toLowerCase()) || 
                           inv.id.toLowerCase().includes(search.toLowerCase())
      
      let matchesAging = true
      if (filterAging === '30') matchesAging = inv.agingDays > 0 && inv.agingDays <= 30
      if (filterAging === '60') matchesAging = inv.agingDays > 30 && inv.agingDays <= 60
      if (filterAging === '90+') matchesAging = inv.agingDays > 60

      return matchesSearch && matchesAging
    }).sort((a, b) => (b.totalAmount - b.amountPaid) - (a.totalAmount - a.amountPaid))
  }, [enrichedInvoices, search, filterAging])
  ```

- [ ] **Step 2: Verify type safety**
  Run: `npx tsc --noEmit`
  Expected: Success

- [ ] **Step 3: Commit changes**
  ```bash
  git add src/app/finance/collections/page.tsx
  git commit -m "feat: sort individual invoices by amount due descending"
  ```

---

### Task 3: Implement Tab 2 (Rekap per Klien) Grouped Calculation & Table View

**Files:**
- Modify: `src/app/finance/collections/page.tsx`

- [ ] **Step 1: Define groupedClients useMemo**
  Calculate client-level outstanding summaries:
  ```typescript
  const groupedClients = useMemo(() => {
    const map = new Map<string, {
      client: Client;
      totalDebt: number;
      invoiceCount: number;
      invoices: Invoice[];
    }>()

    enrichedInvoices.forEach(inv => {
      const client = clients.find(c => c.id === inv.clientId)
      if (!client) return
      
      const unpaidAmount = inv.totalAmount - inv.amountPaid
      if (unpaidAmount <= 0) return

      if (!map.has(client.id)) {
        map.set(client.id, {
          client,
          totalDebt: 0,
          invoiceCount: 0,
          invoices: []
        })
      }

      const entry = map.get(client.id)!
      entry.totalDebt += unpaidAmount
      entry.invoiceCount += 1
      entry.invoices.push(inv)
    })

    return Array.from(map.values())
      .filter(item => item.client.companyName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.totalDebt - a.totalDebt)
  }, [enrichedInvoices, clients, search])
  ```

- [ ] **Step 2: Render Grouped Clients Table**
  Add the client table UI within the `client` TabsContent container:
  ```tsx
  <div className="liquid-card overflow-hidden bg-white border border-slate-100 shadow-xl rounded-[2.5rem]">
    <Table>
      <TableHeader className="bg-slate-50/50">
        <TableRow>
          <TableHead className="pl-8 py-6 font-black text-[10px] uppercase text-indigo-600">Client & Contact</TableHead>
          <TableHead className="font-black text-[10px] uppercase text-slate-400 text-center">Unpaid Invoices</TableHead>
          <TableHead className="text-right font-black text-[10px] uppercase text-slate-400">Total Outstanding AR</TableHead>
          <TableHead className="text-center font-black text-[10px] uppercase text-slate-400">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groupedClients.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="h-64 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No client debt records found.</p>
            </TableCell>
          </TableRow>
        ) : (
          groupedClients.map(({ client, totalDebt, invoiceCount, invoices: clientInvs }) => (
            <TableRow key={client.id} className="hover:bg-slate-50/80 transition-colors border-b border-slate-50">
              <TableCell className="pl-8 py-6">
                <div className="flex flex-col">
                  <span className="font-black text-slate-900 text-base">{client.companyName}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">PIC: {client.picName} ({client.phone || '-'})</span>
                </div>
              </TableCell>
              <TableCell className="text-center">
                <Badge className="bg-indigo-100 text-indigo-700 border-none text-[9px] font-black uppercase px-2.5 py-1 rounded-full">
                  {invoiceCount} Tagihan
                </Badge>
              </TableCell>
              <TableCell className="text-right font-black text-slate-900 text-lg">
                {formatRupiah(totalDebt)}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-center gap-2">
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-10 w-10 rounded-full text-emerald-600 hover:bg-emerald-50"
                    onClick={() => {
                      const message = `Halo Kak/Bapak/Ibu di *${client.companyName}*,\n\nKami dari *Disma Fresh* ingin menginformasikan rekap tagihan tertunggak berikut:\n` +
                        clientInvs.map((inv, idx) => `${idx + 1}. Invoice #${inv.id.substring(0,8)} sebesar *${formatRupiah(inv.totalAmount - inv.amountPaid)}* (Jatuh Tempo: ${format(new Date(inv.dueDate), 'd MMM yyyy')})`).join('\n') +
                        `\n\n*Total Akumulasi Piutang: ${formatRupiah(totalDebt)}*\n\nMohon kesediaannya untuk melakukan pembayaran. Terima kasih banyak! 🙏😊`;
                      
                      let formattedPhone = (client.phone || '').replace(/[^0-9]/g, '');
                      if (formattedPhone.startsWith('0')) {
                        formattedPhone = '62' + formattedPhone.slice(1);
                      }
                      if (formattedPhone) {
                        window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');
                      } else {
                        toast.error("Nomor WA tidak valid");
                      }
                    }}
                  >
                    <MessageSquare className="w-5 h-5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  </div>
  ```

- [ ] **Step 3: Verify type safety**
  Run: `npx tsc --noEmit`
  Expected: Success

- [ ] **Step 4: Commit changes**
  ```bash
  git add src/app/finance/collections/page.tsx
  git commit -m "feat: implement client-level consolidated outstanding AR tab"
  ```

---

### Task 4: Implement Tab 3 (Alert Jatuh Tempo) Filtered List

**Files:**
- Modify: `src/app/finance/collections/page.tsx`

- [ ] **Step 1: Define overdueInvoices useMemo**
  Calculate list of overdue/due-today invoices:
  ```typescript
  const overdueInvoices = useMemo(() => {
    const today = new Date()
    today.setHours(23, 59, 59, 999) // include due today
    
    return enrichedInvoices.filter(inv => {
      const isPastOrToday = new Date(inv.dueDate) <= today
      const matchesSearch = inv.clientName.toLowerCase().includes(search.toLowerCase()) || 
                           inv.id.toLowerCase().includes(search.toLowerCase())
      return isPastOrToday && matchesSearch
    }).sort((a, b) => b.agingDays - a.agingDays)
  }, [enrichedInvoices, search])
  ```

- [ ] **Step 2: Render Overdue Table**
  Add the overdue list UI within the `alert` TabsContent container:
  ```tsx
  <div className="liquid-card overflow-hidden bg-white border border-slate-100 shadow-xl rounded-[2.5rem]">
    <Table>
      <TableHeader className="bg-slate-50/50">
        <TableRow>
          <TableHead className="pl-8 py-6 font-black text-[10px] uppercase text-indigo-600">Invoice & Client</TableHead>
          <TableHead className="font-black text-[10px] uppercase text-slate-400 text-center">Overdue Aging</TableHead>
          <TableHead className="text-right font-black text-[10px] uppercase text-slate-400">Amount Due</TableHead>
          <TableHead className="text-center font-black text-[10px] uppercase text-slate-400">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {overdueInvoices.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="h-64 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">All invoices are within terms. No overdue alerts!</p>
            </TableCell>
          </TableRow>
        ) : (
          overdueInvoices.map((inv) => (
            <TableRow key={inv.id} className="hover:bg-slate-50/80 transition-colors border-b border-slate-50">
              <TableCell className="pl-8 py-6">
                <div className="flex flex-col">
                  <span className="font-black text-slate-900 text-base">{inv.clientName}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-tighter bg-indigo-50 px-2 py-0.5 rounded-md">#{inv.id.substring(0,8)}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[150px]">PIC: {inv.clientPic}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-center">
                <div className="flex flex-col items-center">
                  <Badge className="text-[9px] font-black uppercase rounded-full px-3 py-1 bg-rose-100 text-rose-700 border border-rose-200 shadow-sm">
                    {inv.agingDays <= 0 ? 'Due Today' : `${inv.agingDays} Days Overdue`}
                  </Badge>
                  <span className="text-[9px] font-bold text-slate-400 uppercase mt-1">Due: {format(new Date(inv.dueDate), 'dd MMM yyyy')}</span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex flex-col">
                  <span className="font-black text-slate-900 text-lg">{formatRupiah(inv.totalAmount - inv.amountPaid)}</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase">of {formatRupiah(inv.totalAmount)}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-center gap-2">
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-10 w-10 rounded-full text-indigo-600 hover:bg-indigo-50"
                    onClick={() => setInvoicePreview({ id: inv.id, isConsolidated: inv.isConsolidated || false })}
                  >
                    <ArrowUpRight className="w-5 h-5" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-10 w-10 rounded-full text-emerald-600 hover:bg-emerald-50"
                    onClick={() => handleRemind(inv.id)}
                  >
                    <MessageSquare className="w-5 h-5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  </div>
  ```

- [ ] **Step 3: Verify type safety**
  Run: `npx tsc --noEmit`
  Expected: Success

- [ ] **Step 4: Commit changes**
  ```bash
  git add src/app/finance/collections/page.tsx
  git commit -m "feat: implement overdue alerts tab on AR Collections"
  ```
