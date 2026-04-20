# ODrive Workshop Site

Astro static site that publishes the workshop lessons from [ODrive-Custom](https://github.com/thomasiverson/ODrive-Custom) to GitHub Pages.

## Architecture

```
thomasiverson/ODrive-Custom        (fork — syncs with upstream)
├── lessons/                        ← source of truth for content
└── .github/workflows/
    └── trigger-site-rebuild.yml    ← auto-triggers site rebuild on lesson changes

thomasiverson/odrive-workshop-site  (this repo — Astro site)
├── scripts/sync-content.mjs       ← copies lessons at build time
├── src/                            ← Astro layouts, pages, content config
└── .github/workflows/
    └── deploy.yml                  ← builds and deploys to GitHub Pages
```

## Local Development

### Prerequisites

- Node.js 18+
- Both repos cloned side by side:

```
repos/
├── ODrive-Custom/
└── odrive-workshop-site/
```

### First-Time Setup

```powershell
cd odrive-workshop-site
npm install
```

### Sync Content and Run Dev Server

```powershell
npm run sync          # copies lessons from ../ODrive-Custom
npx astro dev         # starts dev server at http://localhost:4321
```

Open <http://localhost:4321/odrive-workshop-site/> in your browser.

### Build Locally

```powershell
npm run build:local   # syncs from local ODrive-Custom + builds
npx astro preview     # preview the built site
```

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run sync` | Copy lessons from local `../ODrive-Custom` into Astro content directory |
| `npm run sync:remote` | Clone lessons from GitHub repo (used in CI) |
| `npm run dev` | Start Astro dev server (run `sync` first) |
| `npm run build` | CI build: sync from GitHub + Astro build |
| `npm run build:local` | Local build: sync from local path + Astro build |
| `npm run preview` | Preview the built `dist/` folder |

## Deployment to GitHub Pages

### Step 1: Push This Repo

```powershell
git add .
git commit -m "Initial Astro site for workshop lessons"
git push -u origin main
```

### Step 2: Enable GitHub Pages

1. Go to <https://github.com/thomasiverson/odrive-workshop-site/settings/pages>
2. Under **Source**, select **GitHub Actions**

The workflow at `.github/workflows/deploy.yml` triggers on every push to `main` and deploys automatically.

**Live URL**: <https://thomasiverson.github.io/odrive-workshop-site/>

### Step 3: Auto-Rebuild When Lessons Change (Cross-Repo Trigger)

A workflow in ODrive-Custom (`.github/workflows/trigger-site-rebuild.yml`) sends a `repository_dispatch` event to this repo whenever `lessons/**` changes on the main branch.

**To set this up:**

1. Create a fine-grained personal access token:
   - Go to <https://github.com/settings/tokens?type=beta>
   - **Name**: `site-deploy-trigger`
   - **Repository access**: Select `odrive-workshop-site` only
   - **Permissions**: Contents → Read, Actions → Write
2. Add the token as a secret in ODrive-Custom:
   - Go to <https://github.com/thomasiverson/ODrive-Custom/settings/secrets/actions>
   - **Name**: `SITE_DEPLOY_TOKEN`
   - **Value**: the token from step 1

### Manual Rebuild

You can trigger a rebuild anytime from the GitHub Actions tab:

1. Go to <https://github.com/thomasiverson/odrive-workshop-site/actions>
2. Select **Deploy to GitHub Pages**
3. Click **Run workflow**

## Full Sync Flow

```
Sync fork (GitHub UI or git pull upstream)
    ↓
ODrive-Custom/lessons/** changes land on main
    ↓
trigger-site-rebuild.yml fires → sends repository_dispatch
    ↓
odrive-workshop-site deploy.yml runs:
  1. Clones ODrive-Custom (shallow, lessons/ only)
  2. Runs sync-content.mjs (injects frontmatter, rewrites images)
  3. Builds Astro
  4. Deploys to GitHub Pages
    ↓
Live at thomasiverson.github.io/odrive-workshop-site/
```

## How the Content Sync Works

The `scripts/sync-content.mjs` script:

1. Copies all `lessons/**/*.md` files into `src/content/lessons/`
2. Copies `lessons/**/images/` into `public/images/lessons/`
3. Auto-generates YAML frontmatter (title, order, type, slug) from folder names and first H1
4. Rewrites relative image paths (`images/foo.png` → `/odrive-workshop-site/images/lessons/<slug>/foo.png`)
5. Replaces broken image references with text placeholders

Content in `src/content/lessons/` and `public/images/lessons/` is gitignored — it's regenerated on every sync.

## Multi-Root Workspace

Open `ODrive-Custom/odrive-workshop.code-workspace` in VS Code to work on both repos side by side:

```powershell
code ODrive-Custom/odrive-workshop.code-workspace
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `npm run sync` fails with "lessons/ not found" | Make sure `ODrive-Custom` is cloned next to this repo |
| Dev server shows empty cards | Run `npm run sync` before `npx astro dev` |
| Images not loading | Run sync again — images are copied to `public/images/lessons/` |
| GitHub Pages 404 | Verify Pages source is set to **GitHub Actions** in repo settings |
| Cross-repo trigger not firing | Check `SITE_DEPLOY_TOKEN` secret exists in ODrive-Custom with correct permissions |
| Build fails with ImageNotFound | A lesson references a missing image — sync script should replace it with a placeholder automatically |
