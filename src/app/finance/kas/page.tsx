"use client"
import {TabHost} from "@/components/layout/tab-host"
import Cash from "@/app/finance/cash-bank/page"
import Transfer from "@/app/finance/disbursements/page"
import Recon from "@/app/finance/reconciliation/page"

export default function Workspace(){
 return <TabHost queryKey="workspace" title='Kas bank dan dana petugas' context='Lihat saldo, serah dana dan cocokkan transaksi dengan bukti.' tabs={[
  {key:'saldo',title:'Kas dan bank',render:()=><Cash />},
  {key:'dana',title:'Pindah kas dan dana',render:()=><Transfer />},
  {key:'rekon',title:'Rekonsiliasi bank',render:()=><Recon />}
 ]} />
}
