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
 * `GAME_CONFIG.drops` and depend on the current phase:
 *
 * - Phase 1: garbage, then food.
 * - Phase 2: bombs, stars, garbage, power-ups, then food.
 * - Phase 3: harsher mix — more bombs/garbage, more stars, diagonal drops.
 */
export function pickItem(phase: 1 | 2 | 3, roll: number): PickedItem {
  const { drops } = GAME_CONFIG;

  const bombChance =
    phase === 1 ? 0 : phase === 3 ? drops.phase3BombChance : drops.bombChance;
  const starChance =
    phase === 1 ? 0 : phase === 3 ? drops.phase3StarChance : drops.starChance;
  const garbageChance =
    phase === 3 ? drops.phase3GarbageChance : drops.garbageChance;

  let acc = 0;

  acc += bombChance;
  if (roll < acc) return { kind: "bomb", emoji: drops.bombEmoji };

  acc += starChance;
  if (roll < acc) return { kind: "star", emoji: drops.starEmoji };

  acc += garbageChance;
  if (roll < acc) return { kind: "garbage", emoji: drops.garbageEmoji };

  acc += drops.magnetChance;
  if (roll < acc) return { kind: "magnet", emoji: drops.magnetEmoji };

  acc += drops.shieldChance;
  if (roll < acc) return { kind: "shield", emoji: drops.shieldEmoji };

  return {
    kind: "food",
    emoji:
      drops.foodEmojis[Phaser.Math.Between(0, drops.foodEmojis.length - 1)],
  };
}
