"use client"
import {TabHost} from "@/components/layout/tab-host"
import Clients from "@/app/admin/clients/page"
import Prices from "@/app/admin/client-prices/page"
import Products from "@/app/admin/products/page"

export default function Workspace(){
 return <TabHost queryKey="workspace" title='Klien dan harga jual' context='Kelola data klien, harga kontrak dan katalog yang dipakai pesanan.' tabs={[
  {key:'klien',title:'Klien',render:()=><Clients />},
  {key:'harga',title:'Harga jual',render:()=><Prices />},
  {key:'barang',title:'Katalog barang',render:()=><Products />}
 ]} />
}
