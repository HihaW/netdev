import * as ROT from "rot-js";
import "./style.css";
import { COLORS, FONT_FAMILY, FONT_SIZE, GRID_HEIGHT, GRID_WIDTH } from "./game/config.js";
import {
  deleteSave,
  loadGame,
  readHistory,
  readSave,
  setSaveClock,
  writeSave,
} from "./game/save.js";
import { createGame, resolveTurn, type PlayerAction } from "./game/turns.js";
import type { GameState } from "./game/types.js";
import { createHud, renderHud } from "./ui/hud.js";
import { buildKeymap, type GameAction } from "./ui/keymap.js";
import {
  createMenuLayer,
  decideKey,
  nextScreen,
  type MenuActions,
  type PauseView,
  type RunSummary,
  type Screen,
  type TitleData,
} from "./ui/menus.js";
import { drawFrame, renderFrame } from "./ui/renderer.js";

function toPlayerAction(action: GameAction): PlayerAction | null {
  if (action.kind === "move") return { kind: "move", dx: action.dx, dy: action.dy };
  if (action.kind === "wait") return { kind: "wait" };
  return null;
}

function summaryOf(state: GameState, won: boolean): RunSummary {
  return {
    seed: state.seed,
    level: state.level,
    turns: state.turnCount,
    kills: state.kills,
    cause: state.deathCause,
    won,
  };
}

// Web Crypto, not the global RNG: this repo greps src/ for the unseeded random
// source because a value from it anywhere near the game loop is a determinism
// hazard. This one only ever produces the seed the player is about to see and
// edit, and that seed is then hashed deterministically like any other.
function randomSeed(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("");
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function bootstrap(): void {
  const host = document.getElementById("game");
  if (!host) throw new Error("#game host element is missing");

  // The only wall clock in the app, and it lives here rather than in
  // src/game/ so that a save timestamp can never reach a seed. Storage needs no
  // setup: localStorage is the default.
  setSaveClock(() => new Date().toISOString());

  const display = new ROT.Display({
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    fontSize: FONT_SIZE,
    fontFamily: FONT_FAMILY,
    bg: COLORS.background,
    fg: COLORS.defaultFg,
  });
  // The canvas is mounted once and never rebuilt: losing it would lose the
  // display's dirty-cell tracking.
  const canvas = display.getContainer();
  if (canvas) host.appendChild(canvas);

  const hud = createHud(host);
  const keymap = buildKeymap();

  let screen: Screen = "title";
  let state: GameState | null = null;
  let lastLevel = 0;
  let pausedView: PauseView = "menu";

  function titleData(): TitleData {
    const save = readSave();
    return {
      initialSeed: seedFromUrl() ?? randomSeed(),
      save: save ? { seed: save.seed, level: save.level } : null,
      history: readHistory(),
    };
  }

  function render(): void {
    if (state) {
      if (state.level !== lastLevel) {
        // A new level means a new map; stale glyphs must not survive it.
        display.clear();
        lastLevel = state.level;
      }
      drawFrame(display, renderFrame(state));
      renderHud(hud, state);
    }
  }

  // The single switch. Everything that moves between screens goes through it, so
  // there is exactly one place that knows what a screen is.
  function show(next: Screen): void {
    screen = next;
    menus.clear();
    switch (next) {
      case "title":
        menus.showTitle(titleData());
        break;
      case "playing":
        break;
      case "inventory":
        if (state) menus.showInventory(state);
        break;
      case "paused":
        menus.showPaused(pausedView);
        break;
      case "gameover":
        if (state) menus.showGameOver(summaryOf(state, false));
        break;
      case "victory":
        if (state) menus.showVictory(summaryOf(state, true));
        break;
    }
    render();
  }

  function dispatch(event: Parameters<typeof nextScreen>[1]): void {
    show(nextScreen(screen, event));
  }

  function beginRun(seed: string): void {
    state = createGame(seed);
    pausedView = "menu";
    dispatch("start-run");
  }

  const actions: MenuActions = {
    startRun: (seed) => beginRun(seed),
    continueRun: () => {
      const resumed = loadGame();
      // A save that no longer rebuilds is not a run anybody can finish.
      if (!resumed) {
        show("title");
        return;
      }
      state = resumed;
      pausedView = "menu";
      dispatch("continue");
    },
    resume: () => dispatch("resume"),
    saveAndQuit: () => {
      if (state) writeSave(state);
      dispatch("save-and-quit");
    },
    restartRun: () => {
      const seed = state?.seed ?? "";
      deleteSave();
      state = null;
      beginRun(seed);
    },
    toTitle: () => {
      state = null;
      dispatch("to-title");
    },
    copySeed: (seed) => copyToClipboard(seed),
    randomSeed,
  };

  const menus = createMenuLayer(host, actions);

  function handleKey(event: KeyboardEvent): void {
    const decision = decideKey({
      action: keymap[event.key],
      isEscape: event.key === "Escape",
      screen,
      overlayOpen: menus.isShowing(),
    });
    if (decision.kind === "ignore") return;

    event.preventDefault();
    switch (decision.kind) {
      case "escape-overlay":
        menus.escape();
        return;
      case "close-inventory":
        dispatch("inventory");
        return;
      case "screen":
        pausedView = decision.event === "help" ? "help" : "menu";
        dispatch(decision.event);
        return;
      case "act": {
        const move = toPlayerAction(decision.action);
        if (!move || !state) return;
        // A resolved turn has to be drawn, and a plain turn never changes screen,
        // so the render cannot be left to show().
        if (resolveTurn(state, move).gameOver) dispatch("died");
        else render();
        return;
      }
    }
  }

  window.addEventListener("keydown", handleKey);
  show("title");
}

function seedFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("seed");
  if (fromUrl === null) return null;
  const trimmed = fromUrl.trim();
  return trimmed.length > 0 ? trimmed : null;
}

bootstrap();
