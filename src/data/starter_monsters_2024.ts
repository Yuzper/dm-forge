// path: src/data/starter_monsters_2024.ts
// Starter monster wiki articles for D&D 5e 2024 (revised Monster Manual).
// Key changes: bonus action economy, higher HP, multiattack at lower CRs,
// Sunlight Sensitivity removed from kobolds, Aggressive moved to bonus action on orcs.
// Seeded automatically when a 2024 campaign is created.

import type { StatBlock } from '../types'
import type { StarterMonster } from './starter_monsters_2014'
export type { StarterMonster }

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
      'In the 2024 rules, goblins gain a Multiattack action, making them more of a sustained threat. Nimble Escape moves to a dedicated Bonus Action, reinforcing the new action economy. They are still best used in numbers.',
    ),
    statblock: {
      ac: 15, acNote: 'leather armour, shield',
      hp: 10, hpDice: { count: 3, die: 6, bonus: 0 },
      speed: '30 ft.',
      str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
      savingThrows: '', skills: 'Stealth +6',
      senses: 'Darkvision 60 ft., Passive Perception 9',
      languages: 'Common, Goblin',
      damageImmunities: '', damageResistances: '', conditionImmunities: '',
      traits: [],
      actions: [
        { name: 'Multiattack', desc: 'The goblin makes two attacks, using Scimitar or Shortbow in any combination.' },
        { name: 'Scimitar', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.' },
        { name: 'Shortbow', desc: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.' },
      ],
      bonusActions: [
        { name: 'Nimble Escape', desc: 'The goblin takes the Disengage or Hide action.' },
      ],
      reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
    },
  },
  {
    title: 'Kobold',
    loot_table_name: 'Goblinoid',
    tags: 'kobold,small,cr1/8,draconic',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Humanoid', Size: 'Small', Habitat: 'Underdark' },
    content: p(
      'Kobolds are craven reptilian humanoids that worship evil dragons as demigods and serve them as minions and guards. Cowardly alone, they become emboldened in packs, using numbers and pack tactics to overwhelm foes far more powerful than themselves.',
      'The 2024 revision removes Sunlight Sensitivity from kobolds, making them slightly more versatile. They gain the Scurry bonus action, emphasising hit-and-run tactics over the older passive trait design.',
    ),
    statblock: {
      ac: 12, acNote: '',
      hp: 7, hpDice: { count: 3, die: 6, bonus: -3 },
      speed: '30 ft.',
      str: 7, dex: 15, con: 9, int: 8, wis: 7, cha: 8,
      savingThrows: '', skills: '',
      senses: 'Darkvision 60 ft., Passive Perception 8',
      languages: 'Common, Draconic',
      damageImmunities: '', damageResistances: '', conditionImmunities: '',
      traits: [
        { name: 'Pack Tactics', desc: "The kobold has advantage on attack rolls against a creature if at least one of the kobold's allies is within 5 ft. of the creature and the ally isn't incapacitated." },
      ],
      actions: [
        { name: 'Dagger', desc: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 4 (1d4 + 2) piercing damage.' },
        { name: 'Sling', desc: 'Ranged Weapon Attack: +4 to hit, range 30/120 ft., one target. Hit: 4 (1d4 + 2) bludgeoning damage.' },
      ],
      bonusActions: [
        { name: 'Scurry', desc: 'The kobold moves up to half its speed without provoking opportunity attacks.' },
      ],
      reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
    },
  },
  {
    title: 'Orc',
    loot_table_name: 'Goblinoid',
    tags: 'orc,medium,cr1/2',
    tracks: { Vitality: 'Living', Disposition: 'Hostile', Creature_Type: 'Humanoid', Size: 'Medium', Habitat: 'Mountain' },
    content: p(
      'Orcs are savage raiders and pillagers with stooped postures, low foreheads, and piggish faces with prominent lower canines that resemble tusks. They gather in tribes that plunder from settlements and each other, delighting in slaughter and carnage.',
      'The 2024 orc gains Multiattack and its Aggressive trait is moved to a Bonus Action, making it both more dangerous and more action-efficient. Higher HP reflects the general upward trend in monster durability in the revised rules.',
    ),
    statblock: {
      ac: 13, acNote: 'hide armour',
      hp: 21, hpDice: { count: 3, die: 8, bonus: 9 },
      speed: '30 ft.',
      str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10,
      savingThrows: '', skills: 'Intimidation +2',
      senses: 'Darkvision 60 ft., Passive Perception 10',
      languages: 'Common, Orc',
      damageImmunities: '', damageResistances: '', conditionImmunities: '',
      traits: [],
      actions: [
        { name: 'Multiattack', desc: 'The orc makes two Greataxe or Javelin attacks.' },
        { name: 'Greataxe', desc: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 9 (1d12 + 3) slashing damage.' },
        { name: 'Javelin', desc: 'Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 30/120 ft., one target. Hit: 6 (1d6 + 3) piercing damage.' },
      ],
      bonusActions: [
        { name: 'Aggressive', desc: 'The orc moves up to its speed toward a hostile creature that it can see.' },
      ],
      reactions: [], legendaryActions: [], cantrips: [], preparedSpells: [],
    },
  },
  {
    title: 'Skeleton',
    loot_table_name: 'Undead',
    tags: 'undead,medium,cr1/4,animated',
    tracks: { Vitality: 'Unknown', Disposition: 'Hostile', Creature_Type: 'Undead', Size: 'Medium', Habitat: 'Underdark' },
    content: p(
      'Skeletons arise when animate dead or a similar spell is cast on humanoid bones. They mindlessly obey their creator, attacking any living creature that is not their master. Unlike zombies, skeletons retain the mobility of their former life, making them faster and more coordinated undead servants.',
      'The 2024 skeleton gains Multiattack, making it more threatening even at its low CR. Higher HP reflects the revised baseline for undead. Radiant damage remains particularly effective against them.',
    ),
    statblock: {
      ac: 13, acNote: 'armour scraps',
      hp: 15, hpDice: { count: 2, die: 8, bonus: 6 },
      speed: '30 ft.',
      str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5,
      savingThrows: '', skills: '',
      senses: 'Darkvision 60 ft., Passive Perception 9',
      languages: 'understands languages it knew in life but cannot speak',
      damageImmunities: 'Poison', damageResistances: '', conditionImmunities: 'Exhaustion, Poisoned',
      traits: [],
      actions: [
        { name: 'Multiattack', desc: 'The skeleton makes two Shortsword or Shortbow attacks.' },
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
      'The 2024 zombie has higher HP and its Slam now uses a d8 instead of d6, reflecting the general upward scaling of undead. Its role remains the same: expendable shock troops designed to wear down the party.',
    ),
    statblock: {
      ac: 8, acNote: '',
      hp: 26, hpDice: { count: 4, die: 8, bonus: 8 },
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
        { name: 'Slam', desc: 'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 5 (1d8 + 1) bludgeoning damage.' },
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
      'The 2024 wolf has slightly higher HP reflecting the revised beast baseline. Its role is unchanged: a mobile skirmisher that knocks prey prone for the pack to finish off.',
    ),
    statblock: {
      ac: 13, acNote: 'natural armour',
      hp: 14, hpDice: { count: 3, die: 8, bonus: 3 },
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
      'The 2024 giant spider has notably higher poison damage on its bite (4d8 vs 2d8), making it significantly more lethal. Higher HP overall. Its role as a web-setter ambush predator is unchanged.',
    ),
    statblock: {
      ac: 14, acNote: 'natural armour',
      hp: 32, hpDice: { count: 5, die: 10, bonus: 5 },
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
        { name: 'Bite', desc: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one creature. Hit: 7 (1d8 + 3) piercing damage, and the target must make a DC 11 Con saving throw, taking 18 (4d8) poison damage on a failed save, or half on a success. If the poison damage reduces the target to 0 HP, the target is stable but poisoned for 1 hour, even after regaining HP, and is paralyzed while poisoned in this way.' },
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
      'Use this stat block for highwaymen, pirates, or hired muscle. The 2024 bandit has marginally higher HP. A large enough gang poses a real threat to low-level parties.',
    ),
    statblock: {
      ac: 12, acNote: 'leather armour',
      hp: 13, hpDice: { count: 3, die: 8, bonus: 0 },
      speed: '30 ft.',
      str: 11, dex: 12, con: 11, int: 10, wis: 10, cha: 10,
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
      'Use guards to populate castles, city gates, noble estates, and warehouses. The 2024 guard has slightly higher HP. They might be bribed, persuaded, or threatened — or call for reinforcements.',
    ),
    statblock: {
      ac: 16, acNote: 'chain shirt, shield',
      hp: 13, hpDice: { count: 3, die: 8, bonus: 0 },
      speed: '30 ft.',
      str: 13, dex: 12, con: 11, int: 10, wis: 11, cha: 10,
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
      'The 2024 giant rat has slightly higher HP. It still relies on pack tactics and its diseased bite makes it more dangerous than its low CR suggests. Frequently found infesting a villain\'s lair or in service to wererats.',
    ),
    statblock: {
      ac: 12, acNote: '',
      hp: 9, hpDice: { count: 3, die: 6, bonus: 0 },
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