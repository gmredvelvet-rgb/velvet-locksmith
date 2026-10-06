import {test} from "node:test";
import assert from "node:assert/strict";
import {setLocked, isLocked, modifier} from "../scripts/locks.js";

test("Item Piles state uses its public API and honors vetoes", async () => {
  let locked = false, veto = false, opened = false;
  const api = {isItemPileContainer: () => true, isItemPileLocked: () => locked,
    lockItemPile: async () => {if (veto) return false; locked = true;},
    unlockItemPile: async () => {locked = false;}, openItemPile: async () => {opened = true;}};
  globalThis.game = {user: {isGM: true}, modules: new Map([["item-piles", {active: true}]]), itempiles: {API: api}};
  globalThis.Hooks = {callAll() {}};
  let flag = {enabled: true, locked: false};
  const doc = {documentName: "Token", getFlag: () => flag, setFlag: async (id, key, value) => {flag = value;}};
  await setLocked(doc, true); assert.equal(isLocked(doc), true);
  await setLocked(doc, false, true); assert.equal(isLocked(doc), false); assert.equal(opened, true);
  veto = true;
  await assert.rejects(setLocked(doc, true), /rechazó/);
  assert.equal(flag.locked, false);
  game.user.isGM = false;
  await assert.rejects(setLocked(doc, true), /Solo el GM/);
});
test("system bonuses use prepared Thievery and D&D5e tool total", () => {
  globalThis.game = {system: {id: "pf2e"}};
  assert.equal(modifier({skills: {thievery: {mod: 13}}}, {}).mod, 13);
  game.system.id = "dnd5e";
  assert.equal(modifier({system: {abilities: {dex: {mod: 3}}, tools: {thief: {total: 11, value: 2}}, attributes: {prof: 4}}}, {}).mod, 11);
  assert.equal(modifier({system: {abilities: {dex: {mod: 3}}}}, {}).mod, 3);
  game.system.id = "other";
  assert.equal(modifier({}, {modifier: 7}).mod, 7);
});
