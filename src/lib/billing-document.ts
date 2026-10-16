import type { DeliveryLineSnapshot } from '@/types'

type InvoiceDocument = { lineSnapshots?: DeliveryLineSnapshot[]; status?: string; totalAmount: number; amountPaid?: number }

/** No mutable order/product fallback: missing snapshots require paper verification. */
export function invoiceDocumentLines(invoice: InvoiceDocument) {
  return (invoice.lineSnapshots || []).map(line => ({ ...line, subtotal: line.lineTotal ?? Math.round((line.qty * line.unitPrice + Number.EPSILON) * 100) / 100 }))
}

export function paymentStateLabel(invoice: InvoiceDocument): string {
  if (invoice.status === 'Draft') return 'MENUNGGU AUDIT'
  if (invoice.status === 'Cancelled') return 'DIBATALKAN'
  if (invoice.status === 'Paid' && (invoice.amountPaid || 0) >= invoice.totalAmount) return 'LUNAS'
  return (invoice.amountPaid || 0) > 0 ? 'DIBAYAR SEBAGIAN' : 'BELUM LUNAS'
}

/** The issued TF value is historical; credits change its children and their AR. */
export function tukarFakturAmounts(issued:number,invoices:{totalAmount:number;amountPaid?:number}[]) {
 const cents=(value:number)=>Math.round((value+Number.EPSILON)*100)
 const netCents=invoices.reduce((sum,invoice)=>sum+cents(invoice.totalAmount),0)
 const paidCents=invoices.reduce((sum,invoice)=>sum+cents(invoice.amountPaid || 0),0)
 const outstandingCents=invoices.reduce((sum,invoice)=>sum+Math.max(0,cents(invoice.totalAmount)-cents(invoice.amountPaid || 0)),0)
 return {issued,correction:(cents(issued)-netCents)/100,net:netCents/100,paid:paidCents/100,outstanding:outstandingCents/100}
}

export function validateReceiptAllocations(
  invoices: {id:string; totalAmount:number; amountPaid?:number}[],
  allocations: Record<string,number>,
  amount: number,
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return 'Nominal penerimaan harus positif.'
  let sum = 0
  for (const [id, value] of Object.entries(allocations)) {
    const invoice = invoices.find(inv => inv.id === id)
    if (!invoice) return 'Alokasi memuat invoice di luar tukar faktur ini.'
    if (!Number.isFinite(value) || value < 0 || value > Math.max(0, invoice.totalAmount - (invoice.amountPaid || 0))) return 'Alokasi melebihi sisa invoice atau tidak valid.'
    sum += value
  }
  return Math.abs(sum - amount) > 0.01 ? 'Total alokasi harus sama dengan nominal diterima.' : null
}

/** One receipt may allocate to several children; preserve one total in TF history. */
export function batchPaymentHistory(invoices: {payments?:{id:string;date:string;amount:number;note?:string}[]}[]) {
  const history=new Map<string,{id:string;date:string;amount:number;note?:string}>()
  for(const invoice of invoices) for(const payment of invoice.payments || []) {
    const existing=history.get(payment.id)
    if(existing) existing.amount+=payment.amount
    else history.set(payment.id,{...payment})
  }
  return [...history.values()].sort((a,b)=>b.date.localeCompare(a.date))
}

export function sourceReturnCredit(
 invoice:{id:string;totalAmount:number;lineSnapshots?:DeliveryLineSnapshot[]},
 source:{id:string;invoiceId?:string;salesOrderItemId?:string;productId:string;qty:number;unitPrice?:number;creditAmount?:number;financialAdjustmentStatus?:string},
):number|null {
 if(source.invoiceId!==invoice.id || source.financialAdjustmentStatus!=='Pending Finance' || !Number.isFinite(source.qty) || source.qty<=0) return null
 const line=invoice.lineSnapshots?.find(line=>line.salesOrderItemId===source.salesOrderItemId && line.productId===source.productId)
 const price=line?.unitPrice ?? source.unitPrice
 if(typeof price!=='number' || !Number.isFinite(price) || price<=0 || (line && source.qty>line.qty) || (line && source.unitPrice!==undefined && line.unitPrice!==source.unitPrice)) return null
 const amount=source.creditAmount ?? Math.round((source.qty*price+Number.EPSILON)*100)/100
 return Number.isFinite(amount) && amount>0 && amount<=invoice.totalAmount ? amount : null
}
