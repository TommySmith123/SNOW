import { GAME, type GameModel, type Obstacle, type ObstacleType } from "./config";

export function safeBest(): number {
  if (typeof window === "undefined") return 0;
  try {
    const value = Number.parseInt(localStorage.getItem("snowline-best") ?? "0", 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function createGame(best = 0): GameModel {
  const seed = Math.floor(Math.random() * 2_147_483_647) || 1;
  return {
    status: "START",
    distance: 0,
    speed: GAME.cruiseSpeed,
    best,
    isNewBest: false,
    playerX: GAME.width / 2 - 42,
    lateralVelocity: 0,
    edge: 1,
    queuedEdge: 1,
    stance: "coast",
    stanceHold: 0,
    boundaryTurnCooldown: 0,
    jumpTime: -1,
    jumpCooldown: 0,
    invulnerable: 0,
    crashTime: 0,
    countdown: 3.8,
    nextSpawn: GAME.firstObstacleAt,
    obstacleId: 1,
    obstacles: [],
    particles: [],
    trackMarks: [],
    trackAccumulator: 0,
    snowAccumulator: 0,
    shake: 0,
    lastTrackCenter: trackCenter(0),
    seed,
  };
}

export function trackCenter(distance: number): number {
  return (
    GAME.width / 2 +
    Math.sin(distance * 0.008) * 34 +
    Math.sin(distance * 0.0027 + 1.4) * 26
  );
}

export function difficulty(distance: number): number {
  return Math.min(1, Math.max(0, distance / 2400));
}

export function trackWidth(distance: number): number {
  const d = difficulty(distance);
  return GAME.trackWidthStart - (GAME.trackWidthStart - GAME.trackWidthMin) * d;
}

export function jumpHeight(model: GameModel): number {
  if (model.jumpTime < 0) return 0;
  const progress = Math.min(1, model.jumpTime / GAME.jumpDuration);
  const speedBonus = Math.max(0, (model.speed - GAME.cruiseSpeed) * 0.24);
  return Math.sin(progress * Math.PI) * (GAME.jumpHeight + speedBonus);
}

export function isAirborne(model: GameModel): boolean {
  return model.jumpTime >= 0 && model.jumpTime < GAME.jumpDuration;
}

export function seeded(model: GameModel): number {
  model.seed = (model.seed * 48271) % 2_147_483_647;
  return model.seed / 2_147_483_647;
}

function addObstacle(
  model: GameModel,
  type: ObstacleType,
  distance: number,
  lane: number,
  width: number,
  height: number,
) {
  model.obstacles.push({
    id: model.obstacleId++,
    type,
    distance,
    lane,
    width,
    height,
  });
}

export function spawnPattern(model: GameModel) {
  const d = difficulty(model.distance);
  const roll = seeded(model);
  const at = model.nextSpawn;

  if (model.distance < 220 || roll < 0.28) {
    const lane = seeded(model) < 0.5 ? -0.42 : 0.42;
    addObstacle(model, "tree", at, lane, 42, 58);
  } else if (roll < 0.52) {
    const leftFirst = seeded(model) < 0.5;
    addObstacle(model, "smallRock", at, leftFirst ? -0.42 : 0.38, 40, 27);
    addObstacle(model, "smallRock", at + 20, leftFirst ? 0.38 : -0.42, 42, 28);
  } else if (roll < 0.74) {
    addObstacle(model, "crevasse", at, 0, 0.94, 18 + d * 13);
  } else {
    const side = seeded(model) < 0.5 ? -1 : 1;
    addObstacle(model, "tree", at, side * 0.48, 42, 60);
    addObstacle(model, d > 0.52 ? "largeRock" : "smallRock", at + 22, -side * 0.32, 48, 31);
  }

  const minGap = 47 - d * 16;
  model.nextSpawn += minGap + seeded(model) * (34 - d * 9);
}

export function obstacleScreenPosition(model: GameModel, obstacle: Obstacle) {
  const width = trackWidth(obstacle.distance);
  return {
    x: trackCenter(obstacle.distance) + obstacle.lane * width * 0.42,
    y: GAME.playerY + (obstacle.distance - model.distance) * GAME.metersToPixels,
  };
}

export function resetRun(model: GameModel) {
  const fresh = createGame(model.best);
  Object.assign(model, fresh, { status: "COUNTDOWN" });
}

export function finishRun(model: GameModel) {
  const score = Math.max(0, Math.floor(model.distance));
  model.isNewBest = score > model.best;
  if (model.isNewBest) {
    model.best = score;
    try {
      localStorage.setItem("snowline-best", String(score));
    } catch {
      // Storage is optional; the run remains playable.
    }
  }
  model.status = "GAME_OVER";
}
