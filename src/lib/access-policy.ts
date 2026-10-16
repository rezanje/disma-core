import type { Role } from '@/types';

const shared = ['/tasks','/settings/profile','/settings/preferences','/settings/navigation'];
const orderPaths = [
  '/admin/hari-ini','/admin/sales-orders','/admin/shopping-list',
  '/admin/konsolidasi-belanja','/admin/delivery-routes','/admin/dropship',
  '/admin/operasi','/admin/klien-harga','/admin/clients','/admin/client-prices','/admin/products',
  '/warehouse/catalog','/warehouse/inbound','/warehouse/qc','/warehouse/outbound',
  '/warehouse/reject-monitor',
];
const financePaths = [
  '/finance','/admin/hari-ini','/admin/purchase-requests','/admin/audit-pengiriman',
  '/admin/tukar-faktur','/admin/dropship','/admin/vendors','/sourcing/expenses','/courier/expenses',
];
/** Task access is explicit. A dashboard's permission never opens another role's tree. */
export function canAccessRoute(role: Role | string | undefined, pathname: string): boolean {
  if (!role || !['admin_po','finance','super_admin'].includes(role)) return false;
  const path = pathname.split('?')[0].replace(/\/$/,'') || '/';
  if (role === 'super_admin') return ['/admin','/finance','/warehouse','/sourcing','/courier',...shared]
    .some(base => path === base || path.startsWith(base+'/'));
  const allowed = [...shared,...(role==='admin_po'?orderPaths:financePaths)];
  return allowed.some(base => path===base || path.startsWith(base+'/'));
}
