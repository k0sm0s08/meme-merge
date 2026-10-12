import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { memeTexture, textureDataUrl } from './ui/TextureFactory';
import { LEVELS } from './config/gameConfig';
import { saves } from './services/SaveService';

export function attachTestApi(game: Phaser.Game): void {
  const scene = (): GameScene => game.scene.getScene('Game') as GameScene;
  const api = {
    snapshot() {
      const current = scene();
      return {
        score: current.score?.score ?? 0,
        combo: current.score?.combo ?? 0,
        paused: current.paused,
        ended: current.ended,
        gameTime: current.gameTime,
        next: current.nextLevel,
        current: current.currentLevel,
        previewX: current.children.list.find((object): object is Phaser.GameObjects.Image => object instanceof Phaser.GameObjects.Image && object.depth === 7)?.x,
        balls: [...(current.balls?.balls.values() ?? [])].map((ball) => ({
          id: ball.id, level: ball.level, radius: ball.radius, x: ball.body.position.x, y: ball.body.position.y,
          speed: ball.body.speed, merging: ball.merging, overflowMs: ball.overflowMs,
          visualX: ball.image.x, visualY: ball.image.y, angularVelocity: ball.body.angularVelocity,
          texture: ball.image.texture.key,
        })),
        bodies: current.sys.isActive() ? current.matter.world.getAllBodies().length : 0,
        listeners: current.sys.isActive() ? current.matter.world.listenerCount('collisionstart') : 0,
        saves: saves.snapshot,
        textures: LEVELS.map(({ level }) => game.textures.exists(memeTexture(level))),
        sourceLevels: __MEME_ASSETS__,
        removedTextureExists: game.textures.exists(memeTexture(6)),
      };
    },
    fixture(balls: { level: number; x: number; y: number; age?: number; static?: boolean; vx?: number; vy?: number }[]) {
      const current = scene();
      current.balls.clear();
      for (const fixture of balls) {
        const ball = current.balls.create(fixture.level, fixture.x, fixture.y, current.gameTime - (fixture.age ?? 0));
        if (fixture.static) current.matter.body.setStatic(ball.body, true);
        current.matter.body.setVelocity(ball.body, { x: fixture.vx ?? 0, y: fixture.vy ?? 0 });
      }
      return current.gameTime;
    },
    manualStep(delta: number) { scene().update(0, delta); },
    textureData(level: number) { return textureDataUrl(scene(), level); },
    gameActive() { return game.scene.isActive('Game'); },
  };
  Object.assign(window, { __MEME_TEST__: api });
}
