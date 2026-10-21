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
  particleCount: number;
  textureSize: number;
  animateCreatures: boolean;
  pixelRatio: number;
}

export function getGraphicsSettings(tier: PerformanceTier): GraphicsSettings {
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  switch (tier) {
    case 'low':
      return { shadows: false, antialiasing: false, particleCount: 40, textureSize: 512, animateCreatures: false, pixelRatio: 1 };
    case 'medium':
      return { shadows: true, antialiasing: false, particleCount: 120, textureSize: 1024, animateCreatures: true, pixelRatio: Math.min(dpr, 1.5) };
    case 'high':
      return { shadows: true, antialiasing: true, particleCount: 240, textureSize: 2048, animateCreatures: true, pixelRatio: Math.min(dpr, 2) };
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
