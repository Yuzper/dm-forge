// path: src/components/PlayersManager.tsx
// DM-side manager for player-facing pages: define the players who get a curated
// per-player view (username + shared password + linked player-character article).
import { useEffect, useState } from 'react'
import { Trash2, Plus, X, Upload, Loader2, Eye, FolderOpen, GitBranch, CloudUpload } from 'lucide-react'
import { useStore } from '../store/store'
import Modal from './Modal'
import PlayerSitePreview from './PlayerSitePreview'
import type { Player, ArticleSummary, PublishResult, GitSiteStatus, PushResult } from '../types'

function PlayerRow({ player, pcOptions, onUpdate, onDelete }: {
  player: Player
  pcOptions: ArticleSummary[]
  onUpdate: (id: number, data: Partial<Player>) => void
  onDelete: (id: number) => void
}) {
  const [displayName, setDisplayName] = useState(player.display_name)
  const [username, setUsername] = useState(player.username)
  const [password, setPassword] = useState(player.password)
  const [confirm, setConfirm] = useState(false)

  const commit = (field: keyof Player, value: string | number | null) => {
    if (player[field] !== value) onUpdate(player.id, { [field]: value } as Partial<Player>)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1.1fr auto', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <input className="input" value={displayName} placeholder="Display name"
        onChange={e => setDisplayName(e.target.value)} onBlur={() => commit('display_name', displayName)} style={{ height: 30, fontSize: 12 }} />
      <input className="input" value={username} placeholder="username"
        onChange={e => setUsername(e.target.value)} onBlur={() => commit('username', username)} style={{ height: 30, fontSize: 12 }} />
      <input className="input" value={password} placeholder="password"
        onChange={e => setPassword(e.target.value)} onBlur={() => commit('password', password)} style={{ height: 30, fontSize: 12 }} />
      <select className="input" value={player.pc_article_id ?? ''}
        onChange={e => commit('pc_article_id', e.target.value ? Number(e.target.value) : null)} style={{ height: 30, fontSize: 12 }}>
        <option value="">— No character —</option>
        {pcOptions.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
      </select>
      {confirm ? (
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm" style={{ background: 'var(--danger, #c0432f)', color: '#fff' }} onClick={() => onDelete(player.id)}>Delete</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setConfirm(false)}><X size={12} /></button>
        </div>
      ) : (
        <button className="btn btn-sm btn-ghost" title="Remove player" onClick={() => setConfirm(true)}><Trash2 size={13} /></button>
      )}
    </div>
  )
}

export default function PlayersManager() {
  const players = useStore(s => s.players)
  const allArticles = useStore(s => s.allArticles)
  const loadPlayers = useStore(s => s.loadPlayers)
  const loadAllArticles = useStore(s => s.loadAllArticles)
  const createPlayer = useStore(s => s.createPlayer)
  const updatePlayer = useStore(s => s.updatePlayer)
  const deletePlayer = useStore(s => s.deletePlayer)
  const close = () => useStore.getState().setPlayersManagerOpen(false)

  const currentCampaign = useStore(s => s.currentCampaign)
  const [newName, setNewName] = useState('')
  const [newUser, setNewUser] = useState('')
  const [newPass, setNewPass] = useState('')
  const [error, setError] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [result, setResult] = useState<PublishResult | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  // Mirrors campaigns.player_site_path so re-picking the folder updates the
  // label without a round trip through the campaign record.
  const [destination, setDestination] = useState<string | null>(currentCampaign?.player_site_path ?? null)
  const [git, setGit] = useState<GitSiteStatus | null>(null)
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<PushResult | null>(null)

  // Git state is read, never cached across actions — the DM may commit or push
  // from their own terminal while this modal is open, and a stale "12 changes"
  // badge on a button that publishes to the internet is worse than none.
  const refreshGit = async () => {
    if (!currentCampaign) return
    setGit(await window.api.playerSiteGitStatus(currentCampaign.id))
  }
  useEffect(() => { refreshGit() }, [currentCampaign?.id, destination])

  useEffect(() => { loadPlayers(); loadAllArticles() }, [])

  const publish = async () => {
    if (!currentCampaign) return
    setPublishing(true); setResult(null)
    try {
      const r = await window.api.publishPlayerSite(currentCampaign.id)
      if (!r.canceled) setResult(r)
      if (r.success && r.path) setDestination(r.path)
      setPushResult(null)
      await refreshGit()
    } finally {
      setPublishing(false)
    }
  }

  const push = async () => {
    if (!currentCampaign) return
    setPushing(true); setPushResult(null)
    try {
      setPushResult(await window.api.pushPlayerSite(currentCampaign.id))
      await refreshGit()
    } finally {
      setPushing(false)
    }
  }

  const chooseFolder = async () => {
    if (!currentCampaign) return
    const r = await window.api.choosePlayerSiteFolder(currentCampaign.id)
    if (r.success && r.path) {
      setDestination(r.path); setResult(null); setPushResult(null)
      if (r.git) setGit(r.git)
    } else if (r.error) {
      setResult({ success: false, error: r.error })
    }
  }

  const pcOptions = allArticles.filter(a => a.article_type === 'playerCharacter')

  // Something to push = uncommitted files in the published folder, or commits
  // already made but not sent. Both count, so a failed push stays actionable.
  const pending = git?.inRepo ? (git.pendingChanges ?? 0) : 0
  const ahead = git?.inRepo ? (git.ahead ?? 0) : 0
  const canPush = !!git?.inRepo && !!git.remoteUrl && (pending > 0 || ahead > 0)
  const pendingLabel = pending > 0
    ? `${pending} file${pending === 1 ? '' : 's'}`
    : ahead > 0 ? `${ahead} commit${ahead === 1 ? '' : 's'}` : ''
  const pushTitle = !git?.inRepo
    ? (git?.reason ?? 'No git repository found for the published folder.')
    : !git.remoteUrl ? 'This repository has no remote configured.'
    : canPush ? `Commit and push ${pendingLabel} to ${git.remoteUrl}`
    : 'Nothing to push — the published folder matches what is already live.'

  const add = async () => {
    const username = newUser.trim()
    if (!username) { setError('Username is required.'); return }
    if (players.some(p => p.username.toLowerCase() === username.toLowerCase())) {
      setError('That username is already taken.'); return
    }
    await createPlayer({ username, display_name: newName.trim(), password: newPass })
    setNewName(''); setNewUser(''); setNewPass(''); setError('')
  }

  return (
    <Modal title="Players" onClose={close} style={{ width: 720, maxWidth: '92vw' }}>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>
        Each player logs into the published player site with their username and password.
        Link a player-character article to auto-share it (and its stat block) with them.
        The password is stored locally so it can be re-used when you publish.
      </p>

      {players.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr 1.1fr auto', gap: 8, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', paddingBottom: 4 }}>
          <span>Display name</span><span>Username</span><span>Password</span><span>Character</span><span />
        </div>
      )}
      {players.map(p => (
        <PlayerRow key={p.id} player={p} pcOptions={pcOptions} onUpdate={updatePlayer} onDelete={deletePlayer} />
      ))}
      {players.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0 12px' }}>No players yet — add one below.</div>
      )}

      {/* Add new */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
          <input className="input" value={newName} placeholder="Display name" onChange={e => setNewName(e.target.value)} style={{ height: 32 }} />
          <input className="input" value={newUser} placeholder="username" onChange={e => setNewUser(e.target.value)} style={{ height: 32 }} />
          <input className="input" value={newPass} placeholder="password" onChange={e => setNewPass(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }} style={{ height: 32 }} />
          <button className="btn btn-sm" onClick={add}><Plus size={13} /> Add player</button>
        </div>
        {error && <div style={{ fontSize: 11, color: 'var(--danger, #c0432f)', marginTop: 6 }}>{error}</div>}
      </div>

      {/* Publish */}
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <FolderOpen size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span style={{
            fontSize: 11, flex: 1, minWidth: 180, color: destination ? 'var(--text-secondary)' : 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left',
          }} title={destination ?? undefined}>
            {destination ?? 'No folder chosen yet — publishing will ask.'}
          </span>
          <button className="btn btn-sm btn-ghost" onClick={chooseFolder}>
            {destination ? 'Change folder…' : 'Choose folder…'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px' }}>
          Pick a subfolder inside the git repo you host from — the export owns that folder
          completely, so it must not be the repo root. Publishing into the same folder each
          time is what lets it clear out bundles and images it no longer produces; otherwise
          a renamed player’s old bundle stays readable with the password they already have.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, minWidth: 200 }}>
            {result?.success
              ? <span style={{ color: 'var(--gold)' }}>
                  Published {result.stats?.players} player{result.stats?.players === 1 ? '' : 's'}, {result.stats?.articles} page{result.stats?.articles === 1 ? '' : 's'}, {result.stats?.images} image{result.stats?.images === 1 ? '' : 's'}
                  {(result.stats?.pruned ?? 0) > 0 && `, ${result.stats!.pruned} stale file${result.stats!.pruned === 1 ? '' : 's'} removed`}
                  {' → '}{result.path}
                </span>
              : result?.error
                ? <span style={{ color: 'var(--danger, #c0432f)' }}>{result.error}</span>
                : 'Writes an encrypted per-player bundle you can host (e.g. GitHub Pages).'}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setPreviewOpen(true)} disabled={players.length === 0}
              title="See exactly what one player’s site will contain, without publishing">
              <Eye size={13} /> Preview as player
            </button>
            <button className="btn btn-sm" onClick={publish} disabled={publishing || players.length === 0}>
              {publishing ? <><Loader2 size={13} className="spin" /> Publishing…</> : <><Upload size={13} /> Publish</>}
            </button>
            <button className="btn btn-sm" onClick={push} disabled={pushing || !canPush}
              title={pushTitle}
              style={canPush ? { borderColor: 'var(--gold-dim)', color: 'var(--gold)' } : undefined}>
              {pushing
                ? <><Loader2 size={13} className="spin" /> Pushing…</>
                : <><CloudUpload size={13} /> Push live{pendingLabel && <span style={{ opacity: 0.8 }}> · {pendingLabel}</span>}</>}
            </button>
          </div>
        </div>

        {/* Where "live" actually means, spelled out next to the button that does it. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
          <GitBranch size={12} style={{ flexShrink: 0 }} />
          {git?.inRepo
            ? <span>
                {git.remoteUrl
                  ? <>Pushes <strong style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{git.subPath || '.'}</strong>
                      {' to '}<strong style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{git.remoteUrl}</strong>
                      {' ('}{git.branch}{')'}</>
                  : <>In a repo on <strong style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{git.branch}</strong>, but it has no remote — add one to push.</>}
              </span>
            : <span>{git?.reason ?? 'Checking…'} Publishing still works; there is just nothing to push.</span>}
        </div>

        {pushResult && (
          <div style={{ fontSize: 11, marginTop: 6, color: pushResult.success ? 'var(--gold)' : 'var(--danger, #c0432f)' }}>
            {pushResult.success
              ? (pushResult.pushed
                  ? `Pushed ${pushResult.sha} to ${pushResult.remote}/${pushResult.branch}. Your players see it once the host rebuilds.`
                  : pushResult.message)
              : <>
                  {pushResult.error}
                  {pushResult.committed && <div style={{ color: 'var(--text-muted)', marginTop: 3 }}>
                    The commit was made ({pushResult.sha}) — only the push failed, so don’t republish, just push again.
                  </div>}
                  {pushResult.hint && <div style={{ color: 'var(--text-muted)', marginTop: 3 }}>{pushResult.hint}</div>}
                </>}
          </div>
        )}

        {result?.warnings && result.warnings.length > 0 && (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 11, color: 'var(--text-muted)' }}>
            {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}
      </div>

      {previewOpen && <PlayerSitePreview onClose={() => setPreviewOpen(false)} />}

    </Modal>
  )
}
