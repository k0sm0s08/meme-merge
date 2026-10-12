import { audio } from './AudioManager';

/** Future SDK boundary. Rewarded actions only run after a confirmed reward. */
export interface PlatformService {
  ready(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  rewarded(placement: 'bomb' | 'second-chance'): Promise<boolean>;
  interstitial(): Promise<void>;
  submitScore(score: number): Promise<void>;
}

export const platform: PlatformService = {
  ready() {},
  gameplayStart() {},
  gameplayStop() {},
  async rewarded() { return audio.suspendForAd(async () => false); },
  async interstitial() { await audio.suspendForAd(async () => {}); },
  async submitScore() {},
};
