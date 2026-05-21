"use client"

import { useState, useEffect, useRef } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah, cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ShieldCheck, Wallet, Send,
  CheckCircle2, XCircle, Clock,
  Banknote, Landmark, CreditCard,
  Receipt, User, FileText, Eye, Image as ImageIcon,
  AlertTriangle, ChevronRight, RefreshCw, Database, Truck, Globe, ArrowRight, Plus,
  Trash2, Loader2
} from "lucide-react"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import { recordBudgetTransfer, recordReimbursementPayment, recordOperationalExpense, recordReconciliationSettlement, recordDeliveryAndInvoice, recordAdvanceReturn, updateProductPriceHistory, recordAdvanceExpense, getAdvanceWalletByRole, getAdvanceWalletByUserId, recordOnlinePurchase } from "@/lib/accounting"
import AuthGuard from "@/components/auth/auth-guard"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
} from "@/components/ui/dialog"

export default function FinanceHubPage() {
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const reimbursements = useAppStore(state => state.reimbursements)
  const expenses = useAppStore(state => state.expenses)
  const products = useAppStore(state => state.products)
  const bankAccounts = useAppStore(state => state.bankAccounts)
  const users = useAppStore(state => state.users)
  const currentUser = useAppStore(state => state.currentUser)
  const deliveries = useAppStore(state => state.deliveries)
  const salesOrders = useAppStore(state => state.salesOrders)
  const salesOrderItems = useAppStore(state => state.salesOrderItems)
  const invoices = useAppStore(state => state.invoices)
  const clients = useAppStore(state => state.clients)
  
  const updatePurchase = useAppStore(state => state.updatePurchase)
  const updateReimbursement = useAppStore(state => state.updateReimbursement)
  const updateExpense = useAppStore(state => state.updateExpense)
  const updateDelivery = useAppStore(state => state.updateDelivery)
  const updateSalesOrder = useAppStore(state => state.updateSalesOrder)
  const bundleUpdateProducts = useAppStore(state => state.updateProduct)
  const addReimbursement = useAppStore(state => state.addReimbursement)
  const addPurchase = useAppStore(state => state.addPurchase)
  const addPurchaseItems = useAppStore(state => state.addPurchaseItems)
  const deletePurchase = useAppStore(state => state.deletePurchase)
  const setIsSyncing = (v: boolean) => useAppStore.setState({ isSyncing: v })

  const { useSearchParams } = require("next/navigation")
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")

  const [activeTab, setActiveTab] = useState(tabParam || "pencairan")
  
  // Sync activeTab with URL param if changed
  useEffect(() => {
    if (tabParam) setActiveTab(tabParam)
  }, [tabParam])

  // --- AUTO-CREATE MISSING ADVANCES ---
  const isBackfilling = useRef(false)
  
  useEffect(() => {
    const backfillMissingAdvances = async () => {
      if (isBackfilling.current) return
      isBackfilling.current = true

      try {
        const grouped = salesOrders.reduce<Record<string, typeof salesOrders>>((acc, so) => {
          if (!so.shoppingListDocumentId || !so.shoppingListCompiledAt) return acc
          acc[so.shoppingListDocumentId] = acc[so.shoppingListDocumentId] || []
          acc[so.shoppingListDocumentId].push(so)
          return acc
        }, {})

        for (const [documentId, orders] of Object.entries(grouped)) {
          // Use latest state from store to avoid stale closure duplicates
          const currentPurchases = useAppStore.getState().purchases
          const alreadyExists = currentPurchases.some(p => p.id === documentId || p.shoppingListDocumentId === documentId)
          if (alreadyExists) continue

          const generatedAt = orders[0]?.shoppingListCompiledAt || new Date().toISOString()
          const items = orders.flatMap(so => {
            return salesOrderItems
              .filter(item => item.salesOrderId === so.id)
              .map(item => {
                const product = products.find(p => p.id === item.productId)
                return {
                  id: uuidv4(),
                  purchaseId: documentId,
                  productId: item.productId,
                  salesOrderId: so.id,
                  qtyTarget: item.qty,
                  qtyPurchased: 0,
                  estimatedUnitPrice: product?.basePrice || item.unitPrice || 0,
                  actualUnitPrice: 0,
                  isChecked: false,
                  purchaseMethod: 'Pasar' as const
                }
              })
          })

          if (items.length === 0) continue

          // Create purchase and items together
          await addPurchase({
            id: documentId,
            date: generatedAt,
            purchaserId: 'pending',
            status: 'Pending',
            advanceCode: `ADV-${generatedAt.slice(0, 10).replaceAll('-', '')}-${documentId.slice(0, 4).toUpperCase()}`,
            shoppingListDocumentId: documentId,
            shoppingListCompiledBy: orders[0]?.shoppingListCompiledBy
          })
          await addPurchaseItems(items)
          toast.success(`Advance otomatis dibuat untuk list: ${documentId.slice(0,8)}`, { duration: 2000 })
        }
      } catch (err) {
        console.error("Backfill failed:", err)
      } finally {
        isBackfilling.current = false
      }
    }

    if (salesOrders.length > 0) {
      void backfillMissingAdvances()
    }
  }, [salesOrders, salesOrderItems, products, addPurchase, addPurchaseItems])

  const [selectedBank, setSelectedBank] = useState("bank-1")
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [selectedPurchasers, setSelectedPurchasers] = useState<Record<string, string>>({})
  const [spareAmounts, setSpareAmounts] = useState<Record<string, number>>({})
  const [returnBankOverrides, setReturnBankOverrides] = useState<Record<string, string>>({})
  const [isDeletingAdvance, setIsDeletingAdvance] = useState<string | null>(null)

  const handleDeleteAdvance = async (purchaseId: string) => {
    if (isDeletingAdvance) return
    const purchase = purchases.find(p => p.id === purchaseId)
    if (!purchase) return toast.error("Advance tidak ditemukan.")
    if (purchase.budgetTransferDate) return toast.error("Dana sudah ditransfer, tidak bisa dihapus.")
    if (purchase.reconciliationStatus === 'Terverifikasi') return toast.error("Sudah Terverifikasi, tidak bisa dihapus.")
    if (!window.confirm(`Hapus advance ${purchase.advanceCode || purchase.id.slice(0,8)}? PO terkait akan kembali ke status Draft.`)) return

    setIsDeletingAdvance(purchaseId)
    try {
      await deletePurchase(purchaseId)
      toast.success("Advance request dihapus.")
    } catch (e) {
      toast.error("Gagal hapus advance.")
    } finally {
      setIsDeletingAdvance(null)
    }
  }
  
  // --- Direct Settlement State ---
  const [isDirectSettleOpen, setIsDirectSettleOpen] = useState(false)
  const [directSettleId, setDirectSettleId] = useState<string | null>(null)
  
  const [settlementItems, setSettlementItems] = useState<Record<string, { actualPrice: number, qtyPurchased: number }>>({})
  const [settlementOps, setSettlementOps] = useState<{ id: string, category: string, amount: number, note: string }[]>([])
  const [settlementProofUrl, setSettlementProofUrl] = useState("")
  const [settlementReturnedCustom, setSettlementReturnedCustom] = useState<number | null>(null)

  // Derived calculations
  const directSettlePurchase = purchases.find(p => p.id === directSettleId)
  const directSettleBudget = (directSettlePurchase?.budgetAmount || 0) + (directSettlePurchase?.operationalSpareAmount || 0)
  const currentTotalHPP = Object.values(settlementItems).reduce((sum, item) => sum + ((item.actualPrice || 0) * (item.qtyPurchased || 0)), 0)
  const currentTotalOps = settlementOps.reduce((sum, op) => sum + (op.amount || 0), 0)
  const netBalance = directSettleBudget - currentTotalHPP - currentTotalOps
  const settlementReturnedAuto = Math.max(0, netBalance)

  const openDirectSettle = (purchaseId: string) => {
    setDirectSettleId(purchaseId)
    const items = purchaseItems.filter(pi => pi.purchaseId === purchaseId && pi.purchaseMethod !== 'Online' && !pi.isOnlineAudited)
    const initialItems: Record<string, { actualPrice: number, qtyPurchased: number }> = {}
    items.forEach(item => {
      initialItems[item.id] = { actualPrice: item.estimatedUnitPrice || 0, qtyPurchased: item.qtyTarget }
    })
    setSettlementItems(initialItems)
    setSettlementOps([])
    setSettlementProofUrl("")
    setSettlementReturnedCustom(null)
    setIsDirectSettleOpen(true)
  }

  
  // --- DATA FILTERING ---
  const needsTransfer = purchases.filter(p => {
    const items = purchaseItems.filter(pi => pi.purchaseId === p.id)
    const hasMarketItems = items.some(pi => pi.purchaseMethod === 'Pasar' || !pi.purchaseMethod)
    return p.status === 'Pending' && !p.budgetTransferDate && hasMarketItems
  })
  
  const sourcingSettlements = purchases.filter(p => {
    // Show if money has been given (budgetTransferDate exists) 
    // AND it hasn't been finalized yet (reconciliationStatus !== 'Terverifikasi')
    return p.budgetTransferDate && p.reconciliationStatus !== 'Terverifikasi';
  }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const pendingExpensesLain = expenses.filter(e => e.status === 'Pending Audit' && e.category !== 'Belanja Online' && e.category !== 'Sourcing (HPP)' && e.category !== 'Setoran Pengembalian');
  const pendingReimbs = reimbursements.filter(r => r.status === 'Pending')
  const awaitingVerification = sourcingSettlements
  const pendingReturns = expenses.filter(e => e.category === 'Setoran Pengembalian' && e.status === 'Pending Audit')
  const awaitingOnlineAudit = expenses.filter(e => e.status === 'Pending Audit' && (e.category === 'Belanja Online' || e.category === 'Sourcing (HPP)'));
  const awaitingDeliveryAudit = deliveries.filter(d => d.status === 'Awaiting Audit')

  // --- ACTIONS ---
  const handleTransferBudget = async (purchaseId: string) => {
    const purchaserId = selectedPurchasers[purchaseId]
    const spareAmount = spareAmounts[purchaseId] || 0
    if (!purchaserId) return toast.error("Pilih penerima dana terlebih dahulu.")

    const items = purchaseItems.filter(pi => pi.purchaseId === purchaseId && pi.purchaseMethod !== 'Online')
    const itemsBudget = items.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId)
      const estPrice = item.estimatedUnitPrice || product?.basePrice || 0
      return sum + (estPrice * item.qtyTarget)
    }, 0)

    const totalTransferAmount = itemsBudget + spareAmount
    if (totalTransferAmount <= 0) return toast.error("Total pencairan tidak bisa Rp 0.")

    const bank = bankAccounts.find(b => b.id === selectedBank)
    if (!bank) return toast.error("Pilih rekening sumber.")
    if (bank.balance < totalTransferAmount) {
      toast.warning("Peringatan: Saldo rekening sumber tidak mencukupi. Meneruskan dengan saldo negatif.")
    }

    const now = new Date().toISOString()
    const user = users.find(u => u.id === purchaserId)
    
    toast.loading("Memproses transfer dana...", { id: "transfer-PO" })
    const success = await recordBudgetTransfer(purchaseId, totalTransferAmount, selectedBank, user?.name || 'Sourcing')

    if (success) {
      await updatePurchase(purchaseId, { 
        status: 'Belanja', 
        purchaserId, 
        budgetAmount: itemsBudget, 
        budgetTransferDate: now, 
        budgetTransferedBy: currentUser?.id || 'system', 
        budgetBankAccountId: selectedBank,
        operationalSpareAmount: spareAmount
      })
      toast.success(`Dana ${formatRupiah(totalTransferAmount)} berhasil ditransfer ke Sourcer. Sesi belanja aktif!`, { id: "transfer-PO" })
    } else {
      toast.error("Gagal memproses transfer. Cek koneksi & database.", { id: "transfer-PO" })
    }
  }

  const handleAuditExpense = async (expenseId: string, status: 'Approved' | 'Rejected') => {
    const exp = expenses.find(e => e.id === expenseId)
    if (!exp) return

    if (status === 'Approved') {
       // If tied to a purchase, the wallet owner is the purchaser, not necessarily the reporter (e.g., if Finance direct-settles)
       const relatedPurchase = purchases.find(p => p.id === exp.purchaseId)
       const walletUserId = relatedPurchase?.purchaserId || exp.reporterId
       const advanceWallet = getAdvanceWalletByUserId(walletUserId)
       const bank = bankAccounts.find(b => b.id === selectedBank)

       toast.loading("Mencatat transaksi keuangan...", { id: "audit-exp" })

       if (exp.category === 'Setoran Pengembalian') {
          const effectiveBank = returnBankOverrides[expenseId] ?? exp.targetBankAccountId ?? selectedBank
          const success = await recordAdvanceReturn(exp.amount, walletUserId, effectiveBank)
          if (!success) {
             toast.error("Gagal mencatat pengembalian dana.", { id: "audit-exp" })
             return
          }
       } else if (exp.category === 'Belanja Online' || exp.category === 'Sourcing (HPP)') {
          if (!exp.referenceId) {
             toast.error("Gagal: Reference ID (Purchase Item) tidak ditemukan.", { id: "audit-exp" })
             return
          }

          const productName = exp.description.split(':').pop()?.split('(')[0]?.trim() || 'Online Item'
          
          // Use advance wallet bank account if the reporter is a sourcer/courier
          const targetBankId = advanceWallet ? advanceWallet.bankAccountId : selectedBank

          const success = await recordOnlinePurchase(
             exp.referenceId,
             exp.amount,
             productName,
             exp.adminFee || 0,
             exp.shippingFee || 0,
             targetBankId
          )

          if (!success) {
             toast.error("Gagal memproses tutup buku belanja online.", { id: "audit-exp" })
             return
          }
       } else if (advanceWallet) {
          // Field staff expense (Sourcing/Kurir) -> debit the wallet owner (purchaser), not reporter
          const success = await recordAdvanceExpense(
            expenseId,
            walletUserId,
            exp.amount,
            exp.description || 'Biaya Ops',
            exp.date,
            exp.category || 'Operasional'
          )
          if (!success) {
            toast.error(`Gagal mencatat pengeluaran ${advanceWallet.label}.`, { id: "audit-exp" })
            return
          }
       } else {
          // Normal office/admin expense -> Use the bank selected in finance dashboard
          const success = await recordOperationalExpense(
            expenseId, 
            exp.amount, 
            exp.description || '', 
            exp.date, 
            exp.category || 'Operasional', 
            bank?.accountCode || '1-1200', 
            selectedBank
          )
          if (!success) {
             toast.error("Gagal mencatat transaksi pengeluaran.", { id: "audit-exp" })
             return
          }
       }
       toast.success("Audit disetujui & transaksi tercatat.", { id: "audit-exp" })
    }

    await updateExpense(expenseId, { status })
    if (status === 'Rejected') toast.success("Audit ditolak.")
  }

  const handleVerifyReconciliation = async (purchaseId: string) => {
    const purchase = useAppStore.getState().purchases.find(p => p.id === purchaseId)
    if (!purchase) return
    if (purchase.reconciliationStatus === 'Terverifikasi') {
      toast.info("Rekonsiliasi ini sudah pernah diverifikasi.")
      return
    }

    const advanceAmount = (purchase.budgetAmount || 0) + (purchase.operationalSpareAmount || 0)
    
    // Find all linked items
    const pOps = useAppStore.getState().expenses.filter(e => e.purchaseId === purchaseId && e.status === 'Pending Audit' && e.category !== 'Setoran Pengembalian')
    const pReimbs = useAppStore.getState().reimbursements.filter(r => r.purchaseId === purchaseId && r.status === 'Pending')
    const pReturn = useAppStore.getState().expenses.find(e => e.purchaseId === purchaseId && e.status === 'Pending Audit' && e.category === 'Setoran Pengembalian')

    toast.loading("Memproses persetujuan seluruh sesi (HPP, Ops, Kasbon, Setoran)...", { id: "rekon" })

    // 1. Process Operational Expenses
    for (const op of pOps) {
       await handleAuditExpense(op.id, 'Approved')
    }

    // 2. Process Reimbursements
    for (const reimb of pReimbs) {
       await handlePayReimbursement(reimb.id)
    }

    // 3. Process Returns
    if (pReturn) {
       await handleAuditExpense(pReturn.id, 'Approved')
    }

    // 4. Process HPP Settlement (Rekon Utama)
    if (purchase.reconciliationStatus === 'Laporan Masuk') {
       // Remaining advance = original advance minus ALL ops expenses already/just deducted from wallet
       const allOpsForPurchase = useAppStore.getState().expenses.filter(
         e => e.purchaseId === purchaseId &&
         e.status !== 'Rejected' &&
         e.category !== 'Setoran Pengembalian' &&
         e.category !== 'Belanja Online' &&
         e.category !== 'Sourcing (HPP)'
       )
       const totalOpsDeducted = allOpsForPurchase.reduce((sum, e) => sum + e.amount, 0)
       const remainingAdvanceForHPP = Math.max(0, advanceAmount - totalOpsDeducted)

       const success = await recordReconciliationSettlement(
          purchaseId,
          purchase.actualSpent || 0,
          0,
          remainingAdvanceForHPP,
          purchase.budgetBankAccountId || 'bank-1'
       )
       if (!success) {
         toast.error("Gagal settle rekonsiliasi jurnal HPP.", { id: "rekon" })
         return
       }
       await updatePurchase(purchaseId, { reconciliationStatus: 'Terverifikasi', status: 'Selesai' })

       const pItems = useAppStore.getState().purchaseItems.filter(pi => pi.purchaseId === purchaseId && pi.isChecked)
       for (const item of pItems) {
         if (item.actualUnitPrice > 0 && item.productId) {
           updateProductPriceHistory(item.productId, item.actualUnitPrice, 'Pasar (Verified)')
         }
       }

       // Advance linked Sales Orders to QC so warehouse/qc → packing → shipping can proceed
       const linkedSoIds = new Set(
         pItems.map(pi => pi.salesOrderId).filter((id): id is string => !!id)
       )
       for (const soId of linkedSoIds) {
         const so = useAppStore.getState().salesOrders.find(s => s.id === soId)
         if (so && (so.status === 'Belanja' || so.status === 'Draft')) {
           await updateSalesOrder(soId, { status: 'QC' })
         }
       }
    }

    toast.success("Sesi Sourcing berhasil disetujui & disettle!", { id: "rekon" })
  }

  const handleItemSettlement = async () => {
    if (!directSettleId) return
    const purchase = purchases.find(p => p.id === directSettleId)
    if (!purchase) return

    // Guard: confirm bila defisit (HPP + Ops > Advance) — sourcer harus talangin.
    if (netBalance < 0) {
      const msg = `⚠ DEFISIT ${formatRupiah(Math.abs(netBalance))}\n\n` +
        `Budget: ${formatRupiah(directSettleBudget)}\n` +
        `HPP: ${formatRupiah(currentTotalHPP)}\n` +
        `Ops: ${formatRupiah(currentTotalOps)}\n` +
        `Selisih: -${formatRupiah(Math.abs(netBalance))}\n\n` +
        `Sourcer harus talangin ${formatRupiah(Math.abs(netBalance))}. Yakin lanjut?`
      if (!window.confirm(msg)) {
        return
      }
    }

    const toastId = toast.loading("Memproses settlement per item...")
    
    try {
      const now = new Date().toISOString()
      const addExpense = useAppStore.getState().addExpense
      
      let totalHPP = 0

      // 1. Process items (skip online-audited items — already handled via Audit Online flow)
      for (const [itemId, data] of Object.entries(settlementItems)) {
        const item = purchaseItems.find(pi => pi.id === itemId)
        if (!item || item.isOnlineAudited || item.purchaseMethod === 'Online') continue
        
        await useAppStore.getState().updatePurchaseItem(itemId, { 
          actualUnitPrice: data.actualPrice, 
          qtyPurchased: data.qtyPurchased, 
          isChecked: true 
        })
        
        if (data.actualPrice > 0 && item.productId) {
          updateProductPriceHistory(item.productId, data.actualPrice, 'Pasar (Finance Input)')
        }
        
        totalHPP += data.actualPrice * data.qtyPurchased
      }

      // 2. Process Ops
      let totalOps = 0
      for (const op of settlementOps) {
        if (op.amount <= 0) continue
        await addExpense({
          id: `ops-${Date.now()}-${uuidv4().slice(0, 4)}`,
          purchaseId: directSettleId,
          amount: op.amount,
          category: op.category,
          description: op.note || `Biaya Operasional Sourcing (${op.category})`,
          date: now,
          status: 'Pending Audit',
          reporterId: currentUser?.id || 'system',
          receiptUrl: settlementProofUrl
        })
        totalOps += op.amount
      }

      // 3. (Removed HPP Expense creation to prevent double-counting and lingering items. HPP is handled by recordReconciliationSettlement)

      const finalNetBalance = directSettleBudget - totalHPP - totalOps
      const returned = settlementReturnedCustom !== null ? settlementReturnedCustom : Math.max(0, finalNetBalance)

      // 4. Create Return Record
      if (returned > 0) {
        await addExpense({
          id: `ret-${Date.now()}`,
          purchaseId: directSettleId,
          amount: returned,
          category: 'Setoran Pengembalian',
          description: `Sisa Dana Dikembalikan (Input Manual Finance)`,
          date: now,
          status: 'Pending Audit',
          reporterId: currentUser?.id || 'system',
          targetBankAccountId: selectedBank,
          receiptUrl: settlementProofUrl
        })
      }

      // 4.1 Auto Create Reimbursement for Deficit
      if (finalNetBalance < 0) {
        await useAppStore.getState().addReimbursement({
          id: `reimb-${Date.now()}-${uuidv4().slice(0, 4)}`,
          purchaseId: directSettleId,
          userId: directSettlePurchase?.purchaserId || currentUser?.id || 'system',
          title: `Defisit Sourcing ${directSettleId?.slice(0,8)}`,
          amount: Math.abs(finalNetBalance),
          description: `Uang talangan sourcing (Defisit Budget)`,
          status: 'Pending',
          date: now
        })
      }

      // 5. Update purchase actual spent
      await updatePurchase(directSettleId, { 
        actualSpent: totalHPP,
        changeReturned: returned,
        reconciliationStatus: 'Laporan Masuk'
      })

      // 6. Run the standard verification logic
      await handleVerifyReconciliation(directSettleId)
      
      toast.success("Settlement per item selesai!", { id: toastId })
      setIsDirectSettleOpen(false)
      setDirectSettleId(null)
      setSettlementItems({})
      setSettlementOps([])
      setSettlementProofUrl("")
      setSettlementReturnedCustom(null)
    } catch (err) {
      toast.error("Gagal memproses settlement per item.", { id: toastId })
    }
  }

  const handleVerifyDelivery = async (deliveryId: string) => {
    const delivery = deliveries.find(d => d.id === deliveryId)
    const soId = delivery?.salesOrderId
    if (!delivery || !soId) return

    const soItems = salesOrderItems.filter(i => i.salesOrderId === soId)
    const totalRevenue = soItems.reduce((sum, item) => sum + ((item.qtyFinal ?? item.qty) * item.unitPrice), 0)

    const fallbackInvoice = invoices.find(inv => inv.salesOrderId === soId)
    let invoiceId = delivery?.invoiceId || fallbackInvoice?.id

    if (!invoiceId) {
      const so = salesOrders.find(s => s.id === soId)
      invoiceId = uuidv4()
      const newInvoice = {
        id: invoiceId,
        salesOrderId: soId,
        clientId: so?.clientId || '',
        issueDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        totalAmount: totalRevenue,
        amountPaid: 0,
        status: 'Unpaid' as const
      }
      await useAppStore.getState().addInvoice(newInvoice)
    }

    let totalCogs = 0
    const stockDeductionItems: { productId: string, qty: number }[] = []
    
    soItems.forEach(item => {
      const finalQty = item.qtyFinal ?? item.qty
      const pItem = purchaseItems.filter(pi => pi.productId === item.productId && pi.actualUnitPrice > 0).pop()
      const unitCogs = pItem ? pItem.actualUnitPrice : (products.find(p => p.id === item.productId)?.basePrice || 0)
      totalCogs += (unitCogs * finalQty)
      stockDeductionItems.push({ productId: item.productId, qty: finalQty })
    })

    toast.loading("Finalisasi pengiriman & invoice...", { id: "delivery" })
    const success = await recordDeliveryAndInvoice(deliveryId, invoiceId, totalRevenue, totalCogs, stockDeductionItems)
    if (success) {
      await updateDelivery(deliveryId, { status: 'Terkirim' })
      await updateSalesOrder(soId, { status: 'Terkirim' })
      toast.success("Audit pengiriman selesai! Omzet & HPP tercatat, stok inventory telah dikurangi.", { id: "delivery" })
    } else {
      toast.error("Gagal mencatat transaksi ke jurnal.", { id: "delivery" })
    }
  }

  const handlePayReimbursement = async (reimbId: string) => {
    const reimb = reimbursements.find(r => r.id === reimbId)
    if (!reimb) return
    const user = users.find(u => u.id === reimb.userId)

    toast.loading("Memproses pembayaran talangan...", { id: "reimb" })
    const success = await recordReimbursementPayment(reimb.id, reimb.amount, reimb.title || 'Reimburse', selectedBank, user?.name || 'Karyawan')
    if (success) {
      await updateReimbursement(reimbId, { status: 'Paid' })

      // Sourcing/courier deficit reimb: replenish advance wallet balance so it doesn't stay negative
      const isDeficit = (reimb.description || '').toLowerCase().includes('talangan sourcing') ||
                        (reimb.description || '').toLowerCase().includes('defisit') ||
                        (reimb.title || '').toLowerCase().includes('defisit sourcing')
      if (isDeficit && user) {
        const advanceWallet = getAdvanceWalletByUserId(user.id)
        if (advanceWallet) {
          await useAppStore.getState().addCashTransaction({
            id: uuidv4(),
            date: new Date().toISOString(),
            amount: reimb.amount,
            type: 'In',
            category: 'Pelunasan Defisit Sourcing',
            description: `Dana reimburse masuk ke ${advanceWallet.label} (${user.name || 'Sourcing'})`,
            bankAccountId: advanceWallet.bankAccountId,
            referenceType: 'Reimbursement',
            referenceId: reimbId,
            counterpartName: user.name
          })
        }
      }

      toast.success("Pembayaran reimbursement berhasil dicatat.", { id: "reimb" })
    } else {
      toast.error("Gagal mencatat transaksi reimbursement.", { id: "reimb" })
    }
  }

  const handleUpdateProductPrice = (productId: string, newPrice: number) => {
    bundleUpdateProducts(productId, { basePrice: newPrice })
    toast.success("Harga dasar katalog berhasil diperbarui!")
  }

  return (
    <AuthGuard allowedRoles={['finance', 'super_admin', 'ceo']}>
      <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8 pb-32">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white dark:bg-slate-900 -mx-4 md:mx-0 p-6 md:p-10 md:rounded-[3rem] shadow-xl border-b md:border border-slate-100">
           <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-slate-950 text-white rounded-[2rem] flex items-center justify-center shadow-2xl">
                 <ShieldCheck className="w-8 h-8" />
              </div>
              <div>
                 <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Finance Control Hub</h1>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="rounded-full hover:bg-slate-100 transition-all text-slate-400 hover:text-slate-950"
                      onClick={() => useAppStore.getState().forceSync()}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                 </div>
                 <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] mt-3 bg-emerald-50 w-fit px-3 py-1 rounded-full">Secure Operational Audit</p>
              </div>
           </div>
           
           <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
              {bankAccounts.map(bank => (
                 <button 
                   key={bank.id}
                   onClick={() => setSelectedBank(bank.id)}
                   className={cn(
                     "p-4 rounded-3xl text-left border-2 transition-all",
                     selectedBank === bank.id ? "bg-slate-950 border-slate-950 text-white shadow-2xl scale-105" : "bg-slate-50 border-transparent text-slate-400 hover:bg-white hover:border-slate-100"
                   )}
                 >
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-60 flex items-center gap-2">
                       {selectedBank === bank.id ? <Landmark className="w-3 h-3" /> : <Clock className="w-3 h-3" />} {bank.name}
                    </p>
                    <p className="text-xl font-black mt-1 leading-none">{formatRupiah(bank.balance)}</p>
                 </button>
              ))}
           </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-slate-100/80 p-2 h-16 rounded-[2rem] -mx-2 md:mx-0 mb-10 overflow-x-auto overflow-y-hidden justify-start md:justify-center border border-white scrollbar-hide">
            <TabsTrigger value="pencairan" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <Wallet className="w-4 h-4 text-emerald-500" /> Advance ({needsTransfer.length})
            </TabsTrigger>
            <TabsTrigger value="settlement" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <CheckCircle2 className="w-4 h-4 text-orange-500" /> Sourcing Settlement ({sourcingSettlements.length + pendingReturns.length})
            </TabsTrigger>
            <TabsTrigger value="audit_online" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <Globe className="w-4 h-4 text-blue-500" /> Audit Online ({awaitingOnlineAudit.length})
            </TabsTrigger>
            <TabsTrigger value="audit_ops_lain" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <FileText className="w-4 h-4 text-slate-500" /> Audit Ops ({pendingExpensesLain.length + pendingReimbs.length})
            </TabsTrigger>
            <TabsTrigger value="delivery" className="rounded-[1.5rem] font-black uppercase text-[9px] tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-xl transition-all gap-2">
              <Truck className="w-4 h-4 text-blue-500" /> Delivery ({awaitingDeliveryAudit.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pencairan" className="space-y-6">
            {needsTransfer.length === 0 ? (
              <EmptyState title="Antrean Advance Kosong" desc="Semua request advance belanja sudah ditransfer dananya." />
            ) : (
              <div className="grid gap-6">
                {needsTransfer.map(purchase => {
                  const items = purchaseItems.filter(pi => pi.purchaseId === purchase.id && pi.purchaseMethod !== 'Online')
                  const totalBudget = items.reduce((sum, item) => {
                    const product = products.find(p => p.id === item.productId)
                    const unitPrice = item.estimatedUnitPrice || product?.basePrice || 0
                    return sum + (unitPrice * item.qtyTarget)
                  }, 0)
                  return (
                    <Card key={purchase.id} className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
                      <div className="flex flex-col xl:flex-row items-stretch">
                        <div className="xl:w-1/3 p-8 bg-slate-950 text-white flex flex-col justify-between">
                           <div className="space-y-6">
                              <Badge className="bg-emerald-500/20 text-emerald-400 border-none font-black text-[9px] px-3">ADVANCE REQUEST</Badge>
                              <div>
                                 <h3 className="text-3xl font-black tracking-tighter uppercase mb-2">{purchase.advanceCode || `ADV-${purchase.id.slice(0,8)}`}</h3>
                                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Ref: {purchase.id.slice(0,8)}</p>
                                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">RAB + Ops Advance</p>
                                 <p className="text-4xl font-black text-white mt-1 leading-none tracking-tighter">{formatRupiah(totalBudget + (spareAmounts[purchase.id] || 0))}</p>
                              </div>
                           </div>
                           <div className="mt-12 space-y-4">
                              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                                 <div>
                                    <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block">Pilih Penanggung Jawab Sourcing</label>
                                    <select 
                                      className="w-full h-12 bg-white/10 rounded-xl px-4 text-sm font-bold focus:bg-white focus:text-slate-900 transition-all outline-none"
                                      value={selectedPurchasers[purchase.id] || ''}
                                      onChange={(e) => setSelectedPurchasers({...selectedPurchasers, [purchase.id]: e.target.value})}
                                    >
                                       <option value="">-- Pilih Sourcing --</option>
                                        {users.filter(u => u.role === 'sourcing').map(u => (
                                           <option key={u.id} value={u.id} className="text-slate-900">{u.name}</option>
                                        ))}
                                    </select>
                                 </div>
                                 <div>
                                    <label className="text-[9px] font-black uppercase text-slate-400 mb-2 block">Tambahkan Operasional Sourcing</label>
                                    <input 
                                      type="number" 
                                      className="w-full h-12 bg-white/10 rounded-xl px-4 text-sm font-bold focus:bg-white focus:text-slate-900 transition-all outline-none"
                                      placeholder="Rp 0"
                                      onChange={(e) => setSpareAmounts({...spareAmounts, [purchase.id]: parseFloat(e.target.value) || 0})}
                                    />
                                 </div>
                              </div>
                              <Button
                                className="w-full h-16 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase"
                                onClick={() => handleTransferBudget(purchase.id)}
                              >
                                <Send className="w-5 h-5 mr-3" /> Transfer Advance
                              </Button>
                              <Button
                                variant="outline"
                                className="w-full h-12 rounded-2xl border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-black uppercase text-[10px] tracking-widest"
                                onClick={() => handleDeleteAdvance(purchase.id)}
                                disabled={isDeletingAdvance === purchase.id}
                              >
                                {isDeletingAdvance === purchase.id ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4 mr-2" />
                                )}
                                {isDeletingAdvance === purchase.id ? 'Menghapus...' : 'Hapus Advance'}
                              </Button>
                           </div>
                        </div>
                        <div className="xl:w-2/3 p-8 border-l border-slate-50">
                           <div className="flex flex-col gap-1 mb-6">
                              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">RAB List Belanja ({items.length} item)</h4>
                              <p className="text-xs font-bold text-slate-500">Finance bisa cek estimasi item sebelum menentukan advance + operasional.</p>
                           </div>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {items.map(item => {
                                 const product = products.find(p => p.id === item.productId)
                                 const so = item.salesOrderId ? salesOrders.find(order => order.id === item.salesOrderId) : null
                                 const subtotal = (item.estimatedUnitPrice || product?.basePrice || 0) * item.qtyTarget
                                 return (
                                    <div key={item.id} className="flex items-center gap-4 p-4 rounded-3xl bg-slate-50 border border-slate-100 hover:bg-white transition-all">
                                       <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center font-black text-slate-300">📦</div>
                                       <div className="min-w-0 flex-1">
                                          <p className="text-xs font-black text-slate-800 uppercase leading-none mb-1">{product?.name}</p>
                                          <p className="text-[10px] font-bold text-slate-400 uppercase">{item.qtyTarget} {product?.uom} @ {formatRupiah(item.estimatedUnitPrice)}</p>
                                          <p className="text-[10px] font-black text-emerald-600 uppercase mt-1">{formatRupiah(subtotal)}</p>
                                          {so && <p className="text-[9px] font-bold text-slate-400 uppercase mt-1 truncate">PO: {so.poNumber}</p>}
                                       </div>
                                    </div>
                                 )
                              })}
                           </div>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="audit_ops_lain" className="space-y-6">
            {pendingExpensesLain.length === 0 && pendingReimbs.length === 0 ? (
              <EmptyState title="Audit Operasional Clear" desc="Semua pengajuan penda dan reimburse sudah diaudit." />
            ) : (
                <div className="space-y-12">
                   {/* Operational Expenses */}
                   {pendingExpensesLain.length > 0 && (
                      <div className="space-y-4">
                         <div className="flex items-center gap-2 pl-4">
                            <FileText className="w-4 h-4 text-slate-500" />
                            <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest">Pengajuan Biaya Operasional</h3>
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {pendingExpensesLain.map(exp => {
                              const reporter = users.find(u => u.id === exp.reporterId)
                              return (
                                  <Card key={exp.id} className="border-none shadow-xl rounded-[2.5rem] bg-white group hover:shadow-slate-500/5 transition-all">
                                     <CardHeader className="p-6 pb-2">
                                        <div className="flex justify-between items-start">
                                           <Badge className="bg-slate-100 text-slate-600 border-none font-black text-[9px] uppercase px-3 py-1">Operational Audit</Badge>
                                           <p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(exp.date).toLocaleDateString()}</p>
                                        </div>
                                        <CardTitle className="text-lg font-black uppercase text-slate-900 mt-4 leading-tight">{exp.category}</CardTitle>
                                        <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-2">
                                           <User className="w-3 h-3" /> {reporter?.name || 'Admin / System'}
                                        </CardDescription>
                                     </CardHeader>
                                     <CardContent className="p-6 pt-2 space-y-6">
                                        <div className="bg-slate-50/50 p-4 rounded-3xl border border-slate-100">
                                           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Keterangan Biaya</p>
                                           <p className="text-xs font-bold text-slate-700 mt-1 italic whitespace-pre-wrap leading-relaxed opacity-70">&quot;{exp.description}&quot;</p>
                                           <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-baseline">
                                              <span className="text-[9px] font-black text-slate-400 uppercase">Nilai Transaksi</span>
                                              <span className="text-2xl font-black text-slate-900 tracking-tighter">{formatRupiah(exp.amount)}</span>
                                           </div>
                                        </div>
                                        <div className="flex gap-2 h-12">
                                           <Button 
                                             variant="outline" 
                                             className="flex-1 rounded-2xl border-rose-100 text-rose-500 font-black uppercase text-[10px] tracking-widest"
                                             onClick={() => handleAuditExpense(exp.id, 'Rejected')}
                                           >Tolak</Button>
                                           <Button 
                                             className="flex-[2] rounded-2xl bg-slate-950 text-white font-black uppercase text-[10px] tracking-widest"
                                             onClick={() => handleAuditExpense(exp.id, 'Approved')}
                                           >Approve Audit</Button>
                                        </div>
                                     </CardContent>
                                  </Card>
                              )
                            })}
                         </div>
                      </div>
                   )}

                   {/* Reimbursements */}
                   {pendingReimbs.length > 0 && (
                      <div className="space-y-4">
                         <div className="flex items-center gap-2 pl-4">
                            <CreditCard className="w-4 h-4 text-indigo-500" />
                            <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest">Antrean Reimburse Karyawan</h3>
                         </div>
                         <div className="grid gap-6">
                            {pendingReimbs.map(reimb => {
                              const user = users.find(u => u.id === reimb.userId)
                              return (
                                <Card key={reimb.id} className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
                                  <CardContent className="p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                                    <div className="flex items-center gap-6">
                                      <div className="w-16 h-16 rounded-[2rem] bg-indigo-50 flex items-center justify-center shadow-inner">
                                         <CreditCard className="w-8 h-8 text-indigo-600" />
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2 mb-1">
                                          <h3 className="text-xl font-black text-slate-800 uppercase leading-none tracking-tight">{reimb.title}</h3>
                                          <Badge variant="outline" className={cn(
                                             "text-[9px] font-black uppercase border-indigo-200 px-3",
                                             reimb.status === 'Approved' ? 'bg-indigo-600 text-white' : 'text-indigo-500'
                                          )}>{reimb.status}</Badge>
                                        </div>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                           <User className="w-3 h-3" /> {user?.name} — {new Date(reimb.date).toLocaleDateString()}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-6 w-full md:w-auto">
                                       <div className="text-right">
                                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nilai Talangan</p>
                                          <p className="text-3xl font-black text-rose-600 tracking-tighter">{formatRupiah(reimb.amount)}</p>
                                       </div>
                                       <Button 
                                          variant="outline" 
                                          size="icon" 
                                          className="h-14 w-14 rounded-[1.5rem] border-slate-100 bg-slate-50 hover:bg-white transition-all shadow-sm"
                                          onClick={() => setPreviewImage(reimb.receiptUrl!)}
                                       ><ImageIcon className="w-5 h-5 text-slate-400" /></Button>
                                       <div className="flex gap-2">
                                          {reimb.status === 'Pending' ? (
                                             <>
                                                <Button size="icon" variant="outline" className="h-14 w-14 rounded-2xl border-rose-100 text-rose-400" onClick={() => updateReimbursement(reimb.id, { status: 'Rejected' })}><XCircle className="w-6 h-6" /></Button>
                                                <Button className="h-14 px-8 rounded-2xl bg-indigo-600 text-white font-black uppercase text-[10px]" onClick={() => updateReimbursement(reimb.id, { status: 'Approved' })}>Setujui</Button>
                                             </>
                                          ) : (
                                             <Button className="h-14 px-8 rounded-2xl bg-orange-500 text-white font-black uppercase text-[10px]" onClick={() => handlePayReimbursement(reimb.id)}><Banknote className="w-4 h-4 mr-2" /> Cairkan Duit</Button>
                                          )}
                                       </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              )
                            })}
                         </div>
                      </div>
                   )}
                </div>
            )}
          </TabsContent>

          <TabsContent value="settlement" className="space-y-8">
             {awaitingVerification.length === 0 && awaitingOnlineAudit.length === 0 && pendingReturns.length === 0 ? (
               <EmptyState title="Semua Laporan Aman" desc="Tidak ada sesi belanja atau online purchase yang menunggu validasi rekonsiliasi." />
             ) : (
               <div className="grid gap-8">
                  {/* Category: Setoran Pengembalian Kas Operasional */}
                  {pendingReturns.length > 0 && (
                    <div className="space-y-4">
                       <div className="flex items-center gap-2 pl-4">
                          <Banknote className="w-4 h-4 text-emerald-500" />
                          <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest">Konfirmasi Setoran Kembalian Operasional</h3>
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {pendingReturns.map(exp => {
                             const reporter = users.find(u => u.id === exp.reporterId)
                             const sourceWallet = getAdvanceWalletByUserId(exp.reporterId)
                             return (
                                <Card key={exp.id} className="border-none shadow-xl rounded-[2.5rem] bg-white group hover:scale-[1.02] transition-all">
                                   <CardHeader className="p-6 pb-2">
                                      <div className="flex justify-between items-start mb-4">
                                         <Badge className="bg-emerald-50 text-emerald-700 border-none font-black text-[9px] tracking-widest">PINDAH KAS</Badge>
                                         <span className="text-[10px] font-black text-slate-400">{new Date(exp.date).toLocaleDateString()}</span>
                                      </div>
                                      <CardTitle className="text-sm font-black uppercase leading-tight text-slate-800">{exp.description}</CardTitle>
                                      <CardDescription className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">BY {reporter?.name || 'OPERASIONAL'}</CardDescription>
                                   </CardHeader>
                                   <CardContent className="p-6 pt-4 space-y-4">
                                      <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                                         <span className="text-[9px] font-black text-emerald-600 uppercase block mb-1">Dana Disetor</span>
                                         <span className="text-2xl font-black text-emerald-700 leading-none">{formatRupiah(exp.amount)}</span>
                                      </div>
                                      <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                          <p className="text-[10px] text-slate-500 font-bold">Bank tujuan setoran:</p>
                                          {exp.targetBankAccountId && !returnBankOverrides[exp.id] && (
                                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Pilihan Sourcing</span>
                                          )}
                                          {returnBankOverrides[exp.id] && (
                                            <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Dikoreksi Finance</span>
                                          )}
                                        </div>
                                        <Select
                                          value={returnBankOverrides[exp.id] ?? exp.targetBankAccountId ?? selectedBank}
                                          onValueChange={(v) => v && setReturnBankOverrides(prev => ({ ...prev, [exp.id]: v }))}
                                        >
                                          <SelectTrigger className="h-10 rounded-2xl border-slate-200 font-bold text-xs">
                                            <SelectValue placeholder="Pilih bank..." />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {bankAccounts.filter(b => b.id !== sourceWallet?.bankAccountId).map(b => (
                                              <SelectItem key={b.id} value={b.id} className="font-bold text-xs">{b.name} — {formatRupiah(b.balance)}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="flex gap-2 pt-2">
                                         <Button
                                           variant="outline"
                                           className="flex-1 h-12 rounded-2xl border-rose-100 text-rose-500 font-black uppercase text-[9px] hover:bg-rose-50"
                                           onClick={() => updateExpense(exp.id, { status: 'Rejected' })}
                                         >Tolak</Button>
                                         <Button
                                           className="flex-[2] h-12 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[9px] shadow-lg shadow-emerald-200"
                                           onClick={() => handleAuditExpense(exp.id, 'Approved')}
                                         >Terima Setoran</Button>
                                      </div>
                                   </CardContent>
                                </Card>
                             )
                          })}
                       </div>
                    </div>
                  )}
                  {/* Category: Sourcing Reconciliation */}
                  {awaitingVerification.length > 0 && (
                    <div className="space-y-6">
                       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-orange-50 p-8 rounded-[3rem] border border-orange-100">
                          <div className="flex items-center gap-6">
                             <div className="w-16 h-16 bg-white rounded-[2rem] shadow-xl flex items-center justify-center">
                                <CheckCircle2 className="w-8 h-8 text-orange-500" />
                             </div>
                             <div>
                                <h3 className="text-2xl font-black text-slate-900 tracking-tight">Sourcing Settlement Hub</h3>
                                <p className="text-sm font-bold text-slate-500">Ada {awaitingVerification.length} sesi belanja yang perlu divalidasi pembukuannya.</p>
                             </div>
                          </div>
                          <div className="flex gap-4">
                             <Button 
                               variant="outline"
                               className="h-16 px-10 rounded-2xl border-orange-200 text-orange-600 font-black uppercase text-[10px] tracking-widest bg-white"
                               onClick={() => {
                                 const first = awaitingVerification.find(p => p.reconciliationStatus !== 'Terverifikasi')
                                 if (first) {
                                   openDirectSettle(first.id)
                                 } else {
                                   toast.info("Pilih sesi belanja di bawah untuk input mandiri.")
                                 }
                               }}
                             >
                                Input Hasil Belanja <Plus className="w-4 h-4 ml-2" />
                             </Button>
                             <Button 
                               className="h-16 px-10 rounded-2xl bg-orange-600 hover:bg-orange-500 text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-orange-200"
                               onClick={() => window.location.href = '/finance/approvals/sourcing-settlement'}
                             >
                                Dashboard Settlement <ArrowRight className="w-4 h-4 ml-2" />
                             </Button>
                          </div>
                       </div>

                       <div className="grid gap-6">
                          {awaitingVerification.map(purchase => {
                             const purchaser = users.find(u => u.id === purchase.purchaserId)
                             const items = purchaseItems.filter(pi => pi.purchaseId === purchase.id && pi.purchaseMethod !== 'Online' && !pi.isOnlineAudited)
                             const totalBudget = (purchase.budgetAmount || 0) + (purchase.operationalSpareAmount || 0)
                             
                             return (
                               <Card key={purchase.id} className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
                                  <div className="flex flex-col xl:flex-row">
                                     <div className="xl:w-1/3 p-8 bg-slate-50 border-r border-slate-100 flex flex-col justify-between">
                                        <div>
                                           <div className="flex justify-between items-start mb-6">
                                              <Badge className="bg-orange-100 text-orange-600 border-none font-black text-[9px] px-3 py-1 uppercase">
                                                 {purchase.reconciliationStatus === 'Laporan Masuk' ? 'NEED AUDIT' : 'BELANJA AKTIF'}
                                              </Badge>
                                              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Ref: {purchase.id.slice(0,8)}</h3>
                                           </div>
                                           <div className="space-y-3">
                                              <div className="flex justify-between text-[10px] font-black uppercase"><span className="text-slate-400">Budget Given</span><span>{formatRupiah(totalBudget)}</span></div>
                                              {purchase.reconciliationStatus === 'Laporan Masuk' && (
                                                 <>
                                                    <div className="flex justify-between text-[10px] font-black uppercase"><span className="text-slate-400">Actual Spent</span><span className="text-emerald-600">{formatRupiah(purchase.actualSpent || 0)}</span></div>
                                                    <div className="flex justify-between text-[10px] font-black uppercase pt-3 border-t border-slate-200"><span className="text-slate-400">Returns</span><span className="text-orange-500 font-black">{formatRupiah(purchase.changeReturned || 0)}</span></div>
                                                 </>
                                              )}
                                           </div>
                                        </div>
                                        <div className="mt-8">
                                           {purchase.reconciliationStatus === 'Laporan Masuk' ? (
                                              <Button 
                                                 className="w-full h-12 rounded-xl bg-slate-900 text-white font-black uppercase text-[10px]"
                                                 onClick={() => handleVerifyReconciliation(purchase.id)}
                                              >Verify & Close Book</Button>
                                           ) : (
                                              <Button 
                                                 className="w-full h-12 rounded-xl bg-orange-500 text-white font-black uppercase text-[10px]"
                                                 onClick={() => openDirectSettle(purchase.id)}
                                              >Input Hasil Belanja</Button>
                                           )}
                                        </div>
                                     </div>
                                     <div className="xl:w-2/3 p-8">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Sourcing PIC: {purchaser?.name || 'Pasar Team'}</p>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                           {items.slice(0, 6).map(item => (
                                              <div key={item.id} className="text-[10px] font-bold text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                                                 <span className="truncate mr-2">{products.find(p => p.id === item.productId)?.name}</span>
                                                 <span className="shrink-0 text-slate-400">{item.qtyTarget}x</span>
                                              </div>
                                           ))}
                                           {items.length > 6 && <div className="text-[10px] font-bold text-slate-400 p-3 rounded-xl border border-dashed flex items-center justify-center">+{items.length - 6} more items</div>}
                                        </div>
                                     </div>
                                  </div>
                               </Card>
                             )
                          })}
                       </div>
                    </div>
                  )}
               </div>
             )}
          </TabsContent>

          <TabsContent value="audit_online" className="space-y-6">
             {awaitingOnlineAudit.length === 0 ? (
                <EmptyState title="Audit Online Clear" desc="Semua belanja online sudah diaudit." />
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

          <TabsContent value="delivery" className="space-y-6">
             {awaitingDeliveryAudit.length === 0 ? (
               <EmptyState title="Audit Pengiriman Clear" desc="Semua laporan pengiriman kurir sudah tervalidasi." />
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {awaitingDeliveryAudit.map(delivery => {
                     const so = salesOrders.find(s => s.id === delivery.salesOrderId)
                     const client = clients.find(c => c.id === so?.clientId)
                     const courier = users.find(u => u.id === delivery.courierId)
                     const soItems = salesOrderItems.filter(i => i.salesOrderId === so?.id)
                     const totalRev = soItems.reduce((sum, item) => sum + ((item.qtyFinal ?? item.qty) * item.unitPrice), 0)
                     return (
                        <Card key={delivery.id} className="border-none shadow-xl rounded-[2.5rem] bg-white group overflow-hidden">
                           <CardHeader className="p-6 pb-2">
                              <Badge className="bg-blue-50 text-blue-600 border-none font-black text-[9px] w-fit mb-4">DELIVERY AUDIT</Badge>
                              <CardTitle className="text-base font-black uppercase text-slate-800">{client?.companyName}</CardTitle>
                              <CardDescription className="text-[10px] font-bold text-slate-400 uppercase">PO: {so?.poNumber} • {courier?.name}</CardDescription>
                           </CardHeader>
                           <CardContent className="p-6 pt-4 space-y-4">
                              <div className="aspect-video bg-slate-100 rounded-2xl flex items-center justify-center relative overflow-hidden">
                                 {delivery.baUrl ? <img src={delivery.baUrl} className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-slate-300" />}
                                 {delivery.baUrl && <Button variant="secondary" size="icon" className="absolute bottom-2 right-2 rounded-xl" onClick={() => setPreviewImage(delivery.baUrl!)}><Eye className="w-4 h-4" /></Button>}
                              </div>
                              <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
                                 <span className="text-[9px] font-black text-slate-400 uppercase">Invoice Value</span>
                                 <span className="text-xl font-black text-slate-900">{formatRupiah(totalRev)}</span>
                              </div>
                              <Button className="w-full rounded-2xl h-12 bg-blue-600 text-white font-black uppercase text-[10px]" onClick={() => handleVerifyDelivery(delivery.id)}>Approve & Record Revenue</Button>
                           </CardContent>
                        </Card>
                     )
                  })}
               </div>
             )}
          </TabsContent>
        </Tabs>

        <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
           <DialogContent className="w-[95vw] sm:max-w-4xl border-none rounded-[2rem] p-0 overflow-hidden bg-slate-900">
              <div className="w-full h-[80vh] flex items-center justify-center p-4">
                 {previewImage && <img src={previewImage} className="max-w-full max-h-full object-contain" />}
              </div>
              <div className="p-4 bg-white flex justify-center border-t border-slate-100"><Button className="rounded-2xl bg-slate-950 text-white font-black px-12 h-12" onClick={() => setPreviewImage(null)}>Tutup Preview</Button></div>
           </DialogContent>
        </Dialog>

        {/* Direct Settlement Dialog */}
        <Dialog open={isDirectSettleOpen} onOpenChange={setIsDirectSettleOpen}>
           <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] border-none rounded-[3rem] p-0 bg-slate-50 shadow-2xl flex flex-col overflow-hidden">
              <DialogHeader className="p-8 pb-6 bg-white shrink-0 z-10 border-b border-slate-100">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center">
                       <Banknote className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                       <DialogTitle className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Settlement Belanja</DialogTitle>
                       <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ref: {directSettleId?.slice(0,8)} • Settle per-item hasil sourcing</p>
                    </div>
                 </div>
              </DialogHeader>
              
              <div className="p-8 py-6 space-y-8 flex-1 overflow-y-auto">
                 {/* DAFTAR BELANJAAN */}
                 <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Daftar Belanjaan
                    </h3>
                    <div className="grid gap-3">
                       {purchaseItems.filter(pi => pi.purchaseId === directSettleId && pi.purchaseMethod !== 'Online' && !pi.isOnlineAudited).map(pi => {
                          const product = products.find(p => p.id === pi.productId)
                          const itemState = settlementItems[pi.id] || { actualPrice: 0, qtyPurchased: 0 }
                          
                          return (
                             <div key={pi.id} className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-4 sm:items-center">
                                <div className="flex-1">
                                   <p className="font-black text-slate-800 text-sm">{product?.name}</p>
                                   <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Target: {pi.qtyTarget} {product?.uom}</p>
                                </div>
                                <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
                                   <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase">Qty Aktual</label>
                                      <input 
                                        type="number"
                                        className="w-20 h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs text-slate-700 outline-none focus:border-orange-500 transition-all"
                                        value={itemState.qtyPurchased || ''}
                                        onChange={(e) => setSettlementItems(prev => ({...prev, [pi.id]: { ...itemState, qtyPurchased: parseFloat(e.target.value) || 0 }}))}
                                        placeholder="0"
                                      />
                                   </div>
                                   <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase">Harga / Satuan</label>
                                      <input 
                                        type="number"
                                        className="w-32 h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs text-slate-700 outline-none focus:border-orange-500 transition-all"
                                        value={itemState.actualPrice ? parseFloat(itemState.actualPrice.toFixed(2)) : ''}
                                        onChange={(e) => setSettlementItems(prev => ({...prev, [pi.id]: { ...itemState, actualPrice: parseFloat(e.target.value) || 0 }}))}
                                        placeholder="Rp 0"
                                      />
                                   </div>
                                   <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-emerald-500 uppercase">Total Harga</label>
                                      <input 
                                        type="number"
                                        className="w-32 h-10 bg-emerald-50 border border-emerald-200 rounded-xl px-3 font-black text-xs text-emerald-700 outline-none focus:border-emerald-500 transition-all"
                                        value={((itemState.qtyPurchased || 0) * (itemState.actualPrice || 0)) ? parseFloat(((itemState.qtyPurchased || 0) * (itemState.actualPrice || 0)).toFixed(2)) : ''}
                                        onChange={(e) => {
                                           const newSub = parseFloat(e.target.value) || 0;
                                           const newPrice = itemState.qtyPurchased > 0 ? newSub / itemState.qtyPurchased : 0;
                                           setSettlementItems(prev => ({...prev, [pi.id]: { ...itemState, actualPrice: newPrice }}));
                                        }}
                                        placeholder="Rp 0"
                                      />
                                   </div>
                                </div>
                             </div>
                          )
                       })}
                    </div>
                 </div>

                 {/* BIAYA OPERASIONAL */}
                 <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Truck className="w-4 h-4" /> Biaya Operasional
                    </h3>
                    <div className="grid gap-3">
                       {settlementOps.map((op, index) => (
                          <div key={op.id} className="p-3 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
                             <Select 
                               value={op.category} 
                               onValueChange={(val) => {
                                 const newOps = [...settlementOps]
                                 newOps[index].category = val
                                 setSettlementOps(newOps)
                               }}
                             >
                                <SelectTrigger className="w-full sm:w-32 h-10 rounded-xl text-xs font-bold border-slate-200 bg-slate-50">
                                   <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                   <SelectItem value="Bensin">Bensin</SelectItem>
                                   <SelectItem value="Tol">Tol</SelectItem>
                                   <SelectItem value="Parkir">Parkir</SelectItem>
                                   <SelectItem value="Kuli">Kuli</SelectItem>
                                   <SelectItem value="Makan">Makan</SelectItem>
                                   <SelectItem value="Lainnya">Lainnya</SelectItem>
                                </SelectContent>
                             </Select>
                             <input 
                               type="number"
                               className="w-full sm:w-32 h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs text-slate-700 outline-none focus:border-orange-500 transition-all"
                               value={op.amount || ''}
                               onChange={(e) => {
                                 const newOps = [...settlementOps]
                                 newOps[index].amount = parseFloat(e.target.value) || 0
                                 setSettlementOps(newOps)
                               }}
                               placeholder="Rp 0"
                             />
                             <input 
                               type="text"
                               className="flex-1 h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 font-bold text-xs text-slate-700 outline-none focus:border-orange-500 transition-all"
                               value={op.note}
                               onChange={(e) => {
                                 const newOps = [...settlementOps]
                                 newOps[index].note = e.target.value
                                 setSettlementOps(newOps)
                               }}
                               placeholder="Keterangan (Opsional)"
                             />
                             <Button 
                               variant="ghost" 
                               size="icon-sm" 
                               className="text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl shrink-0 self-end sm:self-auto h-10 w-10"
                               onClick={() => setSettlementOps(settlementOps.filter(o => o.id !== op.id))}
                             >
                               <XCircle className="w-5 h-5" />
                             </Button>
                          </div>
                       ))}
                       <Button 
                         variant="outline" 
                         className="w-full h-12 rounded-2xl border-dashed border-slate-300 text-slate-500 font-bold text-xs hover:bg-slate-50 transition-all"
                         onClick={() => setSettlementOps([...settlementOps, { id: uuidv4(), category: 'Bensin', amount: 0, note: '' }])}
                       >
                         <Plus className="w-4 h-4 mr-2" /> Tambah Biaya Ops
                       </Button>
                    </div>
                 </div>

                 {/* RINGKASAN */}
                 <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Landmark className="w-4 h-4" /> Ringkasan & Sisa Dana
                    </h3>
                    <div className="p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                       <div className="flex justify-between items-center pb-4 border-b border-slate-50">
                          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Budget Diberikan</span>
                          <span className="text-sm font-black text-slate-800">{formatRupiah(directSettleBudget)}</span>
                       </div>
                       <div className="flex justify-between items-center text-rose-500">
                          <span className="text-xs font-black uppercase tracking-widest">Total HPP</span>
                          <span className="text-sm font-black">- {formatRupiah(currentTotalHPP)}</span>
                       </div>
                       <div className="flex justify-between items-center pb-4 border-b border-slate-50 text-rose-500">
                          <span className="text-xs font-black uppercase tracking-widest">Total Ops</span>
                          <span className="text-sm font-black">- {formatRupiah(currentTotalOps)}</span>
                       </div>
                       
                       <div className={`pt-2 flex flex-col sm:flex-row sm:justify-between sm:items-center p-5 rounded-2xl border gap-4 ${netBalance >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                          <div>
                             <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${netBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                               {netBalance >= 0 ? 'Sisa Dana (Kembali)' : 'Talangan Sourcer (Defisit)'}
                             </p>
                             <p className={`text-3xl font-black tracking-tighter leading-none ${netBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {formatRupiah(Math.abs(settlementReturnedCustom !== null ? settlementReturnedCustom : netBalance))}
                             </p>
                          </div>
                          <div className="flex gap-2">
                             <Button 
                               variant="outline" 
                               size="sm" 
                               className={`rounded-xl font-black h-10 px-4 text-[10px] bg-white transition-all ${netBalance >= 0 ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-100' : 'border-rose-200 text-rose-600 hover:bg-rose-100'}`}
                               onClick={() => setSettlementReturnedCustom(null)}
                             >Auto</Button>
                             {netBalance >= 0 && (
                               <input 
                                 type="number"
                                 className="w-32 h-10 bg-white border border-emerald-200 focus:border-emerald-500 rounded-xl px-3 font-bold text-xs text-emerald-700 outline-none transition-all"
                                 value={settlementReturnedCustom !== null ? settlementReturnedCustom : ''}
                                 onChange={(e) => setSettlementReturnedCustom(parseFloat(e.target.value) || 0)}
                                 placeholder="Custom Rp"
                               />
                             )}
                          </div>
                       </div>
                    </div>
                 </div>

                 {/* BUKTI */}
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Link Foto Struk / Dokumen (Opsional)</label>
                    <input 
                      type="text" 
                      className="w-full h-12 bg-white rounded-xl px-4 font-bold text-xs outline-none border border-slate-200 focus:border-orange-500 transition-all"
                      placeholder="https://..."
                      value={settlementProofUrl}
                      onChange={(e) => setSettlementProofUrl(e.target.value)}
                    />
                 </div>
              </div>

              <div className="p-6 bg-white shrink-0 z-10 border-t border-slate-100 flex gap-4">
                 <Button variant="outline" className="flex-1 h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all" onClick={() => setIsDirectSettleOpen(false)}>Batal</Button>
                 <Button className="flex-[2] h-14 rounded-2xl bg-slate-950 hover:bg-slate-800 text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-slate-500/20 transition-all" onClick={handleItemSettlement}>Tutup Buku Sesi Belanja</Button>
              </div>
           </DialogContent>
        </Dialog>
      </div>
    </AuthGuard>
  )
}

function EmptyState({ title, desc }: { title: string, desc: string }) {
  return (
    <Card className="border-none bg-slate-50/50 rounded-[3rem] py-32 shadow-inner">
       <div className="flex flex-col items-center text-center px-6">
          <div className="w-20 h-20 bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 flex items-center justify-center mb-6"><CheckCircle2 className="w-10 h-10 text-emerald-500/20" /></div>
          <h3 className="text-lg font-black text-slate-800 uppercase mb-2">{title}</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{desc}</p>
       </div>
    </Card>
  )
}
