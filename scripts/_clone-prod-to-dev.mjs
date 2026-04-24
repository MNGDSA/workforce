// One-shot clone: copy a small, FK-consistent slice of production data
// into the development database. SAFE: PROD is opened read-only by
// default (we never run UPDATE/INSERT/DELETE/ALTER against it). DEV is
// fully wiped and reloaded.
//
// Caps:
//   - 100 most recent applications
//   - 100 most recent candidates (union with applications.candidate_id)
//   - 100 most recent users    (union with all FK refs from copied rows)
//   - All rows of every other small table
//
// Skipped entirely (sensitive / transient noise):
//   audit_logs, otp_verifications, login_rate_limit_buckets, sms_outbox

import pg from 'pg';
const { Client } = pg;

const SAMPLE = { users: 100, candidates: 100, applications: 100 };
const SKIP   = new Set(['audit_logs','otp_verifications','login_rate_limit_buckets','sms_outbox']);

const prod = new Client({ connectionString: process.env.PROD_DATABASE_URL, ssl: { rejectUnauthorized: false } });
const dev  = new Client({ connectionString: process.env.DATABASE_URL });

const log = (...a) => console.log(...a);

function quoteIdent(s) { return '"' + s.replace(/"/g,'""') + '"'; }

async function listColumns(client, table) {
  const r = await client.query(
    `SELECT column_name, udt_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1
       ORDER BY ordinal_position`, [table]);
  return { names: r.rows.map(x => x.column_name),
           jsonCols: new Set(r.rows.filter(x => x.udt_name==='jsonb' || x.udt_name==='json').map(x=>x.column_name)),
           arrayCols: new Set(r.rows.filter(x => x.udt_name && x.udt_name.startsWith('_')).map(x=>x.column_name)) };
}

async function tablesIn(client) {
  const r = await client.query(
    `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_type='BASE TABLE'
       ORDER BY table_name`);
  return r.rows.map(x => x.table_name);
}

// Insert rows in batches with FK checks already disabled (caller's job).
async function insertRows(client, table, colInfo, rows) {
  if (!rows.length) return 0;
  const { names: cols, jsonCols } = colInfo;
  const colList = cols.map(quoteIdent).join(',');
  const BATCH = Math.max(1, Math.floor(60000 / cols.length));
  const encode = (col, v) => {
    if (v === undefined || v === null) return null;
    if (jsonCols.has(col) && typeof v === 'object') return JSON.stringify(v);
    return v;
  };
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const params = [];
    const tuplesSql = slice.map((row) => {
      const ph = [];
      for (const c of cols) {
        params.push(encode(c, row[c]));
        ph.push(`$${params.length}`);
      }
      return '(' + ph.join(',') + ')';
    }).join(',');
    const sql = `INSERT INTO public.${quoteIdent(table)} (${colList}) VALUES ${tuplesSql} ON CONFLICT DO NOTHING`;
    const r = await client.query(sql, params);
    inserted += r.rowCount || 0;
  }
  return inserted;
}

async function fetchAll(client, table) {
  const r = await client.query(`SELECT * FROM public.${quoteIdent(table)}`);
  return r.rows;
}

async function fetchTopN(client, table, orderCol, n) {
  const r = await client.query(`SELECT * FROM public.${quoteIdent(table)} ORDER BY ${quoteIdent(orderCol)} DESC NULLS LAST LIMIT $1`, [n]);
  return r.rows;
}

async function fetchByIds(client, table, idCol, ids) {
  if (!ids.length) return [];
  const r = await client.query(`SELECT * FROM public.${quoteIdent(table)} WHERE ${quoteIdent(idCol)} = ANY($1::text[])`, [ids]);
  return r.rows;
}

(async () => {
  await prod.connect();
  await dev.connect();
  log('connected to prod and dev');

  // SAFETY: prod must be read-only. Set transaction read-only.
  await prod.query('SET default_transaction_read_only = on');
  await prod.query('SET statement_timeout = 60000');

  // 1) Discover all tables & figure out what to copy.
  const prodTables = await tablesIn(prod);
  log(`prod tables: ${prodTables.length}`);

  // 2) Build the row sets.
  log('\n--- planning row sets ---');
  // top-N apps
  const topApps = await fetchTopN(prod, 'applications', 'applied_at', SAMPLE.applications);
  log(`applications: ${topApps.length}`);
  // top-N candidates + extras referenced by apps
  const topCands = await fetchTopN(prod, 'candidates', 'created_at', SAMPLE.candidates);
  const candIdSet = new Set(topCands.map(c => c.id));
  const extraCandIds = topApps.map(a => a.candidate_id).filter(id => id && !candIdSet.has(id));
  const extraCands = await fetchByIds(prod, 'candidates', 'id', [...new Set(extraCandIds)]);
  for (const c of extraCands) candIdSet.add(c.id);
  const cands = [...topCands, ...extraCands];
  log(`candidates: ${cands.length} (top ${topCands.length} + ${extraCands.length} extra from apps)`);

  // top-N users + closure
  const topUsers = await fetchTopN(prod, 'users', 'created_at', SAMPLE.users);
  const userIdSet = new Set(topUsers.map(u => u.id));
  const userRefs = new Set();
  for (const c of cands) if (c.user_id) userRefs.add(c.user_id);
  for (const a of topApps) if (a.reviewed_by) userRefs.add(a.reviewed_by);
  // pull FK refs from small tables that we'll copy in full
  for (const t of ['workforce','events','job_postings','contract_templates','question_sets','automation_rules','candidate_activation_tokens','interviews','notifications','onboarding','photo_change_requests','pay_runs','sms_broadcasts','smp_documents','attendance_records','attendance_submissions','schedule_assignments','excuse_requests','id_card_print_logs']) {
    if (!prodTables.includes(t)) continue;
    const rows = await fetchAll(prod, t);
    for (const row of rows) {
      for (const k of Object.keys(row)) {
        if ((k === 'created_by' || k === 'reviewed_by' || k === 'recipient_id' || k === 'actor_id'
          || k === 'assigned_by' || k === 'converted_by' || k === 'rejected_by' || k === 'uploaded_by'
          || k === 'printed_by' || k === 'supervisor_id' || k === 'interviewer_id' || k === 'posted_by'
          || k === 'created_by_user_id' || k === 'recorded_by') && row[k]) {
          userRefs.add(row[k]);
        }
        if (k === 'candidate_id' && row[k]) userRefs; // candidates already handled separately
      }
    }
  }
  // candidate-id closure from those small tables → candidates
  for (const t of ['workforce','candidate_activation_tokens','candidate_contracts','interviews','notifications','onboarding','photo_change_requests','sms_outbox']) {
    if (!prodTables.includes(t)) continue;
    const rows = await fetchAll(prod, t);
    for (const row of rows) {
      if (row.candidate_id && !candIdSet.has(row.candidate_id)) {
        const more = await fetchByIds(prod, 'candidates', 'id', [row.candidate_id]);
        for (const c of more) { cands.push(c); candIdSet.add(c.id); }
      }
    }
  }
  const extraUserIds = [...userRefs].filter(id => !userIdSet.has(id));
  const extraUsers = await fetchByIds(prod, 'users', 'id', extraUserIds);
  for (const u of extraUsers) userIdSet.add(u.id);
  const users = [...topUsers, ...extraUsers];
  log(`users: ${users.length} (top ${topUsers.length} + ${extraUsers.length} extra from FK closure)`);
  log(`final candidates: ${cands.length}`);

  // 3) Wipe dev (preserve drizzle migration table if present).
  log('\n--- wiping dev ---');
  const devTables = await tablesIn(dev);
  log(`dev tables: ${devTables.length}`);
  await dev.query('BEGIN');
  await dev.query("SET session_replication_role = 'replica'");
  for (const t of devTables) {
    if (t === '__drizzle_migrations') continue;
    await dev.query(`TRUNCATE TABLE public.${quoteIdent(t)} CASCADE`);
  }
  log('truncated all public tables (CASCADE)');

  // 4) Copy data (FK checks remain disabled inside this transaction).
  // Order: parents first for cleanliness — though FKs are off so order is non-strict.
  const copyTable = async (table, rows) => {
    if (!rows.length) { log(`  ${table}: 0 rows`); return; }
    const colInfo = await listColumns(dev, table);
    const n = await insertRows(dev, table, colInfo, rows);
    log(`  ${table}: ${n} rows`);
  };

  log('\n--- copying ---');

  // Copy each non-skipped table.
  const handled = new Set();
  // First: small tables in their entirety (everything except sampled + skipped).
  const sampledNames = new Set(Object.keys(SAMPLE));
  for (const t of prodTables) {
    if (SKIP.has(t)) { log(`  ${t}: SKIPPED`); handled.add(t); continue; }
    if (sampledNames.has(t)) continue; // handled below
    if (t === '__drizzle_migrations') continue;
    const rows = await fetchAll(prod, t);
    await copyTable(t, rows);
    handled.add(t);
  }
  // Sampled big ones with our pre-computed sets.
  await copyTable('users', users);
  await copyTable('candidates', cands);
  await copyTable('applications', topApps);

  await dev.query("SET session_replication_role = 'origin'");
  await dev.query('COMMIT');
  log('\n--- committed ---');

  // 5) Verify.
  log('\n--- verification ---');
  for (const t of prodTables) {
    if (SKIP.has(t)) continue;
    const c = await dev.query(`SELECT count(*)::int AS n FROM public.${quoteIdent(t)}`);
    log(`  dev.${t}: ${c.rows[0].n}`);
  }

  await prod.end();
  await dev.end();
  log('\nclone complete.');
})().catch(async e => {
  console.error('CLONE FAILED:', e);
  try { await dev.query('ROLLBACK'); } catch {}
  try { await prod.end(); } catch {}
  try { await dev.end(); } catch {}
  process.exit(1);
});
