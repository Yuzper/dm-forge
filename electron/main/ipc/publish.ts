// path: electron/main/ipc/publish.ts
// Publish pipeline for the player-facing site. Produces a static bundle: per
// player, an ENCRYPTED projection of only the entities they may see, plus the
// referenced images. Encryption is PBKDF2-SHA256 → AES-256-GCM so the browser
// viewer can decrypt with WebCrypto using the player's password.
//
// Pure projection/crypto logic lives in publishCore.ts (unit-testable, and
// driven directly by `publish:preview` so preview-as-player renders exactly what
// publish would write). This file is the electron shell: dialog, DB reads, grant
// resolution, file writes.
//
// Handled: DM-only inline marks AND DM-only blocks, per-track/subtrack
// visibility, link scrubbing, mark whitelisting, always-strip fields, world map
// + POI + shape export with their own grants. Not yet: fog of war.
import { app, dialog, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'
import { db } from '../db'
import { getMainWindow } from '../window'
import { copyFilesWithSkip, copyDirContentsAsync } from '../helpers'
import {
  buildPlayerBundle, encryptBundle, bundleFileName, PBKDF2_ITERATIONS,
  type WorldMapInput, type VisibleSets,
} from './publishCore'

// ── Grant resolution ──────────────────────────────────────────────────────────

interface GrantIndex {
  party: Record<string, Set<number>>
  perPlayer: Map<number, Record<string, Set<number>>>
}

const emptyByType = (): Record<string, Set<number>> => ({
  article: new Set(), map: new Set(), poi: new Set(), shape: new Set(),
  layer: new Set(), shape_layer: new Set(),
})

function loadGrants(campaignId: number, playerIds: number[]): GrantIndex {
  const rows = db.prepare(
    'SELECT entity_type, entity_id, player_id FROM visibility_grants WHERE campaign_id = ?'
  ).all(campaignId) as { entity_type: string; entity_id: number; player_id: number | null }[]

  const party = emptyByType()
  const perPlayer = new Map<number, Record<string, Set<number>>>()
  for (const id of playerIds) perPlayer.set(id, emptyByType())

  for (const g of rows) {
    const bucket = g.player_id === null ? party : perPlayer.get(g.player_id)
    // An unknown entity_type is a row from a newer schema (or a hand-edited DB).
    // Skipping it is the safe direction: unknown means hidden.
    bucket?.[g.entity_type]?.add(g.entity_id)
  }
  return { party, perPlayer }
}

function visibleSetsFor(player: any, grants: GrantIndex, articleIds: Set<number>): VisibleSets {
  const mine = grants.perPlayer.get(player.id) ?? emptyByType()
  const union = (type: string) => new Set<number>([...grants.party[type], ...mine[type]])
  const sets: VisibleSets = {
    articles: union('article'),
    maps: union('map'),
    pois: union('poi'),
    shapes: union('shape'),
    // POI visit-layers and shape drawing-layers live in different tables with
    // overlapping ids, so they are granted under separate entity types.
    layers: union('layer'),
  }
  // A player always sees their own character sheet.
  if (player.pc_article_id && articleIds.has(player.pc_article_id)) sets.articles.add(player.pc_article_id)
  return sets
}

// Layers are gated differently on purpose, and the asymmetry is deliberate:
//
//   POI visit-layers are a record of what happened at a place on one visit —
//   possibly a visit this player's character wasn't at. They have never been
//   published, so they stay opt-in: no grant, no export.
//
//   Shape drawing-layers are cartography the DM was already publishing (the old
//   code shipped them whenever the layer was switched on in the DM's own view).
//   Making them opt-in would silently unpublish every border on a named layer,
//   so an ungranted drawing-layer simply doesn't vote and the per-shape audience
//   or its linked article decides. Grant one and it starts gating.
function shapeLayersFor(player: any, grants: GrantIndex): Set<number> {
  const mine = grants.perPlayer.get(player.id) ?? emptyByType()
  return new Set<number>([...grants.party.shape_layer, ...mine.shape_layer])
}

// Drawing-layer ids that anyone has granted — the ones the DM has made a
// decision about, and therefore the only ones allowed to veto a shape.
function gatedShapeLayers(campaignId: number): Set<number> {
  const rows = db.prepare(
    `SELECT DISTINCT entity_id FROM visibility_grants WHERE campaign_id = ? AND entity_type = 'shape_layer'`
  ).all(campaignId) as { entity_id: number }[]
  return new Set(rows.map(r => r.entity_id))
}

function filterShapesByLayer(shapes: any[] | undefined, gated: Set<number>, allowed: Set<number>) {
  return (shapes ?? []).filter(s =>
    s.layer_id == null || !gated.has(s.layer_id) || allowed.has(s.layer_id))
}

// ── DB reads ──────────────────────────────────────────────────────────────────

// World maps = campaign-owned maps (the hub map). Base-layer POIs (layer_id
// NULL) plus every visit-layer POI; which layers a given player may see is
// decided per player in buildPlayerBundle, never here.
function loadWorldMaps(campaignId: number): WorldMapInput[] {
  const maps = db.prepare(
    `SELECT id, name, image_path FROM maps WHERE campaign_id = ? AND image_path != '' ORDER BY sort_order`
  ).all(campaignId) as any[]
  return maps.map(m => ({
    ...m,
    pois: db.prepare('SELECT * FROM pois WHERE map_id = ?').all(m.id) as any[],
    // Every shape travels to the projector, which filters by layer grant. This
    // deliberately no longer reads `map_shape_layers.visible`: that column is
    // "is this layer switched on in the DM's own view right now", and letting it
    // decide meant decluttering your screen silently unpublished a border.
    shapes: db.prepare('SELECT * FROM map_shapes WHERE map_id = ?').all(m.id) as any[],
  }))
}

// ── Output hygiene ────────────────────────────────────────────────────────────

// Delete files in `dir` that this publish did not produce. Without this, a
// renamed or deleted player leaves their old bundle sitting in data/ — still
// live, still decryptable with the password they already have, still holding
// whatever they could see the day it was written.
function pruneDir(dir: string, keep: Set<string>): number {
  if (!fs.existsSync(dir)) return 0
  let removed = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() || keep.has(entry.name)) continue
    try { fs.unlinkSync(path.join(dir, entry.name)); removed++ } catch { /* locked — leave it */ }
  }
  return removed
}

// ── Git ──────────────────────────────────────────────────────────────────────
// The published folder is expected to live INSIDE a repo the DM already keeps
// (alongside whatever else that repo serves), so every git operation here is
// scoped by pathspec to the output folder. The DM's own staged work and their
// landing page are never swept into our commit.
//
// Auth is deliberately not our problem: we shell out to the system git, which
// uses the platform credential helper. GIT_TERMINAL_PROMPT=0 means a missing
// credential fails fast with a message instead of hanging on a prompt nobody
// can see — an Electron main process has no terminal to answer it.
const execFileAsync = promisify(execFile)
const NL = /\r?\n/

async function git(args: string[], cwd: string, timeout = 60_000) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      timeout,
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() }
  } catch (err: any) {
    return {
      ok: false,
      stdout: (err?.stdout ?? '').toString().trim(),
      stderr: (err?.stderr ?? err?.message ?? '').toString().trim(),
    }
  }
}

// Refuse a repository ROOT as the output folder. The export owns everything
// under its folder — it clears assets/ and writes index.html — so pointing it at
// the root of a repo that also serves a landing page would quietly eat it.
function repoRootGuard(dir: string): string | null {
  if (fs.existsSync(path.join(dir, '.git'))) {
    return 'That is the root of a git repository. Pick (or create) a subfolder inside it '
      + 'instead — the export overwrites index.html and assets/ in whatever folder it owns.'
  }
  return null
}

// Absolute output folder for a campaign, or '' when none is configured yet.
function outDirFor(campaign: any): string {
  return campaign?.player_site_path || ''
}

// Everything the Push button needs to describe itself before it's pressed.
async function gitStatusFor(outDir: string) {
  if (!outDir || !fs.existsSync(outDir)) {
    return { inRepo: false, reason: 'The player site has not been published yet.' }
  }
  const top = await git(['rev-parse', '--show-toplevel'], outDir)
  if (!top.ok) {
    return { inRepo: false, reason: 'This folder is not inside a git repository.' }
  }
  const repoRoot = path.normalize(top.stdout)
  const branchRes = await git(['rev-parse', '--abbrev-ref', 'HEAD'], outDir)
  const branch = branchRes.ok ? branchRes.stdout : ''

  // The branch's own remote, not a hardcoded "origin" — this very repo calls
  // its remote "main", and assuming otherwise would just fail confusingly.
  let remote = (await git(['config', `branch.${branch}.remote`], outDir)).stdout
  if (!remote) remote = (await git(['remote'], outDir)).stdout.split(NL)[0]?.trim() ?? ''
  const remoteUrl = remote ? (await git(['remote', 'get-url', remote], outDir)).stdout : ''

  // Pathspec-scoped: only changes under the published folder count.
  const statusRes = await git(['status', '--porcelain', '--', outDir], outDir)
  const pendingChanges = statusRes.stdout ? statusRes.stdout.split(NL).filter(Boolean).length : 0

  // Unpushed commits. Fails when the branch has no upstream yet, which is not
  // an error — it just means the first push needs -u.
  const aheadRes = await git(['rev-list', '--count', '@{u}..HEAD'], outDir)
  const ahead = aheadRes.ok ? Number(aheadRes.stdout) || 0 : 0
  const hasUpstream = aheadRes.ok

  return {
    inRepo: true,
    repoRoot,
    branch,
    remote,
    remoteUrl,
    pendingChanges,
    ahead,
    hasUpstream,
    // Where the site will actually be served from, relative to the repo root.
    subPath: path.relative(repoRoot, outDir).split(path.sep).join('/'),
  }
}

export function registerPublishIPC() {
  // Preview-as-player: run the real projection for one player and hand the
  // bundle back unencrypted, writing nothing. Same code path as publish, so what
  // the DM previews is what the player gets — that equivalence is the feature.
  ipcMain.handle('publish:preview', (_e, campaignId: number, playerId: number) => {
    try {
      const player = db.prepare('SELECT * FROM players WHERE id = ? AND campaign_id = ?')
        .get(playerId, campaignId) as any
      if (!player) return { success: false, error: 'Player not found' }

      const players = db.prepare('SELECT id FROM players WHERE campaign_id = ?').all(campaignId) as any[]
      const articles = db.prepare('SELECT * FROM articles WHERE campaign_id = ?').all(campaignId) as any[]
      const articleIds = new Set<number>(articles.map(a => a.id))
      const grants = loadGrants(campaignId, players.map(p => p.id))

      const visible = visibleSetsFor(player, grants, articleIds)
      const worldMaps = loadWorldMaps(campaignId)
      const imageAbs = new Map<string, string>()
      const gated = gatedShapeLayers(campaignId)
      const allowed = shapeLayersFor(player, grants)
      const bundle = buildPlayerBundle(
        player, articles, visible, app.getPath('userData'), imageAbs,
        worldMaps.map(m => ({ ...m, shapes: filterShapesByLayer(m.shapes, gated, allowed) })),
      )
      return {
        success: true,
        bundle,
        // Absolute paths so the preview can render images straight off disk —
        // the published site rewrites these to relative images/ copies instead.
        imagePaths: Object.fromEntries(imageAbs),
        totals: { articles: articles.length, maps: worldMaps.length },
      }
    } catch (err: any) {
      log.error(`Player preview failed: ${err?.message ?? err}`)
      return { success: false, error: err?.message ?? String(err) }
    }
  })

  // Pick (or re-pick) the folder the campaign publishes into. Remembered on the
  // campaign so the usual publish is one click and always lands in the same
  // place — which is also what makes pruning stale bundles meaningful.
  ipcMain.handle('publish:choose-folder', async (_e, campaignId: number) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return { success: false, error: 'No window' }
    const dlg = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose the folder to publish the player site into',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (dlg.canceled || !dlg.filePaths.length) return { success: false, canceled: true }
    const picked = dlg.filePaths[0]
    const guard = repoRootGuard(picked)
    if (guard) return { success: false, error: guard }
    db.prepare('UPDATE campaigns SET player_site_path = ? WHERE id = ?').run(picked, campaignId)
    return { success: true, path: picked, git: await gitStatusFor(picked) }
  })

  ipcMain.handle('publish:git-status', async (_e, campaignId: number) => {
    const campaign = db.prepare('SELECT player_site_path FROM campaigns WHERE id = ?').get(campaignId) as any
    return gitStatusFor(outDirFor(campaign))
  })

  // Commit and push the published folder — and only it. Separate from publish on
  // purpose: writing files is local and reversible, making them public is not.
  ipcMain.handle('publish:git-push', async (_e, campaignId: number) => {
    const campaign = db.prepare('SELECT name, player_site_path FROM campaigns WHERE id = ?').get(campaignId) as any
    const outDir = outDirFor(campaign)
    const status = await gitStatusFor(outDir)
    if (!status.inRepo) return { success: false, error: status.reason }

    try {
      // Stage only our subtree, so new bundle files are picked up without
      // touching anything else the DM has in flight.
      const add = await git(['add', '--', outDir], outDir)
      if (!add.ok) return { success: false, error: add.stderr || 'git add failed.' }

      // Pathspec-limited commit: builds the commit from HEAD plus the working
      // tree of these paths only. Whatever the DM had staged elsewhere stays
      // staged and uncommitted — we never carry someone else's work along.
      let committed = false
      let sha = ''
      const re = await git(['status', '--porcelain', '--', outDir], outDir)
      if (re.stdout.trim()) {
        const msg = `Update player site: ${campaign.name}`
        const commit = await git(['commit', '-m', msg, '--', outDir], outDir)
        if (!commit.ok) return { success: false, error: commit.stderr || commit.stdout || 'git commit failed.' }
        committed = true
        sha = (await git(['rev-parse', '--short', 'HEAD'], outDir)).stdout
      }

      const after = await gitStatusFor(outDir)
      if (!after.inRepo) return { success: false, error: 'Lost track of the repository mid-push.' }
      if (!committed && after.ahead === 0) {
        return { success: true, committed: false, pushed: false, message: 'Already up to date.' }
      }

      const args = after.hasUpstream
        ? ['push']
        : ['push', '-u', after.remote || 'origin', after.branch]
      const push = await git(args, outDir)
      if (!push.ok) {
        return {
          success: false,
          committed,
          sha,
          error: push.stderr || 'git push failed.',
          // The commit is safely on disk either way, so say so — otherwise the
          // obvious next move looks like "publish again", which it is not.
          hint: /could not read|authentication|terminal prompts disabled|denied/i.test(push.stderr)
            ? 'Git could not authenticate without a prompt. Run a push from your terminal once to store credentials, then try again.'
            : undefined,
        }
      }
      return { success: true, committed, pushed: true, sha, branch: after.branch, remote: after.remote }
    } catch (err: any) {
      log.error(`Player site push failed: ${err?.message ?? err}`)
      return { success: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('publish:export', async (_e, campaignId: number) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return { success: false, error: 'No window' }

    const campaign = db.prepare('SELECT id, name, player_site_path FROM campaigns WHERE id = ?').get(campaignId) as any
    if (!campaign) return { success: false, error: 'Campaign not found' }

    const players = db.prepare('SELECT * FROM players WHERE campaign_id = ?').all(campaignId) as any[]
    if (players.length === 0) return { success: false, error: 'No players defined — add players first.' }

    // Refusing here rather than warning afterwards: the salt and iteration count
    // are public in site.json, so an empty password means a plaintext bundle.
    const noPassword = players.filter(p => !p.password)
    if (noPassword.length) {
      return {
        success: false,
        error: `Set a password for ${noPassword.map(p => `"${p.username}"`).join(', ')} before publishing — `
          + 'a bundle with no password is readable by anyone who finds the file.',
      }
    }

    let targetRoot: string = campaign.player_site_path || ''
    if (!targetRoot || !fs.existsSync(targetRoot)) {
      const dlg = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose where to write the player site',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (dlg.canceled || !dlg.filePaths.length) return { success: false, canceled: true }
      targetRoot = dlg.filePaths[0]
      db.prepare('UPDATE campaigns SET player_site_path = ? WHERE id = ?').run(targetRoot, campaignId)
    }

    try {
      const userDataPath = app.getPath('userData')
      // targetRoot IS the output folder. It is expected to be a subfolder of a
      // repo the DM keeps (see the git section), so the export owns everything
      // under it and nothing above it.
      const outDir = targetRoot
      const dataDir = path.join(outDir, 'data')
      const imagesOutDir = path.join(outDir, 'images')
      fs.mkdirSync(dataDir, { recursive: true })
      fs.mkdirSync(imagesOutDir, { recursive: true })

      const articles = db.prepare('SELECT * FROM articles WHERE campaign_id = ?').all(campaignId) as any[]
      const articleIds = new Set<number>(articles.map(a => a.id))
      const grants = loadGrants(campaignId, players.map(p => p.id))
      const worldMaps = loadWorldMaps(campaignId)

      const imageAbs = new Map<string, string>()
      const warnings: string[] = []
      const bundleFiles = new Set<string>()
      let totalArticles = 0

      const gated = gatedShapeLayers(campaignId)

      for (const player of players) {
        const visible = visibleSetsFor(player, grants, articleIds)
        const allowed = shapeLayersFor(player, grants)
        const bundle = buildPlayerBundle(
          player, articles, visible, userDataPath, imageAbs,
          worldMaps.map(m => ({ ...m, shapes: filterShapesByLayer(m.shapes, gated, allowed) })),
        )
        totalArticles += bundle.articles.length
        if (bundle.articles.length === 0) {
          warnings.push(`"${player.username}" can see nothing yet — share a page with them or the party.`)
        }

        const enc = encryptBundle(JSON.stringify(bundle), player.password)
        const name = bundleFileName(player.username)
        bundleFiles.add(name)
        fs.writeFileSync(path.join(dataDir, name), JSON.stringify(enc))
      }

      // Copy the union of referenced images once (only images from visible pages).
      const jobs = [...imageAbs.entries()].map(([base, src]) => ({ src, dst: path.join(imagesOutDir, base) }))
      const copyRes = await copyFilesWithSkip(jobs)
      if (copyRes.failed.length) warnings.push(`${copyRes.failed.length} image(s) failed to copy.`)

      // Drop anything left over from an earlier publish: bundles for renamed or
      // deleted players, images no longer referenced by any visible page.
      const staleBundles = pruneDir(dataDir, bundleFiles)
      const staleImages = pruneDir(imagesOutDir, new Set(imageAbs.keys()))

      // Copy the bundled read-only viewer (index.html + assets) so the folder is
      // a complete, hostable site. Packaged: an extraResource; dev: dist-viewer
      // built by `npm run build:viewer`. The assets folder is cleared first —
      // vite emits content-hashed filenames, so stale chunks would pile up.
      const viewerDist = app.isPackaged
        ? path.join(process.resourcesPath, 'player-viewer')
        : path.join(app.getAppPath(), 'dist-viewer')
      if (fs.existsSync(path.join(viewerDist, 'index.html'))) {
        fs.rmSync(path.join(outDir, 'assets'), { recursive: true, force: true })
        await copyDirContentsAsync(viewerDist, outDir)
      } else {
        warnings.push('Viewer app not built — run "npm run build:viewer". Data was written, but the folder has no index.html yet.')
      }

      // Public descriptor — no player roster (files are keyed by username hash).
      fs.writeFileSync(path.join(outDir, 'site.json'), JSON.stringify({
        format: 2,
        campaign: campaign.name,
        generatedAt: new Date().toISOString(),
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, keyLen: 32 },
        cipher: 'AES-256-GCM',
        bundleKey: 'sha256(lowercased-username)',
      }, null, 2))

      fs.writeFileSync(path.join(outDir, 'README.txt'),
        'DM-Forge player site.\n\n' +
        'This folder is a complete static site: index.html plus assets/, one\n' +
        "encrypted bundle per player in data/, and the images they reference in\n" +
        'images/. Host it anywhere that serves static files (GitHub Pages works)\n' +
        'and give each player their username and password.\n\n' +
        'Per-player content is encrypted with PBKDF2-SHA256 + AES-256-GCM. Images\n' +
        'are NOT encrypted — they are ordinary files under images/, protected only\n' +
        'by unguessable filenames and the host not listing directories.\n\n' +
        'Republish into this same folder: the export prunes bundles and images it\n' +
        'no longer produces, which is what keeps revoked content from lingering.\n\n' +
        'Do not edit by hand.\n')

      return {
        success: true,
        path: outDir,
        stats: {
          players: players.length,
          articles: totalArticles,
          images: jobs.length,
          pruned: staleBundles + staleImages,
        },
        warnings,
      }
    } catch (err: any) {
      log.error(`Player site export failed: ${err?.message ?? err}`)
      return { success: false, error: err?.message ?? String(err) }
    }
  })
}
