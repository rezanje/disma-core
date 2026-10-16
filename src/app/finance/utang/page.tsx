'use client'
import {TabHost} from '@/components/layout/tab-host'
import Payables from '../ap-aging/page'
import VendorSettlements from '../vendor-settlements/page'
export default function VendorLiabilities(){return <TabHost queryKey="workspace" title="Utang vendor" context="Tagihan, cicilan, uang muka dan penyelesaian klaim sesuai sumbernya." tabs={[{key:'tagihan',title:'Tagihan dan pembayaran',render:()=> <Payables/>},{key:'uang-muka-retur',title:'Uang muka dan klaim vendor',render:()=> <VendorSettlements/>}]}/>}
