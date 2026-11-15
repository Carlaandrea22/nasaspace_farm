# Demo pública desde el mapa

Comprobación: 15 de noviembre de 2026. Requiere conexión para pronóstico, clima y servicios municipales.

## Recorrido breve

1. Abrir la página principal y bajar a **Encuentra tu parcela**.
2. Pulsar **Tirani** o **La Maica**, junto a **Marcar centro**. Solo se acerca el mapa a ese lugar; no se selecciona ni se registra una parcela. Dibujar cuatro esquinas del terreno o marcar un punto.
3. Pulsar **Consultar esta parcela** (o **Consultar ubicación** si se eligió un punto). El informe abre en otra pestaña usando la selección propia.
4. Elegir **Ya tengo un cultivo y quiero revisar el agua**. El formulario inicia vacío. Elegir un cultivo e indicar cuándo se sembró; agregar el riego si se conoce. Solo al pulsar **Ver cómo estará el agua** se calcula el resultado.
5. Leer primero **¿Qué hago ahora?**. Debajo se compara lluvia, necesidad del cultivo y días con posible falta de agua. Elegir **7 días** o **14 días** en el resultado; las cifras y el pronóstico inferior usan el mismo periodo. Tocar un día en las barras azules para ver lluvia, temperatura, humedad y balance estimado.
6. Probar **¿Qué pasa si riego 5 días después?**. La aplicación recalcula; no fuerza un resultado favorable ni desfavorable. Pulsar **Ver aviso para coordinar el riego** para revisar el aviso del escenario actual y **Descargar PDF** dentro de la vista previa. El PDF incluye resumen, solicitud de coordinación, datos diarios y fuentes; no se envía por correo automáticamente.
7. Abrir **Quiero planificar qué sembrar después**. Se reutilizan el cultivo y la fecha que acabas de introducir, cuando son compatibles. Elegir personalmente el segundo cultivo y la prioridad; ajustar riegos si corresponde. Pulsar **Comparar tres rotaciones**. Se usa clima histórico, no un pronóstico de dos campañas futuras. También puedes empezar por esta opción: ambos cultivos y la fecha estarán vacíos.
8. Pulsar **Imprimir o guardar PDF** al final del informe. La impresión incluye los módulos visitados y sus fuentes.

## Qué datos son reales y cuáles son supuestos

- **Suelo de Tirani:** extracción de SoilGrids en −17.34161, −66.15458, cinco horizontes hasta 1 m. Copia con procedencia y fecha guardada en `src/data/soil-pilots.json`. Reserva útil calculada hasta 1 m: 137,6 mm, equivalente a 137,6 litros por m². No significa que tenga esa cantidad de agua hoy.
- **La Maica:** punto de consulta −17.42442, −66.18272; referencia de suelo a 227 m. El informe indica esa distancia. Es la segunda opción de demo.
- **Clima, lluvia y humedad:** fuentes descargadas y servicios existentes, con fechas reales. Si un proveedor falla, el sistema informa lo que falta. No sustituye un pronóstico caído por números prefabricados.
- **Cultivo y manejo:** los introduce la persona durante el recorrido. No se precargan maíz, avena, fechas ni turnos en los lugares de práctica. Los parámetros agronómicos del modelo conservan sus fuentes y sus ajustes; la humedad de partida utiliza la fuente disponible. El resultado depende de los datos introducidos.
- **Información complementaria:** clima histórico y cultivos están dentro de **Ver clima y cultivos de este lugar**, cerrado al entrar para no anticipar toda la información.

SoilGrids es una estimación cartográfica de 250 m; la humedad SMAP es regional. Estos datos permiten explicar y probar el modelo, pero no son mediciones dentro de una parcela. La consulta utiliza el punto o centro de la parcela dibujada y comprueba los datos disponibles allí; no asigna automáticamente el suelo de Tirani a cualquier terreno.

## Para ampliar a otros terrenos

La retención puede obtenerse de un recorte oficial de SoilGrids o de una determinación de laboratorio por profundidad. En laboratorio interesa la retención cerca de capacidad de campo y punto de marchitez, con unidades compatibles. Conocer solo humedad actual no informa la capacidad total de almacenamiento. Una estimación basada en textura debe identificarse como aproximación y conservar su incertidumbre.

Fuentes: [SoilGrids / ISRIC](https://isric.org/explore/soilgrids/), [FAO: agua disponible y profundidad de raíces](https://www.fao.org/4/X0490E/x0490e0e.htm), [FAO: capacidad de almacenamiento y medición](https://www.fao.org/4/a0072e/a0072e07.htm).

Verificación automatizada: `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome npm run test:delivery` (en PowerShell establecer la variable con `$env:PLAYWRIGHT_CHROMIUM_CHANNEL='chrome'` primero). La prueba «recorrido desde el mapa sin manejo prellenado» abre el inicio, selecciona Tirani, abre el informe, calcula agua y retraso, compara rotaciones, verifica impresión y móvil, y comprueba que elegir otro punto abandona la demo.
