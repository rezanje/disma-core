const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const urlProd = 'https://ckkohudfuisgzlrjipev.supabase.co';
const keyProd = process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION;

async function main() {
  if (!keyProd) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY_PRODUCTION");
    return;
  }
  const supabase = createClient(urlProd, keyProd);

  // 1. Get bank accounts
  const { data: banks, error: errBanks } = await supabase.from('bank_accounts').select('*');
  if (errBanks) {
    console.error("Error fetching bank accounts:", errBanks);
    return;
  }
  console.log("\n--- bank_accounts table ---");
  console.table(banks);

  // 2. Get unique bank_account_id in cash_transactions
  const { data: txs, error: errTxs } = await supabase.from('cash_transactions').select('id, bank_account_id, type, amount, category, description');
  if (errTxs) {
    console.error("Error fetching cash transactions:", errTxs);
    return;
  }

  console.log(`\nTotal cash transactions: ${txs.length}`);

  const uniqueBankIds = [...new Set(txs.map(t => t.bank_account_id))];
  console.log("Unique bank_account_id referenced in transactions:", uniqueBankIds);

  // 3. Compute balance by bank_account_id from transactions
  const summary = {};
  txs.forEach(t => {
    const bid = t.bank_account_id;
    if (!summary[bid]) {
      summary[bid] = { bank_id: bid, in: 0, out: 0, calculated: 0 };
    }
    const amt = Number(t.amount);
    if (t.type === 'In') {
      summary[bid].in += amt;
      summary[bid].calculated += amt;
    } else {
      summary[bid].out += amt;
      summary[bid].calculated -= amt;
    }
  });

  console.log("\n--- Calculated balances from transactions ---");
  console.table(Object.values(summary));
}

main();
