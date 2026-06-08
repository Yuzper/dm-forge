// path: src/data/starter_monsters_2014.ts
// Starter monster wiki articles for D&D 5e 2014 (PHB / Monster Manual).
// Seeded automatically when a 2014 campaign is created.

import type { StatBlock } from '../types'

// ── Variant type ───────────────────────────────────────────────────────────────
// One entry per combat-ready variant (e.g. Goblin Warrior, Goblin Sorcerer).
// loot_table_name → master loot table name (e.g. 'Goblinoid')
// loot_items      → optional custom items on top of the master table
export interface StarterVariant {
  name: string
  cr: string
  statblock: StatBlock
  loot_table_name: string
  loot_items?: { id: string; name: string; description: string; quantity: string; chance: number }[]
}

export interface StarterMonster {
  title: string          // Parent creature article name e.g. "Goblin"
  tags: string
  tracks: Record<string, string>
  content: string
  variants: StarterVariant[]
}

/** Build a TipTap JSON doc from one or more paragraph strings. */
function p(...paragraphs: string[]): string {
  return JSON.stringify({
    type: 'doc',
    content: paragraphs.map(text => ({
      type: 'paragraph',
      content: text ? [{ type: 'text', text }] : [],
    })),
  })
}

export const STARTER_MONSTERS: StarterMonster[] = [
  {
    title: 'Goblin',
    tags: 'goblinoid,humanoid',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Humanoid', Size: 'Small', Habitat: 'Forest' },
    content: p(
      'Goblins are small, black-hearted humanoids that lair in caves, abandoned mines, despoiled dungeons, and other dismal settings. Individually weak, they gather in large, raucous bands and are selfish, cowardly, and cruel — bullying those weaker than themselves while cowering before anything stronger.',
      'Goblins are often found in the service of more powerful creatures such as hobgoblins, bugbears, orcs, or evil wizards. Their Nimble Escape allows them to disengage from combat and melt into the shadows before a counterattack can be mounted.',
    ),
    variants: [
      {
        name: 'Goblin Warrior', cr: '1/4', loot_table_name: 'Goblinoid',
        statblock: {
          ac: 15, acNote: 'leather armour, shield', hp: 7, hpDice: { count: 2, die: 6, bonus: 0 }, speed: '30 ft.',
          str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
          savingThrows: '', skills: 'Stealth +6', senses: 'Darkvision 60 ft., Passive Perception 9', languages: 'Common, Goblin',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [{ name: 'Nimble Escape', desc: 'The goblin can take the Disengage or Hide action as a bonus action on each of its turns.' }],
          actions: [
            { name: 'Scimitar', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.' },
            { name: 'Shortbow', desc: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.' },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
      {
        name: 'Goblin Boss', cr: '1', loot_table_name: 'Goblinoid',
        statblock: {
          ac: 17, acNote: 'chain shirt, shield', hp: 21, hpDice: { count: 6, die: 6, bonus: 0 }, speed: '30 ft.',
          str: 10, dex: 14, con: 10, int: 10, wis: 8, cha: 10,
          savingThrows: '', skills: 'Stealth +6', senses: 'Darkvision 60 ft., Passive Perception 9', languages: 'Common, Goblin',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [{ name: 'Nimble Escape', desc: 'The goblin can take the Disengage or Hide action as a bonus action on each of its turns.' }],
          actions: [
            { name: 'Multiattack', desc: 'The goblin boss makes two attacks with its Scimitar. The second attack can be replaced by a use of Redirect Attack.' },
            { name: 'Scimitar', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.' },
            { name: 'Javelin', desc: 'Melee or Ranged Weapon Attack: +2 to hit, reach 5 ft. or range 30/120 ft., one target. Hit: 3 (1d6) piercing damage.' },
          ],
          bonusActions: [],
          reactions: [{ name: 'Redirect Attack', desc: 'When a creature the goblin boss can see targets it with an attack, the boss chooses another goblin within 5 ft. of itself. The two goblins swap places and the chosen goblin becomes the target instead.' }],
          legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Kobold',
    tags: 'kobold,humanoid,draconic',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Humanoid', Size: 'Small', Habitat: 'Underdark' },
    content: p(
      'Kobolds are craven reptilian humanoids that worship evil dragons as demigods and serve them as minions and guards. Cowardly alone, they become emboldened in packs, using numbers and pack tactics to overwhelm foes far more powerful than themselves.',
      'Kobolds thrive in cramped spaces and are tireless trapmakers and miners. Their warrens are riddled with cunning pits and deadfalls. Sunlight hampers their effectiveness significantly.',
    ),
    variants: [
      {
        name: 'Kobold', cr: '1/8', loot_table_name: 'Goblinoid',
        statblock: {
          ac: 12, acNote: '', hp: 5, hpDice: { count: 2, die: 6, bonus: -2 }, speed: '30 ft.',
          str: 7, dex: 15, con: 9, int: 8, wis: 7, cha: 8,
          savingThrows: '', skills: '', senses: 'Darkvision 60 ft., Passive Perception 8', languages: 'Common, Draconic',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [
            { name: 'Sunlight Sensitivity', desc: 'While in sunlight, the kobold has disadvantage on attack rolls, as well as on Wisdom (Perception) checks that rely on sight.' },
            { name: 'Pack Tactics', desc: "The kobold has advantage on attack rolls against a creature if at least one of the kobold's allies is within 5 ft. of the creature and the ally isn't incapacitated." },
          ],
          actions: [
            { name: 'Dagger', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 4 (1d4 + 2) piercing damage.' },
            { name: 'Sling', desc: 'Ranged Weapon Attack: +4 to hit, range 30/120 ft., one target. Hit: 4 (1d4 + 2) bludgeoning damage.' },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Orc',
    tags: 'orc,humanoid',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Humanoid', Size: 'Medium', Habitat: 'Mountain' },
    content: p(
      'Orcs are savage raiders and pillagers with stooped postures, low foreheads, and piggish faces with prominent lower canines that resemble tusks. They gather in tribes that plunder from settlements and each other, delighting in slaughter and carnage.',
      'An orc tribe is led by its most powerful warrior. Many bear ritual scarification in honour of Gruumsh, a one-eyed god of slaughter. Their Aggressive trait makes them terrifying in open combat.',
    ),
    variants: [
      {
        name: 'Orc Warrior', cr: '1/2', loot_table_name: 'Goblinoid',
        statblock: {
          ac: 13, acNote: 'hide armour', hp: 15, hpDice: { count: 2, die: 8, bonus: 6 }, speed: '30 ft.',
          str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10,
          savingThrows: '', skills: 'Intimidation +2', senses: 'Darkvision 60 ft., Passive Perception 10', languages: 'Common, Orc',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [{ name: 'Aggressive', desc: 'As a bonus action, the orc can move up to its speed toward a hostile creature that it can see.' }],
          actions: [
            { name: 'Greataxe', desc: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 9 (1d12 + 3) slashing damage.' },
            { name: 'Javelin', desc: 'Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 30/120 ft., one target. Hit: 6 (1d6 + 3) piercing damage.' },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Hobgoblin',
    tags: 'goblinoid,humanoid',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Humanoid', Size: 'Medium', Habitat: 'Mountain' },
    content: p(
      'Hobgoblins are the disciplined, militaristic cousins of goblins — taller, stronger, and organised into rigid warbands ruled by martial law. Where goblins squabble, hobgoblins drill; where goblins flee, hobgoblins hold the line.',
      'A hobgoblin legion fights in tight formation, and their Martial Advantage lets them tear into any foe their allies have surrounded. They make natural commanders for mixed goblinoid forces.',
    ),
    variants: [
      {
        name: 'Hobgoblin', cr: '1/2', loot_table_name: 'Goblinoid',
        statblock: {
          ac: 18, acNote: 'chain mail, shield', hp: 11, hpDice: { count: 2, die: 8, bonus: 2 }, speed: '30 ft.',
          str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 9,
          savingThrows: '', skills: '', senses: 'Darkvision 60 ft., Passive Perception 10', languages: 'Common, Goblin',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [{ name: 'Martial Advantage', desc: "Once per turn, the hobgoblin can deal an extra 7 (2d6) damage to a creature it hits with a weapon attack if that creature is within 5 ft. of an ally of the hobgoblin that isn't incapacitated." }],
          actions: [
            { name: 'Longsword', desc: 'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 5 (1d8 + 1) slashing damage, or 6 (1d10 + 1) slashing damage if used with two hands.' },
            { name: 'Longbow', desc: 'Ranged Weapon Attack: +3 to hit, range 150/600 ft., one target. Hit: 5 (1d8 + 1) piercing damage.' },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Bugbear',
    tags: 'goblinoid,humanoid',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Humanoid', Size: 'Medium', Habitat: 'Forest' },
    content: p(
      'Bugbears are the largest and most brutish of the goblinoids — hulking, hairy ambushers who creep through the dark on surprisingly silent feet before falling upon their prey. They are bullies by nature and often lord over goblin warrens as chiefs.',
      'A bugbear hits hardest the instant a fight begins. Its Surprise Attack rewards patience and stealth, and its Brute build means every blow lands with savage force.',
    ),
    variants: [
      {
        name: 'Bugbear', cr: '1', loot_table_name: 'Goblinoid',
        statblock: {
          ac: 16, acNote: 'hide armour, shield', hp: 27, hpDice: { count: 5, die: 8, bonus: 5 }, speed: '30 ft.',
          str: 15, dex: 14, con: 13, int: 8, wis: 11, cha: 9,
          savingThrows: '', skills: 'Stealth +6, Survival +2', senses: 'Darkvision 60 ft., Passive Perception 10', languages: 'Common, Goblin',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [
            { name: 'Brute', desc: 'A melee weapon deals one extra die of its damage when the bugbear hits with it (included in the attacks below).' },
            { name: 'Surprise Attack', desc: 'If the bugbear surprises a creature and hits it with an attack during the first round of combat, the target takes an extra 7 (2d6) damage from the attack.' },
          ],
          actions: [
            { name: 'Morningstar', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 11 (2d8 + 2) piercing damage.' },
            { name: 'Javelin', desc: 'Melee or Ranged Weapon Attack: +4 to hit, reach 5 ft. or range 30/120 ft., one target. Hit: 9 (2d6 + 2) piercing damage in melee, or 5 (1d6 + 2) piercing damage at range.' },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Drow',
    tags: 'elf,humanoid',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Humanoid', Size: 'Medium', Habitat: 'Underdark' },
    content: p(
      'Drow are dark elves who dwell in the lightless depths of the Underdark, worshipping the Spider Queen and scheming endlessly against rival houses. Cruel, patient, and proud, they raid the surface under cover of night and vanish before dawn.',
      'A drow scout fights from the shadows, loosing poisoned bolts to drop sentries silently. Faerie Fire and Darkness let it control the battlefield, but sunlight leaves it dazzled and vulnerable.',
    ),
    variants: [
      {
        name: 'Drow Scout', cr: '1/4', loot_table_name: 'Goblinoid',
        statblock: {
          ac: 15, acNote: 'chain shirt', hp: 13, hpDice: { count: 3, die: 8, bonus: 0 }, speed: '30 ft.',
          str: 10, dex: 14, con: 10, int: 11, wis: 11, cha: 12,
          savingThrows: '', skills: 'Perception +2, Stealth +4', senses: 'Darkvision 120 ft., Passive Perception 12', languages: 'Elvish, Undercommon',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [
            { name: 'Fey Ancestry', desc: "The drow has advantage on saving throws against being charmed, and magic can't put it to sleep." },
            { name: 'Innate Spellcasting', desc: "The drow's spellcasting ability is Charisma (spell save DC 11). It can innately cast the following spells, requiring no material components: At will: Dancing Lights. 1/day each: Darkness, Faerie Fire." },
            { name: 'Sunlight Sensitivity', desc: 'While in sunlight, the drow has disadvantage on attack rolls, as well as on Wisdom (Perception) checks that rely on sight.' },
          ],
          actions: [
            { name: 'Shortsword', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.' },
            { name: 'Hand Crossbow', desc: 'Ranged Weapon Attack: +4 to hit, range 30/120 ft., one target. Hit: 5 (1d6 + 2) piercing damage, and the target must succeed on a DC 13 Constitution saving throw or be poisoned for 1 hour. If the save fails by 5 or more, the target is also unconscious while poisoned in this way; it wakes if it takes damage or another creature uses an action to shake it awake.' },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Skeleton',
    tags: 'undead,animated',
    tracks: { Vitality: 'Unknown', Disposition: 'Hostile', Creature_Type: 'Undead', Size: 'Medium', Habitat: 'Underdark' },
    content: p(
      'Skeletons arise when animate dead or a similar spell is cast on humanoid bones. They mindlessly obey their creator, attacking any living creature that is not their master.',
      'Skeletons have no self-preservation instinct. They fight until destroyed, never retreating or surrendering. They are immune to poison and exhaustion.',
    ),
    variants: [
      {
        name: 'Skeleton', cr: '1/4', loot_table_name: 'Undead',
        statblock: {
          ac: 13, acNote: 'armour scraps', hp: 13, hpDice: { count: 2, die: 8, bonus: 4 }, speed: '30 ft.',
          str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5,
          savingThrows: '', skills: '', senses: 'Darkvision 60 ft., Passive Perception 9', languages: 'understands languages it knew in life but cannot speak',
          damageImmunities: 'Poison', damageResistances: '', conditionImmunities: 'Exhaustion, Poisoned',
          traits: [],
          actions: [
            { name: 'Shortsword', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.' },
            { name: 'Shortbow', desc: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.' },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Zombie',
    tags: 'undead,animated',
    tracks: { Vitality: 'Unknown', Disposition: 'Hostile', Creature_Type: 'Undead', Size: 'Medium', Habitat: 'Swamp' },
    content: p(
      'Zombies are among the most common of undead creatures. Slow and mindless, they serve as foot soldiers for necromancers and other dark masters, shambling toward living creatures to destroy them.',
      'A zombie obeys simple commands from its creator. The most dangerous quality of a zombie is its Undead Fortitude — the ability to shrug off mortal blows and keep attacking.',
    ),
    variants: [
      {
        name: 'Zombie', cr: '1/4', loot_table_name: 'Undead',
        statblock: {
          ac: 8, acNote: '', hp: 22, hpDice: { count: 3, die: 8, bonus: 9 }, speed: '20 ft.',
          str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5,
          savingThrows: 'Wis +0', skills: '', senses: 'Darkvision 60 ft., Passive Perception 8', languages: 'understands languages it knew in life but cannot speak',
          damageImmunities: 'Poison', damageResistances: '', conditionImmunities: 'Poisoned',
          traits: [{ name: 'Undead Fortitude', desc: 'If damage reduces the zombie to 0 HP, it must make a Con save with a DC of 5 + the damage taken, unless the damage is radiant or from a critical hit. On a success, the zombie drops to 1 HP instead.' }],
          actions: [{ name: 'Slam', desc: 'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) bludgeoning damage.' }],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Wight',
    tags: 'undead',
    tracks: { Vitality: 'Unknown', Disposition: 'Hostile', Creature_Type: 'Undead', Size: 'Medium', Habitat: 'Underdark' },
    content: p(
      'A wight is the corpse of a once-mighty warrior or villain, animated by a foul hunger for life itself. Retaining cunning and skill from its mortal days, it commands lesser undead and raises the humanoids it slays as zombie thralls.',
      'A wight is a dangerous mini-boss: its Life Drain permanently lowers a victim\'s maximum hit points, and anyone it kills rises a day later to serve it. Destroy it quickly, before its undead horde grows.',
    ),
    variants: [
      {
        name: 'Wight', cr: '3', loot_table_name: 'Undead',
        statblock: {
          ac: 14, acNote: 'studded leather', hp: 45, hpDice: { count: 6, die: 8, bonus: 18 }, speed: '30 ft.',
          str: 15, dex: 14, con: 16, int: 10, wis: 13, cha: 15,
          savingThrows: '', skills: 'Perception +3, Stealth +4', senses: 'Darkvision 60 ft., Passive Perception 13', languages: 'the languages it knew in life',
          damageImmunities: 'Poison', damageResistances: "Necrotic; bludgeoning, piercing, and slashing from nonmagical attacks that aren't silvered", conditionImmunities: 'Exhaustion, Poisoned',
          traits: [{ name: 'Sunlight Sensitivity', desc: 'While in sunlight, the wight has disadvantage on attack rolls, as well as on Wisdom (Perception) checks that rely on sight.' }],
          actions: [
            { name: 'Multiattack', desc: 'The wight makes two Longsword or Longbow attacks. It can use Life Drain in place of one Longsword attack.' },
            { name: 'Life Drain', desc: "Melee Weapon Attack: +4 to hit, reach 5 ft., one creature. Hit: 5 (1d6 + 2) necrotic damage. The target must succeed on a DC 13 Constitution saving throw or its hit point maximum is reduced by an amount equal to the damage taken. This reduction lasts until the target finishes a long rest. The target dies if this effect reduces its hit point maximum to 0. A humanoid slain by this attack rises 24 hours later as a zombie under the wight's control, unless the humanoid is restored to life or its body is destroyed." },
            { name: 'Longsword', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 6 (1d8 + 2) slashing damage, or 7 (1d10 + 2) slashing damage if used with two hands.' },
            { name: 'Longbow', desc: 'Ranged Weapon Attack: +4 to hit, range 150/600 ft., one target. Hit: 6 (1d8 + 2) piercing damage.' },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Shadow',
    tags: 'undead,incorporeal',
    tracks: { Vitality: 'Unknown', Disposition: 'Hostile', Creature_Type: 'Undead', Size: 'Medium', Habitat: 'Underdark' },
    content: p(
      'A shadow is a malevolent shade of darkness, all that remains of a creature whose life was consumed by undeath or despair. It drifts through gloomy ruins and forgotten tombs, draining the strength of the living until they too collapse into shadow.',
      'Shadows are terrifying in dim light: they Hide as a bonus action and slip through the narrowest cracks. Their Strength Drain can leave a hero helpless, and a victim drained to nothing rises as a new shadow. Bring light — they are vulnerable to radiant damage.',
    ),
    variants: [
      {
        name: 'Shadow', cr: '1/2', loot_table_name: 'Undead',
        statblock: {
          ac: 12, acNote: '', hp: 16, hpDice: { count: 3, die: 8, bonus: 3 }, speed: '40 ft.',
          str: 6, dex: 14, con: 13, int: 6, wis: 10, cha: 8,
          savingThrows: '', skills: 'Stealth +4 (+6 in dim light or darkness)', senses: 'Darkvision 60 ft., Passive Perception 10', languages: '—',
          damageImmunities: 'Necrotic, Poison', damageResistances: 'Acid, cold, fire, lightning, thunder; bludgeoning, piercing, and slashing from nonmagical attacks', conditionImmunities: 'Exhaustion, Frightened, Grappled, Paralyzed, Petrified, Poisoned, Prone, Restrained',
          traits: [
            { name: 'Amorphous', desc: 'The shadow can move through a space as narrow as 1 inch wide without squeezing.' },
            { name: 'Shadow Stealth', desc: 'While in dim light or darkness, the shadow can take the Hide action as a bonus action.' },
            { name: 'Sunlight Weakness', desc: 'While in sunlight, the shadow has disadvantage on attack rolls, ability checks, and saving throws.' },
          ],
          actions: [
            { name: 'Strength Drain', desc: "Melee Weapon Attack: +4 to hit, reach 5 ft., one creature. Hit: 9 (2d6 + 2) necrotic damage, and the target's Strength score is reduced by 1d4. The target dies if this reduces its Strength to 0. Otherwise, the reduction lasts until the target finishes a short or long rest. If a non-evil humanoid dies from this attack, a new shadow rises from the corpse 1d4 hours later." },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Ghoul',
    tags: 'undead',
    tracks: { Vitality: 'Unknown', Disposition: 'Hostile', Creature_Type: 'Undead', Size: 'Medium', Habitat: 'Underdark' },
    content: p(
      'Ghouls are ravenous undead that haunt graveyards, crypts, and battlefields, driven by an insatiable hunger for the flesh of the living. They hunt in packs, overwhelming victims with raking claws and a paralysing bite.',
      "A ghoul's touch can freeze a victim in place, leaving them helpless while the pack feasts. Elves are immune to this paralysis — everyone else should fear being caught alone.",
    ),
    variants: [
      {
        name: 'Ghoul', cr: '1', loot_table_name: 'Undead',
        statblock: {
          ac: 12, acNote: '', hp: 22, hpDice: { count: 5, die: 8, bonus: 0 }, speed: '30 ft.',
          str: 13, dex: 15, con: 10, int: 7, wis: 10, cha: 6,
          savingThrows: '', skills: '', senses: 'Darkvision 60 ft., Passive Perception 10', languages: 'Common',
          damageImmunities: 'Poison', damageResistances: '', conditionImmunities: 'Charmed, Exhaustion, Poisoned',
          traits: [],
          actions: [
            { name: 'Bite', desc: 'Melee Weapon Attack: +2 to hit, reach 5 ft., one target. Hit: 9 (2d6 + 2) piercing damage.' },
            { name: 'Claws', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) slashing damage. If the target is a creature other than an elf or undead, it must succeed on a DC 10 Constitution saving throw or be paralyzed for 1 minute. The target can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success.' },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Wolf',
    tags: 'beast,predator',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Beast', Size: 'Medium', Habitat: 'Forest' },
    content: p(
      'Wolves are pack hunters found in temperate forests, hills, and plains. They are intelligent enough to coordinate attacks, using pack tactics to bring down prey far larger than themselves.',
      'Wolves are frequently used as mounts or hunting animals by goblinoids and other monstrous races. Their keen senses make them excellent trackers. The dire wolf — a pony-sized cousin — is prized as a fearsome mount and hits far harder.',
    ),
    variants: [
      {
        name: 'Wolf', cr: '1/4', loot_table_name: 'Beast',
        statblock: {
          ac: 13, acNote: 'natural armour', hp: 11, hpDice: { count: 2, die: 8, bonus: 2 }, speed: '40 ft.',
          str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6,
          savingThrows: '', skills: 'Perception +3, Stealth +4', senses: 'Passive Perception 13', languages: '—',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [
            { name: 'Keen Hearing and Smell', desc: 'The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell.' },
            { name: 'Pack Tactics', desc: "The wolf has advantage on attack rolls against a creature if at least one of the wolf's allies is within 5 ft. of the creature and the ally isn't incapacitated." },
          ],
          actions: [{ name: 'Bite', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage. If the target is a creature, it must succeed on a DC 11 Str saving throw or be knocked prone.' }],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
      {
        name: 'Dire Wolf', cr: '1', loot_table_name: 'Beast',
        statblock: {
          ac: 14, acNote: 'natural armour', hp: 37, hpDice: { count: 5, die: 10, bonus: 10 }, speed: '50 ft.',
          str: 17, dex: 15, con: 15, int: 3, wis: 12, cha: 7,
          savingThrows: '', skills: 'Perception +3, Stealth +4', senses: 'Passive Perception 13', languages: '—',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [
            { name: 'Keen Hearing and Smell', desc: 'The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell.' },
            { name: 'Pack Tactics', desc: "The wolf has advantage on an attack roll against a creature if at least one of the wolf's allies is within 5 ft. of the creature and the ally isn't incapacitated." },
          ],
          actions: [{ name: 'Bite', desc: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 10 (2d6 + 3) piercing damage. If the target is a creature, it must succeed on a DC 13 Strength saving throw or be knocked prone.' }],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Giant Spider',
    tags: 'beast,predator,venomous',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Beast', Size: 'Large', Habitat: 'Forest' },
    content: p(
      'Giant spiders lurk in deep caves, abandoned ruins, and the canopies of dark forests. They spin webs to trap prey, then inject paralytic venom before wrapping their victims for later consumption.',
      'Giant spiders are favoured by drow and other subterranean races as guard animals and mounts. Their ability to climb any surface makes them terrifying in dungeons.',
    ),
    variants: [
      {
        name: 'Giant Spider', cr: '1', loot_table_name: 'Beast',
        statblock: {
          ac: 14, acNote: 'natural armour', hp: 26, hpDice: { count: 4, die: 10, bonus: 4 }, speed: '30 ft., climb 30 ft.',
          str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4,
          savingThrows: '', skills: 'Stealth +7', senses: 'Blindsight 10 ft., Darkvision 60 ft., Passive Perception 10', languages: '—',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [
            { name: 'Spider Climb', desc: 'The spider can climb difficult surfaces, including upside down on ceilings, without needing to make an ability check.' },
            { name: 'Web Sense', desc: 'While in contact with a web, the spider knows the exact location of any other creature in contact with the same web.' },
            { name: 'Web Walker', desc: 'The spider ignores movement restrictions caused by webbing.' },
          ],
          actions: [
            { name: 'Bite', desc: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one creature. Hit: 7 (1d8 + 3) piercing damage, and the target must make a DC 11 Con saving throw, taking 9 (2d8) poison damage on a failed save, or half on a success. If the poison damage reduces the target to 0 HP, the target is stable but poisoned for 1 hour, even after regaining HP, and is paralyzed while poisoned in this way.' },
            { name: 'Web (Recharge 5–6)', desc: 'Ranged Weapon Attack: +5 to hit, range 30/60 ft., one creature. Hit: The target is restrained by webbing. As an action, the restrained target can make a DC 12 Str check, bursting the webbing on a success.' },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Brown Bear',
    tags: 'beast',
    tracks: { Vitality: 'Living', Disposition: 'Neutral', Creature_Type: 'Beast', Size: 'Large', Habitat: 'Forest' },
    content: p(
      'Brown bears are powerful omnivores that roam forests, hills, and mountains. Territorial and short-tempered, they are not malevolent — but a startled or hungry bear is one of the deadliest natural hazards a low-level party can face.',
      'A brown bear makes a classic wilderness encounter: a wandering threat that can be fought, frightened off, or avoided entirely. Its claws hit hard enough to maul an unarmoured adventurer in a single round.',
    ),
    variants: [
      {
        name: 'Brown Bear', cr: '1', loot_table_name: 'Beast',
        statblock: {
          ac: 11, acNote: 'natural armour', hp: 34, hpDice: { count: 4, die: 10, bonus: 12 }, speed: '40 ft., climb 30 ft.',
          str: 19, dex: 10, con: 16, int: 2, wis: 13, cha: 7,
          savingThrows: '', skills: 'Perception +3', senses: 'Passive Perception 13', languages: '—',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [{ name: 'Keen Smell', desc: 'The bear has advantage on Wisdom (Perception) checks that rely on smell.' }],
          actions: [
            { name: 'Multiattack', desc: 'The bear makes two attacks: one with its Bite and one with its Claws.' },
            { name: 'Bite', desc: 'Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 8 (1d8 + 4) piercing damage.' },
            { name: 'Claws', desc: 'Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 11 (2d6 + 4) slashing damage.' },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Swarm of Rats',
    tags: 'beast,swarm',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Beast', Size: 'Medium', Habitat: 'Urban' },
    content: p(
      'A swarm of rats is a writhing carpet of fur, teeth, and disease that boils up out of sewers, cellars, and dungeon drains. Individually harmless, together they can strip a helpless creature to the bone.',
      'Swarms resist ordinary weapons — a sword can only kill so many rats at once — making area effects and torches far more effective. They pair naturally with a giant rat or a wererat lurking nearby.',
    ),
    variants: [
      {
        name: 'Swarm of Rats', cr: '1/4', loot_table_name: 'Beast',
        statblock: {
          ac: 10, acNote: '', hp: 24, hpDice: { count: 7, die: 8, bonus: -7 }, speed: '30 ft.',
          str: 9, dex: 11, con: 9, int: 2, wis: 10, cha: 3,
          savingThrows: '', skills: '', senses: 'Darkvision 30 ft., Passive Perception 10', languages: '—',
          damageImmunities: '', damageResistances: 'Bludgeoning, piercing, slashing', conditionImmunities: 'Charmed, Frightened, Grappled, Paralyzed, Petrified, Prone, Restrained, Stunned',
          traits: [
            { name: 'Keen Smell', desc: 'The swarm has advantage on Wisdom (Perception) checks that rely on smell.' },
            { name: 'Swarm', desc: "The swarm can occupy another creature's space and vice versa, and the swarm can move through any opening large enough for a Tiny rat. The swarm can't regain hit points or gain temporary hit points." },
          ],
          actions: [{ name: 'Bites', desc: "Melee Weapon Attack: +2 to hit, reach 0 ft., one target in the swarm's space. Hit: 7 (2d6) piercing damage, or 3 (1d6) piercing damage if the swarm has half of its hit points or fewer." }],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Owlbear',
    tags: 'monstrosity,predator',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Monstrosity', Size: 'Large', Habitat: 'Forest' },
    content: p(
      'The owlbear is a monstrous hybrid with the body of a bear and the head of a giant owl, infamous for its foul temper and territorial fury. Its origins are a mystery, but its ferocity is legendary — few sounds in the wild are as terrifying as its shrieking hoot-roar.',
      "One of D&D's most iconic monsters, the owlbear is a perfect mid-level wilderness threat. Its keen senses make it nearly impossible to sneak past, and its powerful beak and claws can shred a careless party.",
    ),
    variants: [
      {
        name: 'Owlbear', cr: '3', loot_table_name: 'Beast',
        statblock: {
          ac: 13, acNote: 'natural armour', hp: 59, hpDice: { count: 7, die: 10, bonus: 21 }, speed: '40 ft.',
          str: 20, dex: 12, con: 17, int: 3, wis: 12, cha: 7,
          savingThrows: '', skills: 'Perception +3', senses: 'Darkvision 60 ft., Passive Perception 13', languages: '—',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [{ name: 'Keen Sight and Smell', desc: 'The owlbear has advantage on Wisdom (Perception) checks that rely on sight or smell.' }],
          actions: [
            { name: 'Multiattack', desc: 'The owlbear makes two attacks: one with its Beak and one with its Claws.' },
            { name: 'Beak', desc: 'Melee Weapon Attack: +7 to hit, reach 5 ft., one creature. Hit: 10 (1d10 + 5) piercing damage.' },
            { name: 'Claws', desc: 'Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 14 (2d8 + 5) slashing damage.' },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Mimic',
    tags: 'monstrosity,shapechanger',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Monstrosity', Size: 'Medium', Habitat: 'Underdark' },
    content: p(
      "Mimics are shapeshifting predators that disguise themselves as ordinary objects — most famously treasure chests — and wait patiently for prey to draw near. When a victim reaches out, the mimic's surface turns to crushing flesh and adhesive slime.",
      'A mimic is the ultimate trap-and-puzzle monster: it punishes greedy adventurers who grab loot without checking. Its Adhesive grip and acidic bite can pin and dissolve a careless hero before the party realises the chest is alive.',
    ),
    variants: [
      {
        name: 'Mimic (Chest)', cr: '2', loot_table_name: 'Beast',
        statblock: {
          ac: 12, acNote: 'natural armour', hp: 58, hpDice: { count: 9, die: 8, bonus: 18 }, speed: '15 ft.',
          str: 17, dex: 12, con: 15, int: 5, wis: 13, cha: 8,
          savingThrows: '', skills: 'Stealth +5', senses: 'Darkvision 60 ft., Passive Perception 11', languages: '—',
          damageImmunities: 'Acid', damageResistances: '', conditionImmunities: 'Prone',
          traits: [
            { name: 'Shapechanger', desc: "The mimic can use its action to polymorph into an object or back into its true, amorphous form. Its statistics are the same in each form. Any equipment it is wearing or carrying isn't transformed. It reverts to its true form if it dies." },
            { name: 'Adhesive (Object Form Only)', desc: 'The mimic adheres to anything that touches it. A Huge or smaller creature adhered to the mimic is also grappled by it (escape DC 13). Ability checks made to escape this grapple have disadvantage.' },
            { name: 'False Appearance (Object Form Only)', desc: 'While the mimic remains motionless, it is indistinguishable from an ordinary object.' },
            { name: 'Grappler', desc: 'The mimic has advantage on attack rolls against any creature grappled by it.' },
          ],
          actions: [
            { name: 'Pseudopod', desc: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) bludgeoning damage. If the mimic is in object form, the target is subjected to the mimic's Adhesive trait." },
            { name: 'Bite', desc: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) piercing damage plus 4 (1d8) acid damage.' },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Harpy',
    tags: 'monstrosity',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Monstrosity', Size: 'Medium', Habitat: 'Mountain' },
    content: p(
      'Harpies are cruel, filthy predators with the bodies of vultures and the torsos and faces of hags. They lure travellers to their doom with an enchanting song, then feast on the dazed victims who wander helplessly into their clutches.',
      'A harpy makes a memorable cliff, ruin, or island encounter: its Luring Song can split a party and march charmed heroes off a ledge or into a trap. Deal with the song quickly — or watch your allies walk to their deaths.',
    ),
    variants: [
      {
        name: 'Harpy', cr: '1', loot_table_name: 'Beast',
        statblock: {
          ac: 11, acNote: '', hp: 38, hpDice: { count: 7, die: 8, bonus: 7 }, speed: '20 ft., fly 40 ft.',
          str: 12, dex: 13, con: 12, int: 7, wis: 10, cha: 13,
          savingThrows: '', skills: '', senses: 'Passive Perception 10', languages: 'Common',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [],
          actions: [
            { name: 'Multiattack', desc: 'The harpy makes two attacks: one with its Claws and one with its Club.' },
            { name: 'Claws', desc: 'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 6 (2d4 + 1) slashing damage.' },
            { name: 'Club', desc: 'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 3 (1d4 + 1) bludgeoning damage.' },
            { name: 'Luring Song', desc: "The harpy sings a magical melody. Every humanoid and giant within 300 ft. of the harpy that can hear the song must succeed on a DC 11 Wisdom saving throw or be charmed until the song ends. The harpy must take a bonus action on its subsequent turns to continue singing, and can stop singing at any time. The song ends if the harpy is incapacitated. While charmed, a target is incapacitated and ignores the songs of other harpies, and must move toward the harpy by the most direct route on its turn (it does not avoid hazards or opportunity attacks). A target can repeat the saving throw at the end of each of its turns, becoming immune to this harpy's song for 24 hours on a success." },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Troll',
    tags: 'giant',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Giant', Size: 'Large', Habitat: 'Swamp' },
    content: p(
      'Trolls are voracious, loping giants with rubbery green hide and an insatiable hunger. What makes them truly terrifying is their regeneration — a troll knits its wounds shut in seconds, and even severed limbs crawl back to rejoin the body.',
      'The troll is the classic monster for teaching players about elemental weaknesses: only fire or acid can stop its regeneration. Hit it with a torch or a vial of acid, or it will simply stand back up, again and again.',
    ),
    variants: [
      {
        name: 'Troll', cr: '5', loot_table_name: 'Beast',
        statblock: {
          ac: 15, acNote: 'natural armour', hp: 84, hpDice: { count: 8, die: 10, bonus: 40 }, speed: '30 ft.',
          str: 18, dex: 13, con: 20, int: 7, wis: 9, cha: 7,
          savingThrows: '', skills: 'Perception +2', senses: 'Darkvision 60 ft., Passive Perception 12', languages: 'Giant',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [
            { name: 'Keen Smell', desc: 'The troll has advantage on Wisdom (Perception) checks that rely on smell.' },
            { name: 'Regeneration', desc: "The troll regains 10 hit points at the start of its turn. If the troll takes acid or fire damage, this trait doesn't function at the start of the troll's next turn. The troll dies only if it starts its turn with 0 hit points and doesn't regenerate." },
          ],
          actions: [
            { name: 'Multiattack', desc: 'The troll makes three attacks: one with its Bite and two with its Claws.' },
            { name: 'Bite', desc: 'Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 7 (1d6 + 4) piercing damage.' },
            { name: 'Claws', desc: 'Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 11 (2d6 + 4) slashing damage.' },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Bandit',
    tags: 'humanoid,npc',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Humanoid', Size: 'Medium', Habitat: 'Urban' },
    content: p(
      'Bandits rove in gangs and are sometimes led by thugs, veterans, or spellcasters. Not all are evil — poverty or desperation may drive individuals to a life of banditry.',
      'Use this stat block for highwaymen on a road, pirates aboard a vessel, or hired muscle in a tavern brawl.',
    ),
    variants: [
      {
        name: 'Bandit', cr: '1/8', loot_table_name: 'Bandit',
        statblock: {
          ac: 12, acNote: 'leather armour', hp: 11, hpDice: { count: 2, die: 8, bonus: 2 }, speed: '30 ft.',
          str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10,
          savingThrows: '', skills: '', senses: 'Passive Perception 10', languages: 'any one language (usually Common)',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [],
          actions: [
            { name: 'Scimitar', desc: 'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) slashing damage.' },
            { name: 'Light Crossbow', desc: 'Ranged Weapon Attack: +3 to hit, range 80/320 ft., one target. Hit: 5 (1d8 + 1) piercing damage.' },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
      {
        name: 'Thug', cr: '1/2', loot_table_name: 'Bandit',
        statblock: {
          ac: 11, acNote: 'leather armour', hp: 32, hpDice: { count: 5, die: 8, bonus: 10 }, speed: '30 ft.',
          str: 15, dex: 11, con: 14, int: 10, wis: 10, cha: 11,
          savingThrows: '', skills: 'Intimidation +2', senses: 'Passive Perception 10', languages: 'any one language (usually Common)',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [{ name: 'Pack Tactics', desc: "The thug has advantage on an attack roll against a creature if at least one of the thug's allies is within 5 ft. of the creature and the ally isn't incapacitated." }],
          actions: [
            { name: 'Multiattack', desc: 'The thug makes two Mace attacks.' },
            { name: 'Mace', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) bludgeoning damage.' },
            { name: 'Heavy Crossbow', desc: 'Ranged Weapon Attack: +2 to hit, range 100/400 ft., one target. Hit: 5 (1d10) piercing damage.' },
          ],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Guard',
    tags: 'humanoid,npc',
    tracks: { Vitality: 'Living', Disposition: 'Neutral', Creature_Type: 'Humanoid', Size: 'Medium', Habitat: 'Urban' },
    content: p(
      'Guards include members of a city watch, sentries in a citadel, and soldiers in a lord\'s army. Their job is to protect their post and raise the alarm — not to fight to the death.',
      'Use guards to populate castles, city gates, noble estates, and merchant warehouses.',
    ),
    variants: [
      {
        name: 'Guard', cr: '1/8', loot_table_name: 'Soldier / Guard',
        statblock: {
          ac: 16, acNote: 'chain shirt, shield', hp: 11, hpDice: { count: 2, die: 8, bonus: 2 }, speed: '30 ft.',
          str: 13, dex: 12, con: 12, int: 10, wis: 11, cha: 10,
          savingThrows: '', skills: 'Perception +2', senses: 'Passive Perception 12', languages: 'any one language (usually Common)',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [],
          actions: [{ name: 'Spear', desc: 'Melee or Ranged Weapon Attack: +3 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 4 (1d6 + 1) piercing damage, or 5 (1d8 + 1) piercing damage if used with two hands to make a melee attack.' }],
          bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
  {
    title: 'Knight',
    tags: 'humanoid,npc',
    tracks: { Vitality: 'Living', Disposition: 'Neutral', Creature_Type: 'Humanoid', Size: 'Medium', Habitat: 'Urban' },
    content: p(
      'Knights are martial commanders sworn to a lord, a temple, or a cause. Clad in plate and trained from youth, they lead soldiers into battle and uphold (or enforce) the codes of their masters. A knight may be a noble ally or an armoured antagonist.',
      "Use a knight as a captain of the guard, a questgiver, a tournament champion, or a villain's lieutenant. Its Leadership ability makes any accompanying soldiers far more dangerous, and Parry lets it shrug off a telling blow.",
    ),
    variants: [
      {
        name: 'Knight', cr: '3', loot_table_name: 'Soldier / Guard',
        statblock: {
          ac: 18, acNote: 'plate armour', hp: 52, hpDice: { count: 8, die: 8, bonus: 16 }, speed: '30 ft.',
          str: 16, dex: 11, con: 14, int: 11, wis: 11, cha: 15,
          savingThrows: 'Con +4, Wis +2', skills: '', senses: 'Passive Perception 10', languages: 'any one language (usually Common)',
          damageImmunities: '', damageResistances: '', conditionImmunities: '',
          traits: [{ name: 'Brave', desc: 'The knight has advantage on saving throws against being frightened.' }],
          actions: [
            { name: 'Multiattack', desc: 'The knight makes two melee attacks.' },
            { name: 'Greatsword', desc: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 10 (2d6 + 3) slashing damage.' },
            { name: 'Heavy Crossbow', desc: 'Ranged Weapon Attack: +2 to hit, range 100/400 ft., one target. Hit: 5 (1d10) piercing damage.' },
            { name: 'Leadership (Recharge 5–6)', desc: 'For 1 minute, the knight can utter a special command or warning whenever a nonhostile creature that it can see within 30 ft. of it makes an attack roll or a saving throw. The creature can add a d4 to its roll provided it can hear and understand the knight. A creature can benefit from only one Leadership die at a time. This effect ends if the knight is incapacitated.' },
          ],
          bonusActions: [],
          reactions: [{ name: 'Parry', desc: 'The knight adds 2 to its AC against one melee attack that would hit it. To do so, the knight must see the attacker and be wielding a melee weapon.' }],
          legendaryActions: [], cantrips: [], preparedSpells: [],
        },
      },
    ],
  },
]