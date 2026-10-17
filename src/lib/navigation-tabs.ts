/** Keep a workspace selection when a nested report/tab changes. */
export function tabHref(pathname:string,search:string,key:string,value:string){
 const params=new URLSearchParams(search)
 params.set(key,value)
 if(key!=='tab')params.delete('tab')
 return `${pathname}?${params.toString()}`
}

type NavigationGroup = {key:string;href:string;children?:{key:string;href:string}[]}
type NavigationSelection = {groupKey:string;childKey?:string;href:string}
/** Match meaningful route parameters, independently of filters/query ordering. */
export function getActiveNavigation(groups:NavigationGroup[],pathname:string,search:string):NavigationSelection|null {
 const base='https://navigation.invalid'
 const path=pathname.replace(/\/$/,'')||'/'
 let selected:NavigationSelection|null=null, best=-1
 for(const group of groups){
  const params=new URLSearchParams(search)
  const groupPath=new URL(group.href,base).pathname
  const workspaceTabs=(group.children||[]).map(child=>new URL(child.href,base))
   .filter(url=>url.pathname===groupPath&&url.searchParams.has('workspace'))
   .map(url=>url.searchParams.get('workspace')!)
  // TabHost defaults to its first tab when the selection is absent/unknown.
  if(path===groupPath&&workspaceTabs.length&&!workspaceTabs.includes(params.get('workspace')||''))params.set('workspace',workspaceTabs[0])
  for(const [link,child] of [[group,false] as const,...(group.children||[]).map(link=>[link,true] as const)]){
   const target=new URL(link.href,base)
   const targetPath=target.pathname.replace(/\/$/,'')||'/'
   if(path!==targetPath&&!path.startsWith(targetPath+'/'))continue
   if([...target.searchParams].some(([key,value])=>params.get(key)!==value))continue
   const score=targetPath.length*100+target.searchParams.size*10+(child?1:0)
   if(score>best){best=score;selected={groupKey:group.key,childKey:child?link.key:undefined,href:link.href}}
  }
 }
 return selected
}
