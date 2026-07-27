"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GAME,
  type GameModel,
  type GameStatus,
  type InputState,
  type Obstacle,
  type PlayerStance,
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
}

function drawBoarder(ctx: CanvasRenderingContext2D, model: GameModel) {
  const air = jumpHeight(model);
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
  ctx.strokeStyle = "#071b2b";
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
  ctx.fillStyle = "#15191d";
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
  ctx.fillStyle = "#111519";
  ctx.strokeStyle = "#07090c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(tuck ? model.edge * 4 : 0, tuck ? -31 : -41, 13, Math.PI, Math.PI * 2);
  ctx.lineTo(13, tuck ? -27 : -37);
  ctx.lineTo(-13, tuck ? -27 : -37);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#4d5255";
  ctx.beginPath();
  roundedRect(ctx, -12, tuck ? -42 : -52, 24, 10, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#91a9df";
  for (const [dotX, dotY] of [[-7, -48], [0, -45], [7, -49]]) {
    ctx.beginPath();
    ctx.arc(dotX, dotY + (tuck ? 10 : 0), 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // A conventional snowboard: solid deck, metal edge and two bindings.
  ctx.strokeStyle = "#071b2b";
  ctx.fillStyle = "#e34a38";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(brake ? -38 : -32, 24);
  ctx.quadraticCurveTo(brake ? -42 : -36, 28, brake ? -35 : -29, 31);
  ctx.lineTo(brake ? 35 : 30, 31);
  ctx.quadraticCurveTo(brake ? 42 : 36, 28, brake ? 38 : 33, 24);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,.72)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(brake ? -34 : -29, 28);
  ctx.lineTo(brake ? 34 : 30, 28);
  ctx.stroke();

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
  const perpendicularY = dx / length;

  return {
    x: baseX + perpendicularX * sideOffset,
    y:
      GAME.playerY +
      (baseDistance - model.distance) * GAME.metersToPixels +
      perpendicularY * sideOffset,
    angle: Math.atan2(dy, dx) - Math.PI / 2,
  };
}

function drawHamster(
  ctx: CanvasRenderingContext2D,
  position: ReturnType<typeof trailPosition>,
  phase: number,
) {
  const hop = (Math.sin(phase) + 1) * 0.65;
  ctx.save();
  ctx.translate(position.x, position.y - hop);
  ctx.rotate(position.angle);

  ctx.fillStyle = "rgba(7, 49, 61, .2)";
  ctx.beginPath();
  ctx.ellipse(0, 18 + hop, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Round ears with pink centres immediately read as a hamster silhouette.
  ctx.fillStyle = "#d87429";
  ctx.strokeStyle = "#6f351d";
  ctx.lineWidth = 2.4;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * 10, -10, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f0a08f";
    ctx.beginPath();
    ctx.arc(side * 10, -10, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d87429";
  }

  const hamsterCoat = ctx.createLinearGradient(-13, -15, 12, 15);
  hamsterCoat.addColorStop(0, "#f7a13a");
  hamsterCoat.addColorStop(0.56, "#db7729");
  hamsterCoat.addColorStop(1, "#aa4e20");
  ctx.fillStyle = hamsterCoat;
  ctx.strokeStyle = "#6f351d";
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.ellipse(0, 2, 16, 19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffe1ad";
  ctx.beginPath();
  ctx.ellipse(0, 7, 11, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff9ec";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 8.5, 3, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#071b2b";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * 5.5, -2, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(side * 4.8, -2.8, 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#071b2b";
  }
  ctx.fillStyle = "#ef7c72";
  ctx.beginPath();
  ctx.arc(0, 4, 2.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#75472d";
  ctx.lineWidth = 1.2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 4, 5);
    ctx.lineTo(side * 17, 2);
    ctx.moveTo(side * 4, 7);
    ctx.lineTo(side * 17, 9);
    ctx.stroke();
  }

  // Tiny pale paws finish the orange-hamster read.
  ctx.fillStyle = "#ffe1ad";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 7, 15, 4, 3, side * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBlueGoldenCat(
  ctx: CanvasRenderingContext2D,
  position: ReturnType<typeof trailPosition>,
  phase: number,
) {
  const hop = (Math.sin(phase) + 1) * 0.5;
  ctx.save();
  ctx.translate(position.x, position.y - hop);
  ctx.rotate(position.angle);

  ctx.fillStyle = "rgba(7, 49, 61, .2)";
  ctx.beginPath();
  ctx.ellipse(0, 23 + hop, 19, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Full fluffy tail and triangular ears make the pet unmistakably feline.
  ctx.strokeStyle = "#6d7f95";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(9, 9);
  ctx.bezierCurveTo(29, 3, 27, -20, 13, -17);
  ctx.stroke();
  ctx.strokeStyle = "#d2a55f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(17, -12);
  ctx.lineTo(23, -7);
  ctx.stroke();

  const coat = ctx.createLinearGradient(-14, -18, 14, 20);
  coat.addColorStop(0, "#596d84");
  coat.addColorStop(0.48, "#8fa0af");
  coat.addColorStop(0.7, "#c9a66b");
  coat.addColorStop(1, "#e5bd75");
  ctx.fillStyle = coat;
  ctx.strokeStyle = "#2e3e4d";
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.ellipse(0, 4, 16, 21, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#65798f";
  ctx.strokeStyle = "#2e3e4d";
  ctx.beginPath();
  ctx.moveTo(-13, -7);
  ctx.lineTo(-10, -23);
  ctx.lineTo(-2, -11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(13, -7);
  ctx.lineTo(10, -23);
  ctx.lineTo(2, -11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#e3bc78";
  ctx.beginPath();
  ctx.ellipse(0, -3, 14, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#f5dfb7";
  ctx.beginPath();
  ctx.ellipse(0, 3, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#8bca58";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 5, -4, 2.5, 3.2, side * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#15212b";
    ctx.beginPath();
    ctx.ellipse(side * 5, -4, 0.8, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8bca58";
  }
  ctx.fillStyle = "#9c5c61";
  ctx.beginPath();
  ctx.moveTo(-2.5, 2);
  ctx.lineTo(2.5, 2);
  ctx.lineTo(0, 5);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#506378";
  ctx.lineWidth = 2;
  for (const stripeX of [-6, 0, 6]) {
    ctx.beginPath();
    ctx.moveTo(stripeX, -14);
    ctx.lineTo(stripeX * 0.7, -8);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(49, 67, 84, .82)";
  ctx.lineWidth = 1.5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 4, 4);
    ctx.lineTo(side * 16, 1);
    ctx.moveTo(side * 4, 6);
    ctx.lineTo(side * 16, 8);
    ctx.stroke();
  }

  ctx.fillStyle = "#d9af6d";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 8, 19, 6, 4, side * 0.1, 0, Math.PI * 2);
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

function drawCompanions(ctx: CanvasRenderingContext2D, model: GameModel) {
  drawPawPrints(ctx, model, 11, 20, "rgba(118,145,151,ALPHA)");
  drawPawPrints(ctx, model, 19, -23, "rgba(87,117,132,ALPHA)");
  drawHamster(
    ctx,
    trailPosition(model, 11, 20),
    model.distance * 0.72,
  );
  drawBlueGoldenCat(
    ctx,
    trailPosition(model, 19, -23),
    model.distance * 0.58 + 1.7,
  );
}

function render(ctx: CanvasRenderingContext2D, model: GameModel) {
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
  drawCompanions(ctx, model);

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
  drawBoarder(ctx, model);

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
  const boardY = GAME.playerY + 23;

  for (const obstacle of model.obstacles) {
    if (obstacle.hit) continue;
    const { x, y } = obstacleScreenPosition(model, obstacle);
    const xGap = Math.abs(x - model.playerX);
    let fatal = false;

    if (obstacle.type === "crevasse") {
      const crackHalf = trackWidth(obstacle.distance) * obstacle.width * 0.5;
      const yGap = Math.abs(y - GAME.playerY);
      if (
        yGap < obstacle.height * 0.52 + GAME.playerRadius &&
        Math.abs(model.playerX - trackCenter(obstacle.distance)) < crackHalf &&
        !airborne
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
    model.speed += GAME.acceleration * dt;
  } else {
    if (model.stanceHold <= 0) model.stance = "coast";
    const direction = Math.sign(GAME.cruiseSpeed - model.speed);
    model.speed += direction * GAME.cruiseReturn * dt;
  }
  const dynamicMax = 108 + difficulty(model.distance) * (GAME.maxSpeed - 108);
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
    (0.72 + model.speed / GAME.maxSpeed) *
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
    let lastMark = model.trackMarks.at(-1);

    if (
      !lastMark ||
      contact.distance - lastMark.distance > GAME.trackSampleMeters * 2.8
    ) {
      // Start a fresh segment after take-off instead of drawing across the air.
      model.trackMarks.push({ ...contact, strength });
      lastMark = model.trackMarks.at(-1);
    } else {
      let remaining = contact.distance - lastMark.distance;
      while (remaining >= GAME.trackSampleMeters) {
        const progress = GAME.trackSampleMeters / Math.max(remaining, 0.001);
        const nextMark = {
          distance: lastMark.distance + GAME.trackSampleMeters,
          x: lastMark.x + (contact.x - lastMark.x) * progress,
          strength,
        };
        model.trackMarks.push(nextMark);
        lastMark = nextMark;
        remaining = contact.distance - lastMark.distance;
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

  const ping = useCallback((frequency: number, duration = 0.08, volume = 0.045) => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) return;
      const audio = audioRef.current ?? new AudioContextClass();
      audioRef.current = audio;
      if (audio.state === "suspended") void audio.resume();
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
  }, []);

  return ping;
}

export function SnowGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [initialModel] = useState(() => createGame());
  const modelRef = useRef<GameModel>(initialModel);
  const inputRef = useRef<InputState>({ accelerate: false, brake: false });
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const hudTimeRef = useRef(0);
  const ping = useAudio();
  const [hud, setHud] = useState<HudState>(() => hudFrom(initialModel));

  const syncHud = useCallback(() => {
    setHud(hudFrom(modelRef.current));
  }, []);

  const start = useCallback(() => {
    const model = modelRef.current;
    if (model.status === "START" || model.status === "GAME_OVER") {
      resetRun(model);
      ping(620, 0.12);
      syncHud();
    }
  }, [ping, syncHud]);

  const togglePause = useCallback(() => {
    const model = modelRef.current;
    if (model.status === "PLAYING") {
      model.status = "PAUSED";
      ping(240, 0.08);
    } else if (model.status === "PAUSED") {
      model.status = "PLAYING";
      lastTimeRef.current = performance.now();
      ping(420, 0.08);
    }
    syncHud();
  }, [ping, syncHud]);

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

  useEffect(() => {
    modelRef.current.best = safeBest();
    syncHud();
  }, [syncHud]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
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
  }, [jump, start, syncHud, toggleEdge, togglePause]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const frame = (time: number) => {
      const rawDt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0;
      const dt = Math.min(0.034, Math.max(0, rawDt));
      lastTimeRef.current = time;
      update(modelRef.current, inputRef.current, dt, () => ping(170, 0.07, 0.03));
      render(ctx, modelRef.current);
      if (time - hudTimeRef.current > 90) {
        hudTimeRef.current = time;
        setHud(hudFrom(modelRef.current));
      }
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ping]);

  const speedPercent =
    ((hud.speed - GAME.minSpeed) / (GAME.maxSpeed - GAME.minSpeed)) * 100;
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
              <button className="primary-button" type="button" onClick={start}>
                开始滑行 · ENTER
              </button>
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
              <button className="primary-button" type="button" onClick={start}>
                再滑一次 · ENTER
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
