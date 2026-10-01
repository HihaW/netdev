import { MESSAGE_LOG_LENGTH } from "../game/config.js";
import type { GameState } from "../game/types.js";

export interface HudElements {
  root: HTMLElement;
  status: HTMLElement;
  log: HTMLElement;
}

export function createHud(host: HTMLElement): HudElements {
  const root = document.createElement("div");
  root.className = "hud";

  const status = document.createElement("div");
  status.className = "hud-status";

  const log = document.createElement("div");
  log.className = "hud-log";

  root.appendChild(status);
  root.appendChild(log);
  host.appendChild(root);

  return { root, status, log };
}

// Potions are counted as entities on the floor until T17 moves them into a
// carried inventory; ATK and DEF are the effective values, so a pickup shows up
// here without opening the inventory screen.
export function potionCount(state: GameState): number {
  return state.entities.reduce(
    (sum, e) => sum + (e.kind === "item" && e.itemId === "potion" ? e.stack : 0),
    0,
  );
}

export function renderHud(elements: HudElements, state: GameState): void {
  elements.status.textContent = [
    `Seed ${state.seed}   Level ${state.level}   Turn ${state.turnCount}`,
    `HP ${state.player.hp}/${state.player.maxHp}   ATK ${state.player.atk}   DEF ${state.player.def}   Potions ${potionCount(state)}`,
  ].join("\n");

  elements.log.textContent = state.messages.slice(-MESSAGE_LOG_LENGTH).join("\n");
}
