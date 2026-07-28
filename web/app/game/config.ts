export const GAME = {
  width: 540,
  height: 960,
  playerY: 638,
  minSpeed: 30,
  cruiseSpeed: 52,
  maxSpeed: 150,
  acceleration: 16,
  braking: 66,
  cruiseReturn: 7,
  lateralSpeed: 116,
  edgeAcceleration: 610,
  airControl: 0.08,
  jumpDuration: 1.04,
  jumpHeight: 92,
  jumpRecovery: 0.12,
  rockInvulnerability: 0.75,
  crashDuration: 1.15,
  metersToPixels: 3.35,
  trackWidthStart: 400,
  trackWidthMin: 300,
  playerRadius: 17,
  spawnAheadMeters: 310,
  cleanupBehindMeters: 125,
  firstObstacleAt: 42,
  boundaryTurnLock: 0.48,
  trackSampleMeters: 1.25,
  trackKeepMeters: 190,
  treeColliderX: 16,
  treeColliderY: 17,
  crevasseColliderDepth: 0.3,
  crevasseBoardMargin: 4,
  crevasseClearance: 7,
  crevasseEdgeGrace: 8,
} as const;

export type GameStatus =
  | "START"
  | "COUNTDOWN"
  | "PLAYING"
  | "PAUSED"
  | "CRASHED"
  | "GAME_OVER";

export type ObstacleType = "tree" | "smallRock" | "largeRock" | "crevasse";
export type PlayerStance = "coast" | "tuck" | "brake";

export interface Obstacle {
  id: number;
  type: ObstacleType;
  distance: number;
  lane: number;
  width: number;
  height: number;
  hit?: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
}

export interface TrackMark {
  distance: number;
  x: number;
  strength: number;
}

export interface GameModel {
  status: GameStatus;
  distance: number;
  speed: number;
  best: number;
  isNewBest: boolean;
  playerX: number;
  lateralVelocity: number;
  edge: -1 | 1;
  queuedEdge: -1 | 1;
  stance: PlayerStance;
  stanceHold: number;
  boundaryTurnCooldown: number;
  jumpTime: number;
  jumpCooldown: number;
  invulnerable: number;
  crashTime: number;
  countdown: number;
  nextSpawn: number;
  obstacleId: number;
  obstacles: Obstacle[];
  particles: Particle[];
  trackMarks: TrackMark[];
  trackAccumulator: number;
  snowAccumulator: number;
  shake: number;
  lastTrackCenter: number;
  seed: number;
}

export interface InputState {
  accelerate: boolean;
  brake: boolean;
}
