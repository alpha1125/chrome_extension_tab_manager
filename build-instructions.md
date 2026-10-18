# Build & Release Instructions

How to build, test, and release **FirstFire - Window Merger** to the Chrome Web Store.

## Prerequisites

- **Node.js 18+** — runs the tests and the build script (reads `manifest.json`)
- **zip** — preinstalled on macOS/Linux
- **git** — tags drive the release workflow

## Load unpacked (local development)

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this repository folder

## Run tests

```bash
node --test test/
```

Tests run in a sandboxed `vm` with a mocked `chrome` API — no browser needed.

## Build the store package

```bash
./scripts/build-package.sh
```

Output: `dist/firstfire-window-merger-<version>.zip`

- The version and icon list are read **from `manifest.json`**, so the package can never drift from the manifest.
- The zip contains only runtime files: `manifest.json`, `background.js`, `LICENSE`, `images/*.png`.
  Tests, screenshots, repo tooling, and macOS junk are never packaged.
- Preflight checks run automatically: version format, description length (CWS limit: 132 chars),
  icon files exist, and a warning if the git tag already exists.
- The script prints the zip contents and SHA-256 for verification.

**Never zip the folder by hand** — the old `archive.zip` in the repo root is stale (v0.1.2-era)
and broken (missing icons). It is kept for history only.

## Release process

1. Bump `version` in `manifest.json` (must be higher than what is live on the store).
2. Add an entry to `Change.log`.
3. Commit the changes.
4. Run tests and (optionally) a local build to sanity-check:
   ```bash
   node --test test/ && ./scripts/build-package.sh
   ```
5. Tag and push — CI takes over:
   ```bash
   git tag v<version>
   git push origin v<version>
   ```
6. The **Release** workflow (`.github/workflows/release.yml`) will:
   - run the tests,
   - verify the tag matches the `manifest.json` version (fails otherwise),
   - build the package,
   - create a GitHub Release with the zip attached.
7. Download the zip from the GitHub Release (or `dist/`) and upload it via the
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/):
   - **Package** → upload the zip → confirm the detected version.
   - **Listing** → update "What's changed" from the Change.log entry.
   - **Store screenshots** → upload separately in the dashboard (see below). Screenshots do
     **not** go in the zip.
   - **Submit for review** — updates typically clear in a few hours to 2 days.

## Store screenshot requirements

- Dimensions: **1280×800** or **640×400** only.
- Format: PNG or JPEG (format does not matter, dimensions do).
- In this repo, `Screenshot diagram.png` (1280×800) is valid; `Screenshot diagram.jpg`
  (1280×600) is not — wrong height, it will be rejected.

## CI/CD notes

- Triggered only by tags matching `v*`.
- Works on free GitHub plans: Actions is unlimited on public repos (2,000 min/month on
  private repos); release assets are free.
- The workflow does **not** publish to the Chrome Web Store — that last step is manual
  in the dashboard. Automating it is possible via the
  [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api).

## Known limitations

- Firefox is not supported (no `chrome.tabGroups` API). Works on all Chromium-based browsers.
