import fs from 'fs/promises';
import path from 'path';
import { CLIENTS_SEED } from './clients_seed';
import { PRODUCTS_SEED } from './products_seed';
import { COA_SEED, MOCK_USERS } from './constants';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

export async function getDb() {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
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

export async function saveDb(data: any) {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}
