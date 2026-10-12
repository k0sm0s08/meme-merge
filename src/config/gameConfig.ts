export const GAME = { width: 390, height: 844 } as const;

export const BOARD = {
  left: 28,
  right: 362,
  top: 246,
  bottom: 718,
  dangerY: 284,
  spawnY: 236,
  wallThickness: 24,
} as const;

export const RULES = {
  dropCooldownMs: 420,
  stabilizationMs: 1500,
  overflowMs: 2000,
  comboWindowMs: 1400,
  fixedStepMs: 1000 / 120,
  maxStepsPerFrame: 8,
  maxFrameDeltaMs: 100,
  aimResponseMs: 38,
} as const;

export interface MemeLevel {
  level: number;
  diameter: number;
  points: number;
  color: string;
  name: string;
  weight: number;
}

// IDs retain the original image filenames; the ordered list defines the merge chain.
export const LEVELS: readonly MemeLevel[] = [
  { level: 1, diameter: 30, points: 2, color: '#b7a1ff', name: 'Новичок', weight: 30 },
  { level: 2, diameter: 38, points: 4, color: '#8fd9ee', name: 'На чилле', weight: 25 },
  { level: 3, diameter: 47, points: 8, color: '#d5f985', name: 'С усами', weight: 20 },
  { level: 4, diameter: 57, points: 16, color: '#ffcc86', name: 'Вот это да', weight: 15 },
  { level: 5, diameter: 69, points: 32, color: '#ff92aa', name: 'В недоумении', weight: 10 },
  { level: 7, diameter: 96, points: 128, color: '#76e5c0', name: 'Бабуля', weight: 0 },
  { level: 8, diameter: 112, points: 256, color: '#f5a8e1', name: 'Эмоциональный', weight: 0 },
  { level: 9, diameter: 130, points: 512, color: '#f6dd7f', name: 'Есть идея', weight: 0 },
  { level: 10, diameter: 150, points: 1024, color: '#ff9e7a', name: 'Свой парень', weight: 0 },
  { level: 11, diameter: 172, points: 2048, color: '#e1c1ff', name: 'Легенда', weight: 0 },
];

export const MAX_LEVEL = LEVELS[LEVELS.length - 1].level;
const configsById = new Map(LEVELS.map((config) => [config.level, config]));

export function levelConfig(level: number): MemeLevel {
  const config = configsById.get(level);
  if (!config) throw new Error(`Неизвестный уровень: ${level}`);
  return config;
}

export function nextLevel(level: number): number | null {
  levelConfig(level);
  const index = LEVELS.findIndex((config) => config.level === level);
  return LEVELS[index + 1]?.level ?? null;
}

/** Old saves that reached the removed stage 06 keep that progress as stage 07. */
export function normalizeSavedLevel(level: number): number {
  return LEVELS.find((config) => config.level >= level)?.level ?? MAX_LEVEL;
}

export function randomLevel(random: () => number = Math.random): number {
  let pick = random() * 100;
  for (const config of LEVELS) {
    pick -= config.weight;
    if (pick < 0) return config.level;
  }
  return 5;
}

export const PHYSICS = {
  gravity: 1.15,
  density: 0.0015,
  friction: 0.16,
  frictionStatic: 0.45,
  frictionAir: 0.01,
  restitution: 0.08,
  slop: 0.035,
  maxHorizontalSpeed: 10,
  maxVerticalSpeed: 12,
  maxAngularSpeed: 0.065,
} as const;
