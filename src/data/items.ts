import type { ItemId } from "../game/types.js";

export type ItemCategory = "potion" | "weapon" | "armor";

export interface ItemDef {
  id: ItemId;
  name: string;
  glyph: string;
  category: ItemCategory;
  atkBonus: number;
  defBonus: number;
  stackable: boolean;
}

export const ITEMS: Readonly<Record<ItemId, ItemDef>> = {
  potion: {
    id: "potion",
    name: "Potion",
    glyph: "!",
    category: "potion",
    atkBonus: 0,
    defBonus: 0,
    stackable: true,
  },
  weapon_1: {
    id: "weapon_1",
    name: "Rusty Blade",
    glyph: "/",
    category: "weapon",
    atkBonus: 1,
    defBonus: 0,
    stackable: false,
  },
  weapon_2: {
    id: "weapon_2",
    name: "Steel Sword",
    glyph: "/",
    category: "weapon",
    atkBonus: 2,
    defBonus: 0,
    stackable: false,
  },
  weapon_3: {
    id: "weapon_3",
    name: "Mithril Edge",
    glyph: "/",
    category: "weapon",
    atkBonus: 3,
    defBonus: 0,
    stackable: false,
  },
  armor_1: {
    id: "armor_1",
    name: "Leather Vest",
    glyph: "[",
    category: "armor",
    atkBonus: 0,
    defBonus: 1,
    stackable: false,
  },
  armor_2: {
    id: "armor_2",
    name: "Chain Mail",
    glyph: "[",
    category: "armor",
    atkBonus: 0,
    defBonus: 2,
    stackable: false,
  },
};

export interface ItemWeights {
  potion: number;
  weapon: number;
  armor: number;
}

export const ITEM_WEIGHTS: Readonly<Record<string, ItemWeights>> = {
  "1-2": { potion: 0.4, weapon: 0.4, armor: 0.2 },
  "3-5": { potion: 0.35, weapon: 0.4, armor: 0.25 },
  "6-9": { potion: 0.3, weapon: 0.4, armor: 0.3 },
};
