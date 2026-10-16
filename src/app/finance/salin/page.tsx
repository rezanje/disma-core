"use client"
import {TabHost} from "@/components/layout/tab-host"
import Shopping from "@/app/finance/salin-belanja/page"
import Expenses from "@/app/finance/biaya/page"
import Sourcing from "@/app/sourcing/expenses/page"
import Courier from "@/app/courier/expenses/page"

export default function Workspace(){
 return <TabHost queryKey="workspace" title='Salin belanja dan biaya' context='Pilih kertas, pelaksana, kejadian dan sumber uang yang benar.' tabs={[
  {key:'belanja',title:'Kertas belanja',render:()=><Shopping />},
  {key:'biaya',title:'Pengeluaran dan reimbursement',render:()=><Expenses />},
  {key:'sourcing',title:'Biaya sourcing',render:()=><Sourcing />},
  {key:'kurir',title:'Biaya kurir',render:()=><Courier />}
 ]} />
}
