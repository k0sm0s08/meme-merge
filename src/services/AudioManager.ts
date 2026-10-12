import { AUDIO_ASSETS } from '../config/assets';

export interface AudioSettings { music: boolean; effects: boolean }
type Effect = 'effect01' | 'effect03';
type Suspension = 'game' | 'hidden' | 'blur' | 'ad';
const STORAGE_KEY = 'meme-merge.audio.v1';
const MUSIC_VOLUME = 0.22;

/** A single application-lifetime music player; scenes never allocate their own audio. */
export class AudioManager {
  private settings: AudioSettings = { music: true, effects: true };
  private music = new Audio(AUDIO_ASSETS.music);
  private effects = { effect01: new Audio(AUDIO_ASSETS.effect01), effect03: new Audio(AUDIO_ASSETS.effect03) };
  private suspensions = new Set<Suspension>();
  private subscribers = new Set<() => void>();
  private unlocked = false;
  private musicAttempt = false;
  private activeEffect: Effect | null = null;
  private effectGeneration = 0;
  private adDepth = 0;
  private adWasSuspended = false;
  private disposed = false;

  constructor() {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (value && typeof value === 'object') {
        const saved = value as Record<string, unknown>;
        if (typeof saved.music === 'boolean') this.settings.music = saved.music;
        if (typeof saved.effects === 'boolean') this.settings.effects = saved.effects;
      }
    } catch { /* Sound settings are optional, including in private browsing. */ }
    this.music.loop = true;
    this.music.volume = MUSIC_VOLUME;
    for (const player of this.players) player.preload = 'metadata';
    for (const key of ['effect01', 'effect03'] as const) {
      this.effects[key].volume = 0.4;
      this.effects[key].addEventListener('ended', () => this.finishEffect(key));
      this.effects[key].addEventListener('error', () => this.finishEffect(key));
    }
    if (document.hidden) this.suspensions.add('hidden');
    document.addEventListener('pointerdown', this.interaction, true);
    document.addEventListener('keydown', this.interaction, true);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('blur', this.blur);
    window.addEventListener('focus', this.focus);
    window.addEventListener('pagehide', this.pageHide);
    window.addEventListener('pageshow', this.visibility);
  }

  get preferences(): Readonly<AudioSettings> { return { ...this.settings }; }

  get snapshot() {
    return {
      ...this.settings, unlocked: this.unlocked, musicPaused: this.music.paused,
      musicTime: this.music.currentTime, musicVolume: this.music.volume,
      musicLoop: this.music.loop, suspensions: [...this.suspensions],
      activeEffect: this.activeEffect,
      players: this.players.map((player) => ({ src: player.src, paused: player.paused, readyState: player.readyState })),
    };
  }

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  toggle(key: keyof AudioSettings): void {
    this.settings[key] = !this.settings[key];
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); }
    catch { /* Continue with in-memory preferences. */ }
    if (!this.settings.effects) this.stopEffect();
    this.reconcile();
    for (const callback of this.subscribers) callback();
  }

  setSuspended(reason: Suspension, value: boolean): void {
    if (value) this.suspensions.add(reason);
    else this.suspensions.delete(reason);
    this.reconcile();
  }

  /** Future platform boundary; blocking reasons survive pause, focus and setting changes. */
  async suspendForAd<T>(action: () => Promise<T>): Promise<T> {
    if (this.adDepth++ === 0) {
      this.adWasSuspended = this.suspensions.has('ad');
      this.setSuspended('ad', true);
    }
    try { return await action(); }
    finally { if (--this.adDepth === 0 && !this.adWasSuspended) this.setSuspended('ad', false); }
  }

  /** Explicit resource API only: these clips are deliberately not bound to gameplay events. */
  async playEffect(key: Effect): Promise<boolean> {
    if (this.disposed || !this.unlocked || !this.settings.effects || this.suspensions.size || this.activeEffect) return false;
    this.activeEffect = key;
    const generation = ++this.effectGeneration;
    const player = this.effects[key];
    this.music.pause();
    player.currentTime = 0;
    try {
      await player.play();
      if (generation !== this.effectGeneration) return false;
      if (this.suspensions.size) player.pause();
      return true;
    } catch {
      if (generation === this.effectGeneration) this.stopEffect();
      return false;
    }
  }

  destroy(): void {
    this.disposed = true;
    document.removeEventListener('pointerdown', this.interaction, true);
    document.removeEventListener('keydown', this.interaction, true);
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('blur', this.blur);
    window.removeEventListener('focus', this.focus);
    window.removeEventListener('pagehide', this.pageHide);
    window.removeEventListener('pageshow', this.visibility);
    for (const player of this.players) { player.pause(); player.removeAttribute('src'); player.load(); }
    this.subscribers.clear();
  }

  private get players(): HTMLAudioElement[] { return [this.music, this.effects.effect01, this.effects.effect03]; }

  private interaction = (event: Event): void => {
    if (!event.isTrusted) return;
    if (event instanceof KeyboardEvent && (event.repeat || !['Enter', ' ', 'Escape'].includes(event.key))) return;
    this.unlocked = true;
    // Turning music off as the first interaction must not briefly start it.
    if ((event.target as Element | null)?.closest?.('[data-audio="music"]') && this.settings.music) return;
    this.reconcile();
  };
  private visibility = (): void => this.setSuspended('hidden', document.hidden);
  private blur = (): void => this.setSuspended('blur', true);
  private focus = (): void => this.setSuspended('blur', false);
  private pageHide = (): void => this.setSuspended('hidden', true);

  private reconcile(): void {
    if (this.disposed) return;
    const permitted = this.unlocked && this.suspensions.size === 0;
    if (this.activeEffect) {
      const effect = this.effects[this.activeEffect];
      this.music.pause();
      if (!permitted || !this.settings.effects) effect.pause();
      else if (effect.paused) {
        const generation = this.effectGeneration;
        void effect.play().catch(() => { if (generation === this.effectGeneration) this.stopEffect(); });
      }
      return;
    }
    if (!permitted || !this.settings.music) { this.music.pause(); return; }
    if (!this.music.paused || this.musicAttempt) return;
    this.musicAttempt = true;
    void this.music.play().catch(() => { /* Browser can require another trusted gesture. */ }).finally(() => {
      this.musicAttempt = false;
      if (this.disposed || this.suspensions.size || !this.settings.music || this.activeEffect) this.music.pause();
    });
  }

  private finishEffect(key: Effect): void { if (this.activeEffect === key) this.stopEffect(); }
  private stopEffect(): void {
    this.effectGeneration++;
    for (const player of Object.values(this.effects)) { player.pause(); player.currentTime = 0; }
    this.activeEffect = null;
    this.reconcile();
  }
}

export const audio = new AudioManager();
