# Velvet Locksmith

Módulo independiente para Foundry VTT 14. Minijuego de ganzúas inspirado en Skyrim: busca el ángulo y mantén presión para girar. Si fuerzas la cerradura fuera de su zona correcta, se atasca y rompe la ganzúa.

## Activar y usar

1. Recarga Foundry para que detecte el módulo y activa **Velvet Locksmith** en el mundo.
2. GM: selecciona una puerta con la herramienta de paredes y pulsa la llave en esos mismos controles, o ejecuta la macro de configuración de abajo. Para un cofre, selecciona su token y usa la llave del HUD. Tiles y dibujos también tienen una llave en sus herramientas.
3. Configura DC y pulsa **Lock · Bloquear**. **Open · Abrir** permite abrir como GM. **Quitar cerradura** desbloquea y elimina la configuración.
4. Jugador: asigna tu personaje en la configuración de usuario o selecciona su token. Haz clic en una puerta bloqueada para tirar e iniciar el minijuego. En cofres de Item Piles, interactúa normalmente con el cofre.
5. Usa el deslizador o las flechas para mover la ganzúa. Mantén Espacio o el botón para girar. Suelta cuando se atasque y prueba otro ángulo.

Necesitas un GM conectado. Alcance por defecto: dos casillas, configurable. Las ganzúas son intentos por sesión y no consumen inventario. Puedes reintentar tras cerrar. La sesión vence a los dos minutos. No se activa ningún módulo automáticamente.

## Tiradas y dificultad

Se revisaron `redvelvet-crafting-pf2e` y `redvelvet-crafting-dnd5e`: usan `1d20 + bono`, publican la tirada y ajustan el minijuego según el margen contra la DC. Locksmith usa las mismas bandas de margen; transforma sus ventanas de tiempo en tolerancia angular, resistencia y ganzúas.

| Margen | Tolerancia | Ganzúas | Resistencia |
| --- | --- | --- | --- |
| DC −10 o menos | ±4° | 2 | 0.75 |
| DC −9 a −1 | ±8° | 3 | 1 |
| DC a DC +9 | ±15° | 4 | 1.5 |
| DC +10 o más | ±25° | 5 | 2 |

Un 20 natural sube una banda; un 1 baja una banda. Es una decisión de este minijuego: el fallo de la tirada aumenta la dificultad pero todavía permite abrir. La habilidad manual decide la apertura final.

PF2e: modificador preparado de Thievery. D&D5e: total preparado de herramientas de ladrón (`system.tools.thief.total`); si no están configuradas, Destreza. Otros sistemas: bono manual del GM. Es una tirada propia, como crafting; no invoca el diálogo nativo ni consume recursos o aplica automáticamente todas las reglas situacionales del sistema.

## Macros / API

Configurar la selección (GM):

```js
await game.modules.get("velvet-locksmith").api.configure();
```

Configurar cualquier documento por UUID (GM):

```js
await game.modules.get("velvet-locksmith").api.configure("Scene.ESCENA.Token.COFRE");
```

Intentar un objetivo con el personaje asignado:

```js
await game.modules.get("velvet-locksmith").api.attempt("Scene.ESCENA.Wall.PUERTA");
```

`attempt(documento, actor)` admite un actor explícito. `lock(documentoOUuid)` y `open(documentoOUuid)` requieren GM y una cerradura ya configurada. `isLocked(documento)` devuelve el estado.

Puertas: se actualiza el estado nativo de la puerta. Cofres de Item Piles: se usa su API pública para bloquear, desbloquear y abrir. Tokens, tiles, dibujos, actores, ítems y diarios admiten flags de cerradura. Las hojas se interceptan en este cliente; tiles/dibujos y acciones personalizadas necesitan una macro/integración que consulte `isLocked` y llame `attempt`.

El evento `velvetLocksmithStateChanged(documento, {locked, open})` permite conectar animaciones o módulos propios. La integración con Velvet Loot Reveal intercepta la ventana del carrusel si su actor o un token visible correspondiente está bloqueado.

## Verificación y límites

El GM calcula la tirada, mantiene una sesión por objetivo/jugador, comprueba propiedad y distancia, reproduce las entradas y aplica el resultado. Se rechazan sesiones vencidas, cerraduras modificadas y secuencias inválidas. La entrada manual sigue llegando del cliente: no pretende impedir trampas mediante consola ni reemplazar los permisos de Foundry. Documentos genéricos no tienen un estado universal de apertura ni barrera de acceso del servidor.

Pruebas automatizadas: `npm test` desde esta carpeta (Node). Cubren bandas, desgaste, apertura, validación de entradas y flujo de solicitud/verificación del GM con Foundry simulado.

Prueba manual pendiente en un mundo activo: GM y jugador conectados, puerta bloqueada → tirada → minijuego → puerta abierta; cofre Item Piles y Velvet Loot Reveal; cierre/cancelación, pausa y distancia; teclado y tacto. Compatibilidad basada en inspección del núcleo v14 y APIs locales; no se ha confirmado aún en una sesión real.
