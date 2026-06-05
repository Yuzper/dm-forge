// path: src/constants/hints.tsx
import type { ReactNode } from 'react'

// Small inline keycap for rendering link sigils / shortcuts inside hint items.
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd style={{
      fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 4, padding: '0 5px', color: 'var(--gold)', fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </kbd>
  )
}

export interface Hint {
  title: string
  items: ReactNode[]
}

// Hints keyed by context. Pages/panels set the active context via
// store.setHintContext(); the floating HintsWidget renders the match.
export const HINTS: Record<string, Hint> = {
  'campaign-hub': {
    title: 'Make this hub yours',
    items: [
      <>Use <strong>Customise</strong> (top right) to show or hide the world map and dashboard panels.</>,
      <>Panels surface recent edits, articles by type, active quests, and a session timeline at a glance.</>,
      <>After adding a world map, you can press <strong>Edit</strong> to add Points of Interest (POIs) and link sessions and wiki articles that are related to that area.</>,
      <>POI's on the world map are clickable to show the linked articles and session, which are also clickable.</>
    ],
  },

  'session': {
    title: 'Maps, pins & encounters',
    items: [
      <>Import one or multiple session map to get started.</>,
      <>Enter <strong>Edit</strong> to add Points of Interest (POIs) to the map.</>,
      <>Drag map tabs to reorder them; click a POI to open its location panel. Within these POI's you can link to articles, sessions or spells if needed.</>,
      <>Changing the POI type to <strong>Combat</strong> will add a <strong>Combatant</strong>tab where you can manage a combat encounter.</>,
      <>If you need to move a map to another session, enter <strong>Edit</strong> and click options for that map to move it to another session and all its POI's travel with it.</>,
    ],
  },

  'combat-tracker': {
    title: 'Running an encounter',
    items: [
      <>Add a creature with average or rolled HP — rows auto-sort by initiative.</>,
      <>Type initiative, click AC to override, and toggle the box to deal damage or heal.</>,
      <>Track limited-use resources per creature, and roll loot from its stat block.</>,
      <>Clicking the <Kbd>Stats</Kbd> button on a creature opens its stat block in a movable widget. Multiple different stat blocks can be opned at once.</>,
    ],
  },

  'wiki-article-read': {
    title: 'Reading vs. editing',
    items: [
      <>Articles open read-only — click <strong>Edit</strong> (top right) to make changes.</>,
      <>Changes save on their own when you hit Save or leave the article.</>,
      <>Fill in <strong>tracks</strong> (Vitality, Attitude…) to set the status shown on relation nodes and the timeline.</>,
    ],
  },

  'wiki-linking': {
    title: 'Link as you write',
    items: [
      <>Type <Kbd>[[</Kbd> to link a wiki article</>,
      <>Type <Kbd>@@</Kbd> to link a spell</>,
      <>Type <Kbd>\\</Kbd> to link a session</>,
      <>Relationships drawn in <strong>Relations</strong> show up here on their own.</>,
    ],
  },

  'timeline': {
    title: 'Getting around the timeline',
    items: [
      <>In day view, click an empty spot on the timeline to add an event on that day.</>,
      <>Click a year or era bin to zoom into it; click a stacked badge to pick from clustered items.</>,
      <>Give an article an in-world date and it shows up here automatically.</>,
      <>Use the zoom tabs, <strong>Filter</strong>, and <strong>Settings</strong> (era bands &amp; lifespans) to shape the view.</>,
    ],
  },

  'relations': {
    title: 'Mapping relationships',
    items: [
      <>Relations webs can map to all types of relationships in the world, and some custom types have been provided to make those easier to manage.</>,
      <>Included templates include family trees, organisation hierarchies which have some special features for those webs.</>,
      <>Pick a <strong>template</strong> when creating a web — family trees add union nodes, hierarchies add editable rank tiers.</>,
      <>Edges you draw here appear automatically on each linked article.</>,
      <>Drag from any of a node's four dots to connect two nodes.</>,
      <>Export the finished canvas as a PNG or SVG image.</>,
    ],
  },

  'loot-tables': {
    title: 'How loot tables work',
    items: [
      <>Tables are grouped by category in the sidebar — hit + on a category to add one there.</>,
      <>Give each item a drop chance %; tables save as you edit.</>,
      <>Attach a table to a creature's stat block, then roll it from the combat tracker.</>,
      <><strong>Reset defaults</strong> restores the built-in tables if you need them back.</>,
      <><Kbd>Creature tables</Kbd> are intended to provide a standard loot table for various creature types.</>,
      <><Kbd>Vendor tables</Kbd> are intended to provide a standard loot table for various vendor types.</>,
      <><Kbd>Location tables</Kbd> are intended to provide a standard loot table for various location types.</>,
      <><Kbd>Custom tables</Kbd> are intended for unique loot scenarios not covered by the built-in options.</>
    ],
  },

  'dmnotes': {
    title: 'Organise your notes',
    items: [
      <>Drag pages to reorder them, or drop them into a folder.</>,
      <>Notes support the same <Kbd>[[</Kbd> <Kbd>@@</Kbd> <Kbd>\\</Kbd> links as articles.</>,
    ],
  },

  'soundboard': {
    title: 'Building a soundboard',
    items: [
      <>Add ambience, music, and effect sounds; the floating widget plays them live during a session.</>,
      <>Link a board to a session so it auto-loads when you open that session.</>,
      <>Browse the bundled <strong>Default Sounds</strong> board and add any to your own.</>,
    ],
  },
}
