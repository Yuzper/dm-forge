// path: electron/main/ipc/publish.ts
// Publish pipeline for the player-facing site. Produces a static bundle: per
// player, an ENCRYPTED projection of only the articles they may see, plus the
// referenced images. Encryption is PBKDF2-SHA256 → AES-256-GCM so the (future)
// browser viewer can decrypt with WebCrypto using the player's password.
//
// Pure projection/crypto logic lives in publishCore.ts (unit-testable). This
// file is the electron shell: dialog, DB reads, grant resolution, file writes.
//
// Not yet handled (later phases): DM-only inline marks, track/subtrack
// visibility, POI/map/graph export. Article content currently ships whole
// (minus link-scrub + always-strip fields).
import { app, dialog, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import log from 'electron-log'
import { db } from '../db'
import { getMainWindow } from '../window'
import { copyFilesWithSkip, copyDirContentsAsync } from '../helpers'
import { buildPlayerBundle, encryptBundle, bundleFileName, PBKDF2_ITERATIONS, type WorldMapInput } from './publishCore'

export function registerPublishIPC() {
  ipcMain.handle('publish:export', async (_e, campaignId: number) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return { success: false, error: 'No window' }

    const campaign = db.prepare('SELECT id, name FROM campaigns WHERE id = ?').get(campaignId) as any
    if (!campaign) return { success: false, error: 'Campaign not found' }

    const players = db.prepare('SELECT * FROM players WHERE campaign_id = ?').all(campaignId) as any[]
    if (players.length === 0) return { success: false, error: 'No players defined — add players first.' }

    const dlg = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose where to write the player site',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (dlg.canceled || !dlg.filePaths.length) return { success: false, canceled: true }

    try {
      const userDataPath = app.getPath('userData')
      const slug = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'campaign'
      const outDir = path.join(dlg.filePaths[0], `player-site-${slug}`)
      const dataDir = path.join(outDir, 'data')
      const imagesOutDir = path.join(outDir, 'images')
      fs.mkdirSync(dataDir, { recursive: true })
      fs.mkdirSync(imagesOutDir, { recursive: true })

      const articles = db.prepare('SELECT * FROM articles WHERE campaign_id = ?').all(campaignId) as any[]
      const articleIds = new Set<number>(articles.map(a => a.id))
      const grants = db.prepare(
        `SELECT entity_id, player_id FROM visibility_grants WHERE campaign_id = ? AND entity_type = 'article'`
      ).all(campaignId) as any[]

      const partyIds = new Set<number>()
      const perPlayer = new Map<number, Set<number>>()
      for (const p of players) perPlayer.set(p.id, new Set())
      for (const g of grants) {
        if (g.player_id === null) partyIds.add(g.entity_id)
        else perPlayer.get(g.player_id)?.add(g.entity_id)
      }

      // World maps = campaign-owned maps (the hub map). Each carries its base-layer
      // POIs (layer_id NULL); per-POI visibility is derived from linked-article
      // visibility inside buildPlayerBundle.
      const worldMaps: WorldMapInput[] = (
        db.prepare(`SELECT id, name, image_path FROM maps WHERE campaign_id = ? AND image_path != '' ORDER BY sort_order`).all(campaignId) as any[]
      ).map(m => ({
        ...m,
        pois: db.prepare('SELECT * FROM pois WHERE map_id = ? AND layer_id IS NULL').all(m.id) as any[],
      }))

      const imageAbs = new Map<string, string>()
      const warnings: string[] = []
      let totalArticles = 0

      for (const player of players) {
        const visibleIds = new Set<number>([...partyIds, ...(perPlayer.get(player.id) ?? [])])
        if (player.pc_article_id && articleIds.has(player.pc_article_id)) visibleIds.add(player.pc_article_id)

        const bundle = buildPlayerBundle(player, articles, visibleIds, userDataPath, imageAbs, worldMaps)
        totalArticles += bundle.articles.length
        if (!player.password) warnings.push(`Player "${player.username}" has no password — its bundle is only weakly protected.`)

        const enc = encryptBundle(JSON.stringify(bundle), player.password || '')
        fs.writeFileSync(path.join(dataDir, bundleFileName(player.username)), JSON.stringify(enc))
      }

      // Copy the union of referenced images once (only images from visible pages).
      const jobs = [...imageAbs.entries()].map(([base, src]) => ({ src, dst: path.join(imagesOutDir, base) }))
      const copyRes = await copyFilesWithSkip(jobs)
      if (copyRes.failed.length) warnings.push(`${copyRes.failed.length} image(s) failed to copy.`)

      // Copy the bundled read-only viewer (index.html + assets) so the folder is
      // a complete, hostable site. Packaged: an extraResource; dev: dist-viewer
      // built by `npm run build:viewer`.
      const viewerDist = app.isPackaged
        ? path.join(process.resourcesPath, 'player-viewer')
        : path.join(app.getAppPath(), 'dist-viewer')
      if (fs.existsSync(path.join(viewerDist, 'index.html'))) {
        await copyDirContentsAsync(viewerDist, outDir)
      } else {
        warnings.push('Viewer app not built — run "npm run build:viewer". Data was written, but the folder has no index.html yet.')
      }

      // Public descriptor — no player roster (files are keyed by username hash).
      fs.writeFileSync(path.join(outDir, 'site.json'), JSON.stringify({
        format: 1,
        campaign: campaign.name,
        generatedAt: new Date().toISOString(),
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, keyLen: 32 },
        cipher: 'AES-256-GCM',
        bundleKey: 'sha256(lowercased-username)',
      }, null, 2))

      fs.writeFileSync(path.join(outDir, 'README.txt'),
        'DM-Forge player site — data bundle.\n\n' +
        'Per-player content is encrypted (PBKDF2-SHA256 + AES-256-GCM) with each\n' +
        "player's password. The read-only viewer app (login + render) is added in\n" +
        'the next build step; until then these are data files only.\n\n' +
        'Do not edit by hand.\n')

      return {
        success: true,
        path: outDir,
        stats: { players: players.length, articles: totalArticles, images: jobs.length },
        warnings,
      }
    } catch (err: any) {
      log.error(`Player site export failed: ${err?.message ?? err}`)
      return { success: false, error: err?.message ?? String(err) }
    }
  })
}
