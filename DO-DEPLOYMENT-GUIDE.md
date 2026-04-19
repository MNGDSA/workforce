# WORKFORCE — DigitalOcean Deployment Guide

A step-by-step guide to deploy the Workforce app on DigitalOcean App Platform.

---

## Quick Reference: Environment Variables

| Variable | Value / Source | Required |
|---|---|---|
| `DATABASE_URL` | Managed DB pooled connection string (port 25061) | Yes |
| `NODE_ENV` | `production` | Yes |
| `PORT` | Auto-set by DO (usually 8080) | Auto |
| `SESSION_SECRET` | Random 64-char hex (see Step 5) | Yes |
| `SPACES_ENDPOINT` | e.g. `fra1.digitaloceanspaces.com` | Yes |
| `SPACES_BUCKET` | e.g. `workforce-uploads` | Yes |
| `SPACES_KEY` | From Spaces API key (see Step 2) | Yes |
| `SPACES_SECRET` | From Spaces API key (see Step 2) | Yes |
| `SPACES_REGION` | e.g. `fra1` | Yes |
| `AWS_ACCESS_KEY_ID` | Your AWS IAM key for Rekognition | If using face verify |
| `AWS_SECRET_ACCESS_KEY` | Your AWS IAM secret for Rekognition | If using face verify |
| `AWS_REGION` | e.g. `us-east-1` | If using face verify |

---

## Step 1: Create a Managed PostgreSQL Database

1. Go to **DigitalOcean Console** > **Databases** > **Create Database Cluster**
2. Choose these settings:
   - **Engine**: PostgreSQL 16
   - **Plan**: Basic — **$15/mo** (1 vCPU, 2 GB RAM, 10 GB storage)
   - **Region**: Pick one close to your users (e.g. `FRA1` for Middle East/Europe, `BLR1` for India)
   - **Datacenter**: Same region you'll use for the App Platform (important for latency)
   - **Name**: `workforce-db` (or anything you like)
3. Click **Create Database Cluster** and wait for it to provision (~5 minutes)
4. Once ready, go to the **Connection Details** panel:
   - Switch the dropdown to **Connection Pool** mode
   - Create a pool: name `workforce-pool`, database `defaultdb`, mode `Transaction`, size `22`
   - Copy the **Connection String** — it uses port `25061` (pooled). You'll need this in Step 5.

> **Why connection pooling?** When running 2+ app instances, each opens its own PostgreSQL connections. The pool prevents exceeding the database's connection limit.

---

## Step 2: Create a DO Spaces Bucket

1. Go to **DigitalOcean Console** > **Spaces Object Storage** > **Create Bucket**
2. Choose **Standard Storage** (not Cold Storage — the app reads/writes files frequently)
3. Choose these settings:
   - **Region**: Same as your database (e.g. `FRA1`)
   - **CDN**: **Enable** (speeds up photo and document loading for workers across regions)
   - **Name**: `workforce-uploads`
   - **File Listing**: Restricted (private)
4. Click **Create Bucket**
5. Generate API keys:
   - Go to **API** > **Spaces Keys** > **Generate New Key**
   - Name it `workforce-app`
   - Choose **Full Access** (the app needs to read, write, and delete files — uploading attendance photos, documents, and cleaning up old files)
   - Save both the **Key** and the **Secret** — you won't see the secret again

---

## Step 3: Create the App on DO App Platform

1. Go to **DigitalOcean Console** > **Apps** > **Create App**
2. Choose **GitHub** as the source
3. Select your repository: **MNGDSA/workforce**, branch: **main**
4. Auto-deploy: **Enabled** (pushes to main will auto-redeploy)
5. Configure the **Web Service** component:

| Setting | Value |
|---|---|
| **Type** | Web Service |
| **Name** | `workforce` |
| **Source** | GitHub — `MNGDSA/workforce`, branch `main` |
| **Region** | Same as your database (e.g. `FRA1`) |
| **Build Command** | `npm install && npm run build && npm run db:push` |
| **Run Command** | `NODE_ENV=production node dist/index.cjs` |
| **HTTP Port** | `8080` |

6. Set the **Instance Size**:
   - For starting out, choose a **Basic (shared CPU)** plan — $12/mo for 1 vCPU / 1 GB RAM
   - Shared instances do **not** support auto-scaling — you pick a fixed instance count
   - Set **Instance Count** to `2` (load balancing + zero-downtime deploys)
   - **For peak season (Ramadan/Hajj)**: Switch to a **Dedicated (Pro)** plan to unlock auto-scaling:
     - **Pro**: 1 vCPU / 1 GB RAM ($25/mo per instance)
     - Set auto-scaling: **min 2, max 4** instances
     - DO will automatically add/remove instances based on CPU and traffic load

7. Set **Network** settings:
   - **HTTP Port**: `8080`
   - **Internal/External routing**: Keep as **External** (public-facing — both admin dashboard and mobile app connect to it)
   - **Health Check Path**: Set to `/api/health` — returns `200 {"status":"ok", ...}` when the app and database are reachable, or `503` if the DB readiness check (`SELECT 1`) fails. Preferred over `/` because it avoids loading the React bundle on every probe and gives DO a true readiness signal.
   - **CORS**: Not needed here — the API and frontend are served from the same origin

> **What happens during build?**
> - `npm install` — installs all dependencies
> - `npm run build` — bundles the React frontend into `dist/public/` and the Express backend into `dist/index.cjs`
> - `npm run db:push` — syncs the database schema (creates/updates tables)

---

## Step 4: Attach the Database

1. In the app configuration screen, click **Add Resource** > **Database**
2. Select **Previously Created Database** > choose `workforce-db`
3. DO will inject `DATABASE_URL` automatically, but you should override it:
   - Go to the component's **Environment Variables**
   - Set `DATABASE_URL` to the **pooled connection string** you copied in Step 1 (port 25061)
   - This is important — the non-pooled string (port 25060) can exhaust connections

---

## Step 5: Set Environment Variables

In the app component settings, go to **Environment Variables** and add:

### Required Variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your pooled connection string from Step 1 |
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | Generate one (see below) |
| `SPACES_ENDPOINT` | Your Spaces region endpoint, e.g. `fra1.digitaloceanspaces.com` |
| `SPACES_BUCKET` | `workforce-uploads` (or whatever you named it) |
| `SPACES_KEY` | The Spaces API key from Step 2 |
| `SPACES_SECRET` | The Spaces API secret from Step 2 |
| `SPACES_REGION` | e.g. `fra1` |

**Generate SESSION_SECRET:**
Open any terminal and run:
```bash
openssl rand -hex 32
```
Copy the output (64-character hex string) and paste it as the value.

> Mark `SESSION_SECRET`, `SPACES_SECRET`, and `DATABASE_URL` as **Encrypted** in the DO dashboard so they aren't visible in logs.

### Optional Variables (Face Verification)

If you're using AWS Rekognition for attendance face matching:

| Variable | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | Your AWS IAM access key |
| `AWS_SECRET_ACCESS_KEY` | Your AWS IAM secret key |
| `AWS_REGION` | `us-east-1` (or your Rekognition region) |

> If these are not set, the app will skip face verification and mark attendance photos as "unverified" — it won't crash.

---

## Step 6: Deploy

1. Click **Create Resources** (or **Deploy** if editing an existing app)
2. Watch the **Build Logs** — the build takes about 30–60 seconds:
   - You should see `building client...` → `building server...` → `running branding check...`
   - Then `Pulling schema from database...` → `Changes applied`
3. Once deployed, the app URL will appear (e.g. `https://workforce-xxxxx.ondigitalocean.app`)

---

## Step 7: Verify Everything Works

### 7.1 — Check the App Loads
1. Visit your app URL in a browser
2. You should see the login page with the green "WORKFORCE" branding

### 7.2 — Log In as Super Admin
1. Identifier: `1000000001`
2. Password: `password123`
3. You should land on the admin dashboard

> **Important**: Change the super admin password immediately after first login. Go to any user management section or contact your developer.

### 7.3 — Test File Upload
1. Navigate to a candidate profile
2. Try uploading a document or photo
3. The file should upload successfully — in the database, the URL will be a full DO Spaces URL (e.g. `https://workforce-uploads.fra1.digitaloceanspaces.com/uploads/...`)

### 7.4 — Check Build Logs for Errors
1. In the DO dashboard, go to your app > **Runtime Logs**
2. Look for the startup message: `serving on port 8080`
3. Check there are no red error lines

---

## Step 8: Configure Custom Domain (Optional)

1. In your app settings, go to **Settings** > **Domains**
2. Click **Add Domain**
3. Enter your domain (e.g. `app.yourcompany.com`)
4. Add the CNAME record shown to your DNS provider
5. DO handles SSL/TLS certificates automatically

---

## Cost Estimate

### Starting Configuration (~$44/month)

| Resource | Spec | Monthly Cost |
|---|---|---|
| App Platform | 2x Basic ($12 each) | $24 |
| Managed PostgreSQL | Basic (2 GB RAM, 10 GB) | $15 |
| DO Spaces | 250 GB included | $5 |
| **Total** | | **$44** |

### Peak Season (Ramadan/Hajj) (~$110–120/month)

| Resource | Spec | Monthly Cost |
|---|---|---|
| App Platform | Pro (dedicated), 2–4 instances auto-scaling ($25 each) | $50–100 |
| Managed PostgreSQL | Basic (2 GB RAM, 25 GB) | $30 |
| DO Spaces | 250 GB included | $5 |
| Bandwidth | ~$5–15 for photos/docs | $5–15 |
| **Total** | | **~$90–150** |

---

## Scaling for Peak Season (5,000–10,000 Workers)

### When to Scale Up

- **2–4 weeks before** Ramadan/Hajj season starts
- When you begin bulk-uploading candidate data
- When mobile attendance starts (heaviest load)

### How to Scale

1. **App instances**: In the DO dashboard, go to your app > **Settings** > **Scaling**
   - Switch from **Basic (shared)** to a **Pro (dedicated)** plan
   - Enable auto-scaling: set **min 2, max 4** instances
   - Auto-scaling is only available on dedicated plans — shared plans require manual instance count changes
2. **Database**: If you see slow queries in logs, upgrade to a larger plan:
   - Go to **Databases** > your cluster > **Resize**
   - Move to the next tier (4 GB RAM, 2 vCPU)
3. **Connection pool size**: If you scale beyond 4 app instances, increase the pool size:
   - Go to **Databases** > **Connection Pools** > edit your pool
   - Increase size from 22 to 40

### When to Scale Down

- After the season ends and worker count drops
- Scale back to 2 instances and Basic database tier

---

## Mobile App Configuration

The Android mobile app needs to know your production API URL:

1. In `mobile/src/services/api.ts`, update the fallback URL to your production domain
2. Or configure it in the app's settings screen at runtime

The mobile app communicates via:
- `POST /api/attendance/mobile` — photo + GPS attendance
- `POST /api/auth/login` — employee login
- `GET /api/workforce/by-candidate/:id` — employee profile
- `POST /api/excuse-requests` — excuse submissions

All endpoints require authentication (JWT token from login).

---

## Troubleshooting

### Build fails with "DATABASE_URL" error
- Make sure `DATABASE_URL` is set in the app's environment variables
- If you attached the database as a resource, DO may set it automatically — but verify the value is the **pooled** connection string

### Build fails with SSL error
- The app strips `sslmode` from the connection string and uses Node.js SSL config instead
- Make sure your `DATABASE_URL` doesn't have conflicting SSL parameters
- The app sets `ssl: { rejectUnauthorized: false }` in production automatically

### App starts but returns 502/503
- Check **Runtime Logs** for errors
- Common cause: database connection failed — verify `DATABASE_URL` is correct
- Common cause: missing `SESSION_SECRET` — the app needs this to create auth tokens

### File uploads fail
- Check that all `SPACES_*` environment variables are set correctly
- The endpoint format is `REGION.digitaloceanspaces.com` (e.g. `fra1.digitaloceanspaces.com`)
- Make sure the Spaces API key has read/write permissions

### App works but photos don't display
- Files uploaded in production are stored in DO Spaces with private access
- The app serves them through its own endpoints — make sure the `SPACES_*` credentials are correct
- Old `/uploads/...` paths in the database (from development) will redirect to Spaces in production

### "tsx: not found" or "vite: not found" during build
- All build tools (tsx, vite, esbuild, drizzle-kit, typescript) are in `dependencies` (not `devDependencies`) specifically because DO prunes devDependencies before running the custom build command
- Only the 3 Replit dev plugins remain in `devDependencies` — they're not needed in production
- If you see this error, make sure the latest `package.json` is pushed to GitHub

### "Module not found" errors at runtime
- The build bundles most dependencies, but some (like AWS SDK) are kept external
- Make sure the build command includes `npm install` before `npm run build`

### Multiple instances causing session issues
- The app uses cookie-based auth (`wf_auth` cookie verified server-side against the `users` table on every request) — no in-memory session state
- With 2+ instances behind a load balancer, users stay logged in regardless of which instance handles the request
- If you ever switch to in-memory or sticky sessions, you'll need to add Redis or database-backed session storage

---

## Architecture Summary

```
                    ┌─────────────────────────────┐
                    │    DigitalOcean App Platform  │
                    │                               │
  Browser ────────> │  Instance 1 (Node.js)        │──────> DO Managed PostgreSQL
                    │  Instance 2 (Node.js)        │        (port 25061, pooled)
  Android App ───> │                               │
                    │  Serves: API + React SPA     │──────> DO Spaces
                    │  Port: 8080                  │        (workforce-uploads)
                    │                               │
                    └─────────────────────────────┘        ┌──────────────────┐
                                                     ───> │  AWS Rekognition  │
                                                          │  (face matching)  │
                                                          └──────────────────┘
```

---

## Post-Deployment Checklist

- [ ] App loads at the DO URL
- [ ] Super admin login works (`1000000001` / `password123`)
- [ ] Changed super admin password
- [ ] File upload works (test with a candidate photo)
- [ ] Mobile app connects and can submit attendance
- [ ] Face verification works (if AWS keys configured)
- [ ] Custom domain configured (optional)
- [ ] Environment variables marked as encrypted
- [ ] Auto-deploy from GitHub is enabled
- [ ] Scaling plan ready for peak season
