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
      <>POI's on the world map are clickable to show the linked articles and session, which are also clickable.</>,
      <>Press <Kbd>Ctrl+S</Kbd> anywhere to search the whole campaign — articles, sessions, DM notes, and map pins.</>,
      <>Press <Kbd>Ctrl+F</Kbd> to find and highlight a word on the current page.</>,
    ],
  },

  'session': {
    title: 'Maps, pins & encounters',
    items: [
      <>Import one or multiple session map to get started.</>,
      <>No map needed? Hit <strong>New Scene</strong> for a mapless text page — a tab that's just a rich-text editor. Handy for read-aloud boxed text, social/roleplay encounters, puzzles, or handouts. Scenes reorder, rename, move between sessions and delete just like maps.</>,
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
      <>Press <Kbd>Ctrl+F</Kbd> to highlight a word on a page.</>,
      <>Press <Kbd>Ctrl+S</Kbd> to search the whole campaign.</>,
    ],
  },

  'wiki-linking': {
    title: 'Link as you write',
    items: [
      <>Type <Kbd>[[</Kbd> to link a wiki article</>,
      <>Type <Kbd>@@</Kbd> to link a spell</>,
      <>Type <Kbd>\\</Kbd> to link a session</>,
      <>Or just write: start a <strong>capitalised</strong> name and a dropdown suggests matching articles — <Kbd>Tab</Kbd> or <Kbd>Enter</Kbd> to link. Names already written that match an article get a dotted underline; click it (or press <Kbd>Ctrl+Shift+L</Kbd>) to link.</>,
      <>
        The sections under the article text depend on its type:
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
          <span style={{ lineHeight: 1.4 }}><span style={{ color: 'var(--gold)', opacity: 0.5 }}>· </span>Characters — stat block, loot table</span>
          <span style={{ lineHeight: 1.4 }}><span style={{ color: 'var(--gold)', opacity: 0.5 }}>· </span>Creatures — stat block, variants (goblin, sorcerer goblin, archer goblin…), loot table</span>
          <span style={{ lineHeight: 1.4 }}><span style={{ color: 'var(--gold)', opacity: 0.5 }}>· </span>Locations — can hold multiple maps</span>
          <span style={{ lineHeight: 1.4 }}><span style={{ color: 'var(--gold)', opacity: 0.5 }}>· </span>Items — item stat block</span>
          <span style={{ lineHeight: 1.4 }}><span style={{ color: 'var(--gold)', opacity: 0.5 }}>· </span>Quests — objectives and rewards</span>
        </span>
      </>,
      <>The column to the right shows the article's overview <strong>Details, Timeline, Webs, Relations, Linked From, Tags</strong> etc.</>,
      <><Kbd>Details:</Kbd> (Vitality, Attitude…). Set their statuses for the given article, when setting a track value it will be added as a tag for that article.</>,
      <><Kbd>Timeline:</Kbd> (Birth, Events, Dates, Deaths, Destructions etc) You can add whatever events relevant for this article on the timeline from here and define what they are.</>,
      <><Kbd>Webs:</Kbd> Create a web related to this article. Example uses are a faction or religion article and you want to create a web for its hierachy.</>,
      <><Kbd>Relations:</Kbd> These are webs an article are part of. Think family trees, organizational charts, ally webs etc. These are updated automatically when added in the <strong>Relations</strong> tab.</>,
      <><Kbd>Linked From:</Kbd> This shows articles that link to the current article.</>,
      <><Kbd>Tags:</Kbd> The tags are used to categorize and filter articles in search. Custom tags can also be added at the bottom of the tracks menu.</>,
    ],
  },

  'wiki-graph': {
    title: 'Reading the graph',
    items: [
      <>Click a node to open its article; dashed nodes are broken <Kbd>[[links]]</Kbd> — click one to create that article.</>,
      <>Double-click a node to focus its neighborhood; use the depth stepper to widen it, or press <Kbd>Esc</Kbd> to clear.</>,
      <>Hover a node to trace every connection it has, including broken links and suggestions.</>,
      <>Turn on <strong>Recency</strong> to color nodes by how long since they were last edited — handy for finding stale corners.</>,
      <><strong>Suggestions</strong> surfaces article titles mentioned in prose but not yet linked. </>,
      <><strong>Hide types</strong> drops whole categories from the layout.</>,
    ],
  },

  'timeline': {
    title: 'Getting around the timeline',
    items: [
      <>Hit <strong>Add event</strong> (top right) to create an event and place it on a day.</>,
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
      <>Notes support the same <Kbd>[[</Kbd> <Kbd>@@</Kbd> <Kbd>\\</Kbd> links as articles — plus the autolink dropdown (type a capitalised name) and click-to-link underlines.</>,
      <>Press <Kbd>Ctrl+F</Kbd> to highlight a word in the open note; <Kbd>Ctrl+S</Kbd> searches all notes, articles, and sessions at once.</>,
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
