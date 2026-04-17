const { Client } = require("pg");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[db-test] DATABASE_URL not set");
  process.exit(1);
}

const masked = url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
console.log("[db-test] DATABASE_URL:", masked);
console.log("[db-test] NODE_ENV:", process.env.NODE_ENV);

const client = new Client({
  connectionString: url.replace(/[?&]sslmode=[^&]*/, "").replace(/\?$/, ""),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

(async () => {
  try {
    console.log("[db-test] connecting...");
    await client.connect();
    const r = await client.query("SELECT version(), current_database(), inet_server_addr()");
    console.log("[db-test] OK:", r.rows[0]);
    await client.end();
    process.exit(0);
  } catch (e) {
    console.error("[db-test] FAILED:", e.code || "", e.message);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  }
})();
