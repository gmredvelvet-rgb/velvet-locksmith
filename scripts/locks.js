export const ID = "velvet-locksmith";
export const escape = (text) => foundry.utils.escapeHTML(String(text ?? ""));
export const config = (doc) => doc?.getFlag?.(ID, "lock");
const pileAPI = () => game.modules.get("item-piles")?.active ? game.itempiles?.API : null;
const isPile = (doc) => ["Token", "Actor"].includes(doc.documentName) && pileAPI()?.isItemPileContainer(doc);

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
  if (!game.user.isGM) throw Error("Solo el GM puede cambiar una cerradura.");
  if (!config(doc)?.enabled) throw Error("Configura primero la cerradura.");
  if (doc.documentName === "Wall") {
    await doc.update({ds: locked ? CONST.WALL_DOOR_STATES.LOCKED : open ? CONST.WALL_DOOR_STATES.OPEN : CONST.WALL_DOOR_STATES.CLOSED}, {sound: true});
  } else if (isPile(doc)) {
    const result = await pileAPI()[locked ? "lockItemPile" : "unlockItemPile"](doc);
    if (result === false) throw Error("Item Piles rechazó el cambio de cerradura.");
    if (!locked && open && await pileAPI().openItemPile(doc) === false) throw Error("Item Piles rechazó la apertura.");
  }
  await doc.setFlag(ID, "lock", {...config(doc), locked});
  Hooks.callAll("velvetLocksmithStateChanged", doc, {locked, open});
}

export function selected() {
  return canvas.activeLayer?.controlled?.[0]?.document ?? canvas.walls?.controlled?.[0]?.document ?? canvas.tokens?.controlled?.[0]?.document ?? canvas.tiles?.controlled?.[0]?.document ?? canvas.drawings?.controlled?.[0]?.document;
}

export async function configure(doc = selected()) {
  if (!game.user.isGM) return ui.notifications.warn("Solo el GM configura cerraduras.");
  if (!doc) return ui.notifications.warn("Selecciona una puerta, token, tile o dibujo.");
  if (doc.documentName === "Wall" && !doc.door) return ui.notifications.warn("La pared seleccionada debe ser una puerta.");
  const c = config(doc) ?? {dc: 20, modifier: 0, openOnSuccess: true};
  const result = await foundry.applications.api.DialogV2.wait({
    window: {title: `Cerradura · ${doc.name ?? doc.documentName}`},
    content: `<p>La tirada cambia el tamaño de la zona correcta y la resistencia de las ganzúas.</p>
      <div class="form-group"><label>DC</label><input name="dc" type="number" min="1" max="100" value="${Number(c.dc)}"></div>
      <div class="form-group"><label>Bono manual (otros sistemas)</label><input name="modifier" type="number" min="-50" max="100" value="${Number(c.modifier)}"></div>
      <label><input type="checkbox" name="openOnSuccess" ${c.openOnSuccess ? "checked" : ""}> Abrir al completar</label>
      <p>PF2e: Thievery. D&D5e: Destreza + competencia de herramientas de ladrón; Destreza si no están configuradas.</p>`,
    buttons: [
      {action: "lock", label: "Lock · Bloquear", default: true, callback: (event, button) => ({action: "lock", data: new foundry.applications.ux.FormDataExtended(button.form).object})},
      {action: "open", label: "Open · Abrir", callback: (event, button) => ({action: "open", data: new foundry.applications.ux.FormDataExtended(button.form).object})},
      {action: "remove", label: "Quitar cerradura", callback: () => ({action: "remove"})}
    ], rejectClose: false
  });
  if (!result) return;
  if (result.action === "remove") {
    if (config(doc)?.enabled) await setLocked(doc, false);
    return doc.unsetFlag(ID, "lock");
  }
  const dc = Number(result.data.dc), modifier = Number(result.data.modifier);
  if (!Number.isFinite(dc) || dc < 1 || dc > 100 || !Number.isFinite(modifier) || modifier < -50 || modifier > 100) throw Error("DC o bono fuera de rango.");
  await doc.setFlag(ID, "lock", {enabled: true, locked: false, dc, modifier, openOnSuccess: Boolean(result.data.openOnSuccess)});
  await setLocked(doc, result.action === "lock", result.action === "open");
}

export function modifier(actor, c) {
  if (game.system.id === "pf2e") {
    const skill = actor.skills?.thievery ?? actor.system.skills?.thievery ?? actor.system.skills?.thi;
    if (!Number.isFinite(Number(skill?.mod))) throw Error("El personaje no tiene Thievery disponible.");
    return {mod: Number(skill.mod), label: "Thievery"};
  }
  if (game.system.id === "dnd5e") {
    const dex = Number(actor.system.abilities?.dex?.mod ?? 0);
    const tool = actor.system.tools?.thief;
    const proficiency = Number(tool?.value ?? tool?.proficient ?? 0);
    return {mod: Number.isFinite(tool?.total) ? tool.total : dex + Number(actor.system.attributes?.prof ?? 0) * proficiency + Number(tool?.bonus ?? 0), label: tool ? "Herramientas de ladrón" : "Destreza"};
  }
  return {mod: Number(c.modifier ?? 0), label: "Bono manual"};
}
