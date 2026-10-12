import Phaser from 'phaser';
import { BOARD, PHYSICS, RULES, levelConfig } from '../config/gameConfig';
import { memeTexture } from '../ui/TextureFactory';
import { createMemeBody, memeShape } from './MemeShape';

export interface Ball {
  id: number;
  level: number;
  radius: number;
  body: MatterJS.BodyType;
  image: Phaser.GameObjects.Image;
  bornAt: number;
  merging: boolean;
  overflowMs: number;
  previousX: number;
  previousY: number;
  previousAngle: number;
}

export class BallManager {
  readonly balls = new Map<number, Ball>();
  private world: Phaser.Physics.Matter.World;

  constructor(private scene: Phaser.Scene) { this.world = scene.matter.world; }

  create(level: number, x: number, y: number, bornAt: number, merged = false): Ball {
    const config = levelConfig(level);
    const shape = memeShape(level);
    const radius = shape.radius;
    const body = createMemeBody(this.scene, level);
    x = Phaser.Math.Clamp(x, BOARD.left - shape.bounds.minX, BOARD.right - shape.bounds.maxX);
    y = Math.min(y, BOARD.bottom - shape.bounds.maxY);
    const position = merged ? this.mergePosition(body, x, y) : { x, y };
    this.scene.matter.body.setPosition(body, position);
    this.world.add(body);
    x = position.x;
    y = position.y;
    const image = this.scene.add.image(x, y, memeTexture(level)).setOrigin(shape.originX, shape.originY).setDisplaySize(config.diameter, config.diameter).setDepth(5);
    const ball: Ball = { id: body.id, level, radius, body, image, bornAt, merging: false, overflowMs: 0, previousX: x, previousY: y, previousAngle: 0 };
    this.balls.set(ball.id, ball);
    if (merged) {
      image.setAlpha(0.92);
      this.scene.tweens.add({ targets: image, alpha: 1, duration: 160, ease: 'Sine.Out' });
    }
    return ball;
  }

  remove(ball: Ball): void {
    if (!this.balls.delete(ball.id)) return;
    this.scene.tweens.killTweensOf(ball.image);
    this.world.remove(ball.body);
    ball.image.destroy();
  }

  clear(): void { for (const ball of [...this.balls.values()]) this.remove(ball); }

  needsSubstep(): boolean {
    for (const { body, radius } of this.balls.values()) {
      if (!body.isSleeping && (body.speed > RULES.fastMotionThreshold || Math.abs(body.angularVelocity) * radius > RULES.fastMotionThreshold)) return true;
    }
    return false;
  }

  limitVelocity(): void {
    for (const ball of this.balls.values()) {
      const { x, y } = ball.body.velocity;
      if (Math.abs(x) > PHYSICS.maxHorizontalSpeed || Math.abs(y) > PHYSICS.maxVerticalSpeed) {
        this.scene.matter.body.setVelocity(ball.body, {
          x: Phaser.Math.Clamp(x, -PHYSICS.maxHorizontalSpeed, PHYSICS.maxHorizontalSpeed),
          y: Phaser.Math.Clamp(y, -PHYSICS.maxVerticalSpeed, PHYSICS.maxVerticalSpeed),
        });
      }
      if (Math.abs(ball.body.angularVelocity) > PHYSICS.maxAngularSpeed) {
        this.scene.matter.body.setAngularVelocity(ball.body, Phaser.Math.Clamp(ball.body.angularVelocity, -PHYSICS.maxAngularSpeed, PHYSICS.maxAngularSpeed));
      }
    }
  }

  capturePrevious(): void {
    for (const ball of this.balls.values()) {
      ball.previousX = ball.body.position.x;
      ball.previousY = ball.body.position.y;
      ball.previousAngle = ball.body.angle;
    }
  }

  sync(alpha = 1): void {
    for (const ball of this.balls.values()) {
      ball.image.setPosition(
        Phaser.Math.Linear(ball.previousX, ball.body.position.x, alpha),
        Phaser.Math.Linear(ball.previousY, ball.body.position.y, alpha),
      ).setRotation(ball.previousAngle + Phaser.Math.Angle.Wrap(ball.body.angle - ball.previousAngle) * alpha);
    }
  }

  /** Small, local placement correction avoids creating a larger body inside a neighbour. */
  private mergePosition(body: MatterJS.BodyType, x: number, y: number): { x: number; y: number } {
    const minX = body.bounds.min.x;
    const maxX = body.bounds.max.x;
    const maxY = body.bounds.max.y;
    const bounded = (dx: number, dy: number) => ({
      x: Phaser.Math.Clamp(x + dx, BOARD.left - minX, BOARD.right - maxX),
      y: Phaser.Math.Clamp(y + dy, BOARD.spawnY, BOARD.bottom - maxY),
    });
    const neighbors = [...this.balls.values()].filter((ball) => !ball.merging).map((ball) => ball.body);
    // Phaser's declarations omit Query.collides. Its query body must be convex, so query each part.
    const query = this.scene.matter.query as MatterJS.QueryFactory & {
      collides(part: MatterJS.BodyType, bodies: MatterJS.BodyType[]): { depth: number }[];
    };
    const parts = body.parts.length > 1 ? body.parts.slice(1) : body.parts;
    const cost = (position: { x: number; y: number }): number => {
      this.scene.matter.body.setPosition(body, position);
      let total = ((position.x - x) ** 2 + (position.y - y) ** 2) * 0.15;
      for (const part of parts) for (const collision of query.collides(part, neighbors)) total += collision.depth * collision.depth;
      return total;
    };
    let best = bounded(0, 0);
    let bestCost = cost(best);
    const distance = Math.min(8, (maxX - minX) * 0.1);
    for (const [dx, dy] of [[0, -distance], [-distance, 0], [distance, 0], [-distance * 0.7, -distance * 0.7], [distance * 0.7, -distance * 0.7], [0, distance]]) {
      const candidate = bounded(dx, dy);
      const candidateCost = cost(candidate);
      if (candidateCost < bestCost) { best = candidate; bestCost = candidateCost; }
    }
    return best;
  }

  at(x: number, y: number): Ball | undefined {
    return [...this.balls.values()].reverse().find((ball) =>
      this.scene.matter.query.point([ball.body], { x, y }).length > 0,
    );
  }
}
