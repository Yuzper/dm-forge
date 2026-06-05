# Default Soundboard

Audio files dropped into these folders become the bundled **Default Sounds** board,
available in every campaign. They are read live at launch (not seeded into the DB),
so adding/removing a file and cutting a release updates the defaults on every device.

## Folders → categories

| Folder      | Category   |
|-------------|------------|
| `ambient/`  | ambience   |
| `music/`    | music      |
| `effects/`  | effect     |

## Naming

The sound's display name is derived from the filename:
`dungeon_drip.ogg` → **Dungeon Drip** (extension stripped, `_`/`-` → space, title-cased).

No hotkeys on defaults — users assign their own once a default is added to their board.

## Format & licensing

- Prefer **OGG** (mono for ambience/music keeps size down; ~0.7 MB/min at 96 kbps).
- Files **must be CC0 / royalty-free** — they ship inside the app installer.

## Build note

This folder is bundled via electron-builder so it lands in `process.resourcesPath`
in production. In dev it is read from `src/data/soundboard`.
