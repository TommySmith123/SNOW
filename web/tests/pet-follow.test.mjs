import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadResolver() {
  const source = await readFile(
    new URL("../app/game/pet-follow.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  return (await import(moduleUrl)).resolvePetTrailPosition;
}

const resolvePetTrailPosition = await loadResolver();

function resolve(overrides = {}) {
  return resolvePetTrailPosition({
    currentDistance: 60,
    playerX: 270,
    playerY: 690,
    metersToPixels: 4.2,
    lagMeters: 11,
    sideOffset: 20,
    marks: [],
    targetTrackCenter: 270,
    targetTrackHalfWidth: 240,
    maxConnectedGap: 2.8,
    viewportMinX: 38,
    viewportMaxX: 502,
    followEnvelope: 94,
    ...overrides,
  });
}

function assertSafe(position, playerX, envelope, lagMeters) {
  assert.ok(position.x >= 38 && position.x <= 502);
  assert.ok(Math.abs(position.x - playerX) <= envelope + 0.001);
  assert.equal(position.y, 690 - lagMeters * 4.2);
}

test("insufficient and cleaned history keep pets in their safe starting slots", () => {
  const starting = resolve({
    currentDistance: 0,
    playerX: 270,
    lagMeters: 11,
    marks: [],
  });
  assert.equal(starting.mode, "insufficient");
  assert.equal(starting.historyReady, false);
  assertSafe(starting, 270, 94, 11);

  const cleaned = resolve({
    currentDistance: 105,
    playerX: 300,
    lagMeters: 19,
    sideOffset: -23,
    followEnvelope: 95.5,
    marks: [
      { distance: 100, x: 292 },
      { distance: 101, x: 296 },
    ],
  });
  assert.equal(cleaned.mode, "before-history");
  assert.equal(cleaned.historyReady, false);
  assertSafe(cleaned, 300, 95.5, 19);
});

test("normal and accelerated jumps hold the newest sample instead of marks[0]", () => {
  const marks = [
    { distance: 0, x: 42 },
    { distance: 38.8, x: 254 },
    { distance: 40, x: 262 },
  ];

  for (const currentDistance of [61, 78, 96]) {
    for (const pet of [
      { lagMeters: 11, sideOffset: 20, followEnvelope: 94 },
      { lagMeters: 19, sideOffset: -23, followEnvelope: 95.5 },
    ]) {
      const position = resolve({
        currentDistance,
        playerX: 286,
        marks,
        ...pet,
      });
      assert.equal(position.mode, "latest-hold");
      assert.equal(position.historyReady, false);
      assert.ok(position.x > 150, "pet must never snap back to the old left edge");
      assertSafe(position, 286, pet.followEnvelope, pet.lagMeters);
    }
  }
});

test("jump landing gaps use a smooth bounded bridge without drawing pet trails", () => {
  const marks = [
    { distance: 8, x: 248 },
    { distance: 10, x: 260 },
    { distance: 25, x: 410 },
    { distance: 26, x: 415 },
  ];
  let previousX = null;

  for (
    let targetDistance = 10.25;
    targetDistance < 25;
    targetDistance += 0.25
  ) {
    const position = resolve({
      currentDistance: targetDistance + 11,
      playerX: 410,
      lagMeters: 11,
      sideOffset: 20,
      marks,
    });
    assert.equal(position.mode, "gap-bridge");
    assert.equal(position.historyReady, false);
    assertSafe(position, 410, 94, 11);
    if (previousX !== null) {
      assert.ok(
        Math.abs(position.x - previousX) <= 8,
        "synthetic landing bridge must not teleport laterally",
      );
    }
    previousX = position.x;
  }
});

test("rapid edge changes keep both pet slots bounded with stable vertical lag", () => {
  const marks = Array.from({ length: 40 }, (_, index) => ({
    distance: index * 0.8,
    x: 270 + Math.sin(index * 0.86) * 58,
  }));

  for (let currentDistance = 20; currentDistance <= 45; currentDistance += 0.5) {
    for (const pet of [
      { lagMeters: 11, sideOffset: 20, followEnvelope: 94 },
      { lagMeters: 19, sideOffset: -23, followEnvelope: 95.5 },
    ]) {
      const position = resolve({
        currentDistance,
        playerX: 270 + Math.sin(currentDistance * 0.4) * 22,
        marks,
        ...pet,
      });
      assert.ok(position.angle >= -0.48 && position.angle <= 0.48);
      assertSafe(
        position,
        270 + Math.sin(currentDistance * 0.4) * 22,
        pet.followEnvelope,
        pet.lagMeters,
      );
      if (position.mode !== "connected") {
        assert.equal(position.historyReady, false);
      }
    }
  }
});
