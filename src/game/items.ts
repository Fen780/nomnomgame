import Phaser from "phaser";
import { GAME_CONFIG } from "./gameConfig";
import type { ItemKind } from "./types";

/** The result of picking the next falling item. */
export interface PickedItem {
  kind: ItemKind;
  emoji: string;
}

/**
 * Decides what kind of item drops next.
 *
 * Pure function: `roll` is a random number in [0, 1) supplied by the caller,
 * so the drop mix is deterministic and easy to test. Probabilities come from
 * `GAME_CONFIG.drops`.
 */
export function pickItem(phase: 1 | 2, roll: number): PickedItem {
  const { drops } = GAME_CONFIG;

  if (phase === 2) {
    // Phase 2 mix: bomb, star, garbage, then food.
    if (roll < drops.bombChance)
      return { kind: "bomb", emoji: drops.bombEmoji };
    if (roll < drops.bombChance + drops.starChance) {
      return { kind: "star", emoji: drops.starEmoji };
    }
    if (roll < drops.bombChance + drops.starChance + drops.garbageChance) {
      return { kind: "garbage", emoji: drops.garbageEmoji };
    }
    return {
      kind: "food",
      emoji:
        drops.foodEmojis[Phaser.Math.Between(0, drops.foodEmojis.length - 1)],
    };
  }

  // Phase 1 mix: garbage, then food.
  if (roll < drops.garbageChance) {
    return { kind: "garbage", emoji: drops.garbageEmoji };
  }
  return {
    kind: "food",
    emoji:
      drops.foodEmojis[Phaser.Math.Between(0, drops.foodEmojis.length - 1)],
  };
}
