# IMF 2026 — Cloudflare Setup & Deployment Guide

> **Internal Medicine Festival 2026**
> Organized by DMC IMIG • ACP Bangladesh Chapter • Bangladesh Society of Medicine (BSM)

---

## 1. Prerequisites

- **Node.js**: v18 or later
- **Cloudflare Account**: [dash.cloudflare.com](https://dash.cloudflare.com/)
- **Wrangler CLI**: Installed with dependencies or via `npx wrangler`

---

## 2. D1 Database Setup

### Step 2.1: Create the D1 Database
Run the following command in your terminal:
```bash
npx wrangler d1 create imf-db
```

This output will give you your `database_id`, for example:
```toml
[[d1_databases]]
binding = "DB"
database_name = "imf-db"
database_id = "xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### Step 2.2: Update `wrangler.toml`
Open `wrangler.toml` and replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with the database ID returned in step 2.1.

### Step 2.3: Apply the Database Schema
Execute the schema to create the `registrations` and `abstracts` tables:

**For Remote (Production):**
```bash
npx wrangler d1 execute imf-db --file=./schema.sql
```

**For Local Development:**
```bash
npx wrangler d1 execute imf-db --local --file=./schema.sql
```

---

## 3. R2 Storage Bucket Setup

### Step 3.1: Create the R2 Bucket
```bash
npx wrangler r2 bucket create imf-abstracts
```

### Step 3.2: Configure CORS for Direct Browser Uploads
If you choose to use direct presigned S3 uploads, create a `cors.json` file:
```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
Apply CORS to your bucket:
```bash
npx wrangler r2 bucket cors set imf-abstracts --file=./cors.json
```

---

## 4. Environment Secrets Configuration

Set the administrative password and credentials using Wrangler:

```bash
# Required: Admin portal authentication password
npx wrangler secret put ADMIN_PASSWORD

# Optional (for S3 Presigned Direct Uploads to R2):
npx wrangler secret put CF_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
```

> **Note**: If `CF_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` are omitted, the backend automatically uses the direct Cloudflare Workers R2 binding (`/api/upload-direct`), ensuring zero-config file uploads!

---

## 5. Local Development

### Install Dependencies
```bash
npm install
```

### Run Frontend Dev Server (Vite)
```bash
npm run dev
```

### Run Full-Stack Local Server (with D1 & R2 emulation)
```bash
npm run build
npx wrangler pages dev dist --d1=DB=imf-db --r2=ABSTRACTS_BUCKET=imf-abstracts
```

---

## 6. Cloudflare Pages Deployment

### Option A: Cloudflare Dashboard Git Integration (Recommended)
1. Push this repository to GitHub: `https://github.com/aliffarzanzim/imf2026.git`
2. In Cloudflare Dashboard, navigate to **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
3. Select repo `imf2026`.
4. Configure build settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. In **Settings** → **Functions** → **D1 database bindings**:
   - Variable name: `DB`
   - Database: `imf-db`
6. In **Settings** → **Functions** → **R2 bucket bindings**:
   - Variable name: `ABSTRACTS_BUCKET`
   - Bucket: `imf-abstracts`
7. In **Settings** → **Environment variables**:
   - Add `ADMIN_PASSWORD` (encrypt as secret)

### Option B: Deploy via Wrangler CLI
```bash
npm run build
npx wrangler pages deploy dist --project-name=imf2026
```

---

## 7. Security Best Practices

- Never commit real passwords, API keys, or database IDs to public repositories.
- The `.gitignore` file is pre-configured to prevent accidental leakage of local environment files and wrangler state.
