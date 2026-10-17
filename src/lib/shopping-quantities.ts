import {allocateShoppingDemand,purchasingQuantity} from './purchase-plan';

type Demand={id:string;productId:string;quantity:number;salesOrderId?:string};
/** Use each unit of free stock once. Manual warehouse top-ups are purchases. */
export function shoppingQuantities<T extends Demand>(rows:T[],onHand:Record<string,number>,reserved:Record<string,number>={},sourced:Record<string,number>={},custom:Record<string,number>={}){
 const allocations=new Map(allocateShoppingDemand(rows.filter(row=>!!row.salesOrderId),onHand,reserved,sourced).map(row=>[row.id,row]));
 return rows.map(row=>{
  const allocation=allocations.get(row.id);
  const allocatedStock=allocation?.allocatedStock??0;
  const toBuy=allocation?.toBuy??purchasingQuantity(Math.max(0,row.quantity));
  const totalQty=custom[row.id]??toBuy;
  const poPurchaseQty=row.salesOrderId?purchasingQuantity(Math.min(totalQty,toBuy)):0;
  return {...row,allocatedStock,toBuy,totalQty,poPurchaseQty,stockPurchaseQty:purchasingQuantity(Math.max(0,totalQty-poPurchaseQty)),fromStock:allocatedStock>0};
 });
}

/** Extra buying must not increase a client's PO or consume its reservation. */
export function shoppingDocumentItems<T extends {salesOrderId?:string;totalQty:number;poPurchaseQty:number;stockPurchaseQty:number;sellPrice:number}>(rows:T[]){
 const items:Array<Omit<T,'salesOrderId'> & {salesOrderId?:string}>=[];
 for(const row of rows){
  if(row.salesOrderId&&row.poPurchaseQty>0)items.push({...row,totalQty:row.poPurchaseQty});
  if(row.stockPurchaseQty>0)items.push({...row,totalQty:row.stockPurchaseQty,salesOrderId:undefined,sellPrice:0});
 }
 return items;
}
