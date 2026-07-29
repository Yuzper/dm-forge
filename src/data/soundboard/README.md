# Bundled starter sounds

Audio files dropped into these folders are seeded into the app-wide **Sound Library**
on launch — one row per file, referenced as `default:<folder>/<file>` so they resolve
against the app dir instead of userData. Seeding is tracked per ref in
`sound_library_seeded`, which means:

- a newly shipped file appears in every user's library on their next launch;
- a starter sound the user deleted stays deleted (it is never re-seeded);
- renaming a file here ships it as a *new* sound (the ref changed).

Everything the user imports lands in the same library and behaves identically.

## Folders → categories

| Folder      | Category   |
|-------------|------------|
| `ambient/`  | ambience   |
| `music/`    | music      |
| `effects/`  | effect     |

## Naming

The sound's display name is derived from the filename:
`dungeon_drip.ogg` → **Dungeon Drip** (extension stripped, `_`/`-` → space, title-cased).

No hotkeys on starters — the user assigns those in the library or per board.

## Format & licensing

- Prefer **OGG** (mono for ambience/music keeps size down; ~0.7 MB/min at 96 kbps).
- Files **must be CC0 / royalty-free** — they ship inside the app installer.

## Build note

This folder is bundled via electron-builder so it lands in `process.resourcesPath`
in production. In dev it is read from `src/data/soundboard`.
