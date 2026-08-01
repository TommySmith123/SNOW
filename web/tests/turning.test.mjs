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
  resolveBodyLocalBindings,
  resolveBoundaryVelocity,
  resolveCarveBindingProjection,
  resolveCarveView,
  resolveFaceBlend,
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

test("stationary preview is diagonal while a real carve apex stays vertical", () => {
  const preview = resolveBoardHeading({
    style: "carve",
    fallingLeafRotation: 0,
    lateralVelocity: 0,
    downhillPixelsPerSecond: 48,
    stationaryEdge: 1,
  });
  const realApex = resolveBoardHeading({
    style: "carve",
    fallingLeafRotation: 0,
    lateralVelocity: 0,
    downhillPixelsPerSecond: 48,
    stationaryEdge: 0,
  });
  assert.ok(preview > 0.4 && preview < Math.PI / 2);
  assert.equal(realApex, Math.PI / 2);
});

test("carve face blend moves continuously through a centered face", () => {
  assert.equal(resolveFaceBlend("carve", 72, 1), 1);
  assert.equal(resolveFaceBlend("carve", 36, 1), 0.5);
  assert.equal(resolveFaceBlend("carve", 0, -1), 0);
  assert.equal(resolveFaceBlend("carve", -36, -1), -0.5);
  assert.equal(resolveFaceBlend("carve", -72, -1), -1);
  assert.equal(resolveFaceBlend("falling-leaf", 0, -1), -1);
});

test("fixed carve stance progresses from front through side to back", () => {
  assert.deepEqual(resolveCarveView("carve", 72, 1), {
    turnBlend: 1,
    frontAmount: 1,
    sideAmount: 0,
    backAmount: 0,
    bodyWidthScale: 1,
  });
  assert.deepEqual(resolveCarveView("carve", 0, -1), {
    turnBlend: 0,
    frontAmount: 0,
    sideAmount: 1,
    backAmount: 0,
    bodyWidthScale: 0.62,
  });
  assert.deepEqual(resolveCarveView("carve", -72, -1), {
    turnBlend: -1,
    frontAmount: 0,
    sideAmount: 0,
    backAmount: 1,
    bodyWidthScale: 1,
  });
  assert.deepEqual(resolveCarveView("falling-leaf", 0, -1), {
    turnBlend: -1,
    frontAmount: 1,
    sideAmount: 0,
    backAmount: 0,
    bodyWidthScale: 1,
  });
});

test("carve body width narrows continuously at the side-view apex", () => {
  const views = [72, 54, 36, 18, 0, -18, -36, -54, -72]
    .map((velocity) => resolveCarveView("carve", velocity, velocity < 0 ? -1 : 1));

  for (const view of views) {
    assert.ok(Math.abs(view.frontAmount + view.sideAmount + view.backAmount - 1) < 1e-9);
    assert.ok(view.bodyWidthScale >= 0.62 && view.bodyWidthScale <= 1);
  }
  assert.deepEqual(
    views.map((view) => view.bodyWidthScale),
    [1, 0.905, 0.81, 0.715, 0.62, 0.715, 0.81, 0.905, 1],
  );
});

test("carve bindings keep the left foot on the nose and right foot on the tail", () => {
  const samples = [0, Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4, Math.PI]
    .map((angle) => resolveCarveBindingProjection(angle));

  assert.ok(Math.abs(samples[0].left.x - 14) < 1e-9);
  assert.ok(Math.abs(samples[0].right.x + 14) < 1e-9);
  assert.ok(samples[2].left.y > samples[2].right.y);
  assert.ok(Math.abs(samples[4].left.x + 14) < 1e-9);
  assert.ok(Math.abs(samples[4].right.x - 14) < 1e-9);

  const sweep = Array.from({ length: 33 }, (_, index) =>
    resolveCarveBindingProjection((Math.PI * index) / 32),
  );
  for (let index = 0; index < sweep.length; index++) {
    const angle = (Math.PI * index) / 32;
    const sine = Math.sin(angle);
    const cosine = Math.cos(angle);
    const projection = sweep[index];
    const leftLongitudinal =
      cosine * projection.left.x + sine * (projection.left.y - 27.5);
    const rightLongitudinal =
      cosine * projection.right.x + sine * (projection.right.y - 27.5);
    const leftTransverse =
      -sine * projection.left.x + cosine * (projection.left.y - 27.5);
    const rightTransverse =
      -sine * projection.right.x + cosine * (projection.right.y - 27.5);

    assert.ok(Math.abs(leftLongitudinal - 14) < 1e-9);
    assert.ok(Math.abs(rightLongitudinal + 14) < 1e-9);
    assert.ok(Math.abs(leftTransverse + 1.5) < 1e-9);
    assert.ok(Math.abs(rightTransverse + 1.5) < 1e-9);
    assert.ok(
      Math.abs(
        Math.hypot(
          projection.left.x - projection.right.x,
          projection.left.y - projection.right.y,
        ) - 28,
      ) < 1e-9,
    );
    if (index > 0) {
      assert.ok(Math.abs(projection.left.x - sweep[index - 1].left.x) < 2.1);
      assert.ok(Math.abs(projection.left.y - sweep[index - 1].left.y) < 2.1);
    }
  }
});

test("brake body transform preserves anatomical binding identities", () => {
  const bindings = resolveCarveBindingProjection(Math.PI / 3);
  const bodyLocal = resolveBodyLocalBindings(
    bindings.left,
    bindings.right,
    Math.PI,
  );
  const restoreToWorld = (point) => ({
    x: -point.x,
    y: 27.5 - (point.y - 27.5),
  });

  const restoredLeft = restoreToWorld(bodyLocal.left);
  const restoredRight = restoreToWorld(bodyLocal.right);
  assert.ok(Math.abs(restoredLeft.x - bindings.left.x) < 1e-9);
  assert.ok(Math.abs(restoredLeft.y - bindings.left.y) < 1e-9);
  assert.ok(Math.abs(restoredRight.x - bindings.right.x) < 1e-9);
  assert.ok(Math.abs(restoredRight.y - bindings.right.y) < 1e-9);
  assert.notDeepEqual(restoredLeft, bindings.right);
  assert.notDeepEqual(restoredRight, bindings.left);
});
