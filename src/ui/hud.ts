import { MESSAGE_LOG_LENGTH } from "../game/config.js";
import { effectiveStats, potionCount } from "../game/turns.js";
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

export { potionCount };

export function renderHud(elements: HudElements, state: GameState): void {
  // ATK and DEF come from the shared effective stats, which fold in whatever is
  // equipped, so a pickup shows up here without opening the inventory screen.
  const stats = effectiveStats(state);
  elements.status.textContent = [
    `Seed ${state.seed}   Level ${state.level}   Turn ${state.turnCount}`,
    `HP ${stats.hp}/${stats.maxHp}   ATK ${stats.atk}   DEF ${stats.def}   Potions ${potionCount(state)}`,
  ].join("\n");

  elements.log.textContent = state.messages.slice(-MESSAGE_LOG_LENGTH).join("\n");
}
