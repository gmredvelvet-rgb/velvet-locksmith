import {test} from "node:test";
import assert from "node:assert/strict";
import {profile} from "../scripts/mechanics.js";

test("minigame respects ApplicationV2's read-only state during construction and play", async () => {
  globalThis.foundry = {applications: {api: {ApplicationV2: class {
    get state() {return 2;}
    async close() {}
  }}}};
  const {LockGame} = await import("../scripts/minigame.js");
  const game = new LockGame({p: profile(20, 20), sweet: 0});
  assert.equal(game.state, 2);
  assert.equal(game.puzzleState.status, "playing");
  game.paint = () => {};
  game.status = () => {};
  let finishes = 0;
  game.finish = () => {finishes++; game.ended = true;};
  game.torque = true;
  for (let i = 0; i < 30; i++) game.tick();
  assert.equal(game.puzzleState.status, "success");
  assert.equal(game.state, 2);
  assert.equal(finishes, 1);
  assert.equal(game.trace.length, 30);
});

test("closing during GM verification does not cancel the submitted result or touch detached UI", async () => {
  let settle;
  const messages = [];
  const {LockGame} = await import("../scripts/minigame.js");
  globalThis.Hooks = {callAll() {}};
  const game = new LockGame({sessionId: "session", p: profile(20, 20), sweet: 0}, {
    send: (action) => {messages.push(action); return new Promise(resolve => {settle = resolve;});}
  });
  const finishing = game.finish();
  assert.equal(game.visualPhase, "verifying");
  await game.close();
  settle({status: "success"}); await finishing;
  assert.deepEqual(messages, ["finish"]);
  assert.equal(game.disposed, true);
  assert.equal(game.finished, true);
  assert.equal(game.visualPhase, "verifying");
});

test("cancel is sent once and closed games stop producing inputs", async () => {
  const messages = [];
  const {LockGame} = await import("../scripts/minigame.js");
  const game = new LockGame({sessionId: "session", p: profile(20, 20)}, {send: async action => {messages.push(action);}});
  await game.close(); await game.close(); game.tick();
  assert.deepEqual(messages, ["cancel"]);
  assert.equal(game.trace.length, 0);
  assert.equal(game.abort.signal.aborted, true);
});

test("manual dragging clamps angles and visual smoothing settles independently of simulation", async () => {
  const {LockGame} = await import("../scripts/minigame.js");
  const game = new LockGame({p: profile(20, 20)});
  const node = () => ({setAttribute() {}, classList: {toggle() {}}});
  game.nodes = {lock: {...node(), getBoundingClientRect: () => ({left: 0, top: 0, width: 400, height: 450})}, pick: node(), cylinder: node(), tension: node(), turn: node(), angle: {}, "angle-value": {}};
  game.movePick({clientX: 400, clientY: 232}); assert.equal(game.angle, 90);
  game.movePick({clientX: 200, clientY: 0}); assert.equal(game.angle, 0);
  game.angle = 60; game.lastFrame = 1;
  game.paint(17);
  assert.ok(game.displayAngle > 0 && game.displayAngle < 60);
  game.reducedMotion = true; game.paint(33);
  assert.equal(game.displayAngle, 60);
  assert.equal(game.trace.length, 0);
});
