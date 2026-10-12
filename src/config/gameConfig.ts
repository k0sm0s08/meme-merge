export const GAME = { width: 390, height: 844 } as const;
export const BALL_SIZE_MULTIPLIER = 1.12;

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
  fastMotionThreshold: 6,
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
  { level: 1, diameter: 30, points: 2, color: '#bbb4cc', name: 'Новичок', weight: 30 },
  { level: 2, diameter: 38, points: 4, color: '#a8c8d2', name: 'На чилле', weight: 25 },
  { level: 3, diameter: 47, points: 8, color: '#b9ceba', name: 'С усами', weight: 20 },
  { level: 4, diameter: 57, points: 16, color: '#d6bda0', name: 'Вот это да', weight: 15 },
  { level: 5, diameter: 69, points: 32, color: '#d6a4ac', name: 'В недоумении', weight: 10 },
  { level: 7, diameter: 96, points: 128, color: '#a0c8b8', name: 'Бабуля', weight: 0 },
  { level: 8, diameter: 112, points: 256, color: '#c9acc3', name: 'Эмоциональный', weight: 0 },
  { level: 9, diameter: 130, points: 512, color: '#d4c79f', name: 'Есть идея', weight: 0 },
  { level: 10, diameter: 150, points: 1024, color: '#cea996', name: 'Свой парень', weight: 0 },
  { level: 11, diameter: 172, points: 2048, color: '#c6b9d9', name: 'Легенда', weight: 0 },
].map((config) => ({ ...config, diameter: Number((config.diameter * BALL_SIZE_MULTIPLIER).toFixed(2)) }));

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
