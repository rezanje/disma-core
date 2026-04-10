import { jsPDF } from "jspdf"
import { format } from "date-fns"
import { useAppStore } from "./store"
import { formatRupiah, formatRupiahValue } from "./utils"

// Basic standardized branding
const BRANDING = {
  companyName: "PT DISMA DISTRIBUSI",
  address: "Kawasan Industri Pulo Gadung, Jakarta Timur",
  phone: "021-99887766",
  email: "finance@disma-distribusi.com"
}

// Helper to draw standard header
function drawHeader(doc: jsPDF, title: string, docNumber: string, date: Date) {
  doc.setFontSize(20)
  doc.setFont("helvetica", "bold")
  doc.text(BRANDING.companyName, 14, 22)
  
  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text(BRANDING.address, 14, 28)
  doc.text(`Phone: ${BRANDING.phone} | Email: ${BRANDING.email}`, 14, 33)

  doc.setDrawColor(200, 200, 200)
  doc.line(14, 38, 196, 38)

  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text(title, 14, 48)

  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text(`No: ${docNumber}`, 14, 55)
  doc.text(`Tanggal: ${format(date, 'dd MMM yyyy HH:mm')}`, 14, 60)
}

// Helper to draw signature block
function drawSignatures(doc: jsPDF, leftRole: string, rightRole: string, yPos: number, leftSignature?: string, rightSignature?: string) {
  doc.setFontSize(10)
  doc.text(leftRole, 30, yPos)
  doc.text(rightRole, 150, yPos)
  
  if (leftSignature) {
    try {
      doc.addImage(leftSignature, 'PNG', 20, yPos + 5, 40, 15)
    } catch (e) {
      console.error("Left signature error:", e)
    }
  }

  if (rightSignature) {
    try {
      doc.addImage(rightSignature, 'PNG', 140, yPos + 5, 40, 15)
    } catch (e) {
      console.error("Right signature error:", e)
    }
  }

  // Signature underlines
  doc.setFont("helvetica", "normal")
  doc.text("(_______________________)", 20, yPos + 30)
  doc.text("(_______________________)", 140, yPos + 30)
}

function drawSalesOrderOnDoc(doc: jsPDF, poNumber: string) {
  const store = useAppStore.getState()
  const so = store.salesOrders.find(s => s.poNumber === poNumber)
  if (!so) return

  doc.addPage()
  const client = store.clients.find(c => c.id === so.clientId)
  const items = store.salesOrderItems.filter(i => i.salesOrderId === so.id)
  
  drawHeader(doc, "SALES ORDER (PURCHASE ORDER REF)", `SO-${poNumber}`, new Date(so.orderDate))

  // Client Info
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text("Pesan Dari (Client):", 130, 48)
  doc.setFont("helvetica", "normal")
  doc.text(client?.companyName || 'Unknown', 130, 54)
  doc.text(client?.address || '', 130, 59, { maxWidth: 60 })

  let y = 80
  doc.setFillColor(240, 240, 240)
  doc.rect(14, y, 182, 10, 'F')
  doc.setFont("helvetica", "bold")
  doc.text("No", 16, y + 7)
  doc.text("Barang", 30, y + 7)
  doc.text("Qty", 120, y + 7)
  doc.text("Harga Satuan", 140, y + 7)
  doc.text("Total", 175, y + 7)

  doc.setFont("helvetica", "normal")
  y += 18
  items.forEach((item, index) => {
    const product = store.products.find(p => p.id === item.productId)
    doc.text(`${index + 1}`, 16, y)
    doc.text(product?.name || '-', 30, y)
    doc.text(`${item.qty}`, 120, y)
    doc.text(formatRupiahValue(item.unitPrice), 140, y)
    doc.text(formatRupiahValue(item.subtotal), 175, y)
    y += 10
  })

  y += 20
  drawSignatures(doc, "Kepala Admin (Gudang)", "Pemesan (Client)", y + 20)
}

function drawSuratJalanOnDoc(doc: jsPDF, poNumber: string, isFirstPage: boolean = true, signatures?: { courier?: string, client?: string }) {
  const store = useAppStore.getState()
  const so = store.salesOrders.find(s => s.poNumber === poNumber)
  if (!so) return

  if (!isFirstPage) doc.addPage()
  
  const client = store.clients.find(c => c.id === so.clientId)
  const items = store.salesOrderItems.filter(i => i.salesOrderId === so.id)
  
  drawHeader(doc, "SURAT JALAN (DELIVERY NOTE)", `SJ-${poNumber}`, new Date(so.orderDate))

  // Client Info
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text("Dikirim Kepada:", 130, 48)
  doc.setFont("helvetica", "normal")
  doc.text(client?.companyName || 'Unknown', 130, 54)
  doc.text(client?.address || '', 130, 59, { maxWidth: 60 })

  let y = 80
  doc.setFillColor(240, 240, 240)
  doc.rect(14, y, 182, 10, 'F')
  doc.setFont("helvetica", "bold")
  doc.text("No", 16, y + 7)
  doc.text("Kode Barang", 30, y + 7)
  doc.text("Deskripsi Barang", 70, y + 7)
  doc.text("Qty", 170, y + 7)

  doc.setFont("helvetica", "normal")
  y += 18
  items.forEach((item, index) => {
    const product = store.products.find(p => p.id === item.productId)
    const finalQty = item.qtyFinal ?? item.qty
    doc.text(`${index + 1}`, 16, y)
    doc.text(product?.skuCode || '-', 30, y)
    doc.text(product?.name || '-', 70, y)
    doc.text(`${finalQty} ${product?.uom}`, 170, y)
    y += 10
  })

  y += 20
  doc.setFontSize(9)
  doc.text("Catatan: Harap periksa kembali barang yang diterima. Barang yang sudah dibeli tidak dapat diretur.", 14, y)
  
  // Use signatures if provided
  drawSignatures(doc, "Tim Gudang (Pengirim)", "Penerima (Klien)", y + 20, signatures?.courier, signatures?.client)
}

export function generateSuratJalan(poNumber: string, signatures?: { courier?: string, client?: string }, outputType: 'save' | 'dataurl' = 'save', adjustments?: Record<string, number>) {
  const doc = new jsPDF({ compress: true })
  drawSuratJalanOnDoc(doc, poNumber, true, signatures)
  
  if (outputType === 'dataurl') {
    return doc.output('datauristring')
  }
  doc.save(`Surat_Jalan_${poNumber}.pdf`)
}

function drawBAOnDoc(doc: jsPDF, poNumber: string, signatures?: { courier?: string, client?: string }, adjustments?: Record<string, number>) {
  const store = useAppStore.getState()
  const so = store.salesOrders.find(s => s.poNumber === poNumber)
  if (!so) return

  doc.addPage()
  
  const client = store.clients.find(c => c.id === so.clientId)
  const items = store.salesOrderItems.filter(i => i.salesOrderId === so.id)
  
  drawHeader(doc, "BERITA ACARA SERAH TERIMA", `BA-${poNumber}`, new Date())

  // Client Info
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text("Klien Penerima:", 130, 48)
  doc.setFont("helvetica", "normal")
  doc.text(client?.companyName || 'Unknown', 130, 54)
  doc.text(client?.address || '', 130, 59, { maxWidth: 60 })

  doc.setFontSize(10)
  doc.text("Dengan ini menyatakan bahwa barang-barang berikut telah diterima dalam kondisi baik dan lengkap sesuai pesanan.", 14, 72, { maxWidth: 180 })

  let y = 85
  doc.setFillColor(240, 240, 240)
  doc.rect(14, y, 182, 10, 'F')
  doc.setFont("helvetica", "bold")
  doc.text("No", 16, y + 7)
  doc.text("Kode Barang", 30, y + 7)
  doc.text("Deskripsi Barang", 70, y + 7)
  doc.text("Qty", 170, y + 7)

  doc.setFont("helvetica", "normal")
  y += 18
  items.forEach((item, index) => {
    const product = store.products.find(p => p.id === item.productId)
    // Use manual adjustments passed to the fn if present
    const finalQty = (adjustments && adjustments[item.id] !== undefined) ? adjustments[item.id] : (item.qtyFinal ?? item.qty)
    doc.text(`${index + 1}`, 16, y)
    doc.text(product?.skuCode || '-', 30, y)
    doc.text(product?.name || '-', 70, y)
    doc.text(`${finalQty} ${product?.uom}`, 170, y)
    y += 10
  })

  y += 20
  doc.setFontSize(9)
  doc.text("Demikian berita acara ini dibuat untuk dapat dipergunakan sebagaimana mestinya.", 14, y)
  
  drawSignatures(doc, "Kurir Pengirim", "Penerima (Klien)", y + 20, signatures?.courier, signatures?.client)
}

export function generateBA(poNumber: string, signatures?: { courier?: string, client?: string }, outputType: 'save' | 'dataurl' = 'save', adjustments?: Record<string, number>) {
  try {
    const doc = new jsPDF({ compress: true })
    
    // Check if the order exists first
    const store = useAppStore.getState()
    const so = store.salesOrders.find(s => s.poNumber === poNumber)
    if (!so) {
      console.error("Sales order not found for PO Num:", poNumber)
      return null
    }

    // DRAW BA Directly on current page
    // We'll modify drawBAOnDoc slightly to avoid double addPage if needed
    // But for now, let's just draw manually here or fix drawBAOnDoc
    drawSuratJalanOnDoc(doc, poNumber, true, signatures) // Page 1: SJ
    drawBAOnDoc(doc, poNumber, signatures, adjustments) // Page 2: BA

    if (outputType === 'dataurl') {
      const data = doc.output('datauristring')
      return data
    }
    doc.save(`BA_${poNumber}.pdf`)
    return true
  } catch (err) {
    console.error("FATAL PDF ERROR:", err)
    return null
  }
}

function drawInvoiceOnDoc(doc: jsPDF, invoiceId: string) {
  const store = useAppStore.getState()
  const inv = store.invoices.find(i => i.id === invoiceId)
  if (!inv) return

  doc.addPage()
  const client = store.clients.find(c => c.id === inv.clientId)
  const targetSoIds = inv.isConsolidated ? (inv.salesOrderIds || []) : (inv.salesOrderId ? [inv.salesOrderId] : [])
  const items = store.salesOrderItems.filter(i => targetSoIds.includes(i.salesOrderId))

  drawHeader(doc, inv.isConsolidated ? "CONSOLIDATED INVOICE (TUKAR FAKTUR)" : "INVOICE (FAKTUR PENJUALAN)", `INV-${inv.id.substring(0,8)}`, new Date(inv.issueDate))

  doc.setFontSize(10)
  if (inv.isConsolidated) {
    doc.text(`Ref PO: ${inv.consolidatedOrderNumbers?.join(', ')}`, 14, 65, { maxWidth: 100 })
  } else {
    const so = store.salesOrders.find(s => s.id === inv.salesOrderId)
    doc.text(`Ref PO: ${so?.poNumber}`, 14, 65)
  }
  doc.text(`Jatuh Tempo: ${format(new Date(inv.dueDate), 'dd MMM yyyy')}`, 14, 75)

  doc.setFontSize(11); doc.setFont("helvetica", "bold")
  doc.text("Tagihan Kepada:", 130, 48)
  doc.setFont("helvetica", "normal")
  doc.text(client?.companyName || 'Unknown', 130, 54)
  doc.text(client?.address || '', 130, 59, { maxWidth: 60 })

  let y = 85
  doc.setFillColor(240, 240, 240); doc.rect(14, y, 182, 10, 'F')
  doc.setFont("helvetica", "bold")
  doc.text("Deskripsi", 16, y + 7); doc.text("Qty", 100, y + 7); doc.text("Harga Satuan", 130, y + 7); doc.text("Subtotal", 170, y + 7)

  doc.setFont("helvetica", "normal")
  y += 18
  items.forEach(item => {
    const product = store.products.find(p => p.id === item.productId)
    const finalQty = item.qtyFinal ?? item.qty
    const finalSubtotal = item.subtotalFinal ?? item.subtotal
    doc.text(product?.name || '-', 16, y)
    doc.text(`${finalQty} ${product?.uom}`, 100, y)
    doc.text(formatRupiah(item.unitPrice), 130, y)
    doc.text(formatRupiah(finalSubtotal), 170, y)
    y += 10
  })

  doc.setDrawColor(200, 200, 200); doc.line(130, y + 5, 196, y + 5)
  y += 15
  doc.setFont("helvetica", "bold")
  doc.text("Total Tagihan:", 130, y)
  doc.text(formatRupiah(inv.totalAmount), 170, y)

  y += 30; doc.setFontSize(10); doc.text("Instruksi Pembayaran:", 14, y)
  doc.setFont("helvetica", "normal"); doc.text("Bank BCA: 1234567890 a/n PT DISMA DISTRIBUSI", 14, y + 6)
  
  // Finance signature with a simulated stamp
  y += 30
  doc.setFont("helvetica", "bold")
  doc.text("Hormat Kami,", 140, y)
  doc.setFontSize(8)
  doc.setTextColor(50, 50, 200) // Blue-ish for stamp
  doc.setDrawColor(50, 50, 200)
  doc.rect(145, y + 2, 35, 12)
  doc.text("PT DISMA DISTRIBUSI", 148, y + 7)
  doc.text("PAID & VERIFIED", 152, y + 12)
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(10)
  doc.text("( Finance Manager )", 140, y + 25)
}

export function generateInvoicePDF(invoiceId: string, outputType: 'save' | 'dataurl' = 'save') {
  const doc = new jsPDF({ compress: true })
  drawInvoiceOnDoc(doc, invoiceId)
  // Fix for the very first page being blank if addPage was called as first
  doc.deletePage(1) 
  
  if (outputType === 'dataurl') {
    return doc.output('datauristring')
  }
  doc.save(`Invoice_${invoiceId.substring(0,8)}.pdf`)
}

export function generateTukarFakturBundle(invoiceId: string, outputType: 'save' | 'dataurl' = 'save') {
  const store = useAppStore.getState()
  const inv = store.invoices.find(i => i.id === invoiceId)
  if (!inv) return

  const doc = new jsPDF({ compress: true })
  const soIds = inv.salesOrderIds || []
  
  soIds.forEach((soId, index) => {
    const so = store.salesOrders.find(s => s.id === soId)
    if (so) {
      // Pass stored signatures if they exist
      const signatures = {
        courier: so.courierSignature,
        client: so.clientSignature
      }
      
      // Order: 1. PO Ref -> 2. Surat Jalan -> 3. Berita Acara
      drawSalesOrderOnDoc(doc, so.poNumber)
      drawSuratJalanOnDoc(doc, so.poNumber, false, signatures)
      drawBAOnDoc(doc, so.poNumber, signatures)
    }
  })
  
  drawInvoiceOnDoc(doc, invoiceId)
  
  // Delete the very first blank page if we started with addPage inside
  doc.deletePage(1)
  
  if (outputType === 'dataurl') {
    return doc.output('datauristring')
  }
  doc.save(`Tukar_Faktur_${inv.id.substring(0,8)}.pdf`)
}

export function generateShoppingListPDF(items: Array<{productId: string, productName: string, skuCode: string, totalQty: number, estimatedPrice: number}>) {
  // OPTIMIZATION: Enable compression
  const doc = new jsPDF({ compress: true })
  drawHeader(doc, "MASTER SHOPPING LIST (DAFTAR BELANJA)", `SL-${format(new Date(), 'yyyyMMdd-HHmm')}`, new Date())

  let y = 70
  doc.setFillColor(240, 240, 240)
  doc.rect(14, y, 182, 10, 'F')
  doc.setFont("helvetica", "bold")
  doc.text("SKU", 16, y + 7)
  doc.text("Nama Barang", 45, y + 7)
  doc.text("Harga Acuan", 115, y + 7)
  doc.text("Target Qty", 150, y + 7)
  doc.text("Cek", 185, y + 7)

  doc.setFont("helvetica", "normal")
  y += 18
  items.forEach(item => {
    doc.text(item.skuCode, 16, y)
    doc.text(item.productName, 45, y)
    doc.text(formatRupiah(item.estimatedPrice), 115, y)
    doc.text(`${item.totalQty}`, 150, y)
    doc.rect(185, y - 4, 6, 6) // Checkbox box
    y += 10
  })

  doc.save(`ShoppingList_${format(new Date(), 'yyyyMMdd')}.pdf`)
}

export function generateFinancialReportPDF(data: {
  pl: { revenue: number, cogs: number, grossProfit: number, opex: Array<{category: string, amount: number}>, shrinkage: number, totalExpenses: number, netProfit: number },
  balanceSheet: { assets: { cash: number, ar: number, inventory: number, total: number }, equity: { base: number, retained: number, total: number } },
  aging: { current: number, days30: number, days60: number, days90: number },
  cashFlow: { in: number, out: number, net: number }
}) {
  // OPTIMIZATION: Enable compression
  const doc = new jsPDF({ compress: true })
  drawHeader(doc, "LAPORAN KEUANGAN KONSOLIDASI (DRAFT)", `FIN-${format(new Date(), 'yyyyMMdd')}`, new Date())

  let y = 75
  
  // 1. PROFIT & LOSS SECTION
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text("I. PROFIL LABA RUGI (P&L)", 14, y)
  y += 10

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  
  // Revenue & COGS
  doc.text("Pendapatan Operasional", 20, y)
  doc.text(formatRupiah(data.pl.revenue), 170, y, { align: 'right' })
  y += 7
  
  doc.setTextColor(200, 0, 0)
  doc.text("(HPP / Beban Pokok Penjualan)", 20, y)
  doc.text(`(${formatRupiah(data.pl.cogs)})`, 170, y, { align: 'right' })
  doc.setTextColor(0, 0, 0)
  y += 10

  doc.setFont("helvetica", "bold")
  doc.text("Laba Kotor (Gross Profit)", 20, y)
  doc.text(formatRupiah(data.pl.grossProfit), 170, y, { align: 'right' })
  y += 12

  // OpEx Breakdown
  doc.setFont("helvetica", "normal")
  doc.text("Biaya Operasional (OpEx):", 20, y)
  y += 7
  data.pl.opex.forEach(cat => {
    doc.text(`Beban ${cat.category}`, 25, y)
    doc.text(`(${formatRupiah(cat.amount)})`, 170, y, { align: 'right' })
    y += 7
  })
  doc.setTextColor(200, 0, 0)
  doc.text("Beban Barang Rusak (Shrinkage)", 25, y)
  doc.text(`(${formatRupiah(data.pl.shrinkage)})`, 170, y, { align: 'right' })
  doc.setTextColor(0, 0, 0)
  y += 10

  doc.setFont("helvetica", "bold")
  doc.text("Total Beban Biaya", 20, y)
  doc.text(`(${formatRupiah(data.pl.totalExpenses)})`, 170, y, { align: 'right' })
  y += 12

  doc.setFontSize(14)
  if (data.pl.netProfit >= 0) doc.setTextColor(0, 150, 0)
  else doc.setTextColor(200, 0, 0)
  doc.text("Laba Bersih (Net Profit)", 20, y)
  doc.text(formatRupiah(data.pl.netProfit), 170, y, { align: 'right' })
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(10)
  y += 20

  // 2. BALANCE SHEET SECTION
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text("II. NERACA KEUANGAN (BALANCE SHEET)", 14, y)
  y += 10

  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("ASET (HARTA)", 20, y)
  doc.text("LIABILITAS & EKUITAS", 110, y)
  y += 7

  doc.setFont("helvetica", "normal")
  // Assets list
  doc.text("Kas & Bank", 25, y)
  doc.text(formatRupiah(data.balanceSheet.assets.cash), 90, y, { align: 'right' })
  // Equity list
  doc.text("Modal Awal", 115, y)
  doc.text(formatRupiah(data.balanceSheet.equity.base), 180, y, { align: 'right' })
  y += 7

  doc.text("Piutang Usaha", 25, y)
  doc.text(formatRupiah(data.balanceSheet.assets.ar), 90, y, { align: 'right' })
  doc.text("Laba Ditahan", 115, y)
  doc.text(formatRupiah(data.balanceSheet.equity.retained), 180, y, { align: 'right' })
  y += 7

  doc.text("Persediaan Barang", 25, y)
  doc.text(formatRupiah(data.balanceSheet.assets.inventory), 90, y, { align: 'right' })
  y += 7

  doc.line(20, y, 90, y)
  doc.line(110, y, 180, y)
  y += 7

  doc.setFont("helvetica", "bold")
  doc.text("Total Aset", 20, y)
  doc.text(formatRupiah(data.balanceSheet.assets.total), 90, y, { align: 'right' })
  doc.text("Total Ekuitas", 110, y)
  doc.text(formatRupiah(data.balanceSheet.equity.total), 180, y, { align: 'right' })
  y += 15

  // 3. AR AGING SECTION
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text("III. UMUR PIUTANG (AR AGING)", 14, y)
  y += 10

  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text("Lancar (Current)", 20, y); doc.text(formatRupiah(data.aging.current), 80, y, { align: 'right' })
  doc.text("1 - 30 Hari", 110, y); doc.text(formatRupiah(data.aging.days30), 170, y, { align: 'right' })
  y += 7
  doc.text("31 - 60 Hari", 20, y); doc.text(formatRupiah(data.aging.days60), 80, y, { align: 'right' })
  doc.text("> 60 Hari", 110, y); doc.text(formatRupiah(data.aging.days90), 170, y, { align: 'right' })
  
  y += 20
  // 4. CASH FLOW SECTION
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text("IV. LAPORAN ARUS KAS (CASH FLOW)", 14, y)
  y += 10

  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text("Penerimaan dari Pelanggan", 20, y); doc.text(formatRupiah(data.cashFlow.in), 170, y, { align: 'right' })
  y += 7
  doc.setTextColor(200, 0, 0)
  doc.text("Pembayaran ke Supplier & Ops", 20, y); doc.text(`(${formatRupiah(data.cashFlow.out)})`, 170, y, { align: 'right' })
  doc.setTextColor(0, 0, 0)
  y += 10

  doc.setFont("helvetica", "bold")
  doc.text("Net Cash Flow", 20, y); doc.text(formatRupiah(data.cashFlow.net), 170, y, { align: 'right' })

  y += 25
  drawSignatures(doc, "Finance (Pembuat)", "Direktur Utama (CEO)", y)

  doc.save(`Laporan_Keuangan_${format(new Date(), 'yyyyMMdd')}.pdf`)
}
