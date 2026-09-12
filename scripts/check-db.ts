import { database } from "../lib/db";
const db = await database();
await db.query("SELECT 1 AS ok");
console.log(`Database ready: ${db.dialect}`);
process.exit(0);
