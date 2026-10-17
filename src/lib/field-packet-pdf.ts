import {jsPDF} from 'jspdf';
import {DISMA_LOGO_BASE64} from './logo';
import type {PacketPage} from './field-packet';
const text=(value:string)=>value.replace(/[—–]/g,'-').replace(/·/g,' | ').replace(/…/g,'...');
/** All actuals are blank. Building a PDF never submits any application command. */
export function buildFieldPacketPdf(pages:PacketPage[]):jsPDF {
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
 let first=true;
 for(const page of pages){
  let y=0;
  const header=()=>{
   if(!first)doc.addPage();first=false;
   doc.addImage(DISMA_LOGO_BASE64,'PNG',14,5,20,20);
   doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text('PT Disma Permata Sejahtera',40,12);
   doc.setFont('helvetica','normal');doc.setFontSize(8);
   doc.text('Kawasan Industri Pulo Gadung, Jakarta Timur',40,18);
   doc.text('Phone: 021-99887766 | Email: finance@disma-distribusi.com',40,23);
   doc.setDrawColor(180);doc.line(14,28,283,28);
   doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text(doc.splitTextToSize(text(page.title),269),14,36);
   doc.setFont('helvetica','normal');doc.setFontSize(8);
   let top=46;
   for(const text of [`No. ${page.reference}`,...page.subtitle]){const lines=doc.splitTextToSize(text.replace(/[—–]/g,'-').replace(/·/g,' | '),269);doc.text(lines,14,top);top+=lines.length*4+1;}
   y=top+3;doc.setFillColor(231,239,234);doc.rect(14,y,269,10,'F');
   let x=14;doc.setFont('helvetica','bold');
   for(const col of page.columns){doc.text(doc.splitTextToSize(text(col.label),col.width-3),x+2,y+4);x+=col.width;}
   doc.setFont('helvetica','normal');y+=10;
  };
  header();
  for(const row of page.rows){
   const cells=page.columns.map((col,index)=>doc.splitTextToSize(text(row[index]||''),col.width-4) as string[]);
   const height=Math.max(11,...cells.map(lines=>lines.length*4+4));
   if(y+height>169)header();
   let x=14;doc.setDrawColor(190);
   for(const [index,col] of page.columns.entries()){doc.rect(x,y,col.width,height);if(row[index])doc.text(cells[index],x+2,y+5);x+=col.width;}
   y+=height;
  }
  if(y>162)header();
  y+=10;doc.setFontSize(9);
  for(const [index,signature] of page.signatures.entries()){
   const x=index===0?16:157;doc.text(doc.splitTextToSize(text(signature),120),x,y);doc.text('(________________________________)',x,y+22);
  }
 }
 doc.setFontSize(7);
 const count=doc.getNumberOfPages();for(let i=1;i<=count;i++){doc.setPage(i);doc.text(`Persiapan dokumen | jumlah aktual diisi di lapangan | ${i}/${count}`,14,204);}
 return doc;
}
