import type { EnemyId } from "../game/types.js";

export interface EnemyStats {
  id: EnemyId;
  name: string;
  glyph: string;
  hp: number;
  atk: number;
  def: number;
  senses: number;
  behaviour: "chase" | "chase-cadence" | "chase-flee" | "cleave";
  unlockLevel: number;
}

export const ENEMY_STATS: Readonly<Record<EnemyId, EnemyStats>> = {
  rat: {
    id: "rat",
    name: "Rat",
    glyph: "r",
    hp: 5,
    atk: 2,
    def: 0,
    senses: 8,
    behaviour: "chase",
    unlockLevel: 1,
  },
  skeleton: {
    id: "skeleton",
    name: "Skeleton",
    glyph: "k",
    hp: 15,
    atk: 5,
    def: 2,
    senses: 4,
    behaviour: "chase-cadence",
    unlockLevel: 2,
  },
  goblin: {
    id: "goblin",
    name: "Goblin",
    glyph: "g",
    hp: 10,
    atk: 4,
    def: 1,
    senses: 8,
    behaviour: "chase-flee",
    unlockLevel: 4,
  },
  guardian: {
    id: "guardian",
    name: "Guardian",
    glyph: "G",
    hp: 60,
    atk: 7,
    def: 3,
    senses: 10,
    behaviour: "cleave",
    unlockLevel: 10,
  },
};
