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
  rewardForDistance,
  saveProfile,
  unlockTestProfile,
  type GearSlot,
  type ShopItem,
  type ShopProfile,
} from "./shop";

type HudState = {
  status: GameStatus;
  distance: number;
  speed: number;
  best: number;
  countdown: number;
  isNewBest: boolean;
  stance: PlayerStance;
  autoTurn: boolean;
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

function boardContact(model: GameModel) {
  const lean = Math.max(-0.5, Math.min(0.5, model.lateralVelocity / 280));
  const tuck = model.stance === "tuck";
  const brake = model.stance === "brake";
  const crouch = tuck ? 12 : brake ? 5 : 0;
  const edgeRotation =
    (model.edge * 0.32 + lean) * (tuck ? 0.68 : 1) +
    (brake ? model.edge * 0.42 : 0);
  const boardOffset = 28;
  const boardY =
    GAME.playerY + crouch + Math.cos(edgeRotation) * boardOffset;

  return {
    x: model.playerX - Math.sin(edgeRotation) * boardOffset,
    distance:
      model.distance + (boardY - GAME.playerY) / GAME.metersToPixels,
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
  const lean = Math.max(-0.5, Math.min(0.5, model.lateralVelocity / 280));
  const y = GAME.playerY - air;
  const tuck = model.stance === "tuck" && !isAirborne(model);
  const brake = model.stance === "brake" && !isAirborne(model);
  const crouch = tuck ? 12 : brake ? 5 : 0;
  const edgeRotation =
    (model.edge * 0.32 + lean) * (tuck ? 0.68 : 1) +
    (brake ? model.edge * 0.42 : 0);

  ctx.save();
  ctx.translate(model.playerX + 5, GAME.playerY + 18);
  ctx.scale(1 + air / 620, Math.max(0.28, 1 - air / 90));
  ctx.fillStyle = `rgba(5, 30, 42, ${0.22 - air / 650})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 26 + air / 8, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(model.playerX, y + crouch);
  ctx.rotate(edgeRotation);
  if (model.status === "CRASHED") {
    ctx.rotate(model.crashTime * 3.8);
  }

  // Loose snow is drawn as small white flecks, never as twin "thruster" beams.
  if (!isAirborne(model) && model.status !== "CRASHED") {
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
  }

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

  // Legs and boots.
  ctx.strokeStyle = pantsStyle.color;
  ctx.lineCap = "round";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-8, tuck ? 2 : 5);
  ctx.lineTo(brake ? -21 : -14, tuck ? 20 : 25);
  ctx.moveTo(7, tuck ? 2 : 5);
  ctx.lineTo(brake ? 21 : 14, tuck ? 20 : 25);
  ctx.stroke();

  // Black hoodie with a pale-blue heart/deer emblem.
  ctx.save();
  ctx.translate(tuck ? model.edge * 6 : 0, tuck ? 5 : 0);
  ctx.rotate(tuck ? -model.edge * 0.24 : brake ? model.edge * 0.12 : 0);
  ctx.fillStyle = jacketStyle.color;
  ctx.strokeStyle = "#080a0d";
  ctx.lineWidth = 4;
  roundedRect(ctx, -15, tuck ? -19 : -23, 30, tuck ? 30 : 36, 9);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#b7d6ff";
  ctx.lineWidth = 1.6;
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
  ctx.fillStyle = hatStyle.color;
  ctx.strokeStyle = "#07090c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(tuck ? model.edge * 4 : 0, tuck ? -31 : -41, 13, Math.PI, Math.PI * 2);
  ctx.lineTo(13, tuck ? -27 : -37);
  ctx.lineTo(-13, tuck ? -27 : -37);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

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

  // A conventional snowboard with a pattern shared by its shop preview.
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

function trailPosition(model: GameModel, lagMeters: number, sideOffset: number) {
  const targetDistance = model.distance - lagMeters;
  const marks = model.trackMarks;
  const nextIndex = marks.findIndex((mark) => mark.distance >= targetDistance);

  if (nextIndex <= 0 || marks.length < 2) {
    return {
      x: model.playerX + sideOffset,
      y: GAME.playerY - lagMeters * GAME.metersToPixels,
      angle: 0,
    };
  }

  const previous = marks[nextIndex - 1];
  const current = marks[nextIndex];
  const span = Math.max(0.001, current.distance - previous.distance);
  const progress = Math.max(
    0,
    Math.min(1, (targetDistance - previous.distance) / span),
  );
  const baseX = previous.x + (current.x - previous.x) * progress;
  const baseDistance =
    previous.distance + (current.distance - previous.distance) * progress;
  // Average across neighbouring samples so the companion does not snap its
  // heading whenever it crosses from one track segment to the next.
  const tangentStart = marks[Math.max(0, nextIndex - 2)];
  const tangentEnd = marks[Math.min(marks.length - 1, nextIndex + 1)];
  const dx = tangentEnd.x - tangentStart.x;
  const dy =
    (tangentEnd.distance - tangentStart.distance) * GAME.metersToPixels;
  const length = Math.max(1, Math.hypot(dx, dy));
  const perpendicularX = -dy / length;

  return {
    x: baseX + perpendicularX * sideOffset,
    // Keep longitudinal lag monotonic. Sharp turns may move a pet sideways,
    // but can never send it backwards/downhill to an older screen position.
    y: GAME.playerY + (baseDistance - model.distance) * GAME.metersToPixels,
    angle: Math.max(
      -0.48,
      Math.min(0.48, Math.atan2(dy, dx) - Math.PI / 2),
    ),
  };
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

  // Poster-style plush orange body with a darker saddle.
  const hamsterCoat = ctx.createLinearGradient(-18, -14, 15, 18);
  hamsterCoat.addColorStop(0, "#ffc45d");
  hamsterCoat.addColorStop(0.48, "#ee9236");
  hamsterCoat.addColorStop(1, "#bd5c24");
  ctx.fillStyle = hamsterCoat;
  ctx.strokeStyle = "#70401f";
  ctx.lineWidth = 2.7;
  ctx.beginPath();
  ctx.ellipse(-3, 1, 17.5, 17, -0.23, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(113,55,26,.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-8, -1, 9, -1.2, 0.35);
  ctx.moveTo(-7, -9);
  ctx.quadraticCurveTo(-2, -2, -5, 8);
  ctx.stroke();

  ctx.fillStyle = "#fff0c7";
  ctx.beginPath();
  ctx.ellipse(-2, 7, 11, 9.5, -0.12, 0, Math.PI * 2);
  ctx.fill();

  // Head leads downhill but keeps the poster's round cheeks and open expression.
  ctx.fillStyle = "#ef963a";
  ctx.strokeStyle = "#70401f";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(8, 6, 13.5, 12.5, 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  for (const [earX, earY, size] of [[1, -3, 5.4], [14, -2, 5]] as const) {
    ctx.fillStyle = "#ef963a";
    ctx.beginPath();
    ctx.arc(earX, earY, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f4a69a";
    ctx.beginPath();
    ctx.arc(earX + 0.5, earY + 0.5, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#fff1cc";
  ctx.beginPath();
  ctx.ellipse(8.7, 12, 10.2, 7.2, 0.14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.beginPath();
  ctx.ellipse(2.8, 8.8, 5.5, 5.2, 0.1, 0, Math.PI * 2);
  ctx.fill();

  drawPetEye(ctx, 3.1, 5.1, 2.35, 3, "#18150f");
  drawPetEye(ctx, 11.8, 4.8, 2.8, 3.5, "#18150f");

  ctx.fillStyle = "#dc6c6d";
  ctx.beginPath();
  ctx.arc(17.2, 11.5, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#70401f";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(14.5, 12.2);
  ctx.quadraticCurveTo(13.2, 16.5, 9.5, 15);
  ctx.moveTo(14.3, 11.5);
  ctx.lineTo(24, 8);
  ctx.moveTo(14.3, 13);
  ctx.lineTo(24, 16);
  ctx.stroke();

  ctx.fillStyle = "#ffe1a3";
  ctx.strokeStyle = "#70401f";
  ctx.lineWidth = 1.3;
  for (const [pawX, pawY] of [[4, 17], [13, 18]] as const) {
    ctx.beginPath();
    ctx.ellipse(pawX, pawY, 4.8, 3.4, 0.2, 0, Math.PI * 2);
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

  // Thick upright tail and rounded silhouette mirror Cheche on the poster.
  ctx.strokeStyle = "#6f4827";
  ctx.lineWidth = 13;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-12, 3);
  ctx.bezierCurveTo(-29, -3, -28, -25, -13, -29);
  ctx.stroke();
  ctx.strokeStyle = "#d6a356";
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

  const coat = ctx.createLinearGradient(-14, -18, 14, 20);
  coat.addColorStop(0, "#b77836");
  coat.addColorStop(0.38, "#d89f50");
  coat.addColorStop(0.72, "#efc879");
  coat.addColorStop(1, "#f7dda1");
  ctx.fillStyle = coat;
  ctx.strokeStyle = "#704729";
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.ellipse(-3, 2, 20, 17.5, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#fff0c9";
  ctx.beginPath();
  ctx.ellipse(-1, 10, 12, 8, -0.15, 0, Math.PI * 2);
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

  ctx.fillStyle = "#e7b761";
  ctx.beginPath();
  ctx.ellipse(10, 8, 15.5, 14.5, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#fff0ce";
  ctx.beginPath();
  ctx.ellipse(12, 14, 10, 7, 0.15, 0, Math.PI * 2);
  ctx.fill();

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

function drawPawPrints(
  ctx: CanvasRenderingContext2D,
  model: GameModel,
  lagMeters: number,
  sideOffset: number,
  color: string,
) {
  for (let step = 1; step <= 6; step++) {
    const foot = step % 2 === 0 ? -1 : 1;
    const position = trailPosition(
      model,
      lagMeters + step * 2.15,
      sideOffset + foot * 2.8,
    );
    const alpha = Math.max(0.08, 0.32 - step * 0.035);
    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(position.angle);
    ctx.fillStyle = color.replace("ALPHA", alpha.toFixed(3));
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.6, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const toeX of [-2.5, 0, 2.5]) {
      ctx.beginPath();
      ctx.arc(toeX, -3.8, 1.05, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawCompanions(
  ctx: CanvasRenderingContext2D,
  model: GameModel,
  profile: ShopProfile,
) {
  if (profile.equippedPets.includes("pet-digger")) {
    drawPawPrints(ctx, model, 11, 20, "rgba(143,113,76,ALPHA)");
    drawHamster(
      ctx,
      trailPosition(model, 11, 20),
      model.distance * 0.72,
    );
  }
  if (profile.equippedPets.includes("pet-car")) {
    drawPawPrints(ctx, model, 19, -23, "rgba(112,91,64,ALPHA)");
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
    } else if (obstacle.type === "tree") {
      // Only the clearly marked trunk base is solid. Tree canopy overlap is visual.
      const trunkBaseY = y + 21;
      if (
        Math.abs(trunkBaseY - boardY) < GAME.treeColliderY &&
        xGap < GAME.treeColliderX
      ) {
        fatal = true;
      }
    } else {
      const rockYGap = Math.abs(y - GAME.playerY);
      const rockHit =
        rockYGap < obstacle.height * 0.3 + GAME.playerRadius * 0.65 &&
        xGap < obstacle.width * 0.25 + GAME.playerRadius * 0.7;
      if (rockHit && obstacle.type === "largeRock") {
        fatal = true;
      } else if (rockHit && !airborne) {
        obstacle.hit = true;
        model.speed = Math.max(GAME.minSpeed, model.speed - 20);
        model.lateralVelocity *= -0.45;
        model.invulnerable = GAME.rockInvulnerability;
        model.shake = 10;
        emitSnow(model, 20, 1.4);
      }
    }

    if (fatal) {
      model.status = "CRASHED";
      model.crashTime = 0;
      model.speed *= 0.25;
      model.shake = 18;
      emitSnow(model, 42, 2.1);
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
      compressor.threshold.setValueAtTime(-18, audio.currentTime);
      compressor.knee.setValueAtTime(18, audio.currentTime);
      compressor.ratio.setValueAtTime(7, audio.currentTime);
      compressor.attack.setValueAtTime(0.004, audio.currentTime);
      compressor.release.setValueAtTime(0.24, audio.currentTime);
      master.gain.setValueAtTime(0.0001, audio.currentTime);
      master.gain.exponentialRampToValueAtTime(0.24, audio.currentTime + 0.3);
      master.connect(compressor).connect(audio.destination);
      musicGainRef.current = master;

      const beat = 60 / 118 / 2;
      const melody = [0, 7, 12, 7, 3, 10, 12, 15, 12, 7, 5, 10, 3, 7, 10, 5];
      let step = 0;
      let nextTime = audio.currentTime + 0.05;

      const scheduleNote = (
        frequency: number,
        at: number,
        duration: number,
        type: OscillatorType,
        volume: number,
      ) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        oscillator.connect(gain).connect(master);
        oscillator.start(at);
        oscillator.stop(at + duration + 0.02);
      };

      const schedule = () => {
        while (nextTime < audio.currentTime + 0.28) {
          const semitone = melody[step % melody.length];
          const lead = 220 * 2 ** (semitone / 12);
          scheduleNote(lead, nextTime, beat * 0.72, "triangle", 0.12);
          if (step % 2 === 0) {
            const bassSemitone = [0, 3, 5, 7][Math.floor(step / 4) % 4];
            scheduleNote(
              82.41 * 2 ** (bassSemitone / 12),
              nextTime,
              beat * 1.45,
              "sine",
              0.15,
            );
          }
          if (step % 4 === 0 || step % 4 === 3) {
            scheduleNote(58, nextTime, 0.09, "square", 0.045);
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
      setLastReward(0);
      setShopOpen(false);
      ping(620, 0.12);
      if (profileRef.current.musicEnabled) startMusic();
      syncHud();
    }
  }, [ping, startMusic, syncHud]);

  const togglePause = useCallback(() => {
    const model = modelRef.current;
    if (model.status === "PLAYING") {
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
      ping(510, 0.12);
    }
  }, [ping]);

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
    document.addEventListener("visibilitychange", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
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
        const reward = rewardForDistance(model.distance);
        setLastReward(reward);
        updateProfile((current) => ({ ...current, coins: current.coins + reward }));
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
              </div>
              <div className="control-strip" aria-label="操作说明">
                <span><kbd>SPACE</kbd>换刃</span>
                <span><kbd>K / L</kbd>调速</span>
                <span><kbd>J</kbd>跳跃</span>
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
