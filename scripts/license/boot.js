/**
 * Velvet Locksmith: enganche del soft gate.
 *
 * Es el mismo cableado que el resto de la familia lleva en su main.js, aqui como entrada
 * propia de `esmodules`: el gate no toca el codigo del modulo y no puede romperlo.
 *
 * Con Velvet License Hub activo, la licencia es del hub: este modulo se registra en el y se
 * calla, sin servidor, tarjeta ni recordatorio propios. Sin hub, el flujo individual de
 * siempre, con su prueba gratuita. Ninguna funcion se bloquea jamas.
 */

import { MODULE_ID, MODULE_TITLE, SETTINGS } from "./constants.js";
import LicenseClient from "./license-client.js";
import LicenseUI, { isWorldLicensed, registerLicenseMenu } from "./license-ui.js";
import { hubActive, licenseHub } from "./license-hub.js";

Hooks.once("init", () => {
  try {
    // No es un interruptor, es un hecho: por eso no aparece en la configuracion.
    game.settings.register(MODULE_ID, SETTINGS.WORLD_LICENSED, {
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });
    // Con el hub activo, su menu es el unico sitio donde gestionar la licencia.
    if ( !hubActive() ) registerLicenseMenu();
  }
  catch ( error ) {
    console.error(`${MODULE_TITLE} | No se pudo registrar la licencia`, error);
  }
});

Hooks.once("ready", async () => {
  // Foundry tambien carga los modulos en las pantallas de join, setup y stream, donde no hay
  // mundo que licenciar ni a quien preguntar.
  if ( game.view !== "game" ) return;
  try {
    // Con el hub activo la licencia es del hub: registrarse y callarse.
    const hub = licenseHub();
    if ( hub ) return void hub.register(MODULE_ID);
    if ( game.user?.isGM ) {
      // Cierto si esta verificada ahora mismo o si sigue dentro de la ventana que compro una
      // verificacion anterior: a un GM que ya autorizo no se le vuelve a preguntar.
      const licensed = await LicenseClient.instance.initialize();
      if ( licensed ) await game.settings.set(MODULE_ID, SETTINGS.WORLD_LICENSED, true);
      // Nunca abrir con la tarjeta si el mundo ya esta licenciado: eso es un segundo
      // navegador o una caida del servidor, no alguien a quien haya que preguntar.
      else if ( !LicenseClient.instance.hasStoredCredentials && !isWorldLicensed() ) LicenseUI.show();
    }
    LicenseUI.startReminder();
  }
  catch ( error ) {
    // La capa de licencia no puede llevarse el modulo por delante.
    console.error(`${MODULE_TITLE} | Fallo la comprobacion de licencia`, error);
  }
});

// Que el GM autorice a mitad de sesion silencia el recordatorio en todos los clientes
// conectados sin que nadie recargue: el flag llega como actualizacion de un ajuste de mundo.
Hooks.on("updateSetting", setting => {
  if ( setting.key !== `${MODULE_ID}.${SETTINGS.WORLD_LICENSED}` ) return;
  if ( licenseHub() ) return;
  if ( isWorldLicensed() ) LicenseUI.stopReminder();
  else LicenseUI.startReminder();
});
