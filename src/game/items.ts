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

/** Input for `pickReachableSpawnX`. */
export interface SpawnXParams {
  playerX: number;
  playerY: number;
  playerSpeed: number;
  fallSpeed: number;
  width: number;
  margin: number;
  spawnY: number;
  fairness: typeof GAME_CONFIG.item.spawnFairness;
  /** Random number in [0, 1). */
  rng: number;
}

/**
 * Picks a spawn X the cat can actually reach before the item falls past it.
 *
 * The item needs `fallTime` seconds to reach the cat's row, and the cat covers
 * `playerSpeed` px/sec. After a short reaction time that gives a reachable
 * window around the cat; spawning inside it keeps drops fair even when the cat
 * stands at the screen edge. As the fall speed grows the window shrinks, so the
 * difficulty still ramps up.
 */
export function pickReachableSpawnX(params: SpawnXParams): number {
  const {
    playerX,
    playerY,
    playerSpeed,
    fallSpeed,
    width,
    margin,
    spawnY,
    fairness,
    rng,
  } = params;

  const fallTime = Math.max(0, (playerY - spawnY) / Math.max(1, fallSpeed));
  const usableTime = Math.max(0, fallTime - fairness.reactionTimeMs / 1000);
  const reach = Phaser.Math.Clamp(
    playerSpeed * usableTime * fairness.reachFactor,
    fairness.minReachPx,
    fairness.maxReachPx,
  );

  const offset = (rng * 2 - 1) * reach;
  return Phaser.Math.Clamp(playerX + offset, margin, width - margin);
}
