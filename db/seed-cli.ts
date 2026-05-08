// CLI: `npm run db:seed`
import { db, schema } from "./client.ts";
import { seedDatabase } from "./seed.ts";

const counts = seedDatabase(db, schema);
console.log("✓ seeded multi-team");
console.log(`  shops:       ${counts.shops}`);
console.log(`  ingredients: ${counts.ingredients}`);
console.log(`  vendors:     ${counts.vendors}`);
console.log(`  offerings:   ${counts.offerings}`);
console.log(`  customers:   ${counts.customers}`);
