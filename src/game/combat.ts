import { gameplayRandom } from "./rng.js";
import { DROPPED_POTION_CHANCE } from "./config.js";
import { createCorpse } from "./entities.js";
import type { CorpseEntity, EnemyEntity, Entity, ItemId } from "./types.js";

export function calculateDamage(atk: number, def: number, roll: number): number {
  return Math.max(1, atk - def + roll);
}

export function rollDamage(): number {
  return Math.floor(gameplayRandom() * 3) - 1;
}

export function rollDrop(): ItemId | null {
  return gameplayRandom() < DROPPED_POTION_CHANCE ? "potion" : null;
}

export type AttackKind = "hit" | "noop";

export interface AttackResult {
  kind: AttackKind;
  damage: number;
  targetId: string | null;
  killed: boolean;
  playerDied: boolean;
  dropItemId: ItemId | null;
}

export function noopAttack(): AttackResult {
  return {
    kind: "noop",
    damage: 0,
    targetId: null,
    killed: false,
    playerDied: false,
    dropItemId: null,
  };
}

export function resolveAttack(attacker: Entity, defender: Entity): AttackResult {
  const damage = calculateDamage(attacker.atk, defender.def, rollDamage());
  const killed = defender.hp - damage <= 0;
  const dropItemId = killed && defender.kind === "enemy" ? rollDrop() : null;
  return {
    kind: "hit",
    damage,
    targetId: defender.id,
    killed,
    playerDied: killed && defender.kind === "player",
    dropItemId,
  };
}

export function toCorpse(enemy: EnemyEntity): CorpseEntity {
  return createCorpse(enemy);
}

export function isHostile(entity: Entity): entity is EnemyEntity {
  return entity.kind === "enemy";
}

export function isCorpse(entity: Entity): boolean {
  return entity.kind === "corpse";
}

export function blocksAi(entity: Entity): boolean {
  return entity.kind === "enemy" || entity.kind === "player";
}

// TODO(T10): every enemy line in the message log is subject to the non-leak rule
// (DESIGN.md 3.3) — emit it only when that enemy is in the player's current FOV.
// combat.ts cannot do this: it has no FOV set. The check belongs in the turn loop.
