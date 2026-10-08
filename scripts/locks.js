export const ID = "velvet-locksmith";
export const escape = (text) => foundry.utils.escapeHTML(String(text ?? ""));
/** Localised string; falls back to the bare key where Foundry's i18n is absent (tests). */
export const t = (key, data) => globalThis.game?.i18n?.format(`${ID}.${key}`, data) ?? key;
export const config = (doc) => doc?.getFlag?.(ID, "lock");
const pileAPI = () => game.modules.get("item-piles")?.active ? game.itempiles?.API : null;
export const isPile = (doc) => Boolean(doc && ["Token", "Actor"].includes(doc.documentName) && pileAPI()?.isItemPileContainer(doc));

/** Distance to a door segment or placeable bounds, in grid cells. */
export function distanceToTarget(point, target, gridSize) {
  if (!Number.isFinite(gridSize) || gridSize <= 0) return Infinity;
  let x, y;
  if (target.documentName === "Wall") {
    const [x1, y1, x2, y2] = target.c;
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((point.x - x1) * dx + (point.y - y1) * dy) / (dx * dx + dy * dy || 1)));
    x = x1 + t * dx; y = y1 + t * dy;
  } else {
    const scale = target.documentName === "Token" ? gridSize : 1;
    const w = (target.width ?? target.shape?.width ?? 0) * scale;
    const h = (target.height ?? target.shape?.height ?? 0) * scale;
    x = Math.max(target.x, Math.min(target.x + w, point.x));
    y = Math.max(target.y, Math.min(target.y + h, point.y));
  }
  return Math.hypot(point.x - x, point.y - y) / gridSize;
}

/** Linked Item Piles tokens share one physical container and one session. */
export function lockKey(doc) {return isPile(doc) ? (doc.actor?.uuid ?? doc.uuid) : doc.uuid;}

export function isLocked(doc) {
  const data = config(doc);
  if (!data?.enabled) return false;
  if (doc.documentName === "Wall") return doc.ds === CONST.WALL_DOOR_STATES.LOCKED;
  if (isPile(doc)) return pileAPI().isItemPileLocked(doc);
  return Boolean(data.locked);
}

export async function setLocked(doc, locked, open = false) {
  if (!game.user.isGM) throw Error(t("Error.GMOnly"));
  if (!config(doc)?.enabled) throw Error(t("Error.NotConfigured"));
  if (doc.documentName === "Wall") {
    await doc.update({ds: locked ? CONST.WALL_DOOR_STATES.LOCKED : open ? CONST.WALL_DOOR_STATES.OPEN : CONST.WALL_DOOR_STATES.CLOSED}, {sound: true});
  } else if (isPile(doc)) {
    const result = await pileAPI()[locked ? "lockItemPile" : "unlockItemPile"](doc);
    if (result === false) throw Error(t("Error.PilesLockRefused"));
    if (!locked && open && await pileAPI().openItemPile(doc) === false) throw Error(t("Error.PilesOpenRefused"));
  }
  await doc.setFlag(ID, "lock", {...config(doc), locked});
  Hooks.callAll("velvetLocksmithStateChanged", doc, {locked, open});
}

export function selected() {
  return canvas.activeLayer?.controlled?.[0]?.document ?? canvas.walls?.controlled?.[0]?.document ?? canvas.tokens?.controlled?.[0]?.document ?? canvas.tiles?.controlled?.[0]?.document ?? canvas.drawings?.controlled?.[0]?.document;
}

export async function configure(doc = selected()) {
  if (!game.user.isGM) return ui.notifications.warn(t("Warn.GMConfigures"));
  if (!doc) return ui.notifications.warn(t("Warn.SelectTarget"));
  if (doc.documentName === "Wall" && !doc.door) return ui.notifications.warn(t("Warn.NotDoor"));
  const c = config(doc) ?? {dc: 20, modifier: 0, openOnSuccess: true}, name = doc.name ?? doc.documentName;
  const result = await foundry.applications.api.DialogV2.wait({
    window: {title: t("Config.Title", {name})},
    content: `<p>${t("Config.Intro")}</p>
      <div class="form-group"><label>DC</label><input name="dc" type="number" min="1" max="100" value="${Number(c.dc)}"></div>
      <div class="form-group"><label>${t("Config.Modifier")}</label><input name="modifier" type="number" min="-50" max="100" value="${Number(c.modifier)}"></div>
      <label><input type="checkbox" name="openOnSuccess" ${c.openOnSuccess ? "checked" : ""}> ${t("Config.OpenOnSuccess")}</label>
      <p>${t("Config.SystemNote")}</p>`,
    buttons: [
      {action: "lock", label: t("Config.Lock"), default: true, callback: (event, button) => ({action: "lock", data: new foundry.applications.ux.FormDataExtended(button.form).object})},
      {action: "open", label: t("Config.Open"), callback: (event, button) => ({action: "open", data: new foundry.applications.ux.FormDataExtended(button.form).object})},
      {action: "test", label: t("Config.Test"), callback: (event, button) => ({action: "test", data: new foundry.applications.ux.FormDataExtended(button.form).object})},
      {action: "remove", label: t("Config.Remove"), callback: () => ({action: "remove"})}
    ], rejectClose: false
  });
  if (!result) return;
  if (result.action === "remove") {
    if (config(doc)?.enabled) await setLocked(doc, false);
    await doc.unsetFlag(ID, "lock");
    return ui.notifications.info(t("Info.Removed", {name}));
  }
  const dc = Number(result.data.dc), modifier = Number(result.data.modifier);
  if (!Number.isFinite(dc) || dc < 1 || dc > 100 || !Number.isFinite(modifier) || modifier < -50 || modifier > 100) throw Error(t("Error.OutOfRange"));
  await doc.setFlag(ID, "lock", {enabled: true, locked: false, dc, modifier, openOnSuccess: Boolean(result.data.openOnSuccess)});
  await setLocked(doc, result.action !== "open", result.action === "open");
  ui.notifications.info(t(result.action === "open" ? "Info.Unlocked" : "Info.Locked", {name, dc}));
  // The GM is never blocked by a lock, so this is the way to try the minigame on any document.
  if (result.action === "test") return game.modules.get(ID).api.attempt(doc);
}

export function modifier(actor, c) {
  if (game.system.id === "pf2e") {
    const skill = actor.skills?.thievery ?? actor.system.skills?.thievery ?? actor.system.skills?.thi;
    if (!Number.isFinite(Number(skill?.mod))) throw Error(t("Error.NoThievery"));
    return {mod: Number(skill.mod), label: t("Skill.Thievery")};
  }
  if (game.system.id === "dnd5e") {
    const dex = Number(actor.system.abilities?.dex?.mod ?? 0);
    const tool = actor.system.tools?.thief;
    const proficiency = Number(tool?.value ?? tool?.proficient ?? 0);
    return {mod: Number.isFinite(tool?.total) ? tool.total : dex + Number(actor.system.attributes?.prof ?? 0) * proficiency + Number(tool?.bonus ?? 0), label: t(tool ? "Skill.ThievesTools" : "Skill.Dexterity")};
  }
  return {mod: Number(c.modifier ?? 0), label: t("Skill.Manual")};
}
