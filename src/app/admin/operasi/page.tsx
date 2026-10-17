"use client"
import {Suspense,useEffect,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {TabHost} from '@/components/layout/tab-host';
import QcEntryTable from '@/components/qc-entry-table';
import FieldPacketWorkspace from '@/components/field-packet-workspace';
import PaperResultsWorkspace from '@/components/paper-results-workspace';
import SupplementOrderForm from '@/components/supplement-order-form';
import Routes from '@/app/admin/delivery-routes/page';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
function Operations(){
 const [supplement,setSupplement]=useState(false);const router=useRouter();const params=useSearchParams();const workspace=params.get('workspace');
 useEffect(()=>{if(['packing','handover'].includes(workspace||''))router.replace('/admin/operasi?workspace=qc',{scroll:false})},[workspace,router]);
 return <div className="space-y-4"><div className="flex justify-end"><Button variant="outline" onClick={()=>setSupplement(true)}>Salin pesanan susulan</Button></div>{workspace==='rute'?<Routes/>:<TabHost queryKey="workspace" title="Barang dan pengiriman" context="Siapkan kertas sebelum berangkat, salin kejadian lapangan setelahnya." tabs={[
  {key:'cetak',title:'Cetak paket',render:()=> <FieldPacketWorkspace/>},
  {key:'qc',title:'Salin QC & serah terima',render:()=> <QcEntryTable transitionMode/>},
  {key:'hasil',title:'Salin hasil kiriman',render:()=> <PaperResultsWorkspace/>},
 ]}/>}
 <Dialog open={supplement} onOpenChange={setSupplement}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Salin pesanan susulan</DialogTitle></DialogHeader><SupplementOrderForm onSaved={()=>{setSupplement(false);router.replace('/admin/operasi?workspace=qc',{scroll:false})}}/></DialogContent></Dialog></div>;
}
export default function Workspace(){return <Suspense fallback={<p className="text-sm text-slate-500">Menyiapkan ruang kerja…</p>}><Operations/></Suspense>}
