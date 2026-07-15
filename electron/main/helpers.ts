// path: electron/main/helpers.ts
import { nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { pipeline } from 'stream/promises'
import log from 'electron-log'

// ── Image Processing ───────────────────────────────────────────────────────────

export function processAndSaveImage(
  srcPath: string,
  destDir: string,
  baseName: string,
  maxWidth: number,
  quality = 85,
): string {
  const img = nativeImage.createFromPath(srcPath)
  if (img.isEmpty()) {
    const ext = path.extname(srcPath)
    const fallbackName = baseName + ext
    fs.copyFileSync(srcPath, path.join(destDir, fallbackName))
    return fallbackName
  }
  const { width } = img.getSize()
  const processed = width > maxWidth ? img.resize({ width: maxWidth }) : img
  const outName = baseName + '.jpg'
  fs.writeFileSync(path.join(destDir, outName), processed.toJPEG(quality))
  return outName
}

// ── Resilient parallel file copy (for backup export/import) ─────────────────────
// Each file is wrapped in its own try/catch so a single unreadable/locked entry
// can never abort the whole transfer — historically a mid-loop throw left maps
// (which sort after profile images) un-copied while the DB had already been
// swapped in. Copies run async with limited concurrency so the main process
// stays responsive, and files already identical at the destination (same size,
// destination at least as new) are skipped — repeat backups become near-instant.

export interface CopyResult { copied: number; skipped: number; failed: string[] }

export async function copyFilesWithSkip(
  jobs: { src: string; dst: string }[],
  concurrency = 8,
): Promise<CopyResult> {
  const result: CopyResult = { copied: 0, skipped: 0, failed: [] }
  const madeDirs = new Set<string>()
  let next = 0

  const worker = async () => {
    while (next < jobs.length) {
      const { src, dst } = jobs[next++]
      try {
        const srcStat = await fs.promises.stat(src)
        try {
          const dstStat = await fs.promises.stat(dst)
          if (dstStat.size === srcStat.size && dstStat.mtimeMs >= srcStat.mtimeMs) {
            result.skipped++
            continue
          }
        } catch { /* destination missing — copy */ }
        const dir = path.dirname(dst)
        if (!madeDirs.has(dir)) {
          await fs.promises.mkdir(dir, { recursive: true })
          madeDirs.add(dir)
        }
        try {
          await fs.promises.copyFile(src, dst)
        } catch {
          // fs.copyFile uses the CopyFile2 Windows API, which fails with
          // spurious UNKNOWN errors on exFAT/FAT32 USB drives and network
          // shares. Plain read/write streaming doesn't, so retry that way.
          await pipeline(fs.createReadStream(src), fs.createWriteStream(dst))
        }
        result.copied++
      } catch (err: any) {
        result.failed.push(path.basename(src))
        log.warn(`Backup: failed to copy "${src}": ${err?.message ?? err}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length || 1) }, worker))
  return result
}

export async function copyDirContentsAsync(
  srcDir: string,
  dstDir: string,
  skipFile?: (name: string) => boolean,
): Promise<CopyResult> {
  const jobs: { src: string; dst: string }[] = []
  const gather = (from: string, to: string) => {
    if (!fs.existsSync(from)) return
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (entry.isDirectory()) gather(path.join(from, entry.name), path.join(to, entry.name))
      else if (!skipFile?.(entry.name)) jobs.push({ src: path.join(from, entry.name), dst: path.join(to, entry.name) })
    }
  }
  gather(srcDir, dstDir)
  return copyFilesWithSkip(jobs)
}

// ── Inline Image Cleanup ───────────────────────────────────────────────────────

export function extractInlineImagePaths(contentJson: string, userDataPath: string): string[] {
  try {
    const doc = JSON.parse(contentJson)
    const imagesDir = path.join(userDataPath, 'images')
    const found: string[] = []
    function walk(node: any) {
      if (node?.type === 'image' && node.attrs?.src) {
        const src = node.attrs.src as string
        const filePath = src.startsWith('file://') ? src.slice(7) : src
        if (filePath.startsWith(imagesDir)) found.push(filePath)
      }
      if (Array.isArray(node?.content)) node.content.forEach(walk)
    }
    walk(doc)
    return found
  } catch { return [] }
}

export function safeUnlink(filePath: string) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch {}
}

export function safeUnlinkRelative(relativePath: string | null | undefined, userDataPath: string) {
  if (!relativePath) return
  safeUnlink(path.join(userDataPath, relativePath))
}

// Unlinks an image reference regardless of how it was stored: cover/portrait
// images hold absolute paths (optionally file://-prefixed), map images hold
// userData-relative paths. Refuses to touch anything outside userData so a
// malformed reference can never delete unrelated files.
export function unlinkImageRef(ref: string | null | undefined, userDataPath: string) {
  if (!ref) return
  let p = ref.startsWith('file://') ? ref.slice(7) : ref
  if (!path.isAbsolute(p)) p = path.join(userDataPath, p)
  p = path.normalize(p)
  if (!p.startsWith(path.normalize(userDataPath) + path.sep)) return
  safeUnlink(p)
}
