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
  re-use them on every publish). **Required:** publishing refuses to run while any
  player has a blank password, because the crypto parameters are public in `site.json`
  — a bundle with no password is a plaintext bundle.
- **Character** *(optional)* — link their player-character article to auto-share it and
  its stat block with them

### 2. Choose what each player sees
- **Per page:** the **"Visible to"** pill in an article's header → *Whole party* or
  specific players. Pages are hidden by default until you share them.
- **Per field:** the small **eye icon** on each info-box track row, date field and
  timeline milestone → *Everyone* / *DM only* / *Some players*. The icon stays faint
  when a field is on its default and lights up when it isn't, so anything you've
  restricted reads at a glance. **Date fields and `Status` default to DM-only.**
- **Inside a page:** select text and hit the **eye-off** button in the editor toolbar to
  mark it **DM-only** — stripped from the player export, so one page serves both
  audiences. The selection doesn't have to be text: an **image** inside it is flagged
  too, and shows a dashed red ring. Click an image on its own and hit the same button to
  hide just that image.
- **World map:** a pin or region carries its own **"Visible to"** control in its editor.
  Left alone it reads *Follows page* — it appears for anyone who can see the article it
  links to. Override it to share a pin whose page stays hidden (the party sees a labelled
  marker they can't open — a place they know of but have no page for), or to hide a pin
  whose page is shared. Pin loot/encounter data is never exported.

### 3. Preview as a player
In the **Players** modal, click **Preview as player** and pick someone. This runs the
real export and renders it with the same viewer the published site uses — it just
doesn't write or encrypt anything. You see their page list, their info-box fields, their
tags and their redacted text exactly as they will.

Check here before every publish. Every redaction rule in the app is only as good as your
ability to confirm it, and this is the one place that shows you the result rather than
the intent.

### 4. Publish
In the **Players** modal, click **Publish**.

The first publish asks where to put it and **remembers that folder**; after that it's one
click. The path is shown above the button, with **Change folder…** to move it.

**Point it at a subfolder of the repo you host from** — e.g. `my-pages-site/coast/`, not
`my-pages-site/`. The export owns its folder completely (it overwrites `index.html` and
clears `assets/`), so publishing into a repo root would eat your landing page. The folder
picker refuses a repo root for exactly that reason.

Publish into the **same folder every time**. The export deletes bundles and images it no
longer produces — that's what stops a renamed or deleted player's old bundle from sitting
on your host forever, still readable with the password they already have. Publish
somewhere new and the old folder keeps serving stale secrets.

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

## Preview the built site locally (optional)

**Preview as player** (above) is the quicker check and needs no build. Use this when you
want to exercise the real published site — the login screen, the map pane, the "since
your last visit" summary.

The viewer fetches its data, so it must be **served** — opening `index.html` directly
won't work. From inside the output folder:

```bash
npx serve player-site-<campaign>
```

Open the printed `localhost` URL and log in as one of your players to confirm they see
the right pages, fields, map pins, and "what's new" summary.

---

## Host on GitHub Pages

**One-time:**

1. Create (or reuse) a repository you serve Pages from, and clone it locally.
2. Publish into a **subfolder** of that clone — `Change folder…` → e.g. `coast/`.
3. In the repo: **Settings → Pages → Source: Deploy from a branch**, your branch,
   **`/ (root)`**.
4. Send each player `https://<you>.github.io/<repo>/coast/` plus their username and password.

**Every time after that:** click **Publish**, then **Push live**. No terminal.

### 5. Push live

Once the published folder sits inside a git repo, the Players modal shows where it goes:

```
Pushes coast to https://github.com/you/your-pages-repo (main)
        [ Preview as player ]  [ Publish ]  [ Push live · 12 files ]
```

**Push live** stages, commits and pushes **only the published folder**. It is scoped by
path, so anything else in that repo — your landing page, another campaign, work you have
staged but not finished — is left exactly as it was, staged or otherwise.

It's a separate button from **Publish** on purpose: publishing writes files on your own
disk and is reversible, pushing makes them public and isn't. The button stays disabled
when there's nothing to send, and its label tells you how much is waiting.

Authentication uses whatever git already uses on your machine (on Windows, the Credential
Manager). The app never sees or stores a password or token. If git can't authenticate
without prompting, the push fails with a message rather than hanging — do one
`git push` from your terminal to store the credential, and the button works from then on.
If a push fails *after* committing, the commit is safe: press **Push live** again, don't
republish.

Any static host works (Netlify, Cloudflare Pages, etc.) — GitHub Pages is just the
zero-cost default. Without a git repo, publishing still works; you just upload the folder
yourself.

---

## Updating later

Re-publish into the same folder, then **Push live**. On each player's next login the viewer
shows a **"Since your last visit"** summary of newly shared and changed pages. Pages you
stop sharing simply disappear — no announcement.

"Updated" means the page changed *for that player*: it's keyed to a hash of what they
actually receive, so editing a DM-only paragraph doesn't nag them about a page that looks
identical from where they're standing.

If you change the viewer itself (anything under `viewer/` or `shared/`), re-run
`npm run build:viewer` before publishing — otherwise the export copies the previous
build and your players keep the old app.

---

## Good to know

- **A free GitHub Pages repo is public — and that's fine here.** Every player bundle is
  encrypted with that player's password (PBKDF2 → AES-256-GCM), and bundle files are named
  by a hash of the username, so the page doesn't even reveal who the players are.
  `site.json` exposes only the campaign name and crypto parameters.
- **Only the published folder is ever committed.** Push live is path-scoped, so it can't
  pick up your DM database, the app source, or anything else in that repo. Still: never
  put `dmforge.db` in a public repo yourself.
- **Don't hand-edit the published files** — the `.enc` bundles are encrypted blobs.
- **Passwords are shared secrets, not high security.** Suitable for a home group. A player
  can only decrypt their own bundle, but treat these like a shared door code, not a bank
  login.
- **Images are not encrypted.** The bundles are; the files under `images/` are ordinary
  images, shared across all players. They're protected by unguessable filenames and by
  hosts not listing directories — not by the crypto. Don't rely on a picture being secret
  just because the page holding it is; mark the image DM-only and it won't be exported at
  all.
- **What is *not* exported, ever:** unshared pages, DM-only marked text and images,
  DM-only fields, `Status` (unless you set it to Everyone), loot tables, combat
  encounters, other players' stat blocks, session/battle maps, DM notes, your hand-typed
  tags, and the labels behind session links.
