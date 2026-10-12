import { normalizeSavedLevel } from '../config/gameConfig';

export interface SaveData {
  version: 1;
  bestScore: number;
  gamesPlayed: number;
  maxLevel: number;
}

const KEY = 'meme-merge.save.v1';
const fresh = (): SaveData => ({ version: 1, bestScore: 0, gamesPlayed: 0, maxLevel: 1 });
const integer = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback;

export class SaveService {
  private data: SaveData = fresh();

  constructor() {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (raw && typeof raw === 'object' && 'version' in raw && raw.version === 1) {
        const saved = raw as Record<string, unknown>;
        this.data = {
          version: 1,
          bestScore: integer(saved.bestScore, 0),
          gamesPlayed: integer(saved.gamesPlayed, 0),
          maxLevel: normalizeSavedLevel(integer(saved.maxLevel, 1)),
        };
        if (this.data.maxLevel !== saved.maxLevel) this.persist();
      }
    } catch { /* Private browsing and corrupt saves keep an in-memory fallback. */ }
  }

  get snapshot(): Readonly<SaveData> { return { ...this.data }; }

  beginGame(): void {
    this.data.gamesPlayed += 1;
    this.persist();
  }

  record(score: number, level: number): void {
    const best = Math.max(this.data.bestScore, score);
    const maxLevel = Math.max(this.data.maxLevel, normalizeSavedLevel(level));
    if (best === this.data.bestScore && maxLevel === this.data.maxLevel) return;
    this.data.bestScore = best;
    this.data.maxLevel = maxLevel;
    this.persist();
  }

  private persist(): void {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); }
    catch { /* Saving must never interrupt gameplay. */ }
  }
}

export const saves = new SaveService();
