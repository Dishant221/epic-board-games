export type PerformanceTier = 'low' | 'medium' | 'high';

export function detectPerformanceTier(): PerformanceTier {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return 'low';

  const cores = navigator.hardwareConcurrency || 2;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 2; // GB
  const isMobile = /Android|iPhone|iPad/.test(navigator.userAgent);

  if (isMobile && memory <= 2) return 'low';
  if (isMobile && memory <= 4) return 'medium';
  if (cores >= 8 && memory >= 8) return 'high';
  if (cores >= 4) return 'medium';
  return 'low';
}

export interface GraphicsSettings {
  shadows: boolean;
  antialiasing: boolean;
  /** Capacity of each particle pool (dust, fire, sparkles, confetti). */
  particleCount: number;
  textureSize: number;
  animateCreatures: boolean;
  pixelRatio: number;
  /** Jungle density around the board: 'low' is a few trees and rocks, no vines. */
  environment: 'low' | 'high';
  /** Flickering corner torches and the dragon's fire flash (extra point lights are costly on mobile GPUs). */
  pointLights: boolean;
  /** Rewrite creature body vertices every Nth frame (1 = every frame). */
  creatureUpdateEvery: number;
  /** Floating fireflies / dust motes around the board. */
  fireflyCount: number;
}

export function getGraphicsSettings(tier: PerformanceTier): GraphicsSettings {
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  switch (tier) {
    case 'low':
      return { shadows: false, antialiasing: false, particleCount: 80, textureSize: 512, animateCreatures: true, pixelRatio: 1, environment: 'low', pointLights: false, creatureUpdateEvery: 4, fireflyCount: 24 };
    case 'medium':
      return { shadows: true, antialiasing: false, particleCount: 240, textureSize: 1024, animateCreatures: true, pixelRatio: Math.min(dpr, 1.5), environment: 'high', pointLights: true, creatureUpdateEvery: 2, fireflyCount: 70 };
    case 'high':
      return { shadows: true, antialiasing: true, particleCount: 500, textureSize: 2048, animateCreatures: true, pixelRatio: Math.min(dpr, 2), environment: 'high', pointLights: true, creatureUpdateEvery: 1, fireflyCount: 140 };
  }
}

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
