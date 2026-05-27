const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const urlProd = 'https://ckkohudfuisgzlrjipev.supabase.co';
const keyProd = process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION;

const urlLocal = 'https://plzkrzzmqatjgsitvmfd.supabase.co';
const keyLocal = process.env.SUPABASE_SERVICE_ROLE_KEY_LOCAL;

async function checkDb(name, url, key) {
  if (!key) {
    console.log(`No key for ${name}`);
    return;
  }
  try {
    const supabase = createClient(url, key);
    const { data: accounts, error } = await supabase.from('bank_accounts').select('*');
    if (error) {
      console.error(`Error for ${name}:`, error);
      return;
    }
    console.log(`\n=== Bank Accounts in ${name} ===`);
    accounts.forEach(acc => {
      console.log(JSON.stringify(acc, null, 2));
    });
  } catch (err) {
    console.error(`Failed to connect to ${name}:`, err);
  }
}

async function main() {
  await checkDb('PRODUCTION', urlProd, keyProd);
  await checkDb('LOCAL', urlLocal, keyLocal);
}

main();
