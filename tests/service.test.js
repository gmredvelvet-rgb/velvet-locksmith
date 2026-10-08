import {test} from "node:test";
import assert from "node:assert/strict";

test("GM validates and replays a player's success, rejects forged ownership and stale locks", async () => {
  const callbacks = new Map(), replies = [], updates = [];
  const gm = {id: "gm", active: true, isGM: true};
  const player = {id: "player", active: true, isGM: false, can: () => true};
  let flags = {enabled: true, locked: true, dc: 20, modifier: 0, openOnSuccess: true};
  const target = {uuid: "Scene.s.Wall.w", documentName: "Wall", name: "Door", ds: 2, getFlag: () => flags, setFlag: async (id, key, value) => {flags = value;}, update: async data => {updates.push(data); target.ds = data.ds;}};
  const actor = {uuid: "Actor.a", documentName: "Actor", skills: {thievery: {mod: 5}}, testUserPermission: user => user.id === player.id};
  globalThis.CONST = {WALL_DOOR_STATES: {LOCKED: 2, OPEN: 1, CLOSED: 0}};
  globalThis.game = {user: gm, users: [gm, player], system: {id: "pf2e"}, modules: new Map(), socket: {on() {}, emit(channel, data) {replies.push(data);}}};
  let sequence = 0;
  globalThis.foundry = {utils: {randomID: () => `id${++sequence}`, escapeHTML: s => s}};
  globalThis.Hooks = {on: (name, cb) => callbacks.set(name, cb), callAll() {}};
  globalThis.fromUuid = async uuid => uuid === target.uuid ? target : uuid === actor.uuid ? actor : null;
  globalThis.ChatMessage = {getSpeaker: () => ({}), create: async () => ({})};
  globalThis.Roll = class {async evaluate() {this.total = 25; this.dice = [{results: [{result: 20}]}]; return this;} async toMessage() {}};
  const {registerService} = await import("../scripts/service.js");
  registerService();
  const send = async (author, data, originUserId = author.id) => {
    callbacks.get("createChatMessage")({author, getFlag: () => data}, {}, originUserId);
    await new Promise(resolve => setTimeout(resolve, 15));
    return replies.at(-1);
  };
  const spoof = await send(gm, {action: "begin", requestId: "spoof", targetUuid: target.uuid, actorUuid: actor.uuid}, player.id);
  assert.match(spoof.error, /AuthorMismatch/);
  const first = await send(player, {action: "begin", requestId: "r1", targetUuid: target.uuid, actorUuid: actor.uuid});
  assert.ok(first.data.sessionId);
  const busy = await send(player, {action: "begin", requestId: "r2", targetUuid: target.uuid, actorUuid: actor.uuid});
  assert.match(busy.error, /Busy/);
  const trace = Array.from({length: 30}, () => [first.data.sweet, true]);
  // Fast-forward the wall clock without sleeping to validate replay duration.
  const realNow = Date.now;
  try {
    const base = realNow(); Date.now = () => base + 2000;
    const forged = await send({id: "otherPlayer", active: true}, {action: "finish", requestId: "r3", sessionId: first.data.sessionId, trace});
    assert.match(forged.error, /SessionExpired/); assert.equal(updates.length, 0);
    const success = await send(player, {action: "finish", requestId: "r4", sessionId: first.data.sessionId, trace});
    assert.equal(success.data.status, "success"); assert.deepEqual(updates, [{ds: 1}]); assert.equal(flags.locked, false);
    target.ds = 2; flags.locked = true;
    const next = await send(player, {action: "begin", requestId: "r5", targetUuid: target.uuid, actorUuid: actor.uuid});
    flags.dc = 30;
    const stale = await send(player, {action: "finish", requestId: "r6", sessionId: next.data.sessionId, trace});
    assert.match(stale.error, /LockChanged/); assert.equal(updates.length, 1);
  } finally {Date.now = realNow;}
});
