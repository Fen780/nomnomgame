import Phaser from "phaser";
import { GameScene } from "./GameScene";
import { GAME_CONFIG } from "./gameConfig";

export function createGame(parent: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
<<<<<<< HEAD
    width: GAME_CONFIG.canvas.width,
    height: GAME_CONFIG.canvas.height,
    backgroundColor: GAME_CONFIG.canvas.backgroundColor,
=======
    width: 640,
    height: 480,
    backgroundColor: "#87ceeb",
>>>>>>> 89b6d45cafa175e742379ffec5e5c9f7eeb3c56a
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };

  return new Phaser.Game(config);
}
