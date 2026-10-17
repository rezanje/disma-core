"use client"

import { useState, useMemo } from "react"
import { useAppStore } from "@/lib/store"
import { formatRupiah, formatRupiahShort } from "@/lib/utils"
import { PageHeader } from "@/components/ui/page-header"
import { StatBand } from "@/components/ui/stat-band"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { 
  TrendingUp, 
  Users, 
  Target,
  Wallet,
  Building,
  DollarSign,
  Scale,
  Megaphone,
  Shield,
  ArrowRight,
  Package,
  ShoppingCart,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Award,
  Calendar,
  TrendingDown,
  Coins,
  X,
  Briefcase,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Receipt,
  FileText
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { differenceInDays, parseISO, format } from "date-fns"
import { id as localeId } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import Link from "next/link"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.717-1.458L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.725 1.451 5.437.002 9.861-4.417 9.864-9.858.002-2.637-1.019-5.114-2.877-6.974-1.858-1.86-4.339-2.883-6.98-2.885-5.441 0-9.866 4.418-9.869 9.86-.001 1.77.46 3.497 1.334 5.013l-1.007 3.676 3.774-.988zm11.23-5.32c-.3-.15-1.771-.875-2.04-.972-.269-.099-.465-.148-.659.15-.195.297-.752.972-.924 1.17-.172.197-.344.223-.644.073-.3-.15-1.27-.469-2.42-1.493-.897-.8-1.502-1.79-1.678-2.09-.176-.3-.019-.462.13-.61.135-.133.3-.349.45-.523.15-.174.2-.298.3-.497.1-.198.05-.374-.025-.524-.075-.15-.659-1.587-.902-2.172-.237-.574-.479-.496-.659-.506-.17-.008-.364-.01-.559-.01-.195 0-.514.073-.78.368-.266.297-1.016.993-1.016 2.422s1.03 2.808 1.174 3.006c.145.198 2.028 3.097 4.912 4.34.686.295 1.222.472 1.64.606.69.22 1.318.19 1.815.115.553-.083 1.771-.724 2.022-1.422.25-.697.25-1.294.175-1.42-.075-.127-.27-.2-.57-.35z"/>
  </svg>
);

const formatInvoiceId = (id: string) => {
  if (!id) return ""
  if (id.startsWith("inv-import-")) {
    return `INV-#IMP-${id.replace("inv-import-", "").toUpperCase()}`
  }
  if (id.startsWith("inv-")) {
    return `INV-#${id.replace("inv-", "").substring(0, 6).toUpperCase()}`
  }
  return `INV-#${id.substring(0, 6).toUpperCase()}`
}

export default function CeoDashboard() {
  const salesOrders = useAppStore(state => state.salesOrders)
  const clients = useAppStore(state => state.clients)
  const journalLines = useAppStore(state => state.journalLines)
  const coas = useAppStore(state => state.coas)
  const expenses = useAppStore(state => state.expenses)
  const purchases = useAppStore(state => state.purchases)
  const leads = useAppStore(state => state.leads) || []
  const invoices = useAppStore(state => state.invoices) || []
  const vendorBills = useAppStore(state => state.vendorBills) || []
  const products = useAppStore(state => state.products) || []
  const rejectedItems = useAppStore(state => state.rejectedItems) || []
  const salesOrderItems = useAppStore(state => state.salesOrderItems) || []
  const bankAccounts = useAppStore(state => state.bankAccounts) || []

  // 1. TOP CLIENTS BY REVENUE (Jan-May Historical + Active Invoices)
  const topClientsRevenue = useMemo(() => {
    return clients.map(client => {
      const totalJanMay = client.totalOrderJanMay || 0
      const clientInvoices = invoices.filter(inv => inv.clientId === client.id)
      const consolidatedSOIds = new Set(
        clientInvoices
          .filter((inv: any) => inv.isConsolidated && inv.salesOrderIds?.length > 0)
          .flatMap((inv: any) => inv.salesOrderIds)
      )
      const activeInvoices = clientInvoices.filter((inv: any) => {
        if (inv.supersededByInvoiceId) return false
        if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !inv.isConsolidated) return false
        return true
      })
      const activeNonImported = totalJanMay > 0
        ? activeInvoices.filter(inv => !inv.id.startsWith('inv-import-'))
        : activeInvoices
      const revenue = totalJanMay + activeNonImported.reduce((sum, inv) => sum + inv.totalAmount, 0)
      return {
        ...client,
        revenue,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
  }, [clients, invoices])

  // 2. TOP CLIENTS BY OUTSTANDING AR (Active Unpaid Receivables)
  const topClientsAR = useMemo(() => {
    const today = new Date()
    return clients.map(client => {
      const clientInvoices = invoices.filter(inv => inv.clientId === client.id)
      const consolidatedSOIds = new Set(
        clientInvoices
          .filter((inv: any) => inv.isConsolidated && inv.salesOrderIds?.length > 0)
          .flatMap((inv: any) => inv.salesOrderIds)
      )
      const activeInvoices = clientInvoices.filter((inv: any) => {
        if (inv.supersededByInvoiceId) return false
        if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !inv.isConsolidated) return false
        return true
      })
      const unpaidInvoices = activeInvoices.filter(inv => inv.status !== 'Paid')
      const outstanding = unpaidInvoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0)
      
      const hasOverdue = unpaidInvoices.some(inv => new Date(inv.dueDate) < today)
      const hasLate = unpaidInvoices.some(inv => {
        const days = (today.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)
        return days > 0 && days <= 30
      })
      
      let status = 'Good'
      if (hasOverdue) status = 'Overdue'
      else if (hasLate) status = 'Late'

      return {
        ...client,
        outstanding,
        unpaidCount: unpaidInvoices.length,
        status
      }
    })
    .filter(c => c.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 5)
  }, [clients, invoices])

  // 3. PRIORITAS PENAGIHAN KLIEN (Unpaid Invoices sorted by maturity)
  const collectionPriorities = useMemo(() => {
    const today = new Date()
    const list = invoices
      .filter(inv => inv.status !== 'Paid' && !(inv as any).supersededByInvoiceId)
      .map(inv => {
        const client = clients.find(c => c.id === inv.clientId)
        const clientInvoices = invoices.filter(i => i.clientId === inv.clientId)
        const consolidatedSOIds = new Set(
          clientInvoices
             .filter((i: any) => i.isConsolidated && i.salesOrderIds?.length > 0)
             .flatMap((i: any) => i.salesOrderIds)
        )
        if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !(inv as any).isConsolidated) return null

        const outstanding = inv.totalAmount - inv.amountPaid
        if (outstanding <= 0) return null

        const daysOverdue = differenceInDays(today, parseISO(inv.dueDate))
        return {
          invoice: inv,
          clientName: client?.companyName || 'Unknown Client',
          outstanding,
          daysOverdue,
        }
      })
      .filter(Boolean) as { invoice: any; clientName: string; outstanding: number; daysOverdue: number }[]

    return list.sort((a, b) => b.daysOverdue - a.daysOverdue)
  }, [invoices, clients])

  // 4. JATUH TEMPO PEMBAYARAN VENDOR (Active AP vendor bills by due date)
  const vendorPaymentsPriorities = useMemo(() => {
    const today = new Date()
    return vendorBills
      .filter(b => b.status !== 'Paid')
      .map(b => {
        const outstanding = b.totalAmount - (b.amountPaid || 0)
        const daysOverdue = differenceInDays(today, parseISO(b.dueDate))
        return {
          bill: b,
          outstanding,
          daysOverdue,
        }
      })
      .filter(b => b.outstanding > 0)
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
  }, [vendorBills])

  const getBalance = (prefix: string) => {
    const accIds = coas.filter(a => a.accountCode.startsWith(prefix)).map(a => a.id)
    return journalLines
      .filter(jl => accIds.includes(jl.accountId))
      .reduce((sum, jl) => {
        // Assets(1) & Expenses(5,6) normally have debit balances
        if (prefix.startsWith('1') || prefix.startsWith('5') || prefix.startsWith('6')) return sum + (jl.debitAmount - jl.creditAmount)
        // Liabilities(2), Equity(3) & Revenue(4) normally have credit balances
        return sum + (jl.creditAmount - jl.debitAmount)
      }, 0)
  }

  // Kas & bank internal = semua kode akun yang benar-benar dipakai rekening di Cash & Bank,
  // bukan daftar kode yang ditulis tangan (yang ketinggalan begitu ada rekening baru).
  const totalInternalCash = Array.from(
    new Set(bankAccounts.map(b => b.accountCode).filter(Boolean) as string[])
  ).reduce((sum, code) => sum + getBalance(code), 0)

  // Macro Metrics
  const totalAssets = getBalance('1')
  const totalLiabilities = getBalance('2')
  const totalEquity = getBalance('3')
  const revenue = getBalance('4')
  const totalExpenses = getBalance('5') + getBalance('6')
  const netProfit = revenue - totalExpenses
  const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0

  // Helper to check if a date is within the current week (7 days)
  const isWithinCurrentWeek = (dateStr?: string) => {
    if (!dateStr) return false
    try {
      const date = parseISO(dateStr)
      const today = new Date()
      const diff = differenceInDays(today, date)
      return diff >= 0 && diff <= 7
    } catch {
      return false
    }
  }

  // Alur hari ini
  const incomingCount = salesOrders.filter(so => 
    ['Draft', 'Pending Approval'].includes(so.status) && isWithinCurrentWeek(so.orderDate)
  ).length

  const procurementCount = purchases.filter(p => 
    ['Pending', 'Belanja', 'Draft', 'Pending Approval', 'Ordered'].includes(p.status) && isWithinCurrentWeek(p.date)
  ).length

  const warehouseCount = salesOrders.filter(so => 
    ['Belanja', 'Packing', 'Siap Kirim', 'QC'].includes(so.status) && isWithinCurrentWeek(so.orderDate)
  ).length

  const completedCount = salesOrders.filter(so => 
    so.status === 'Terkirim' && isWithinCurrentWeek(so.orderDate)
  ).length

  // Inventory Value: current stock * average unit purchase price
  const totalInventoryValue = useMemo(() => {
    return products.reduce((sum, p) => {
      const qty = p.currentStock || 0
      const avgPrice = p.priceHistory && p.priceHistory.length > 0
        ? p.priceHistory.reduce((s, h) => s + h.price, 0) / p.priceHistory.length
        : p.basePrice || 0
      return sum + (qty * avgPrice)
    }, 0)
  }, [products])

  // Accounts Receivable (Piutang Usaha): Positive sum of all active unpaid/partially paid outbound invoices
  const totalOutstandingAR = useMemo(() => {
    return clients.reduce((sum, client) => {
      const clientInvoices = invoices.filter(inv => inv.clientId === client.id)
      const consolidatedSOIds = new Set(
        clientInvoices
          .filter((inv: any) => inv.isConsolidated && inv.salesOrderIds?.length > 0)
          .flatMap((inv: any) => inv.salesOrderIds)
      )
      const activeInvoices = clientInvoices.filter((inv: any) => {
        if (inv.supersededByInvoiceId) return false
        if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !inv.isConsolidated) return false
        return true
      })
      const unpaidInvoices = activeInvoices.filter(inv => inv.status !== 'Paid')
      const outstanding = unpaidInvoices.reduce((s, inv) => s + (inv.totalAmount - inv.amountPaid), 0)
      return sum + outstanding
    }, 0)
  }, [clients, invoices])

  // Wastage & Spoilage Rate: (Value of Damaged Goods / Total Inventory Value) * 100
  const wastageRate = useMemo(() => {
    const journalValue = getBalance('5-2000')
    const valueOfDamagedGoods = journalValue > 0 ? journalValue : rejectedItems.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId)
      if (!product) return sum
      const avgPrice = product.priceHistory && product.priceHistory.length > 0
        ? product.priceHistory.reduce((s, h) => s + h.price, 0) / product.priceHistory.length
        : product.basePrice || 0
      return sum + (item.qty * avgPrice)
    }, 0)

    return totalInventoryValue > 0 ? (valueOfDamagedGoods / totalInventoryValue) * 100 : 0
  }, [rejectedItems, products, totalInventoryValue, journalLines, coas])

  // OTIF (On-Time In-Full) Rate: (Perfect Deliveries / Total Deliveries) * 100
  const otifRate = useMemo(() => {
    const completedOrders = salesOrders.filter(so => so.status === 'Terkirim')
    const totalDeliveries = completedOrders.length
    if (totalDeliveries === 0) return 100

    const perfectDeliveriesCount = completedOrders.filter(so => {
      let onTime = true
      if (so.handoverDate && so.targetDeliveryDate) {
        onTime = new Date(so.handoverDate) <= new Date(so.targetDeliveryDate)
      }
      
      const items = salesOrderItems.filter(item => item.salesOrderId === so.id)
      const inFull = items.every(item => {
        const qty = item.qty || 0
        const qtyFinal = item.qtyFinal !== undefined && item.qtyFinal !== null ? item.qtyFinal : qty
        return qtyFinal >= qty
      })
      
      return onTime && inFull
    }).length

    return (perfectDeliveriesCount / totalDeliveries) * 100
  }, [salesOrders, salesOrderItems])

  // Announcement System
  const updateAnnouncement = useAppStore(state => state.updateAnnouncement)
  const currentAnnouncement = useAppStore(state => state.announcement)
  const [announcementMsg, setAnnouncementMsg] = useState(currentAnnouncement?.message || "")
  const [timeFilter, setTimeFilter] = useState<'hari' | 'minggu' | 'bulan' | 'tahun'>('minggu')
  const [selectedClient, setSelectedClient] = useState<any | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null)
  const [selectedVendorBill, setSelectedVendorBill] = useState<any | null>(null)

  const selectedClientDetails = useMemo(() => {
    if (!selectedClient) return null
    const clientInvoices = invoices.filter(inv => inv.clientId === selectedClient.id)
    const consolidatedSOIds = new Set(
      clientInvoices
        .filter((inv: any) => inv.isConsolidated && inv.salesOrderIds?.length > 0)
        .flatMap((inv: any) => inv.salesOrderIds)
    )
    const activeInvoices = clientInvoices.filter((inv: any) => {
      if (inv.supersededByInvoiceId) return false
      if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !inv.isConsolidated) return false
      return true
    })
    const totalJanMay = selectedClient.totalOrderJanMay || 0
    const activeNonImported = totalJanMay > 0
      ? activeInvoices.filter(inv => !inv.id.startsWith('inv-import-'))
      : activeInvoices
    const revenue = totalJanMay + activeNonImported.reduce((sum, inv) => sum + inv.totalAmount, 0)
    const unpaidInvoices = activeInvoices.filter(inv => inv.status !== 'Paid')
    const outstanding = unpaidInvoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0)
    const today = new Date()
    const hasOverdue = unpaidInvoices.some(inv => new Date(inv.dueDate) < today)
    const hasLate = unpaidInvoices.some(inv => {
      const days = (today.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)
      return days > 0 && days <= 30
    })
    let status = 'Good'
    if (hasOverdue) status = 'Overdue'
    else if (hasLate) status = 'Late'
    return {
      ...selectedClient,
      revenue,
      outstanding,
      unpaidCount: unpaidInvoices.length,
      status
    }
  }, [selectedClient, invoices])

  const selectedClientInvoices = useMemo(() => {
    if (!selectedClient) return []
    const list = invoices.filter(inv => inv.clientId === selectedClient.id)
    const consolidatedSOIds = new Set(
      list
        .filter((inv: any) => inv.isConsolidated && inv.salesOrderIds?.length > 0)
        .flatMap((inv: any) => inv.salesOrderIds)
    )
    return list.filter((inv: any) => {
      if (inv.supersededByInvoiceId) return false
      if (inv.salesOrderId && consolidatedSOIds.has(inv.salesOrderId) && !inv.isConsolidated) return false
      return true
    })
  }, [selectedClient, invoices])

  const selectedInvoiceClient = useMemo(() => {
    if (!selectedInvoice) return null
    return clients.find(c => c.id === selectedInvoice.clientId) || null
  }, [selectedInvoice, clients])

  const selectedInvoiceItems = useMemo(() => {
    if (!selectedInvoice) return []
    const orderIds = selectedInvoice.isConsolidated && selectedInvoice.salesOrderIds && selectedInvoice.salesOrderIds.length > 0
      ? selectedInvoice.salesOrderIds
      : selectedInvoice.salesOrderId
        ? [selectedInvoice.salesOrderId]
        : []
    if (orderIds.length === 0) return []
    return salesOrderItems.filter(item => orderIds.includes(item.salesOrderId))
  }, [selectedInvoice, salesOrderItems])

  const getProductNameAndSku = (productId: string) => {
    const p = products.find(prod => prod.id === productId)
    return {
      name: p?.name || 'Unknown Product',
      sku: p?.skuCode || '-',
      uom: p?.uom || 'pcs'
    }
  }

  const getBankAccountName = (bankAccountId: string) => {
    const account = bankAccounts.find(a => a.id === bankAccountId)
    return account ? account.name : bankAccountId
  }

  // Visualization Data grouped by chosen Time Dimension (Hari, Minggu, Bulan, Tahun)
  const cockpitData = useMemo(() => {
    const today = new Date()
    const journalEntries = useAppStore.getState().journalEntries || []
    
    // Grouping helper
    const getGroupKey = (dateStr: string, filter: 'hari' | 'minggu' | 'bulan' | 'tahun') => {
      const date = parseISO(dateStr)
      if (filter === 'hari') {
        return format(date, 'd MMM', { locale: localeId })
      }
      if (filter === 'minggu') {
        const day = date.getDate()
        const weekNum = Math.ceil(day / 7)
        return `W${Math.min(weekNum, 4)}`
      }
      if (filter === 'bulan') {
        return format(date, 'MMM', { locale: localeId })
      }
      return format(date, 'yyyy')
    }

    // Filter window check
    const filterByTimeWindow = (dateStr: string, filter: 'hari' | 'minggu' | 'bulan' | 'tahun') => {
      const date = parseISO(dateStr)
      const diff = differenceInDays(today, date)
      if (filter === 'hari') {
        return diff >= 0 && diff <= 6 // Last 7 days
      }
      if (filter === 'minggu') {
        return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear()
      }
      if (filter === 'bulan') {
        return date.getFullYear() === today.getFullYear()
      }
      return true // All time for yearly
    }

    // Initialize defaults
    let defaultGroups: { name: string; revenue: number; profit: number }[] = []
    
    if (timeFilter === 'hari') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(today.getDate() - i)
        defaultGroups.push({
          name: format(d, 'd MMM', { locale: localeId }),
          revenue: 0,
          profit: 0
        })
      }
    } else if (timeFilter === 'minggu') {
      defaultGroups = [
        { name: 'W1', revenue: 0, profit: 0 },
        { name: 'W2', revenue: 0, profit: 0 },
        { name: 'W3', revenue: 0, profit: 0 },
        { name: 'W4', revenue: 0, profit: 0 },
      ]
    } else if (timeFilter === 'bulan') {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des']
      const currentMonthIdx = today.getMonth()
      defaultGroups = months.slice(0, currentMonthIdx + 1).map(m => ({ name: m, revenue: 0, profit: 0 }))
    } else {
      defaultGroups = [
        { name: '2025', revenue: 0, profit: 0 },
        { name: '2026', revenue: 0, profit: 0 }
      ]
    }

    const aggregated = Object.fromEntries(defaultGroups.map(g => [g.name, { revenue: 0, profit: 0 }]))

    if (timeFilter === 'bulan') {
      // 1. Populate historical months (Jan - Apr) from invoices table
      invoices.forEach(inv => {
        const dateStr = inv.issueDate
        if (!dateStr) return
        const date = parseISO(dateStr)
        if (date.getFullYear() !== today.getFullYear()) return
        const mKey = format(date, 'MMM', { locale: localeId }) // e.g. 'Jan', 'Feb'
        // Only use invoices for Jan, Feb, Mar, Apr to represent historical sales
        if (mKey !== 'Mei' && aggregated[mKey] !== undefined) {
          aggregated[mKey].revenue += inv.totalAmount
        }
      })

      // 2. Populate May (and other active months) from GL journal lines
      journalLines.forEach(jl => {
        const entry = journalEntries.find(je => je.id === jl.journalEntryId)
        if (!entry) return
        
        const dateStr = entry.transactionDate
        const date = parseISO(dateStr)
        if (date.getFullYear() !== today.getFullYear()) return
        const mKey = format(date, 'MMM', { locale: localeId })

        if (mKey === 'Mei') {
          const coa = coas.find(c => c.id === jl.accountId)
          if (!coa) return

          if (coa.accountCode.startsWith('4')) {
            const revVal = jl.creditAmount - jl.debitAmount
            aggregated[mKey].revenue += revVal
            aggregated[mKey].profit += revVal
          } else if (coa.accountCode.startsWith('5') || coa.accountCode.startsWith('6')) {
            const expVal = jl.debitAmount - jl.creditAmount
            aggregated[mKey].profit -= expVal
          }
        }
      })
    } else if (timeFilter === 'tahun') {
      // For yearly:
      // 2025 has no transactions, we leave it 0.
      // 2026 gets: Jan-Apr Invoices + May GL revenue. May GL profit.
      let janAprInvoiceTotal = 0
      invoices.forEach(inv => {
        const dateStr = inv.issueDate
        if (!dateStr) return
        const date = parseISO(dateStr)
        if (date.getFullYear() === 2026) {
          const mKey = format(date, 'MMM', { locale: localeId })
          if (mKey !== 'Mei') {
            janAprInvoiceTotal += inv.totalAmount
          }
        }
      })

      if (aggregated['2026'] !== undefined) {
        aggregated['2026'].revenue += janAprInvoiceTotal
      }

      // Add May GL transactions to 2026
      journalLines.forEach(jl => {
        const entry = journalEntries.find(je => je.id === jl.journalEntryId)
        if (!entry) return
        const dateStr = entry.transactionDate
        const date = parseISO(dateStr)
        const yKey = format(date, 'yyyy')

        if (aggregated[yKey] !== undefined) {
          const coa = coas.find(c => c.id === jl.accountId)
          if (!coa) return

          if (coa.accountCode.startsWith('4')) {
            const revVal = jl.creditAmount - jl.debitAmount
            aggregated[yKey].revenue += revVal
            aggregated[yKey].profit += revVal
          } else if (coa.accountCode.startsWith('5') || coa.accountCode.startsWith('6')) {
            const expVal = jl.debitAmount - jl.creditAmount
            aggregated[yKey].profit -= expVal
          }
        }
      })
    } else {
      // For daily and weekly (hari, minggu): aggregate directly from journal lines (as these are only May 2026 active periods)
      journalLines.forEach(jl => {
        const entry = journalEntries.find(je => je.id === jl.journalEntryId)
        if (!entry) return
        
        const dateStr = entry.transactionDate
        if (!filterByTimeWindow(dateStr, timeFilter)) return

        const groupKey = getGroupKey(dateStr, timeFilter)
        if (aggregated[groupKey] === undefined) {
          aggregated[groupKey] = { revenue: 0, profit: 0 }
        }

        const coa = coas.find(c => c.id === jl.accountId)
        if (!coa) return

        if (coa.accountCode.startsWith('4')) {
          const revVal = jl.creditAmount - jl.debitAmount
          aggregated[groupKey].revenue += revVal
          aggregated[groupKey].profit += revVal
        } else if (coa.accountCode.startsWith('5') || coa.accountCode.startsWith('6')) {
          const expVal = jl.debitAmount - jl.creditAmount
          aggregated[groupKey].profit -= expVal
        }
      })
    }

    // Check if the aggregated values are empty (to avoid blank graphs in case of clean databases)
    const hasData = Object.values(aggregated).some(val => val.revenue !== 0 || val.profit !== 0)
    
    if (!hasData) {
      if (timeFilter === 'hari') {
        return defaultGroups.map((g, idx) => ({
          name: g.name,
          revenue: revenue * (0.05 + idx * 0.03),
          profit: netProfit * (0.04 + idx * 0.025)
        }))
      }
      if (timeFilter === 'minggu') {
        return [
          { name: 'W1', revenue: revenue * 0.15, profit: netProfit * 0.12 },
          { name: 'W2', revenue: revenue * 0.28, profit: netProfit * 0.22 },
          { name: 'W3', revenue: revenue * 0.22, profit: netProfit * 0.18 },
          { name: 'W4', revenue: revenue * 0.35, profit: netProfit * 0.28 },
        ]
      }
      if (timeFilter === 'bulan') {
        return defaultGroups.map((g, idx) => {
          const multiplier = idx === defaultGroups.length - 1 ? 1.0 : (0.5 + idx * 0.1)
          return {
            name: g.name,
            revenue: revenue * multiplier,
            profit: netProfit * multiplier
          }
        })
      }
      return [
        { name: '2025', revenue: revenue * 0.4, profit: netProfit * 0.4 },
        { name: '2026', revenue: revenue, profit: netProfit }
      ]
    }

    const result = Object.entries(aggregated).map(([name, val]) => ({
      name,
      revenue: val.revenue,
      profit: val.profit
    }))

    if (timeFilter === 'tahun') {
      return result.sort((a, b) => parseInt(a.name) - parseInt(b.name))
    }
    
    const defaultOrder = defaultGroups.map(g => g.name)
    return result.sort((a, b) => defaultOrder.indexOf(a.name) - defaultOrder.indexOf(b.name))

  }, [journalLines, coas, timeFilter, revenue, netProfit, invoices])

  const handleBroadcast = () => {
    if (!announcementMsg.trim()) {
      updateAnnouncement(null)
      toast.success("Broadcast stopped.")
      return
    }
    updateAnnouncement({ 
      message: announcementMsg, 
      active: true, 
      timestamp: new Date().toISOString() 
    })
    toast.success("Message broadcasted to all employees!")
  }

  const opexCategories = [
    { name: 'COGS & Purchases', value: getBalance('5'), color: '#EF4444' },
    { name: 'Salaries', value: getBalance('6-1000'), color: '#10B981' },
    { name: 'Rent', value: getBalance('6-1100'), color: '#3B82F6' },
    { name: 'Logistics', value: getBalance('6-1400') + getBalance('6-1700'), color: '#F59E0B' },
    { name: 'Others', value: totalExpenses - (getBalance('5') + getBalance('6-1000') + getBalance('6-1100') + getBalance('6-1400') + getBalance('6-1700')), color: '#6366F1' },
  ]

  return (
    <div className="-m-4 space-y-[18px] pb-12 md:-m-6 lg:-m-8">
      <PageHeader
        title="Kokpit"
        context={`${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ringkasan kondisi bisnis`}
      />

      <div className="px-4 sm:px-6 md:px-7">
        <StatBand
          leader={{
            label: 'Laba bersih bulan ini',
            value: formatRupiahShort(netProfit),
            tone: netProfit >= 0 ? 'ink' : 'risk',
            note: `margin ${profitMargin.toFixed(1)}% dari omzet`,
          }}
          items={[
            { label: 'Omzet', value: formatRupiahShort(revenue), note: 'akumulasi berjalan' },
            { label: 'Harta', value: formatRupiahShort(totalAssets), note: 'kas, piutang, stok' },
            { label: 'Hutang', value: formatRupiahShort(totalLiabilities), note: 'vendor & kewajiban lain' },
            { label: 'Modal', value: formatRupiahShort(totalEquity), note: 'harta dikurangi hutang' },
          ]}
        />
      </div>

      <div className="space-y-[18px] px-4 sm:px-6 md:px-7">
      {/* Analytics Layer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 liquid-card">
          <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 px-4 md:px-8 pt-4 md:pt-8">
            <div>
              <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                Omzet & laba
              </CardTitle>
              <CardDescription className="text-xs font-bold text-slate-400  mt-1">Revenue vs Profit Trend</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              {/* Segmented Control */}
              <div className="flex p-0.5 bg-slate-100 rounded-full border border-slate-200/30">
                 {[
                   { key: 'hari', label: 'Hari' },
                   { key: 'minggu', label: 'Minggu' },
                   { key: 'bulan', label: 'Bulan' },
                   { key: 'tahun', label: 'Tahun' }
                 ].map((btn) => (
                   <button
                     key={btn.key}
                     onClick={() => setTimeFilter(btn.key as any)}
                     className={cn(
                       "px-4 py-1 text-[11px] font-bold rounded-full transition-all tracking-tight",
                       timeFilter === btn.key 
                         ? "bg-white text-slate-900 shadow-sm" 
                         : "text-slate-500 hover:text-slate-800"
                     )}
                   >
                     {btn.label}
                   </button>
                 ))}
              </div>

              {/* Legends */}
              <div className="flex gap-4">
                 <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-slate-500">
                    <div className="w-3 h-3 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(0,82,255,0.3)]" /> Revenue
                 </div>
                 <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-slate-500">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" /> Profit
                 </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-[300px] md:h-[400px] p-3 md:p-8 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cockpitData} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="0" vertical={false} stroke="#eef1ed" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#6f7a72' }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={54}
                  tickCount={4}
                  tick={{ fontSize: 10, fill: '#6f7a72' }}
                  tickFormatter={(v: number) => formatRupiahShort(Number(v))}
                />
                <Tooltip
                  cursor={{ stroke: '#dde2da', strokeWidth: 1 }}
                  formatter={(value: any) => formatRupiah(Number(value))}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e2e6e0',
                    boxShadow: 'none',
                    padding: '12px',
                    background: '#fff',
                  }}
                  itemStyle={{ fontWeight: 500, fontSize: '12.5px' }}
                  labelStyle={{ fontWeight: 600, marginBottom: '6px', color: '#17231d', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="revenue" name="Omzet" stroke="#17231d" strokeWidth={1.75} fill="none" />
                <Area type="monotone" dataKey="profit" name="Laba" stroke="#16803c" strokeWidth={1.75} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Ke mana uang keluar — bar horizontal, bukan donat */}
        <Card>
          <CardHeader>
            <CardTitle>Ke mana uang keluar</CardTitle>
            <CardDescription>Biaya operasional, urut dari yang terbesar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5">
            {(() => {
              const total = opexCategories.reduce((sum, c) => sum + Number(c.value || 0), 0)
              const urut = [...opexCategories].sort((a, b) => Number(b.value) - Number(a.value))
              return urut.map((cat, i) => {
                const pct = total > 0 ? (Number(cat.value) / total) * 100 : 0
                const lainLain = /lain/i.test(String(cat.name))
                return (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[12.5px] text-slate-700">{cat.name}</span>
                      <span className="tabular flex-none text-[12.5px] font-medium text-slate-900">{formatRupiah(Number(cat.value))}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted">
                      <div
                        className={cn("h-1.5 rounded-full", lainLain ? "bg-amber-500" : i === 0 ? "bg-slate-900" : "bg-slate-500")}
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                  </div>
                )
              })
            })()}
            <p className="pt-1 text-[11.5px] text-slate-400">
              "Lain-lain" sebaiknya ditahan di bawah 5% — di atas itu tandanya ada biaya yang belum punya kategori.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alur hari ini — pengganti radar 4 kartu berikon besar */}
      <Card>
        <CardHeader>
          <CardTitle>Alur hari ini</CardTitle>
          <CardDescription>Dari pesanan masuk sampai barang sampai di klien</CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const tahap = [
              { label: 'Masuk', value: incomingCount, desc: 'pesanan klien' },
              { label: 'Belanja', value: procurementCount, desc: 'sedang disourcing' },
              { label: 'Gudang', value: warehouseCount, desc: 'packing & QC' },
              { label: 'Terkirim', value: completedCount, desc: 'sudah sampai' },
            ]
            const puncak = tahap.reduce((m, t) => Math.max(m, Number(t.value) || 0), 0)
            return (
              <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
                {tahap.map((t, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <div className="flex h-16 items-end">
                      <div
                        className={cn("w-full rounded-t-sm", i === tahap.length - 1 ? "bg-emerald-600" : "bg-slate-900")}
                        style={{ height: `${puncak > 0 ? Math.max(6, (Number(t.value) / puncak) * 100) : 6}%` }}
                      />
                    </div>
                    <div className="tabular text-[19px] leading-tight font-semibold text-slate-900">{t.value}</div>
                    <div className="text-[12.5px] text-slate-700">{t.label}</div>
                    <div className="text-[11.5px] text-slate-400">{t.desc}</div>
                  </div>
                ))}
              </div>
            )
          })()}
        </CardContent>
      </Card>

      {/* Client Performance & Receivables Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Clients by Revenue */}
        <Card className="liquid-card">
          <CardHeader className="p-4 md:p-8 pb-4">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              Klien penyumbang omzet terbesar <Award className="w-5 h-5 text-amber-500" />
            </CardTitle>
            <CardDescription className="text-xs font-bold text-slate-400  mt-1">
              Top 5 Kontribusi Revenue Terbesar (Jan-Mei)
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-8 pb-8">
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin">
              {topClientsRevenue.map((c, idx) => (
                <div key={c.id} onClick={() => setSelectedClient(c)} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-all duration-200 cursor-pointer hover:scale-[1.01] active:scale-[0.99] group hover:shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs",
                      idx === 0 ? "bg-amber-500 text-slate-950" :
                      idx === 1 ? "bg-slate-300 text-slate-800" :
                      idx === 2 ? "bg-amber-600 text-white" : "bg-slate-200 text-slate-600"
                    )}>
                      {idx + 1}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800">{c.companyName}</span>
                      <span className="text-[11px] text-slate-400 font-bold uppercase">PIC: {c.picName}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600">{formatRupiah(c.revenue)}</p>
                    <span className="text-[11px] text-slate-400 font-bold ">LIFETIME REVENUE</span>
                  </div>
                </div>
              ))}
              {topClientsRevenue.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-8">Belum ada data klien.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Clients by Outstanding AR */}
        <Card className="liquid-card">
          <CardHeader className="p-4 md:p-8 pb-4">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              Piutang terbesar <Coins className="w-5 h-5 text-rose-500" />
            </CardTitle>
            <CardDescription className="text-xs font-bold text-slate-400  mt-1">
              Top 5 Piutang Klien Terbanyak
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-8 pb-8">
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin">
              {topClientsAR.map((c, idx) => (
                <div key={c.id} onClick={() => setSelectedClient(c)} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-all duration-200 cursor-pointer hover:scale-[1.01] active:scale-[0.99] group hover:shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs">
                      {idx + 1}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800">{c.companyName}</span>
                      <span className="text-[11px] text-slate-400 font-bold uppercase">{c.unpaidCount} invoice unpaid</span>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="text-sm font-bold text-rose-600">{formatRupiah(c.outstanding)}</p>
                    <Badge variant="outline" className={cn(
                      "text-[11px] font-bold uppercase rounded-full px-2 py-0.5 border",
                      c.status === 'Overdue' ? "bg-rose-50 text-rose-700 border-rose-200" :
                      c.status === 'Late' ? "bg-amber-50 text-amber-700 border-amber-200" :
                      "bg-emerald-50 text-emerald-700 border-emerald-200"
                    )}>
                      {c.status}
                    </Badge>
                  </div>
                </div>
              ))}
              {topClientsAR.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-8">Tidak ada piutang klien aktif 🎉</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Immediate Collections & Payments Action Center */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Client Invoice Collection Priority */}
        <Card className="liquid-card">
          <CardHeader className="p-4 md:p-8 pb-4">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              Perlu keputusan lo <AlertTriangle className="w-5 h-5 text-rose-500" />
            </CardTitle>
            <CardDescription className="text-xs font-bold text-slate-400  mt-1">
              Outstanding Piutang Terurut dari Terlama
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-8 pb-8">
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin">
              {collectionPriorities.map((item) => (
                <div key={item.invoice.id} onClick={() => setSelectedInvoice(item.invoice)} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-all duration-200 cursor-pointer hover:scale-[1.01] active:scale-[0.99] group hover:shadow-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-slate-800 truncate block max-w-[150px]">{item.clientName}</span>
                      <Badge variant="outline" className="font-mono text-[11px] text-slate-400">
                        {formatInvoiceId(item.invoice.id)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span className="text-[11px] text-slate-400 font-bold">
                        Jatuh Tempo: {format(parseISO(item.invoice.dueDate), 'd MMM yy', { locale: localeId })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right flex flex-col items-end gap-1">
                      <p className="text-sm font-bold text-slate-900">{formatRupiah(item.outstanding)}</p>
                      {item.daysOverdue > 0 ? (
                        <Badge className="bg-rose-500 text-white font-bold text-[11px] rounded-full border-none">
                          Lewat {item.daysOverdue} Hari (Segera Tagih)
                        </Badge>
                      ) : item.daysOverdue === 0 ? (
                        <Badge className="bg-amber-500 text-slate-950 font-bold text-[11px] rounded-full border-none">
                          Jatuh Tempo Hari Ini
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500 text-slate-950 font-bold text-[11px] rounded-full border-none">
                          H-{Math.abs(item.daysOverdue)} Hari
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 w-9 rounded-xl p-0 text-emerald-600 hover:text-white hover:bg-emerald-500 border border-emerald-100 hover:border-emerald-500 flex items-center justify-center transition-all shadow-sm"
                      title="Kirim Tagihan via WhatsApp"
                      onClick={(e) => {
                        e.stopPropagation();
                        const client = clients.find(c => c.id === item.invoice.clientId);
                        let phone = client?.phone || '';
                        if (!phone) {
                          const inputPhone = window.prompt(`Nomor WhatsApp untuk ${item.clientName} tidak ditemukan. Silakan masukkan nomor HP/WA (contoh: 08123456789):`);
                          if (!inputPhone) return;
                          phone = inputPhone;
                        }
                        const so = salesOrders.find(s => s.id === item.invoice.salesOrderId);
                        const docInfo = so?.poNumber ? `Invoice ${formatInvoiceId(item.invoice.id)} (PO: ${so.poNumber})` : `Invoice ${formatInvoiceId(item.invoice.id)}`;
                        const formattedOutstanding = formatRupiah(item.outstanding);
                        const dueDateFormatted = format(parseISO(item.invoice.dueDate), 'd MMMM yyyy', { locale: localeId });
                        const message = `Halo Kak/Bapak/Ibu di *${item.clientName}*,\n\nKami dari *Disma Fresh* ingin menginformasikan tagihan untuk *${docInfo}* sebesar *${formattedOutstanding}* yang jatuh tempo pada *${dueDateFormatted}*.\n\nMohon kesediaannya untuk melakukan pembayaran. Jika pembayaran telah dilakukan, mohon kirimkan bukti transfernya ya Kak. Terima kasih banyak! 🙏😊`;
                        
                        let formattedPhone = phone.replace(/[^0-9]/g, '');
                        if (formattedPhone.startsWith('0')) {
                          formattedPhone = '62' + formattedPhone.slice(1);
                        }
                        window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, '_blank');
                      }}
                    >
                      <WhatsAppIcon className="w-4 h-4 fill-current" />
                    </Button>
                  </div>
                </div>
              ))}
              {collectionPriorities.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-8">Tidak ada piutang jatuh tempo 🎉</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Vendor Payments Priority */}
        <Card className="liquid-card">
          <CardHeader className="p-4 md:p-8 pb-4">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              Jatuh Tempo Pembayaran Vendor <Clock className="w-5 h-5" />
            </CardTitle>
            <CardDescription className="text-xs font-bold text-slate-400  mt-1">
              Hutang Vendor Terurut dari Terlama
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 md:px-8 pb-8">
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin">
              {vendorPaymentsPriorities.map((item) => (
                <div key={item.bill.id} onClick={() => setSelectedVendorBill(item.bill)} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-all duration-200 cursor-pointer hover:scale-[1.01] active:scale-[0.99] group hover:shadow-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-slate-800 truncate block max-w-[150px]">{item.bill.vendorName}</span>
                      <Badge variant="outline" className="font-mono text-[11px] text-slate-400">
                        {item.bill.billNumber}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span className="text-[11px] text-slate-400 font-bold">
                        Jatuh Tempo: {format(parseISO(item.bill.dueDate), 'd MMM yy', { locale: localeId })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="text-sm font-bold text-slate-900">{formatRupiah(item.outstanding)}</p>
                    {item.daysOverdue > 0 ? (
                      <Badge className="bg-rose-500 text-white font-bold text-[11px] rounded-full border-none">
                        Lewat {item.daysOverdue} Hari (Bayar Segera)
                      </Badge>
                    ) : item.daysOverdue === 0 ? (
                      <Badge className="bg-amber-500 text-slate-950 font-bold text-[11px] rounded-full border-none">
                        Bayar Hari Ini
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-500 text-slate-950 font-bold text-[11px] rounded-full border-none">
                        H-{Math.abs(item.daysOverdue)} Hari
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
              {vendorPaymentsPriorities.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-8">Tidak ada hutang vendor aktif 🎉</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Executive Priority Watchlist */}
        <Card className="liquid-card lg:col-span-1">
           <CardHeader className="p-4 md:p-8 pb-4">
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Perlu dipantau
              </CardTitle>
              <CardDescription className="text-xs font-bold text-slate-400  leading-relaxed mt-1">Crucial financial accounts requiring attention.</CardDescription>
           </CardHeader>
           <CardContent className="p-0">
              <div className="divide-y divide-slate-100 px-4 md:px-8 pb-8">
                {[
                  { name: "Piutang Usaha (AR)", val: totalOutstandingAR, icon: "💰", alert: totalOutstandingAR > 50000000 },
                  { name: "Hutang Usaha (AP)", val: getBalance('2-1000'), icon: "🧾" },
                  { name: "Inventory Value", val: totalInventoryValue, icon: "📦", href: "/warehouse/catalog" },
                  // Setiap rekening punya kode akun sendiri (Jago 1-1100, BRI 1-1400) sejak
                  // baris kas dipisah dari Petty Cash — semuanya harus ikut dijumlah di sini.
                  { name: "Internal Cash & Bank", val: totalInternalCash, icon: "🏦", alert: totalInternalCash < 10000000 },
                  { name: "Wastage & Spoilage Rate", val: wastageRate, isPercent: true, icon: "🍂", alert: wastageRate > 5, href: "/admin/loss-analytics" },
                  { name: "OTIF Rate", val: otifRate, isPercent: true, icon: "⏱️", alert: otifRate < 90 },
                ].map((acc, i) => {
                  const inner = (
                    <div className={cn(
                      "py-5 flex items-center justify-between group/item",
                      acc.href && "cursor-pointer hover:bg-slate-50/80 rounded-xl px-2 -mx-2 transition-colors"
                    )}>
                      <div className="flex items-center gap-4">
                        {/* penanda keadaan, bukan emoji hiasan */}
                        <span className={cn("h-2 w-2 flex-none rounded-full", acc.alert ? "bg-rose-500" : "bg-emerald-600")} />
                        <div className="flex flex-col">
                          <p className="text-xs font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
                            {acc.name}
                            {acc.href && <ArrowRight className="w-3 h-3 opacity-0 group-hover/item:opacity-100 transition-opacity text-slate-400" />}
                          </p>
                          {acc.alert && (
                            <span className="text-[11px] font-bold  text-rose-500 mt-1 flex items-center gap-1">
                              <Activity className="w-2.5 h-2.5" /> Perlu perhatian
                            </span>
                          )}
                        </div>
                      </div>
                      <p className={cn("text-sm font-bold", acc.alert ? "text-rose-600" : "text-slate-900")}>
                        {acc.isPercent ? `${acc.val.toFixed(1)}%` : formatRupiah(Number(acc.val))}
                      </p>
                    </div>
                  );

                  if (acc.href) {
                    return (
                      <Link href={acc.href} key={i} className="block border-none">
                        {inner}
                      </Link>
                    );
                  }

                  return <div key={i}>{inner}</div>;
                })}
              </div>
           </CardContent>
        </Card>

        {/* Strategic Pipeline & Broadcast */}
        <div className="lg:col-span-2 space-y-8">
           {/* Global Pipeline / Leads */}
           <Card className="liquid-card bg-indigo-600 text-white overflow-hidden relative group">
              <div className="absolute top-0 right-0 w-80 h-80 bg-card rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none group-hover:bg-card transition-all duration-150" />
              <CardContent className="p-5 md:p-10 flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                <div className="flex items-center gap-8">
                  <div className="w-20 h-20 bg-card rounded-2xl md:rounded-2xl flex items-center justify-center border border-border shadow-sm group-hover:rotate-6 transition-transform">
                    <Target className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight">Cakupan pasar</h3>
                    <p className="text-indigo-100/60 text-sm font-bold mt-2  leading-relaxed">
                      {leads.length} Active B2B Leads in Negotiation
                    </p>
                  </div>
                </div>
                 <Link href="/admin/crm">
                  <Button 
                    className="bg-white hover:bg-slate-100 text-indigo-600 font-bold px-12 h-16 rounded-xl shadow-sm shadow-indigo-950/20 transition-all flex items-center gap-3 active:scale-95 group/btn"
                  >
                    Jump to CRM Portal <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
                  </Button>
                 </Link>
              </CardContent>
           </Card>

           {/* CEO Pengumuman */}
           <Card className="liquid-card bg-white shadow-sm">
             {/* Di layar HP kartu ini dulu terpotong di kanan: badge, kotak pesan, dan
                 tombol kirim semuanya keluar dari kartu. Penyebabnya kolom isi tidak
                 boleh menyusut (flex item bawaannya min-width:auto), jadi lebarnya
                 dipaksa oleh isi terlebar — dan kartunya memotong sisanya. */}
             <CardContent className="p-5 md:p-10 flex flex-col md:flex-row items-start gap-5 md:gap-10">
               <div className="shrink-0 flex items-center justify-center w-14 h-14 md:w-20 md:h-20 bg-emerald-500 rounded-2xl shadow-sm group duration-150">
                 <Megaphone className="w-7 h-7 md:w-10 md:h-10 text-slate-950 rotate-[-15deg] group-hover:rotate-0 transition-transform" />
               </div>
               {/* min-w-0: izin menyusut. Tanpa ini semua perbaikan di bawah tidak terpakai. */}
               <div className="flex-1 min-w-0 w-full space-y-5 md:space-y-6">
                  <div>
                     {/* flex-wrap: badge turun ke baris berikutnya, bukan keluar kartu. */}
                     <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="text-xl md:text-2xl font-bold text-slate-900">Pengumuman</h3>
                        <Badge className="bg-emerald-100 text-emerald-700 font-bold text-[11px] rounded-full px-2 border-none">LEADERSHIP CONTROL</Badge>
                     </div>
                     <p className="text-xs font-bold text-slate-400 ">Push real-time banners to every active employee</p>
                  </div>
                  <Textarea 
                    value={announcementMsg}
                    onChange={(e) => setAnnouncementMsg(e.target.value)}
                    placeholder="Type your strategic message here..."
                    className="min-h-[120px] w-full bg-slate-50 border-none rounded-xl p-4 md:p-8 text-base md:text-lg font-bold shadow-inner focus-visible:ring-emerald-500/20 ring-0 focus-visible:bg-white transition-all"
                  />
                  {/* Di HP tombolnya naik ke atas keterangan: yang dipakai ada di jempol,
                      bukan di bawah tujuh baris teks penjelasan. */}
                  <div className="flex flex-col-reverse gap-4 md:flex-row md:items-center md:justify-between">
                     <p className="text-[11px] font-bold text-slate-400 md:max-w-[200px] leading-normal uppercase">Your message will appear at the top of all user dashboards instantly.</p>
                     {/* Berdampingan, dua tombol ini butuh ~340px — lebih lebar dari kartunya
                         di HP, dan label tombol tidak bisa dipatah. Jadi di HP ditumpuk,
                         yang utama di atas. */}
                     <div className="flex flex-col-reverse gap-2 md:flex-row md:gap-4">
                        <Button 
                          variant="ghost" 
                          className="w-full md:w-auto text-slate-400 font-bold px-4 md:px-8 h-12 md:h-14 rounded-full hover:bg-slate-50" 
                          onClick={() => { setAnnouncementMsg(""); handleBroadcast(); }}
                        >
                          Clear Board
                        </Button>
                        <Button 
                          onClick={handleBroadcast} 
                          className="w-full md:w-auto bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-bold px-6 md:px-12 h-12 md:h-14 rounded-xl shadow-sm transition-all"
                        >
                          Push to Team Now
                        </Button>
                     </div>
                  </div>
               </div>
             </CardContent>
           </Card>
         </div>
      </div>

      {/* 1. CLIENT DETAIL MODAL */}
      <Dialog open={selectedClient !== null} onOpenChange={(open) => !open && setSelectedClient(null)}>
        <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto border-none bg-white rounded-xl p-4 md:p-8 shadow-sm">
          {selectedClientDetails && (
            <div className="space-y-6">
              <DialogHeader className="border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-md">
                    <Building className="w-6 h-6" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-bold text-slate-900 tracking-tight">
                      {selectedClientDetails.companyName}
                    </DialogTitle>
                    <DialogDescription className="text-xs font-bold text-slate-400  mt-0.5">
                      Client Profile &amp; Receivables Audit
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Client Profile details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Profile Information Card */}
                <div className="p-6 rounded-xl bg-slate-50 border border-slate-100 space-y-4">
                  <h4 className="text-xs font-bold  text-slate-400">Client Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedClientDetails.picName && (
                      <div className="flex items-center gap-3 text-slate-700">
                        <Briefcase className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="text-sm">
                          <span className="font-bold text-slate-400 block text-[11px] uppercase">PIC Name</span>
                          <span className="font-bold text-slate-900">{selectedClientDetails.picName}</span>
                        </div>
                      </div>
                    )}
                    {selectedClientDetails.phone && (
                      <div className="flex items-center gap-3 text-slate-700">
                        <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="text-sm">
                          <span className="font-bold text-slate-400 block text-[11px] uppercase">Phone</span>
                          <a href={`https://wa.me/${selectedClientDetails.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="font-bold text-emerald-600 hover:underline">
                            {selectedClientDetails.phone}
                          </a>
                        </div>
                      </div>
                    )}
                    {selectedClientDetails.email && (
                      <div className="flex items-center gap-3 text-slate-700">
                        <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="text-sm">
                          <span className="font-bold text-slate-400 block text-[11px] uppercase">Email</span>
                          <span className="font-bold text-slate-900 truncate block max-w-[160px]" title={selectedClientDetails.email}>{selectedClientDetails.email}</span>
                        </div>
                      </div>
                    )}
                    {selectedClientDetails.paymentTermDays !== undefined && selectedClientDetails.paymentTermDays !== null && (
                      <div className="flex items-center gap-3 text-slate-700">
                        <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="text-sm">
                          <span className="font-bold text-slate-400 block text-[11px] uppercase">Payment Terms</span>
                          <span className="font-bold text-slate-900">{selectedClientDetails.paymentTermDays} Days Net</span>
                        </div>
                      </div>
                    )}
                    {selectedClientDetails.address && (
                      <div className="flex items-start gap-3 text-slate-700 col-span-1 sm:col-span-2">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <span className="font-bold text-slate-400 block text-[11px] uppercase">Billing Address</span>
                          <span className="font-bold text-slate-800 leading-normal">{selectedClientDetails.address}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Account Financials Summary Card */}
                <div className="p-6 rounded-xl bg-slate-950 text-white space-y-6 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-bold  text-emerald-400">Account Summary</h4>
                    <div className="grid grid-cols-1 gap-3 mt-4">
                      <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                        <span className="text-xs font-bold  text-slate-400">Lifetime Revenue</span>
                        <span className="text-lg font-bold text-emerald-400">{formatRupiah(selectedClientDetails.revenue)}</span>
                      </div>
                      <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 flex justify-between items-center">
                        <span className="text-xs font-bold  text-slate-400">Outstanding AR</span>
                        <span className="text-lg font-bold text-rose-400">{formatRupiah(selectedClientDetails.outstanding)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                    <div>
                      <span className="text-[11px] font-bold  text-slate-400 block">Unpaid Invoices</span>
                      <span className="text-2xl font-bold">{selectedClientDetails.unpaidCount} <span className="text-xs font-bold text-slate-500">Invoices</span></span>
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-[11px] font-bold uppercase rounded-full px-3 py-1 border border-none shadow-md",
                      selectedClientDetails.status === 'Overdue' ? "bg-rose-500 text-white" :
                      selectedClientDetails.status === 'Late' ? "bg-amber-500 text-slate-950" :
                      "bg-emerald-500 text-slate-950"
                    )}>
                      Status: {selectedClientDetails.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Client Invoices List */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Active Receivables (Invoices)
                  </h4>
                  <span className="text-xs font-bold text-slate-400 ">{selectedClientInvoices.length} total</span>
                </div>
                
                <div className="border border-slate-100 rounded-2xl overflow-hidden max-h-[250px] overflow-y-auto pr-1">
                  <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="font-bold text-slate-700  text-[11px]">Invoice ID</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px]">Issue Date</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px]">Due Date</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px] text-right">Total Amount</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px] text-right">Outstanding</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px] text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedClientInvoices.map((inv) => {
                        const outstanding = inv.totalAmount - inv.amountPaid;
                        return (
                          <TableRow 
                            key={inv.id} 
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setSelectedClient(null);
                            }}
                            className="cursor-pointer hover:bg-slate-50 transition-colors"
                          >
                            <TableCell className="font-mono font-bold text-xs text-blue-600 uppercase">
                              {formatInvoiceId(inv.id)}
                            </TableCell>
                            <TableCell className="font-bold text-xs text-slate-600">
                              {format(parseISO(inv.issueDate), 'd MMM yyyy', { locale: localeId })}
                            </TableCell>
                            <TableCell className="font-bold text-xs text-slate-600">
                              {format(parseISO(inv.dueDate), 'd MMM yyyy', { locale: localeId })}
                            </TableCell>
                            <TableCell className="font-bold text-xs text-slate-800 text-right">
                              {formatRupiah(inv.totalAmount)}
                            </TableCell>
                            <TableCell className="font-bold text-xs text-rose-600 text-right">
                              {formatRupiah(outstanding)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className={cn(
                                "text-[11px] font-bold uppercase rounded-full px-2 py-0.5 border-none",
                                inv.status === 'Paid' ? "bg-emerald-100 text-emerald-800" :
                                inv.status === 'Partial' ? "bg-amber-100 text-amber-800" :
                                "bg-rose-100 text-rose-800"
                              )}>
                                {inv.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {selectedClientInvoices.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-6 text-xs text-slate-400 italic">
                            Belum ada invoice untuk klien ini.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 2. INVOICE DETAIL MODAL */}
      <Dialog open={selectedInvoice !== null} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto border-none bg-white rounded-xl p-4 md:p-8 shadow-sm">
          {selectedInvoice && (
            <div className="space-y-6">
              <DialogHeader className="border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shadow-md">
                      <Receipt className="w-6 h-6" />
                    </div>
                    <div>
                      <DialogTitle className="text-2xl font-bold text-slate-900 tracking-tight">
                        {formatInvoiceId(selectedInvoice.id)}
                      </DialogTitle>
                      <DialogDescription className="text-xs font-bold text-slate-400  mt-0.5">
                        Invoice Audit &amp; Line Items Detail
                      </DialogDescription>
                    </div>
                  </div>
                  <Badge className={cn(
                    "text-xs font-bold uppercase rounded-full px-3 py-1 border-none shadow-md",
                    selectedInvoice.status === 'Paid' ? "bg-emerald-500 text-slate-950" :
                    selectedInvoice.status === 'Partial' ? "bg-amber-500 text-slate-950" :
                    "bg-rose-500 text-white"
                  )}>
                    {selectedInvoice.status}
                  </Badge>
                </div>
              </DialogHeader>

              {/* Client Info & Invoice dates */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-[11px] font-bold  text-slate-400 block mb-2">Billed To</span>
                  {selectedInvoiceClient ? (
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-900">{selectedInvoiceClient.companyName}</p>
                      <p className="text-xs text-slate-500 font-bold">PIC: {selectedInvoiceClient.picName}</p>
                      {selectedInvoiceClient.phone && (
                        <a 
                          href={'https://wa.me/' + selectedInvoiceClient.phone.replace(/[^0-9]/g, '') + '?text=' + encodeURIComponent('Halo ' + selectedInvoiceClient.companyName + ', ini untuk invoice ' + formatInvoiceId(selectedInvoice.id) + ' sebesar ' + formatRupiah(selectedInvoice.totalAmount - selectedInvoice.amountPaid) + ' yang jatuh tempo pada ' + format(parseISO(selectedInvoice.dueDate), 'd MMM yyyy', { locale: localeId }) + '.')}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1 mt-1"
                        >
                          <Phone className="w-3.5 h-3.5" /> Hubungi via WA
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm font-bold text-slate-500">Loading Client Info...</p>
                  )}
                </div>
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-[11px] font-bold  text-slate-400 block mb-1">Issue Date</span>
                  <p className="text-sm font-bold text-slate-800">{format(parseISO(selectedInvoice.issueDate), 'd MMMM yyyy', { locale: localeId })}</p>
                  <span className="text-[11px] font-bold  text-slate-400 block mt-3 mb-1">Due Date</span>
                  <p className="text-sm font-bold text-slate-800">{format(parseISO(selectedInvoice.dueDate), 'd MMMM yyyy', { locale: localeId })}</p>
                </div>
                <div className="p-5 rounded-2xl bg-slate-950 text-white flex flex-col justify-center">
                  <span className="text-[11px] font-bold  text-slate-400 block">Total Outstanding Balance</span>
                  <p className="text-2xl font-bold text-rose-400 mt-1">{formatRupiah(selectedInvoice.totalAmount - selectedInvoice.amountPaid)}</p>
                  <div className="flex justify-between items-center mt-3 text-[11px] text-slate-400 border-t border-slate-800 pt-2 font-bold">
                    <span>Total Amount: {formatRupiah(selectedInvoice.totalAmount)}</span>
                    <span>Paid: {formatRupiah(selectedInvoice.amountPaid)}</span>
                  </div>
                </div>
              </div>

              {/* Invoice Line Items (resolved from sales order items) */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-500" /> Itemized Line Items
                </h4>
                <div className="border border-slate-100 rounded-2xl overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="font-bold text-slate-700  text-[11px]">Product SKU &amp; Name</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px] text-center">Ordered</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px] text-center">Delivered (QC)</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px] text-right">Unit Price</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px] text-right">Final Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedInvoiceItems.map((item) => {
                        const product = getProductNameAndSku(item.productId)
                        const qtyFinal = item.qtyFinal !== undefined && item.qtyFinal !== null ? item.qtyFinal : item.qty
                        const finalSubtotal = item.subtotalFinal !== undefined && item.subtotalFinal !== null ? item.subtotalFinal : (qtyFinal * item.unitPrice)
                        return (
                          <TableRow key={item.id} className="hover:bg-slate-50/50">
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-800">{product.name}</span>
                                <span className="text-[11px] font-mono text-slate-400">SKU: {product.sku}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-bold text-xs text-slate-600">
                              {item.qty} {product.uom}
                            </TableCell>
                            <TableCell className="text-center font-bold text-xs text-slate-900">
                              {qtyFinal} {product.uom}
                            </TableCell>
                            <TableCell className="text-right font-bold text-xs text-slate-600">
                              {formatRupiah(item.unitPrice)}
                            </TableCell>
                            <TableCell className="text-right font-bold text-xs text-slate-900">
                              {formatRupiah(finalSubtotal)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {selectedInvoiceItems.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-6 text-xs text-slate-400 italic">
                            Tidak ada data baris item untuk invoice ini. (Invoice impor atau manual)
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Payment history */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-500" /> Payment Records Received
                </h4>
                <div className="border border-slate-100 rounded-2xl overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="font-bold text-slate-700  text-[11px]">Payment ID</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px]">Payment Date</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px]">Method</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px]">Note</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px] text-right">Amount Received</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedInvoice.payments && selectedInvoice.payments.map((pay: any) => (
                        <TableRow key={pay.id} className="hover:bg-slate-50/50">
                          <TableCell className="font-mono text-xs text-slate-600 uppercase">
                            #{pay.id.substring(0, 8).toUpperCase()}
                          </TableCell>
                          <TableCell className="font-bold text-xs text-slate-600">
                            {format(parseISO(pay.date), 'd MMM yyyy', { locale: localeId })}
                          </TableCell>
                          <TableCell className="font-bold text-xs text-slate-800">
                            {pay.method || 'Transfer'}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {pay.note || '-'}
                          </TableCell>
                          <TableCell className="text-right font-bold text-xs text-emerald-600">
                            {formatRupiah(pay.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!selectedInvoice.payments || selectedInvoice.payments.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-6 text-xs text-slate-400 italic">
                            Belum ada catatan pembayaran yang diterima.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 3. VENDOR BILL DETAIL MODAL */}
      <Dialog open={selectedVendorBill !== null} onOpenChange={(open) => !open && setSelectedVendorBill(null)}>
        <DialogContent className="sm:max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto border-none bg-white rounded-xl p-4 md:p-8 shadow-sm">
          {selectedVendorBill && (
            <div className="space-y-6">
              <DialogHeader className="border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-md">
                      <Wallet className="w-6 h-6" />
                    </div>
                    <div>
                      <DialogTitle className="text-2xl font-bold text-slate-900 tracking-tight">
                        {selectedVendorBill.billNumber}
                      </DialogTitle>
                      <DialogDescription className="text-xs font-bold text-slate-400  mt-0.5">
                        Vendor Accounts Payable Audit
                      </DialogDescription>
                    </div>
                  </div>
                  <Badge className={cn(
                    "text-xs font-bold uppercase rounded-full px-3 py-1 border-none shadow-md",
                    selectedVendorBill.status === 'Paid' ? "bg-emerald-500 text-slate-950" :
                    selectedVendorBill.status === 'Partial' ? "bg-amber-500 text-slate-950" :
                    "bg-rose-500 text-white"
                  )}>
                    {selectedVendorBill.status}
                  </Badge>
                </div>
              </DialogHeader>

              {/* Vendor & Dates details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-[11px] font-bold  text-slate-400 block mb-2">Vendor Name</span>
                  <p className="text-sm font-bold text-slate-900 uppercase">{selectedVendorBill.vendorName}</p>
                  <span className="text-[11px] font-bold  text-slate-400 block mt-3 mb-1">Category</span>
                  <Badge variant="outline" className="text-[11px] font-bold uppercase rounded-full px-2 py-0.5 border border-slate-200 text-slate-500 bg-white">
                    {selectedVendorBill.category || 'Operasional'}
                  </Badge>
                </div>
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="text-[11px] font-bold  text-slate-400 block mb-1">Issue Date</span>
                  <p className="text-sm font-bold text-slate-800">{format(parseISO(selectedVendorBill.issueDate), 'd MMMM yyyy', { locale: localeId })}</p>
                  <span className="text-[11px] font-bold  text-slate-400 block mt-3 mb-1">Due Date</span>
                  <p className="text-sm font-bold text-slate-800">{format(parseISO(selectedVendorBill.dueDate), 'd MMMM yyyy', { locale: localeId })}</p>
                </div>
                <div className="p-5 rounded-2xl bg-slate-950 text-white flex flex-col justify-center">
                  <span className="text-[11px] font-bold  text-slate-400 block">Total Unpaid AP</span>
                  <p className="text-2xl font-bold text-rose-400 mt-1">{formatRupiah(selectedVendorBill.totalAmount - (selectedVendorBill.amountPaid || 0))}</p>
                  <div className="flex justify-between items-center mt-3 text-[11px] text-slate-400 border-t border-slate-800 pt-2 font-bold">
                    <span>Total Bill: {formatRupiah(selectedVendorBill.totalAmount)}</span>
                    <span>Paid: {formatRupiah(selectedVendorBill.amountPaid || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Bill Description */}
              <div className="p-6 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                <h4 className="text-xs font-bold  text-slate-400">Bill Description</h4>
                <p className="text-sm font-bold text-slate-800 leading-normal">{selectedVendorBill.description || 'No description provided.'}</p>
              </div>

              {/* Payment history */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> Payment Records Made
                </h4>
                <div className="border border-slate-100 rounded-2xl overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="font-bold text-slate-700  text-[11px]">Payment ID</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px]">Payment Date</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px]">Source Account</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px]">Method / Note</TableHead>
                        <TableHead className="font-bold text-slate-700  text-[11px] text-right">Amount Paid</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedVendorBill.payments && selectedVendorBill.payments.map((pay: any) => (
                        <TableRow key={pay.id} className="hover:bg-slate-50/50">
                          <TableCell className="font-mono text-xs text-slate-600 uppercase">
                            #{pay.id.substring(0, 8).toUpperCase()}
                          </TableCell>
                          <TableCell className="font-bold text-xs text-slate-600">
                            {format(parseISO(pay.date), 'd MMM yyyy', { locale: localeId })}
                          </TableCell>
                          <TableCell className="font-bold text-xs text-slate-800">
                            {getBankAccountName(pay.bankAccountId)}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            <span className="font-bold text-slate-700">{pay.method || 'Transfer'}</span>
                            {pay.note && <span className="block text-[11px] text-slate-400 mt-0.5">{pay.note}</span>}
                          </TableCell>
                          <TableCell className="text-right font-bold text-xs text-rose-600">
                            {formatRupiah(pay.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!selectedVendorBill.payments || selectedVendorBill.payments.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-6 text-xs text-slate-400 italic">
                            Belum ada catatan pembayaran yang dilakukan.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}
