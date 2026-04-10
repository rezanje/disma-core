import fs from 'fs/promises';
import path from 'path';
import { CLIENTS_SEED } from './clients_seed';
import { PRODUCTS_SEED } from './products_seed';
import { COA_SEED, MOCK_USERS } from './constants';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

type DbProduct = { currentStock?: number; [key: string]: unknown };
type DbShape = {
  products?: DbProduct[];
  purchaseItems?: unknown[];
  stockMovements?: unknown[];
  [key: string]: unknown;
};

export async function getDb() {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    const parsed: DbShape = JSON.parse(data);

    // Legacy cleanup: if there is no purchase history yet, any pre-filled stock is stale seed data.
    if (Array.isArray(parsed.products) && (!Array.isArray(parsed.purchaseItems) || parsed.purchaseItems.length === 0)) {
      const hasLegacyStock = parsed.products.some((product: DbProduct) => Number(product.currentStock || 0) !== 0);
      if (hasLegacyStock) {
        const normalized = {
          ...parsed,
          products: parsed.products.map((product: DbProduct) => ({ ...product, currentStock: 0 })),
          stockMovements: Array.isArray(parsed.stockMovements) ? parsed.stockMovements : [],
        };
        await saveDb(normalized);
        return normalized;
      }
    }

    return parsed;
  } catch (_error) {
    void _error;
    // If file doesn't exist, initialize with seed data
    const initialData = {
      clients: CLIENTS_SEED,
      vendors: [],
      products: PRODUCTS_SEED,
      coas: COA_SEED,
      salesOrders: [],
      salesOrderItems: [],
      purchases: [],
      purchaseItems: [],
      deliveries: [],
      expenses: [],
      invoices: [],
      journalEntries: [],
      journalLines: [],
      stockMovements: [],
      leads: [],
      announcement: {
        message: "Selamat Datang di DISMA V2! Semua sistem operasional hulu ke hilir sudah online.",
        active: true,
        timestamp: new Date().toISOString()
      },
      tasks: [],
      notifications: [],
      users: MOCK_USERS,
      navOrders: {}
    };
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    await fs.writeFile(DB_PATH, JSON.stringify(initialData, null, 2));
    return initialData;
  }
}

export async function saveDb(data: DbShape) {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}
