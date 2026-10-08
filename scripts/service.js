import {ID, config, isLocked, setLocked, modifier, escape, lockKey, isPile, distanceToTarget, t} from "./locks.js";
import {profile, replay} from "./mechanics.js";

const sessions = new Map();
const pending = new Map();
let queue = Promise.resolve();
const primaryGM = () => game.users.find(u => u.active && u.isGM);
const channel = `module.${ID}`;
function receive(packet) {
  if (packet?.userId !== game.user.id) return;
  const p = pending.get(packet.requestId);
  if (!p) return;
  clearTimeout(p.timer); pending.delete(packet.requestId);
  packet.error ? p.reject(Error(packet.error)) : p.resolve(packet.data);
}
const reply = (userId, requestId, payload) => {
  const packet = {userId, requestId, ...payload};
  if (userId === game.user.id) receive(packet);
  else game.socket.emit(channel, packet);
};

export function request(action, data) {
  const gm = primaryGM();
  if (!gm) return Promise.reject(Error(t("Error.NoGM")));
  const requestId = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(Error(t("Error.GMTimeout"))); }, 30000);
    pending.set(requestId, {resolve, reject, timer});
    // Match message author to the originating userId supplied by Foundry's
    // create hook. Never trust a userId from the module socket or request flag.
    ChatMessage.create({content: `🔐 ${t(action === "begin" ? "Chat.Requested" : "Chat.Finished")}`, whisper: [gm.id], flags: {[ID]: {request: {...data, action, requestId}}}})
      .catch(error => {clearTimeout(timer); pending.delete(requestId); reject(error);});
  });
}

async function validate(user, targetUuid, actorUuid) {
  const target = await fromUuid(targetUuid), actor = await fromUuid(actorUuid);
  if (!target || !actor || actor.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) throw Error(t("Error.NoOwnedActor"));
  if (!isLocked(target)) throw Error(t("Error.AlreadyOpen"));
  if (!Number.isFinite(config(target).dc) || config(target).dc < 1 || config(target).dc > 100) throw Error(t("Error.BadDC"));
  if (target.documentName === "Wall" && !user.isGM && !user.can("WALL_DOORS")) throw Error(t("Error.NoDoorPermission"));
  if (game.paused && !user.isGM) throw Error(t("Error.Paused"));
  let physicalTarget = target;
  // An Actor UUID must not bypass proximity for an Item Piles container.
  if (!user.isGM && target.documentName === "Actor" && isPile(target)) {
    physicalTarget = game.scenes.get(user.viewedScene)?.tokens.find(t => t.actor?.uuid === target.uuid && !t.hidden);
    if (!physicalTarget) throw Error(t("Error.ChestNotVisible"));
  }
  const scene = physicalTarget.parent?.documentName === "Scene" ? physicalTarget.parent : null;
  if (scene && !user.isGM) {
    const tokens = scene.tokens.filter(t => t.actor?.uuid === actor.uuid && t.testUserPermission(user, "OWNER"));
    if (scene.id && user.viewedScene !== scene.id) throw Error(t("Error.OtherScene"));
    if (physicalTarget.hidden || (physicalTarget.documentName === "Wall" && physicalTarget.door === CONST.WALL_DOOR_TYPES?.SECRET)) throw Error(t("Error.Hidden"));
    const max = game.settings.get(ID, "reach");
    if (!tokens.some(t => distanceToTarget({x: t.x + t.width * scene.grid.size / 2, y: t.y + t.height * scene.grid.size / 2}, physicalTarget, scene.grid.size) <= max)) throw Error(t("Error.TooFar", {max}));
  }
  return {target, actor};
}

async function handle(message, originUserId) {
  if (game.user.id !== primaryGM()?.id) return;
  const r = message.getFlag(ID, "request"), user = message.author ?? message.user;
  if (!r || !user?.active || typeof r.requestId !== "string") return;
  if (originUserId !== user.id) {reply(originUserId, r.requestId, {error: t("Error.AuthorMismatch")}); return;}
  try {
    for (const [id, s] of sessions) if (Date.now() - s.started > 125000) sessions.delete(id);
    if (r.action === "begin") {
      const {target, actor} = await validate(user, r.targetUuid, r.actorUuid);
      if ([...sessions.values()].some(s => s.lockKey === lockKey(target) || s.userId === user.id)) throw Error(t("Error.Busy"));
      const c = config(target), skill = modifier(actor, c);
      if (!Number.isFinite(skill.mod)) throw Error(t("Error.BadBonus"));
      const roll = await new Roll(`1d20 + ${skill.mod}`).evaluate();
      await roll.toMessage({speaker: ChatMessage.getSpeaker({actor}), flavor: t("Chat.RollFlavor", {skill: escape(skill.label), dc: c.dc})});
      const p = profile(roll.total, c.dc, roll.dice[0]?.results.find(x => x.active !== false)?.result ?? 10);
      const sessionId = foundry.utils.randomID(), sweet = Math.floor(Math.random() * 141) - 70;
      sessions.set(sessionId, {userId: user.id, targetUuid: target.uuid, lockKey: lockKey(target), actorUuid: actor.uuid, started: Date.now(), sweet, p, lock: JSON.stringify(c)});
      reply(user.id, r.requestId, {data: {sessionId, sweet, p, total: roll.total, dc: c.dc, name: target.name ?? t("DefaultName")}});
    } else if (r.action === "finish" || r.action === "cancel") {
      const s = sessions.get(r.sessionId);
      if (!s || s.userId !== user.id) throw Error(t("Error.SessionExpired"));
      sessions.delete(r.sessionId);
      if (r.action === "cancel") return reply(user.id, r.requestId, {data: {cancelled: true}});
      const {target, actor} = await validate(user, s.targetUuid, s.actorUuid);
      if (JSON.stringify(config(target)) !== s.lock) throw Error(t("Error.LockChanged"));
      if (!Array.isArray(r.trace) || r.trace.length * 50 > Date.now() - s.started + 500) throw Error(t("Error.BadDuration"));
      const result = replay(r.trace, s.sweet, s.p);
      if (result.status === "playing") throw Error(t("Error.Incomplete"));
      if (result.status === "success") await setLocked(target, false, config(target).openOnSuccess);
      reply(user.id, r.requestId, {data: {status: result.status}});
      // A chat failure must not report failure after the door already opened.
      void ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: `<p>🔐 <strong>${escape(target.name ?? t("DefaultName"))}</strong>: ${t(result.status === "success" ? "Chat.Opened" : "Chat.Broken")}</p>`}).catch(error => console.error(ID, "Could not post the result", error));
    } else throw Error(t("Error.UnknownAction"));
  } catch (error) { reply(user.id, r.requestId, {error: error.message}); }
}

export function registerService() {
  game.socket.on(channel, receive);
  Hooks.on("createChatMessage", (message, options, userId) => {
    if (!message.getFlag(ID, "request")) return;
    queue = queue.then(() => handle(message, userId)).catch(error => console.error(ID, error));
  });
}
