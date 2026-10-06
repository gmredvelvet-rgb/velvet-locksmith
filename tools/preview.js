// Development-only host. Imports the production artwork, mechanics and input code.
const mount = document.querySelector("#mount");
const notice = document.querySelector(".preview-state");
globalThis.game = {settings: {get: (id, key) => key === "sound" ? true : .35}};
globalThis.Hooks = {callAll() {}};
globalThis.foundry = {utils: {escapeHTML: value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}, applications: {api: {ApplicationV2: class {
  get state() {return 2;}
  _onRender() {}
  async render() {
    this.element ??= document.createElement("article");
    this.element.className = "velvet-locksmith";
    this.element.innerHTML = '<header class="window-header"><span>VELVET LOCKSMITH</span><button aria-label="Cerrar ventana">✕</button></header><div class="window-content"></div>';
    this._replaceHTML(await this._renderHTML(), this.element.querySelector(".window-content"));
    mount.replaceChildren(this.element);
    this.element.querySelector(".window-header button").addEventListener("click", () => this.close());
    this._onRender({}, {}); return this;
  }
  async close() {this.element?.remove();}
}}}};
const {LockGame} = await import("../scripts/minigame.js");
const {profile, replay} = await import("../scripts/mechanics.js");
let current = null, demo = null;
async function open(mode) {
  if (mode === "rerender") {if (current && !current.disposed) await current.render(); return;}
  clearInterval(demo);
  if (current) await current.close();
  const p = profile(mode === "hard" || mode === "failure" ? 0 : 25, 20);
  const session = {sessionId: "preview", sweet: 35, p, total: mode === "hard" || mode === "failure" ? 0 : 25, dc: 20, name: "Cofre de la cámara olvidada"};
  current = new LockGame(session, {send: async (action, data) => {
    if (action === "cancel") return {cancelled: true};
    const result = replay(data.trace, session.sweet, p);
    await new Promise(resolve => setTimeout(resolve, 650));
    if (mode === "error") throw Error("El GM cambió la cerradura. Inicia otro intento.");
    return {status: result.status};
  }});
  await current.render(); notice.textContent = "";
  if (["success", "failure", "error"].includes(mode)) {
    current.angle = mode === "failure" ? -90 : 35;
    current.torque = true;
    demo = setInterval(() => {
      if (!current || current.ended || current.disposed) {clearInterval(demo); return;}
      current.torque = true;
    }, 60);
  }
}
document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => open(button.dataset.mode).catch(error => {notice.textContent = error.message; console.error(error);}))); 
await open("normal");
