# SOP — Remove Replit Branding (and Add a Branding Gate) Before DigitalOcean Deploy

> **Goal.** When a Replit-built app is published to DigitalOcean (or any non-Replit host), the production bundle must contain **zero** Replit references — no dev banner, no error-overlay scripts, no `replit.dev` URLs in HTML, no Replit plugin output in JS chunks. This SOP makes that a build-time hard failure rather than a manual checklist item.
>
> **Audience.** A Replit agent picking up a project that was created on Replit and is now being moved to DigitalOcean App Platform. Apply this once per project.
>
> **Outcome.** A failing build (`exit 1`) the moment any Replit string sneaks into `dist/`. No more "we shipped the dev banner to production" surprises.
>
> **Time to apply.** ~15 minutes on a typical Vite + Express stack.

---

## 0. Background — why this is needed

Replit's developer ergonomics rely on three Vite plugins that inject scripts into the served HTML during development:

| Plugin | What it injects |
|---|---|
| `@replit/vite-plugin-dev-banner` | A floating "Open in Replit" banner. |
| `@replit/vite-plugin-runtime-error-modal` | An overlay that shows runtime errors during development. |
| `@replit/vite-plugin-cartographer` | A code-mapping helper used by Replit's editor. |

Each one references `replit.dev` or loads a script from a Replit-hosted URL. If they leak into the production bundle, **end users on your custom domain will see Replit branding** and your prod HTML will fetch resources from `replit.dev` (which is a privacy / supply-chain footgun and an obvious "this is not really our product" signal).

The standard guard against this is two-layered:

1. **Conditional plugin loading** in `vite.config.ts` so the plugins are only registered in development.
2. **A post-build branding check** that greps the built bundle for the literal string `replit` and fails the build if found.

Both layers are needed. Layer 1 prevents the leak; Layer 2 ensures the leak stays prevented as the project evolves.

---

## 1. Pre-flight — what to check before changing anything

Run these in the project root and copy the outputs into your scratchpad:

```bash
# 1.1 — Find every spot Replit branding/plugins are referenced in source
rg -n -i "replit" --glob '!node_modules' --glob '!.cache' --glob '!.git' \
  --glob '!.local' --glob '!*.lock' --glob '!package-lock.json'

# 1.2 — Find what's actually in package.json
grep -n "replit" package.json

# 1.3 — Confirm the build output directory (varies by stack)
grep -n "outDir\|outfile\|dist" vite.config.* esbuild.* script/*.ts 2>/dev/null
```

You're looking for three categories of hits:

| Category | Example | Action |
|---|---|---|
| **Dev-only Vite plugins** | `@replit/vite-plugin-dev-banner`, `vite-plugin-runtime-error-modal`, `vite-plugin-cartographer` | Gate behind `NODE_ENV !== "production"` (Step 2). Keep them — they help in dev. |
| **Replit SDKs you actively use** | `@replit/connectors-sdk` (used for integrations), `@replit/object-storage` | **Keep these only if the project really uses them in prod.** If yes, the branding check will need a narrow allowlist (Step 4.3). If no, uninstall them. |
| **`.replit` config, `replit.md`, `.local/`** | Project metadata, agent instructions | **Do not delete.** These are Replit-tooling files; they are never bundled into `dist/`. The branding check ignores them by design. |

---

## 2. Gate the dev-only Vite plugins behind `NODE_ENV`

Open `vite.config.ts` (or `.js`). The conditional pattern is:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const isDev =
  process.env.NODE_ENV !== "production" &&
  process.env.REPL_ID !== undefined;
//  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//  REPL_ID is set inside the Replit container.
//  Outside Replit (DO build runners, local dev on a laptop)
//  this is undefined, so the plugins are not loaded at all.

export default defineConfig({
  plugins: [
    react(),
    // ... your other always-on plugins ...
    ...(isDev
      ? [
          await import("@replit/vite-plugin-runtime-error-modal").then((m) =>
            m.default(),
          ),
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  // ... rest of config ...
});
```

Two non-obvious requirements:

- **Use dynamic `await import(...)` inside the conditional.** A static `import` at the top of the file would still be statically analyzed by Vite/Rollup and the package bytes would be pulled into the bundle even if you never call them.
- **Keep these packages in `dependencies` (not `devDependencies`).** DO App Platform prunes `devDependencies` before running the build command. If the dev plugins are in `devDependencies`, the prod build won't fail (since `isDev` is false), but `npm install` on Replit will not install them either. Counter-intuitive but easier to leave them in `dependencies` so the `await import(...)` resolves on Replit dev.

**Verify Step 2 worked:**

```bash
NODE_ENV=production npm run build
# then inspect:
grep -ri "replit" dist/public/*.html dist/public/assets/*.js | head
# Expected: no output, OR only matches inside source-map URLs (those will be caught/cleaned in Step 5).
```

---

## 3. Update `client/index.html`

The HTML shell often contains generic Replit placeholders set by templates. Open `client/index.html` and check:

```html
<!-- Open Graph / Twitter Card meta tags -->
<meta property="og:title"       content="Your real app name" />
<meta property="og:description" content="One-line description of your app" />
<meta name="twitter:title"       content="Your real app name" />
<meta name="twitter:description" content="One-line description of your app" />
<!-- Keep og:image and twitter:image as-is unless you also re-host the image. -->
<!-- Keep twitter:site default if present (typically "@replit") UNLESS the user owns a different handle. -->
```

Also check for and remove any of these stale fragments if present:

| Stale fragment | Replace with |
|---|---|
| `<title>Replit</title>` or `<title>Vite + React + TS</title>` | `<title>Your App Name</title>` |
| `<meta name="generator" content="Replit">` | Delete the line. |
| Comments referencing `replit.dev` | Delete. |
| `<script>` tags loading from `replit.com` / `replit.dev` | Delete (these are usually injected by the dev plugins; once Step 2 is in place, they should already be gone). |

> **Rule of thumb.** The HTML shell is what end users see in **View Source**. Treat it as a public document.

---

## 4. Add the post-build branding gate

This is the second line of defence. Even if a future change re-introduces a Replit reference, the build will fail before the artifact ships.

### 4.1 Create `scripts/check-branding.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

DIST_DIR="dist/public"
#         ^^^^^^^^^^^
# Adjust to whatever your Vite/build output directory is.
# Common alternatives: dist/, build/, .next/, public/build/

if [ ! -d "$DIST_DIR" ]; then
  echo "ERROR: $DIST_DIR directory not found"
  exit 1
fi

MATCHES=$(grep -ri "replit" "$DIST_DIR" \
  --include="*.html" \
  --include="*.js" \
  --include="*.css" \
  --include="*.json" \
  -l 2>/dev/null || true)

if [ -n "$MATCHES" ]; then
  echo "ERROR: Found 'replit' references in production build:"
  echo "$MATCHES"
  echo ""
  grep -ri "replit" "$DIST_DIR" \
    --include="*.html" --include="*.js" --include="*.css" --include="*.json" \
    -n 2>/dev/null || true
  exit 1
fi

echo "Branding check passed: no 'replit' references found in $DIST_DIR"
```

Make it executable:

```bash
chmod +x scripts/check-branding.sh
```

### 4.2 Wire it into the build pipeline

If you have a single-script build (the common case), edit `package.json`:

```json
{
  "scripts": {
    "build": "vite build && bash scripts/check-branding.sh"
  }
}
```

If your project uses a custom build orchestrator (e.g. `script/build.ts` or `build.js`), append the check at the end of the success path:

```ts
import { execSync } from "child_process";

// ... existing build steps ...

console.log("running branding check...");
execSync("bash scripts/check-branding.sh", { stdio: "inherit" });
```

The check **must** run as the last step of `npm run build`. If it lives in a separate `npm run lint:branding` script that nobody calls, it is decorative.

### 4.3 (Only if needed) narrowly allowlist a real production dependency

If your project legitimately uses a Replit SDK in production (`@replit/connectors-sdk`, `@replit/object-storage`, etc.), the bundled output **will** contain the literal string `replit` (in the package's own code, comments, or sourcemap URLs). You have three options, in order of preference:

1. **Best:** Don't bundle it. Mark it as an external in your bundler config and `npm install` it on the production host. Then the branding check sees no `replit` strings in `dist/`.
2. **Second-best:** Strip comments and sourcemap URLs from your minified output. Vite's default `esbuild` minifier already drops comments; explicitly disable `sourcemap: true` for prod builds, or set `sourcemap: 'hidden'` and don't ship the `.map` files.
3. **Last resort:** Add a narrow allowlist to `check-branding.sh`. Replace the `MATCHES=...` line with:
   ```bash
   MATCHES=$(grep -ri "replit" "$DIST_DIR" \
     --include="*.html" --include="*.js" --include="*.css" --include="*.json" \
     -l 2>/dev/null \
     | grep -v "vendor-replit-connectors-[a-z0-9]*\.js$" \
     || true)
   ```
   Document **why** each allowlisted file is allowed, in a comment above the `grep -v` line. The allowlist is a maintenance liability — every entry is a place a real branding leak could hide.

> **Strong preference for option 1.** A production bundle that does not need to bundle a Replit SDK is a production bundle that cannot regress.

---

## 5. Strip sourcemap URLs from production HTML/JS (optional but recommended)

Vite by default writes `//# sourceMappingURL=...map` comments at the bottom of every emitted JS file. If your sourcemaps are uploaded to Replit (some IDE integrations do this) those URLs will contain `replit.dev` — and the branding check will fire.

Either:

- Disable sourcemaps in production:
  ```ts
  // vite.config.ts
  export default defineConfig({
    // ...
    build: {
      outDir: "dist/public",
      emptyOutDir: true,
      sourcemap: false,   // <-- explicit
    },
  });
  ```
- Or hide them (keeps the .map files for your own debugging without referencing them in the served JS):
  ```ts
  build: { sourcemap: "hidden" },
  ```

Both options remove the trailing `//# sourceMappingURL=` comment from the served JS, which is the most common cause of false-positive branding-check failures.

---

## 6. Verify end-to-end before pushing

Mirror the DO build environment locally:

```bash
# 6.1 — Mirror DO's "prune devDependencies before build" behaviour.
rm -rf node_modules dist
npm ci --omit=dev   # if your DO build command also does this; many do not.
npm install         # if DO uses plain `npm install` (most common).

# 6.2 — Build with NODE_ENV=production exactly like DO does.
NODE_ENV=production npm run build

# 6.3 — Confirm the branding check ran AND passed.
# Expected last line of output:
#   Branding check passed: no 'replit' references found in dist/public

# 6.4 — Belt-and-braces: search yourself.
grep -ri "replit" dist/public/ | head
# Expected: no output.

# 6.5 — Spot-check the HTML shell.
grep -i "replit\|generator" dist/public/index.html
# Expected: no output.
```

If 6.4 finds anything, **do not push**. Trace it back to source:

- A line in `index.html`? You missed Step 3.
- A chunk in `assets/*.js`? A dev plugin slipped through Step 2 — re-check the `isDev` gate.
- A `//# sourceMappingURL=*.replit.dev/...` line? Apply Step 5.
- A bundled SDK file (`vendor-replit-*.js`)? Apply Step 4.3 option 1, 2, or 3.

---

## 7. Wire the gate into the DO build command

In the DO App Platform UI, the build command is whatever you configure. The standard for this stack is:

```
npm install && npm run build && npm run db:push
```

Because Step 4.2 wired the branding check into `npm run build`, no DO-side change is needed. The check runs on every deploy automatically. **A failing branding check fails the deploy** — which is exactly what you want; the alternative is shipping the leak.

If your DO build command splits these (e.g. you have `npm run build:client` and `npm run build:server`), add the branding check explicitly after the client build:

```
npm install && npm run build:client && bash scripts/check-branding.sh && npm run build:server && npm run db:push
```

---

## 8. Things to leave alone

These contain `replit` references but are **safe**, **never bundled into `dist/`**, and should not be deleted:

| File / dir | Why keep it |
|---|---|
| `.replit` | Replit's run-config. Ignored outside Replit. |
| `.local/` | Replit-agent skills, plans, and metadata. Ignored by Vite. |
| `replit.md` | Project memory file used by the Replit agent. Markdown, never bundled. |
| `package.json` (the `@replit/*` entries) | Step 2 already gates them out of the prod bundle; uninstalling them breaks Replit dev productivity. |
| `attached_assets/` | Replit's asset capture; never bundled into `dist/` by default. |

The branding check **only** scans `dist/<output>/` — it deliberately does not touch the source tree. So leaving these in place is fine.

---

## 9. Per-project variations to watch for

| Stack quirk | What to change |
|---|---|
| **Next.js** instead of Vite | Output is `.next/` and `out/` (after `next export`). Update `DIST_DIR` and `--include` patterns in the script accordingly. The dev plugins live as Webpack plugins, not Vite plugins; same `isDev` gating principle, different config file. |
| **Express serving the SPA from `server/index.ts`** | The branding check still passes because `dist/public/` is the static-file root. Just confirm `server/` is **not** part of the scanned tree (it shouldn't be — the check scans `dist/<output>/`, not `server/`). |
| **Custom backend bundler (esbuild → `dist/index.cjs`)** | The check **does not** scan the server bundle by default. If your server code prints "Built with Replit" to logs (rare but it happens), add a separate scan for `dist/index.cjs`. |
| **Monorepo with multiple `dist/` outputs** | Loop in the script:<br>`for d in apps/*/dist; do ... done` |
| **`pnpm` / `bun` / `yarn`** | Replace `npm run` with the package manager's equivalent in Step 4.2. The shell script itself is package-manager agnostic. |
| **CI/CD beyond DO (GitHub Actions, etc.)** | The branding check works there too — it's just a shell script. Add a CI step that runs `npm run build` and fails the workflow on a non-zero exit. |

---

## 10. One-paragraph rationale to paste into the project's `replit.md`

> **Branding gate.** Production builds must contain zero `replit` references. Three Replit dev-only Vite plugins (`vite-plugin-dev-banner`, `vite-plugin-runtime-error-modal`, `vite-plugin-cartographer`) are gated behind `isDev` in `vite.config.ts` so they never ship to prod. After the build, `scripts/check-branding.sh` greps `dist/public/` for the literal string `replit` and fails the build if found. This runs as the last step of `npm run build`, so any DO deploy that would have leaked Replit branding is failed before the artifact is uploaded. To extend: don't loosen the grep — narrowly allowlist specific filenames if a real Replit-production-SDK is bundled, and document why in a comment.

---

## 11. Acceptance checklist

Apply this SOP, then verify each item:

- [ ] `vite.config.ts` (or equivalent) gates all `@replit/*` Vite plugins behind a dev-only `isDev` check using **dynamic `await import(...)`**.
- [ ] `client/index.html` contains the project's real `<title>`, OG, and Twitter meta tags — no Replit defaults.
- [ ] `scripts/check-branding.sh` exists, is executable (`chmod +x`), and points at the correct `DIST_DIR`.
- [ ] `npm run build` invokes the branding check as its last step.
- [ ] `NODE_ENV=production npm run build` finishes with `Branding check passed: ...`.
- [ ] `grep -ri "replit" dist/public/` returns zero results.
- [ ] DO App Platform build command runs `npm run build` (so the gate runs on every deploy).
- [ ] First post-deploy verification: visit the production URL, View Source, search for "replit" — zero hits.
- [ ] Optional: documented the gate in `replit.md` (Step 10).

When every box is ticked, the project is safe to publish to DigitalOcean (or any non-Replit host) without leaking Replit branding to end users.

— end of SOP —
