# Player-Facing Pages — Project Plan

Branch: `player-pages`
Status: planning → implementation
Last updated: 2026-07-25

---

## 1. Goal & user stories

Give players a read-only, per-player view of a curated subset of the campaign wiki
and world map, hosted somewhere they can reach from their own devices.

- As a **player**, I open a URL, log in with a username/password the DM gave me, and
  see only the articles, map, tracks, and tags the DM has shared with me.
- As a **player**, some pages are *mine alone* (my warlock's patron, my secret
  hometown) — no other player sees them.
- As a **player**, when I log back in I get a short "what's changed" summary: pages
  newly shared with me, and pages whose content changed since I last visited.
- As the **DM**, I keep working in the Electron app exactly as I do today. When I'm
  ready, I run one **"Publish player site"** command and push the result. My live
  database, with all its secrets, never leaves my machine.

Non-goals (for now): players editing anything; real-time sync; multi-DM;
player-to-player messaging.

---

## 2. Architecture: publish a snapshot, don't share the DB

The DM app stays a local Electron + SQLite app. We **add** a publish pipeline that
emits a **static site** (curated snapshot) which the DM pushes to a static host.

Why snapshot over a live/central DB:
- No spoiler-leak risk — the DM explicitly chooses what each publish contains; the
  live DB never leaves the machine.
- DM's machine doesn't need to be online for players to read.
- Fits free static hosting (GitHub Pages / Netlify / Cloudflare Pages) perfectly; a
  live shared DB would require a backend, which static hosting can't provide.

### Security tier (chosen): Tier A — static site, per-player encrypted bundles

- Each player's private data is encrypted **client-side with their own password**
  (WebCrypto / libsodium; key derived from password via a KDF such as Argon2id or
  PBKDF2). All files are technically public, but a player can only decrypt their own
  bundle. Shared/"party" pages are readable to any logged-in player.
- Threat model is *a group of friends*, not attackers — this is "real enough"
  secrecy without a backend, and it maps directly onto "host through GitHub."
- **Hard rule:** plaintext of any DM-only or player-restricted content must NEVER be
  written to the bundle. Encryption is the second line; not-shipping is the first.

Tier B (real server-enforced accounts via Supabase/Firebase/Workers) is deferred —
revisit only if the group can't be trusted or player count grows.

### Hosting

GitHub Pages repo the DM pushes to. Mind limits: ~100 MB/file, soft ~1 GB repo. Map
and portrait images can be large — the pipeline must watch bundle size and warn.

---

## 3. Data model changes (additive; no destructive migrations)

Existing `articles` / `maps` / `pois` rows are untouched. We add:

### 3.1 `players` table
- `id`, `campaign_id`, `username`, display name, `salt` (for key derivation), a
  password verifier (NOT the password), optional `pc_article_id` linking a player to
  their `playerCharacter` article.
- A `playerCharacter` article auto-grants to its owning player.

### 3.2 Polymorphic grants table (first-class entities only)
Controls visibility of whole entities: articles, maps, POIs, map layers.
- `grantee` — a `player_id`, or a sentinel meaning **party** (all players).
- `entity_type` — `article` | `map` | `poi` | `layer`.
- `entity_id`.
- **Deny-by-default:** no row = hidden. New entities are invisible until granted.
- A player's visible set = grants to them ∪ grants to party.

### 3.3 Inline "DM-only" marks (TipTap) — within-article redaction
- A custom TipTap mark/node attribute flagging a range/block as **DM-only**.
- Authoring: highlight text → tag "DM-only". Export strips those nodes.
- Lets one page serve both audiences with no duplicate maintenance.
- Applies to article `content` **and** POI `content` (both are TipTap).

### 3.4 Track & subtrack visibility (companion JSON on the article)
Tracks are string-keyed metadata (the infobox: `Vitality`, `Species`, `Death_Date`,
`Timeline_Milestones`, …), stored as a JSON map. Subtracks = individual
`Timeline_Milestones` entries (each already has a stable `id`).

- Stored as a **sibling JSON blob** on the article (parallel to `tracks`), NOT in the
  grants table — tracks aren't first-class rows and don't fit an id-based table.
  Example shape: `{ "Death_Date": {mode:"restricted", players:[3]},
  "Timeline_Milestones": { "ms_1510": {mode:"dm"} } }`.
- **Posture is the opposite of articles: inherit-by-default.** If a player can see the
  page, they see its tracks *unless* a track is downgraded. (The article grant already
  did the gatekeeping; re-granting `Species`/`Age` everywhere would be miserable.)
- Three states per track / per milestone:
  1. **Inherit** — visible to everyone who can see the article.
  2. **DM-only** — never exported.
  3. **Restricted** — visible only to specific players *among those who see the article*
     (effective audience = intersection).
- **Smart default:** `*_Date` tracks default to DM-only (dates are usually spoilers);
  DM overrides per case. Reuse existing `*_Date` convention / `NON_TAG_TRACKS`.

### 3.5 Always-strip fields (never exported, regardless of visibility)
When projecting even a *visible* article/POI, export a **projection**, not the row.
Never ship: `loot_table`, `combat_encounters` / `combat_creatures`, `item_block`,
quest `rewards` / `substeps`, `status`, clocks, session notes, draft sessions.
**Statblocks: own PC only.** A statblock is stripped for everyone *except* the
statblock on a player's own `playerCharacter` article (via `players.pc_article_id`),
which exports to that player only. Others' PCs and all NPC/monster statblocks stay
hidden. (Future option: a "share my sheet with party" toggle — not now.)

---

## 4. The export pipeline (ordered resolver contract)

**Core principle: project first, index second.** Build "the wiki as this player sees
it" *first*, then compute every derived/aggregate surface (tags, backlinks, mentions,
timeline, search) *from that projected corpus only* — never from the DM master. This
makes leaks structurally impossible rather than something we filter after the fact.

For each player P:

1. **Resolve visible set** — articles/maps/POIs/layers granted to P or to party
   (deny-by-default). Compute the **closed set**.
2. **Project each article/POI**
   - Strip DM-only TipTap marks from `content` → *redacted content*.
   - Filter tracks: inherit → keep; DM-only → drop; restricted → keep iff P allowed.
   - Filter subtracks (milestones) the same way, per milestone `id`.
   - Drop all always-strip fields (§3.5).
3. **Scrub links in redacted content**
   - `[[wikilinks]]` pointing outside P's visible set → plain text (never a dead link;
     never leak a hidden title).
   - Relations/graph edges to hidden entities → dropped.
4. **Derive tags from the projected data**
   - Per-article tags = **only** `getTrackTags()` run on the **filtered** track set.
     **Manual DM tags (the `tags` array) are never exported** — the sole tag source for
     players is inherited from visible tracks. (Filter tracks first, then derive — else a
     hidden track value leaks as a tag.)
5. **Index from the projected corpus** (stage-1 output only)
   - **Tag index/cloud** — recomputed from P's visible+filtered articles. A tag appears
     only if a visible article carries it (else its mere presence leaks existence).
   - **Backlinks** — extract links from the **redacted** content, then invert. A
     backlink X←Y appears only if P sees Y *and* the `[[X]]` survives redaction (a link
     inside a stripped DM-only block must not backlink).
   - **Mentions** (plain-text title occurrences), **timeline** (visible milestones
     only), **search index** — all from redacted corpus.
   - **Link graph** (for the player graph view) — nodes = visible articles; edges =
     the same scrubbed link set as backlinks (both endpoints visible); **ghosts dropped**
     (a ghost pointing at a hidden article leaks its title); mentions + recency heat from
     the visible set; no DM overlays.
6. **Build manifest** — per-visible-entity `id` → content hash + `updated_at`, plus the
   resolved visible-set membership.
7. **Encrypt** P's private bundle with their password-derived key; party/shared data in
   the shared (still login-gated) bundle.
8. **Write bundle** — HTML/JSON + copied image files with rewritten paths.

Runs at publish time on a small corpus, once per player — performance is a non-issue.

---

## 5. Change tracking ("what's new since last login")

- Each publish writes the per-player manifest (§4.6).
- Player's browser remembers (localStorage) the manifest it last saw.
- On login, diff current vs last-seen:
  - **Newly in visible set** → "New for you" (even if content is old — new *to them*).
  - **Content hash changed** on already-visible entity → "Updated."
  - **Removed from visible set** (revoked) → **silently drop.** Never announce a page
    was taken away — that itself is a spoiler and feels bad.
- No backend required.

---

## 6. Player web app (new read-only viewer)

- New Vite/React web target (repo already has `tsconfig.web`). Separate build output
  from the Electron app.
- **Reuses:** TipTap renderer in read-only mode; a **stripped** map/POI viewer (no
  loot, no combat, no DM tooling); the `WikiGraphView` component (reactflow/d3-force/
  dagre are web-friendly) minus DM overlays.
- Screens: login prompt → "what's new" summary → wiki (article list/search/tags/
  backlinks) → **graph view** (per-player scrubbed link graph, §4.5) → world map with
  visible POIs.
- Decrypts the logged-in player's private bundle client-side; reads shared bundle for
  party pages.
- Fully static; no runtime server calls.

---

## 7. Map / POI / layer visibility

- POIs get their own grants (independent of their article) and their `content` is
  redacted like articles; `loot_table` / combat always stripped.
- Map layers (visit layers): players see layers for visits they witnessed; base layer
  and DM-planning layers gated by grants.
- Later: fog / partial reveal of the world map.

---

## 8. Authoring UX (DM side, in the Electron app)

The model is only as good as how easy it is to set:
- **Audience control** on every article/POI: Hidden / Party / +specific players.
- **Per-track eye toggle** on each `TrackRow` and milestone row: Inherit → DM-only →
  Restricted (+player picker). Inline where tracks are already edited.
- **DM-only mark** button in the rich editor toolbar.
- **Preview-as-player X** — renders the stage-1 projected corpus exactly as that player
  will see it. This *is* their index (tags/backlinks correct by construction). Primary
  safety net before publishing.
- **Coverage matrix** — articles × players, to audit leaks and gaps.
- **Pre-publish leak warnings** — "this shared article links to N pages the party can't
  see," bundle-size warnings, images-over-limit.

---

## 9. Phasing

1. **Foundations** — `players` table, polymorphic grants, deny-by-default, always-strip
   fields; whole-article visibility working end to end; minimal publish → static bundle;
   basic login + read-only viewer.
2. **Leak-safety** — preview-as-player, closed-set + link scrubbing, project-then-index
   for tags/backlinks/mentions, pre-publish leak warnings.
3. **Inline redaction** — DM-only TipTap mark; POI content redaction.
4. **Tracks/subtracks** — companion visibility JSON, three-state UI, `*_Date` defaults,
   filtered tag/timeline derivation.
5. **Encryption & change tracking** — per-player encrypted bundles; manifest diff with
   new/changed/silent-revoke.
6. **Map polish** — POI/layer visibility, fog, per-visit layers.
7. **Ergonomics** — coverage matrix, bundle-size/image warnings, publish workflow.

---

## 10. Decisions

Resolved:
- **Host: GitHub Pages.** ✓
- **Statblocks: own PC only** (§3.5). ✓
- **Graph view: included**, built from the per-player scrubbed link graph (§4.5, §6). ✓
- **Manual tags: never exported.** Player-facing tags are *only* those inherited from the
  filtered track set (`getTrackTags`). Hand-typed DM tags are dropped entirely — no per-tag
  toggle needed, no leak vector. ✓

Still open:
- Publish cadence & repo layout (one repo per campaign? per-player file naming).
- KDF choice (Argon2id preferred; PBKDF2 fallback if bundle-size/deps matter).
