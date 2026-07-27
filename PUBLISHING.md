# Publishing the Player Site

How to share a curated, per-player view of your campaign wiki and world map. Players
open a web page, log in with a username/password you assign, and see **only** what you
shared — each player's content is encrypted with their own password.

Your DM database never leaves your machine. Publishing writes a self-contained static
site (viewer + encrypted data + images) that you host anywhere static files work
(e.g. GitHub Pages).

See [docs/player-pages-plan.md](docs/player-pages-plan.md) for the full design.

---

## One-time setup

The publish step drops the **viewer** (the `index.html` + JavaScript players load) into
the output folder. It comes from a build artifact, so build it once:

```bash
npm run build:viewer
```

This writes `dist-viewer/`. Re-run it only if the viewer code changes.

> When you package the app for real use (`npm run package`), the viewer is built and
> bundled into the installer automatically — you won't need this manual step then.

---

## Each time you publish

### 1. Define your players
Open the **Players** modal: on the **campaign hub**, click the **Players** button (people
icon) in the **top-right corner** — next to the layout toggle ("Map view" / "Classic
view") and the settings menu, in both hub layouts. (You can also reach it from any
article's **"Visible to"** pill → **"Manage players…"**.)

For each player set:
- **Display name** — shown as a greeting
- **Username** + **password** — their login (assigned by you; stored locally so you can
  re-use them on every publish)
- **Character** *(optional)* — link their player-character article to auto-share it and
  its stat block with them

### 2. Choose what each player sees
- **Per page:** the **"Visible to"** pill in an article's header → *Whole party* or
  specific players. Pages are hidden by default until you share them.
- **Per field:** the **sliders button** (Field visibility) → set individual info-box
  tracks and timeline milestones to *Everyone* / *DM only* / *Some players*.
  (Date fields default to DM-only.)
- **Inside a page:** select text and hit the **eye-off** button in the editor toolbar to
  mark it **DM-only** — it's stripped from the player export (one page serves both
  audiences).
- **World map:** a location pin appears for a player automatically whenever they can see
  the article that pin links to. Pin loot/encounter data is never exported.

### 3. Publish
In the **Players** modal from world hub top right corner, click **Publish player site** and pick a destination folder.

You'll get a folder named `player-site-<campaign>/`:

```
player-site-<campaign>/
├─ index.html          the viewer
├─ assets/             viewer JS/CSS
├─ data/<hash>.enc     one encrypted bundle per player
├─ images/             referenced images
├─ site.json           campaign name + crypto parameters (no player list)
└─ README.txt
```

---

## Preview locally before sharing

The viewer fetches its data, so it must be **served** — opening `index.html` directly
won't work. From inside the output folder:

```bash
npx serve player-site-<campaign>
```

Open the printed `localhost` URL and log in as one of your players to confirm they see
the right pages, fields, map pins, and "what's new" summary.

---

## Host on GitHub Pages

1. Create a repository and put the **contents** of `player-site-<campaign>/` at its root.
2. Push, then in the repo go to **Settings → Pages → Source: Deploy from a branch** and
   choose your branch with the **`/ (root)`** folder.
3. The site goes live at `https://<you>.github.io/<repo>/`.
4. Send each player the URL plus their username and password.

Any static host works (Netlify, Cloudflare Pages, etc.) — GitHub Pages is just the
zero-cost default.

---

## Updating later

Re-publish (overwrite the folder) and push again. On each player's next login the viewer
shows a **"Since your last visit"** summary of newly shared and changed pages. Pages you
stop sharing simply disappear — no announcement.

---

## Good to know

- **A free GitHub Pages repo is public — and that's fine here.** Every player bundle is
  encrypted with that player's password (PBKDF2 → AES-256-GCM), and bundle files are named
  by a hash of the username, so the page doesn't even reveal who the players are.
  `site.json` exposes only the campaign name and crypto parameters.
- **Only host the published folder's contents.** Never commit your DM database
  (`dmforge.db`), the app source, or `dist-viewer/` into the public site repo.
- **Don't hand-edit the published files** — the `.enc` bundles are encrypted blobs.
- **Passwords are shared secrets, not high security.** Suitable for a home group. A player
  can only decrypt their own bundle, but treat these like a shared door code, not a bank
  login.
- **What is *not* exported, ever:** unshared pages, DM-only marked text, DM-only fields,
  loot tables, combat encounters, other players' stat blocks, session/battle maps, and DM
  notes.
