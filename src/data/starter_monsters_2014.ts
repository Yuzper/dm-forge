// path: src/data/starter_monsters_2014.ts
// Starter monster wiki articles for D&D 5e 2014 (PHB / Monster Manual).
// Seeded automatically when a 2014 campaign is created.

import type { StatBlock } from '../types'

export interface StarterMonster {
  title: string
  tags: string
  tracks: Record<string, string>
  content: string
  loot_table_name: string
  statblock: StatBlock
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
    loot_table_name: 'Goblinoid',
    tags: 'goblinoid,small,cr1/4',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Humanoid', Size: 'Small', Habitat: 'Forest' },
    content: p(
      'Goblins are small, black-hearted humanoids that lair in caves, abandoned mines, despoiled dungeons, and other dismal settings. Individually weak, they gather in large, raucous bands and are selfish, cowardly, and cruel — bullying those weaker than themselves while cowering before anything stronger.',
      'Goblins are often found in the service of more powerful creatures such as hobgoblins, bugbears, orcs, or evil wizards. Their Nimble Escape allows them to disengage from combat and melt into the shadows before a counterattack can be mounted.',
    ),
    statblock: {
      ac: 15, acNote: 'leather armour, shield',
      hp: 7, hpDice: { count: 2, die: 6, bonus: 0 },
      speed: '30 ft.',
      str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
      savingThrows: '', skills: 'Stealth +6',
      senses: 'Darkvision 60 ft., Passive Perception 9',
      languages: 'Common, Goblin',
      damageImmunities: '', damageResistances: '', conditionImmunities: '',
      traits: [
        { name: 'Nimble Escape', desc: 'The goblin can take the Disengage or Hide action as a bonus action on each of its turns.' },
      ],
      actions: [
        { name: 'Scimitar', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.' },
        { name: 'Shortbow', desc: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.' },
      ],
      bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
    },
  },
  {
    title: 'Kobold',
    loot_table_name: 'Goblinoid',
    tags: 'kobold,small,cr1/8,draconic',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Humanoid', Size: 'Small', Habitat: 'Underdark' },
    content: p(
      'Kobolds are craven reptilian humanoids that worship evil dragons as demigods and serve them as minions and guards. Cowardly alone, they become emboldened in packs, using numbers and pack tactics to overwhelm foes far more powerful than themselves.',
      'Kobolds thrive in cramped spaces and are tireless trapmakers and miners. Their warrens are riddled with cunning pits and deadfalls. Their draconic heritage makes them fiercely territorial, and they attack any who trespass in their domain. Sunlight hampers their effectiveness significantly.',
    ),
    statblock: {
      ac: 12, acNote: '',
      hp: 5, hpDice: { count: 2, die: 6, bonus: -2 },
      speed: '30 ft.',
      str: 7, dex: 15, con: 9, int: 8, wis: 7, cha: 8,
      savingThrows: '', skills: '',
      senses: 'Darkvision 60 ft., Passive Perception 8',
      languages: 'Common, Draconic',
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
  {
    title: 'Orc',
    loot_table_name: 'Goblinoid',
    tags: 'orc,medium,cr1/2',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Humanoid', Size: 'Medium', Habitat: 'Mountain' },
    content: p(
      'Orcs are savage raiders and pillagers with stooped postures, low foreheads, and piggish faces with prominent lower canines that resemble tusks. They gather in tribes that plunder from settlements and each other, delighting in slaughter and carnage.',
      'An orc tribe is led by its most powerful warrior. Many bear ritual scarification in honour of Gruumsh, a one-eyed god of slaughter. Their Aggressive trait makes them terrifying in open combat — they close the distance to enemies in moments, striking before their prey can react.',
    ),
    statblock: {
      ac: 13, acNote: 'hide armour',
      hp: 15, hpDice: { count: 2, die: 8, bonus: 6 },
      speed: '30 ft.',
      str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10,
      savingThrows: '', skills: 'Intimidation +2',
      senses: 'Darkvision 60 ft., Passive Perception 10',
      languages: 'Common, Orc',
      damageImmunities: '', damageResistances: '', conditionImmunities: '',
      traits: [
        { name: 'Aggressive', desc: 'As a bonus action, the orc can move up to its speed toward a hostile creature that it can see.' },
      ],
      actions: [
        { name: 'Greataxe', desc: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 9 (1d12 + 3) slashing damage.' },
        { name: 'Javelin', desc: 'Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 30/120 ft., one target. Hit: 6 (1d6 + 3) piercing damage.' },
      ],
      bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
    },
  },
  {
    title: 'Skeleton',
    loot_table_name: 'Undead',
    tags: 'undead,medium,cr1/4,animated',
    tracks: { Vitality: 'Unknown', Disposition: 'Hostile', Creature_Type: 'Undead', Size: 'Medium', Habitat: 'Underdark' },
    content: p(
      'Skeletons arise when animate dead or a similar spell is cast on humanoid bones. They mindlessly obey their creator, attacking any living creature that is not their master. Unlike zombies, skeletons retain the mobility of their former life, making them faster and more coordinated undead servants.',
      'Skeletons have no self-preservation instinct. They fight until destroyed, never retreating or surrendering. They are immune to poison and exhaustion, and their lack of flesh makes them resistant to piercing and slashing damage. Radiant damage, however, is particularly effective against them.',
    ),
    statblock: {
      ac: 13, acNote: 'armour scraps',
      hp: 13, hpDice: { count: 2, die: 8, bonus: 4 },
      speed: '30 ft.',
      str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5,
      savingThrows: '', skills: '',
      senses: 'Darkvision 60 ft., Passive Perception 9',
      languages: 'understands languages it knew in life but cannot speak',
      damageImmunities: 'Poison', damageResistances: '', conditionImmunities: 'Exhaustion, Poisoned',
      traits: [],
      actions: [
        { name: 'Shortsword', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.' },
        { name: 'Shortbow', desc: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.' },
      ],
      bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
    },
  },
  {
    title: 'Zombie',
    loot_table_name: 'Undead',
    tags: 'undead,medium,cr1/4,animated',
    tracks: { Vitality: 'Unknown', Disposition: 'Hostile', Creature_Type: 'Undead', Size: 'Medium', Habitat: 'Swamp' },
    content: p(
      'Zombies are the animated corpses of dead humanoids, created through dark necromantic magic. Slow, shambling, and relentless, they are driven only by the need to kill. Their most dangerous quality is Undead Fortitude: a zombie reduced to 0 hit points may rise again unless the blow is truly decisive.',
      'Zombies are most often found in the service of necromancers, death cults, or powerful undead such as liches and death knights. They are expendable shock troops — a wave of rotting flesh designed to exhaust the living before the real threat arrives.',
    ),
    statblock: {
      ac: 8, acNote: '',
      hp: 22, hpDice: { count: 3, die: 8, bonus: 9 },
      speed: '20 ft.',
      str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5,
      savingThrows: 'Wis +0', skills: '',
      senses: 'Darkvision 60 ft., Passive Perception 8',
      languages: 'understands languages it knew in life but cannot speak',
      damageImmunities: 'Poison', damageResistances: '', conditionImmunities: 'Poisoned',
      traits: [
        { name: 'Undead Fortitude', desc: 'If damage reduces the zombie to 0 HP, it must make a Con save with a DC of 5 + the damage taken, unless the damage is radiant or from a critical hit. On a success, the zombie drops to 1 HP instead.' },
      ],
      actions: [
        { name: 'Slam', desc: 'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) bludgeoning damage.' },
      ],
      bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
    },
  },
  {
    title: 'Wolf',
    loot_table_name: 'Beast',
    tags: 'beast,medium,cr1/4,predator',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Beast', Size: 'Medium', Habitat: 'Forest' },
    content: p(
      'Wolves are pack hunters found in temperate forests, hills, and plains. They are intelligent enough to coordinate attacks, using pack tactics to bring down prey far larger than themselves. A lone wolf is merely dangerous; a pack is deadly.',
      'Wolves are frequently used as mounts or hunting animals by goblinoids and other monstrous races. Their keen senses make them excellent trackers, and their bite can knock a creature prone, setting it up for the rest of the pack to savage.',
    ),
    statblock: {
      ac: 13, acNote: 'natural armour',
      hp: 11, hpDice: { count: 2, die: 8, bonus: 2 },
      speed: '40 ft.',
      str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6,
      savingThrows: '', skills: 'Perception +3, Stealth +4',
      senses: 'Passive Perception 13', languages: '—',
      damageImmunities: '', damageResistances: '', conditionImmunities: '',
      traits: [
        { name: 'Keen Hearing and Smell', desc: 'The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell.' },
        { name: 'Pack Tactics', desc: "The wolf has advantage on attack rolls against a creature if at least one of the wolf's allies is within 5 ft. of the creature and the ally isn't incapacitated." },
      ],
      actions: [
        { name: 'Bite', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage. If the target is a creature, it must succeed on a DC 11 Str saving throw or be knocked prone.' },
      ],
      bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
    },
  },
  {
    title: 'Giant Spider',
    loot_table_name: 'Beast',
    tags: 'beast,large,cr1,predator,venomous',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Beast', Size: 'Large', Habitat: 'Forest' },
    content: p(
      'Giant spiders lurk in deep caves, abandoned ruins, and the canopies of dark forests. They spin webs to trap prey, then inject paralytic venom before wrapping their victims for later consumption. Their web sense lets them detect every vibration in their trap.',
      'Giant spiders are favoured by drow and other subterranean races as guard animals and mounts. Their ability to climb any surface makes them terrifying in dungeons. Creatures paralyzed by their venom are helpless until the poison wears off or they receive aid.',
    ),
    statblock: {
      ac: 14, acNote: 'natural armour',
      hp: 26, hpDice: { count: 4, die: 10, bonus: 4 },
      speed: '30 ft., climb 30 ft.',
      str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4,
      savingThrows: '', skills: 'Stealth +7',
      senses: 'Blindsight 10 ft., Darkvision 60 ft., Passive Perception 10', languages: '—',
      damageImmunities: '', damageResistances: '', conditionImmunities: '',
      traits: [
        { name: 'Spider Climb', desc: 'The spider can climb difficult surfaces, including upside down on ceilings, without needing to make an ability check.' },
        { name: 'Web Sense', desc: 'While in contact with a web, the spider knows the exact location of any other creature in contact with the same web.' },
        { name: 'Web Walker', desc: 'The spider ignores movement restrictions caused by webbing.' },
      ],
      actions: [
        { name: 'Bite', desc: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one creature. Hit: 7 (1d8 + 3) piercing damage, and the target must make a DC 11 Con saving throw, taking 9 (2d8) poison damage on a failed save, or half on a success. If the poison damage reduces the target to 0 HP, the target is stable but poisoned for 1 hour, even after regaining HP, and is paralyzed while poisoned in this way.' },
        { name: 'Web (Recharge 5–6)', desc: 'Ranged Weapon Attack: +5 to hit, range 30/60 ft., one creature. Hit: The target is restrained by webbing. As an action, the restrained target can make a DC 12 Str check, bursting the webbing on a success. The webbing can also be attacked and destroyed (AC 10; HP 5; vulnerability to fire; immunity to bludgeoning, poison, and psychic damage).' },
      ],
      bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
    },
  },
  {
    title: 'Bandit',
    loot_table_name: 'Bandit',
    tags: 'humanoid,medium,cr1/8,npc',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Humanoid', Size: 'Medium', Habitat: 'Urban' },
    content: p(
      'Bandits rove in gangs and are sometimes led by thugs, veterans, or spellcasters. Not all are evil — poverty or desperation may drive individuals to a life of banditry. Some are little more than desperate commoners, while others are hardened criminals.',
      'Use this stat block for highwaymen on a road, pirates aboard a vessel, or hired muscle in a tavern brawl. A large enough gang poses a real threat to low-level parties. Scale them up with a thug or veteran as their leader.',
    ),
    statblock: {
      ac: 12, acNote: 'leather armour',
      hp: 11, hpDice: { count: 2, die: 8, bonus: 2 },
      speed: '30 ft.',
      str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10,
      savingThrows: '', skills: '',
      senses: 'Passive Perception 10',
      languages: 'any one language (usually Common)',
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
    title: 'Guard',
    loot_table_name: 'Soldier / Guard',
    tags: 'humanoid,medium,cr1/8,npc',
    tracks: { Vitality: 'Living', Disposition: 'Neutral', Creature_Type: 'Humanoid', Size: 'Medium', Habitat: 'Urban' },
    content: p(
      'Guards include members of a city watch, sentries in a citadel, and soldiers in a lord\'s army. Their job is to protect their post and raise the alarm — not to fight to the death. They defer to authority and follow orders from superiors.',
      'Use guards to populate castles, city gates, noble estates, and merchant warehouses. They might be bribed, persuaded, or threatened. A group of guards becomes dangerous when they call for reinforcements or lock down exits.',
    ),
    statblock: {
      ac: 16, acNote: 'chain shirt, shield',
      hp: 11, hpDice: { count: 2, die: 8, bonus: 2 },
      speed: '30 ft.',
      str: 13, dex: 12, con: 12, int: 10, wis: 11, cha: 10,
      savingThrows: '', skills: 'Perception +2',
      senses: 'Passive Perception 12',
      languages: 'any one language (usually Common)',
      damageImmunities: '', damageResistances: '', conditionImmunities: '',
      traits: [],
      actions: [
        { name: 'Spear', desc: 'Melee or Ranged Weapon Attack: +3 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 4 (1d6 + 1) piercing damage, or 5 (1d8 + 1) piercing damage if used with two hands to make a melee attack.' },
      ],
      bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
    },
  },
  {
    title: 'Giant Rat',
    loot_table_name: 'Beast',
    tags: 'beast,small,cr1/8,diseased',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Beast', Size: 'Small', Habitat: 'Urban' },
    content: p(
      'Giant rats are aggressive scavengers that lurk in sewers, cellars, dungeons, and ruined buildings. Drawn to filth and carrion, a nest of giant rats can strip a body to the bone within hours. They are often the first creatures encountered in a dungeon setting.',
      'Individually weak, giant rats use pack tactics to swarm a single target. They are frequently found infesting a villain\'s lair or in service to wererats. Their diseased bites make them more dangerous than their low CR suggests.',
    ),
    statblock: {
      ac: 12, acNote: '',
      hp: 7, hpDice: { count: 2, die: 6, bonus: 0 },
      speed: '30 ft.',
      str: 7, dex: 15, con: 11, int: 2, wis: 10, cha: 4,
      savingThrows: '', skills: '',
      senses: 'Darkvision 60 ft., Passive Perception 10', languages: '—',
      damageImmunities: '', damageResistances: '', conditionImmunities: '',
      traits: [
        { name: 'Keen Smell', desc: 'The rat has advantage on Wisdom (Perception) checks that rely on smell.' },
        { name: 'Pack Tactics', desc: "The rat has advantage on attack rolls against a creature if at least one of the rat's allies is within 5 ft. of the creature and the ally isn't incapacitated." },
      ],
      actions: [
        { name: 'Bite', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 4 (1d4 + 2) piercing damage.' },
      ],
      bonusActions: [], reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
    },
  },
]