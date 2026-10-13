import { audio } from './AudioManager';

interface YandexSDK {
  features?: { LoadingAPI?: { ready(): void }; GameplayAPI?: { start(): void; stop(): void } };
  adv: {
    showRewardedVideo(options: { callbacks: {
      onOpen(): void; onRewarded(): void; onClose(): void; onError(error: unknown): void;
    } }): void;
  };
  on?(event: 'game_api_pause' | 'game_api_resume', callback: () => void): void;
}
declare global {
  interface Window { YaGames?: { init(): Promise<YandexSDK> } }
}

/** GitHub Pages stays offline-capable. Only the separate Yandex build loads their SDK. */
class PlatformService {
  readonly supportsRewards = __YANDEX_GAMES__;
  pausedByPlatform = false;
  private sdk: YandexSDK | null = null;
  private initialization: Promise<void> | null = null;
  private loaded = false;
  private readySent = false;
  private playing = false;
  private playingSent = false;
  private adInFlight = false;
  private pauseListeners = new Set<() => void>();

  initialize(): Promise<void> {
    if (!__YANDEX_GAMES__ || this.sdk) return Promise.resolve();
    if (this.initialization) return this.initialization;
    this.initialization = this.connect().catch(() => {
      // The game remains playable if SDK initialization fails. A later ad click can retry.
      console.warn('Яндекс SDK недоступен. Игра работает, реклама временно недоступна.');
    }).finally(() => { this.initialization = null; });
    return this.initialization;
  }

  ready(): void { this.loaded = true; this.sync(); }
  gameplayStart(): void { this.playing = true; this.sync(); }
  gameplayStop(): void { this.playing = false; this.sync(); }
  onPause(callback: () => void): () => void {
    this.pauseListeners.add(callback);
    return () => this.pauseListeners.delete(callback);
  }

  async rewarded(_placement: 'bomb' | 'second-chance'): Promise<boolean> {
    if (!this.supportsRewards || this.adInFlight) return false;
    this.adInFlight = true;
    try {
      return await audio.suspendForAd(async () => {
        await this.initialize();
        if (!this.sdk) return false;
        return new Promise<boolean>((resolve) => {
          let rewarded = false;
          let closed = false;
          const finish = (success: boolean): void => {
            if (closed) return;
            closed = true;
            resolve(success);
          };
          try {
            this.sdk!.adv.showRewardedVideo({ callbacks: {
              onOpen: () => { this.gameplayStop(); },
              onRewarded: () => { if (!closed) rewarded = true; },
              // A reward callback alone must never resume the game underneath an open ad.
              onClose: () => finish(rewarded),
              onError: () => finish(false),
            } });
          } catch { finish(false); }
        });
      });
    } finally { this.adInFlight = false; }
  }

  async interstitial(): Promise<void> { /* No unsolicited advertising. */ }
  async submitScore(_score: number): Promise<void> { /* Local records; no authorization needed. */ }

  private async connect(): Promise<void> {
    const deadline = (task: Promise<YandexSDK>): Promise<YandexSDK> => new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('SDK initialization timed out')), 10000);
      task.then(resolve, reject).finally(() => clearTimeout(timer));
    });
    if (!window.YaGames) await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/sdk.js'; // Served by Yandex Games, outside the uploaded archive.
      script.async = true;
      const timer = window.setTimeout(() => finish(new Error('SDK loading timed out')), 10000);
      const finish = (error?: Error): void => {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); } else resolve();
      };
      script.onload = () => finish();
      script.onerror = () => finish(new Error('SDK loading failed'));
      document.head.append(script);
    });
    if (!window.YaGames) throw new Error('Missing YaGames');
    this.sdk = await deadline(window.YaGames.init());
    this.sdk.on?.('game_api_pause', () => {
      this.pausedByPlatform = true;
      audio.setSuspended('platform', true);
      for (const callback of this.pauseListeners) callback();
    });
    this.sdk.on?.('game_api_resume', () => {
      this.pausedByPlatform = false;
      audio.setSuspended('platform', false);
    });
    this.sync();
  }

  private sync(): void {
    if (!this.sdk) return;
    try {
      if (this.loaded && !this.readySent) {
        this.sdk.features?.LoadingAPI?.ready();
        this.readySent = true;
      }
      if (this.readySent && this.playing !== this.playingSent) {
        if (this.playing) this.sdk.features?.GameplayAPI?.start();
        else this.sdk.features?.GameplayAPI?.stop();
        this.playingSent = this.playing;
      }
    } catch { console.warn('Не удалось передать событие Яндекс SDK.'); }
  }
}
export const platform = new PlatformService();
