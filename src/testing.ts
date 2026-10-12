import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { memeTexture, textureDataUrl } from './ui/TextureFactory';
import { LEVELS } from './config/gameConfig';
import { saves } from './services/SaveService';
import { audio } from './services/AudioManager';
import { memeShape } from './game/MemeShape';

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
        activePointer: current.aimController?.activePointer ?? null,
        debugPhysics: current.physicsDebug?.enabled ?? false,
        currentShape: memeShape(current.currentLevel),
        audio: audio.snapshot,
        previewX: current.children.list.find((object): object is Phaser.GameObjects.Image => object instanceof Phaser.GameObjects.Image && object.depth === 7)?.x,
        balls: [...(current.balls?.balls.values() ?? [])].map((ball) => ({
          id: ball.id, level: ball.level, radius: ball.radius, x: ball.body.position.x, y: ball.body.position.y,
          speed: ball.body.speed, merging: ball.merging, overflowMs: ball.overflowMs,
          visualX: ball.image.x, visualY: ball.image.y, angularVelocity: ball.body.angularVelocity,
          texture: ball.image.texture.key,
          visualDiameter: ball.image.displayWidth,
          colliderRadius: ball.body.circleRadius,
          bounds: ball.body.bounds,
          vertices: ball.body.vertices!.map(({ x, y }) => ({ x, y })),
          parts: (ball.body.parts.length > 1 ? ball.body.parts.slice(1) : ball.body.parts).map((part) => part.vertices!.map(({ x, y }) => ({ x, y }))),
          originX: ball.image.originX, originY: ball.image.originY,
          angle: ball.body.angle, visualAngle: ball.image.rotation,
          sleeping: ball.body.isSleeping,
        })),
        bodies: current.sys.isActive() ? current.matter.world.getAllBodies().length : 0,
        listeners: current.sys.isActive() ? current.matter.world.listenerCount('collisionstart') : 0,
        saves: saves.snapshot,
        textures: LEVELS.map(({ level }) => game.textures.exists(memeTexture(level))),
        sourceLevels: __MEME_ASSETS__,
        removedTextureExists: game.textures.exists(memeTexture(6)),
        shapes: LEVELS.map(({ level }) => memeShape(level)),
      };
    },
    fixture(balls: { level: number; x: number; y: number; age?: number; static?: boolean; vx?: number; vy?: number; angle?: number }[]) {
      const current = scene();
      current.balls.clear();
      for (const fixture of balls) {
        const ball = current.balls.create(fixture.level, fixture.x, fixture.y, current.gameTime - (fixture.age ?? 0));
        if (fixture.angle) current.matter.body.setAngle(ball.body, fixture.angle);
        if (fixture.static) current.matter.body.setStatic(ball.body, true);
        current.matter.body.setVelocity(ball.body, { x: fixture.vx ?? 0, y: fixture.vy ?? 0 });
      }
      return current.gameTime;
    },
    manualStep(delta: number) { scene().update(0, delta); },
    textureData(level: number) { return textureDataUrl(scene(), level); },
    gameActive() { return game.scene.isActive('Game'); },
    contacts() {
      const current = scene();
      const bodies = current.matter.world.getAllBodies();
      const query = current.matter.query as MatterJS.QueryFactory & {
        collides(part: MatterJS.BodyType, bodies: MatterJS.BodyType[]): {
          bodyA: MatterJS.BodyType; bodyB: MatterJS.BodyType; depth: number; supports: MatterJS.Vector[];
        }[];
      };
      // Sleeping contacts are removed from Engine.pairs; query current parts to measure their geometry.
      return [...current.balls.balls.values()].flatMap(({ body }) => {
        const parts = body.parts.length > 1 ? body.parts.slice(1) : body.parts;
        return parts.flatMap((part) => query.collides(part, bodies.filter((other) => other.id !== body.id))).map((collision) => ({
          a: collision.bodyA.parent.id, b: collision.bodyB.parent.id,
          aLabel: collision.bodyA.parent.label, bLabel: collision.bodyB.parent.label, depth: collision.depth,
          supports: collision.supports.filter(Boolean).map(({ x, y }) => ({ x, y })),
        }));
      });
    },
    audioSuspend(reason: 'game' | 'hidden' | 'blur' | 'ad', value: boolean) { audio.setSuspended(reason, value); },
    playEffect(key: 'effect01' | 'effect03') { return audio.playEffect(key); },
  };
  Object.assign(window, { __MEME_TEST__: api });
}
