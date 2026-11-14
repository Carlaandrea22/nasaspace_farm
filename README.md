# Field Shift Cochabamba

PWA para pequeños productores y regantes del municipio de Cochabamba. Compara rotaciones con los mismos datos de clima y suelo, ensaya un retraso en el riego y reúne lo que conviene confirmar antes del siguiente turno. Proyecto de [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/) con [enfoque de Cochabamba](https://www.spaceappschallenge-cbba.com/index.php).

**Estado.** MVP local con la interfaz **Agua y Siembra** diseñada por Carla y el modelo de Field Shift. La Maica, D9 / Itocta, tiene un caso ilustrativo de punta a punta. El explorador calcula aptitud climática por punto con NASA POWER y el catálogo EcoCrop de Zama. Tirani, D13 / Tunari, puede consultar esa aptitud y requiere su propio perfil agrícola para comparar rotaciones. Los borradores se guardan en el navegador sin cuenta.

- [Operación local](#operación-local)
- [Guion de demo](#guion-de-demo)
- [Datos y licencias](#datos-y-licencias)
- [Modelo y decisiones](#modelo-y-decisiones)
- [Arquitectura](#arquitectura)
- [Verificación y pendientes](#verificación-y-pendientes)

## Operación local

Docker y Docker Compose son suficientes para ejecutar el MVP. Para habilitar consultas en vivo, crea `.env` a partir de `.env.example` y agrega en el servidor la clave del **Proyecto 04** que proporciona el [portal del GAMC](https://recursosgamc.cochabamba.bo/api-doc). El archivo local está excluido de Git y de la imagen. El proxy también admite `GAMC_API_KEY_FILE` cuando el entorno del servidor monta un archivo secreto. Open-Meteo funciona sin variable adicional.

```sh
docker compose up --build --detach --wait
docker compose ps
```

Abre [localhost:3000](http://localhost:3000). **Explorar** abre el mapa de Cochabamba. **Mis parcelas** recupera el borrador del dispositivo y da acceso a **Mi cultivo y mi agua**. **Rotaciones** abre el simulador y **Agua** abre el próximo turno. El botón **Piloto La Maica** abre los detalles y accesos del caso piloto. El puerto se puede cambiar con `FIELD_SHIFT_PORT=3001 docker compose up --build --detach --wait`. Consulta registros con `docker compose logs app` y detén el servicio con `docker compose stop`.

La PWA se puede instalar en un navegador compatible. Después de que el service worker aparezca activo, las vistas, las imágenes de portada, la comparación, los polígonos distritales, los recortes de La Maica y Tirani y los borradores funcionan sin señal. La imagen satelital, la búsqueda de lugares y las consultas nuevas a GAMC y Open-Meteo requieren conexión. Al escribir desde tres caracteres, el buscador muestra sugerencias de Photon. Elegir una centra el mapa y marca el punto para consultar su aptitud climática. **Usar mi ubicación** pide permiso y señala la posición aproximada en azul. Para conservar el punto elegido, pulsa **Guardar borrador**. La app guarda los resultados territoriales consultados con el borrador. El pronóstico conserva una copia fechada por ubicación después de una consulta y suspende la ficha de inspección cuando opera con esa copia. Docker publica el puerto en loopback. Para probar instalación en un teléfono físico, usa un acceso HTTPS local con certificado reconocido por el dispositivo.

El proyecto de Compose se llama `field-shift`. Usa `docker compose up --build --detach --wait` desde este repositorio para actualizar la misma instancia.

Para desarrollar y ejecutar las pruebas en la máquina, usa Node.js 24 y Python 3.11+.

```sh
npm ci
npm run lint
npm test
npm run build
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_nasa_import.py'
npx playwright install chromium
npm run test:e2e
```

Las pruebas de navegador se ejecutan con Docker en marcha y se pueden dirigir a otro puerto con `FIELD_SHIFT_TEST_URL`. Con Chrome ya instalado, `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome npm run test:e2e` usa ese navegador.

## Guion de demo

1. Abre [Explorar](http://localhost:3000). Elige un distrito para acercarte y marca un punto en el mapa o con **Marcar centro**. Carga **La Maica · D9 / Itocta** para seguir el piloto y consulta el GAMC. Guarda el borrador. En **Mis parcelas** puedes recuperarlo con el mapa cerrado y activar las capas oficiales en **Capa GAMC**.
2. En **Mi cultivo y mi agua**, registra dos campañas, cultivo actual, uso de cosecha, prioridad y turno. Si no sabes el volumen, escribe caudal y duración o define el volumen de escenario explícitamente. Guarda cada ficha antes de pasar a otra pantalla.
3. En **Rotaciones**, elige **Demo La Maica**. La primera campaña es maíz forrajero. La segunda compara avena forrajera, cebada forrajera y haba. Alterna **Turno previsto / 5 días más tarde**, compara las métricas y abre **¿Por qué?** para ver el periodo, la procedencia y los supuestos. Después puedes probar otra prioridad de la demo y ver cómo afecta a la compatibilidad. El haba queda condicionada al destino, al agua y a la aptitud local. **Mi parcela** cambia a los datos guardados cuando hay un perfil suficiente y compatible con el corte histórico.
4. Abre **Agua** para leer la lluvia reciente, alternar el pronóstico entre **7 días** y **14 días** y revisar la acción para el regante. Cuando coinciden lluvia intensa y exposición cartografiada, abre la ficha de inspección y descárgala. El caso positivo se puede repetir con `npm run test:e2e`, que usa condiciones controladas.
5. Regresa a **Mi parcela**, selecciona **Tirani · D13 / Tunari**, consulta GAMC y guarda. La comparación indica qué datos faltan y mantiene las rotaciones de La Maica dentro de su demo. Separa la información agrícola guardada por coordenadas para evitar atribuir cultivos de una parcela a otra.
6. En **Explorar**, marca un punto y pulsa **Ver clima y cultivos**. Cambia el mes previsto de siembra y revisa el ajuste de cada cultivo, el historial mensual y el aviso estacional si el boletín cubre esa campaña. En **Agua → Avisos climáticos**, consulta los días cálidos previstos y elige si quieres activar avisos del navegador.

Con el corte inicial, el turno de 400 m³ pasa del 26 al 31 de mayo de 2025. Los días de estrés cambian de 0 a 1 en avena, de 0 a 4 en cebada y de 5 a 10 en haba. La avena conserva la preferencia del modelo para forraje. El calendario de riego cada 17 días y el volumen se eligieron para mostrar la sensibilidad del modelo y figuran como supuestos de la demo.

## Datos y licencias

| Fuente | Uso |
| --- | --- |
| [GAMC · Proyecto 04](https://recursosgamc.cochabamba.bo/api-doc) | Límite Distritos, Periurbanos y Drenaje e Influencia. WMS con BBOX de la vista en EPSG:3857. La consulta usa los atributos y distingue coincidencia única, ambigua, consulta vacía e indisponibilidad. |
| [NASA POWER Daily](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) | Serie regional diaria UTC de noviembre de 2024 a agosto de 2025 para ET₀. Precipitación corregida como fuente de respaldo histórico si falta una serie Final validada. |
| [NASA POWER Daily](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) y [FAO EcoCrop](https://www.fao.org/geospatial/data-and-tools/data-portals/ecocrop/en) | El explorador consulta los últimos diez años calendario completos en tiempo solar local, con temperatura diaria media, mínima y máxima, humedad relativa y precipitación corregida. Usa los cuatro cultivos que Zama seleccionó de su [CSV](DatosPlantas/EcoCrop_DB.csv). |
| [NOAA CPC · probabilidades ENSO](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/probabilities/) | Probabilidades oficiales trimestrales de El Niño, La Niña y fase neutra, con su mes de emisión. |
| [GPM IMERG](https://gpm.nasa.gov/data/directory) y [SMAP L4 v8](https://nsidc.org/data/spl4smgp/versions/8) | Final para lluvia histórica si se importa una serie validada. Early para lluvia reciente aplicable. SMAP da contexto regional de humedad a 9 km con fecha y calidad. |
| [SoilGrids](https://docs.isric.org/globaldata/soilgrids/wcs.html) | Textura y retención a 33 y 1.500 kPa en seis profundidades. La celda utilizable está a 227 m de la referencia. Predicción regional bajo [CC BY 4.0](https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_02.html). |
| [Open-Meteo](https://open-meteo.com/en/docs) | Pronóstico diario para Cochabamba en America/La_Paz. Los días recientes modelados quedan etiquetados como tal cuando falta IMERG Early. Los datos diarios se mantienen separados del histórico de rotaciones. |
| [FAO-56](https://www.fao.org/4/x0490e/x0490e0e.htm), [EcoCrop](DatosPlantas/EcoCrop_DB.csv), [SEFO-SAM cebada](https://www.sefosam.com.bo/pdf/cebada.pdf) y [SEFO-SAM haba](https://sefosam.com.bo/pdf/ft-haba.pdf) | Kc, balance, aptitud de referencia, dosis de siembra y rendimientos cuando la fuente lo permite. Las ventanas de la demo son supuestos y el costo local de semilla queda por cotizar. |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Recortes vectoriales de La Maica y Tirani bajo ODbL. |
| [Hogaria](https://hogaria.com/geo) · Ciudatos Lab · OpenStreetMap | Polígonos orientativos del prototipo de Carla, con su atribución ODbL. Se pueden abrir sin conexión. Las coincidencias oficiales se consultan en GAMC. |
| [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) y [Photon](https://photon.komoot.io/) | Teselas satelitales de Esri y colaboradores y búsqueda sobre datos de OpenStreetMap. Se consultan en línea. |
| [Foto del valle de 51114u9](https://commons.wikimedia.org/wiki/File:Valle_de_Cochabamba_desde_Cordillera_Tunari.jpg) | Wikimedia Commons, CC BY-SA 4.0, reducida y recortada visualmente en la tarjeta del piloto. |
| [Imágenes de la interfaz de Carla](https://github.com/Carlaandrea22/nasaspace_farm/tree/796e40c/prototipo/public) | `valle.webp` y `cultivos.jpg`, aportadas por el prototipo. La rama de origen no indica su licencia. |
| [React Bits FadeContent](https://www.reactbits.dev/animations/fade-content) | Adaptación localizada al cambio de escenario con la [licencia de React Bits](src/features/comparison/REACT-BITS-LICENSE.md). Respeta movimiento reducido. |

Procedimiento y estado de cada extracción en [Datos regionales de La Maica](docs/data-import.md). El PDF de planificación se conserva en [InformacionNasa](InformacionNasa/caso-piloto-la-maica.pdf). Los resultados separan estimaciones regionales, previsiones meteorológicas, declaraciones del productor y supuestos.

## Modelo y decisiones

- **Demanda.** Penman–Monteith FAO-56 diario con radiación en MJ/m²/día, viento a 2 m, humedad media, temperaturas extremas y altitud local de referencia de 2.560 m. ETc potencial = ET₀ × Kc. Kc varía entre establecimiento, desarrollo, máxima demanda y fin de ciclo.
- **Agua en raíces.** Integra la diferencia entre capacidad de campo y punto de marchitez hasta la raíz efectiva. Parte de 72% de agua disponible y aplica 85% de lluvia efectiva y 75% de eficiencia de riego. Acota el almacenamiento, descuenta drenaje por exceso y reduce ET real cuando falta agua. La lámina suplementaria se calcula con un balance paralelo que procura alcanzar el umbral al cierre del día. Caudal en L/s × minutos × 0,06 da m³. m³ ÷ (10 × ha) da mm.
- **Comparación.** Se mantienen clima, suelo, calendario, volumen, prioridad y demás turnos constantes. Se descartan ventanas, duraciones o fechas incompatibles antes de ordenar. Entre opciones compatibles se antepone la viabilidad y se ordena por estrés y lámina suplementaria, o en orden inverso para «Usar menos agua». La cobertura deshace empates y sirve como indicador de manejo, separado de una medición de salud del suelo. La matriz expone supuestos y restricciones que pueden cambiar la elección.
- **Decisión operativa.** La segunda semana del pronóstico tiene mayor incertidumbre. La ficha se activa ante 30 mm o más en un día de los primeros tres de pronóstico o en IMERG Early del día anterior, junto a una coincidencia de drenaje y un distrito único consultado ese día. Es un umbral de inspección del MVP. Estimar un desborde en un canal específico requiere información hidráulica.
- **Aptitud climática del explorador.** Se adaptó la regla térmica de `fieldshift.py` de Zama a TypeScript. Se cuentan días históricos dentro del rango óptimo y fuera del absoluto. Para buen ajuste se exige que más de la mitad esté en el óptimo y ninguno fuera de los límites. Un ajuste condicionado admite hasta 10 % de días fuera, con hasta 2 °C de exceso máximo y 2 °C de distancia promedio al óptimo. Se requieren tres ocurrencias completas del mes. El orden prioriza destino, categoría térmica y exposición histórica, con pH medido opcional para desempatar. La lluvia anual completa se contrasta con el rango óptimo de EcoCrop como contexto para parcelas con riego. El resultado requiere revisar variedad, suelo, agua y ventanas locales.
- **Clima estacional y avisos.** Si el ciclo mínimo EcoCrop se superpone con un trimestre de NOAA CPC con probabilidad de El Niño o La Niña de al menos 70 %, la opción queda marcada para revisar con el panorama local de lluvia y temperatura. El aviso estacional añade una condición de revisión a la categoría térmica histórica. Se muestra el mes del boletín y se descarta si tiene más de dos meses calendario. En Agua, Open-Meteo activa un aviso al pronosticar una máxima de al menos 32 °C en los próximos tres días. Ambos umbrales son reglas del MVP. La vista actualiza el pronóstico al volver a ella, al recuperar conexión y cada hora mientras está activa. Los avisos del sistema dependen del permiso del navegador y funcionan con la pantalla Agua abierta. Para recibirlos con la PWA cerrada hace falta Web Push y un proceso de envío.

## Arquitectura

Una aplicación Next.js App Router en Docker integra las portadas, la navegación y el explorador de [la rama Carla en `796e40c`](https://github.com/Carlaandrea22/nasaspace_farm/tree/796e40c/prototipo). Los componentes aprovechan React, TypeScript, Tailwind, shadcn/ui, Lucide y DM Sans local. Leaflet renderiza el mapa y los distritos; las calles de los recortes piloto se sirven como vectores locales. El pronóstico y la comparación se alimentan de los módulos del MVP. Las páginas públicas y sus recursos se precargan en el service worker, independiente de IndexedDB y de los adaptadores de servidor. Las APIs dinámicas usan variables del servidor y las respuestas privadas quedan fuera de la caché de la PWA.

| Ruta | Responsabilidad |
| --- | --- |
| `src/app/page.tsx`, `src/app/layout.tsx` y `src/components/app-navigation.tsx` | Explorador y navegación con barra inferior en móvil y barra lateral en escritorio. |
| `src/app/la-maica/` | Piloto y cuatro pantallas enlazadas como invitado. |
| `src/features/pilot/` y `src/features/territory/` | Formularios, mapa Leaflet, ficha municipal y referencias territoriales. |
| `src/features/comparison/` | Matriz y gráfico Recharts, escenarios y trazabilidad. |
| `src/domain/water-balance/` | Conversión de unidades, ET₀, balance diario y orden de preferencias. |
| `src/features/operations/` | Pronóstico, etapa del cultivo y ficha de inspección. |
| `src/domain/climate/` y `src/features/climate/` | Aptitud climática, consulta y recuperación local del último historial por punto, boletín ENSO y avisos optativos. |
| `src/server/` y `src/app/api/` | Adaptadores de GAMC y Open-Meteo, con validación y tiempo de espera. |
| `src/lib/browser/` | Índice de borradores y registro del service worker. |
| `src/data/`, `public/maps/` y `public/pilots/` | Series regionales preparadas, distritos orientativos y recortes públicos de mapa. |
| `tests/` | Balance, territorio, pronóstico, importación y pruebas en navegador. |

La rama `Zama` aporta el CSV y documentos en el commit `492a102` y el [prototipo de aptitud climática en `746c031`](https://github.com/Carlaandrea22/nasaspace_farm/blob/746c03185b064983bd1b23ffd9c92e679e6b5128/fieldshift.py). Se portaron a la aplicación las reglas de selección de cultivos. El balance radicular de Field Shift sigue a cargo del riego. El catálogo reproducible se genera con `python3 scripts/import-ecocrop.py`. El JSON generado se incluye en Docker y el CSV original permanece en `DatosPlantas/`. Las rutas `/api/climate` y `/api/enso` consultan fuentes públicas sin claves. Las coordenadas se redondean a tres decimales al consultar NASA POWER. El navegador guarda la última consulta climática y solo recupera esa copia para el mismo punto. El boletín estacional tiene su propia copia fechada.

## Verificación y pendientes

- Flujo climático probado en Chrome móvil contra NASA POWER, NOAA CPC y Open-Meteo desde Docker. D9 y D13 devolvieron cuatro fichas con diez años de historia y compartieron los valores de la cuadrícula regional en la consulta. Las pruebas controladas cubren cambio de mes, filtro por destino, pH medido, separación de consultas por punto, copia local sin conexión, alertas de calor y ENSO, y activación y deduplicación de notificaciones.
- Integración de la interfaz comprobada en Docker con Chrome a 390 px y 1440 px. Se verificaron la navegación, las teselas satelitales y la búsqueda en vivo, y el centrado con geolocalización emulada. Playwright comprobó que el mapa distrital y los borradores de parcela y cultivo se recuperan sin conexión, que el escenario cambia la fecha del turno sin modificar volumen ni prioridad, que Tirani indica sus faltantes y que la ficha de inspección se descarga con un pronóstico de prueba.
- GAMC en vivo con las nueve combinaciones de capa y operación `GetMap`, `GetLegendGraphic` y `GetFeatureInfo`. D9 e Itocta y D13 y Tunari devolvieron una coincidencia única. También se verificaron una respuesta ambigua y una sin coincidencias.
- NASA POWER y SoilGrids regionales comprobados. Open-Meteo respondió con 14 días para La Maica. La ficha de inspección se abrió y descargó con exposición GAMC real de D4 y un pronóstico de prueba de 40 mm. La matriz y su fuente de lluvia aparecen en **¿Por qué?**.
- IMERG Final y Early quedan pendientes de un subconjunto completo y validado. La consulta de granulos oficiales requiere una sesión Earthdata autorizada y la alternativa pública dio muestras incompletas. AppEEARS requiere acceso autenticado para la extracción SMAP. El importador incluye ambos procedimientos y conserva faltantes distintos de cero.
- Pendientes de campo: historial y turno reales de La Maica, superficie, ventanas y variedades, cotizaciones de semilla y una prueba de comprensión con productor, regante o técnico. D13 requiere su propio perfil de suelo y clima, calendario, secuencia, alternativas compatibles y riego. El resultado del modelo es una simulación. Las cifras de ahorro real requieren validación en campo.
- Las 15 preguntas de evaluación están pendientes de correspondencia. El PDF documenta la escala de 0 a 4. La evidencia disponible incluye pruebas automatizadas, trazabilidad por fuente, comparación reproducible y recorrido móvil.
- La cuenta opcional con Better Auth y PostgreSQL queda para una etapa posterior al MVP de invitado.

## Prototipo independiente de Carla

La aplicación integrada se ejecuta desde la raíz. El prototipo de interfaz
anterior está en `prototipo/` y el simulador de consola se ejecuta con
`node piloto.mjs`.
