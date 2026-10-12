import type Phaser from 'phaser';
import { LEVELS } from '../config/gameConfig';
import { saves } from '../services/SaveService';
import { textureDataUrl } from './TextureFactory';
import { icon } from './icons';
import { audio } from '../services/AudioManager';

type ButtonAction = () => void;
export interface GameActions {
  pause: ButtonAction;
  resume: ButtonAction;
  restart: ButtonAction;
  menu: ButtonAction;
}

export class GameUI {
  private root = document.getElementById('ui')!;
  private artwork = new Map<number, string>();
  private actions: GameActions | null = null;
  private modal: HTMLElement | null = null;
  private previousFocus: HTMLElement | null = null;
  private onDialogKey = (event: KeyboardEvent): void => {
    if (!this.modal) return;
    if (event.key === 'Tab') {
      const buttons = [...this.modal.querySelectorAll<HTMLButtonElement>('button')];
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };

  constructor() {
    document.addEventListener('keydown', this.onDialogKey);
    audio.subscribe(() => this.updateAudioControls());
  }

  get hasModal(): boolean { return this.modal !== null; }

  cacheArtwork(scene: Phaser.Scene): void {
    this.artwork = new Map(LEVELS.map((config) => [config.level, textureDataUrl(scene, config.level)]));
  }

  image(level: number, className = '', label = ''): string {
    const source = this.artwork.get(level);
    if (!source) throw new Error(`Нет изображения для уровня ${level}`);
    return `<img class="${className}" src="${source}" data-level="${level}" alt="${label || `Мем уровня ${level}`}" draggable="false" />`;
  }

  menu(play: ButtonAction): void {
    this.clear();
    const { bestScore, gamesPlayed } = saves.snapshot;
    this.root.innerHTML = `<section class="menu-screen">
      <div class="eyebrow"><span class="live-dot"></span> ЕЩЁ ОДИН МЕМ?</div>
      <div class="brand-title">Мелстрой<br /><span>мерж<span class="title-star">✦</span></span></div>
      <p class="menu-subtitle">Соединяй одинаковые.<br />Доберись до легенды.</p>
      <div class="menu-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="art-spark spark-one">✦</span><span class="art-spark spark-two">+</span>${this.image(1, 'hero-ball hero-one')}${this.image(3, 'hero-ball hero-two')}${this.image(5, 'hero-ball hero-three')}${this.image(7, 'hero-ball hero-four')}<span class="art-caption">маленькие мемы → большие эмоции</span></div>
      <div class="menu-record">${icon('crown')}<span>ТВОЙ РЕКОРД<strong>${format(bestScore)}</strong></span><span class="record-tag">${gamesPlayed ? `${gamesPlayed} партий` : 'Всё впереди'}</span></div>
      <button class="button primary" data-action="play">${icon('play')}<span>Играть</span>${icon('arrow')}</button>
      ${this.audioControls()}
      <button class="text-button" data-action="collection">Все ${LEVELS.length} мемов ${icon('arrow')}</button>
      <div class="menu-footnote">Твоя следующая попытка может стать лучшей.</div>
    </section>`;
    this.bind('play', play);
    this.bind('collection', () => this.collection(() => this.closeModal()));
    this.bindAudioControls();
  }

  game(actions: GameActions): void {
    this.clear();
    this.actions = actions;
    this.root.innerHTML = `<section class="game-screen">
      <header class="game-header"><div class="small-brand"><span class="brand-symbol">м<span>м</span></span><div>Мелстрой мерж<span>СОБЕРИ СВОЮ ЛЕГЕНДУ</span></div></div><div class="header-actions"><button class="icon-button" data-action="audio" aria-label="Настройки звука">${icon('music')}</button><button class="icon-button" data-action="restart" aria-label="Начать заново">${icon('restart')}</button><button class="icon-button" data-action="pause" aria-label="Пауза">${icon('pause')}</button></div></header>
      <div class="scoreboard"><div class="current-score"><span class="stat-label">СЧЁТ</span><strong id="score" aria-live="polite">0</strong></div><div class="best-score"><span class="stat-label">${icon('crown')} РЕКОРД</span><strong id="best">${format(saves.snapshot.bestScore)}</strong></div></div>
      <div class="queue-row"><div class="queue-copy"><span class="live-dot"></span><span id="queue-hint">Твой ход</span><span id="combo" class="combo" aria-live="polite"></span></div><div class="next-meme"><span>СЛЕДУЮЩИЙ</span><div id="next-preview"></div></div></div>
      <div class="danger-label" id="danger-label"><span></span>НЕ ПЕРЕСЕКАЙ ЛИНИЮ<span></span></div>
      <div class="board-warning" id="board-warning" aria-live="polite"></div>
      <div class="game-tip">${icon('touch')}<span><strong>Прицелься и отпусти</strong><br />Два одинаковых — один покрупнее</span></div>
      <button class="evolution-button" data-action="collection"><span>${icon('collection')}Цепочка мемов</span><span id="evolution-preview">${LEVELS.slice(0, 5).map(({ level }) => this.image(level)).join('')}<span class="evolution-more">+${LEVELS.length - 5}</span></span></button>
    </section>`;
    this.bind('pause', () => { actions.pause(); this.pause(); });
    this.bind('restart', () => { actions.pause(); this.confirmRestart(); });
    this.bind('collection', () => { actions.pause(); this.collection(() => { this.closeModal(); actions.resume(); }); });
    this.bind('audio', () => { actions.pause(); this.soundSettings(); });
  }

  updateScore(score: number, best: number): void {
    const element = this.root.querySelector('#score');
    if (element) {
      element.textContent = format(score);
      element.classList.remove('score-pop');
      void (element as HTMLElement).offsetWidth;
      element.classList.add('score-pop');
    }
    const bestElement = this.root.querySelector('#best');
    if (bestElement) bestElement.textContent = format(best);
  }

  updateNext(level: number): void {
    const element = this.root.querySelector('#next-preview');
    if (element) element.innerHTML = this.image(level);
  }

  updateCombo(combo: number): void {
    const element = this.root.querySelector('#combo');
    if (element) element.textContent = combo > 1 ? `КОМБО ×${combo}` : '';
  }

  warning(progress: number): void {
    this.root.classList.toggle('in-danger', progress > 0);
    const warning = this.root.querySelector('#board-warning');
    if (warning) warning.textContent = progress > 0 ? `Осторожно! ${Math.max(1, Math.ceil((1 - progress) * 2))}` : '';
  }

  pause(): void {
    this.dialog('Пауза', `<div class="modal-emblem">${icon('pause')}</div><p class="dialog-copy">Мемы никуда не убегут.<br />Сделай маленький перерыв.</p>${this.audioControls()}`, [
      ['Продолжить', 'primary', () => { this.closeModal(); this.actions?.resume(); }],
      ['Начать заново', 'secondary', () => this.confirmRestart()],
      ['В меню', 'text-button', () => this.confirmMenu()],
    ]);
  }

  confirmRestart(): void {
    this.dialog('Начать заново?', '<p class="dialog-copy">Текущая партия закончится.<br />Рекорд останется с тобой.</p>', [
      ['Начать заново', 'primary', () => { this.closeModal(); this.actions?.restart(); }],
      ['Продолжить партию', 'secondary', () => { this.closeModal(); this.actions?.resume(); }],
    ]);
  }

  private confirmMenu(): void {
    this.dialog('Вернуться в меню?', '<p class="dialog-copy">Текущая партия закончится.<br />Рекорд уже сохранён.</p>', [
      ['В меню', 'primary', () => { this.closeModal(); this.actions?.menu(); }],
      ['Продолжить партию', 'secondary', () => { this.closeModal(); this.actions?.resume(); }],
    ]);
  }

  gameOver(score: number, maxLevel: number, isRecord: boolean): void {
    this.dialog('Игра окончена', `<p class="result-game-name">Мелстрой мерж</p><div class="result-art">${this.image(maxLevel)}<span>УРОВЕНЬ ${maxLevel}</span></div><p class="result-caption">${isRecord ? 'Твой новый рекорд. Красиво!' : 'Хорошая попытка. Ещё одну?'}</p><div class="result-score">${format(score)}<span>ОЧКОВ</span></div><div class="result-best">${icon('crown')} Рекорд: ${format(saves.snapshot.bestScore)}</div>`, [
      ['Играть снова', 'primary', () => { this.closeModal(); this.actions?.restart(); }],
      ['В меню', 'secondary', () => { this.closeModal(); this.actions?.menu(); }],
    ]);
  }

  collection(close: ButtonAction): void {
    const maxLevel = saves.snapshot.maxLevel;
    this.dialog('От мема до легенды', `<p class="collection-subtitle">${LEVELS.length} уровней. Сколько соберёшь ты?</p><div class="collection-grid">${LEVELS.map((config) => `<div class="collection-item ${config.level > maxLevel ? 'undiscovered' : ''}">${this.image(config.level)}<strong>${String(config.level).padStart(2, '0')}</strong><span>${config.name}</span><small>+${format(config.points)}</small></div>`).join('')}</div>`, [['Вернуться', 'secondary', close]], 'collection-dialog');
  }

  private soundSettings(): void {
    this.dialog('Звук', `<p class="dialog-copy">Немного музыки для спокойной партии.<br />Настройки сохранятся для следующего раза.</p>${this.audioControls()}`, [
      ['Продолжить', 'primary', () => { this.closeModal(); this.actions?.resume(); }],
    ]);
  }

  private audioControls(): string {
    return `<div class="audio-controls" role="group" aria-label="Настройки звука">${(['music', 'effects'] as const).map((key) => `<button class="audio-toggle" data-audio="${key}" aria-label="${key === 'music' ? 'Музыка' : 'Звуки'}" aria-pressed="${audio.preferences[key]}">${icon(key === 'music' ? 'music' : 'volume')}<span>${key === 'music' ? 'Музыка' : 'Звуки'}</span><small>${audio.preferences[key] ? 'Вкл.' : 'Выкл.'}</small></button>`).join('')}</div>`;
  }

  private bindAudioControls(scope: ParentNode = this.root): void {
    scope.querySelectorAll<HTMLButtonElement>('[data-audio]').forEach((button) => {
      button.addEventListener('click', () => audio.toggle(button.dataset.audio as 'music' | 'effects'));
    });
  }

  private updateAudioControls(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-audio]').forEach((button) => {
      const enabled = audio.preferences[button.dataset.audio as 'music' | 'effects'];
      button.setAttribute('aria-pressed', String(enabled));
      button.querySelector('small')!.textContent = enabled ? 'Вкл.' : 'Выкл.';
    });
  }

  closeModal(): void {
    this.modal?.remove();
    this.modal = null;
    this.modalVisibility(false);
    this.previousFocus?.focus();
    this.previousFocus = null;
  }

  private dialog(title: string, body: string, buttons: [string, string, ButtonAction][], className = ''): void {
    if (!this.modal) this.previousFocus = document.activeElement as HTMLElement;
    this.modal?.remove();
    this.modalVisibility(true);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<section class="dialog ${className}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><span class="dialog-topline"></span><h2 id="dialog-title">${title}</h2>${body}<div class="dialog-actions">${buttons.map(([label, type], i) => `<button class="button ${type}" data-dialog="${i}">${label}</button>`).join('')}</div></section>`;
    buttons.forEach(([, , action], i) => overlay.querySelector(`[data-dialog="${i}"]`)?.addEventListener('click', action));
    this.root.append(overlay);
    this.modal = overlay;
    this.bindAudioControls(overlay);
    overlay.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }

  private bind(action: string, callback: ButtonAction): void {
    this.root.querySelector(`[data-action="${action}"]`)?.addEventListener('click', callback);
  }

  private modalVisibility(open: boolean): void {
    const screen = this.root.querySelector<HTMLElement>(':scope > section');
    if (screen) { screen.hidden = open; screen.toggleAttribute('inert', open); }
    // Keep the canvas layout for Phaser scaling while hiding the entire underlying game.
    document.getElementById('stage')!.classList.toggle('modal-open', open);
  }

  private clear(): void {
    this.closeModal();
    this.actions = null;
    this.root.innerHTML = '';
    this.root.classList.remove('in-danger');
  }
}

export const format = (number: number): string => new Intl.NumberFormat('ru-RU').format(number);
export const ui = new GameUI();
