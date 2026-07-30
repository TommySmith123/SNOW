export type PetTrailMode =
  | "insufficient"
  | "before-history"
  | "latest-hold"
  | "connected"
  | "gap-bridge";

export type PetTrailMark = {
  distance: number;
  x: number;
};

export type PetTrailPosition = {
  x: number;
  y: number;
  angle: number;
  historyReady: boolean;
  mode: PetTrailMode;
};

export type PetTrailInput = {
  currentDistance: number;
  playerX: number;
  playerY: number;
  metersToPixels: number;
  lagMeters: number;
  sideOffset: number;
  marks: readonly PetTrailMark[];
  targetTrackCenter: number;
  targetTrackHalfWidth: number;
  maxConnectedGap: number;
  viewportMinX: number;
  viewportMaxX: number;
  followEnvelope: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function isConnected(
  first: PetTrailMark,
  second: PetTrailMark,
  maxConnectedGap: number,
) {
  const gap = second.distance - first.distance;
  return gap > 0 && gap <= maxConnectedGap;
}

function tangentForSegment(
  marks: readonly PetTrailMark[],
  leftIndex: number,
  rightIndex: number,
  maxConnectedGap: number,
  metersToPixels: number,
) {
  let startIndex = leftIndex;
  let endIndex = rightIndex;

  if (
    startIndex > 0 &&
    isConnected(marks[startIndex - 1], marks[startIndex], maxConnectedGap)
  ) {
    startIndex -= 1;
  }
  if (
    endIndex + 1 < marks.length &&
    isConnected(marks[endIndex], marks[endIndex + 1], maxConnectedGap)
  ) {
    endIndex += 1;
  }

  const start = marks[startIndex];
  const end = marks[endIndex];
  const dx = end.x - start.x;
  const dy = (end.distance - start.distance) * metersToPixels;
  const length = Math.max(1, Math.hypot(dx, dy));
  return {
    perpendicularX: -dy / length,
    angle: clamp(Math.atan2(dy, dx) - Math.PI / 2, -0.48, 0.48),
  };
}

export function resolvePetTrailPosition(
  input: PetTrailInput,
): PetTrailPosition {
  const targetDistance = input.currentDistance - input.lagMeters;
  const fixedY =
    input.playerY - input.lagMeters * input.metersToPixels;
  const interiorHalfWidth = Math.max(24, input.targetTrackHalfWidth - 42);
  const trackMinimum = Math.max(
    input.viewportMinX,
    input.targetTrackCenter - interiorHalfWidth,
  );
  const trackMaximum = Math.min(
    input.viewportMaxX,
    input.targetTrackCenter + interiorHalfWidth,
  );

  const safeX = (rawX: number) => {
    const riderMinimum = Math.max(
      input.viewportMinX,
      input.playerX - input.followEnvelope,
    );
    const riderMaximum = Math.min(
      input.viewportMaxX,
      input.playerX + input.followEnvelope,
    );
    const safeMinimum = Math.max(riderMinimum, trackMinimum);
    const safeMaximum = Math.min(riderMaximum, trackMaximum);

    // The rider and historical track normally overlap. If an exceptionally
    // sharp jump moves them apart, prefer staying near the rider over snapping
    // to an old track boundary; the next grounded samples reconnect smoothly.
    return safeMinimum <= safeMaximum
      ? clamp(rawX, safeMinimum, safeMaximum)
      : clamp(rawX, riderMinimum, riderMaximum);
  };

  const makePosition = (
    rawX: number,
    angle: number,
    historyReady: boolean,
    mode: PetTrailMode,
  ): PetTrailPosition => ({
    x: safeX(rawX),
    y: fixedY,
    angle,
    historyReady,
    mode,
  });

  const marks = input.marks;
  if (marks.length < 2) {
    const anchorX = marks.at(-1)?.x ?? input.playerX;
    return makePosition(
      anchorX - input.sideOffset,
      0,
      false,
      "insufficient",
    );
  }

  const first = marks[0];
  const latest = marks[marks.length - 1];

  if (targetDistance <= first.distance) {
    const tangent = isConnected(first, marks[1], input.maxConnectedGap)
      ? tangentForSegment(
          marks,
          0,
          1,
          input.maxConnectedGap,
          input.metersToPixels,
        )
      : { perpendicularX: -1, angle: 0 };
    return makePosition(
      first.x + tangent.perpendicularX * input.sideOffset,
      tangent.angle,
      false,
      "before-history",
    );
  }

  // This case must be checked before any <= 0 index fallback. findIndex()
  // returns -1 when a jump carries the pet target beyond the newest sample.
  if (targetDistance >= latest.distance) {
    const previous = marks[marks.length - 2];
    const tangent = isConnected(
      previous,
      latest,
      input.maxConnectedGap,
    )
      ? tangentForSegment(
          marks,
          marks.length - 2,
          marks.length - 1,
          input.maxConnectedGap,
          input.metersToPixels,
        )
      : { perpendicularX: -1, angle: 0 };
    return makePosition(
      latest.x + tangent.perpendicularX * input.sideOffset,
      tangent.angle,
      false,
      "latest-hold",
    );
  }

  const rightIndex = marks.findIndex(
    (mark) => mark.distance >= targetDistance,
  );
  const leftIndex = Math.max(0, rightIndex - 1);
  const previous = marks[leftIndex];
  const current = marks[rightIndex];
  const gap = current.distance - previous.distance;
  const progress = clamp(
    (targetDistance - previous.distance) / Math.max(gap, 0.001),
    0,
    1,
  );

  if (!isConnected(previous, current, input.maxConnectedGap)) {
    // A jump deliberately creates a break in the real board trail. Move only
    // through a bounded synthetic bridge and never expose it as pet snow history.
    const eased = progress * progress * (3 - 2 * progress);
    const bridgeX = previous.x + (current.x - previous.x) * eased;
    return makePosition(
      bridgeX - input.sideOffset,
      0,
      false,
      "gap-bridge",
    );
  }

  const tangent = tangentForSegment(
    marks,
    leftIndex,
    rightIndex,
    input.maxConnectedGap,
    input.metersToPixels,
  );
  const baseX = previous.x + (current.x - previous.x) * progress;
  return makePosition(
    baseX + tangent.perpendicularX * input.sideOffset,
    tangent.angle,
    true,
    "connected",
  );
}
