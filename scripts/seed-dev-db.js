const fs = require("fs");

function extractArray(filePath, pattern) {
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(pattern);
  if (!match) {
    throw new Error(`Pattern not found in ${filePath}`);
  }
  return Function(`return (${match[1]});`)();
}

const seedData = {
  users: extractArray("src/lib/constants.ts", /export const MOCK_USERS:[^=]*=\s*(\[[\s\S]*?\n\]);/),
  coas: extractArray("src/lib/constants.ts", /export const COA_SEED:[^=]*=\s*(\[[\s\S]*?\n\]);/),
  vendors: extractArray("src/lib/constants.ts", /export const VENDORS_SEED:[^=]*=\s*(\[[\s\S]*?\n\]);/),
  clients: extractArray("src/lib/clients_seed.ts", /export const CLIENTS_SEED:[^=]*=\s*(\[[\s\S]*?\n\]);/),
  products: extractArray("src/lib/products_seed.ts", /export const PRODUCTS_SEED:[^=]*=\s*(\[[\s\S]*?\n\]);/),
  bank_accounts: extractArray("src/lib/store.ts", /const INITIAL_BANK_ACCOUNTS:[^=]*=\s*(\[[\s\S]*?\n\]);/),
};

async function main() {
  const response = await fetch("http://localhost:3000/api/db/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "seed", seedData }),
  });

  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));

  if (!response.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
