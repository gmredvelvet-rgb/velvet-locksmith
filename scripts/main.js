import {ID, configure, selected, config, isLocked, setLocked, escape} from "./locks.js";
import {registerService, request} from "./service.js";
import {LockGame} from "./minigame.js";

let opening = false, activeGame = null;
const safe = fn => (...args) => Promise.resolve().then(() => fn(...args)).catch(e => {console.error(ID, e); ui.notifications.error(e.message);});

async function attempt(target = selected(), actor = null) {
  if (typeof target === "string") target = await fromUuid(target);
  if (!target) throw Error("Selecciona un objetivo o pasa su UUID a la macro.");
  if (!isLocked(target)) return ui.notifications.info("Este objetivo no tiene una cerradura bloqueada.");
  if (activeGame) {activeGame.bringToFront(); return;}
  if (opening) return;
  opening = true;
  let session;
  try {
  actor ??= canvas.tokens?.controlled?.find(t => t.actor?.hasPlayerOwner && t.document.uuid !== target.uuid)?.actor ?? game.user.character;
  if (!actor) {
    const choices = game.actors.filter(a => a.testUserPermission(game.user, "OWNER") && ["character", "pc"].includes(a.type));
    if (!choices.length) throw Error("Selecciona tu personaje antes de abrir la cerradura.");
    const id = await foundry.applications.api.DialogV2.prompt({window: {title: "¿Quién usa la ganzúa?"}, content: `<select name="actor">${choices.map(a => `<option value="${a.id}">${escape(a.name)}</option>`).join("")}</select>`, ok: {label: "Tirar", callback: (event, button) => button.form.elements.actor.value}, rejectClose: false});
    if (!id) return;
    actor = game.actors.get(id);
  }
    session = await request("begin", {targetUuid: target.uuid, actorUuid: actor.uuid});
    activeGame = new LockGame(session);
    await activeGame.render({force: true});
  } catch (error) {
    activeGame = null;
    if (session) request("cancel", {sessionId: session.sessionId}).catch(() => {});
    throw error;
  } finally {opening = false;}
}

Hooks.once("init", () => {
  game.settings.register(ID, "sound", {name: "Sonidos del minijuego", hint: "Clics mecánicos, rotura de ganzúa y apertura. Solo en este cliente.", scope: "client", config: true, type: Boolean, default: true});
  game.settings.register(ID, "volume", {name: "Volumen del minijuego", scope: "client", config: true, type: Number, default: .35, range: {min: 0, max: 1, step: .05}});
  game.settings.register(ID, "reach", {name: "Alcance de interacción (casillas)", hint: "Distancia máxima entre el personaje y la puerta/cofre. El GM puede probar desde cualquier distancia.", scope: "world", config: true, type: Number, default: 2, range: {min: 1, max: 20, step: 1}});
});

Hooks.on("getSceneControlButtons", controls => {
  for (const layer of ["tokens", "walls", "tiles", "drawings"]) {
    if (!controls[layer]) continue;
    controls[layer].tools.velvetLocksmith = {name: "velvetLocksmith", title: "Velvet Locksmith · Configurar / Ganzúa", icon: "fa-solid fa-key", order: Object.keys(controls[layer].tools).length, button: true, visible: layer === "tokens" || game.user.isGM, onChange: safe(() => game.user.isGM ? configure() : attempt())};
  }
});

Hooks.once("ready", () => {
  registerService();
  game.modules.get(ID).api = {
    configure: safe(async doc => configure(typeof doc === "string" ? await fromUuid(doc) : doc)),
    attempt: safe(attempt),
    isLocked,
    lock: async doc => setLocked(typeof doc === "string" ? await fromUuid(doc) : doc, true),
    open: async doc => setLocked(typeof doc === "string" ? await fromUuid(doc) : doc, false, true)
  };
  Hooks.on(`${ID}Closed`, app => {if (app === activeGame) activeGame = null;});

  // DoorControl method verified against the installed Foundry v14 core.
  const proto = foundry.canvas.containers.DoorControl.prototype;
  const intercept = function(wrapped, event) {
    if (event.button === 0 && isLocked(this.wall.document)) {
      if (!game.user.isGM && !game.user.can("WALL_DOORS")) return false;
      if (game.paused && !game.user.isGM) return false;
      event.stopPropagation(); safe(attempt)(this.wall.document); return false;
    }
    return wrapped(event);
  };
  if (game.modules.get("lib-wrapper")?.active) {
    libWrapper.register(ID, "foundry.canvas.containers.DoorControl.prototype._onMouseDown", intercept, "MIXED");
  } else {
    const original = proto._onMouseDown;
    proto._onMouseDown = function(event) {return intercept.call(this, original.bind(this), event);};
  }

  Hooks.on("renderTokenHUD", (hud, element) => {
    const doc = hud.document ?? hud.object?.document;
    const root = element?.querySelector ? element : element?.[0];
    const column = root?.querySelector(".col.right");
    if (!column || !doc || column.querySelector(".vl-hud-key") || (!game.user.isGM && !config(doc)?.enabled)) return;
    const button = document.createElement("button");
    button.type = "button"; button.className = "control-icon vl-hud-key";
    button.title = game.user.isGM ? "Configurar cerradura" : "Ganzúa";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = '<i class="fa-solid fa-key" inert></i>';
    button.addEventListener("click", safe(() => game.user.isGM ? configure(doc) : attempt(doc)));
    column.append(button);
  });

  // Block the pile interface before the loot carousel or Item Piles opens it.
  Hooks.on("item-piles-preRenderInterface", target => {
    const doc = target?.document ?? target;
    const token = doc?.documentName === "Actor" ? canvas.tokens?.placeables.find(t => t.actor?.uuid === doc.uuid && isLocked(t.document))?.document : null;
    const locked = token ?? doc;
    if (!locked || !isLocked(locked)) return;
    safe(attempt)(locked); return false;
  });

  // Pre-render hooks use callAll in v14 and cannot cancel rendering. Wrap the
  // render entry point instead, also covering the Velvet Loot Reveal window.
  for (const path of ["foundry.applications.api.ApplicationV2.prototype.render", "foundry.appv1.api.Application.prototype.render"]) {
    const gate = function(wrapped, ...args) {
      if (!game.user.isGM) {
        const doc = this.document ?? this.actor ?? this.item;
        const token = doc?.documentName === "Actor" ? canvas.tokens?.placeables.find(t => t.actor?.uuid === doc.uuid && isLocked(t.document))?.document : null;
        if (isLocked(token ?? doc)) {safe(attempt)(token ?? doc); return path.includes("appv1") ? this : Promise.resolve(this);}
      }
      return wrapped(...args);
    };
    if (game.modules.get("lib-wrapper")?.active) libWrapper.register(ID, path, gate, "MIXED");
    else {
      const appProto = path.includes("appv1") ? foundry.appv1.api.Application.prototype : foundry.applications.api.ApplicationV2.prototype;
      const render = appProto.render;
      appProto.render = function(...args) {return gate.call(this, render.bind(this), ...args);};
    }
  }
  for (const name of ["Wall", "Token", "Tile", "Drawing", "Actor", "Item", "JournalEntry"]) {
    Hooks.on(`preUpdate${name}`, (doc, change, options, userId) => {
      if (game.users.get(userId)?.isGM || !isLocked(doc)) return;
      if (name === "Wall" && "ds" in change) return false;
      if (foundry.utils.hasProperty(change, `flags.${ID}`) || Object.keys(change).some(k => k.startsWith(`flags.${ID}`))) return false;
    });
  }
});
