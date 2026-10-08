# Cambios

## 0.3.0

- Interfaz en inglés y español mediante archivos de idioma; sigue el idioma de Foundry.
- Sonido rehecho: roce de la ganzúa, trinquete del cilindro, crujido continuo que sube con el desgaste, chasquido de rotura y pestillo de apertura.
- Cilindro con resorte (sacudida al atascarse, rebote al soltar), ganzúa que se curva y se calienta, chispas, destello y sacudida al romperse, pulso dorado al abrir.
- Arco de avance y marcador de apertura; marcas que recuerdan cuánto giró el cilindro en cada ángulo probado.
- Controles: clic derecho sobre la cerradura para girar, rueda del ratón, teclas A/D, aceleración al mantener las flechas y Shift para movimiento fino. Vibración en dispositivos táctiles.
- Botón de cerradura (solo GM) en la cabecera de cualquier hoja de actor, ítem o diario, y en las ventanas de configuración de puerta, token, tile y dibujo; no aparece en hojas de personaje.
- Corregido: "El objetivo está en otra escena" cuando el GM había recargado después de que el jugador entrara; ahora una escena desconocida se resuelve con la comprobación de distancia.
- La mecánica, las bandas de dificultad y la validación del GM no cambian.

## 0.2.2

- Auditoría funcional y 15 pruebas automatizadas.
- Diseño de cerradura en SVG, movimiento interpolado, temblor bajo presión, rotura y confirmación de apertura.
- Arrastre de ganzúa, teclado y controles táctiles, adaptación a pantallas pequeñas y movimiento reducido.
- Sonidos mecánicos locales y volumen configurable por cliente.
- Limpieza de recursos al cerrar o volver a renderizar; protección contra cancelación durante verificación.
- Validación de origen de solicitudes, permisos, escena, objetivos ocultos y sesiones vencidas.
- Reserva compartida para tokens del mismo cofre y comprobación de proximidad al usar un Actor UUID.
- Distancia al segmento de puerta/borde del cofre, en lugar de su centro.
- Conservación de la integración existente con Velvet License Hub.

La integración completa GM/jugador en un mundo activo permanece pendiente; detalles y evidencia en AUDIT.md (auditoría de la 0.2.2).
