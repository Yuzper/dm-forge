# UI conventions

Which control to use for what, so new screens match the rest of the app. Both
designs (Classic and Journal) restyle these, so using them is what keeps a
screen looking right in both.

## Controls

| You need | Use | Not |
|---|---|---|
| An action | `.btn` (`.btn-sm` in dense places, `.btn-primary` for the one main action, `.btn-ghost` for a quiet one, `.btn-danger` to delete) | A `<button>` with hand-written padding, border and colour |
| An on/off setting in Settings | `ToggleRow` (names its state: On / Off) | A bare checkbox |
| An on/off option in a compact tool panel or a form | A native checkbox with a label | A custom switch |
| One choice from a visual set | `Tile` + `TileLabel` (with a preview) | Radio buttons |
| One choice from a few text options | `ChoiceTiles` | A `<select>` with 2–3 options |
| One choice from many options | `<select className="input">` | A `<select>` without the class |
| A number on a range | `SliderRow` in Settings; a native range input elsewhere | |
| A colour | `SwatchPicker` (or `ColorDotPicker` in tight rows); pass `swatches` for a set of its own, such as the text palettes. It throttles dragging itself, so callers can write straight to the store | A bare `<input type="color">`, or colour squares |
| Reset a group to its default | A `ToggleRow` named "Default …" (On = default) | A "Reset all" / "Automatic" link |
| A quiet header action (Reset all, Automatic, Delete) | `LinkButton` | A full button |
| Text entry | `.input` (or `.ghost-input` for inline-editable cards) | Inline-styled inputs |

`Group`, `SubLabel`, `Hint`, `ToggleRow`, `Tile`, `ChoiceTiles`, `SliderRow`,
`SettingsButton` and `LinkButton` live in `src/components/settings/settingsShared.tsx`.

## Colour

- **Accent** (`--gold` and its ramp): primary buttons, the active state of a
  choice, focus rings, icons, borders. Sections (Sessions, Wiki, DM Notes,
  Random Tables, Webs, Timeline, Soundboard) have no colour of their own; they
  all use the accent and are told apart by name and icon. Native checkboxes, radios and sliders
  take it automatically (`accent-color` in `index.css`).
- **Text colour** (`--text-primary` / `--text-secondary` / `--text-muted`):
  all words, including page titles, tab names, filter chips and button labels.
  Don't colour text with the accent to show it is active; use the border or
  fill for that.
- **Secondary colour** (`--secondary`, optional): plain buttons only. Always
  write `var(--secondary, <fallback>)`, because it is unset when "Automatic".
- **Semantic** (`--danger`, `--success`, `--warning`, `--crimson`): meanings,
  never decoration. They stay the same on every base.

## Disabled

Use the `disabled` attribute. Don't swap class names or opacity by hand: `.btn`
greys out the same way in both designs.

## Overlays on maps

Controls floating over map art (toolbars, Contents, Cast) sit on a fixed dark
overlay, so their text is a fixed light colour (`rgba(255,255,255,0.75)`), not
the theme text colour, which is dark on light bases.
