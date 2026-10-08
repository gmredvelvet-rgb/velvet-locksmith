import {test} from "node:test";
import assert from "node:assert/strict";

async function fixture() {
  const hooks = new Map(), awaiting = new Map(), documents = new Map();
  let id = 0;
  const gm = {id: "gm", active: true, isGM: true};
  const player = {id: "player", active: true, isGM: false, viewedScene: "s", can: () => true};
  const other = {...player, id: "other"};
  const scene = {id: "s", documentName: "Scene", grid: {size: 100}, tokens: []};
  const actor = {uuid: "Actor.hero", documentName: "Actor", skills: {thievery: {mod: 8}}, testUserPermission: u => [player.id, other.id].includes(u.id)};
  const token = {uuid: "Scene.s.Token.hero", actor, x: 0, y: 50, width: 1, height: 1, testUserPermission: () => true};
  scene.tokens.push(token);
  const flags = {enabled: true, locked: true, dc: 20, modifier: 0, openOnSuccess: true};
  const wall = {uuid: "Scene.s.Wall.lock", documentName: "Wall", name: "Door", door: 1, ds: 2, c: [0, 0, 1000, 0], parent: scene, getFlag: () => flags, setFlag: async (module, key, value) => {Object.assign(flags, value);}, update: async data => {Object.assign(wall, data);}};
  documents.set(wall.uuid, wall); documents.set(actor.uuid, actor);
  globalThis.CONST = {WALL_DOOR_STATES: {LOCKED: 2, OPEN: 1, CLOSED: 0}, WALL_DOOR_TYPES: {SECRET: 2}};
  globalThis.foundry = {utils: {randomID: () => `id${++id}`, escapeHTML: s => s}};
  globalThis.Hooks = {on: (name, cb) => hooks.set(name, cb), callAll() {}};
  globalThis.game = {user: gm, users: [gm, player, other], system: {id: "pf2e"}, scenes: new Map([[scene.id, scene]]), settings: {get: () => 2}, modules: new Map(), socket: {on() {}, emit(channel, packet) {awaiting.get(packet.requestId)?.(packet);}}};
  globalThis.fromUuid = async uuid => documents.get(uuid);
  globalThis.ChatMessage = {getSpeaker: () => ({}), create: async () => ({})};
  globalThis.Roll = class {async evaluate() {this.total = 25; this.dice = [{results: [{result: 17}]}]; return this;} async toMessage() {}};
  const service = await import(`../scripts/service.js?fixture=${Math.random()}`);
  service.registerService();
  const send = (user, data) => new Promise((resolve, reject) => {
    const requestId = `request${++id}`;
    const timer = setTimeout(() => reject(Error("Missing GM reply")), 1000);
    awaiting.set(requestId, packet => {clearTimeout(timer); awaiting.delete(requestId); resolve(packet);});
    hooks.get("createChatMessage")({author: user, getFlag: () => ({requestId, ...data})}, {}, user.id);
  });
  return {send, wall, actor, token, player, other, scene, documents, flags};
}

test("GM rejects distant, hidden, secret, paused, other-scene and unauthorized door attempts", async () => {
  const f = await fixture();
  const begin = () => f.send(f.player, {action: "begin", targetUuid: f.wall.uuid, actorUuid: f.actor.uuid});
  f.token.y = 1000; assert.match((await begin()).error, /TooFar/); f.token.y = 50;
  f.wall.hidden = true; assert.match((await begin()).error, /Hidden/); f.wall.hidden = false;
  f.wall.door = 2; assert.match((await begin()).error, /Hidden/); f.wall.door = 1;
  game.paused = true; assert.match((await begin()).error, /Paused/); game.paused = false;
  f.player.viewedScene = "other"; assert.match((await begin()).error, /OtherScene/);
  // A GM that reloaded after the player joined does not know the player's scene yet.
  f.player.viewedScene = null; const unknown = await begin(); assert.ok(unknown.data.sessionId);
  await f.send(f.player, {action: "cancel", sessionId: unknown.data.sessionId});
  f.token.y = 1000; assert.match((await begin()).error, /TooFar/); f.token.y = 50; f.player.viewedScene = "s";
  f.player.can = () => false; assert.match((await begin()).error, /NoDoorPermission/); f.player.can = () => true;
  const allowed = await begin(); assert.ok(allowed.data.sessionId);
  await f.send(f.player, {action: "cancel", sessionId: allowed.data.sessionId});
});

test("linked container tokens share one session and Actor UUIDs cannot bypass reach", async () => {
  const f = await fixture();
  const chestActor = {uuid: "Actor.chest", documentName: "Actor", getFlag: () => f.flags};
  const first = {uuid: "Scene.s.Token.chest1", documentName: "Token", actor: chestActor, x: 100, y: 0, width: 1, height: 1, parent: f.scene, getFlag: () => f.flags};
  const second = {...first, uuid: "Scene.s.Token.chest2"};
  f.scene.tokens.push(first, second);
  for (const doc of [chestActor, first, second]) f.documents.set(doc.uuid, doc);
  game.modules.set("item-piles", {active: true});
  game.itempiles = {API: {isItemPileContainer: doc => [first.uuid, second.uuid, chestActor.uuid].includes(doc.uuid), isItemPileLocked: () => true}};
  const initial = await f.send(f.player, {action: "begin", targetUuid: first.uuid, actorUuid: f.actor.uuid});
  assert.ok(initial.data.sessionId);
  const busy = await f.send(f.other, {action: "begin", targetUuid: second.uuid, actorUuid: f.actor.uuid});
  assert.match(busy.error, /Busy/);
  await f.send(f.player, {action: "cancel", sessionId: initial.data.sessionId});
  f.token.y = 1000;
  const distant = await f.send(f.player, {action: "begin", targetUuid: chestActor.uuid, actorUuid: f.actor.uuid});
  assert.match(distant.error, /TooFar/);
  first.hidden = true; second.hidden = true;
  const hidden = await f.send(f.player, {action: "begin", targetUuid: chestActor.uuid, actorUuid: f.actor.uuid});
  assert.match(hidden.error, /ChestNotVisible/);
});

test("expired sessions cannot unlock a door", async () => {
  const f = await fixture();
  const begin = await f.send(f.player, {action: "begin", targetUuid: f.wall.uuid, actorUuid: f.actor.uuid});
  const realNow = Date.now, now = realNow();
  try {
    Date.now = () => now + 126000;
    const expired = await f.send(f.player, {action: "finish", sessionId: begin.data.sessionId, trace: Array(30).fill([begin.data.sweet, true])});
    assert.match(expired.error, /SessionExpired/); assert.equal(f.wall.ds, 2);
  } finally {Date.now = realNow;}
});
