import * as ROT from "rot-js";
import "./style.css";
import {
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  GRID_HEIGHT,
  GRID_WIDTH,
  SAVE_KEY,
} from "./game/config.js";
import { createGame, resolveTurn, type PlayerAction } from "./game/turns.js";
import type { GameState } from "./game/types.js";
import { createHud, renderHud } from "./ui/hud.js";
import { buildKeymap, type GameAction } from "./ui/keymap.js";
import { drawFrame, renderFrame } from "./ui/renderer.js";

function toPlayerAction(action: GameAction): PlayerAction | null {
  if (action.kind === "move") return { kind: "move", dx: action.dx, dy: action.dy };
  if (action.kind === "wait") return { kind: "wait" };
  return null;
}

function bootstrap(): void {
  const host = document.getElementById("game");
  if (!host) throw new Error("#game host element is missing");

  const display = new ROT.Display({
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    fontSize: FONT_SIZE,
    fontFamily: FONT_FAMILY,
    bg: COLORS.background,
    fg: COLORS.defaultFg,
  });
  const canvas = display.getContainer();
  if (canvas) host.appendChild(canvas);

  const hud = createHud(host);
  const keymap = buildKeymap();

  const state: GameState = createGame(promptForSeed());
  let lastLevel = state.level;

  function render(): void {
    if (state.level !== lastLevel) {
      // A new level means a new map; stale glyphs must not survive it.
      display.clear();
      lastLevel = state.level;
    }
    drawFrame(display, renderFrame(state));
    renderHud(hud, state);
  }

  function handleKey(event: KeyboardEvent): void {
    const action = keymap[event.key];
    if (!action) return;
    event.preventDefault();

    const move = toPlayerAction(action);
    if (move) {
      const outcome = resolveTurn(state, move);
      if (outcome.gameOver) {
        // T12 owns the run-history record and T13 the game over screen.
        localStorage.removeItem(SAVE_KEY);
      }
    }
    render();
  }

  window.addEventListener("keydown", handleKey);
  render();
}

function promptForSeed(): string {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("seed");
  if (fromUrl) return fromUrl;
  return window.prompt("Seed (leave blank for a random one)", "netdev") ?? "netdev";
}

bootstrap();
