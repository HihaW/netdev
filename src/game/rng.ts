import * as ROT from "rot-js";

export type RngState = [number, number, number, number];
export type Purpose = "gen" | "play";

export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function toSeed(v: number): number {
  const s = Math.floor(v) >>> 0;
  return s === 0 ? 1 : s;
}

export function deriveSeed(seed: string, level: number, purpose: Purpose, attempt = 0): number {
  const suffix = attempt > 0 ? `|r${attempt}` : "";
  return toSeed(cyrb53(`${seed}|${purpose}|${level}${suffix}`));
}

let playRng = ROT.RNG.clone();

export function beginLevelConstruction(seed: string, level: number, attempt: number): void {
  ROT.RNG.setSeed(deriveSeed(seed, level, "gen", attempt));
}

export function beginLevelGameplay(seed: string, level: number): void {
  playRng = ROT.RNG.clone().setSeed(deriveSeed(seed, level, "play"));
}

export function restoreGameplayState(state: RngState): void {
  playRng.setState(state);
}

export function getGameplayState(): RngState {
  return playRng.getState() as RngState;
}

export function gameplayRandom(): number {
  return playRng.getUniform();
}
