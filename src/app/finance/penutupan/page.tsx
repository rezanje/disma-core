"use client"
import {TabHost} from "@/components/layout/tab-host"
import Close from "@/app/finance/daily-close/page"
import Reports from "@/app/finance/laporan/page"
import Approvals from "@/app/finance/approvals/page"
import Archive from "@/app/finance/documents/page"

export default function Workspace(){
 return <TabHost queryKey="workspace" title='Tutup hari dan laporan' context='Periksa selisih dan laporan dari transaksi yang sudah dibukukan.' tabs={[
  {key:'hari',title:'Tutup hari',render:()=><Close />},
  {key:'laporan',title:'Laporan keuangan',render:()=><Reports />},
  {key:'periksa',title:'Pemeriksaan transaksi',render:()=><Approvals />},
  {key:'arsip',title:'Arsip dokumen',render:()=><Archive />}
 ]} />
}
