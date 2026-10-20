import type Phaser from "phaser";

/** What kind of object is falling from the sky. */
export type ItemKind = "food" | "garbage" | "bomb" | "star";

/** A falling item: its on-screen sprite and its kind. */
export interface FallingItem {
  sprite: Phaser.GameObjects.Text;
  kind: ItemKind;
}
