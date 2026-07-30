"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GAME,
  type GameModel,
  type GameStatus,
  type InputState,
  type Obstacle,
  type PlayerStance,
  type TrackMark,
} from "./config";
import {
  createGame,
  difficulty,
  finishRun,
  isAirborne,
  jumpHeight,
  obstacleScreenPosition,
  resetRun,
  safeBest,
  seeded,
  spawnPattern,
  trackCenter,
  trackWidth,
} from "./engine";
import { ShopModal } from "./ShopModal";
import {
  DEFAULT_PROFILE,
  getBoard,
  getShopItem,
  loadProfile,
  rewardForRun,
  saveProfile,
  unlockTestProfile,
  type GearSlot,
  type ShopItem,
  type ShopProfile,
} from "./shop";
import {
  resolvePetTrailPosition,
  type PetTrailPosition,
} from "./pet-follow";

type HapticKind = "light" | "medium" | "heavy" | "shield";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function emitHaptic(kind: HapticKind) {
  window.dispatchEvent(
    new CustomEvent("shushu:haptic", { detail: { kind } }),
  );
  if (typeof navigator.vibrate === "function") {
    const pattern =
      kind === "light"
        ? 12
        : kind === "medium"
          ? 24
          : kind === "shield"
            ? [28, 24, 48]
            : 55;
    navigator.vibrate(pattern);
  }
}

type HudState = {
  status: GameStatus;
  distance: number;
  speed: number;
  best: number;
  countdown: number;
  isNewBest: boolean;
  stance: PlayerStance;
  autoTurn: boolean;
  shieldCharges: number;
};

function hudFrom(model: GameModel): HudState {
  return {
    status: model.status,
    distance: Math.floor(model.distance),
    speed: Math.round(model.speed),
    best: model.best,
    countdown: model.countdown,
    isNewBest: model.isNewBest,
    stance: model.stance,
    autoTurn: model.boundaryTurnCooldown > 0,
    shieldCharges: model.shieldCharges,
  };
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function riderRotation(model: GameModel) {
  const lean = Math.max(-0.5, Math.min(0.5, model.lateralVelocity / 280));
  const tuck = model.stance === "tuck";
  return (model.edge * 0.32 + lean) * (tuck ? 0.68 : 1) + boardTurn(model);
}

function boardTurn(model: GameModel) {
  return model.stance === "brake" && !isAirborne(model)
    ? model.edge * (Math.PI / 2)
    : 0;
}

function boardRotation(model: GameModel) {
  // Braking rotates the rider and board as one rigid 90-degree frame.
  return riderRotation(model);
}

function boardContact(model: GameModel) {
  // Sample from the stable board pivot so a 90-degree brake turn cannot send
  // the mark backwards and interrupt the snow trail.
  const boardPivotY = 27.5;
  return {
    x: model.playerX,
    distance: model.distance + boardPivotY / GAME.metersToPixels,
  };
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(7, 49, 61, .26)";
  ctx.beginPath();
  ctx.ellipse(0, 21, 21, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 93, 74, .58)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 21, 16, 6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#132f35";
  roundedRect(ctx, -6, -2, 12, 29, 3);
  ctx.fill();
  ctx.fillStyle = "#0f5a58";
  ctx.strokeStyle = "#082c32";
  ctx.lineWidth = 3;
  for (const [oy, size] of [
    [-28, 22],
    [-12, 29],
    [5, 34],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(0, oy - size);
    ctx.lineTo(-size, oy + size * 0.55);
    ctx.lineTo(size, oy + size * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawRock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  large: boolean,
) {
  const s = large ? 1.3 : 0.88;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = large ? "#324350" : "#5b7180";
  ctx.strokeStyle = "#172f3c";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-24, 12);
  ctx.lineTo(-19, -8);
  ctx.lineTo(-5, -20);
  ctx.lineTo(16, -13);
  ctx.lineTo(25, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.32)";
  ctx.beginPath();
  ctx.moveTo(-13, -8);
  ctx.lineTo(-4, -15);
  ctx.lineTo(6, -12);
  ctx.lineTo(-1, -5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCrevasse(
  ctx: CanvasRenderingContext2D,
  model: GameModel,
  obstacle: Obstacle,
  y: number,
) {
  const width = trackWidth(obstacle.distance) * obstacle.width;
  const center = trackCenter(obstacle.distance);
  const height = obstacle.height;
  const x = center - width / 2;
  const gradient = ctx.createLinearGradient(0, y - height / 2, 0, y + height / 2);
  gradient.addColorStop(0, "#6bb7cd");
  gradient.addColorStop(0.22, "#0d4560");
  gradient.addColorStop(0.55, "#061925");
  gradient.addColorStop(1, "#2a718c");
  ctx.fillStyle = gradient;
  ctx.strokeStyle = "#d9fbff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, y - height / 2);
  for (let i = 0; i <= 7; i++) {
    const px = x + (width * i) / 7;
    const jag = Math.sin(i * 11.7 + obstacle.id) * 5;
    ctx.lineTo(px, y - height / 2 + jag);
  }
  for (let i = 7; i >= 0; i--) {
    const px = x + (width * i) / 7;
    const jag = Math.cos(i * 9.3 + obstacle.id) * 5;
    ctx.lineTo(px, y + height / 2 + jag);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // The lower lip reaches the rider first. Highlight it as a clear jump cue.
  ctx.save();
  ctx.strokeStyle = "#d7ff45";
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 9]);
  ctx.beginPath();
  for (let i = 0; i <= 7; i++) {
    const px = x + (width * i) / 7;
    const jag = Math.cos(i * 9.3 + obstacle.id) * 5;
    if (i === 0) ctx.moveTo(px, y + height / 2 + jag);
    else ctx.lineTo(px, y + height / 2 + jag);
  }
  ctx.stroke();
  ctx.restore();
}

function snowboardPath(ctx: CanvasRenderingContext2D, brake: boolean) {
  ctx.beginPath();
  ctx.moveTo(brake ? -38 : -32, 22);
  ctx.quadraticCurveTo(brake ? -44 : -38, 27.5, brake ? -35 : -29, 33);
  ctx.lineTo(brake ? 35 : 30, 33);
  ctx.quadraticCurveTo(brake ? 44 : 38, 27.5, brake ? 38 : 33, 22);
  ctx.closePath();
}

function drawSnowboardPattern(
  ctx: CanvasRenderingContext2D,
  board: ShopItem,
  brake: boolean,
) {
  const left = brake ? -39 : -33;
  const right = brake ? 39 : 34;
  const accent = board.accent ?? "#fff";

  ctx.save();
  snowboardPath(ctx, brake);
  ctx.clip();
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  ctx.lineCap = "round";

  switch (board.pattern) {
    case "sprout":
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(left + 10, 32);
      ctx.quadraticCurveTo(0, 23, right - 9, 32);
      ctx.stroke();
      for (const x of [-17, -3, 12]) {
        ctx.beginPath();
        ctx.ellipse(x, 27, 4.5, 2.2, x < 0 ? -0.45 : 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "ice":
      ctx.lineWidth = 2;
      for (const x of [-25, -7, 11]) {
        ctx.beginPath();
        ctx.moveTo(x, 23);
        ctx.lineTo(x + 9, 28);
        ctx.lineTo(x + 3, 33);
        ctx.stroke();
      }
      break;
    case "comet":
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(left + 7, 31);
      ctx.quadraticCurveTo(-1, 23, right - 9, 26);
      ctx.stroke();
      for (const [x, y, radius] of [[-18, 25, 1.2], [8, 30, 1.4], [23, 25, 1]] as const) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "tiger":
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      for (let x = left - 3; x < right + 6; x += 13) {
        ctx.beginPath();
        ctx.moveTo(x, 22);
        ctx.lineTo(x + 8, 33);
        ctx.stroke();
      }
      break;
    case "aurora": {
      const aurora = ctx.createLinearGradient(left, 24, right, 31);
      aurora.addColorStop(0, "#54f2c1");
      aurora.addColorStop(0.5, "#73b6ff");
      aurora.addColorStop(1, "#ef59ff");
      ctx.strokeStyle = aurora;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(left, 30);
      ctx.bezierCurveTo(-20, 21, -4, 34, 10, 25);
      ctx.bezierCurveTo(20, 20, 27, 31, right, 24);
      ctx.stroke();
      break;
    }
    case "dragon":
      ctx.lineWidth = 1.8;
      for (let x = left + 4; x < right; x += 8) {
        ctx.beginPath();
        ctx.arc(x, 31, 5, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(left + 5, 25);
      ctx.lineTo(right - 5, 30);
      ctx.stroke();
      break;
    case "hyper":
      for (const [x, y, radius, color] of [
        [-22, 25, 1, "#fff"],
        [-10, 31, 1.2, "#65eaff"],
        [18, 25, 1.1, "#ffe86a"],
        [27, 30, 0.9, "#fff"],
      ] as const) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "#ef59ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-5, 23);
      ctx.lineTo(-2, 27);
      ctx.lineTo(3, 28);
      ctx.lineTo(-1, 30);
      ctx.lineTo(-3, 33);
      ctx.lineTo(-6, 30);
      ctx.lineTo(-11, 28);
      ctx.lineTo(-6, 27);
      ctx.closePath();
      ctx.stroke();
      break;
    case "classic":
    default:
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(left + 4, 27.5);
      ctx.lineTo(right - 4, 27.5);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

function drawBrakeSparks(ctx: CanvasRenderingContext2D, model: GameModel) {
  if (
    model.stance !== "brake" ||
    isAirborne(model) ||
    model.status !== "PLAYING"
  ) {
    return;
  }

  const speedIntensity = Math.max(
    0,
    Math.min(1, (model.speed - GAME.minSpeed) / (GAME.maxSpeed - GAME.minSpeed)),
  );
  const sparkCount = 8 + Math.floor(speedIntensity * 12);
  const phase = model.distance * 0.73 + model.speed * 0.11;

  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowColor = "#ff6b1a";
  ctx.shadowBlur = 7 + speedIntensity * 7;

  for (let index = 0; index < sparkCount; index++) {
    const wave = Math.sin(phase * (1.3 + index * 0.07) + index * 4.17);
    const shimmer = Math.cos(phase * 1.9 + index * 2.61);
    const originX = -36 + ((index * 19 + phase * 7) % 72);
    const originY = 31 + (index % 3) * 1.5;
    const length = 7 + speedIntensity * 14 + Math.abs(wave) * 5;
    const tailX = originX - model.edge * (2 + Math.abs(shimmer) * 5);
    const tailY = originY + length;

    ctx.globalAlpha = 0.82 + speedIntensity * 0.18;
    ctx.strokeStyle = "#e84b16";
    ctx.lineWidth = index % 4 === 0 ? 3.2 : 2.5;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();

    ctx.shadowBlur = 3 + speedIntensity * 4;
    ctx.strokeStyle = index % 3 === 0 ? "#fff5b8" : "#ffd36b";
    ctx.lineWidth = index % 4 === 0 ? 1.7 : 1.2;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();
    ctx.shadowBlur = 7 + speedIntensity * 7;

    if (index % 3 === 0) {
      ctx.fillStyle = "#fff0a0";
      ctx.beginPath();
      ctx.arc(tailX, tailY, 1.6 + speedIntensity, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawShield(ctx: CanvasRenderingContext2D, model: GameModel) {
  if (model.shieldCharges <= 0 && model.shieldFlash <= 0) return;
  const flash = Math.min(1, model.shieldFlash / 0.72);
  const air = jumpHeight(model);
  const y = GAME.playerY - air - 10;
  const pulse = 1 + Math.sin(model.distance * 0.18) * 0.025;

  ctx.save();
  ctx.translate(model.playerX, y);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = `rgba(91, 232, 239, ${0.075 + flash * 0.24})`;
  ctx.strokeStyle = `rgba(155, 250, 255, ${0.24 + flash * 0.66})`;
  ctx.lineWidth = flash > 0 ? 4 : 2;
  ctx.beginPath();
  ctx.ellipse(0, -5, 38, 61, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = `rgba(215, 255, 69, ${flash * 0.72})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -5, 42 + flash * 7, -0.8, 1.5);
  ctx.stroke();
  ctx.restore();
}

function drawPantsDecoration(
  ctx: CanvasRenderingContext2D,
  pants: ShopItem,
  legs: ReadonlyArray<{
    knee: { x: number; y: number };
    foot: { x: number; y: number };
  }>,
) {
  if (!pants.style) return;
  const accent = pants.accent ?? "#fff";

  ctx.save();
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  ctx.lineCap = "round";

  if (pants.style === "checker") {
    for (const { knee } of legs) {
      ctx.fillRect(knee.x - 4, knee.y - 4, 4, 4);
      ctx.fillRect(knee.x, knee.y, 4, 4);
    }
  } else if (pants.style === "cargo") {
    ctx.lineWidth = 2;
    for (const { knee } of legs) {
      roundedRect(ctx, knee.x - 4.5, knee.y - 5, 9, 8, 2);
      ctx.stroke();
    }
  } else if (pants.style === "flame") {
    ctx.lineWidth = 3;
    for (const { knee, foot } of legs) {
      ctx.beginPath();
      ctx.moveTo(knee.x - 3, knee.y - 2);
      ctx.lineTo((knee.x + foot.x) / 2 + 4, (knee.y + foot.y) / 2);
      ctx.lineTo((knee.x + foot.x) / 2 - 2, (knee.y + foot.y) / 2 + 4);
      ctx.lineTo(foot.x, foot.y - 2);
      ctx.stroke();
    }
  } else if (pants.style === "aurora") {
    ctx.lineWidth = 3;
    for (const { knee, foot } of legs) {
      ctx.beginPath();
      ctx.moveTo(knee.x - 3, knee.y - 4);
      ctx.quadraticCurveTo(
        knee.x + 5,
        knee.y + 5,
        foot.x + 1,
        foot.y - 2,
      );
      ctx.stroke();
    }
  }
  ctx.restore();
}

function rotatePointAround(
  x: number,
  y: number,
  pivotX: number,
  pivotY: number,
  angle: number,
) {
  const dx = x - pivotX;
  const dy = y - pivotY;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: pivotX + dx * cosine - dy * sine,
    y: pivotY + dx * sine + dy * cosine,
  };
}

function drawJacketDecoration(
  ctx: CanvasRenderingContext2D,
  jacket: ShopItem,
  tuck: boolean,
) {
  const top = tuck ? -19 : -23;
  const bottom = top + (tuck ? 30 : 36);
  const accent = jacket.accent ?? "#b7d6ff";

  ctx.save();
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  ctx.lineWidth = 1.6;

  if (jacket.style === "puffer") {
    for (let y = top + 7; y < bottom - 3; y += 6) {
      ctx.beginPath();
      ctx.moveTo(-13, y);
      ctx.quadraticCurveTo(0, y + 2, 13, y);
      ctx.stroke();
    }
  } else if (jacket.style === "checker") {
    for (const [x, y] of [[-10, top + 7], [1, top + 7], [-4.5, top + 16], [6.5, top + 16]] as const) {
      ctx.fillRect(x, y, 6, 6);
    }
  } else if (jacket.style === "flame") {
    ctx.beginPath();
    ctx.moveTo(-13, bottom - 2);
    ctx.lineTo(-10, bottom - 13);
    ctx.lineTo(-5, bottom - 6);
    ctx.lineTo(0, bottom - 16);
    ctx.lineTo(5, bottom - 6);
    ctx.lineTo(10, bottom - 13);
    ctx.lineTo(13, bottom - 2);
    ctx.closePath();
    ctx.fill();
  } else if (jacket.style === "star") {
    ctx.beginPath();
    for (let point = 0; point < 10; point++) {
      const angle = -Math.PI / 2 + (point * Math.PI) / 5;
      const radius = point % 2 === 0 ? 8 : 3.6;
      const x = Math.cos(angle) * radius;
      const y = (top + 17) + Math.sin(angle) * radius;
      if (point === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    for (const [x, y] of [[-10, top + 7], [10, top + 11], [-9, bottom - 5]] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // The reference outfit keeps its pale-blue heart/deer emblem.
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.quadraticCurveTo(-10, -12, -4, -13);
    ctx.quadraticCurveTo(0, -12, 0, -7);
    ctx.quadraticCurveTo(0, -12, 4, -13);
    ctx.quadraticCurveTo(10, -12, 6, -6);
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(0, -7);
    ctx.moveTo(-3, -12);
    ctx.lineTo(3, -12);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHatShape(
  ctx: CanvasRenderingContext2D,
  hat: ShopItem,
  centerX: number,
  centerY: number,
) {
  const accent = hat.accent ?? "#fff";
  ctx.fillStyle = hat.color;
  ctx.strokeStyle = "#07090c";
  ctx.lineWidth = 3;

  if (hat.style === "cat") {
    ctx.beginPath();
    ctx.moveTo(centerX - 14, centerY + 5);
    ctx.lineTo(centerX - 13, centerY - 13);
    ctx.lineTo(centerX - 5, centerY - 7);
    ctx.quadraticCurveTo(centerX, centerY - 12, centerX + 5, centerY - 7);
    ctx.lineTo(centerX + 13, centerY - 13);
    ctx.lineTo(centerX + 14, centerY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - 11, centerY - 9);
    ctx.lineTo(centerX - 6, centerY - 5);
    ctx.moveTo(centerX + 11, centerY - 9);
    ctx.lineTo(centerX + 6, centerY - 5);
    ctx.stroke();
    return;
  }

  if (hat.style === "trapper") {
    ctx.beginPath();
    ctx.arc(centerX, centerY, 14, Math.PI, Math.PI * 2);
    ctx.lineTo(centerX + 14, centerY + 8);
    ctx.lineTo(centerX + 9, centerY + 12);
    ctx.lineTo(centerX + 6, centerY + 5);
    ctx.lineTo(centerX - 6, centerY + 5);
    ctx.lineTo(centerX - 9, centerY + 12);
    ctx.lineTo(centerX - 14, centerY + 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX - 11, centerY + 3);
    ctx.lineTo(centerX + 11, centerY + 3);
    ctx.stroke();
    return;
  }

  ctx.beginPath();
  ctx.arc(centerX, centerY, hat.style === "helmet" ? 14.5 : 13, Math.PI, Math.PI * 2);
  ctx.lineTo(centerX + 13, centerY + 4);
  ctx.lineTo(centerX - 13, centerY + 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (hat.style === "pom") {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(centerX, centerY - 15, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX - 11, centerY + 1);
    ctx.lineTo(centerX + 11, centerY + 1);
    ctx.stroke();
  } else if (hat.style === "helmet") {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 10);
    ctx.lineTo(centerX + 2, centerY - 4);
    ctx.lineTo(centerX + 8, centerY - 4);
    ctx.lineTo(centerX + 3, centerY);
    ctx.lineTo(centerX + 5, centerY + 5);
    ctx.lineTo(centerX, centerY + 2);
    ctx.lineTo(centerX - 5, centerY + 5);
    ctx.lineTo(centerX - 3, centerY);
    ctx.lineTo(centerX - 8, centerY - 4);
    ctx.lineTo(centerX - 2, centerY - 4);
    ctx.closePath();
    ctx.stroke();
  }
}

function drawBoarder(
  ctx: CanvasRenderingContext2D,
  model: GameModel,
  profile: ShopProfile,
) {
  const air = jumpHeight(model);
  const boardStyle = getShopItem(profile.equipped.board);
  const pantsStyle = getShopItem(profile.equipped.pants);
  const jacketStyle = getShopItem(profile.equipped.jacket);
  const gogglesStyle = getShopItem(profile.equipped.goggles);
  const hatStyle = getShopItem(profile.equipped.hat);
  const y = GAME.playerY - air;
  const tuck = model.stance === "tuck" && !isAirborne(model);
  const brake = model.stance === "brake" && !isAirborne(model);
  const crouch = tuck ? 12 : brake ? 5 : 0;
  const edgeRotation = boardRotation(model);
  // riderRotation already includes the shared 90-degree brake turn.
  const brakeBoardTurn = 0;
  const boardPivotY = 27.5;
  const leftBinding = rotatePointAround(
    -14,
    26,
    0,
    boardPivotY,
    brakeBoardTurn,
  );
  const rightBinding = rotatePointAround(
    14,
    26,
    0,
    boardPivotY,
    brakeBoardTurn,
  );
  const leftFoot = { x: leftBinding.x, y: leftBinding.y - crouch };
  const rightFoot = { x: rightBinding.x, y: rightBinding.y - crouch };
  const legs = [
    {
      hip: { x: -8, y: tuck ? 2 : 5 },
      knee: {
        x: (-8 + leftFoot.x) / 2 - (brake ? model.edge * 5 : 2),
        y: (tuck ? 2 : 5) + (leftFoot.y - (tuck ? 2 : 5)) * 0.52,
      },
      foot: leftFoot,
    },
    {
      hip: { x: 7, y: tuck ? 2 : 5 },
      knee: {
        x: (7 + rightFoot.x) / 2 + (brake ? model.edge * 5 : 2),
        y: (tuck ? 2 : 5) + (rightFoot.y - (tuck ? 2 : 5)) * 0.52,
      },
      foot: rightFoot,
    },
  ] as const;

  ctx.save();
  ctx.translate(model.playerX + 5, GAME.playerY + 18);
  ctx.scale(1 + air / 620, Math.max(0.28, 1 - air / 90));
  ctx.fillStyle = `rgba(5, 30, 42, ${0.22 - air / 650})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 26 + air / 8, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  // Rotate the complete rider around the board pivot. The board stays planted
  // on the snow instead of orbiting around the character's head.
  ctx.translate(model.playerX, y + boardPivotY);
  ctx.rotate(edgeRotation);
  ctx.translate(0, -boardPivotY);
  if (model.status === "CRASHED") {
    ctx.rotate(model.crashTime * 3.8);
  }

  // Loose snow is drawn as small white flecks, never as twin "thruster" beams.
  if (!isAirborne(model) && model.status !== "CRASHED") {
    ctx.save();
    ctx.translate(0, boardPivotY);
    ctx.rotate(brakeBoardTurn);
    ctx.translate(0, -boardPivotY);
    const spray = brake ? 7 : tuck ? 2 : 4;
    ctx.fillStyle = brake ? "rgba(255,255,255,.82)" : "rgba(255,255,255,.58)";
    for (let i = 0; i < spray; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      ctx.beginPath();
      ctx.arc(
        side * (22 + i * 2.8),
        30 + (i % 3) * 6,
        1.4 + (i % 2),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  }

  // The snowboard stays pinned to the snow while only the rider's body
  // changes height for tuck/brake poses. This keeps the board contact point
  // and its sampled tracks continuous across stance changes.
  ctx.save();
  // The v16 brake frame pointed the character head-down. Flip only the body
  // around the binding centre; the snowboard keeps its 90-degree brake angle.
  if (brake) {
    ctx.translate(0, boardPivotY);
    ctx.rotate(Math.PI);
    ctx.translate(0, -boardPivotY);
  }
  ctx.translate(0, crouch);

  // Deep red hair silhouette from the supplied protagonist reference.
  ctx.fillStyle = "#a9121d";
  ctx.strokeStyle = "#170e18";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-15, -33);
  ctx.lineTo(-25, -5);
  ctx.lineTo(-17, -11);
  ctx.lineTo(-20, 8);
  ctx.lineTo(-8, -1);
  ctx.lineTo(-4, 14);
  ctx.lineTo(3, -2);
  ctx.lineTo(16, 7);
  ctx.lineTo(14, -14);
  ctx.lineTo(23, -7);
  ctx.lineTo(14, -34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Broad, outlined snow pants stay readable after the mobile canvas scales
  // down, and their feet remain attached inside the whole-rider brake frame.
  ctx.fillStyle = pantsStyle.color;
  ctx.strokeStyle = "#080a0d";
  ctx.lineWidth = 3;
  roundedRect(ctx, -12, tuck ? -1 : 1, 24, 13, 5);
  ctx.fill();
  ctx.stroke();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#080a0d";
  ctx.lineWidth = 15;
  ctx.beginPath();
  for (const leg of legs) {
    ctx.moveTo(leg.hip.x, leg.hip.y);
    ctx.lineTo(leg.knee.x, leg.knee.y);
    ctx.lineTo(leg.foot.x, leg.foot.y);
  }
  ctx.stroke();
  ctx.strokeStyle = pantsStyle.color;
  ctx.lineWidth = 11;
  ctx.beginPath();
  for (const leg of legs) {
    ctx.moveTo(leg.hip.x, leg.hip.y);
    ctx.lineTo(leg.knee.x, leg.knee.y);
    ctx.lineTo(leg.foot.x, leg.foot.y);
  }
  ctx.stroke();
  drawPantsDecoration(ctx, pantsStyle, legs);

  // Black hoodie with a pale-blue heart/deer emblem.
  ctx.save();
  ctx.translate(tuck ? model.edge * 6 : 0, tuck ? 5 : 0);
  ctx.rotate(tuck ? -model.edge * 0.24 : 0);
  ctx.fillStyle = jacketStyle.color;
  ctx.strokeStyle = "#080a0d";
  ctx.lineWidth = 4;
  roundedRect(ctx, -15, tuck ? -19 : -23, 30, tuck ? 30 : 36, 9);
  ctx.fill();
  ctx.stroke();

  drawJacketDecoration(ctx, jacketStyle, tuck);

  // Face, large black eyes and freckles.
  ctx.fillStyle = "#ffd8ca";
  ctx.strokeStyle = "#170e18";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(tuck ? model.edge * 4 : 0, tuck ? -23 : -33, 12, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#07090e";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(
      (tuck ? model.edge * 4 : 0) + side * 4.5,
      tuck ? -25 : -35,
      3.3,
      4.3,
      side * 0.12,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.strokeStyle = "#a9121d";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-10, tuck ? -28 : -38);
  ctx.lineTo(-4, tuck ? -30 : -40);
  ctx.moveTo(4, tuck ? -30 : -40);
  ctx.lineTo(10, tuck ? -28 : -38);
  ctx.stroke();
  ctx.fillStyle = "rgba(137,76,69,.65)";
  for (const side of [-1, 1]) {
    for (let dot = 0; dot < 2; dot++) {
      ctx.beginPath();
      ctx.arc(side * (3 + dot * 2), tuck ? -20 : -30, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // White wing-like ear accents.
  ctx.fillStyle = "#f7fbff";
  ctx.strokeStyle = "#170e18";
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 11, tuck ? -28 : -38);
    ctx.lineTo(side * 19, tuck ? -34 : -44);
    ctx.lineTo(side * 17, tuck ? -28 : -38);
    ctx.lineTo(side * 22, tuck ? -26 : -36);
    ctx.lineTo(side * 12, tuck ? -23 : -33);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Black beanie and oversized dotted snow goggles.
  drawHatShape(
    ctx,
    hatStyle,
    tuck ? model.edge * 4 : 0,
    tuck ? -31 : -41,
  );

  ctx.fillStyle = gogglesStyle.color;
  ctx.beginPath();
  roundedRect(ctx, -12, tuck ? -42 : -52, 24, 10, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = gogglesStyle.accent ?? "#91a9df";
  for (const [dotX, dotY] of [[-7, -48], [0, -45], [7, -49]]) {
    ctx.beginPath();
    ctx.arc(dotX, dotY + (tuck ? 10 : 0), 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();

  // A conventional snowboard with a pattern shared by its shop preview.
  ctx.save();
  ctx.translate(0, boardPivotY);
  ctx.rotate(brakeBoardTurn);
  ctx.translate(0, -boardPivotY);
  ctx.strokeStyle = "#071b2b";
  ctx.fillStyle = boardStyle.color;
  ctx.lineWidth = 4;
  snowboardPath(ctx, brake);
  ctx.fill();
  ctx.stroke();

  drawSnowboardPattern(ctx, boardStyle, brake);

  ctx.strokeStyle = "#1c252d";
  ctx.lineWidth = 3;
  for (const bindingX of [-14, 14]) {
    ctx.beginPath();
    ctx.moveTo(bindingX - 4, 23);
    ctx.lineTo(bindingX + 4, 29);
    ctx.stroke();
  }
  ctx.restore();

  // Render after the board so the warm core and orange-red outline remain
  // visible against both the snowboard artwork and bright snow.
  drawBrakeSparks(ctx, model);
  ctx.restore();
}

function drawTracks(ctx: CanvasRenderingContext2D, model: GameModel) {
  const marks = model.trackMarks
    .map((mark) => ({
      ...mark,
      y: GAME.playerY + (mark.distance - model.distance) * GAME.metersToPixels,
    }))
    .filter((mark) => mark.y > -45 && mark.y < GAME.height + 20);

  ctx.lineCap = "round";
  for (let i = 1; i < marks.length; i++) {
    const previous = marks[i - 1];
    const current = marks[i];
    const gap = current.distance - previous.distance;
    if (gap <= 0 || gap > GAME.trackSampleMeters * 2.8) continue;

    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const offsetX = (-dy / length) * 5.5;
    const offsetY = (dx / length) * 5.5;
    const age = Math.max(0, model.distance - current.distance);
    const alpha =
      Math.max(0.06, 0.34 * (1 - age / GAME.trackKeepMeters)) *
      current.strength;

    ctx.strokeStyle = `rgba(69, 139, 158, ${alpha})`;
    ctx.lineWidth = 2.2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(
        previous.x + offsetX * side,
        previous.y + offsetY * side,
      );
      ctx.lineTo(current.x + offsetX * side, current.y + offsetY * side);
      ctx.stroke();
    }
  }
}

function trailPosition(
  model: GameModel,
  lagMeters: number,
  sideOffset: number,
): PetTrailPosition {
  const targetDistance = model.distance - lagMeters;
  return resolvePetTrailPosition({
    currentDistance: model.distance,
    playerX: model.playerX,
    playerY: GAME.playerY,
    metersToPixels: GAME.metersToPixels,
    lagMeters,
    sideOffset,
    marks: model.trackMarks,
    targetTrackCenter: trackCenter(targetDistance),
    targetTrackHalfWidth: trackWidth(targetDistance) / 2,
    maxConnectedGap: GAME.trackSampleMeters * 2.8,
    viewportMinX: 38,
    viewportMaxX: GAME.width - 38,
    followEnvelope: 84 + Math.abs(sideOffset) * 0.5,
  });
}

function drawPetEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  iris: string,
) {
  ctx.fillStyle = iris;
  ctx.strokeStyle = "#49301f";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#17150f";
  ctx.beginPath();
  ctx.ellipse(x + 0.4, y + 0.2, radiusX * 0.42, radiusY * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x - radiusX * 0.28, y - radiusY * 0.32, Math.max(0.8, radiusX * 0.3), 0, Math.PI * 2);
  ctx.fill();
}

function drawHamster(
  ctx: CanvasRenderingContext2D,
  position: ReturnType<typeof trailPosition>,
  phase: number,
) {
  const hop = (Math.sin(phase) + 1) * 0.65;
  ctx.save();
  ctx.translate(position.x, position.y - hop);
  ctx.rotate(position.angle + 0.22);

  ctx.fillStyle = "rgba(7, 49, 61, .2)";
  ctx.beginPath();
  ctx.ellipse(1, 20 + hop, 18, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Long-haired golden Syrian hamster: the uneven silhouette and layered
  // cream mane stay readable after the native canvas is scaled down.
  const hamsterCoat = ctx.createLinearGradient(-21, -15, 17, 18);
  hamsterCoat.addColorStop(0, "#ffd981");
  hamsterCoat.addColorStop(0.46, "#eda348");
  hamsterCoat.addColorStop(1, "#b96529");
  ctx.fillStyle = hamsterCoat;
  ctx.strokeStyle = "#6b3d20";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-22, 5);
  ctx.quadraticCurveTo(-24, -3, -18, -8);
  ctx.lineTo(-20, -13);
  ctx.lineTo(-13, -11);
  ctx.lineTo(-11, -17);
  ctx.lineTo(-5, -13);
  ctx.lineTo(0, -17);
  ctx.lineTo(3, -11);
  ctx.quadraticCurveTo(10, -8, 12, 0);
  ctx.lineTo(16, 3);
  ctx.lineTo(12, 7);
  ctx.lineTo(14, 12);
  ctx.lineTo(8, 13);
  ctx.lineTo(5, 18);
  ctx.lineTo(-1, 15);
  ctx.lineTo(-7, 19);
  ctx.lineTo(-10, 14);
  ctx.lineTo(-17, 15);
  ctx.lineTo(-16, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#fff0c9";
  ctx.beginPath();
  ctx.ellipse(-5, 8, 11.5, 8.7, -0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(118, 64, 29, .54)";
  ctx.lineWidth = 1.35;
  ctx.lineCap = "round";
  for (const [x, y, dx, dy] of [
    [-15, -7, 6, 4],
    [-10, -11, 7, 5],
    [-4, -12, 6, 6],
    [-15, 1, 7, 2],
    [-12, 5, 6, 3],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + dx * 0.55, y + dy * 0.2, x + dx, y + dy);
    ctx.stroke();
  }

  // The fluffy cheek mane leads downhill without turning into a round dwarf
  // hamster silhouette.
  ctx.fillStyle = "#efa84d";
  ctx.strokeStyle = "#6b3d20";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-1, 2);
  ctx.lineTo(0, -4);
  ctx.lineTo(5, -3);
  ctx.lineTo(8, -8);
  ctx.lineTo(12, -4);
  ctx.lineTo(17, -6);
  ctx.lineTo(18, -1);
  ctx.quadraticCurveTo(23, 2, 22, 8);
  ctx.lineTo(25, 12);
  ctx.lineTo(20, 14);
  ctx.lineTo(18, 19);
  ctx.lineTo(13, 17);
  ctx.lineTo(9, 20);
  ctx.lineTo(6, 16);
  ctx.lineTo(1, 16);
  ctx.lineTo(3, 11);
  ctx.lineTo(-1, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  for (const [earX, earY, size] of [[4, -3, 4.8], [16, -2, 4.5]] as const) {
    ctx.fillStyle = "#d98a42";
    ctx.beginPath();
    ctx.arc(earX, earY, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#eaa195";
    ctx.beginPath();
    ctx.arc(earX + 0.5, earY + 0.5, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#fff2d3";
  ctx.beginPath();
  ctx.ellipse(11.4, 11.5, 10.8, 7.6, 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,.48)";
  ctx.beginPath();
  ctx.ellipse(4.8, 9, 6.5, 6.2, 0.08, 0, Math.PI * 2);
  ctx.fill();

  drawPetEye(ctx, 6.2, 5.6, 2.45, 3.2, "#18150f");
  drawPetEye(ctx, 15.3, 5.2, 2.85, 3.6, "#18150f");

  ctx.fillStyle = "#dd7777";
  ctx.beginPath();
  ctx.arc(20, 11.2, 1.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#6b3d20";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(18.3, 12.1);
  ctx.quadraticCurveTo(16.7, 16.1, 13.2, 14.9);
  ctx.moveTo(18.5, 11.2);
  ctx.lineTo(27, 8.2);
  ctx.moveTo(18.5, 12.8);
  ctx.lineTo(27, 16);
  ctx.stroke();

  ctx.fillStyle = "#ffe4b1";
  ctx.strokeStyle = "#6b3d20";
  ctx.lineWidth = 1.3;
  for (const [pawX, pawY] of [[7, 18], [17, 19]] as const) {
    ctx.beginPath();
    ctx.ellipse(pawX, pawY, 5.1, 3.5, 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawGoldenCat(
  ctx: CanvasRenderingContext2D,
  position: ReturnType<typeof trailPosition>,
  phase: number,
) {
  const hop = (Math.sin(phase) + 1) * 0.5;
  ctx.save();
  ctx.translate(position.x, position.y - hop);
  ctx.rotate(position.angle + 0.17);

  ctx.fillStyle = "rgba(7, 49, 61, .2)";
  ctx.beginPath();
  ctx.ellipse(1, 23 + hop, 22, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // A thick feathered tail and plush silhouette match Cheche's illustrated
  // shop portrait while remaining readable on the scaled native canvas.
  ctx.strokeStyle = "#6f4827";
  ctx.lineWidth = 13;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-12, 3);
  ctx.bezierCurveTo(-29, -3, -28, -25, -13, -29);
  ctx.stroke();
  ctx.strokeStyle = "#e2ad5e";
  ctx.lineWidth = 8.5;
  ctx.beginPath();
  ctx.moveTo(-12, 2);
  ctx.bezierCurveTo(-25, -5, -24, -21, -13, -26);
  ctx.stroke();
  ctx.strokeStyle = "#9a652f";
  ctx.lineWidth = 2.5;
  for (const [x1, y1, x2, y2] of [[-22, -8, -16, -5], [-23, -16, -16, -13], [-19, -24, -13, -20]] as const) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  const coat = ctx.createLinearGradient(-18, -18, 18, 22);
  coat.addColorStop(0, "#c8873b");
  coat.addColorStop(0.38, "#e2aa59");
  coat.addColorStop(0.72, "#f2cb7d");
  coat.addColorStop(1, "#fae4ae");
  ctx.fillStyle = coat;
  ctx.strokeStyle = "#704729";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-24, 5);
  ctx.quadraticCurveTo(-24, -5, -17, -10);
  ctx.lineTo(-18, -15);
  ctx.lineTo(-11, -12);
  ctx.lineTo(-7, -17);
  ctx.lineTo(-2, -12);
  ctx.quadraticCurveTo(8, -11, 13, -3);
  ctx.lineTo(17, 0);
  ctx.lineTo(14, 5);
  ctx.lineTo(18, 10);
  ctx.lineTo(12, 12);
  ctx.lineTo(10, 18);
  ctx.lineTo(3, 16);
  ctx.lineTo(-3, 20);
  ctx.lineTo(-7, 16);
  ctx.lineTo(-14, 18);
  ctx.lineTo(-15, 12);
  ctx.lineTo(-21, 11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#fff0c9";
  ctx.beginPath();
  ctx.moveTo(-12, 8);
  ctx.quadraticCurveTo(-6, 3, 1, 6);
  ctx.lineTo(6, 5);
  ctx.lineTo(5, 10);
  ctx.lineTo(9, 13);
  ctx.lineTo(3, 14);
  ctx.lineTo(-1, 18);
  ctx.lineTo(-5, 14);
  ctx.lineTo(-11, 15);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#9a652f";
  ctx.lineWidth = 2.2;
  for (const [sx, sy] of [[-13, -6], [-8, -10], [-2, -11]] as const) {
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + 5, sy + 3, sx + 6, sy + 8);
    ctx.stroke();
  }

  ctx.fillStyle = "#dda653";
  ctx.strokeStyle = "#704729";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-1, 2);
  ctx.lineTo(1, -12);
  ctx.lineTo(9, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(14, 3);
  ctx.lineTo(20, -10);
  ctx.lineTo(23, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#edbe6c";
  ctx.beginPath();
  ctx.moveTo(-2, 8);
  ctx.lineTo(0, 2);
  ctx.quadraticCurveTo(2, -3, 8, -5);
  ctx.lineTo(12, -8);
  ctx.lineTo(15, -4);
  ctx.quadraticCurveTo(22, -1, 24, 6);
  ctx.lineTo(28, 9);
  ctx.lineTo(24, 13);
  ctx.lineTo(25, 18);
  ctx.lineTo(19, 19);
  ctx.lineTo(15, 23);
  ctx.lineTo(11, 20);
  ctx.lineTo(5, 22);
  ctx.lineTo(4, 17);
  ctx.lineTo(-1, 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#fff0ce";
  ctx.beginPath();
  ctx.ellipse(12, 14, 10, 7, 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#9b6531";
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  for (const [x, y, dx] of [[5, 0, 4], [10, -2, 3], [15, 0, 3]] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + dx * 0.45, y + 3, x + dx, y + 5);
    ctx.stroke();
  }

  drawPetEye(ctx, 4.5, 6.4, 3.1, 4.1, "#9bcf49");
  drawPetEye(ctx, 15, 6.8, 3.6, 4.5, "#9bcf49");

  ctx.fillStyle = "#c96f70";
  ctx.beginPath();
  ctx.moveTo(15, 13);
  ctx.lineTo(20, 13);
  ctx.lineTo(17.5, 16);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#704729";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(17.4, 16);
  ctx.quadraticCurveTo(14.5, 19.5, 12, 16.8);
  ctx.moveTo(17.6, 16);
  ctx.quadraticCurveTo(20.5, 19.5, 22.5, 16.5);
  ctx.stroke();

  ctx.strokeStyle = "rgba(92, 60, 35, .82)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(15, 15);
  ctx.lineTo(29, 11);
  ctx.moveTo(15, 17);
  ctx.lineTo(29, 20);
  ctx.stroke();

  ctx.fillStyle = "#f9d995";
  ctx.strokeStyle = "#704729";
  ctx.lineWidth = 1.5;
  for (const [pawX, pawY] of [[5, 20], [17, 21]] as const) {
    ctx.beginPath();
    ctx.ellipse(pawX, pawY, 7, 4.8, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawPetSnowTrail(
  ctx: CanvasRenderingContext2D,
  model: GameModel,
  lagMeters: number,
  sideOffset: number,
  color: string,
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const lane of [-2.1, 2.1]) {
    const positions: ReturnType<typeof trailPosition>[] = [];
    for (let step = 1; step <= 9; step++) {
      const position = trailPosition(
        model,
        lagMeters + step * 1.35,
        sideOffset + lane,
      );
      // Do not turn the synthetic pre-start path into a long visible line.
      // Once one older sample is unavailable, every following step is older
      // still, so the real trail ends here.
      if (!position.historyReady) break;
      positions.push(position);
    }
    if (positions.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(positions[0].x, positions[0].y);
    for (let index = 1; index < positions.length; index++) {
      ctx.lineTo(positions[index].x, positions[index].y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.35;
    ctx.stroke();
  }
  ctx.restore();
}

function drawCompanions(
  ctx: CanvasRenderingContext2D,
  model: GameModel,
  profile: ShopProfile,
) {
  if (profile.equippedPets.includes("pet-digger")) {
    drawPetSnowTrail(ctx, model, 11, 20, "rgba(116, 156, 166, .18)");
    drawHamster(
      ctx,
      trailPosition(model, 11, 20),
      model.distance * 0.72,
    );
  }
  if (profile.equippedPets.includes("pet-car")) {
    drawPetSnowTrail(ctx, model, 19, -23, "rgba(105, 145, 156, .16)");
    drawGoldenCat(
      ctx,
      trailPosition(model, 19, -23),
      model.distance * 0.58 + 1.7,
    );
  }
}

function render(
  ctx: CanvasRenderingContext2D,
  model: GameModel,
  profile: ShopProfile,
) {
  const { width, height } = GAME;
  const shakeX = model.shake > 0 ? (seeded(model) - 0.5) * model.shake : 0;
  const shakeY = model.shake > 0 ? (seeded(model) - 0.5) * model.shake : 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(shakeX, shakeY);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#aeddea");
  sky.addColorStop(0.55, "#dff6fb");
  sky.addColorStop(1, "#c9edf5");
  ctx.fillStyle = sky;
  ctx.fillRect(-20, -20, width + 40, height + 40);

  const pointsLeft: Array<[number, number]> = [];
  const pointsRight: Array<[number, number]> = [];
  for (let y = -40; y <= height + 40; y += 32) {
    const worldDistance =
      model.distance + (y - GAME.playerY) / GAME.metersToPixels;
    const center = trackCenter(worldDistance);
    const half = trackWidth(worldDistance) / 2;
    pointsLeft.push([center - half, y]);
    pointsRight.push([center + half, y]);
  }

  ctx.fillStyle = "#f7fcfd";
  ctx.beginPath();
  pointsLeft.forEach(([x, y], index) =>
    index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
  );
  [...pointsRight].reverse().forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#87c6d4";
  ctx.lineWidth = 8;
  ctx.setLineDash([14, 18]);
  for (const edge of [pointsLeft, pointsRight]) {
    ctx.beginPath();
    edge.forEach(([x, y], index) =>
      index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
    );
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (let i = 0; i < 20; i++) {
    const worldMark = Math.floor(model.distance / 18) * 18 + i * 18 - 105;
    const y = GAME.playerY + (worldMark - model.distance) * GAME.metersToPixels;
    if (y < -20 || y > height + 20) continue;
    const center = trackCenter(worldMark);
    const half = trackWidth(worldMark) * 0.35;
    const side = i % 2 === 0 ? -1 : 1;
    ctx.strokeStyle = "rgba(72, 157, 179, .22)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(center + side * half, y);
    ctx.lineTo(center + side * (half - 20), y - 18);
    ctx.stroke();
  }

  drawTracks(ctx, model);
  drawCompanions(ctx, model, profile);

  const visible = model.obstacles
    .map((obstacle) => ({ obstacle, ...obstacleScreenPosition(model, obstacle) }))
    .filter((item) => item.y > -90 && item.y < height + 100)
    .sort((a, b) => a.y - b.y);

  for (const { obstacle, x, y } of visible) {
    if (obstacle.type === "crevasse") {
      drawCrevasse(ctx, model, obstacle, y);
    } else if (obstacle.type === "tree") {
      drawTree(ctx, x, y, obstacle.hit ? 0.92 : 1);
    } else {
      drawRock(ctx, x, y, obstacle.type === "largeRock");
    }
  }

  for (const particle of model.particles) {
    ctx.globalAlpha = Math.max(0, particle.life);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawShield(ctx, model);
  drawBoarder(ctx, model, profile);

  const d = difficulty(model.distance);
  if (model.speed > 56) {
    const alpha = Math.min(0.42, (model.speed - 48) / 115);
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = model.stance === "tuck" ? 2.8 : 2;
    for (let i = 0; i < 15 + d * 12; i++) {
      const x = (i * 79 + model.distance * 17) % width;
      const y = (i * 131 + model.distance * 11) % height;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(
        x + model.lateralVelocity * 0.032,
        y - 32 - model.speed * 0.27,
      );
      ctx.stroke();
    }
  }

  ctx.restore();
}

function emitSnow(model: GameModel, amount: number, force = 1) {
  for (let i = 0; i < amount; i++) {
    model.particles.push({
      x: model.playerX + (seeded(model) - 0.5) * 28,
      y: GAME.playerY + 26,
      vx: (seeded(model) - 0.5) * 110 * force - model.lateralVelocity * 0.3,
      vy: 35 + seeded(model) * 75 * force,
      life: 0.45 + seeded(model) * 0.35,
      size: 2 + seeded(model) * 4,
      color: seeded(model) > 0.58 ? "#ffffff" : "#86cfdf",
    });
  }
  if (model.particles.length > 240) {
    model.particles.splice(0, model.particles.length - 240);
  }
}

function collision(model: GameModel) {
  if (model.invulnerable > 0) return;
  const airborne = isAirborne(model);
  const boardY = GAME.playerY + 28;

  for (const obstacle of model.obstacles) {
    if (obstacle.hit) continue;
    const { x, y } = obstacleScreenPosition(model, obstacle);
    const xGap = Math.abs(x - model.playerX);
    let fatal = false;

    if (obstacle.type === "crevasse") {
      const crackHalf = trackWidth(obstacle.distance) * obstacle.width * 0.5;
      const boardGap = Math.abs(y - boardY);
      const insideOpening =
        Math.abs(model.playerX - trackCenter(obstacle.distance)) <
        crackHalf - GAME.crevasseEdgeGrace;
      const overCrack =
        boardGap <
        obstacle.height * GAME.crevasseColliderDepth +
          GAME.crevasseBoardMargin;
      const boardClearance = jumpHeight(model);

      // Crevasses collide with the snowboard contact point, not the rider's
      // head/body. A small positive clearance is enough to clear the lip.
      if (
        overCrack &&
        insideOpening &&
        (!airborne || boardClearance < GAME.crevasseClearance)
      ) {
        fatal = true;
      }
    } else if (!airborne && obstacle.type === "tree") {
      // Only the clearly marked trunk base is solid. Tree canopy overlap is visual.
      const trunkBaseY = y + 21;
      if (
        Math.abs(trunkBaseY - boardY) < GAME.treeColliderY &&
        xGap < GAME.treeColliderX
      ) {
        fatal = true;
      }
    } else if (!airborne) {
      const rockYGap = Math.abs(y - GAME.playerY);
      const rockHit =
        rockYGap < obstacle.height * 0.3 + GAME.playerRadius * 0.65 &&
        xGap < obstacle.width * 0.25 + GAME.playerRadius * 0.7;
      if (rockHit && obstacle.type === "largeRock") {
        fatal = true;
      } else if (rockHit) {
        obstacle.hit = true;
        model.speed = Math.max(GAME.minSpeed, model.speed - 20);
        model.lateralVelocity *= -0.45;
        model.invulnerable = GAME.rockInvulnerability;
        model.shake = 10;
        emitSnow(model, 20, 1.4);
        emitHaptic("medium");
      }
    }

    if (fatal) {
      if (model.shieldCharges > 0) {
        model.shieldCharges -= 1;
        model.shieldFlash = 0.72;
        model.invulnerable = 1.35;
        model.speed = Math.max(GAME.minSpeed, model.speed * 0.62);
        model.lateralVelocity *= -0.32;
        model.shake = 13;
        obstacle.hit = true;
        emitSnow(model, 34, 1.8);
        emitHaptic("shield");
        return;
      }
      model.status = "CRASHED";
      model.crashTime = 0;
      model.speed *= 0.25;
      model.shake = 18;
      emitSnow(model, 42, 2.1);
      emitHaptic("heavy");
      return;
    }
  }
}

function update(
  model: GameModel,
  input: InputState,
  dt: number,
  onLand: () => void,
  board: ShopItem,
) {
  model.shake = Math.max(0, model.shake - dt * 34);
  model.invulnerable = Math.max(0, model.invulnerable - dt);
  model.shieldFlash = Math.max(0, model.shieldFlash - dt);
  model.jumpCooldown = Math.max(0, model.jumpCooldown - dt);
  model.boundaryTurnCooldown = Math.max(
    0,
    model.boundaryTurnCooldown - dt,
  );
  model.stanceHold = Math.max(0, model.stanceHold - dt);

  for (const p of model.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 60 * dt;
    p.life -= dt * 1.4;
  }
  model.particles = model.particles.filter((p) => p.life > 0);

  if (model.status === "COUNTDOWN") {
    model.countdown -= dt;
    if (model.countdown <= 0) {
      model.status = "PLAYING";
      model.countdown = 0;
    }
    return;
  }

  if (model.status === "CRASHED") {
    model.crashTime += dt;
    if (model.crashTime >= GAME.crashDuration) finishRun(model);
    return;
  }

  if (model.status !== "PLAYING") return;

  if (input.brake) {
    model.stance = "brake";
    model.stanceHold = 0.2;
    model.speed -= GAME.braking * dt;
  } else if (input.accelerate) {
    model.stance = "tuck";
    model.stanceHold = 0.2;
    model.speed += (board.acceleration ?? GAME.acceleration) * dt;
  } else {
    if (model.stanceHold <= 0) model.stance = "coast";
    const direction = Math.sign(GAME.cruiseSpeed - model.speed);
    model.speed += direction * GAME.cruiseReturn * dt;
  }
  const boardMax = board.maxSpeed ?? GAME.maxSpeed;
  const dynamicMax = 108 + difficulty(model.distance) * (boardMax - 108);
  model.speed = Math.max(GAME.minSpeed, Math.min(dynamicMax, model.speed));

  const previousCenter = trackCenter(model.distance);
  const traveled = (model.speed / 3.6) * dt;
  model.distance += traveled;
  const newCenter = trackCenter(model.distance);
  model.playerX += newCenter - previousCenter;

  const air = isAirborne(model);
  const targetLateral =
    model.edge *
    GAME.lateralSpeed *
    (0.72 + model.speed / boardMax) *
    (air ? GAME.airControl : 1);
  const delta = targetLateral - model.lateralVelocity;
  const change = GAME.edgeAcceleration * dt * (air ? 0.12 : 1);
  model.lateralVelocity += Math.max(-change, Math.min(change, delta));
  model.playerX += model.lateralVelocity * dt;

  const half = trackWidth(model.distance) / 2;
  const center = trackCenter(model.distance);
  const edgeLimit = half - GAME.playerRadius - 7;
  const laneOffset = model.playerX - center;
  if (Math.abs(laneOffset) > edgeLimit) {
    const outsideSide = (Math.sign(laneOffset) || 1) as -1 | 1;
    const inward = (outsideSide * -1) as -1 | 1;
    model.playerX = center + outsideSide * edgeLimit;
    if (model.boundaryTurnCooldown <= 0 || model.edge !== inward) {
      model.edge = inward;
      model.queuedEdge = inward;
      model.boundaryTurnCooldown = GAME.boundaryTurnLock;
      model.lateralVelocity =
        inward * Math.max(76, Math.min(132, Math.abs(model.lateralVelocity) * 0.72));
      model.speed = Math.max(GAME.minSpeed, model.speed - 7);
      model.shake = Math.max(model.shake, 5);
      emitSnow(model, 18, 1.5);
    }
  }

  if (!air) {
    const contact = boardContact(model);
    const strength = input.brake ? 1.25 : input.accelerate ? 0.72 : 0.92;
    const lastMark = model.trackMarks.at(-1);

    if (
      !lastMark ||
      contact.distance - lastMark.distance > GAME.trackSampleMeters * 2.8
    ) {
      // Start a fresh segment after take-off instead of drawing across the air.
      model.trackMarks.push({ ...contact, strength });
    } else {
      let cursor: TrackMark = lastMark;
      let remaining = contact.distance - cursor.distance;
      while (remaining >= GAME.trackSampleMeters) {
        const progress = GAME.trackSampleMeters / Math.max(remaining, 0.001);
        const nextMark: TrackMark = {
          distance: cursor.distance + GAME.trackSampleMeters,
          x: cursor.x + (contact.x - cursor.x) * progress,
          strength,
        };
        model.trackMarks.push(nextMark);
        cursor = nextMark;
        remaining = contact.distance - cursor.distance;
      }
      model.trackAccumulator = Math.max(0, remaining);
    }
    model.snowAccumulator +=
      dt * (input.brake ? 70 : input.accelerate ? 18 : 30);
    while (model.snowAccumulator >= 1) {
      model.snowAccumulator -= 1;
      emitSnow(model, 1, input.brake ? 1.65 : input.accelerate ? 0.68 : 0.9);
    }
  }
  model.trackMarks = model.trackMarks.filter(
    (mark) => mark.distance > model.distance - GAME.trackKeepMeters,
  );

  if (model.jumpTime >= 0) {
    model.jumpTime += dt;
    if (model.jumpTime >= GAME.jumpDuration) {
      model.jumpTime = -1;
      model.edge = model.queuedEdge;
      model.jumpCooldown = GAME.jumpRecovery;
      model.speed = Math.max(GAME.minSpeed, model.speed - 2.5);
      model.shake = 5;
      emitSnow(model, 18, 1.25);
      onLand();
    }
  }

  while (model.nextSpawn < model.distance + GAME.spawnAheadMeters) {
    spawnPattern(model);
  }
  model.obstacles = model.obstacles.filter(
    (o) => o.distance > model.distance - GAME.cleanupBehindMeters,
  );

  collision(model);
}

function useAudio() {
  const audioRef = useRef<AudioContext | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const musicTimerRef = useRef<number | null>(null);

  const ensureAudio = useCallback(() => {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return null;
    const audio = audioRef.current ?? new AudioContextClass();
    audioRef.current = audio;
    if (audio.state === "suspended") void audio.resume();
    return audio;
  }, []);

  const ping = useCallback((frequency: number, duration = 0.08, volume = 0.045) => {
    try {
      const audio = ensureAudio();
      if (!audio) return;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(80, frequency * 0.72),
        audio.currentTime + duration,
      );
      gain.gain.setValueAtTime(volume, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    } catch {
      // Audio feedback is a progressive enhancement.
    }
  }, [ensureAudio]);

  const stopMusic = useCallback(() => {
    if (musicTimerRef.current !== null) {
      window.clearInterval(musicTimerRef.current);
      musicTimerRef.current = null;
    }
    const audio = audioRef.current;
    const gain = musicGainRef.current;
    if (audio && gain) {
      gain.gain.cancelScheduledValues(audio.currentTime);
      gain.gain.setTargetAtTime(0.0001, audio.currentTime, 0.035);
    }
    musicGainRef.current = null;
  }, []);

  const startMusic = useCallback(() => {
    try {
      if (musicTimerRef.current !== null) return;
      const audio = ensureAudio();
      if (!audio) return;

      const master = audio.createGain();
      const compressor = audio.createDynamicsCompressor();
      const makeup = audio.createGain();
      compressor.threshold.setValueAtTime(-10, audio.currentTime);
      compressor.knee.setValueAtTime(10, audio.currentTime);
      compressor.ratio.setValueAtTime(5, audio.currentTime);
      compressor.attack.setValueAtTime(0.004, audio.currentTime);
      compressor.release.setValueAtTime(0.2, audio.currentTime);
      makeup.gain.setValueAtTime(1.22, audio.currentTime);
      master.gain.setValueAtTime(0.0001, audio.currentTime);
      master.gain.exponentialRampToValueAtTime(1.05, audio.currentTime + 0.65);
      master.connect(compressor).connect(makeup).connect(audio.destination);
      musicGainRef.current = master;

      // A restrained winter downtempo loop: slow pads and bass establish the
      // slope, while the sparse filtered melody leaves room for game sounds.
      const beat = 60 / 92 / 2;
      const chordProgression = [
        [0, 3, 7],
        [-4, 0, 3],
        [3, 7, 10],
        [-2, 2, 5],
      ];
      const melody: Array<number | null> = [
        12, null, null, 10, null, null, 7, null,
        5, null, null, 7, null, null, 10, null,
        7, null, null, 5, null, null, 3, null,
        null, null, null, null, null, null, null, null,
      ];
      let step = 0;
      let nextTime = audio.currentTime + 0.05;

      const scheduleTone = (
        frequency: number,
        at: number,
        duration: number,
        type: OscillatorType,
        volume: number,
        attack = 0.035,
        cutoff = 1800,
      ) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const filter = audio.createBiquadFilter();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, at);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(cutoff, at);
        filter.Q.setValueAtTime(0.55, at);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(
          volume,
          at + Math.min(attack, duration * 0.42),
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        oscillator.connect(filter).connect(gain).connect(master);
        oscillator.start(at);
        oscillator.stop(at + duration + 0.05);
      };

      const scheduleKick = (at: number) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(104, at);
        oscillator.frequency.exponentialRampToValueAtTime(46, at + 0.2);
        gain.gain.setValueAtTime(0.14, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
        oscillator.connect(gain).connect(master);
        oscillator.start(at);
        oscillator.stop(at + 0.24);
      };

      const schedule = () => {
        while (nextTime < audio.currentTime + 0.32) {
          const chordIndex = Math.floor(step / 8) % chordProgression.length;
          const chord = chordProgression[chordIndex];

          if (step % 8 === 0) {
            for (const semitone of chord) {
              scheduleTone(
                146.83 * 2 ** (semitone / 12),
                nextTime,
                beat * 7.8,
                "triangle",
                0.05,
                0.32,
                920,
              );
            }
          }

          if (step % 4 === 0) {
            scheduleTone(
              73.42 * 2 ** (chord[0] / 12),
              nextTime,
              beat * 3.35,
              "sine",
              0.13,
              0.045,
              420,
            );
            scheduleKick(nextTime);
          }

          const semitone = melody[step % melody.length];
          if (semitone !== null) {
            scheduleTone(
              146.83 * 2 ** (semitone / 12),
              nextTime,
              beat * 1.35,
              "sine",
              0.08,
              0.08,
              1450,
            );
          }

          step += 1;
          nextTime += beat;
        }
      };

      schedule();
      musicTimerRef.current = window.setInterval(schedule, 100);
    } catch {
      // Background music is optional when Web Audio is unavailable.
    }
  }, [ensureAudio]);

  useEffect(
    () => () => {
      stopMusic();
      void audioRef.current?.close();
    },
    [stopMusic],
  );

  return { ping, startMusic, stopMusic };
}

export function SnowGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [initialModel] = useState(() => createGame());
  const modelRef = useRef<GameModel>(initialModel);
  const inputRef = useRef<InputState>({ accelerate: false, brake: false });
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const hudTimeRef = useRef(0);
  const { ping, startMusic, stopMusic } = useAudio();
  const [hud, setHud] = useState<HudState>(() => hudFrom(initialModel));
  const [profile, setProfile] = useState<ShopProfile>(DEFAULT_PROFILE);
  const profileRef = useRef<ShopProfile>(DEFAULT_PROFILE);
  const [shopOpen, setShopOpen] = useState(false);
  const [lastReward, setLastReward] = useState(0);
  const [lastPetBonus, setLastPetBonus] = useState(0);
  const [installPrompt, setInstallPrompt] =
    useState<InstallPromptEvent | null>(null);

  const syncHud = useCallback(() => {
    setHud(hudFrom(modelRef.current));
  }, []);

  const updateProfile = useCallback(
    (updater: (current: ShopProfile) => ShopProfile) => {
      setProfile((current) => {
        const next = updater(current);
        profileRef.current = next;
        saveProfile(next);
        return next;
      });
    },
    [],
  );

  const start = useCallback(() => {
    const model = modelRef.current;
    if (model.status === "START" || model.status === "GAME_OVER") {
      resetRun(model);
      model.shieldCharges = profileRef.current.equippedPets.includes("pet-car") ? 1 : 0;
      setLastReward(0);
      setLastPetBonus(0);
      setShopOpen(false);
      ping(620, 0.12);
      if (profileRef.current.musicEnabled) startMusic();
      syncHud();
    }
  }, [ping, startMusic, syncHud]);

  const togglePause = useCallback(() => {
    const model = modelRef.current;
    if (model.status === "PLAYING") {
      inputRef.current = { accelerate: false, brake: false };
      model.status = "PAUSED";
      ping(240, 0.08);
      stopMusic();
    } else if (model.status === "PAUSED") {
      model.status = "PLAYING";
      lastTimeRef.current = performance.now();
      ping(420, 0.08);
      if (profileRef.current.musicEnabled) startMusic();
    }
    syncHud();
  }, [ping, startMusic, stopMusic, syncHud]);

  const toggleEdge = useCallback(() => {
    const model = modelRef.current;
    if (model.status !== "PLAYING" || model.boundaryTurnCooldown > 0) return;
    const next = (model.queuedEdge * -1) as -1 | 1;
    model.queuedEdge = next;
    if (!isAirborne(model)) {
      model.edge = next;
      emitSnow(model, 8, 0.85);
    }
    emitHaptic("light");
    ping(340 + (next > 0 ? 70 : 0), 0.055, 0.035);
  }, [ping]);

  const jump = useCallback(() => {
    const model = modelRef.current;
    if (
      model.status === "PLAYING" &&
      model.jumpTime < 0 &&
      model.jumpCooldown <= 0
    ) {
      model.jumpTime = 0;
      model.queuedEdge = model.edge;
      emitSnow(model, 12, 1.15);
      emitHaptic("medium");
      ping(510, 0.12);
    }
  }, [ping]);

  const setTouchSpeed = useCallback(
    (kind: "accelerate" | "brake", active: boolean) => {
      if (active && modelRef.current.status !== "PLAYING") return;
      inputRef.current[kind] = active;
      if (active) {
        inputRef.current[kind === "accelerate" ? "brake" : "accelerate"] = false;
        emitHaptic("light");
      }
    },
    [],
  );

  const installApp = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }, [installPrompt]);

  const handleShopItem = useCallback(
    (item: ShopItem) => {
      updateProfile((current) => {
        const owned = current.ownedItemIds.includes(item.id);
        if (!owned && current.coins < item.price) return current;

        const ownedItemIds = owned
          ? current.ownedItemIds
          : [...current.ownedItemIds, item.id];
        const coins = owned ? current.coins : current.coins - item.price;

        if (item.category === "pet") {
          const active = current.equippedPets.includes(item.id);
          return {
            ...current,
            coins,
            ownedItemIds,
            equippedPets: active
              ? current.equippedPets.filter((id) => id !== item.id)
              : [...current.equippedPets, item.id],
          };
        }

        return {
          ...current,
          coins,
          ownedItemIds,
          equipped: {
            ...current.equipped,
            [item.category as GearSlot]: item.id,
          },
        };
      });
      ping(item.category === "pet" ? 460 : 700, 0.1, 0.04);
    },
    [ping, updateProfile],
  );

  const toggleTestMode = useCallback(() => {
    updateProfile((current) =>
      current.testMode
        ? { ...current, testMode: false }
        : unlockTestProfile(current),
    );
    ping(880, 0.18, 0.05);
  }, [ping, updateProfile]);

  const toggleMusic = useCallback(() => {
    const nextEnabled = !profileRef.current.musicEnabled;
    updateProfile((current) => ({ ...current, musicEnabled: nextEnabled }));
    if (nextEnabled) startMusic();
    else stopMusic();
    ping(nextEnabled ? 660 : 220, 0.08, 0.035);
  }, [ping, startMusic, stopMusic, updateProfile]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      modelRef.current.best = safeBest();
      const storedProfile = loadProfile();
      profileRef.current = storedProfile;
      setProfile(storedProfile);
      syncHud();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [syncHud]);

  useEffect(() => {
    const isNativeMobile = document.querySelector(
      'meta[name="shushu-platform"][content="mobile"]',
    );
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    if (
      !isNativeMobile &&
      "serviceWorker" in navigator &&
      (location.protocol === "https:" || location.hostname === "localhost")
    ) {
      void navigator.serviceWorker.register("/sw.js");
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (shopOpen) {
        if (key === "escape") {
          event.preventDefault();
          setShopOpen(false);
        }
        return;
      }
      if (
        [" ", "arrowup", "arrowdown", "shift", "k", "l", "j", "p", "escape", "enter"].includes(
          key,
        )
      ) {
        event.preventDefault();
      }
      if (key === "k" || key === "arrowup") {
        inputRef.current.accelerate = true;
        modelRef.current.stance = "tuck";
        modelRef.current.stanceHold = 0.24;
        syncHud();
      }
      if (key === "l" || key === "arrowdown") {
        inputRef.current.brake = true;
        modelRef.current.stance = "brake";
        modelRef.current.stanceHold = 0.24;
        syncHud();
      }
      if (event.repeat) return;
      if (key === " ") toggleEdge();
      if (key === "j" || key === "shift") jump();
      if (key === "escape" || key === "p") togglePause();
      if (key === "enter") start();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "k" || key === "arrowup") inputRef.current.accelerate = false;
      if (key === "l" || key === "arrowdown") inputRef.current.brake = false;
    };
    const onBlur = () => {
      inputRef.current = { accelerate: false, brake: false };
      stopMusic();
      if (modelRef.current.status === "PLAYING") {
        modelRef.current.status = "PAUSED";
        syncHud();
      }
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("shushu:pause", onBlur);
    document.addEventListener("visibilitychange", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("shushu:pause", onBlur);
      document.removeEventListener("visibilitychange", onBlur);
    };
  }, [jump, shopOpen, start, stopMusic, syncHud, toggleEdge, togglePause]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const frame = (time: number) => {
      const rawDt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0;
      const dt = Math.min(0.034, Math.max(0, rawDt));
      lastTimeRef.current = time;
      const model = modelRef.current;
      const previousStatus = model.status;
      const currentProfile = profileRef.current;
      update(
        model,
        inputRef.current,
        dt,
        () => ping(170, 0.07, 0.03),
        getBoard(currentProfile),
      );
      if (previousStatus !== "GAME_OVER" && model.status === "GAME_OVER") {
        const reward = rewardForRun(
          model.distance,
          currentProfile.equippedPets.includes("pet-digger"),
        );
        setLastReward(reward.total);
        setLastPetBonus(reward.petBonus);
        updateProfile((current) => ({
          ...current,
          coins: current.coins + reward.total,
        }));
        stopMusic();
      }
      render(ctx, model, profileRef.current);
      if (time - hudTimeRef.current > 90) {
        hudTimeRef.current = time;
        setHud(hudFrom(model));
      }
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ping, stopMusic, updateProfile]);

  const activeBoard = getBoard(profile);
  const speedPercent =
    ((hud.speed - GAME.minSpeed) /
      ((activeBoard.maxSpeed ?? GAME.maxSpeed) - GAME.minSpeed)) *
    100;
  const countdownText =
    hud.countdown > 3
      ? "3"
      : hud.countdown > 2
        ? "2"
        : hud.countdown > 1
          ? "1"
          : "GO";

  return (
    <main className="game-shell">
      <section className="brand-panel" aria-label="游戏介绍">
        <p className="eyebrow">Endless alpine run</p>
        <h1 aria-label="薯薯雪线">
          <span className="brand-title-cn" aria-hidden="true">
            <span>薯薯</span>
            <span>雪线</span>
          </span>
          <span className="brand-title-en">SHUSHU SNOWLINE</span>
        </h1>
        <p className="brand-copy">
          雪道不会等你。读懂路线、踩准换刃节奏，在失控边缘追逐更远的那一米。
        </p>
        <div className="brand-rule" />
      </section>

      <section className="game-stage" aria-label="薯薯雪线滑雪游戏">
        <canvas
          ref={canvasRef}
          className="game-canvas"
          width={GAME.width}
          height={GAME.height}
          aria-label="无限滑雪游戏画布"
        />

        {hud.status !== "START" && hud.status !== "GAME_OVER" && (
          <div className="hud" aria-live="polite">
            <div className="hud-score">
              <div className="hud-distance">{hud.distance.toLocaleString()} m</div>
              <div className={`hud-speed is-${hud.stance}`}>
                <span>{hud.speed} km/h</span>
                <span className="speed-track">
                  <span
                    className="speed-fill"
                    style={{ width: `${Math.max(4, speedPercent)}%` }}
                  />
                </span>
                <span className="hud-mode">
                  {hud.autoTurn
                    ? "边界自动换刃"
                    : hud.stance === "tuck"
                    ? "俯身加速"
                    : hud.stance === "brake"
                      ? "横板刹雪"
                      : "巡航"}
                </span>
              </div>
            </div>
            {(hud.status === "PLAYING" || hud.status === "PAUSED") && (
              <button
                className="pause-button"
                type="button"
                onClick={togglePause}
                aria-label={hud.status === "PAUSED" ? "继续游戏" : "暂停游戏"}
              >
                {hud.status === "PAUSED" ? "▶" : "Ⅱ"}
              </button>
            )}
            {profile.equippedPets.includes("pet-car") && (
              <div
                className={`shield-status ${hud.shieldCharges > 0 ? "is-ready" : "is-spent"}`}
                aria-label={hud.shieldCharges > 0 ? "车车护盾可用" : "车车护盾已使用"}
              >
                <span aria-hidden="true">◌</span>
                {hud.shieldCharges > 0 ? "车车护盾" : "护盾已用"}
              </div>
            )}
          </div>
        )}

        {(hud.status === "PLAYING" || hud.status === "PAUSED") && (
          <div className="touch-controls" aria-label="手机触控操作">
            <button
              className="touch-action touch-edge"
              type="button"
              disabled={hud.status !== "PLAYING"}
              onPointerDown={(event) => {
                event.preventDefault();
                toggleEdge();
              }}
            >
              <strong>换刃</strong>
              <small>左右切换</small>
            </button>
            <div className="touch-speed-controls">
              <button
                className="touch-action touch-accelerate"
                type="button"
                aria-label="加速"
                disabled={hud.status !== "PLAYING"}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setTouchSpeed("accelerate", true);
                }}
                onPointerUp={() => setTouchSpeed("accelerate", false)}
                onPointerCancel={() => setTouchSpeed("accelerate", false)}
                onPointerLeave={() => setTouchSpeed("accelerate", false)}
                onLostPointerCapture={() => setTouchSpeed("accelerate", false)}
              >
                加速
              </button>
              <button
                className="touch-action touch-brake"
                type="button"
                aria-label="减速"
                disabled={hud.status !== "PLAYING"}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setTouchSpeed("brake", true);
                }}
                onPointerUp={() => setTouchSpeed("brake", false)}
                onPointerCancel={() => setTouchSpeed("brake", false)}
                onPointerLeave={() => setTouchSpeed("brake", false)}
                onLostPointerCapture={() => setTouchSpeed("brake", false)}
              >
                减速
              </button>
            </div>
            <button
              className="touch-action touch-jump"
              type="button"
              disabled={hud.status !== "PLAYING"}
              onPointerDown={(event) => {
                event.preventDefault();
                jump();
              }}
            >
              <strong>跳跃</strong>
              <small>越过障碍</small>
            </button>
          </div>
        )}

        {hud.status === "START" && (
          <div className="overlay">
            <div className="overlay-card">
              <p className="micro-label">Edge. Commit. Fly.</p>
              <h2 className="overlay-title" aria-label="薯薯雪线，无限滑降">
                <span className="overlay-title-line" aria-hidden="true">薯薯</span>
                <span className="overlay-title-line" aria-hidden="true">雪线</span>
                <em>无限滑降</em>
              </h2>
              <p className="record">
                本地最佳 <strong>{hud.best.toLocaleString()} m</strong>
              </p>
              <div className="coin-balance" aria-label={`薯薯币 ${profile.coins}`}>
                <span aria-hidden="true">🥔</span>
                <strong>{profile.coins.toLocaleString()}</strong>
                <span>薯薯币</span>
              </div>
              <button className="primary-button" type="button" onClick={start}>
                开始滑行 · ENTER
              </button>
              <div className="start-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setShopOpen(true)}
                >
                  薯薯商城
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={toggleMusic}
                  aria-pressed={profile.musicEnabled}
                >
                  音乐 {profile.musicEnabled ? "开" : "关"}
                </button>
                {installPrompt && (
                  <button
                    className="secondary-button install-button"
                    type="button"
                    onClick={installApp}
                  >
                    安装到手机
                  </button>
                )}
              </div>
              <div className="control-strip desktop-control-strip" aria-label="键盘操作说明">
                <span><kbd>SPACE</kbd>换刃</span>
                <span><kbd>K / L</kbd>调速</span>
                <span><kbd>J</kbd>跳跃</span>
              </div>
              <div className="mobile-control-hint">
                进入雪道后使用屏幕按钮换刃、调速和跳跃
              </div>
            </div>
          </div>
        )}

        {hud.status === "COUNTDOWN" && (
          <div className="overlay" aria-live="assertive">
            <div className="countdown">{countdownText}</div>
          </div>
        )}

        {hud.status === "PAUSED" && (
          <div className="overlay">
            <div className="overlay-card">
              <p className="micro-label">Run held</p>
              <h2 className="overlay-title">暂停</h2>
              <p className="record">雪道已冻结，按 ESC / P 继续</p>
              <button className="primary-button" type="button" onClick={togglePause}>
                继续滑行
              </button>
            </div>
          </div>
        )}

        {hud.status === "GAME_OVER" && (
          <div className="overlay">
            <div className="overlay-card">
              <p className="micro-label">Run complete</p>
              <h2 className="overlay-title">雪花落定</h2>
              <div className="result-distance">{hud.distance.toLocaleString()} m</div>
              {hud.isNewBest && <span className="new-record">新纪录</span>}
              <p className="record">
                历史最佳 <strong>{hud.best.toLocaleString()} m</strong>
              </p>
              <div className="run-reward">
                <span>本局获得</span>
                <strong>🥔 +{lastReward}</strong>
                {lastPetBonus > 0 && (
                  <em>挖挖机收益 +25%（+{lastPetBonus}）</em>
                )}
                <small>余额 {profile.coins.toLocaleString()}</small>
              </div>
              <button className="primary-button" type="button" onClick={start}>
                再滑一次 · ENTER
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setShopOpen(true)}
              >
                去薯薯商城
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  modelRef.current.status = "START";
                  syncHud();
                }}
              >
                返回开始
              </button>
            </div>
          </div>
        )}

        {shopOpen && (
          <ShopModal
            profile={profile}
            onClose={() => setShopOpen(false)}
            onItemAction={handleShopItem}
            onToggleTest={toggleTestMode}
          />
        )}
      </section>

      <aside className="side-panel" aria-label="完整键位">
        <p className="eyebrow">Controls</p>
        <h2>别推方向，抓住节奏。</h2>
        <div className="key-list">
          <div className="key-row"><kbd>SPACE</kbd><span>切换左右刃，有惯性</span></div>
          <div className="key-row"><kbd>K / ↑</kbd><span>压低重心，平滑加速</span></div>
          <div className="key-row"><kbd>L / ↓</kbd><span>横板刹雪，减速</span></div>
          <div className="key-row"><kbd>J / SHIFT</kbd><span>跳过裂缝与小石</span></div>
          <div className="key-row"><kbd>ESC / P</kbd><span>暂停或继续</span></div>
        </div>
        <p className="tip">
          高速能跨得更远，但换刃也更难收住。树木和大岩石必须绕开。
        </p>
      </aside>
    </main>
  );
}
