# How to release a new version of DM Forge

## 1. Bump the version
In `package.json`, update the version number:
```json
"version": "0.1.1"
```
Use semantic versioning: `MAJOR.MINOR.PATCH`
- **PATCH** (0.1.0 → 0.1.1) — bug fixes
- **MINOR** (0.1.0 → 0.2.0) — new features
- **MAJOR** (0.1.0 → 1.0.0) — breaking changes

## 2. Build
Open terminal **as Administrator**, then run:
```bash
npm run package
```
Output lands in the `dist/` folder.

## 3. Publish on GitHub
1. Go to https://github.com/Yuzper/dm-forge/releases/new
2. Tag: `v0.1.1` — must match `package.json` version exactly, with a `v` prefix
3. Title: `v0.1.1`
4. Upload these 3 files from `dist/`:
   - `DM Forge Setup X.X.X.exe`
   - `DM Forge Setup X.X.X.exe.blockmap`
   - `latest.yml`
5. Click **Publish release**

## Done
Any running copy of the app will detect the new release within 4 hours and show the update banner automatically.