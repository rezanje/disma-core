/** Keep a workspace selection when a nested report/tab changes. */
export function tabHref(pathname:string,search:string,key:string,value:string){
 const params=new URLSearchParams(search)
 params.set(key,value)
 if(key!=='tab')params.delete('tab')
 return `${pathname}?${params.toString()}`
}
