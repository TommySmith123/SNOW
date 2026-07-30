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
