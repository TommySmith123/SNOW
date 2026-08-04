import type { TurnStyle } from "./config";

export type TurnMotionInput = {
  style: TurnStyle;
  edge: -1 | 1;
  speed: number;
  boardMaxSpeed: number;
  lateralSpeed: number;
  lateralVelocity: number;
  fallingLeafAcceleration: number;
  carveAcceleration: number;
  airControl: number;
  airborne: boolean;
  dt: number;
};

export type RiderRotationInput = {
  style: TurnStyle;
  edge: -1 | 1;
  lateralVelocity: number;
  downhillPixelsPerSecond: number;
  carveVisualMaxAngle: number;
  tuck: boolean;
};

export type BoardHeadingInput = {
  style: TurnStyle;
  fallingLeafRotation: number;
  lateralVelocity: number;
  downhillPixelsPerSecond: number;
  stationaryEdge?: -1 | 0 | 1;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function resolveTurnMotion(input: TurnMotionInput) {
  const targetLateral =
    input.edge *
    input.lateralSpeed *
    (0.72 + input.speed / input.boardMaxSpeed) *
    (input.airborne ? input.airControl : 1);

  // The falling-leaf branch deliberately preserves the exact v17 response.
  const acceleration =
    input.style === "carve"
      ? input.carveAcceleration
      : input.fallingLeafAcceleration;
  const maximumChange = acceleration * input.dt * (input.airborne ? 0.12 : 1);
  const delta = targetLateral - input.lateralVelocity;

  return {
    targetLateral,
    maximumChange,
    nextLateralVelocity:
      input.lateralVelocity +
      clamp(delta, -maximumChange, maximumChange),
  };
}

export function resolveBoundaryVelocity(
  style: TurnStyle,
  currentVelocity: number,
  inward: -1 | 1,
) {
  if (style === "carve") {
    // Let the regular carving response build the inward arc from its apex.
    return 0;
  }

  // Exact v17 falling-leaf boundary rebound, retained for one-line rollback.
  return (
    inward *
    Math.max(76, Math.min(132, Math.abs(currentVelocity) * 0.72))
  );
}

export function resolveRiderBaseRotation(input: RiderRotationInput) {
  if (input.style === "falling-leaf") {
    const lean = clamp(input.lateralVelocity / 280, -0.5, 0.5);
    return (
      (input.edge * 0.32 + lean) *
      (input.tuck ? 0.68 : 1)
    );
  }

  // Follow the actual velocity vector, not the newly requested edge. This
  // makes the board sweep continuously through the apex of each C-shaped turn.
  const travelAngle =
    Math.atan2(
      input.lateralVelocity,
      Math.max(18, input.downhillPixelsPerSecond),
    ) * 0.68;
  return (
    clamp(
      travelAngle,
      -input.carveVisualMaxAngle,
      input.carveVisualMaxAngle,
    ) * (input.tuck ? 0.84 : 1)
  );
}

export function resolveBoardHeading(input: BoardHeadingInput) {
  if (input.style === "falling-leaf") {
    return input.fallingLeafRotation;
  }

  // The snowboard's local +X end is its fixed nose. atan2() keeps that same
  // nose pointed along a continuous 0..PI C-shaped heading: right/down,
  // straight down through the apex, then left/down.
  const projectedDownhill =
    Math.max(18, input.downhillPixelsPerSecond) * 1.55;
  if (
    input.stationaryEdge &&
    Math.abs(input.lateralVelocity) < 1
  ) {
    return Math.atan2(
      projectedDownhill,
      input.stationaryEdge * projectedDownhill * 1.5,
    );
  }
  return Math.atan2(projectedDownhill, input.lateralVelocity);
}

export function resolveFaceBlend(
  style: TurnStyle,
  lateralVelocity: number,
  edge: -1 | 1,
) {
  return style === "carve"
    ? clamp(lateralVelocity / 72, -1, 1)
    : edge;
}

export function resolveCarveView(
  style: TurnStyle,
  lateralVelocity: number,
  edge: -1 | 1,
) {
  const turnBlend = resolveFaceBlend(style, lateralVelocity, edge);
  if (style !== "carve") {
    return {
      turnBlend,
      bodyYaw: 0,
      facingCosine: 1,
      frontAmount: 1,
      sideAmount: 0,
      backAmount: 0,
      bodyWidthScale: 1,
      headWidthScale: 1,
      torsoOffsetX: 0,
      depthShear: 0,
    };
  }

  // Treat the rider as one continuous volume rotating around a vertical axis.
  // Trigonometric weights remove the linear front/side/back hinge at the apex.
  const bodyYaw = (1 - turnBlend) * (Math.PI / 2);
  const rawFacingCosine = Math.cos(bodyYaw);
  const rawSideAmount = Math.sin(bodyYaw);
  const facingCosine = Math.abs(rawFacingCosine) < 1e-9
    ? 0
    : rawFacingCosine;
  const sideAmount = Math.abs(rawSideAmount) < 1e-9
    ? 0
    : rawSideAmount;
  const facingAmount = Math.abs(facingCosine);

  return {
    turnBlend,
    bodyYaw,
    facingCosine,
    frontAmount: Math.max(0, facingCosine),
    sideAmount,
    backAmount: Math.max(0, -facingCosine),
    bodyWidthScale: 0.62 + facingAmount * 0.38,
    headWidthScale: 0.7 + facingAmount * 0.3,
    torsoOffsetX: sideAmount * 2.8,
    depthShear: sideAmount * 0.18,
  };
}

export function resolveCarveUpperBodyProjection(
  view: ReturnType<typeof resolveCarveView>,
  tuck: boolean,
) {
  const shoulderY = tuck ? -13 : -18;
  const leftShoulder = {
    x: view.torsoOffsetX + view.facingCosine * 10,
    y: shoulderY + view.sideAmount * 3.2,
  };
  const rightShoulder = {
    x: view.torsoOffsetX - view.facingCosine * 10,
    y: shoulderY - view.sideAmount * 3.2,
  };
  const leftHand = {
    x: view.torsoOffsetX + view.facingCosine * 5 + view.sideAmount * 2.2,
    y: (tuck ? 4 : 7) + view.sideAmount * 1.7,
  };
  const rightHand = {
    x: view.torsoOffsetX - view.facingCosine * 5 - view.sideAmount * 1.2,
    y: (tuck ? 3 : 6) - view.sideAmount * 1.5,
  };

  return {
    leftShoulder,
    rightShoulder,
    leftHand,
    rightHand,
    leftElbow: {
      x: (leftShoulder.x + leftHand.x) / 2 + 3 * view.facingCosine,
      y: (leftShoulder.y + leftHand.y) / 2,
    },
    rightElbow: {
      x: (rightShoulder.x + rightHand.x) / 2 - 3 * view.facingCosine,
      y: (rightShoulder.y + rightHand.y) / 2,
    },
  };
}

export function resolveCarveBindingProjection(
  boardRelativeTurn: number,
  pivotY = 27.5,
) {
  const cosine = Math.cos(boardRelativeTurn);
  const sine = Math.sin(boardRelativeTurn);
  const bindingOffsetY = -1.5;

  const rotateBinding = (longitudinalOffset: number) => ({
    x: longitudinalOffset * cosine - bindingOffsetY * sine,
    y:
      pivotY +
      longitudinalOffset * sine +
      bindingOffsetY * cosine,
  });

  return {
    // The board's local +X end is the fixed nose. The protagonist rides
    // regular: anatomical left foot at the nose, right foot at the tail.
    left: rotateBinding(14),
    right: rotateBinding(-14),
  };
}

type BindingPoint = { x: number; y: number };

export function resolveBodyLocalBindings(
  left: BindingPoint,
  right: BindingPoint,
  bodyRotation: number,
  pivotY = 27.5,
) {
  const inverseRotation = -bodyRotation;
  const cosine = Math.cos(inverseRotation);
  const sine = Math.sin(inverseRotation);
  const intoBodySpace = (binding: BindingPoint) => {
    const dy = binding.y - pivotY;
    return {
      x: binding.x * cosine - dy * sine,
      y: pivotY + binding.x * sine + dy * cosine,
    };
  };

  // Only change coordinate systems. Never exchange the anatomical feet:
  // left remains on the nose binding and right remains on the tail binding.
  return {
    left: intoBodySpace(left),
    right: intoBodySpace(right),
  };
}
