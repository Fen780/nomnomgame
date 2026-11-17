import type Phaser from "phaser";

/** What kind of object is falling from the sky. */
export type ItemKind =
  | "food"
  | "garbage"
  | "bomb"
  | "star"
  | "magnet"
  | "shield"
  | "slowdown";

/** A falling item: its on-screen sprite, its kind and horizontal drift. */
export interface FallingItem {
  sprite: Phaser.GameObjects.Image;
  kind: ItemKind;
  /** Horizontal drift (px/sec); non-zero for phase 3 diagonal drops. */
  vx: number;
}
