#!/bin/bash
# Run on the app droplet AFTER stage1 cloud-init finished.
# Expects /etc/workforce/env.in to be uploaded with all env vars.
set -euxo pipefail

# Wait for stage1 to complete (cloud-init clones + builds the repo)
for i in $(seq 1 60); do
  [ -f /etc/workforce/.stage1-done ] && break
  echo "waiting for stage1... ($i/60)"
  sleep 10
done
[ -f /etc/workforce/.stage1-done ] || { echo "stage1 never completed"; exit 1; }

# pgbouncer config
cat > /etc/pgbouncer/pgbouncer.ini <<EOF
[databases]
defaultdb = host=$PGB_UPSTREAM_HOST port=$PGB_UPSTREAM_PORT dbname=defaultdb user=doadmin password=$PGB_UPSTREAM_PASSWORD

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 2000
default_pool_size = 80
reserve_pool_size = 20
reserve_pool_timeout = 1
server_idle_timeout = 60
server_lifetime = 600
log_connections = 0
log_disconnections = 0
log_pooler_errors = 1
server_tls_sslmode = require
server_tls_ca_file = /etc/workforce/db-ca.pem
EOF

# pgbouncer userlist (the local-pool user/password the app uses to talk to pgbouncer)
LOCAL_PW=$(openssl rand -hex 16)
echo "\"workforce\" \"$LOCAL_PW\"" > /etc/pgbouncer/userlist.txt
chown postgres:postgres /etc/pgbouncer/userlist.txt
chmod 640 /etc/pgbouncer/userlist.txt

# Provide upstream credentials so pgbouncer can authenticate to managed PG
cat > /etc/pgbouncer/upstream-userlist.txt <<EOF
"doadmin" "$PGB_UPSTREAM_PASSWORD"
EOF
chown postgres:postgres /etc/pgbouncer/upstream-userlist.txt
chmod 640 /etc/pgbouncer/upstream-userlist.txt

systemctl restart pgbouncer
sleep 2

# Build the app env from /etc/workforce/env.in (already uploaded), pointing app at LOCAL pgbouncer
# DATABASE_URL goes via 127.0.0.1:6432 with the doadmin creds (passthrough)
cat /etc/workforce/env.in > /etc/workforce/env

# Systemd unit for the app
cat > /etc/systemd/system/workforce-app.service <<EOF
[Unit]
Description=Workforce staging load-test app
After=network.target pgbouncer.service
Wants=pgbouncer.service

[Service]
Type=simple
WorkingDirectory=/opt/workforce/app
EnvironmentFile=/etc/workforce/env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/workforce/app.log
StandardError=append:/var/log/workforce/app.err.log
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

mkdir -p /var/log/workforce
systemctl daemon-reload
systemctl enable workforce-app
systemctl restart workforce-app
sleep 4

# nginx in front, plain http
cat > /etc/nginx/sites-available/workforce <<'EOF'
upstream wfapp { server 127.0.0.1:5000 keepalive 64; }
server {
  listen 80 default_server;
  server_name _;
  client_max_body_size 32m;
  proxy_buffering off;
  location / {
    proxy_pass http://wfapp;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 60s;
  }
}
EOF
ln -sf /etc/nginx/sites-available/workforce /etc/nginx/sites-enabled/workforce
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# Stub SMS plugin row so /api/auth/otp/request gets past plugin lookup
PGPASSWORD=$PGB_UPSTREAM_PASSWORD psql "sslmode=require host=$PGB_UPSTREAM_HOST port=$PGB_UPSTREAM_PORT dbname=defaultdb user=doadmin sslrootcert=/etc/workforce/db-ca.pem" <<'PSQL'
INSERT INTO sms_plugins (id, name, slug, is_active, config, created_at, updated_at)
SELECT gen_random_uuid(), 'staging-stub', 'staging-stub', true, '{}'::jsonb, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM sms_plugins WHERE is_active = true);
PSQL

echo "POST-PROVISION DONE $(date)"
systemctl status workforce-app --no-pager | head -20
curl -fsS http://127.0.0.1/api/health || curl -fsS http://127.0.0.1:5000/api/health || true
