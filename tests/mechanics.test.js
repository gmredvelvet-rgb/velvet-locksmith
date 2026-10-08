import {test} from "node:test";
import assert from "node:assert/strict";
import {profile, initialState, step, replay} from "../scripts/mechanics.js";

test("crafting margin bands make good rolls more forgiving", () => {
  const profiles = [9, 11, 20, 30].map(total => profile(total, 20));
  assert.deepEqual(profiles.map(p => p.tolerance), [4, 8, 15, 25]);
  assert.deepEqual(profiles.map(p => p.picks), [2, 3, 4, 5]);
  assert.equal(profile(19, 20, 20).degree, 2);
  assert.equal(profile(20, 20, 1).degree, 1);
});
test("right angle opens through sustained torque; release removes rotation", () => {
  const p = profile(20, 20), trace = Array.from({length: 30}, () => [42, true]);
  const result = replay(trace, 42, p);
  assert.equal(result.status, "success");
  assert.equal(result.wear, 0);
  assert.equal(result.picks, 4);
  assert.equal(step({...initialState(p), rotation: 20}, 0, false, 42, p).rotation, 15);
});
test("forcing a wrong angle breaks picks and eventually fails", () => {
  const p = profile(0, 20);
  let state = initialState(p), trace = [];
  while (state.status === "playing") {trace.push([-90, true]); state = step(state, -90, true, 70, p);}
  assert.equal(state.status, "failure");
  assert.equal(state.picks, 0);
  assert.deepEqual(replay(trace, 70, p), state);
});
test("server replay rejects invalid, oversized and post-result inputs", () => {
  const p = profile(20, 20);
  for (const trace of [[], [[NaN, true]], [[91, true]], [[0, 1]], Array(2401).fill([0, false]), Array(31).fill([0, true])]) assert.throws(() => replay(trace, 0, p));
});
