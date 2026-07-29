// Shapes mirror the publish pipeline's output (electron/main/ipc/publishCore.ts).

export interface PArticle {
  id: number
  title: string
  article_type: string
  content: string                 // TipTap JSON
  cover_image: string | null      // relative "images/…" path, or null
  portrait_image: string | null
  tags: string[]                  // track-derived only
  infoTracks?: { label: string; value: string }[]   // visible track fields
  milestones?: { label: string; date: string }[]    // visible subtracks
  statblock?: string              // present only for the player's own PC
  updated_at: string
}

export interface PPoi {
  id: number
  label: string
  x: number            // percent (0–100) of the map image
  y: number
  poi_type: string
  color: string
  size: number
  opacity: number
  articleId: number | null   // linked visible article, opened on click
  content: string            // redacted TipTap JSON
}

// A drawn region (kingdom border, district…). Geometry is in the same percent
// space as PPoi; 'ellipse' carries two bbox corners, 'polygon' its vertices.
export interface PShape {
  id: number
  label: string
  shape_type: 'polygon' | 'ellipse'
  points: string             // JSON [{x,y}] percent coords
  fill_color: string
  fill_opacity: number
  stroke_color: string
  stroke_width: number
  stroke_style: 'solid' | 'dashed'
  show_label: number
  articleId: number | null   // linked visible article, opened on click
  content: string            // redacted TipTap JSON
}

export interface PMap {
  id: number
  name: string
  image: string        // relative "images/…" path
  pois: PPoi[]
  shapes?: PShape[]    // absent in bundles published before drawing layers
}

export interface Bundle {
  player: { username: string; display_name: string; pc_article_id?: number | null }
  articles: PArticle[]
  backlinks: Record<number, { id: number; title: string }[]>
  tagIndex: Record<string, number[]>
  maps?: PMap[]
}

export interface EncryptedBundle {
  v: number
  salt: string   // base64
  iv: string     // base64
  ct: string     // base64 (ciphertext || 16-byte GCM tag)
}

export interface SiteInfo {
  format: number
  campaign: string
  generatedAt: string
  kdf: { name: string; hash: string; iterations: number; keyLen: number }
  cipher: string
}
