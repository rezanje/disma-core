"use client"
import {TabHost} from "@/components/layout/tab-host"
import QCWorkspace from "@/components/qc-workspace"
import Packing from "@/app/warehouse/outbound/page"
import Handover from "@/app/courier/handover/page"
import Routes from "@/app/admin/delivery-routes/page"
import Today from "@/app/admin/hari-ini/page"

export default function Workspace(){
 return <TabHost queryKey="workspace" title='Barang dan pengiriman' context='Catat hasil kertas per kejadian dan ronde pengiriman.' tabs={[
  {key:'qc',title:'Penerimaan dan QC',render:()=><QCWorkspace transcription />},
  {key:'packing',title:'Packing dan keluar',render:()=><Packing />},
  {key:'handover',title:'Serah terima',render:()=><Handover />},
  {key:'rute',title:'Rute dan kurir',render:()=><Routes />},
  {key:'hasil',title:'Hasil dan retur',render:()=><Today />}
 ]} />
}
