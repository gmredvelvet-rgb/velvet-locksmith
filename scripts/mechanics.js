export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// Same margin bands as RedVelvet Crafting; the roll changes the physical puzzle.
export function profile(total, dc, natural = 10) {
  const margin = total - dc;
  let degree = margin >= 10 ? 3 : margin >= 0 ? 2 : margin >= -9 ? 1 : 0;
  if (natural === 20) degree = Math.min(3, degree + 1);
  if (natural === 1) degree = Math.max(0, degree - 1);
  return [
    {degree: 0, tolerance: 4, durability: 0.75, picks: 2},
    {degree: 1, tolerance: 8, durability: 1, picks: 3},
    {degree: 2, tolerance: 15, durability: 1.5, picks: 4},
    {degree: 3, tolerance: 25, durability: 2, picks: 5}
  ][degree];
}

export function initialState(p) {
  return {rotation: 0, wear: 0, picks: p.picks, status: "playing"};
}

// One fixed 50 ms step. Pure and shared by the UI and GM replay.
export function step(state, angle, torque, sweet, p) {
  if (state.status !== "playing") return {...state};
  if (!Number.isFinite(angle) || angle < -90 || angle > 90 || typeof torque !== "boolean") throw Error("Invalid input.");
  const next = {...state};
  if (!torque) { next.rotation = Math.max(0, next.rotation - 5); return next; }
  const error = Math.abs(angle - sweet);
  const limit = error <= p.tolerance ? 90 : Math.max(3, 85 * (1 - (error - p.tolerance) / 100));
  next.rotation = Math.min(limit, next.rotation + 3);
  if (next.rotation >= 90) { next.status = "success"; return next; }
  if (next.rotation >= limit) next.wear += 0.05 / p.durability;
  if (next.wear >= 1) {
    next.picks--; next.wear = 0; next.rotation = 0;
    if (next.picks <= 0) next.status = "failure";
  }
  return next;
}

export function replay(trace, sweet, p) {
  if (!Array.isArray(trace) || !trace.length || trace.length > 2400) throw Error("Invalid or oversized attempt.");
  let state = initialState(p);
  for (const input of trace) {
    if (!Array.isArray(input) || input.length !== 2) throw Error("Invalid input.");
    if (state.status !== "playing") throw Error("Inputs after the result.");
    state = step(state, input[0], input[1], sweet, p);
  }
  return state;
}
