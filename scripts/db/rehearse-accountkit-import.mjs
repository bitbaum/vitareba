import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

// Rehearsal only: there is no apply mode until the runtime switch is ready.
if (process.argv.length > 2) throw new Error("This command only supports rollback rehearsals");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const client = await pool.connect().catch(async () => {
  console.error("Account import rehearsal could not connect");
  await pool.end();
  process.exit(1);
});
try {
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '30s'");
  await client.query(
    await readFile(fileURLToPath(new URL("./accountkit-import.sql", import.meta.url)), "utf8"),
  );
  const { rows } = await client.query(`
    SELECT (SELECT count(*)::int FROM vita_accountkit_users) AS accounts,
      (SELECT count(*)::int FROM vita_accountkit_users WHERE password IS NOT NULL) AS password_accounts,
      (SELECT count(*)::int FROM vita_accountkit_users WHERE verified) AS verified_addresses,
      (SELECT count(*)::int FROM vita_accountkit_links) AS provider_links
  `);
  await client.query("ROLLBACK");
  console.log(JSON.stringify({ rehearsal: "rolled_back", ...rows[0] }));
} catch {
  await client.query("ROLLBACK");
  // Constraint errors can carry addresses or hashes; keep output fixed.
  console.error("Account import rehearsal failed; transaction rolled back");
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
