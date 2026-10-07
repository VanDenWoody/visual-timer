// Pure geometry for a 60-minute dial. Angles are degrees, 0 at 12 o'clock, clockwise.

export const MAX_MINUTES = 60;
const DEG_PER_MINUTE = 360 / MAX_MINUTES;

// Three decimals keeps path strings short and stable; -0 prints as 0.
function fmt(n) {
  const rounded = Math.round(n * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function minutesToAngle(minutes) {
  return minutes * DEG_PER_MINUTE;
}

export function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

export function pointToMinutes(x, y, cx, cy) {
  const deg = (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
  const minutes = Math.round(((deg + 360) % 360) / DEG_PER_MINUTE);
  return minutes === 0 ? MAX_MINUTES : minutes;
}

// While dragging, a jump across the 0/60 seam means the pointer went past an end:
// hold the end instead of wrapping to the other side of the dial.
export function snapWithSeam(prev, raw) {
  if (prev >= 45 && raw <= 15) return MAX_MINUTES;
  if (prev <= 15 && raw >= 45) return 1;
  return raw;
}

export function sectorPath(cx, cy, r, fraction) {
  if (!(fraction > 0)) return "";
  const R = fmt(r);
  if (fraction >= 1) {
    // One arc cannot draw 360 degrees, so a full disc is two half arcs.
    return `M ${fmt(cx)} ${fmt(cy - r)} A ${R} ${R} 0 1 1 ${fmt(cx)} ${fmt(cy + r)} A ${R} ${R} 0 1 1 ${fmt(cx)} ${fmt(cy - r)} Z`;
  }
  const end = polar(cx, cy, r, fraction * 360);
  const largeArc = fraction > 0.5 ? 1 : 0;
  return `M ${fmt(cx)} ${fmt(cy)} L ${fmt(cx)} ${fmt(cy - r)} A ${R} ${R} 0 ${largeArc} 1 ${fmt(end.x)} ${fmt(end.y)} Z`;
}
