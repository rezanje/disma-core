"use client"
import {TabHost} from "@/components/layout/tab-host"
import Invoices from "@/app/finance/piutang/page"
import TF from "@/app/admin/tukar-faktur/page"
import Audit from "@/app/admin/audit-pengiriman/page"

export default function Workspace(){
 return <TabHost queryKey="workspace" title='Tagihan dan pembayaran klien' context='Invoice, dokumen penyerahan, piutang dan penerimaan memakai sumber yang sama.' tabs={[
  {key:'tagihan',title:'Invoice dan piutang',render:()=><Invoices />},
  {key:'dokumen',title:'Tukar faktur',render:()=><TF />},
  {key:'terbit',title:'Bukti dan penerbitan',render:()=><Audit />}
 ]} />
}
