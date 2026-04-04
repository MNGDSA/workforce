# Deploying a Replit Full-Stack App to DigitalOcean App Platform

## Complete Guide for Replit AI Agents

This document captures the full deployment process and hard-won lessons from deploying a pnpm monorepo (Express API + React/Vite frontend) from Replit to DigitalOcean App Platform via GitHub auto-deploy.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Pre-Deployment Setup](#pre-deployment-setup)
3. [GitHub Repository Setup](#github-repository-setup)
4. [DigitalOcean App Platform Configuration](#digitalocean-app-platform-configuration)
5. [Database Setup](#database-setup)
6. [Object Storage (DO Spaces)](#object-storage-do-spaces)
7. [Environment Variables](#environment-variables)
8. [Build & Run Commands](#build--run-commands)
9. [SSL / Database Connection Issues](#ssl--database-connection-issues)
10. [Common Challenges & Solutions](#common-challenges--solutions)
11. [Post-Deployment Checklist](#post-deployment-checklist)
12. [Custom Domain Setup](#custom-domain-setup)

---

## 1. Architecture Overview

```
Replit (Development)
  └── GitHub Repo (MNGDSA/CertGen, main branch)
        └── DigitalOcean App Platform (Production)
              ├── Web Service (Express API serving both API + static frontend)
              ├── Managed PostgreSQL Database
              └── DO Spaces (Object Storage for PDFs/files)
```

- **Push to GitHub → Auto-triggers DigitalOcean redeploy**
- The Express server serves both the API routes and the built Vite frontend as static files
- Database is DigitalOcean Managed PostgreSQL (not the Replit dev database)
- File storage uses DigitalOcean Spaces (S3-compatible), not Replit Object Storage

---

## 2. Pre-Deployment Setup

### On Replit

1. **Ensure the app builds successfully locally:**
   ```bash
   pnpm install
   pnpm run build
   ```

2. **Identify all environment variables your app needs.** Check:
   - `process.env.*` references in your server code
   - Database connection strings
   - Session secrets
   - API keys (SMS gateways, etc.)
   - Object storage credentials

3. **Make sure your server reads `PORT` from environment:**
   ```typescript
   const port = parseInt(process.env.PORT || "8080");
   ```
   DigitalOcean sets `PORT` automatically — your app must respect it.

4. **Ensure your Express server serves the frontend build:**
   ```typescript
   // Serve static frontend files
   app.use(express.static(path.join(__dirname, "../public")));
   
   // SPA fallback — serve index.html for all non-API routes
   app.get("*", (req, res) => {
     if (!req.path.startsWith("/api")) {
       res.sendFile(path.join(__dirname, "../public/index.html"));
     }
   });
   ```

---

## 3. GitHub Repository Setup

### From Replit, connect to GitHub:

1. **Create the GitHub repository** (e.g., `MNGDSA/CertGen`)

2. **Add GitHub as a remote in Replit** (the Replit GitHub integration names it `github`, not `origin`):
   ```bash
   git remote add github https://github.com/YOUR_ORG/YOUR_REPO.git
   ```

3. **Push to GitHub using the integration token:**
   The Replit GitHub integration provides an access token. Use it programmatically:
   ```javascript
   // In code_execution sandbox:
   const conns = await listConnections('github');
   const token = conns[0].settings.access_token;
   // Then use: git remote set-url github https://x-access-token:{token}@github.com/ORG/REPO.git
   // Then: git push github main
   ```

4. **Important:** The remote is named `github`, NOT `origin`. Always push with:
   ```bash
   git push github main
   ```

---

## 4. DigitalOcean App Platform Configuration

### Create the App

1. Go to DigitalOcean → Apps → Create App
2. Connect your GitHub repository
3. Select the `main` branch
4. Enable **Auto-Deploy** (push to main triggers redeploy)

### App Spec Settings

- **Type:** Web Service
- **HTTP Port:** 8080 (or whatever your app uses)
- **Instance Size:** Basic ($5-12/mo) — scale up if needed
- **Instance Count:** 1 (use 2+ for high availability, but see challenges below about in-memory state)

---

## 5. Database Setup

### Create a DigitalOcean Managed PostgreSQL Database

1. Go to DigitalOcean → Databases → Create Database Cluster
2. Choose PostgreSQL (version 16 recommended)
3. Select the same region as your App Platform app
4. Choose the $15/mo plan (1 GB RAM, 10 GB storage) for small apps
5. **Attach it to your App** in the App Platform settings so DO auto-injects `DATABASE_URL`

### Critical: Database Connection String

DigitalOcean provides a `DATABASE_URL` like:
```
postgresql://user:pass@host:25060/defaultdb?sslmode=require
```

**This will cause problems.** See [SSL Issues](#ssl--database-connection-issues) below.

### Auto-Migration on Startup

Instead of relying solely on Drizzle `db:push`, add a startup migration function that creates tables via raw SQL. This acts as a safety net:

```typescript
async function ensureTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "your_table" (
      "id" SERIAL PRIMARY KEY,
      ...
    );
    -- For adding columns to existing tables safely:
    ALTER TABLE "your_table" ADD COLUMN IF NOT EXISTS "new_col" TEXT;
  `);
}
```

Call `ensureTables()` before `app.listen()`. This ensures tables exist even if Drizzle push wasn't run.

---

## 6. Object Storage (DO Spaces)

### Create a Space

1. Go to DigitalOcean → Spaces → Create Space
2. Choose the same region as your app
3. Note the **Spaces endpoint** (e.g., `nyc3.digitaloceanspaces.com`)
4. Set the Space name (e.g., `certgen-storage`)

### Generate Spaces Access Keys

1. Go to API → Spaces Keys → Generate New Key
2. Save the **Access Key** and **Secret Key** — you'll need these as environment variables

### CORS Configuration (CRITICAL)

In the Spaces settings, add CORS rules:
- **Origin:** `https://your-domain.com` (your production domain)
- **Allowed Methods:** `GET, PUT, HEAD`
- **Allowed Headers:** `*`
- **Max Age:** `3600`

Without CORS, the browser cannot directly download files from Spaces.

### Environment Variables for Spaces

```
SPACES_ENDPOINT=nyc3.digitaloceanspaces.com
SPACES_BUCKET=certgen-storage
SPACES_KEY=your-access-key
SPACES_SECRET=your-secret-key
SPACES_REGION=nyc3
```

---

## 7. Environment Variables

### Mapping Replit Variables to DigitalOcean

| Replit Variable | DO Variable | Notes |
|---|---|---|
| `DATABASE_URL` | `DATABASE_URL` | Auto-injected if DB is attached; must be modified (see SSL section) |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | `SPACES_BUCKET` | Different storage system entirely |
| N/A | `SPACES_KEY` | New — DO Spaces access key |
| N/A | `SPACES_SECRET` | New — DO Spaces secret key |
| N/A | `SPACES_ENDPOINT` | New — e.g., `nyc3.digitaloceanspaces.com` |
| N/A | `SESSION_SECRET` | Generate a strong random string (64+ chars) |
| N/A | `NODE_ENV` | Set to `production` |
| Any API keys | Same name | Copy values directly |

### How to Set Variables in DO

1. Go to App → Settings → App-Level Environment Variables
2. Add each variable
3. Mark sensitive values as "Encrypted" (they won't be visible after saving)

### Generate a Session Secret

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Set this as `SESSION_SECRET` in DigitalOcean.

---

## 8. Build & Run Commands

### Build Command

```bash
pnpm install && pnpm run build && pnpm --filter @workspace/db run push-force
```

- `pnpm install` — installs all monorepo dependencies
- `pnpm run build` — builds all packages (API server + frontend)
- `pnpm --filter @workspace/db run push-force` — syncs database schema via Drizzle

### Run Command

```bash
pnpm --filter @workspace/api-server run start
```

This starts the production Express server which serves both API and static frontend.

### Important Build Notes

- DigitalOcean runs the build command in a clean environment each deploy
- The `node_modules` may or may not be cached — always include `pnpm install`
- Build output must be deterministic — avoid relying on dev-only files

---

## 9. SSL / Database Connection Issues

### THE #1 DEPLOYMENT BLOCKER

DigitalOcean Managed PostgreSQL requires SSL. The `DATABASE_URL` includes `?sslmode=require`. However, newer versions of the `pg` (node-postgres) driver treat `sslmode=require` as `verify-full`, which requires a valid CA certificate. This causes:

```
Error: self-signed certificate in certificate chain
```

### The Fix

In your database connection code, **strip `sslmode` from the URL** and manually set SSL options:

```typescript
// lib/db/src/index.ts
function getConnectionString() {
  const url = process.env.DATABASE_URL || "";
  // Strip sslmode parameter — we handle SSL manually
  return url.replace(/[\?&]sslmode=[^&]*/, "").replace(/\?$/, "");
}

const pool = new Pool({
  connectionString: getConnectionString(),
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : undefined,
});
```

### Apply the Same Fix to Drizzle Config

```typescript
// drizzle.config.ts
function getConnectionString() {
  const url = process.env.DATABASE_URL || "";
  return url.replace(/[\?&]sslmode=[^&]*/, "").replace(/\?$/, "");
}

export default defineConfig({
  schema: "./src/schema/*",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: getConnectionString(),
    ssl: process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
  },
});
```

**Without this fix, the app will crash on startup and Drizzle push will fail during build.**

---

## 10. Common Challenges & Solutions

### Challenge 1: Content Security Policy (CSP) Blocking Resources

**Problem:** Helmet.js CSP blocks external resources (fonts, Spaces URLs, etc.)

**Solution:** Whitelist all necessary domains in your Helmet CSP config:
```typescript
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "https://your-space.nyc3.digitaloceanspaces.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://your-space.nyc3.digitaloceanspaces.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      workerSrc: ["'self'", "blob:"],
    },
  },
});
```

### Challenge 2: Public vs Authenticated Routes

**Problem:** Certificate view/download URLs must be publicly accessible (shared via SMS), but admin routes need auth.

**Solution:** Register public routes BEFORE the auth middleware:
```typescript
// Public routes first
app.use("/api/certificates", certificatePublicRouter);
app.use("/api/storage/objects", storagePublicRouter);

// Auth middleware
app.use(requireAuth);

// Protected routes after
app.use("/api/campaigns", campaignsRouter);
```

**If upload routes need auth but download routes don't**, apply `requireAuth` directly on the upload handler, not the entire router.

### Challenge 3: Multi-Instance Load Balancing & In-Memory State

**Problem:** If you run 2+ instances on DO, in-memory state (like certificate generation progress) is only on one instance. The load balancer may route progress-polling requests to the wrong instance, causing flickering progress bars.

**Solution:** Either:
- Use 1 instance (simplest)
- Move progress state to the database or Redis
- Add tolerance for "idle" responses (e.g., require 5 consecutive idle responses before concluding generation is done)

### Challenge 4: Mobile PDF Viewing

**Problem:** `<iframe>` PDF embeds don't work on Samsung/iOS browsers.

**Solution:** Use `pdfjs-dist` to render PDFs to canvas:
```typescript
import * as pdfjsLib from "pdfjs-dist";
// Render PDF page to canvas, then convert to image
```

### Challenge 5: Cookie-Based Sessions Not Persisting

**Problem:** Sessions disappear after deploy because `SESSION_SECRET` isn't set or changes between deploys.

**Solution:** 
- Set `SESSION_SECRET` as a permanent environment variable in DO
- Ensure cookie settings allow cross-origin (if using a custom domain):
```typescript
cookie: {
  secure: true,       // Required for HTTPS
  httpOnly: true,
  sameSite: "lax",
  maxAge: 24 * 60 * 60 * 1000,
}
```

### Challenge 6: Replit Object Storage vs DO Spaces

**Problem:** Replit's built-in object storage (`DEFAULT_OBJECT_STORAGE_BUCKET_ID`) doesn't exist on DigitalOcean.

**Solution:** Abstract your storage layer. Use environment variables to switch between Replit Object Storage (dev) and DO Spaces / AWS S3 (production). Both are S3-compatible, so you can use the `@aws-sdk/client-s3` package for both.

### Challenge 7: Database Schema Sync Failures

**Problem:** `drizzle-kit push` fails during DO build due to SSL issues or missing tables.

**Solution:** 
1. Fix SSL (see section 9)
2. Add `ensureTables()` as a backup that runs raw `CREATE TABLE IF NOT EXISTS` on startup
3. Use `ALTER TABLE ADD COLUMN IF NOT EXISTS` for new columns — this is safe for existing data

### Challenge 8: Build Command Fails Silently

**Problem:** DO build succeeds but app doesn't start — no clear error.

**Solution:** Always check DO's **Runtime Logs** (not just Build Logs). Common causes:
- Missing environment variable
- SSL error on DB connect
- Port mismatch (app hardcodes port instead of reading `PORT` env var)

### Challenge 9: GitHub Push Authentication

**Problem:** Replit's GitHub integration token expires or remote URL needs updating.

**Solution:** Always refresh the token before pushing:
```javascript
const conns = await listConnections('github');
const token = conns[0].settings.access_token;
execSync(`git remote set-url github https://x-access-token:${token}@github.com/ORG/REPO.git`);
execSync('git push github main');
```

### Challenge 10: Static Assets Not Loading After Deploy

**Problem:** Frontend loads but assets (JS, CSS) return 404.

**Solution:** Ensure your Vite build output goes to the directory your Express server serves:
```typescript
// vite.config.ts
build: {
  outDir: "../../artifacts/api-server/dist/public",
}
```
And Express serves it:
```typescript
app.use(express.static(path.join(__dirname, "public")));
```

---

## 11. Post-Deployment Checklist

- [ ] App starts without errors in DO Runtime Logs
- [ ] Database connected (check health endpoint)
- [ ] Login/auth flow works end-to-end
- [ ] File upload works (Spaces connected)
- [ ] File download works (CORS configured)
- [ ] Public URLs work (certificates viewable without auth)
- [ ] SMS sending works (API keys configured)
- [ ] CSV export works
- [ ] Mobile browsers work (PDF viewing)
- [ ] Custom domain has SSL certificate active
- [ ] Environment variables all set (no undefined errors)
- [ ] Session persists across page refreshes
- [ ] Auto-deploy triggers on GitHub push

---

## 12. Custom Domain Setup

1. In DO App Settings → Domains → Add Domain
2. Add your domain (e.g., `certgen.tanaqolapp.com`)
3. DO provides a CNAME record — add it to your DNS provider
4. Wait for SSL certificate to auto-provision (can take 10-30 minutes)
5. Verify HTTPS works

---

## Quick Reference: Full Environment Variable List

```env
# Database (auto-injected by DO if attached, but fix SSL — see section 9)
DATABASE_URL=postgresql://user:pass@host:25060/defaultdb

# App
NODE_ENV=production
SESSION_SECRET=<64-char-random-hex>
PORT=8080

# Object Storage (DO Spaces)
SPACES_ENDPOINT=nyc3.digitaloceanspaces.com
SPACES_BUCKET=your-bucket-name
SPACES_KEY=your-access-key
SPACES_SECRET=your-secret-key
SPACES_REGION=nyc3

# SMS Gateway (GoInfinito example)
SMS_CLIENT_ID=your-client-id
SMS_PASSWORD=your-password
SMS_SENDER_ID=your-sender-id

# Any other API keys your app needs
```

---

## Summary of Key Lessons

1. **SSL is the #1 blocker** — always strip `sslmode` and set `rejectUnauthorized: false`
2. **Use `CREATE TABLE IF NOT EXISTS` as a startup safety net** — don't rely solely on Drizzle push
3. **Public routes must be registered before auth middleware**
4. **Replit Object Storage ≠ DO Spaces** — abstract your storage layer
5. **Set `SESSION_SECRET` as a permanent env var** — or sessions break on each deploy
6. **Single instance avoids in-memory state issues** — or use a database/Redis for shared state
7. **Always refresh the GitHub token before pushing** — it can expire
8. **Check Runtime Logs, not just Build Logs** — most failures happen at startup, not build time
9. **CORS on Spaces is required** — browser downloads won't work without it
10. **Mobile PDF viewing needs pdfjs-dist** — iframes don't work on Samsung/iOS
