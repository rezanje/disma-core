const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Force production profile to fetch the clean list of 88 clients
const suffix = '_PRODUCTION';
const dbUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL${suffix}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbKey = process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const supabase = createClient(dbUrl, dbKey);
  console.log(`Fetching clean clients from production database...`);

  const { data: dbClients, error } = await supabase
    .from('clients')
    .select('*')
    .order('company_name');
  
  if (error) {
    console.error('Error fetching clients:', error);
    return;
  }

  console.log(`Fetched ${dbClients.length} clients.`);

  // Map database fields to camelCase Client interface fields
  const clientSeedData = dbClients.map(c => ({
    id: c.id,
    companyName: c.company_name,
    picName: c.pic_name,
    email: c.email || '',
    phone: c.phone || '',
    address: c.address || '',
    paymentTermDays: c.payment_term_days || 30,
    totalOrderJanMay: Number(c.total_order_jan_may || 0),
    createdAt: c.created_at,
    notes: c.notes || ''
  }));

  const seedFilePath = path.join(__dirname, '../src/lib/clients_seed.ts');
  const codeContent = `import { Client } from '@/types';

export const CLIENTS_SEED: Client[] = ${JSON.stringify(clientSeedData, null, 2)};
`;

  fs.writeFileSync(seedFilePath, codeContent, 'utf8');
  console.log(`Successfully generated and wrote ${clientSeedData.length} clients to src/lib/clients_seed.ts`);
}

main();
