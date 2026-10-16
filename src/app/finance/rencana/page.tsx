"use client"
import {TabHost} from "@/components/layout/tab-host"
import Plan from "@/app/finance/purchase-plan/page"
import Orders from "@/app/finance/online-purchase/page"
import Vendors from "@/app/admin/vendors/page"

export default function Workspace(){
 return <TabHost queryKey="workspace" title='Rencana dan pesanan vendor' context='Tentukan jalur barang dan pembayaran sebelum realisasi.' tabs={[
  {key:'rencana',title:'Rencana belanja',render:()=><Plan />},
  {key:'pesanan',title:'Pesanan vendor dan online',render:()=><Orders />},
  {key:'vendor',title:'Vendor',render:()=><Vendors />}
 ]} />
}
