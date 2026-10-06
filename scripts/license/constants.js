/**
 * Velvet Locksmith: lo que la capa de licencia necesita del modulo.
 * En el resto de la familia estos valores viven en las constantes del propio modulo.
 */
export const MODULE_ID = "velvet-locksmith";

/** Titulo legible, para avisos y prefijos de registro. */
export const MODULE_TITLE = "Velvet Locksmith";

export const SETTINGS = Object.freeze({
  /**
   * Ajuste de mundo oculto: lo escribe el cliente del GM tras verificar Patreon y lo leen
   * los demas, para que ningun jugador tenga que contactar con el servidor de licencias.
   */
  WORLD_LICENSED: "worldLicensed",
  LICENSE_MENU: "licenseMenu"
});
