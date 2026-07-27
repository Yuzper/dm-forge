// Read-only stat block for the player's own character sheet (the only statblock
// the publish pipeline ships). Compact re-implementation of the DM app's
// StatBlockView — no shared imports, renders defensively from the raw JSON.
interface Entry { name: string; desc: string }

const ABILITIES = [['str', 'STR'], ['dex', 'DEX'], ['con', 'CON'], ['int', 'INT'], ['wis', 'WIS'], ['cha', 'CHA']] as const
const mod = (score: number) => { const m = Math.floor((score - 10) / 2); return (m >= 0 ? '+' : '') + m }

function StatLine({ label, value }: { label: string; value?: string }) {
  if (!value || !value.trim()) return null
  return <div className="sb-line"><strong>{label}</strong> {value}</div>
}

function EntrySection({ title, entries }: { title: string; entries?: Entry[] }) {
  if (!entries || entries.length === 0) return null
  return (
    <div className="sb-section">
      <div className="sb-section-title">{title}</div>
      {entries.map((e, i) => (
        <p key={i} className="sb-entry"><strong>{e.name}.</strong> {e.desc}</p>
      ))}
    </div>
  )
}

export default function StatBlock({ json }: { json: string }) {
  let sb: any
  try { sb = JSON.parse(json) } catch { return null }
  if (!sb || typeof sb !== 'object' || Array.isArray(sb)) return null

  const num = (k: string) => (typeof sb[k] === 'number' ? sb[k] : 10)
  // The editor serializes a full default block on every save, so guard against
  // an "empty" default sheet (all 10s, no HP/AC/content) rendering as noise.
  const hasData = num('hp') > 0 || num('ac') > 0 || sb.cr
    || ABILITIES.some(([k]) => typeof sb[k] === 'number' && sb[k] !== 10)
    || (sb.traits?.length) || (sb.actions?.length) || (sb.classLevels?.length)
  if (!hasData) return null

  const levelLabel = Array.isArray(sb.classLevels) && sb.classLevels.length > 0
    ? sb.classLevels.map((c: any) => `${c.cls} ${c.level}`).join(' / ')
    : (sb.classes || '')

  return (
    <div className="statblock">
      <div className="sb-head">Character Sheet{levelLabel ? ` · ${levelLabel}` : ''}</div>

      <StatLine label="Armour Class" value={sb.ac ? String(sb.ac) + (sb.acNote ? ` (${sb.acNote})` : '') : undefined} />
      <StatLine label="Hit Points" value={sb.hp ? String(sb.hp) : undefined} />
      <StatLine label="Speed" value={sb.speed} />

      <div className="sb-abilities">
        {ABILITIES.map(([k, label]) => (
          <div key={k} className="sb-abil">
            <div className="sb-abil-label">{label}</div>
            <div className="sb-abil-score">{num(k)}</div>
            <div className="sb-abil-mod">{mod(num(k))}</div>
          </div>
        ))}
      </div>

      <StatLine label="Saving Throws" value={sb.savingThrows} />
      <StatLine label="Skills" value={sb.skills} />
      <StatLine label="Senses" value={sb.senses} />
      <StatLine label="Languages" value={sb.languages} />
      <StatLine label="Damage Resistances" value={sb.damageResistances} />
      <StatLine label="Damage Immunities" value={sb.damageImmunities} />
      <StatLine label="Condition Immunities" value={sb.conditionImmunities} />

      <EntrySection title="Traits" entries={sb.traits} />
      <EntrySection title="Actions" entries={sb.actions} />
      <EntrySection title="Bonus Actions" entries={sb.bonusActions} />
      <EntrySection title="Reactions" entries={sb.reactions} />
      <EntrySection title="Legendary Actions" entries={sb.legendaryActions} />

      {(sb.cantrips?.length > 0 || sb.preparedSpells?.length > 0) && (
        <div className="sb-section">
          <div className="sb-section-title">Spells</div>
          {sb.cantrips?.length > 0 && <p className="sb-entry"><strong>Cantrips.</strong> {sb.cantrips.join(', ')}</p>}
          {sb.preparedSpells?.length > 0 && <p className="sb-entry"><strong>Prepared.</strong> {sb.preparedSpells.join(', ')}</p>}
        </div>
      )}
    </div>
  )
}
