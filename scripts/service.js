import {ID, config, isLocked, setLocked, modifier, escape, lockKey} from "./locks.js";
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
  if (!gm) return Promise.reject(Error("Se necesita un GM conectado."));
  const requestId = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(Error("El GM no respondió. Intenta de nuevo.")); }, 30000);
    pending.set(requestId, {resolve, reject, timer});
    // Match message author to the originating userId supplied by Foundry's
    // create hook. Never trust a userId from the module socket or request flag.
    ChatMessage.create({content: action === "begin" ? "🔐 Intento de ganzúa solicitado." : "🔐 Intento de ganzúa terminado.", whisper: [gm.id], flags: {[ID]: {request: {...data, action, requestId}}}})
      .catch(error => {clearTimeout(timer); pending.delete(requestId); reject(error);});
  });
}

async function validate(user, targetUuid, actorUuid) {
  const target = await fromUuid(targetUuid), actor = await fromUuid(actorUuid);
  if (!target || !actor || actor.documentName !== "Actor" || !actor.testUserPermission(user, "OWNER")) throw Error("Necesitas un personaje que controles.");
  if (!isLocked(target)) throw Error("La cerradura ya está abierta o no está configurada.");
  if (!Number.isFinite(config(target).dc) || config(target).dc < 1 || config(target).dc > 100) throw Error("La DC de la cerradura no es válida.");
  if (target.documentName === "Wall" && !user.isGM && !user.can("WALL_DOORS")) throw Error("No tienes permiso para interactuar con puertas.");
  if (game.paused && !user.isGM) throw Error("La partida está pausada.");
  const scene = target.parent?.documentName === "Scene" ? target.parent : null;
  if (scene && !user.isGM) {
    const tokens = scene.tokens.filter(t => t.actor?.uuid === actor.uuid && t.testUserPermission(user, "OWNER"));
    if (scene.id && user.viewedScene !== scene.id) throw Error("El objetivo está en otra escena.");
    if (target.hidden) throw Error("Ese objetivo está oculto.");
    const center = target.documentName === "Wall" ? {x: (target.c[0] + target.c[2]) / 2, y: (target.c[1] + target.c[3]) / 2} : {x: target.x + (target.documentName === "Token" ? target.width * scene.grid.size : target.width ?? target.shape?.width ?? 0) / 2, y: target.y + (target.documentName === "Token" ? target.height * scene.grid.size : target.height ?? target.shape?.height ?? 0) / 2};
    const max = game.settings.get(ID, "reach");
    if (!tokens.some(t => Math.hypot(t.x + t.width * scene.grid.size / 2 - center.x, t.y + t.height * scene.grid.size / 2 - center.y) / scene.grid.size <= max)) throw Error(`Acércate al objetivo (máximo ${max} casillas).`);
  }
  return {target, actor};
}

async function handle(message, originUserId) {
  if (game.user.id !== primaryGM()?.id) return;
  const r = message.getFlag(ID, "request"), user = message.author ?? message.user;
  if (!r || !user?.active || typeof r.requestId !== "string") return;
  if (originUserId !== user.id) {reply(originUserId, r.requestId, {error: "El autor no coincide con quien envió la solicitud."}); return;}
  try {
    for (const [id, s] of sessions) if (Date.now() - s.started > 125000) sessions.delete(id);
    if (r.action === "begin") {
      const {target, actor} = await validate(user, r.targetUuid, r.actorUuid);
      if ([...sessions.values()].some(s => s.lockKey === lockKey(target) || s.userId === user.id)) throw Error("Ya hay un intento en curso. Cierra el anterior o espera dos minutos.");
      const c = config(target), skill = modifier(actor, c);
      if (!Number.isFinite(skill.mod)) throw Error("Bono de habilidad inválido.");
      const roll = await new Roll(`1d20 + ${skill.mod}`).evaluate();
      await roll.toMessage({speaker: ChatMessage.getSpeaker({actor}), flavor: `Ganzúa · ${escape(skill.label)} · DC ${c.dc}`});
      const p = profile(roll.total, c.dc, roll.dice[0]?.results.find(x => x.active !== false)?.result ?? 10);
      const sessionId = foundry.utils.randomID(), sweet = Math.floor(Math.random() * 141) - 70;
      sessions.set(sessionId, {userId: user.id, targetUuid: target.uuid, lockKey: lockKey(target), actorUuid: actor.uuid, started: Date.now(), sweet, p, lock: JSON.stringify(c)});
      reply(user.id, r.requestId, {data: {sessionId, sweet, p, total: roll.total, dc: c.dc, name: target.name ?? "Puerta"}});
    } else if (r.action === "finish" || r.action === "cancel") {
      const s = sessions.get(r.sessionId);
      if (!s || s.userId !== user.id) throw Error("El intento venció o no te pertenece.");
      sessions.delete(r.sessionId);
      if (r.action === "cancel") return reply(user.id, r.requestId, {data: {cancelled: true}});
      const {target, actor} = await validate(user, s.targetUuid, s.actorUuid);
      if (JSON.stringify(config(target)) !== s.lock) throw Error("El GM cambió la cerradura. Inicia otro intento.");
      if (!Array.isArray(r.trace) || r.trace.length * 50 > Date.now() - s.started + 500) throw Error("Duración de intento inválida.");
      const result = replay(r.trace, s.sweet, s.p);
      if (result.status === "playing") throw Error("El intento no se ha completado.");
      if (result.status === "success") await setLocked(target, false, config(target).openOnSuccess);
      reply(user.id, r.requestId, {data: {status: result.status}});
      // A chat failure must not report failure after the door already opened.
      void ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: `<p>🔐 <strong>${escape(target.name ?? "Puerta")}</strong>: ${result.status === "success" ? "cerradura abierta" : "las ganzúas se rompieron"}.</p>`}).catch(error => console.error(ID, "No se pudo publicar el resultado", error));
    } else throw Error("Acción desconocida.");
  } catch (error) { reply(user.id, r.requestId, {error: error.message}); }
}

export function registerService() {
  game.socket.on(channel, receive);
  Hooks.on("createChatMessage", (message, options, userId) => {
    if (!message.getFlag(ID, "request")) return;
    queue = queue.then(() => handle(message, userId)).catch(error => console.error(ID, error));
  });
}
