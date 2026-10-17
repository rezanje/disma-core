import type {SalesOrder,SalesOrderItem,Client,Product,User,PurchaseItem,Purchase,Vendor} from '@/types';
export type PacketState={salesOrders:SalesOrder[];salesOrderItems:SalesOrderItem[];clients:Client[];products:Product[];users:User[];purchaseItems:PurchaseItem[];purchases:Purchase[];vendors:Vendor[]};
export type PacketPage={kind:'belanja'|'qc'|'handover'|'surat-jalan';title:string;reference:string;subtitle:string[];columns:Array<{label:string;width:number}>;rows:string[][];signatures:string[];supplement?:boolean};
const cols=(...pairs:Array<[string,number]>)=>pairs.map(([label,width])=>({label,width}));
const layouts={
 belanja:cols(['SKU / Barang',55],['Rencana beli',26],['Est. harga',25],['Beli aktual',27],['Total aktual',30],['Vendor',45],['Catatan',59]),
 qc:cols(['SKU',20],['Barang',54],['Rencana',24],['Masuk aktual',26],['Lolos',24],['Reject',24],['Tindakan / alasan',48],['Alokasi / catatan',47]),
 handover:cols(['Outlet / PO',55],['Barang',55],['Rencana',25],['Diserahkan aktual',35],['Diterima kurir',35],['Catatan',62]),
 'surat-jalan':cols(['SKU',23],['Barang',68],['Rencana',30],['Dikirim aktual',34],['Diterima outlet',35],['Selisih / catatan',77]),
};
const blank=(columns:number,count=7)=>Array.from({length:count},()=>Array(columns).fill(''));
export function buildFieldPacket(state:PacketState,date:string,assignments:Record<string,string>={},packetReference=`PAKET-${date}`):PacketPage[] {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(new Date(date+'T00:00:00+07:00').getTime()))throw new Error('Pilih tanggal kirim yang valid.');
 const orders=state.salesOrders.filter(o=>o.targetDeliveryDate.slice(0,10)===date&&!['Batal','Selesai','Terkirim','Awaiting Audit'].includes(o.status));
 const pending=(line:SalesOrderItem)=>Math.max(0,line.qty-(line.qtyDelivered||0)-(line.qtyCancelled||0));
 const items=(so:SalesOrder)=>state.salesOrderItems.filter(l=>l.salesOrderId===so.id&&pending(l)>0&&!state.purchaseItems.some(pi=>pi.salesOrderId===so.id&&pi.productId===l.productId&&pi.purchaseMethod==='Dropship'));
 const relevantDocs=new Set(state.purchaseItems.filter(pi=>orders.some(o=>o.id===pi.salesOrderId)).map(pi=>pi.purchaseId));
 const buys=state.purchaseItems.filter(pi=>relevantDocs.has(pi.purchaseId)&&(!pi.salesOrderId||orders.some(o=>o.id===pi.salesOrderId))&&pi.purchaseMethod!=='Dropship'&&pi.qtyTarget>0);
 const product=(id:string)=>state.products.find(p=>p.id===id);
 const textQty=(n:number,id:string)=>`${Number(n.toPrecision(12))} ${product(id)?.uom||''}`.trim();
 const subtitle=[`Tanggal kirim: ${date}`, 'Jumlah rencana untuk persiapan. Isi jumlah aktual dan jam kejadian dengan tulisan tangan.'];
 const pages:PacketPage[]=[];
 const buyGroups=new Map<string,{productId:string;qty:number;estimate:number}>();
 for(const pi of buys){const old=buyGroups.get(pi.productId)||{productId:pi.productId,qty:0,estimate:pi.estimatedUnitPrice||0};old.qty+=pi.qtyTarget;buyGroups.set(pi.productId,old);}
 const grouped=[...buyGroups.values()];
 pages.push({kind:'belanja',title:'DAFTAR BELANJA',reference:packetReference+'-BELANJA',subtitle,columns:layouts.belanja,rows:grouped.filter(g=>buys.some(pi=>pi.productId===g.productId&&(!pi.purchaseMethod||pi.purchaseMethod==='Pasar'))).map(g=>[`${product(g.productId)?.skuCode||''} ${product(g.productId)?.name||g.productId}`,textQty(buys.filter(pi=>pi.productId===g.productId&&(!pi.purchaseMethod||pi.purchaseMethod==='Pasar')).reduce((n,pi)=>n+pi.qtyTarget,0),g.productId),String(g.estimate),'','','','']),signatures:['Petugas belanja','Penerima laporan']});
 pages.push({kind:'qc',title:'LEMBAR PENERIMAAN DAN QC',reference:packetReference+'-QC',subtitle:[...subtitle,'Masuk = Lolos + Reject. Tulis alokasi ke outlet; pisahkan spare dan sisa gudang.'],columns:layouts.qc,rows:grouped.map(g=>[product(g.productId)?.skuCode||'',product(g.productId)?.name||g.productId,textQty(g.qty,g.productId),'','','','','']),signatures:['Pemeriksa QC','Pemeriksa berkas']});
 const courierGroups=new Map<string,SalesOrder[]>();
 for(const so of orders.filter(o=>items(o).length)){
  const courier=assignments[so.id]??so.assignedCourierId??'';
  courierGroups.set(courier,[...(courierGroups.get(courier)||[]),so]);
 }
 for(const [courier,stops] of courierGroups){
  const name=state.users.find(u=>u.id===courier)?.name||'Kurir: __________________';
  pages.push({kind:'handover',title:`BERITA ACARA QC KE KURIR — ${name}`,reference:packetReference+'-BA-'+(courier||'KOSONG'),subtitle:[...subtitle,'Jam serah terima: __________  Kendaraan: __________'],columns:layouts.handover,rows:[...stops.flatMap(so=>items(so).map(l=>[`${state.clients.find(c=>c.id===so.clientId)?.companyName||so.clientId} / ${so.poNumber} — ${state.clients.find(c=>c.id===so.clientId)?.address||'Alamat: __________'}`,product(l.productId)?.name||l.productId,textQty(pending(l),l.productId),'','',''])),['SPARE','________________','—','','','Milik perusahaan; bukan jumlah pesanan outlet'],...blank(6,2)],signatures:['Diserahkan oleh QC',`Diterima kurir: ${name}`]});
 }
 for(const so of orders.filter(o=>items(o).length)){
  const client=state.clients.find(c=>c.id===so.clientId);
  pages.push({kind:'surat-jalan',title:'SURAT JALAN',reference:packetReference+'-SJ-'+so.poNumber,subtitle:[`Outlet: ${client?.companyName||so.clientId} · ${client?.address||'Alamat: ______________'}`,`PO: ${so.poNumber} · Kirim: ${date} · Kurir: ${state.users.find(u=>u.id===(assignments[so.id]??so.assignedCourierId))?.name||'_______________'}`,'Penerima menandatangani jumlah aktual. Spare kurir tidak termasuk pesanan ini.'],columns:layouts['surat-jalan'],rows:[...items(so).map(l=>[product(l.productId)?.skuCode||'',product(l.productId)?.name||l.productId,textQty(pending(l),l.productId),'','','']),...blank(6,3)],signatures:['Diserahkan kurir','Diterima outlet (nama, tanggal/jam, tanda tangan)']});
 }
 for(const kind of ['belanja','qc','handover','surat-jalan'] as const){
  pages.push({kind,title:`LEMBAR SUSULAN — ${kind==='handover'?'BERITA ACARA QC KE KURIR':kind==='surat-jalan'?'SURAT JALAN':kind.toUpperCase()}`,reference:packetReference+'-SUS-'+kind,subtitle:[`Tanggal kirim: ${date} · Kode susulan: ______________`,`Outlet / alamat: ______________________________________________________`,'PO asal: __________________  Kurir: __________________  Jam kejadian: __________','Gunakan kode susulan yang sama di belanja, QC, berita acara dan surat jalan.'],columns:layouts[kind],rows:blank(layouts[kind].length),signatures:kind==='handover'?['Diserahkan oleh QC','Diterima kurir']:kind==='surat-jalan'?['Diserahkan kurir','Diterima outlet (nama, tanggal/jam, tanda tangan)']:['Diisi petugas lapangan','Diperiksa admin'],supplement:true});
 }
 return pages;
}
