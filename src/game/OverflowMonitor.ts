import { BOARD, RULES } from '../config/gameConfig';
import type { Ball } from './BallManager';

export class OverflowMonitor {
  update(balls: Iterable<Ball>, time: number, delta: number): number {
    let longest = 0;
    for (const ball of balls) {
      const settled = time - ball.bornAt >= RULES.stabilizationMs && ball.body.speed < 1.5;
      const aboveLine = ball.body.vertices!.some((vertex) => vertex.y < BOARD.dangerY);
      ball.overflowMs = settled && aboveLine && !ball.merging ? ball.overflowMs + delta : 0;
      longest = Math.max(longest, ball.overflowMs);
    }
    return Math.min(1, longest / RULES.overflowMs);
  }
}
