# Auditoría de Velvet Locksmith 0.2.2

Fecha: 2026-10-07. Alcance: código de cerraduras, sesión GM/jugador, interfaz, animación, sonido y compatibilidad con las APIs locales de Foundry 14. Se conservaron la capa de licencia, idiomas y manifiesto añadidos previamente.

## Resultado

Las 15 pruebas automatizadas pasan. La interfaz se comprobó en Chromium con el código real del minijuego y un anfitrión simulado de ApplicationV2. Se verificaron apertura manual, agotamiento de ganzúas, error del GM y conservación del resultado al volver a renderizar. También se comprobó un marco móvil de 390 × 844, sin desbordamiento horizontal.

La integración final en un mundo real sigue pendiente: Foundry no estaba escuchando en el puerto local 30000 durante la auditoría. El anfitrión de prueba simula la confirmación del GM; no demuestra la comunicación entre dos clientes reales ni la transferencia de botín.

## Problemas corregidos

| Problema | Corrección / evidencia |
| --- | --- |
| Colisión con `ApplicationV2.state`, propiedad de solo lectura | Estado independiente `puzzleState`; prueba de regresión del constructor y simulación. |
| Temporizadores y listeners duplicados al volver a renderizar | Limpieza del intervalo, frame y AbortController antes de enlazar la nueva interfaz. |
| Cancelación adicional al cerrar durante la verificación | Un resultado enviado no se cancela; la respuesta tardía no modifica una interfaz cerrada. Prueba automatizada. |
| Error durante renderizado podía dejar recursos abiertos | Se cierra la aplicación parcial antes de liberar la referencia activa. |
| Varios clics durante la selección del personaje | Se reserva la apertura antes del diálogo; la ventana activa se trae al frente. |
| Retorno incompatible al bloquear `render` de ApplicationV2 | El interceptor conserva la promesa de V2 y el retorno sincrónico de V1. |
| Autor de solicitudes no cotejado con el cliente origen | Se coteja con `userId` del hook de creación del documento. Prueba de rechazo. |
| Dos tokens del mismo cofre podían tener sesiones simultáneas | La reserva usa el UUID del actor compartido de Item Piles. Prueba de concurrencia. |
| Actor UUID de un cofre podía saltarse distancia | Se busca su token visible en la escena del jugador y se comprueba proximidad. Prueba automatizada. |
| Distancia incorrecta para puertas largas y cofres grandes | Se mide al segmento de la puerta o borde del objeto, en casillas euclidianas. Prueba automatizada. |
| Objetivos ocultos, puertas secretas, pausa y otra escena | Comprobaciones del GM antes del inicio y al completar. Pruebas automatizadas. |
| Fallo al publicar chat podía anunciar error tras abrir | La respuesta exitosa se entrega después de aplicar el estado; publicar el chat es una operación independiente. |
| Contador final se reiniciaba al volver a renderizar | Se conserva el tiempo mostrado al finalizar. Comprobación visual. |
| Movimiento a saltos y respuesta visual pobre | Simulación a 50 ms, interpolación por frame, temblor bajo presión y rotura con pausa de 650 ms. |

## Diseño y animación

Arte SVG propio con metal, tornillos, anillos, reflejos y llave de tensión. Movimiento de ganzúa y cilindro suavizado sin cambiar las reglas del replay del GM. Sonidos locales discretos para giro, resistencia, rotura y confirmación; volumen y activación configurables por cliente. Sin descargas de audio ni dependencia de librerías de animación.

La apertura visual requiere confirmación del GM. Los estados de espera, éxito, fallo y error son explícitos. El teclado no propaga las flechas ni Espacio al canvas. Hay arrastre directo, deslizador y controles táctiles. El diseño usa indicadores de desgaste y texto además de color; respeta `prefers-reduced-motion`.

## Arquitectura y testabilidad

Separación de mecánica pura, dibujo SVG, audio, aplicación y servicio GM. La aplicación permite sustituir el envío para pruebas; el replay es compartido con el GM. No se encontraron ADRs ni story files aplicables; revisión de ADR y especialistas de motor no configurados omitida. Se mantienen los singletons de Foundry como patrón propio de módulos, sin añadir infraestructura genérica.

## Límites que requieren prueba en el mundo

- Abrir una puerta con GM y jugador en clientes separados; verificar permiso WALL_DOORS y alcance.
- Abrir un cofre Item Piles con Velvet Loot Reveal activo y revisar su orden de hooks.
- Probar cancelación, cambio de cerradura por GM, desconexión del GM y reintento.
- Comprobar libWrapper activo e inactivo, y coexistencia con módulos que sustituyen render o DoorControl.
- Comprobar sonidos reales y tacto en los equipos de los jugadores.

No es un ACL del servidor ni un sistema antitrampas: la consola de un cliente puede revelar el ángulo enviado al minijuego. Los documentos genéricos necesitan una macro/integración para sus acciones específicas. No se hace comprobación de línea de visión ni se consumen herramientas del inventario. Otros módulos pueden vetar la apertura de Item Piles; ese caso conserva su error explícito.

## Reproducir la prueba visual

Ejecutar `node tools/serve-preview.mjs` y abrir `http://127.0.0.1:38641/`. El servidor escucha solo en loopback. `tools/mobile.html` presenta la interfaz en un marco móvil. Estas herramientas no se cargan por el manifiesto del módulo y no modifican un mundo.
