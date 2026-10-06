import {escape} from "./locks.js";

/** SVG artwork is resolution-independent and contains no external assets. */
export function renderLock(session, statusText) {
  const s = session;
  const screws = [[200,81],[351,232],[200,383],[49,232]].map(([x,y]) => `<g transform="translate(${x} ${y})"><circle r="7" fill="#231c17" stroke="#98754a"/><path d="M-4 2L4-2" stroke="#bea478" stroke-width="1.5"/></g>`).join("");
  const ticks = Array.from({length:36}, (_,i) => `<path d="M200 89v${i%3===0?10:5}" transform="rotate(${i*10} 200 232)"/>`).join("");
  const pins = Array.from({length:s.p.picks}, (_,i) => `<span class="vl-pick-count" data-pick="${i}" aria-hidden="true"><svg viewBox="0 0 12 28"><path d="M5 26V6l4-4"/></svg></span>`).join("");
  return `<section class="vl-game" tabindex="0" aria-label="Minijuego de ganzúas">
    <header class="vl-heading"><div class="vl-eyebrow"><span></span> VELVET LOCKSMITH <span></span></div>
    <h2>${escape(s.name)}</h2><div class="vl-roll"><span>HABILIDAD <b>${s.total}</b></span><span>DC <b>${s.dc}</b></span><span>${escape(s.p.label)}</span></div></header>
    <div class="vl-stage"><div class="vl-stage-light"></div>
    <svg class="vl-lock" viewBox="0 0 400 450" role="img" aria-label="Cerradura de latón con ganzúa; arrastra para moverla">
      <defs>
        <radialGradient id="vl-brass"><stop stop-color="#b49a6b"/><stop offset=".48" stop-color="#6a5337"/><stop offset=".8" stop-color="#33281d"/><stop offset="1" stop-color="#171716"/></radialGradient>
        <linearGradient id="vl-edge" x2=".8" y2="1"><stop stop-color="#eed9a9"/><stop offset=".35" stop-color="#675134"/><stop offset=".65" stop-color="#2b241b"/><stop offset="1" stop-color="#ba9561"/></linearGradient>
        <linearGradient id="vl-steel"><stop stop-color="#a9a9a1"/><stop offset=".45" stop-color="#f1f0dd"/><stop offset="1" stop-color="#5f665f"/></linearGradient>
        <radialGradient id="vl-core"><stop stop-color="#7d6747"/><stop offset=".7" stop-color="#403526"/><stop offset="1" stop-color="#201c17"/></radialGradient>
      </defs>
      <g class="vl-assembly">
        <circle cx="200" cy="232" r="164" fill="#070b10" stroke="#403727" stroke-width="2"/>
        <circle cx="200" cy="232" r="157" fill="url(#vl-brass)" stroke="url(#vl-edge)" stroke-width="7"/>
        <circle cx="200" cy="232" r="142" fill="none" stroke="#c6a370" opacity=".25"/>
        <g stroke="#d0ae77" opacity=".48">${ticks}</g>${screws}
        <path d="M97 163q23-29 52-34m-65 79q2-12 6-21m194 137q-24 28-52 31" stroke="#e6cda0" stroke-width="1.5" opacity=".18" fill="none"/>
        <circle cx="200" cy="232" r="102" fill="#111313" stroke="#a18453" stroke-width="2"/>
        <circle cx="200" cy="232" r="95" fill="url(#vl-core)" stroke="#171714" stroke-width="3"/>
        <g class="vl-cylinder"><circle cx="200" cy="232" r="82" fill="url(#vl-core)" stroke="url(#vl-edge)" stroke-width="3"/>
          <circle cx="200" cy="232" r="70" fill="none" stroke="#c5ac78" opacity=".18"/>
          <path d="M189 214q11-15 22 0v37h-9v-8h-13z" fill="#080b0d" stroke="#ac9161" stroke-width="1.5"/>
          <path d="M153 184l5-5m86 98l5-5" stroke="#ba9a65" opacity=".55"/>
        </g>
        <g class="vl-tension"><path d="M202 238v98q0 8-8 8h-47" fill="none" stroke="#101516" stroke-width="9"/><path d="M201 236v97q0 8-8 8h-46" fill="none" stroke="url(#vl-steel)" stroke-width="5" stroke-linecap="round"/></g>
        <g class="vl-pick"><g class="vl-pick-fx"><path d="M199 233l1-163 6-8" fill="none" stroke="url(#vl-steel)" stroke-width="4" stroke-linecap="round"/>
          <rect x="192" y="14" width="16" height="61" rx="6" fill="#3b241b" stroke="#ba925b" stroke-width="1.5"/>
          <path d="M196 21v45m8-45v45" stroke="#c39a64" opacity=".36"/>
        </g></g><circle cx="200" cy="232" r="4" fill="#cbb38c"/>
      </g>
    </svg>
    <div class="vl-result" aria-hidden="true"><span class="vl-result-icon"></span><strong class="vl-result-title"></strong><span class="vl-result-subtitle"></span></div>
    <span class="vl-stage-caption">MUEVE LA GANZÚA · SIENTE LA RESISTENCIA</span></div>
    <div class="vl-instruments"><div><span class="vl-caption">GANZÚAS</span><div class="vl-picks">${pins}<span class="vl-picks-text">${s.p.picks}/${s.p.picks}</span></div></div>
    <div class="vl-condition"><label class="vl-caption" for="vl-integrity">INTEGRIDAD</label><progress id="vl-integrity" class="vl-wear" max="1" value="1"></progress></div></div>
    <label class="vl-angle-label" for="vl-angle">Ángulo de la ganzúa <output class="vl-angle-value">0°</output></label>
    <input id="vl-angle" class="vl-angle" type="range" min="-90" max="90" step="1" value="0">
    <div class="vl-controls"><button type="button" class="vl-turn"><span class="vl-turn-icon">↻</span><span>Mantener para girar</span><kbd>ESPACIO</kbd></button></div>
    <p class="vl-status" role="status" aria-live="polite">${escape(statusText)}</p>
    <footer class="vl-help"><span><kbd>←</kbd><kbd>→</kbd> mover</span><span>Arrastra la ganzúa</span><span class="vl-time">2:00</span></footer>
    <p class="vl-footnote">Las ganzúas representan intentos; no consumen tu inventario.</p>
  </section>`;
}
