const COMPACT_PHONE_MAX_WIDTH = 680;
const FLOOR_DESIGN_WIDTH = 580;
const FLOOR_DESKTOP_DESIGN_HEIGHT = 900;
const FLOOR_PHONE_DESIGN_HEIGHT = 1180;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const getFloorLayoutScale = ({
  width,
  height,
}: {
  width: number;
  height: number;
}): number => {
  const isCompactPhone = width <= COMPACT_PHONE_MAX_WIDTH;
  const designHeight = isCompactPhone
    ? FLOOR_PHONE_DESIGN_HEIGHT
    : FLOOR_DESKTOP_DESIGN_HEIGHT;
  const minimumScale = isCompactPhone ? 0.44 : 0.62;

  return clamp(
    Math.min(width / FLOOR_DESIGN_WIDTH, height / designHeight),
    minimumScale,
    1
  );
};
