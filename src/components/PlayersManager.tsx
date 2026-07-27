// path: src/components/PlayersManager.tsx
// DM-side manager for player-facing pages: define the players who get a curated
// per-player view (username + shared password + linked player-character article).
import { useEffect, useState } from 'react'
import { Trash2, Plus, X, Upload, Loader2 } from 'lucide-react'
import { useStore } from '../store/store'
import Modal from './Modal'
import type { Player, ArticleSummary, PublishResult } from '../types'

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

  useEffect(() => { loadPlayers(); loadAllArticles() }, [])

  const publish = async () => {
    if (!currentCampaign) return
    setPublishing(true); setResult(null)
    try {
      const r = await window.api.publishPlayerSite(currentCampaign.id)
      if (!r.canceled) setResult(r)
    } finally {
      setPublishing(false)
    }
  }

  const pcOptions = allArticles.filter(a => a.article_type === 'playerCharacter')

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
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
          {result?.success
            ? <span style={{ color: 'var(--gold)' }}>
                Published {result.stats?.players} player{result.stats?.players === 1 ? '' : 's'}, {result.stats?.articles} page{result.stats?.articles === 1 ? '' : 's'}, {result.stats?.images} image{result.stats?.images === 1 ? '' : 's'} → {result.path}
              </span>
            : result?.error
              ? <span style={{ color: 'var(--danger, #c0432f)' }}>{result.error}</span>
              : 'Writes an encrypted per-player bundle you can host (e.g. GitHub Pages).'}
        </div>
        <button className="btn btn-sm" onClick={publish} disabled={publishing || players.length === 0}>
          {publishing ? <><Loader2 size={13} className="spin" /> Publishing…</> : <><Upload size={13} /> Publish player site</>}
        </button>
      </div>
      {result?.warnings && result.warnings.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 11, color: 'var(--text-muted)' }}>
          {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
    </Modal>
  )
}
