export type ReturnSplit = { pass: number; buang: number; vendor: number };
export type SwapSplit = { pass: number; reject: number };

const EPS = 1e-6;
const bad = (n: number) => !Number.isFinite(n) || n < 0;

/** Three customer-return buckets: all non-negative and summing to the return total. */
export function isReturnSplitValid(split: ReturnSplit, total: number): boolean {
  const { pass, buang, vendor } = split;
  if ([pass, buang, vendor, total].some(bad)) return false;
  return Math.abs(pass + buang + vendor - total) < EPS;
}

/** Replacement QC split: non-negative and summing to the vendor-return qty. */
export function isSwapSplitValid(split: SwapSplit, total: number): boolean {
  const { pass, reject } = split;
  if ([pass, reject, total].some(bad)) return false;
  return Math.abs(pass + reject - total) < EPS;
}

/** Preserve the last edited bucket; rebalance the remainder without exceeding the report. */
export function balanceReturnSplit(split:ReturnSplit,total:number,key:keyof ReturnSplit,value:number):ReturnSplit {
 const limit=Number.isFinite(total)?Math.max(0,total):0;
 const amount=Number.isFinite(value)?Math.min(limit,Math.max(0,value)):0;
 const retained=key==='vendor'?'buang':'vendor';
 const residual=key==='pass'?'buang':'pass';
 const clean=(n:number)=>Number(n.toPrecision(12));
 const remaining=clean(limit-amount);
 const keep=clean(Math.min(remaining,Math.max(0,Number.isFinite(split[retained])?split[retained]:0)));
 return {...split,[key]:clean(amount),[retained]:keep,[residual]:clean(remaining-keep)};
}

/** Return QC keeps attachments optional; identify missing paper fields explicitly. */
export function returnEvidenceError(value:import('./goods-command').PaperEvidence):string {
 if(!value.performedBy?.trim())return 'Pilih pelaksana fisik sesuai berkas. Foto boleh dikosongkan.';
 if(!value.occurredAt||!Number.isFinite(new Date(value.occurredAt).getTime()))return 'Isi waktu kejadian yang valid sesuai berkas. Foto boleh dikosongkan.';
 if(!value.paperNumber?.trim())return 'Isi nomor berkas / revisi sesuai kertas. Foto boleh dikosongkan.';
 return '';
}

export function vendorReturnSubmitMessage(message:string):string {
 return message.includes('Lengkapi laporan belanja sebelum penyelesaian biaya retur vendor')
  ? 'Harga beli asal belum final karena laporan belanja belum lengkap. Lengkapi laporan belanja untuk menyelesaikan retur vendor; ini bukan kewajiban upload foto.'
  : message;
}
