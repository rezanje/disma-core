"use client"

import type { SVGProps } from "react"
import { useState, useCallback } from "react"
import { useAppStore } from "@/lib/store"
import { recordShrinkage, recordStockMovement, recordInboundQC, recordVendorBillFromInbound, recordVendorTransferPurchase } from "@/lib/accounting"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ShieldAlert, ShieldCheck, Tag, RefreshCcw, PackageSearch, AlertTriangle, Warehouse, Truck, ClipboardCheck, ChevronDown, Store } from "lucide-react"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import { cn } from "@/lib/utils"
import { qtyOwed } from "@/lib/backorder"
import { isReturnSplitValid, isSwapSplitValid } from "@/lib/vendor-return"

type PoAllocation = { soId: string; qty: number }

export default function QCPage() {
  const products = useAppStore(state => state.products)
  const purchases = useAppStore(state => state.purchases)
  const purchaseItems = useAppStore(state => state.purchaseItems)
  const allPendingReturns = useAppStore(state => state.pendingReturns)
  // Yang sudah diproses tetap tersimpan sebagai riwayat, tapi tidak boleh muncul
  // lagi di antrian — kalau muncul, barangnya bisa di-restock dua kali.
  const pendingReturns = allPendingReturns.filter(r => r.status !== 'Processed')
  const salesOrders = useAppStore(state => state.salesOrders)
  const salesOrderItems = useAppStore(state => state.salesOrderItems)
  const clients = useAppStore(state => state.clients)
  const vendors = useAppStore(state => state.vendors)
  const vendorPrices = useAppStore(state => state.vendorPrices)
  const vendorReturns = useAppStore(state => state.vendorReturns)

  const bankAccounts = useAppStore(state => state.bankAccounts)

  const updatePurchaseItem = useAppStore(state => state.updatePurchaseItem)
  const updatePendingReturn = useAppStore(state => state.updatePendingReturn)
  const updateSalesOrder = useAppStore(state => state.updateSalesOrder)

  const pendingQCItems = purchaseItems
    .filter(pi => {
       if (pi.isQCed) return false;
       if (pi.inboundStatus === 'verified' || pi.inboundStatus === 'rejected') return false;
       if (pi.inboundStatus === 'pra_inbound') return true;

       const parentP = purchases.find(p => p.id === pi.purchaseId);
       if (!parentP) return false;
       if ((pi.purchaseMethod === 'Pasar' || !pi.purchaseMethod) && parentP.status === 'Selesai') return true;
       if (pi.purchaseMethod === 'Online' && pi.isOnlineOrdered) return true;
       return false;
    })
    .map(item => ({
      ...item,
      product: products.find(p => p.id === item.productId)
    }))
    .filter(item => item.product)
  
  const [selectedPurchaseItemId, setSelectedPurchaseItemId] = useState("")
  const [qtyPassToInventory, setQtyPassToInventory] = useState(0)
  const [poAllocations, setPoAllocations] = useState<PoAllocation[]>([])
  const [qtyReject, setQtyReject] = useState(0)
  const [rejectReason, setRejectReason] = useState("")
  const [unbalanceReason, setUnbalanceReason] = useState("")
  const [qcPhoto, setQcPhoto] = useState<string | null>(null)
  const [expiryDate, setExpiryDate] = useState("")
  const [batchNumber, setBatchNumber] = useState("")
  // Harga beli untuk barang yang diantar vendor — satu-satunya tempat harga itu bisa masuk.
  const [vendorUnitPrice, setVendorUnitPrice] = useState("")
  const [rejectAction, setRejectAction] = useState<'Return' | 'Disposal' | 'B2C'>('Disposal')

  // FIFO suggestion: find open SOs that need this product, oldest first
  const buildFifoAllocations = useCallback((productId: string, totalPassed: number): { allocations: PoAllocation[], inventoryRemainder: number } => {
    const eligibleSos = salesOrders
      .filter(so => !['Batal', 'Selesai', 'Terkirim', 'Packing', 'Siap Kirim', 'Dikirim', 'Awaiting Audit'].includes(so.status))
      .filter(so => salesOrderItems.some(i =>
        i.salesOrderId === so.id &&
        i.productId === productId &&
        Math.max(0, i.qty - (i.qtyDelivered ?? 0) - (i.qtyFinal ?? 0)) > 0
      ))
      .sort((a, b) => a.orderDate.localeCompare(b.orderDate))

    let remaining = totalPassed
    const allocations: PoAllocation[] = eligibleSos.map(so => {
      const soItem = salesOrderItems.find(i => i.salesOrderId === so.id && i.productId === productId)
      const needed = soItem ? Math.max(0, soItem.qty - (soItem.qtyDelivered ?? 0) - (soItem.qtyFinal ?? 0)) : 0
      const alloc = Math.min(needed, remaining)
      remaining -= alloc
      return { soId: so.id, qty: alloc }
    })

    return { allocations, inventoryRemainder: remaining }
  }, [salesOrders, salesOrderItems])

  const activePurchaseItem = pendingQCItems.find(i => i.id === selectedPurchaseItemId)
  const activeProduct = products.find(p => p.id === activePurchaseItem?.productId)

  const handleProcessQC = async () => {
    if (!activeProduct || !activePurchaseItem) return
    const totalIncoming = activePurchaseItem.qtyPurchased
    const totalAllocatedToPos = poAllocations.reduce((s, a) => s + a.qty, 0)
    const totalProcessed = qtyPassToInventory + totalAllocatedToPos + qtyReject

    if (totalProcessed !== totalIncoming && !unbalanceReason) {
      toast.error(`Jumlah tidak balance! Harap masukkan alasan ketidakteraturan.`)
      return
    }

    const currentUser = useAppStore.getState().currentUser
    const typedVendorPrice = Number(vendorUnitPrice) || 0
    const unitCost = typedVendorPrice || activePurchaseItem.actualUnitPrice || activePurchaseItem.estimatedUnitPrice || activeProduct.basePrice || 0;

    // Simpan harga vendor yang diketik supaya settlement, laporan HPP dan riwayat harga
    // memakai angka yang sama dengan jurnal di bawah ini.
    if (typedVendorPrice > 0 && typedVendorPrice !== activePurchaseItem.actualUnitPrice) {
      await updatePurchaseItem(activePurchaseItem.id, { actualUnitPrice: typedVendorPrice })
    }

    toast.loading("Memproses verifikasi inbound & pencatatan jurnal...", { id: "qc-process" })

    // 1. Record double entry journal for receiving and reject routing
    const inboundSuccess = await recordInboundQC(
      activePurchaseItem.id,
      activeProduct.id,
      qtyPassToInventory + totalAllocatedToPos,
      qtyReject,
      qtyReject > 0 ? rejectAction : undefined,
      unitCost,
      'main',
      batchNumber || undefined,
      expiryDate || undefined,
      currentUser?.id || 'system'
    );

    if (!inboundSuccess) {
      toast.error("Gagal memproses jurnal akuntansi untuk QC.", { id: "qc-process" });
      return;
    }

    // 2. Info receipt movement
    await recordStockMovement({
      productId: activeProduct.id,
      quantity: totalIncoming,
      stockDelta: 0,
      direction: 'Info',
      kind: 'QC_RECEIPT',
      source: 'Sourcing',
      destination: 'QC Inspection',
      referenceType: 'QC',
      referenceId: activePurchaseItem.id,
      purchaseItemId: activePurchaseItem.id,
      note: `Barang masuk QC dari sourcing untuk ${activeProduct.name}`,
      createdByUserId: currentUser?.id || 'system',
      warehouseId: 'main',
      batchNumber: batchNumber || undefined,
      expiryDate: expiryDate || undefined,
      unitCost: unitCost
    })

    // 3. Process Passed items to Inventory
    if (qtyPassToInventory > 0) {
      await recordStockMovement({
        productId: activeProduct.id,
        quantity: qtyPassToInventory,
        stockDelta: qtyPassToInventory,
        direction: 'In',
        kind: 'QC_INVENTORY',
        source: 'QC',
        destination: 'Inventory',
        referenceType: 'QC',
        referenceId: activePurchaseItem.id,
        purchaseItemId: activePurchaseItem.id,
        note: `Lolos QC dan masuk inventory`,
        createdByUserId: currentUser?.id || 'system',
        warehouseId: 'main',
        batchNumber: batchNumber || undefined,
        expiryDate: expiryDate || undefined,
        unitCost: unitCost
      })
    }

    // 4. Process allocations to each PO (cumulative qtyFinal for multi-session support)
    for (const alloc of poAllocations) {
      if (alloc.qty <= 0) continue
      const storeState = useAppStore.getState()
      const matchingSOItem = storeState.salesOrderItems.find(
        i => i.salesOrderId === alloc.soId && i.productId === activePurchaseItem.productId
      )
      if (matchingSOItem) {
        const prevQtyFinal = matchingSOItem.qtyFinal ?? 0
        const newQtyFinal = prevQtyFinal + alloc.qty
        await storeState.updateSalesOrderItem(matchingSOItem.id, {
          qtyFinal: newQtyFinal,
          subtotalFinal: newQtyFinal * (matchingSOItem.unitPrice || 0)
        })
      }
      await recordStockMovement({
        productId: activeProduct.id,
        quantity: alloc.qty,
        stockDelta: 0,
        direction: 'Transfer',
        kind: 'QC_CLIENT_ALLOCATION',
        source: 'QC',
        destination: 'Transit (Reserved for Delivery)',
        referenceType: 'QC',
        referenceId: activePurchaseItem.id,
        purchaseItemId: activePurchaseItem.id,
        salesOrderId: alloc.soId,
        note: `Lolos QC → reserved untuk PO ${salesOrders.find(s => s.id === alloc.soId)?.poNumber ?? alloc.soId}`,
        createdByUserId: currentUser?.id || 'system',
        warehouseId: 'main',
        batchNumber: batchNumber || undefined,
        expiryDate: expiryDate || undefined,
        unitCost: unitCost
      })
    }

    // 5. Process Reject routing
    if (qtyReject > 0) {
      const rejectId = uuidv4()
      if (rejectAction === 'B2C') {
        // Physical movement to B2C warehouse
        await recordStockMovement({
          productId: activeProduct.id,
          quantity: qtyReject,
          stockDelta: qtyReject,
          direction: 'In',
          kind: 'QC_INVENTORY',
          source: 'QC Reject',
          destination: 'B2C Warehouse',
          referenceType: 'QC',
          referenceId: activePurchaseItem.id,
          purchaseItemId: activePurchaseItem.id,
          note: `Barang reject dipindahkan ke B2C Peralihan`,
          createdByUserId: currentUser?.id || 'system',
          warehouseId: 'b2c',
          batchNumber: batchNumber || undefined,
          expiryDate: expiryDate || undefined,
          unitCost: unitCost
        });
      } else {
        // Return or Disposal: just record stock movement log with 0 delta
        await recordStockMovement({
          productId: activeProduct.id,
          quantity: qtyReject,
          stockDelta: 0,
          direction: 'Info',
          kind: 'ADJUSTMENT',
          source: 'QC',
          destination: rejectAction === 'Return' ? 'Return to Supplier' : 'Reject/Write-off',
          referenceType: 'QC',
          referenceId: activePurchaseItem.id,
          purchaseItemId: activePurchaseItem.id,
          note: `Reject QC (${rejectAction}): ${rejectReason || 'Tanpa alasan'}`,
          createdByUserId: currentUser?.id || 'system',
          warehouseId: 'main',
          unitCost: unitCost
        });
      }
      
      // Log to Rejection Monitor
      await useAppStore.getState().addRejectedItem({
        id: rejectId,
        date: new Date().toISOString(),
        productId: activeProduct.id,
        qty: qtyReject,
        reason: `${rejectAction === 'B2C' ? 'Peralihan B2C' : rejectAction === 'Return' ? 'Retur Supplier' : 'Disposal'}: ${rejectReason || 'Tanpa alasan'}`,
        source: 'QC',
        referenceId: activePurchaseItem.id,
        reportedBy: currentUser?.id || 'system',
        imageUrl: qcPhoto || undefined
      })

      // "Retur ke Supplier" used to be a log line and nothing else: no document to
      // chase, no status, nobody told. Raise the same VendorReturn the customer-return
      // path raises, so the swap can be tracked to Ditukar/Ditolak in the tab below.
      const returnVendorId = rejectAction === 'Return'
        ? (activePurchaseItem.vendorId || activeProduct.defaultVendorId)
        : undefined

      if (rejectAction === 'Return' && returnVendorId) {
        await useAppStore.getState().addVendorReturn({
          id: uuidv4(),
          productId: activeProduct.id,
          vendorId: returnVendorId,
          qty: qtyReject,
          reason: rejectReason || 'Gagal QC barang masuk',
          date: new Date().toISOString(),
          originalReturnId: activePurchaseItem.id,
          status: 'Menunggu Vendor',
        })
      }

      // Kirim notifikasi ke Admin PO
      const vendorName = vendors.find(v => v.id === returnVendorId)?.companyName
      const adminUsers = useAppStore.getState().users.filter(u => u.role === 'admin_po')
      for (const adminUser of adminUsers) {
        await useAppStore.getState().addNotification({
          id: uuidv4(),
          userId: adminUser.id,
          title: returnVendorId ? `Retur ke Vendor: ${activeProduct.name}` : `QC Reject: ${activeProduct.name}`,
          message: returnVendorId
            ? `${qtyReject} ${activeProduct.uom} diretur ke ${vendorName} untuk ditukar. Alasan: ${rejectReason || 'Tanpa alasan'}.`
            : `${qtyReject} ${activeProduct.uom} ditolak QC (${rejectAction}). Alasan: ${rejectReason || 'Tanpa alasan'}.`,
          type: 'system',
          link: returnVendorId ? '/warehouse/qc' : '/admin/shopping-list',
          read: false,
          createdAt: new Date().toISOString()
        })
      }

      if (rejectAction === 'Return') {
        if (returnVendorId) toast.info(`Retur ke ${vendorName} dibuat — tunggu penggantian dari vendor.`)
        // Belanja cash di pasar tidak punya vendor, jadi tidak ada yang bisa ditagih.
        else toast.warning('Ditandai retur, tapi vendornya tidak diketahui — dokumen retur tidak dibuat.')
      }
    }

    // 6. Tempo (lokasi ambil mana pun): bayar belakangan — tagihan otomatis jadi Hutang
    // Vendor (AP Aging). Dulu ini dibatasi ke Vendor+Tempo dengan alasan Pasar+Tempo
    // di-settle oleh recordReconciliationSettlement; tapi settlement itu cuma jalan di
    // jalur `isLegacy` (purchase dengan budgetTransferDate) yang sudah mati sejak model
    // kantong sourcing, jadi hutang belanja tempo di pasar tidak pernah tercatat sama
    // sekali. netAccrual harus sama persis dengan yang di-credit ke 2-1100 oleh
    // recordInboundQC di atas.
    const qtyReceived = qtyPassToInventory + totalAllocatedToPos + qtyReject
    const grossAccrual = qtyReceived * unitCost
    const netAccrual = grossAccrual - (qtyReject > 0 && rejectAction === 'Return' ? qtyReject * unitCost : 0)

    if (activePurchaseItem.paymentMethod === 'Tempo') {
      if (!activePurchaseItem.vendorId) {
        toast.warning(`${activeProduct.name} (Tempo) tidak ada vendor — hutang tidak otomatis dicatat. Catat manual di AP Aging.`)
      } else if (netAccrual > 0) {
        await recordVendorBillFromInbound(
          activePurchaseItem.id,
          activePurchaseItem.vendorId,
          netAccrual,
          `Tempo: ${activeProduct.name} (QC ${new Date().toLocaleDateString('id-ID')})`,
          activePurchaseItem.purchaseId
        )
      }
    }

    // 7. Vendor + Transfer: dibayar finance dari BCA. Satu-satunya yang memposting ini
    // ada di submit laporan sourcing, padahal barang kiriman vendor sengaja dikeluarkan
    // dari checklist sourcing — jadi uangnya tidak pernah keluar dari bank dan accrual
    // 2-1100 menggantung selamanya. Barang pasar dengan Transfer tetap diposting di
    // sourcing seperti sebelumnya, jadi tidak ada yang dobel.
    if (activePurchaseItem.purchaseMethod === 'Vendor' && activePurchaseItem.paymentMethod === 'Transfer' && netAccrual > 0) {
      const bca = bankAccounts.find(b => b.accountCode === '1-1200')
      if (!bca) {
        toast.warning(`${activeProduct.name} (Transfer): rekening BCA tidak ketemu — pembayaran tidak tercatat.`)
      } else {
        await recordVendorTransferPurchase(
          activePurchaseItem.purchaseId,
          bca.id,
          netAccrual,
          currentUser?.name || 'Finance'
        )
      }
    }

    await updatePurchaseItem(activePurchaseItem.id, {
      isQCed: true,
      inboundStatus: qtyReject === totalIncoming ? 'rejected' : (totalProcessed === totalIncoming ? 'verified' : 'partial'),
      inboundQtyReceived: qtyPassToInventory + totalAllocatedToPos,
      inboundVerifiedAt: new Date().toISOString(),
      inboundVerifiedBy: currentUser?.name || currentUser?.id || 'system',
      inboundNote: [unbalanceReason, rejectReason].filter(Boolean).join(' | '),
      expiryDate: expiryDate || undefined
    })

    // Push SOs to Packing if all their items now have qtyFinal set
    const affectedSoIds = poAllocations.filter(a => a.qty > 0).map(a => a.soId)
    for (const soId of affectedSoIds) {
      const storeState = useAppStore.getState()
      const soItems = storeState.salesOrderItems.filter(i => i.salesOrderId === soId)
      if (soItems.length > 0 && soItems.every(i => (i.qtyFinal != null) || (i.qty - (i.qtyDelivered ?? 0) <= 0))) {
        await updateSalesOrder(soId, { status: 'Packing' })
      }
    }

    toast.success("QC berhasil diproses dan stok telah terupdate!", { id: "qc-process" })

    // Cleanup
    setSelectedPurchaseItemId("")
    setQtyPassToInventory(0)
    setPoAllocations([])
    setQtyReject(0)
    setRejectReason("")
    setUnbalanceReason("")
    setVendorUnitPrice("")
    setQcPhoto(null)
    setExpiryDate("")
    setBatchNumber("")
  }

  // --- TAB 2: CUSTOMER RETURN QC LOGIC ---
  const [selectedReturnId, setSelectedReturnId] = useState("")
  const activeReturn = pendingReturns.find(r => r.id === selectedReturnId)
  const activeReturnProduct = products.find(p => p.id === activeReturn?.productId)
  const [retQtyPass, setRetQtyPass] = useState(0)
  const [retQtyReject, setRetQtyReject] = useState(0)
  const [retReason, setRetReason] = useState("")
  const [retQtyVendor, setRetQtyVendor] = useState(0)
  const [retVendorId, setRetVendorId] = useState("")
  const [selectedVendorReturnId, setSelectedVendorReturnId] = useState("")
  const [swapPassQty, setSwapPassQty] = useState(0)
  const [swapRejectQty, setSwapRejectQty] = useState(0)
  const pendingVendorReturns = vendorReturns.filter(v => v.status === 'Menunggu Vendor')
  const activeVendorReturn = pendingVendorReturns.find(v => v.id === selectedVendorReturnId)
  const activeVendorReturnProduct = products.find(p => p.id === activeVendorReturn?.productId)

  const handleProcessReturnQC = async () => {
    if (!activeReturn || !activeReturnProduct) return
    const currentUser = useAppStore.getState().currentUser

    if (!isReturnSplitValid({ pass: retQtyPass, buang: retQtyReject, vendor: retQtyVendor }, activeReturn.qty)) {
      toast.error(`Total QC harus match dengan jumlah retur (${activeReturn.qty})`)
      return
    }
    if (retQtyVendor > 0 && !retVendorId) {
      toast.error("Pilih vendor tujuan retur dulu.")
      return
    }

    if (retQtyPass > 0) {
      await recordStockMovement({
        productId: activeReturnProduct.id,
        quantity: retQtyPass,
        stockDelta: retQtyPass,
        direction: 'In',
        kind: 'RETURN_RESTOCK',
        source: 'Return QC',
        destination: 'Inventory',
        referenceType: 'QC',
        referenceId: activeReturn.id,
        note: `Retur customer lolos QC dan kembali ke inventory`,
        createdByUserId: currentUser?.id || 'system',
      })
      toast.success(`${retQtyPass} unit dikembalikan ke stok layak jual.`)
    }

    if (retQtyReject > 0) {
      const rejectId = uuidv4()
      await recordShrinkage(rejectId, retQtyReject * (activeReturnProduct.basePrice || 0), `Return Reject - ${activeReturnProduct.name}: ${retReason || activeReturn.reason}`)
      await recordStockMovement({
        productId: activeReturnProduct.id,
        quantity: retQtyReject,
        stockDelta: 0,
        direction: 'Info',
        kind: 'RETURN_REJECT',
        source: 'Return QC',
        destination: 'Reject/Write-off',
        referenceType: 'QC',
        referenceId: activeReturn.id,
        note: `Retur customer reject: ${retReason || activeReturn.reason}`,
        createdByUserId: currentUser?.id || 'system',
      })
      await useAppStore.getState().addRejectedItem({
        id: rejectId,
        date: new Date().toISOString(),
        productId: activeReturnProduct.id,
        qty: retQtyReject,
        reason: retReason || activeReturn.reason,
        source: 'Return',
        referenceId: activeReturn.id,
        reportedBy: currentUser?.id || 'system'
      })
      toast.error(`${retQtyReject} unit rusak/dibuang.`)
    }

    if (retQtyVendor > 0) {
      const vrId = uuidv4()
      await useAppStore.getState().addVendorReturn({
        id: vrId,
        productId: activeReturnProduct.id,
        vendorId: retVendorId,
        qty: retQtyVendor,
        reason: retReason || activeReturn.reason,
        date: new Date().toISOString(),
        originalReturnId: activeReturn.id,
        status: 'Menunggu Vendor',
      })
      // Notify Admin PO — they coordinate the swap with the vendor.
      const vendorName = vendors.find(v => v.id === retVendorId)?.companyName || 'vendor'
      const adminUsers = useAppStore.getState().users.filter(u => u.role === 'admin_po')
      for (const adminUser of adminUsers) {
        await useAppStore.getState().addNotification({
          id: uuidv4(),
          userId: adminUser.id,
          title: `Retur ke Vendor: ${activeReturnProduct.name}`,
          message: `${retQtyVendor} ${activeReturnProduct.uom} diretur ke ${vendorName} untuk ditukar.`,
          type: 'system',
          link: '/warehouse/qc',
          read: false,
          createdAt: new Date().toISOString()
        })
      }
      toast.success(`${retQtyVendor} unit diretur ke vendor untuk ditukar.`)
    }

    // Persist completion — a state-only mutation reappears on next sync.
    await updatePendingReturn(activeReturn.id, { status: 'Processed' })
    setSelectedReturnId("")
    setRetQtyPass(0)
    setRetQtyReject(0)
    setRetQtyVendor(0)
    setRetVendorId("")
    setRetReason("")
  }

  const handleResolveVendorReturn = async (mode: 'swap' | 'reject') => {
    if (!activeVendorReturn || !activeVendorReturnProduct) return
    const currentUser = useAppStore.getState().currentUser
    const prod = activeVendorReturnProduct

    if (mode === 'swap') {
      if (!isSwapSplitValid({ pass: swapPassQty, reject: swapRejectQty }, activeVendorReturn.qty)) {
        toast.error(`Total QC pengganti harus match dengan jumlah retur (${activeVendorReturn.qty})`)
        return
      }
      if (swapPassQty > 0) {
        await recordStockMovement({
          productId: prod.id,
          quantity: swapPassQty,
          stockDelta: swapPassQty,
          direction: 'In',
          kind: 'RETURN_RESTOCK',
          source: 'Vendor Swap',
          destination: 'Inventory',
          referenceType: 'QC',
          referenceId: activeVendorReturn.id,
          note: `Barang pengganti dari vendor lolos QC, masuk stok`,
          createdByUserId: currentUser?.id || 'system',
        })
      }
      if (swapRejectQty > 0) {
        const rejectId = uuidv4()
        await recordShrinkage(rejectId, swapRejectQty * (prod.basePrice || 0), `Vendor Swap Reject - ${prod.name}`)
        await useAppStore.getState().addRejectedItem({
          id: rejectId,
          date: new Date().toISOString(),
          productId: prod.id,
          qty: swapRejectQty,
          reason: `Pengganti vendor gagal QC: ${activeVendorReturn.reason}`,
          source: 'Return',
          referenceId: activeVendorReturn.id,
          reportedBy: currentUser?.id || 'system'
        })
      }
      await useAppStore.getState().updateVendorReturn(activeVendorReturn.id, {
        status: 'Selesai-Ditukar',
        resolvedDate: new Date().toISOString(),
        replacementPassQty: swapPassQty,
        replacementRejectQty: swapRejectQty,
      })
      toast.success(`Tukar selesai: ${swapPassQty} masuk stok, ${swapRejectQty} dibuang.`)
    } else {
      // Vendor refused — the full quantity becomes a loss now.
      const rejectId = uuidv4()
      await recordShrinkage(rejectId, activeVendorReturn.qty * (prod.basePrice || 0), `Vendor Tolak Retur - ${prod.name}`)
      await useAppStore.getState().addRejectedItem({
        id: rejectId,
        date: new Date().toISOString(),
        productId: prod.id,
        qty: activeVendorReturn.qty,
        reason: `Vendor tolak tukar: ${activeVendorReturn.reason}`,
        source: 'Return',
        referenceId: activeVendorReturn.id,
        reportedBy: currentUser?.id || 'system'
      })
      await useAppStore.getState().updateVendorReturn(activeVendorReturn.id, {
        status: 'Selesai-Ditolak',
        resolvedDate: new Date().toISOString(),
      })
      toast.error(`${activeVendorReturn.qty} unit ditolak vendor, dibuang.`)
    }

    setSelectedVendorReturnId("")
    setSwapPassQty(0)
    setSwapRejectQty(0)
  }

  // --- TAB 3: PERSIAPAN PENGIRIMAN ---
  const [selectedDispatchSoIds, setSelectedDispatchSoIds] = useState<Set<string>>(new Set())
  const [dispatchQty, setDispatchQty] = useState<Record<string, number>>({}) // soItemId → qty
  const [dispatchNote, setDispatchNote] = useState<Record<string, string>>({}) // soItemId → note

  const packingSos = salesOrders
    .filter(so => so.status === 'Packing')
    .sort((a, b) => a.targetDeliveryDate.localeCompare(b.targetDeliveryDate))

  const selectedSoItems = salesOrderItems.filter(i =>
    selectedDispatchSoIds.has(i.salesOrderId)
  )

  const handleConfirmDispatch = async () => {
    if (selectedDispatchSoIds.size === 0) return
    const currentUser = useAppStore.getState().currentUser

    toast.loading("Memproses serah terima...", { id: "dispatch" })

    for (const soItemId of Object.keys(dispatchQty)) {
      const qty = dispatchQty[soItemId]
      const note = dispatchNote[soItemId] || ''
      await useAppStore.getState().updateSalesOrderItem(soItemId, {
        isPacked: true,
        qtyDispatched: qty || undefined,
        dispatchNote: note || undefined,
      })
    }

    // Sengaja TIDAK memajukan status ke 'Siap Kirim'. Rilis barang hanya boleh
    // lewat Goods Outbound, karena di sanalah stok dikurangi dan misi pengiriman
    // untuk kurir dibuat. Memajukan status di sini justru mengeluarkan PO dari
    // antrian Outbound, sehingga satu-satunya jalur yang benar jadi tak bisa
    // ditempuh — barang berangkat tanpa pernah tercatat keluar.

    toast.success(`Persiapan ${selectedDispatchSoIds.size} PO tersimpan. Lanjutkan rilis di Gudang › Goods Outbound.`, { id: "dispatch" })
    setSelectedDispatchSoIds(new Set())
    setDispatchQty({})
    setDispatchNote({})
  }

  const groupedQCItems = pendingQCItems.reduce((acc, item) => {
    const so = salesOrders.find(s => s.id === item.salesOrderId);
    const groupKey = so ? `PO: ${so.poNumber}` : "Restock Gudang (Tanpa PO)";
    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(item);
    return acc;
  }, {} as Record<string, typeof pendingQCItems>);

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 uppercase">Input <span className="text-emerald-600">QC & Inspeksi</span></h2>
          <p className="text-slate-500 font-bold mt-1 uppercase text-[10px] tracking-widest">Validasi barang masuk dari Sourcing & Retur Customer.</p>
        </div>
      </div>

      <Tabs defaultValue="sourcing" className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-2xl mb-6">
          <TabsTrigger value="sourcing" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest">
            QC Barang Baru (Sourcing)
          </TabsTrigger>
          <TabsTrigger value="returns" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
            Retur dari Customer
            {pendingReturns.length > 0 && (
              <span className="bg-rose-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[8px] animate-pulse">
                {pendingReturns.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="dispatch" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
            <Truck className="w-3 h-3" />
            Persiapan Pengiriman
            {packingSos.length > 0 && (
              <span className="bg-violet-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[8px] animate-pulse">
                {packingSos.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="vendor-returns" className="rounded-xl px-8 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
            <Store className="w-4 h-4" /> Retur ke Vendor
            {pendingVendorReturns.length > 0 && (
              <span className="ml-1 bg-blue-600 text-white rounded-full px-2 py-0.5 text-[9px]">{pendingVendorReturns.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sourcing">
          <Card className="liquid-card border-none shadow-xl shadow-slate-200/50">
            <CardHeader className="bg-white rounded-t-[3rem] border-b border-slate-50 px-8 py-6">
              <CardTitle className="text-lg font-black text-slate-800 flex items-center gap-3">
                <PackageSearch className="w-6 h-6 text-emerald-600" /> Inspeksi Kedatangan Sourcing
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
               <div className="space-y-6">
                 {Object.entries(groupedQCItems).length === 0 ? (
                   <div className="h-40 border border-dashed rounded-[2.5rem] flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                      <PackageSearch className="w-8 h-8 opacity-20 mb-2" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Belum ada barang masuk untuk di-QC</p>
                   </div>
                 ) : (
                   Object.entries(groupedQCItems).map(([poName, items]) => (
                     <div key={poName} className="space-y-3">
                       <h4 className="font-black text-[10px] uppercase tracking-widest text-slate-500 bg-slate-100 px-4 py-2 rounded-xl w-fit">
                         {poName}
                       </h4>
                       <div className="grid gap-3">
                         {items.map(item => (
                           <button
                             key={item.id}
                             onClick={() => {
                               setSelectedPurchaseItemId(item.id)
                               setQtyReject(0)
                               const { allocations, inventoryRemainder } = buildFifoAllocations(item.productId, item.qtyPurchased)
                               setPoAllocations(allocations)
                               setQtyPassToInventory(inventoryRemainder)
                             }}
                             className={cn(
                               "p-5 rounded-[2rem] border text-left flex justify-between items-center transition-all",
                               selectedPurchaseItemId === item.id ? "bg-emerald-50 border-emerald-200 shadow-md ring-2 ring-emerald-500/10" : "bg-white border-slate-100 hover:bg-slate-50"
                             )}
                           >
                              <div>
                                 <h4 className="font-black text-slate-800 uppercase tracking-tight">{item.product?.name}</h4>
                                 <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Pembelian: {item.purchaseMethod || 'Pasar'}</p>
                              </div>
                              <div className="bg-slate-100 px-4 py-2 rounded-2xl font-black text-sm text-slate-600">
                                 {item.qtyPurchased} {item.product?.uom}
                              </div>
                           </button>
                         ))}
                       </div>
                     </div>
                   ))
                 )}
               </div>

               {activeProduct && activePurchaseItem && (
                 <div className="pt-6 border-t border-slate-50 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    
                    <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden group">
                       <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-emerald-500/20 transition-all" />
                       <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400 mb-2">Total Barang Datang (Fisik)</p>
                       <div className="flex items-baseline gap-3">
                          <h3 className="text-6xl font-black">{activePurchaseItem.qtyPurchased}</h3>
                          <span className="text-xl font-bold opacity-50 uppercase">{activeProduct.uom}</span>
                       </div>
                    </div>

                    {/* PO Allocation Table */}
                    <div className="space-y-3">
                      <Label className="text-slate-500 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                        <Tag className="w-4 h-4" /> Distribusi ke PO Klien (FIFO)
                      </Label>

                      {poAllocations.length === 0 ? (
                        <div className="p-5 rounded-[2rem] border border-dashed border-slate-200 bg-slate-50/50 text-center">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tidak ada PO pending untuk produk ini</p>
                        </div>
                      ) : (
                        <div className="rounded-[2rem] border border-indigo-100 overflow-hidden">
                          {poAllocations.map((alloc, idx) => {
                            const so = salesOrders.find(s => s.id === alloc.soId)
                            const client = clients.find(c => c.id === so?.clientId)
                            const soItem = salesOrderItems.find(i => i.salesOrderId === alloc.soId && i.productId === activePurchaseItem.productId)
                            const needed = soItem ? Math.max(0, soItem.qty - (soItem.qtyDelivered ?? 0) - (soItem.qtyFinal ?? 0)) : 0
                            return (
                              <div key={alloc.soId} className={cn(
                                "flex items-center gap-4 px-5 py-4 bg-indigo-50/40",
                                idx > 0 && "border-t border-indigo-100"
                              )}>
                                <div className="flex-1 min-w-0">
                                  <p className="font-black text-slate-800 text-sm truncate">{so?.poNumber ?? alloc.soId}</p>
                                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{client?.companyName ?? '—'} · Butuh: {needed} {activeProduct?.uom}</p>
                                </div>
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  className="w-28 text-lg font-black h-12 rounded-xl border-indigo-200 bg-white text-center"
                                  value={alloc.qty}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0
                                    setPoAllocations(prev => prev.map((a, i) => i === idx ? { ...a, qty: val } : a))
                                  }}
                                />
                                <span className="text-xs font-bold text-slate-400 uppercase w-8">{activeProduct?.uom}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Inventory + Reject */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-emerald-50/50 p-6 rounded-[2.5rem] border border-emerald-100/50 space-y-4">
                        <Label className="text-emerald-700 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                          <Warehouse className="w-4 h-4" /> Stok Gudang
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                          value={qtyPassToInventory}
                          onChange={(e) => setQtyPassToInventory(parseFloat(e.target.value) || 0)}
                        />
                        <p className="text-[8px] font-bold text-emerald-400 uppercase">Masuk Stok Gudang (Available)</p>
                      </div>

                      <div className="bg-rose-50/50 p-6 rounded-[2.5rem] border border-rose-100/50 space-y-4">
                        <Label className="text-rose-700 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4" /> Reject / Rusak
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                          value={qtyReject}
                          onChange={(e) => setQtyReject(parseFloat(e.target.value) || 0)}
                        />
                        <p className="text-[8px] font-bold text-rose-400 uppercase">Buang / Shrinkage</p>
                      </div>
                    </div>

                    {/* Barang kiriman vendor tidak pernah lewat checklist sourcing, jadi tidak ada
                        tahap mana pun yang menanyakan harga beli sebenarnya. Tanpa ini semua
                        angkanya jatuh ke harga patokan: nilai persediaan, HPP, dan nominal
                        tagihan tempo ke vendor. */}
                    {activePurchaseItem?.purchaseMethod === 'Vendor' && (
                      <div className="space-y-2">
                        <Label className="text-slate-500 font-black uppercase text-[10px] tracking-widest">
                          Harga Satuan dari Vendor (per {activeProduct?.uom || 'unit'})
                        </Label>
                        <Input
                          inputMode="numeric"
                          placeholder={String(activePurchaseItem.estimatedUnitPrice || activeProduct?.basePrice || 0)}
                          className="h-14 rounded-xl border border-slate-100 bg-white"
                          value={vendorUnitPrice}
                          onChange={(e) => setVendorUnitPrice(e.target.value.replace(/\D/g, ''))}
                        />
                        <p className="text-[10px] font-bold text-slate-400">
                          Kosongkan kalau sesuai patokan Rp{(activePurchaseItem.estimatedUnitPrice || activeProduct?.basePrice || 0).toLocaleString('id-ID')}.
                          Angka ini dipakai untuk nilai persediaan dan tagihan vendor.
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Batch Number (Opsional)</Label>
                        <Input
                          placeholder="e.g. BATCH-A1"
                          className="h-14 rounded-xl border border-slate-100 bg-white"
                          value={batchNumber}
                          onChange={(e) => setBatchNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Tanggal Kedaluarsa (Wajib Pangan Segar)</Label>
                        <Input
                          type="date"
                          className="h-14 rounded-xl border border-slate-100 bg-white"
                          value={expiryDate}
                          onChange={(e) => setExpiryDate(e.target.value)}
                        />
                      </div>
                    </div>
 
                     <div className="space-y-4">
                        <div className="flex justify-between items-center px-4">
                           {(() => {
                             const totalAllocPos = poAllocations.reduce((s, a) => s + a.qty, 0)
                             const totalDone = qtyPassToInventory + totalAllocPos + qtyReject
                             const balanced = totalDone === activePurchaseItem.qtyPurchased
                             return <>
                               <span className={cn("text-xs font-black uppercase tracking-widest", balanced ? "text-emerald-600" : "text-rose-600 animate-pulse")}>
                                 Status: {balanced ? "Balance ✓" : "Tidak Balance !"}
                               </span>
                               <span className="text-[10px] font-bold text-slate-400">Processed: {totalDone} / {activePurchaseItem.qtyPurchased}</span>
                             </>
                           })()}
                        </div>

                        {(() => {
                          const totalAllocPos = poAllocations.reduce((s, a) => s + a.qty, 0)
                          return (qtyPassToInventory + totalAllocPos + qtyReject !== activePurchaseItem.qtyPurchased)
                        })() && (
                           <div className="space-y-3 p-6 bg-rose-50 rounded-[2rem] border border-rose-100 animate-in zoom-in-95">
                              <Label className="text-rose-700 font-black uppercase text-[10px] tracking-widest">Alasan Selisih / Tidak Balance (Wajib)</Label>
                              <Input 
                                placeholder="Kenapa jumlah fisik beda?"
                                className="h-14 rounded-xl border-rose-200 bg-white"
                                value={unbalanceReason}
                                onChange={(e) => setUnbalanceReason(e.target.value)}
                              />
                              <div className="flex items-center gap-3 mt-4">
                                <div 
                                  className="h-14 flex-1 border-2 border-dashed border-rose-200 rounded-xl flex items-center justify-center bg-white cursor-pointer hover:border-rose-400 transition-all text-slate-400"
                                  onClick={() => {
                                    setQcPhoto("https://images.unsplash.com/photo-1582285273767-42f01eb0a316?auto=format&fit=crop&q=80&w=400")
                                    toast.success("Foto bukti selisih ditambahkan!")
                                  }}
                                >
                                   {qcPhoto ? <img src={qcPhoto} className="w-full h-full object-cover rounded-lg" /> : <div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4" /><span className="text-[10px] font-black uppercase">Foto Bukti (Opsional)</span></div>}
                                </div>
                                {qcPhoto && <Button variant="outline" size="icon" className="h-14 w-14 rounded-xl" onClick={() => setQcPhoto(null)}>✕</Button>}
                              </div>
                           </div>
                        )}
 
                        {qtyReject > 0 && (
                          <div className="space-y-4 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                             <Label className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Tindakan Barang Reject</Label>
                             <div className="grid grid-cols-3 gap-2">
                               <button
                                 type="button"
                                 onClick={() => setRejectAction('Return')}
                                 className={cn(
                                   "h-12 rounded-xl font-bold text-xs uppercase transition-all border",
                                   rejectAction === 'Return' ? "bg-rose-600 text-white border-rose-600 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                 )}
                               >
                                 Retur ke Supplier
                               </button>
                               <button
                                 type="button"
                                 onClick={() => setRejectAction('Disposal')}
                                 className={cn(
                                   "h-12 rounded-xl font-bold text-xs uppercase transition-all border",
                                   rejectAction === 'Disposal' ? "bg-rose-600 text-white border-rose-600 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                 )}
                               >
                                 Disposal (Buang)
                               </button>
                               <button
                                 type="button"
                                 onClick={() => setRejectAction('B2C')}
                                 className={cn(
                                   "h-12 rounded-xl font-bold text-xs uppercase transition-all border",
                                   rejectAction === 'B2C' ? "bg-emerald-600 text-white border-emerald-600 shadow-md" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                 )}
                               >
                                 Peralihan B2C
                               </button>
                             </div>
                             
                             <div className="space-y-2 mt-2">
                               <Label className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Alasan Reject</Label>
                               <Input 
                                 placeholder="Kondisi barang reject (pecah, busuk, dll)"
                                 className="h-14 rounded-xl border border-slate-100 bg-white"
                                 value={rejectReason}
                                 onChange={(e) => setRejectReason(e.target.value)}
                               />
                             </div>
                          </div>
                        )}

                    <Button 
                      className="w-full h-20 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all text-lg"
                      onClick={handleProcessQC}
                    >
                      Konfirmasi QC Sourcing
                    </Button>
                  </div>
               </div>
             )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="returns">
          <Card className="liquid-card border-none shadow-xl shadow-slate-200/50">
            <CardHeader className="bg-white rounded-t-[3rem] border-b border-slate-50 px-8 py-6">
              <CardTitle className="text-lg font-black text-slate-800 flex items-center gap-3">
                <RefreshCcw className="w-6 h-6 text-blue-600" /> Inspeksi Retur Customer (QC Balik)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
               <div className="space-y-3">
                 <Label className="font-black text-xs uppercase tracking-widest text-slate-400">Items Dibawa Balik Kurir</Label>
                 {pendingReturns.length === 0 ? (
                   <div className="h-40 border border-dashed rounded-[2.5rem] flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                      <RefreshCcw className="w-8 h-8 opacity-20 mb-2" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Tidak ada barang retur yang menunggu QC</p>
                   </div>
                 ) : (
                   <div className="grid gap-3">
                      {pendingReturns.map(ret => {
                        const p = products.find(prod => prod.id === ret.productId)
                        const so = salesOrders.find(s => s.id === ret.originalSoId)
                        return (
                          <button 
                            key={ret.id} 
                            onClick={() => {
                              setSelectedReturnId(ret.id)
                              setRetQtyPass(ret.qty)
                              setRetQtyReject(0)
                              setRetQtyVendor(0)
                              const suggested = vendorPrices.find(vp => vp.productId === ret.productId && vp.status === 'active')?.vendorId || ""
                              setRetVendorId(suggested)
                            }}
                            className={cn(
                              "p-5 rounded-[2rem] border text-left flex justify-between items-center transition-all",
                              selectedReturnId === ret.id ? "bg-blue-50 border-blue-200 shadow-md ring-2 ring-blue-500/10" : "bg-white border-slate-100 hover:bg-slate-50"
                            )}
                          >
                             <div>
                                <h4 className="font-black text-slate-800 uppercase tracking-tight">{p?.name}</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Ref PO: {so?.poNumber} • Alasan: {ret.reason}</p>
                             </div>
                             <div className="bg-slate-100 px-4 py-2 rounded-2xl font-black text-sm text-slate-600">
                                {ret.qty} {p?.uom}
                             </div>
                          </button>
                        )
                      })}
                   </div>
                 )}
               </div>

               {activeReturnProduct && activeReturn && (
                 <div className="pt-8 border-t border-slate-50 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-amber-50 border border-amber-100 p-5 rounded-[2rem] flex items-start gap-4">
                       <AlertTriangle className="w-5 h-5 text-amber-600 mt-1" />
                       <div>
                          <p className="font-black text-[10px] uppercase text-amber-700 tracking-widest mb-1">Peringatan QC Retur</p>
                          <p className="text-xs font-bold text-amber-800/80 leading-relaxed">Cek kondisi fisik barang retur. Barang yang lolos (Restock) akan dikembalikan ke stok layak jual untuk dijual ke customer lain.</p>
                       </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-emerald-50/50 p-5 rounded-[2rem] border border-emerald-100/50 space-y-3">
                        <Label className="text-emerald-700 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                          <RefreshCcw className="w-4 h-4" /> Masuk Stok
                        </Label>
                        <Input
                           type="number" min="0" step="any"
                           className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                           value={retQtyPass}
                           onChange={(e) => setRetQtyPass(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="bg-rose-50/50 p-5 rounded-[2rem] border border-rose-100/50 space-y-3">
                        <Label className="text-rose-700 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                          <Trash2 className="w-4 h-4" /> Buang
                        </Label>
                        <Input
                           type="number" min="0" step="any"
                           className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                           value={retQtyReject}
                           onChange={(e) => setRetQtyReject(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="bg-blue-50/50 p-5 rounded-[2rem] border border-blue-100/50 space-y-3">
                        <Label className="text-blue-700 font-black uppercase text-[10px] tracking-widest flex items-center gap-2">
                          <Store className="w-4 h-4" /> Retur ke Vendor
                        </Label>
                        <Input
                           type="number" min="0" step="any"
                           className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                           value={retQtyVendor}
                           onChange={(e) => setRetQtyVendor(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    {retQtyVendor > 0 && (
                      <div className="bg-blue-50/50 p-5 rounded-[2rem] border border-blue-100/50 space-y-3">
                        <Label className="text-blue-700 font-black uppercase text-[10px] tracking-widest">Vendor Tujuan Retur</Label>
                        <select
                          className="w-full h-14 rounded-xl border border-blue-100 bg-white px-4 font-bold text-slate-700"
                          value={retVendorId}
                          onChange={(e) => setRetVendorId(e.target.value)}
                        >
                          <option value="">— Pilih vendor —</option>
                          {vendors.map(v => (
                            <option key={v.id} value={v.id}>{v.companyName}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <Button 
                      className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-3xl font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all"
                      disabled={!isReturnSplitValid({ pass: retQtyPass, buang: retQtyReject, vendor: retQtyVendor }, activeReturn.qty)}
                      onClick={handleProcessReturnQC}
                    >
                      Input Hasil QC Retur
                    </Button>
                 </div>
               )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vendor-returns">
          <Card className="liquid-card border-none shadow-xl shadow-slate-200/50">
            <CardHeader className="bg-white rounded-t-[3rem] border-b border-slate-50 px-8 py-6">
              <CardTitle className="text-lg font-black text-slate-800 flex items-center gap-3">
                <Store className="w-6 h-6 text-blue-600" /> Retur ke Vendor (Menunggu Tukar)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              {pendingVendorReturns.length === 0 ? (
                <div className="h-40 border border-dashed rounded-[2.5rem] flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                  <Store className="w-8 h-8 opacity-20 mb-2" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Tidak ada retur vendor yang menunggu</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {pendingVendorReturns.map(vr => {
                    const p = products.find(prod => prod.id === vr.productId)
                    const vend = vendors.find(v => v.id === vr.vendorId)
                    return (
                      <button
                        key={vr.id}
                        onClick={() => {
                          setSelectedVendorReturnId(vr.id)
                          setSwapPassQty(vr.qty)
                          setSwapRejectQty(0)
                        }}
                        className={cn(
                          "p-5 rounded-[2rem] border text-left flex justify-between items-center transition-all",
                          selectedVendorReturnId === vr.id ? "bg-blue-50 border-blue-200 shadow-md ring-2 ring-blue-500/10" : "bg-white border-slate-100 hover:bg-slate-50"
                        )}
                      >
                        <div>
                          <h4 className="font-black text-slate-800 uppercase tracking-tight">{p?.name}</h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Vendor: {vend?.companyName} • Alasan: {vr.reason}</p>
                        </div>
                        <div className="bg-slate-100 px-4 py-2 rounded-2xl font-black text-sm text-slate-600">{vr.qty} {p?.uom}</div>
                      </button>
                    )
                  })}
                </div>
              )}

              {activeVendorReturn && activeVendorReturnProduct && (
                <div className="pt-8 border-t border-slate-50 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="bg-blue-50 border border-blue-100 p-5 rounded-[2rem]">
                    <p className="font-black text-[10px] uppercase text-blue-700 tracking-widest mb-1">QC Barang Pengganti</p>
                    <p className="text-xs font-bold text-blue-800/80 leading-relaxed">Kalau vendor kasih pengganti, cek kondisinya lalu isi berapa yang layak masuk stok. Kalau vendor tolak tukar, pakai tombol merah.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-emerald-50/50 p-5 rounded-[2rem] border border-emerald-100/50 space-y-3">
                      <Label className="text-emerald-700 font-black uppercase text-[10px] tracking-widest">Pengganti Layak</Label>
                      <Input
                        type="number" min="0" step="any"
                        className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                        value={swapPassQty}
                        onChange={(e) => setSwapPassQty(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="bg-rose-50/50 p-5 rounded-[2rem] border border-rose-100/50 space-y-3">
                      <Label className="text-rose-700 font-black uppercase text-[10px] tracking-widest">Pengganti Rusak</Label>
                      <Input
                        type="number" min="0" step="any"
                        className="text-2xl font-black h-14 rounded-xl border-none shadow-sm"
                        value={swapRejectQty}
                        onChange={(e) => setSwapRejectQty(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      className="h-16 bg-emerald-600 hover:bg-emerald-700 text-white rounded-3xl font-black uppercase tracking-[0.15em] shadow-xl active:scale-95 transition-all"
                      disabled={!isSwapSplitValid({ pass: swapPassQty, reject: swapRejectQty }, activeVendorReturn.qty)}
                      onClick={() => handleResolveVendorReturn('swap')}
                    >
                      Ditukar (Pengganti Masuk)
                    </Button>
                    <Button
                      className="h-16 bg-rose-600 hover:bg-rose-700 text-white rounded-3xl font-black uppercase tracking-[0.15em] shadow-xl active:scale-95 transition-all"
                      onClick={() => handleResolveVendorReturn('reject')}
                    >
                      Ditolak Vendor (Buang)
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dispatch">
          <Card className="liquid-card border-none shadow-xl shadow-slate-200/50">
            <CardHeader className="bg-white rounded-t-[3rem] border-b border-slate-50 px-8 py-6">
              <CardTitle className="text-lg font-black text-slate-800 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-violet-600" />
                </div>
                Persiapan Pengiriman
              </CardTitle>
              <p className="text-slate-500 text-sm">Pilih PO yang akan dikirim hari ini, input qty &amp; catatan per item, lalu simpan. Rilis barangnya dilakukan di Gudang › Goods Outbound.</p>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              {packingSos.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-semibold">Tidak ada PO dalam status Packing</p>
                </div>
              ) : (
                <>
                  {/* PO Selection */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-700 uppercase tracking-widest">Pilih PO</p>
                      <button
                        onClick={() => {
                          if (selectedDispatchSoIds.size === packingSos.length) {
                            setSelectedDispatchSoIds(new Set())
                          } else {
                            setSelectedDispatchSoIds(new Set(packingSos.map(s => s.id)))
                          }
                        }}
                        className="text-xs text-violet-600 hover:underline font-semibold"
                      >
                        {selectedDispatchSoIds.size === packingSos.length ? 'Batal Semua' : 'Pilih Semua'}
                      </button>
                    </div>
                    <div className="grid gap-2">
                      {packingSos.map(so => {
                        const client = clients.find(c => c.id === so.clientId)
                        const checked = selectedDispatchSoIds.has(so.id)
                        return (
                          <div
                            key={so.id}
                            onClick={() => {
                              const next = new Set(selectedDispatchSoIds)
                              if (next.has(so.id)) next.delete(so.id)
                              else next.add(so.id)
                              setSelectedDispatchSoIds(next)
                            }}
                            className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${checked ? 'border-violet-400 bg-violet-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}
                          >
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${checked ? 'border-violet-500 bg-violet-500' : 'border-slate-300'}`}>
                              {checked && <div className="w-2 h-2 bg-white rounded-full" />}
                            </div>
                            <div className="flex-1">
                              <p className="font-bold text-slate-800 text-sm">{so.poNumber}</p>
                              <p className="text-xs text-slate-500">{client?.companyName} · Target: {so.targetDeliveryDate}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Items per selected SO */}
                  {selectedDispatchSoIds.size > 0 && (
                    <div className="space-y-4">
                      <p className="text-sm font-bold text-slate-700 uppercase tracking-widest">Item yang Disiapkan</p>
                      {Array.from(selectedDispatchSoIds).map(soId => {
                        const so = packingSos.find(s => s.id === soId)
                        if (!so) return null
                        const client = clients.find(c => c.id === so.clientId)
                        const items = salesOrderItems.filter(i => i.salesOrderId === soId)
                        return (
                          <div key={soId} className="rounded-2xl border border-violet-100 overflow-hidden">
                            <div className="bg-violet-50 px-5 py-3 border-b border-violet-100">
                              <p className="font-bold text-violet-800 text-sm">{so.poNumber} — {client?.companyName}</p>
                            </div>
                            <div className="divide-y divide-slate-50">
                              {items.map(item => {
                                const product = products.find(p => p.id === item.productId)
                                // Yang masih harus dikirim, bukan qty asli PO — untuk pengiriman
                                // susulan sisanya lebih kecil dari pesanan awal.
                                const owed = qtyOwed(item)
                                const isPartial = (item.qtyDelivered || 0) > 0
                                const passed = item.qtyFinal ?? 0
                                const isShort = passed < owed
                                return (
                                  <div key={item.id} className="px-5 py-4 bg-white grid grid-cols-[1fr_120px_1fr] gap-4 items-center">
                                    <div>
                                      <p className="font-semibold text-slate-800 text-sm">{product?.name}</p>
                                      <p className="text-xs font-bold text-slate-600">
                                        Dibutuhkan: {owed} {product?.uom}
                                        {isPartial && (
                                          <span className="font-normal text-slate-400"> (sisa dari {item.qty})</span>
                                        )}
                                      </p>
                                      <p className={cn("text-xs", isShort ? "font-bold text-amber-600" : "text-slate-400")}>
                                        QC Passed: {item.qtyFinal ?? '-'} {product?.uom}
                                        {isShort && <span> — kurang {owed - passed}</span>}
                                      </p>
                                    </div>
                                    <input
                                      type="number"
                                      placeholder={String(item.qtyFinal ?? item.qty)}
                                      value={dispatchQty[item.id] ?? ''}
                                      onChange={e => setDispatchQty(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-center w-full"
                                    />
                                    <input
                                      type="text"
                                      placeholder="Catatan (opsional)"
                                      value={dispatchNote[item.id] ?? ''}
                                      onChange={e => setDispatchNote(prev => ({ ...prev, [item.id]: e.target.value }))}
                                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm w-full"
                                    />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}

                      <button
                        onClick={handleConfirmDispatch}
                        className="w-full py-4 bg-violet-600 hover:bg-violet-700 text-white font-black text-sm uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-colors"
                      >
                        <ClipboardCheck className="w-4 h-4" />
                        Simpan Persiapan ({selectedDispatchSoIds.size} PO)
                      </button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Trash2(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}
