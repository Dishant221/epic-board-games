// Layout calculator per device class (see docs/specs addendum, "Per-Game
// Responsive Adaptations"). Pure so it can be unit tested.

export interface GameLayout {
  device: 'mobile' | 'tablet' | 'desktop';
  orientation: 'portrait' | 'landscape';
  boardSize: { width: number; height: number };
  dicePosition: 'corner' | 'bottom-center' | 'floating';
  chatPosition: 'sidebar' | 'overlay' | 'bottom-sheet';
  playerPanel: 'sidebar' | 'top-bar' | 'compact-strip';
  controlSize: 'full' | 'compact' | 'icon-only';
  suggestRotate: boolean;
}

const ROTATE_GAMES = new Set(['chess', 'epic_business', 'checkers']);

export function getGameLayout(screenWidth: number, screenHeight: number, gameType: string): GameLayout {
  const orientation = screenWidth > screenHeight ? 'landscape' : 'portrait';
  // Landscape phones are "short": classify by the smaller edge.
  const isPhoneLandscape = orientation === 'landscape' && screenHeight < 500;
  const isMobile = screenWidth < 768 || isPhoneLandscape;
  const isTablet = !isMobile && screenWidth < 1024;

  if (isMobile) {
    const side = isPhoneLandscape ? screenHeight - 16 : screenWidth - 16;
    return {
      device: 'mobile',
      orientation,
      boardSize: { width: side, height: side },
      dicePosition: 'floating',
      chatPosition: 'bottom-sheet',
      playerPanel: isPhoneLandscape ? 'sidebar' : 'compact-strip',
      controlSize: 'icon-only',
      suggestRotate: orientation === 'portrait' && ROTATE_GAMES.has(gameType),
    };
  }

  if (isTablet) {
    const side = Math.min(screenWidth - 32, screenHeight - 260);
    return {
      device: 'tablet',
      orientation,
      boardSize: { width: side, height: side },
      dicePosition: 'bottom-center',
      chatPosition: 'overlay',
      playerPanel: 'top-bar',
      controlSize: 'compact',
      suggestRotate: false,
    };
  }

  const side = Math.min(screenHeight - 160, 700);
  return {
    device: 'desktop',
    orientation,
    boardSize: { width: side, height: side },
    dicePosition: 'corner',
    chatPosition: 'sidebar',
    playerPanel: 'sidebar',
    controlSize: 'full',
    suggestRotate: false,
  };
}
