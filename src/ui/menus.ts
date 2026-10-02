import { ENEMY_STATS } from "../data/enemies.js";
import { ITEMS } from "../data/items.js";
import { FINAL_LEVEL, RUN_HISTORY_CAP } from "../game/config.js";
import { effectiveStats, equippedItem, potionCount } from "../game/turns.js";
import type { EnemyId, GameState, ItemId, RunRecord } from "../game/types.js";
import { HELP_NOTES, helpRows, type GameAction } from "./keymap.js";

// Every screen between "page loaded" and "turn resolved". One union, one
// switch in main.ts — no router, no state machine library (DESIGN.md 9, T13).
export type Screen = "title" | "playing" | "inventory" | "paused" | "gameover" | "victory";

export const SCREENS: readonly Screen[] = [
  "title",
  "playing",
  "inventory",
  "paused",
  "gameover",
  "victory",
];

// A screen is not a state machine: these are the things that can happen, and
// `nextScreen` is the whole of the routing logic. It is a pure function so the
// transitions can be tested without a DOM.
export type ScreenEvent =
  | "start-run"
  | "continue"
  | "pause"
  | "resume"
  | "inventory"
  | "help"
  | "save-and-quit"
  | "restart"
  | "to-title"
  | "died"
  | "won";

export const SCREEN_EVENTS: readonly ScreenEvent[] = [
  "start-run",
  "continue",
  "pause",
  "resume",
  "inventory",
  "help",
  "save-and-quit",
  "restart",
  "to-title",
  "died",
  "won",
];

export function nextScreen(current: Screen, event: ScreenEvent): Screen {
  switch (event) {
    case "start-run":
    case "continue":
    case "resume":
    case "restart":
      return "playing";
    case "pause":
      return current === "paused" ? "playing" : "paused";
    case "inventory":
      return current === "inventory" ? "playing" : "inventory";
    // "?" opens the key reference inside the pause menu rather than adding a
    // seventh screen for it.
    case "help":
      return "paused";
    case "save-and-quit":
    case "to-title":
      return "title";
    case "died":
      return "gameover";
    case "won":
      return "victory";
  }
}

export function reachableTransitions(): [Screen, Screen][] {
  const seen = new Map<string, [Screen, Screen]>();
  for (const from of SCREENS) {
    for (const event of SCREEN_EVENTS) {
      const to = nextScreen(from, event);
      seen.set(`${from}->${to}`, [from, to]);
    }
  }
  return [...seen.values()];
}

// What a keypress means. main.ts executes the decision; nothing here touches the
// game, the DOM, or the clock. It is a function because both bugs this replaced
// were routing decisions, and routing decisions are worth testing directly.
export type KeyDecision =
  | { kind: "ignore" }
  | { kind: "escape-overlay" }
  | { kind: "close-inventory" }
  | { kind: "drink-potion" }
  | { kind: "act"; action: GameAction }
  | { kind: "screen"; event: ScreenEvent };

export function decideKey(options: {
  key: string;
  action: GameAction | undefined;
  screen: Screen;
  overlayOpen: boolean;
}): KeyDecision {
  const { key, action, screen, overlayOpen } = options;

  // An open overlay owns the keyboard. Escape always belongs to it, `i` closes
  // the inventory because DESIGN.md 9 calls it a toggle, and `1` or Enter drink
  // from the inventory screen only. Everything else is left to the browser so a
  // focused button and the seed field keep working.
  if (overlayOpen) {
    if (key === "Escape") return { kind: "escape-overlay" };
    if (screen === "inventory" && (key === "1" || key === "Enter")) {
      return { kind: "drink-potion" };
    }
    if (action?.kind === "inventory" && screen === "inventory") {
      return { kind: "close-inventory" };
    }
    return { kind: "ignore" };
  }

  if (!action) return { kind: "ignore" };
  if (screen !== "playing") return { kind: "ignore" };

  switch (action.kind) {
    case "move":
    case "wait":
      return { kind: "act", action };
    case "inventory":
      return { kind: "screen", event: "inventory" };
    case "pause":
      return { kind: "screen", event: "pause" };
    case "help":
      return { kind: "screen", event: "help" };
  }
}

export interface RunSummary {
  seed: string;
  level: number;
  turns: number;
  kills: number;
  cause: EnemyId | null;
  won: boolean;
}

export interface SaveLabel {
  seed: string;
  level: number;
}

export interface TitleData {
  initialSeed: string;
  save: SaveLabel | null;
  history: RunRecord[];
}

// What the layer is allowed to ask the app to do. Every side effect the menus
// have lives behind this, which is what lets the DOM tests drive a whole screen
// without a canvas, a game, or a clipboard.
export interface MenuActions {
  startRun(seed: string): void;
  continueRun(): void;
  resume(): void;
  saveAndQuit(): void;
  restartRun(): void;
  toTitle(): void;
  copySeed(seed: string): Promise<boolean>;
  randomSeed(): string;
  // Drinking is the one action that comes from inside a screen, and it costs a
  // turn, so the app resolves it and the layer only re-renders afterwards.
  drinkPotion(): void;
}

export type PauseView = "menu" | "confirm-restart" | "help";
export type TitleView = "menu" | "history";

export interface MenuLayer {
  readonly element: HTMLElement;
  readonly pausedView: PauseView;
  readonly titleView: TitleView;
  isShowing(): boolean;
  // Escape and drinking are handled here because the layer owns the view state,
  // and the app owns the screen change and the turn. Both return false when they
  // have nothing to act on.
  escape(): boolean;
  drink(): boolean;
  clear(): void;
  showTitle(data: TitleData): void;
  showPaused(view?: PauseView): void;
  showInventory(state: GameState): void;
  showGameOver(summary: RunSummary): void;
  showVictory(summary: RunSummary): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className !== undefined) node.className = className;
  return node;
}

function actionButton(
  label: string,
  action: string,
  onClick: () => void,
  className = "menu-button",
): HTMLButtonElement {
  const node = el("button", label, className);
  node.type = "button";
  node.dataset.action = action;
  node.addEventListener("click", onClick);
  return node;
}

function panel(...children: (Node | string)[]): HTMLElement {
  const node = el("div", undefined, "panel");
  for (const child of children) {
    node.appendChild(typeof child === "string" ? el("p", child, "menu-text") : child);
  }
  return node;
}

function heading(text: string, className = "menu-heading"): HTMLElement {
  return el("h2", text, className);
}

// A seed is a string and any non-empty one is legal, so the only rejection there
// is has to be is whitespace.
export function normalizeSeed(raw: string): string {
  return raw.trim();
}

// A 10 000 character seed is legal, so a label shows its ends and its length
// rather than pretending to show all of it.
export function seedLabel(seed: string): string {
  if (seed.length <= 24) return seed;
  return `${seed.slice(0, 12)}...${seed.slice(-8)} (${seed.length} chars)`;
}

export function causeText(cause: EnemyId | null): string {
  if (cause === null) return "the dungeon";
  return ENEMY_STATS[cause].name.toLowerCase();
}

function summaryRows(summary: RunSummary): HTMLElement {
  const list = el("dl", undefined, "summary");
  const rows: readonly (readonly [string, string])[] = [
    ["Killed by", causeText(summary.cause)],
    ["Level reached", `${summary.level} of ${FINAL_LEVEL}`],
    ["Turns", `${summary.turns}`],
    ["Kills", `${summary.kills}`],
  ];
  for (const [label, value] of rows) {
    list.appendChild(el("dt", label, "summary-key"));
    list.appendChild(el("dd", value, "summary-value"));
  }
  return list;
}

// The seed is the point of the whole project, so it is the largest text on the
// screen and one keystroke from the clipboard.
function seedBlock(seed: string, onCopy: (seed: string) => Promise<boolean>): HTMLElement {
  const block = el("div", undefined, "seed-block");
  block.appendChild(el("div", "Seed", "seed-label"));
  block.appendChild(el("div", seed, "seed-value"));

  const copy = actionButton("Copy seed", "copy-seed", () => {
    void onCopy(seed).then((ok) => {
      copy.textContent = ok ? "Copied" : "Copy blocked - select it instead";
    });
  });
  block.appendChild(copy);
  return block;
}

function helpPanel(): HTMLElement {
  const table = el("table", undefined, "help");
  const body = el("tbody");
  for (const row of helpRows()) {
    const tr = el("tr");
    tr.appendChild(el("th", row.keys, "help-keys"));
    tr.appendChild(el("td", row.action, "help-action"));
    body.appendChild(tr);
  }
  table.appendChild(body);
  return table;
}

// The screen's name for every item in the roster. It exists so the panel never
// grows a second lookup that can fall out of step with data/items.ts.
export function itemName(itemId: ItemId): string {
  return ITEMS[itemId].name;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

export function createMenuLayer(host: HTMLElement, actions: MenuActions): MenuLayer {
  const element = el("div", undefined, "overlay");
  element.hidden = true;
  host.appendChild(element);

  let pausedView: PauseView = "menu";
  let titleView: TitleView = "menu";
  let lastTitle: TitleData = { initialSeed: "", save: null, history: [] };
  let lastInventory: GameState | null = null;

  function open(content: HTMLElement, focus?: HTMLElement): void {
    element.replaceChildren(content);
    element.hidden = false;
    (focus ?? content.querySelector<HTMLElement>("button, input"))?.focus();
  }

  function close(): void {
    element.replaceChildren();
    element.hidden = true;
  }

  // dataset.screen is how the Escape handler knows what it is looking at; the
  // overlay is always opened through one of the show* functions, so the value
  // is always one of the six screens.
  function screenOf(): Screen {
    return (element.dataset.screen ?? "title") as Screen;
  }

  // Escape backs out of whatever is open, one level at a time. The title menu is
  // the root, so it has nowhere to go; the death and victory screens go to the
  // title, because there is no run left to resume.
  //
  // This is a method rather than a keydown listener on the overlay on purpose:
  // a listener here would fire before the app's window listener and the two would
  // fight over the same keypress.
  function escape(): boolean {
    if (element.hidden) return false;
    switch (screenOf()) {
      case "title":
        if (titleView === "history") showTitle(lastTitle);
        return true;
      case "paused":
        // Out of a sub-view first; out of the pause menu itself means resume.
        if (pausedView !== "menu") showPaused("menu");
        else actions.resume();
        return true;
      case "inventory":
        actions.resume();
        return true;
      default:
        actions.toTitle();
        return true;
    }
  }

  function showTitle(data: TitleData): void {
    lastTitle = data;
    titleView = "menu";
    element.dataset.screen = "title";

    const input = el("input", undefined, "seed-input");
    input.type = "text";
    input.value = data.initialSeed;
    input.placeholder = "seed";
    input.setAttribute("aria-label", "Seed");
    input.dataset.action = "seed-input";

    const error = el("p", undefined, "menu-error");
    error.hidden = true;

    const start = (): void => {
      const seed = normalizeSeed(input.value);
      if (seed.length === 0) {
        error.textContent = "A run needs a seed.";
        error.hidden = false;
        input.focus();
        return;
      }
      actions.startRun(seed);
    };

    input.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      start();
    });

    const field = el("label", undefined, "seed-field");
    field.appendChild(el("span", "Seed", "seed-field-label"));
    field.appendChild(input);

    const buttons: HTMLElement[] = [
      actionButton("Start Run", "start", start),
      actionButton("Random Seed", "random", () => {
        input.value = actions.randomSeed();
        error.hidden = true;
        input.focus();
      }),
    ];

    // Continue is absent rather than disabled when there is nothing to continue,
    // so the title screen never offers an action that cannot work.
    if (data.save) {
      buttons.push(
        actionButton(
          `Continue - ${seedLabel(data.save.seed)} - level ${data.save.level}`,
          "continue",
          () => actions.continueRun(),
        ),
      );
    }

    if (data.history.length > 0) {
      buttons.push(actionButton("Run History", "history", () => showHistory(data)));
    }

    open(panel(el("h1", "NETDEV", "title"), field, error, ...buttons), input);
  }

  function showHistory(data: TitleData): void {
    titleView = "history";
    element.dataset.screen = "title";

    const list = el("ul", undefined, "history");
    // Newest first, which is the order readHistory already returns, and capped
    // again here so a screen cannot be handed a thousand rows and try to show
    // them all.
    for (const record of data.history.slice(0, RUN_HISTORY_CAP)) {
      const item = el("li", undefined, "history-item");
      item.dataset.seed = record.seed;
      item.appendChild(
        actionButton(
          seedLabel(record.seed),
          "history-seed",
          () => {
            void actions.copySeed(record.seed);
          },
          "history-seed",
        ),
      );
      item.appendChild(
        el(
          "span",
          `level ${record.level} - ${record.turns} turns - ${record.won ? "won" : "lost"}`,
          "history-detail",
        ),
      );
      list.appendChild(item);
    }

    open(
      panel(
        heading("Run History"),
        list,
        actionButton("Back", "back", () => showTitle(data)),
      ),
    );
  }

  function showPaused(view: PauseView = "menu"): void {
    pausedView = view;
    element.dataset.screen = "paused";

    if (view === "help") {
      open(
        panel(
          heading("Keys"),
          helpPanel(),
          ...HELP_NOTES,
          actionButton("Back", "back", () => showPaused("menu")),
        ),
      );
      return;
    }

    // Restart destroys a run irreversibly and sits one keystroke from Save and
    // Quit, so it takes a second press.
    if (view === "confirm-restart") {
      open(
        panel(
          heading("Restart this run?"),
          "Your current run is discarded and you start again at level 1.",
          actionButton("Yes, restart", "confirm-restart", () => actions.restartRun()),
          actionButton("Cancel", "cancel-restart", () => showPaused("menu")),
        ),
      );
      return;
    }

    open(
      panel(
        heading("Paused"),
        actionButton("Resume", "resume", () => actions.resume()),
        actionButton("Save and Quit", "save-quit", () => actions.saveAndQuit()),
        actionButton("Restart Run", "restart", () => showPaused("confirm-restart")),
        actionButton("Help", "help", () => showPaused("help")),
      ),
    );
  }

  // Read-only until T14 adds consumption: the data is real, the screen is a
  // plain list of it.
  function showInventory(state: GameState): void {
    lastInventory = state;
    element.dataset.screen = "inventory";

    const stats = effectiveStats(state);
    const weapon = equippedItem(state, "weapon");
    const armour = equippedItem(state, "armor");
    const potions = potionCount(state);

    // The panel takes focus rather than the Close button, so Enter drinks and
    // Tab still reaches the button.
    const content = panel(
      heading("Inventory"),
      `Weapon: ${weapon ? itemName(weapon.itemId) : "bare hands"}${
        stats.atkBonus > 0 ? ` (${signed(stats.atkBonus)} ATK)` : ""
      }`,
      `Armour: ${armour ? itemName(armour.itemId) : "nothing"}${
        stats.defBonus > 0 ? ` (${signed(stats.defBonus)} DEF)` : ""
      }`,
      `Potions: ${potions}`,
      `HP ${stats.hp}/${stats.maxHp}   ATK ${stats.atk}${
        stats.atkBonus > 0 ? ` (${signed(stats.atkBonus)})` : ""
      }   DEF ${stats.def}${stats.defBonus > 0 ? ` (${signed(stats.defBonus)})` : ""}`,
      // The refusal for drinking at full health is a log line (7.2), and the log
      // is behind the overlay, so the newest line is repeated here where it can
      // be read while the screen is still open.
      state.messages.length > 0 ? (state.messages[state.messages.length - 1] ?? "") : "",
      potions > 0 ? "1 or Enter drinks a potion. Esc or i closes." : "No potions. Esc or i closes.",
      actionButton("Close", "back", () => actions.resume()),
    );
    content.tabIndex = -1;
    open(content, content);
  }

  // The app resolves the turn; the layer only redraws with the new numbers, and
  // not at all if the drink killed the player and the app moved on to game over.
  function drink(): boolean {
    if (screenOf() !== "inventory" || !lastInventory) return false;
    actions.drinkPotion();
    if (screenOf() === "inventory" && lastInventory) showInventory(lastInventory);
    return true;
  }

  function showSummary(summary: RunSummary, victory: boolean): void {
    element.dataset.screen = victory ? "victory" : "gameover";
    open(
      panel(
        heading(victory ? "You escaped the dungeon" : "You died", "menu-heading big"),
        summaryRows(summary),
        seedBlock(summary.seed, (value) => actions.copySeed(value)),
        actionButton("Play again", "restart", () => actions.restartRun()),
        actionButton("Main Menu", "to-title", () => actions.toTitle()),
      ),
    );
  }

  return {
    element,
    get pausedView() {
      return pausedView;
    },
    get titleView() {
      return titleView;
    },
    isShowing: () => !element.hidden,
    escape,
    drink,
    clear: close,
    showTitle,
    showPaused,
    showInventory,
    showGameOver: (summary) => showSummary(summary, false),
    showVictory: (summary) => showSummary(summary, true),
  };
}
