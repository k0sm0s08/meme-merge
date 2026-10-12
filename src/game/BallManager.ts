import Phaser from 'phaser';
import { BOARD, PHYSICS, levelConfig } from '../config/gameConfig';
import { memeTexture } from '../ui/TextureFactory';

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
    const radius = config.diameter / 2;
    x = Phaser.Math.Clamp(x, BOARD.left + radius, BOARD.right - radius);
    y = Math.min(y, BOARD.bottom - radius);
    const body = this.scene.matter.add.circle(x, y, radius, {
      ...PHYSICS,
      label: `meme-${level}`,
      sleepThreshold: 90,
    }, 48);
    this.scene.matter.body.setInertia(body, body.inertia * 1.7);
    const image = this.scene.add.image(x, y, memeTexture(level)).setDisplaySize(config.diameter, config.diameter).setDepth(5);
    const ball: Ball = { id: body.id, level, radius, body, image, bornAt, merging: false, overflowMs: 0, previousX: x, previousY: y, previousAngle: 0 };
    this.balls.set(ball.id, ball);
    if (merged) {
      const scale = image.scaleX;
      image.setScale(scale * 1.06).setAlpha(0.92);
      this.scene.tweens.add({ targets: image, scaleX: scale, scaleY: scale, alpha: 1, duration: 160, ease: 'Sine.Out' });
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
  mergePosition(x: number, y: number, radius: number): { x: number; y: number } {
    const bounded = (dx: number, dy: number) => ({
      x: Phaser.Math.Clamp(x + dx, BOARD.left + radius, BOARD.right - radius),
      y: Phaser.Math.Clamp(y + dy, BOARD.spawnY, BOARD.bottom - radius),
    });
    const cost = (position: { x: number; y: number }): number => {
      let total = ((position.x - x) ** 2 + (position.y - y) ** 2) * 0.15;
      for (const ball of this.balls.values()) {
        if (ball.merging) continue;
        const overlap = radius + ball.radius - Phaser.Math.Distance.Between(position.x, position.y, ball.body.position.x, ball.body.position.y);
        if (overlap > 0) total += overlap * overlap;
      }
      return total;
    };
    let best = bounded(0, 0);
    let bestCost = cost(best);
    const distance = Math.min(8, radius * 0.2);
    for (const [dx, dy] of [[0, -distance], [-distance, 0], [distance, 0], [-distance * 0.7, -distance * 0.7], [distance * 0.7, -distance * 0.7], [0, distance]]) {
      const candidate = bounded(dx, dy);
      const candidateCost = cost(candidate);
      if (candidateCost < bestCost) { best = candidate; bestCost = candidateCost; }
    }
    return best;
  }

  at(x: number, y: number): Ball | undefined {
    return [...this.balls.values()].reverse().find((ball) =>
      Phaser.Math.Distance.Between(x, y, ball.body.position.x, ball.body.position.y) <= ball.radius,
    );
  }
}
