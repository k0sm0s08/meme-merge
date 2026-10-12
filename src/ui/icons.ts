const shapes = {
  play: '<path d="m9 5 11 7-11 7z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M9 5v14M15 5v14" stroke-width="3"/>',
  music: '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>',
  volume: '<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  restart: '<path d="M4 10a8 8 0 1 1 2 8M4 4v6h6"/>',
  crown: '<path d="m3 6 4 4 5-6 5 6 4-4-2 12H5zM7 21h10"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  home: '<path d="m3 10 9-7 9 7v10h-6v-7H9v7H3z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01"/>',
  collection: '<circle cx="8" cy="8" r="4"/><circle cx="17" cy="8" r="3"/><circle cx="8" cy="18" r="3"/><circle cx="17" cy="17" r="4"/>',
  star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  touch: '<path d="M9 12V5a2 2 0 0 1 4 0v6l2-1 5 2v5a5 5 0 0 1-5 5h-3l-6-7a2 2 0 0 1 3-3z"/>',
} as const;

export function icon(name: keyof typeof shapes): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]}</svg>`;
}
