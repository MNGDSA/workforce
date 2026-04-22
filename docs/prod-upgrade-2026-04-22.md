# WORKFORCE PROD — Apr 22 2026 capacity upgrade

## Final state

**App** (36c0d71f-dbba-411d-98d2-44ee01ade379)
- size: apps-d-2vcpu-4gb
- autoscale min/max: 2/4
- health check: /api/health
- active commit: 9f8011b

**Database** (041a25a0-790d-4510-81a8-e094da735588)
- size: db-s-2vcpu-4gb
- nodes: 2 (HA)
- version: pg16
- status: online

**Pool**
- workforce-pool: mode=transaction, size=22, port=25061, db=defaultdb

## Timeline
- 11:13Z  CA cert injected via API → deploy b01525e5 ACTIVE, health green
- 11:18Z  App resized to apps-d-2vcpu-4gb → deploy 235b0c3b ACTIVE @ 11:25Z
- 11:25Z  DB resize triggered db-s-1vcpu-2gb → db-s-2vcpu-4gb HA
- 11:58Z  DB resize complete (~33 min); single 504 at failover blip, recovered automatically
- 12:00Z  Pool delete attempted; app went 504 → pool recreated identically; app green

## Cost delta vs. pre-change
- App: $12 × 2 → $78 × 2 = +$132/mo
- DB:  $30 (HA 1/2) → $60 (HA 2/4) ≈ +$30/mo
- **Total: ≈ +$162/mo**

## Notes
- pgbouncer pool RETAINED; DATABASE_URL secret routes through port 25061. Removing the pool requires:
  1) Replace DATABASE_URL with direct postgresql://...:25060/defaultdb URI
  2) Redeploy
  3) Delete pool
- Pool size 22 in transaction mode is well-sized for 2 app instances × ~10 conns each.
- DO managed-PG CA stored at docs/prod-secrets/workforce-db-ca.pem (valid Apr 2036)
- Snapshot for rollback: .local/prod-snapshot/workforce-app-spec.before.json

## Phase C — pgbouncer removal (12:15Z)
- Swapped DATABASE_URL secret to direct postgresql://...:25060/defaultdb
- Deploy 4156332a → ACTIVE on commit 9f8011b
- Pre-delete health: 15/15 200 OK on direct connection
- DELETE workforce-pool → HTTP 204
- Post-delete health: 15/15 200 OK, 1-2 ms DB latency
- Pools list: empty
- Snapshot before: .local/prod-snapshot/workforce-app-spec.before-pool-removal.json

## Final state
- App: apps-d-2vcpu-4gb × 2 (autoscale 2-4)
- DB:  db-s-2vcpu-4gb HA, pg16, direct connection only
- Pool: none
