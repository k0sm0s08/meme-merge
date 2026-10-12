import { RULES } from '../config/gameConfig';
import { saves } from '../services/SaveService';

export class ScoreManager {
  score = 0;
  maxLevel = 1;
  combo = 0;
  private lastMergeAt = -Infinity;

  add(points: number, level: number, time: number): number {
    this.combo = time - this.lastMergeAt <= RULES.comboWindowMs ? this.combo + 1 : 1;
    this.lastMergeAt = time;
    this.score += points;
    this.maxLevel = Math.max(this.maxLevel, level);
    saves.record(this.score, this.maxLevel);
    return this.combo;
  }

  observeLevel(level: number): void {
    this.maxLevel = Math.max(this.maxLevel, level);
    saves.record(this.score, this.maxLevel);
  }
}
