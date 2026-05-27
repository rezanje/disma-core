const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'db.json');
if (!fs.existsSync(dbPath)) {
  console.error("db.json not found");
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log("Checking rolePermissions in db.json:");
if (db.rolePermissions) {
  for (const [role, perms] of Object.entries(db.rolePermissions)) {
    if (Array.isArray(perms)) {
      const seen = new Set();
      const dupes = [];
      for (const p of perms) {
        if (seen.has(p)) {
          dupes.push(p);
        }
        seen.add(p);
      }
      if (dupes.length > 0) {
        console.log(`Role ${role} has duplicate permissions:`, dupes);
      } else {
        console.log(`Role ${role} has no duplicates.`);
      }
    }
  }
}

console.log("\nChecking navConfigs in db.json:");
if (db.navConfigs) {
  for (const [role, config] of Object.entries(db.navConfigs)) {
    if (config.desktop && Array.isArray(config.desktop.order)) {
      const seen = new Set();
      const dupes = [];
      for (const item of config.desktop.order) {
        if (seen.has(item)) {
          dupes.push(item);
        }
        seen.add(item);
      }
      if (dupes.length > 0) {
        console.log(`Role ${role} desktop order has duplicates:`, dupes);
      }
    }
    if (config.mobile && Array.isArray(config.mobile.order)) {
      const seen = new Set();
      const dupes = [];
      for (const item of config.mobile.order) {
        if (seen.has(item)) {
          dupes.push(item);
        }
        seen.add(item);
      }
      if (dupes.length > 0) {
        console.log(`Role ${role} mobile order has duplicates:`, dupes);
      }
    }
  }
}
