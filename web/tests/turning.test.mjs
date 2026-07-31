import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadTurning() {
  const source = await readFile(
    new URL("../app/game/turning.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  return import(moduleUrl);
}

const {
  resolveBoardHeading,
  resolveBoundaryVelocity,
  resolveRiderBaseRotation,
  resolveTurnMotion,
} = await loadTurning();

function motion(style, overrides = {}) {
  return resolveTurnMotion({
    style,
    edge: 1,
    speed: 52,
    boardMaxSpeed: 150,
    lateralSpeed: 116,
    lateralVelocity: 0,
    fallingLeafAcceleration: 610,
    carveAcceleration: 430,
    airControl: 0.08,
    airborne: false,
    dt: 0.016,
    ...overrides,
  });
}

test("falling-leaf mode preserves the complete v17 steering formulas", () => {
  const result = motion("falling-leaf");
  const expectedTarget = 116 * (0.72 + 52 / 150);
  assert.equal(result.targetLateral, expectedTarget);
  assert.equal(result.maximumChange, 610 * 0.016);
  assert.equal(result.nextLateralVelocity, 610 * 0.016);
  assert.equal(resolveBoundaryVelocity("falling-leaf", 200, -1), -132);

  const rotation = resolveRiderBaseRotation({
    style: "falling-leaf",
    edge: -1,
    lateralVelocity: -84,
    downhillPixelsPerSecond: 48,
    carveVisualMaxAngle: 0.72,
    tuck: false,
  });
  assert.equal(rotation, -0.32 - 84 / 280);
});

test("carve mode crosses the turn apex gradually and follows actual velocity", () => {
  let lateralVelocity = 105;
  const velocities = [];
  const rotations = [];
  const boardHeadings = [];

  for (let frame = 0; frame < 72; frame++) {
    const result = motion("carve", {
      edge: -1,
      lateralVelocity,
      dt: 1 / 60,
    });
    lateralVelocity = result.nextLateralVelocity;
    velocities.push(lateralVelocity);
    rotations.push(
      resolveRiderBaseRotation({
        style: "carve",
        edge: -1,
        lateralVelocity,
        downhillPixelsPerSecond: 48,
        carveVisualMaxAngle: 0.72,
        tuck: false,
      }),
    );
    boardHeadings.push(
      resolveBoardHeading({
        style: "carve",
        fallingLeafRotation: rotations.at(-1),
        lateralVelocity,
        downhillPixelsPerSecond: 48,
      }),
    );
  }

  assert.ok(velocities[0] > 0);
  assert.ok(velocities.at(-1) < 0);
  const crossing = velocities.findIndex((velocity) => velocity <= 0);
  assert.ok(crossing > 10 && crossing < 40);
  assert.ok(boardHeadings[0] < Math.PI / 2);
  assert.ok(boardHeadings.at(-1) > Math.PI / 2);
  for (let index = 1; index < velocities.length; index++) {
    assert.ok(velocities[index] <= velocities[index - 1]);
    assert.ok(Math.abs(rotations[index] - rotations[index - 1]) < 0.13);
    assert.ok(boardHeadings[index] >= boardHeadings[index - 1]);
    assert.ok(boardHeadings[index] - boardHeadings[index - 1] < 0.13);
  }
  assert.equal(resolveBoundaryVelocity("carve", 126, -1), 0);
});

test("carve visuals do not snap when the requested edge changes", () => {
  const common = {
    style: "carve",
    lateralVelocity: 72,
    downhillPixelsPerSecond: 48,
    carveVisualMaxAngle: 0.72,
    tuck: false,
  };
  const before = resolveRiderBaseRotation({ ...common, edge: 1 });
  const afterRequest = resolveRiderBaseRotation({ ...common, edge: -1 });
  assert.equal(before, afterRequest);
  assert.ok(before > 0 && before <= 0.72);
});

test("falling-leaf rollback bypasses the oriented carve nose heading", () => {
  assert.equal(
    resolveBoardHeading({
      style: "falling-leaf",
      fallingLeafRotation: -0.46,
      lateralVelocity: 90,
      downhillPixelsPerSecond: 48,
    }),
    -0.46,
  );
});
