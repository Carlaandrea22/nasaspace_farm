# Yaku

PWA para pequeños productores y regantes del municipio de Cochabamba. Compara rotaciones con los mismos datos de clima y suelo, ensaya un retraso en el riego y reúne lo que conviene confirmar antes del siguiente turno. Proyecto de [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/) con [enfoque de Cochabamba](https://www.spaceappschallenge-cbba.com/index.php).

**Estado.** MVP local de **Yaku**, con la interfaz diseñada por Carla y el modelo de Field Shift. El informe público permite consultar agua y comparar tres rotaciones para la ubicación seleccionada, sin cuenta, con NASA POWER, SMAP, IMERG, SoilGrids, Open-Meteo y las tres capas GAMC. La disponibilidad, resolución y fecha de cada fuente se muestran; los datos faltantes no se sustituyen por mediciones de otra parcela. Consulta el [entregable local, cobertura, actualización y pruebas](docs/entregable-local.md). El simulador histórico de La Maica sigue disponible como referencia.

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

Con Docker Desktop abierto, entra a [localhost:3000](http://localhost:3000). **Explorar** abre el mapa de Cochabamba. Después de iniciar sesión, **Mis parcelas** muestra tus parcelas guardadas y da acceso a **Mi cultivo y mi agua**. **Rotaciones** abre el simulador y **Agua** abre el próximo turno. Si el puerto está ocupado, configura `FIELD_SHIFT_PORT=3001` en `.env`, ejecuta de nuevo el comando de arranque y abre [localhost:3001](http://localhost:3001). Consulta registros con `docker compose logs app db` y detén el servicio con `docker compose stop`.

La PWA se puede instalar en un navegador compatible. Después de que el service worker aparezca activo, las vistas, las imágenes de portada, la comparación, los polígonos distritales, los recortes de La Maica y Tirani y los borradores funcionan sin señal. La imagen satelital y las consultas nuevas requieren conexión. **Selecciona tu distrito** acerca el mapa al distrito elegido. Desde ahí puedes marcar un punto o dibujar el contorno de la parcela. **Usar mi ubicación** muestra tu posición aproximada con tu permiso. **Tirani** y **La Maica** acercan el mapa a los sitios de referencia. **Consultar esta parcela** abre los resultados y solicita en paralelo el historial de NASA POWER y las capas del Gobierno Autónomo Municipal de Cochabamba (GAMC). **Guardar borrador** conserva el punto y los resultados territoriales disponibles. El pronóstico conserva una copia fechada por ubicación después de una consulta y suspende la ficha de inspección cuando opera con esa copia. Docker publica el puerto en loopback. Para probar instalación en un teléfono físico, usa un acceso HTTPS local con certificado reconocido por el dispositivo.

El proyecto de Compose se llama `field-shift`. Levanta la app y un PostgreSQL interno con el volumen `field-shift-db`. Usa `docker compose up --build --detach --wait` desde este repositorio para actualizar la misma instancia.

La portada de **Explorar** incluye cinco escenas originales sobre parcela, riego, siembra, clima y observación satelital. Las ilustraciones fotográficas se generaron para esta interfaz y muestran escenas conceptuales. Se sirven como imágenes WebP locales desde `public/images/field-scenes/` y quedan disponibles sin conexión después de que se instale el service worker. El carrusel avanza automáticamente y también se puede recorrer con las flechas y los indicadores. La rotación se detiene al interactuar con el teclado, al situar el puntero sobre una escena o al salir de la vista. Con movimiento reducido se recorre manualmente.

El encabezado **Encuentra tu parcela** conserva el tractor a la derecha. Desde 768 px, el valle y los surcos se extienden hacia el centro y se funden con el fondo verde claro. Las dos ilustraciones se precargan para uso sin conexión. En pantallas más estrechas, el fondo verde claro da espacio al título y al texto.

**Tu cuenta.** Abre **Iniciar sesión → Crear cuenta** y escribe tu nombre, correo y una contraseña de al menos ocho caracteres. La sesión comienza al crear la cuenta. Para volver a entrar usa tu correo y contraseña. Pulsa tu nombre para cerrar sesión. El registro local no envía correos de verificación ni de recuperación de contraseña.

En **Mis parcelas**, marca la ubicación o dibuja el contorno, escribe un nombre para reconocer la parcela y pulsa **Guardar borrador**. Usa **Nueva parcela** para agregar otra y el selector **Parcelas guardadas** para reabrir cualquiera. **Consultar esta parcela** o **Consultar ubicación** abre el informe. **Ir a cultivo y agua** permite guardar el cultivo y el turno de la parcela seleccionada. Los datos de la cuenta quedan en el volumen de PostgreSQL y se recuperan al volver a iniciar sesión en esta instalación. Una cuenta vacía puede copiar un borrador de invitado guardado en este navegador.

**Cuenta local de prueba.** Entra con el ID `prueba` y la contraseña inicial `prueba123`. En la cabecera aparece **Luis**. Si el volumen ya contiene esa cuenta, se conserva la contraseña con la que se creó. El modo invitado permite guardar un borrador en el dispositivo incluso sin conexión. Las cuentas requieren conexión al servidor local.

**Guardar desde el informe.** Con sesión abierta, **Guardar cultivo y turno** vincula la siembra, la cosecha o corte, la fecha de riego y el agua por m² con la parcela guardada. Si llegas desde una ubicación nueva, **Guardar parcela, cultivo y turno** guarda el punto y la superficie de la consulta. Para conservar también los cuatro vértices, guarda el contorno primero en **Mis parcelas**. El retraso simulado se puede comparar con el turno declarado; guardar conserva la fecha declarada.

**Canales de inspección.** Para habilitar el envío desde una parcela guardada, configura `GAMC_INSPECTION_WEBHOOK` y `REGANTES_INSPECTION_WEBHOOK` con los canales HTTPS autorizados. El servidor revalida el pronóstico y el drenaje y registra la aceptación por canal. El cuerpo del POST es un aviso JSON y el encabezado `Idempotency-Key` identifica el aviso para deduplicación en el receptor. Si el adaptador lo exige, configura `INSPECTION_WEBHOOK_TOKEN`. Sin ambos canales, la ficha puede descargarse y compartirse manualmente.

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

Las pruebas `tests/account.e2e.mjs`, `tests/account-registration.e2e.mjs` y `tests/report-account.e2e.mjs` usan `FIELD_SHIFT_TEST_URL` y una instancia de Docker de prueba con una base vacía. Ejecútalas con `node --test --test-concurrency=1 tests/account.e2e.mjs tests/account-registration.e2e.mjs tests/report-account.e2e.mjs`. Cubren registro, datos de varias parcelas y guardado desde el informe con recuperación en desktop y móvil.

## Guion de demo

1. Abre [Explorar](http://localhost:3000). Elige un distrito, marca un punto o usa **Dibujar parcela** y marca cuatro esquinas. Pulsa **Consultar ubicación** o **Consultar esta parcela** para abrir el informe con clima, cultivos y contexto territorial. Puedes imprimirlo o guardar un PDF desde el navegador. Guarda el borrador y recupéralo desde **Mis parcelas** o **Abrir parcela guardada**.
2. En **Mi cultivo y mi agua**, registra dos campañas, cultivo actual, uso de cosecha, prioridad y turno. Si no sabes el volumen, escribe caudal y duración o define el volumen de escenario explícitamente. Guarda cada ficha antes de pasar a otra pantalla.
3. Desde la portada, **Abrir simulación de riego** abre directamente **Demo La Maica**, incluso si ya guardaste otra parcela. También puedes elegir la demo en **Rotaciones**. La primera campaña es maíz forrajero. La segunda compara avena forrajera, cebada forrajera y haba. Alterna **Turno previsto / 5 días más tarde**, compara las métricas y abre **¿Por qué?** para ver el periodo, la procedencia y los supuestos. Después puedes probar otra prioridad de la demo y ver cómo afecta a la compatibilidad. El haba queda condicionada al destino, al agua y a la aptitud local. **Mi parcela** cambia a los datos guardados cuando hay un perfil suficiente y compatible con el corte histórico.
4. Abre **Agua** para leer la lluvia reciente, alternar el pronóstico entre **7 días** y **14 días** y revisar la acción para el regante. Cuando coinciden lluvia intensa y exposición cartografiada, abre la ficha de inspección y descárgala. El caso positivo se puede repetir con `npm run test:e2e`, que usa condiciones controladas.
5. Regresa a **Mi parcela**, selecciona **Tirani · D13 / Tunari**, pulsa **Consultar ubicación** y guarda. La comparación indica qué datos faltan y mantiene las rotaciones de La Maica dentro de su demo. Separa la información agrícola guardada por coordenadas para evitar atribuir cultivos de una parcela a otra.
6. En **Clima y cultivos para este punto**, elige el día de siembra, el destino de la cosecha y el pH si lo mediste. Revisa el pronóstico de ese día, los días cercanos con temperatura compatible y cuántos ciclos históricos fueron favorables. Abre **Ver datos del ciclo** para ver su duración y **Panorama estacional** para consultar el boletín del Pacífico ecuatorial. En **Agua → Avisos climáticos**, consulta los días cálidos previstos y elige si quieres activar avisos del navegador.

Con el corte SMAP importado, la demo parte de **62,9 % del agua disponible**. El turno de 400 m³ pasa del 26 al 31 de mayo de 2025. Los días de estrés cambian de 0 a 1 en avena, de 0 a 4 en cebada y de 5 a 10 en haba. La avena conserva la preferencia del modelo para forraje. En **¿Por qué?** se muestran el riego suplementario, la lluvia de esos cinco días, las fuentes y la referencia retrasada con POWER y 72 % de agua inicial. A la precisión mostrada, el resultado de mayo coincide con esa referencia. El calendario de riego cada 17 días y el volumen son supuestos de la demo.

## Datos y licencias

| Fuente | Uso |
| --- | --- |
| [GAMC · Proyecto 04](https://recursosgamc.cochabamba.bo/api-doc) | Límite Distritos, Periurbanos y Drenaje e Influencia. WMS con BBOX de la vista en EPSG:3857. La consulta usa los atributos y distingue coincidencia única, ambigua, consulta vacía e indisponibilidad. |
| [NASA POWER Daily](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) | Serie regional diaria UTC de noviembre de 2024 a agosto de 2025 para ET₀. La precipitación corregida respalda los días que carecen de Final completo. |
| [NASA POWER Daily](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) y [FAO EcoCrop](https://www.fao.org/geospatial/data-and-tools/data-portals/ecocrop/en) | El explorador consulta los últimos diez años calendario completos en tiempo solar local, con temperatura diaria media, mínima y máxima, humedad relativa y precipitación corregida. Usa los cuatro cultivos que Zama seleccionó de su [CSV](DatosPlantas/EcoCrop_DB.csv). |
| [NOAA CPC · probabilidades ENSO](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/probabilities/) | Probabilidades oficiales trimestrales de El Niño, La Niña y fase neutra, con su mes de emisión. |
| [GPM IMERG](https://gpm.nasa.gov/data/directory) y [SMAP L4 v8](https://nsidc.org/data/spl4smgp/versions/8) | Final para días históricos completos importados y Early para lluvia reciente. SMAP aporta una estimación regional a 9 km que puede inicializar el balance si se dispone de una muestra revisada del día anterior. |
| [SoilGrids](https://docs.isric.org/globaldata/soilgrids/wcs.html) | Textura y retención a 33 y 1.500 kPa en seis profundidades. La celda utilizable está a 227 m de la referencia. Predicción regional bajo [CC BY 4.0](https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_02.html). |
| [Open-Meteo](https://open-meteo.com/en/docs) | Pronóstico diario para Cochabamba en America/La_Paz. Los días recientes modelados quedan etiquetados como tal cuando falta IMERG Early. Los datos diarios se mantienen separados del histórico de rotaciones. |
| [FAO-56](https://www.fao.org/4/x0490e/x0490e0e.htm), [EcoCrop](DatosPlantas/EcoCrop_DB.csv), [SEFO-SAM cebada](https://www.sefosam.com.bo/pdf/cebada.pdf) y [SEFO-SAM haba](https://sefosam.com.bo/pdf/ft-haba.pdf) | Kc, balance, aptitud de referencia, dosis de siembra y rendimientos cuando la fuente lo permite. Las ventanas de la demo son supuestos y el costo local de semilla queda por cotizar. |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Recortes vectoriales de La Maica y Tirani bajo ODbL. |
| [Hogaria](https://hogaria.com/geo) · Ciudatos Lab · OpenStreetMap | Polígonos orientativos del prototipo de Carla, con su atribución ODbL. Se pueden abrir sin conexión. Las coincidencias oficiales se consultan en GAMC. |
| [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) | Teselas satelitales de Esri y colaboradores. Se consultan en línea. |
| [Foto del valle de 51114u9](https://commons.wikimedia.org/wiki/File:Valle_de_Cochabamba_desde_Cordillera_Tunari.jpg) | Wikimedia Commons, CC BY-SA 4.0, reducida y recortada visualmente en la tarjeta del piloto. |
| [Imágenes de la interfaz de Carla](https://github.com/Carlaandrea22/nasaspace_farm/tree/796e40c/prototipo/public) | `valle.webp` y `cultivos.jpg`, aportadas por el prototipo. La rama de origen no indica su licencia. |
| [React Bits FadeContent](https://www.reactbits.dev/animations/fade-content) | Adaptación localizada al cambio de escenario con la [licencia de React Bits](src/features/comparison/REACT-BITS-LICENSE.md). Respeta movimiento reducido. |

Procedimiento y estado de cada extracción en [Datos regionales de La Maica](docs/data-import.md). El PDF de planificación se conserva en [InformacionNasa](InformacionNasa/caso-piloto-la-maica.pdf). Los resultados separan estimaciones regionales, previsiones meteorológicas, declaraciones del productor y supuestos.

## Modelo y decisiones

- **Demanda.** Penman–Monteith FAO-56 diario con radiación en MJ/m²/día, viento a 2 m, humedad media, temperaturas extremas y altitud local de referencia de 2.560 m. ETc potencial = ET₀ × Kc. Kc varía entre establecimiento, desarrollo, máxima demanda y fin de ciclo.
- **Agua en raíces.** Integra la diferencia entre capacidad de campo y punto de marchitez hasta la raíz efectiva. Puede inicializarse con SMAP radicular revisado del día anterior y usa 72 % de agua disponible como respaldo y para las capas que incorporan las raíces después. Aplica 85 % de lluvia efectiva y 75 % de eficiencia de riego. Acota el almacenamiento, descuenta drenaje por exceso y reduce ET real cuando falta agua. La lámina suplementaria se calcula con un balance paralelo que procura alcanzar el umbral al cierre del día. Caudal en L/s × minutos × 0,06 da m³. m³ ÷ (10 × ha) da mm.
- **Comparación.** Se mantienen clima, suelo, calendario, volumen, prioridad y demás turnos constantes. Se descartan ventanas, duraciones o fechas incompatibles antes de ordenar. Entre opciones compatibles se antepone la viabilidad y se ordena por estrés y lámina suplementaria, o en orden inverso para «Usar menos agua». La cobertura deshace empates y sirve como indicador de manejo, separado de una medición de salud del suelo. La matriz expone supuestos y restricciones que pueden cambiar la elección.
- **Decisión operativa.** La segunda semana del pronóstico tiene mayor incertidumbre. La ficha se activa ante 30 mm o más en un día de los primeros tres de pronóstico o en IMERG Early del día anterior, junto a una coincidencia de drenaje y un distrito único consultado ese día. Es un umbral de inspección del MVP. Estimar un desborde en un canal específico requiere información hidráulica.
- **Aptitud climática del explorador.** Se cuenta la temperatura media diaria dentro del rango óptimo y fuera del absoluto para cada ciclo. Un ciclo favorable exige más de la mitad de los días en el óptimo y todos dentro de los límites. Un ciclo con reservas admite hasta 10 % de días fuera, con hasta 2 °C de exceso máximo y 2 °C de distancia promedio al óptimo. Se requieren tres ciclos completos como mínimo. Un cultivo es favorable cuando la mayoría de sus ciclos es favorable y queda con reservas si la mayoría reúne ciclos favorables o con reservas. El orden prioriza destino, categoría térmica y exposición histórica, con pH medido opcional para desempatar. La lluvia anual completa se contrasta con el rango de EcoCrop como contexto. La variedad, el suelo, el agua y las ventanas locales requieren revisión antes de sembrar.
- **Clima estacional y avisos.** El panorama estacional muestra una vez los trimestres de NOAA CPC que se superponen con el periodo de evaluación y tienen al menos 70 % de probabilidad de El Niño o La Niña. Es contexto regional del Pacífico ecuatorial. La aptitud térmica se calcula con el historial de NASA POWER. En Agua, Open-Meteo activa un aviso al pronosticar una máxima de al menos 32 °C en los próximos tres días. Ambos umbrales son reglas del MVP. La vista actualiza el pronóstico al volver a ella, al recuperar conexión y cada hora mientras está activa. Los avisos del sistema dependen del permiso del navegador y funcionan con la pantalla Agua abierta. Para recibirlos con la PWA cerrada hace falta Web Push y un proceso de envío.

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
| `src/lib/browser/` | Borradores locales, cliente Better Auth y registro del service worker. |
| `src/server/auth.ts` y `src/app/api/account-draft/` | Sesiones Better Auth y borrador asociado a la cuenta en PostgreSQL. |
| `src/data/`, `public/maps/` y `public/pilots/` | Series regionales preparadas, distritos orientativos y recortes públicos de mapa. |
| `tests/` | Balance, territorio, pronóstico, importación y pruebas en navegador. |

La rama `Zama` aporta el CSV y documentos en `492a102`, el [prototipo de aptitud climática en `746c031`](https://github.com/Carlaandrea22/nasaspace_farm/blob/746c03185b064983bd1b23ffd9c92e679e6b5128/fieldshift.py) y la [evaluación por ciclo y el boletín estacional consolidado en `a4e9d5c`](https://github.com/Carlaandrea22/nasaspace_farm/commit/a4e9d5c1e60156956be3781de67be2eeb0e3af9e). El catálogo reproducible se genera con `python3 scripts/import-ecocrop.py`. El JSON generado se incluye en Docker y el CSV original permanece en `DatosPlantas/`. Las rutas `/api/climate` y `/api/enso` consultan fuentes públicas sin claves. Las coordenadas se redondean a tres decimales al consultar NASA POWER. El navegador guarda la última consulta del mismo punto y el boletín estacional tiene su propia copia fechada.

Los diez años son el periodo del historial de NASA POWER. En **Planifica tu siembra**, elige una fecha entre hoy y el final del horizonte local de hasta 14 días. El análisis histórico simula una siembra el primer día del mes de esa fecha en cada año del historial. EcoCrop aporta el rango de duración de cada especie y se usa su punto medio como referencia. El resultado cuenta ciclos completos con temperatura diaria media y requiere al menos tres. Los totales en **Ver datos del ciclo** suman los días de todos los ciclos considerados. La categoría describe el ajuste térmico regional. Si hay pronóstico de Open-Meteo, la app muestra la primera secuencia de días desde la fecha elegida cuyas mínimas y máximas respetan los límites térmicos del cultivo. La humedad del suelo y la lluvia se deben revisar antes de sembrar. ENSO se muestra una sola vez y cada porcentaje corresponde a la fase del Pacífico ecuatorial en un trimestre.

## Cumplimiento del reto

Al 15 de noviembre de 2026, el MVP demuestra la comparación de rotaciones y el seguimiento del próximo riego en La Maica. El enfoque Cochabamba añade la integración de SMAP e IMERG junto con NASA POWER y un pronóstico abierto. El catálogo global sugiere otras fuentes para distintos países y preguntas de análisis. El proyecto se concentra en las aplicables al piloto. [Reto Field Shift](https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/?tab=details) · [Recursos NASA](https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/?tab=resources) · [Enfoque Cochabamba](https://www.spaceappschallenge-cbba.com/index.php) · [GAMC Proyecto 04](https://recursosgamc.cochabamba.bo/api-doc)

| Criterio | Evidencia en la versión local | Pendiente |
| --- | --- | --- |
| Tres rotaciones y decisión de riego | La Maica compara dos campañas con estrés, riego suplementario, cobertura estimada y prioridad. Se puede retrasar cinco días un solo turno, manteniendo fijas las demás entradas. | Sustituir la secuencia habitual y el turno ilustrativos por registros de un productor. D13 verifica ubicación y muestra los datos necesarios para una comparación propia. |
| NASA POWER y evapotranspiración | Hay 304 días históricos para ET₀ FAO-56 y el balance con Kc por etapa. Explorar usa además un historial térmico de 2016 a 2025 verificado en vivo. | Ampliar la evaluación a campañas contrastantes y cotejar el clima regional con referencias locales. |
| SMAP L4 v8 | El corte AppEEARS del 11 de noviembre de 2024 UTC ya está integrado. Se promediaron ocho intervalos de tres horas de ambas capas. El modelo usa SMAP radicular con SoilGrids para estimar 62,9 % del agua disponible inicial. | Validar la estimación regional con un dato de campo cuando esté disponible. |
| GPM IMERG Final y Early | El balance histórico usa 304 días UTC de IMERG Final V07B de NASA GES DISC. «¿Por qué?» muestra su cobertura efectiva. Agua usa IMERG Early V07C de NASA para los días 11 a 13 de noviembre de 2026 que coincidan con la ventana de lluvia reciente. | Actualizar el corte de Early para incorporar nuevos días completos. |
| Suelo, agronomía y sostenibilidad | SoilGrids aporta seis profundidades con textura y retención regional. El motor usa la retención, calcula pérdidas por exceso y muestra días de cobertura. El catálogo muestra Kc, referencias parciales de heladas, sequía, semilla y rendimiento. | Validar ventanas, precios relativos, variedades, rendimientos y drenaje del suelo. La capa municipal describe exposición territorial. La cobertura es un indicador de manejo y los efectos sobre erosión, materia orgánica, nutrientes y plagas siguen pendientes de medición. |
| GAMC Proyecto 04 | Las tres capas autorizadas respondieron en Docker. Se verificaron mapas PNG, leyendas PNG y atributos para Periurbanos, Drenaje e Influencia y Límite Distritos. Los puntos de referencia devolvieron D9/Itocta y D13/Tunari. | Las capas son de lectura. Para el envío institucional se necesita acordar un destinatario y protocolo con el GAMC o la asociación. |
| Pronóstico a 7 y 14 días y aviso por sector | Open-Meteo devolvió 14 días con lluvia y ET₀. La app compara los horizontes y genera una ficha descargable o compartible al coincidir una señal de lluvia intensa con exposición cartografiada. La descarga se probó con lluvia simulada. | Validar el umbral con un regante y comprobar el circuito de recepción. Una predicción de desborde necesita datos hidráulicos. |
| Interfaz para el productor | Flujo móvil sin cuenta, borrador local, mapa distrital y simulación disponibles sin conexión tras precarga. | Medir el consumo con una red lenta y observar si un productor interpreta el resultado y sabe qué revisar antes de regar. |

La guía global evalúa impacto, creatividad, validez, relevancia y presentación. El cambio de turno aporta una prueba reproducible de creatividad, y el uso de POWER y FAO-56 aporta evidencia de relevancia y validez. Para reforzar el impacto hace falta una prueba con un productor o regante. La presentación puede recorrer parcela, comparación y la acción frente al próximo turno. [Guía de evaluación de NASA Space Apps](https://www.spaceappschallenge.org/resources/judging-awards-guide/)

El PDF de planificación, en la página 4, recoge la escala de 0 a 4 para 15 preguntas de la evaluación local. La correspondencia pregunta por pregunta queda pendiente hasta obtener los enunciados. [Planificación del piloto](InformacionNasa/caso-piloto-la-maica.pdf)

Para la presentación global, la guía pide un enlace público al proyecto y una demo accesible como presentación de hasta siete diapositivas o video de hasta 30 segundos. La versión Docker sirve para la demostración local. El enlace público y el material de presentación quedan pendientes de preparar. [Guía de entrega de NASA Space Apps](https://www.spaceappschallenge.org/resources/project-submission-guide/)

Para cerrar la brecha principal, hay que reproducir La Maica con las fuentes de humedad y lluvia cargadas, mostrar en **¿Por qué?** cuál se usó y con qué fecha y comparar cómo cambia la decisión. El procedimiento de acceso e importación está en [Datos regionales de La Maica](docs/data-import.md).

## Verificación y pendientes

- En la versión integrada en `Luis`, Chrome verificó el encabezado de parcela a 320, 390, 768 y 1440 px. La confirmación mostró en vivo el clima y los datos municipales de la referencia de La Maica y de Tirani. Para noviembre, avena y cebada resultaron posibles con reservas en La Maica, mientras que maíz y haba mostraron poco ajuste térmico. Las pruebas de navegador también cubren la reapertura sin conexión y el acceso directo a la simulación con un borrador de D13 guardado.
- Flujo climático probado en Chrome móvil contra NASA POWER, NOAA CPC y Open-Meteo desde Docker. D9 y D13 devolvieron cuatro fichas con diez años de historia y compartieron los valores de la cuadrícula regional en la consulta. Las pruebas controladas cubren cambio de mes, filtro por destino, pH medido, separación de consultas por punto, copia local sin conexión, alertas de calor y ENSO, y activación y deduplicación de notificaciones.
- Integración de la interfaz comprobada en Docker con Chrome a 390 px y 1440 px. Se verificaron la navegación, las teselas satelitales y la búsqueda en vivo, y el centrado con geolocalización emulada. Playwright comprobó que el mapa distrital y los borradores de parcela y cultivo se recuperan sin conexión, que el escenario cambia la fecha del turno sin modificar volumen ni prioridad, que Tirani indica sus faltantes y que la ficha de inspección se descarga con un pronóstico de prueba.
- GAMC en vivo con las nueve combinaciones de capa y operación `GetMap`, `GetLegendGraphic` y `GetFeatureInfo`. D9 e Itocta y D13 y Tunari devolvieron una coincidencia única. También se verificaron una respuesta ambigua y una sin coincidencias.
- NASA POWER y SoilGrids regionales comprobados. Open-Meteo respondió con 14 días para La Maica. La ficha de inspección se abrió y descargó con exposición GAMC real de D4 y un pronóstico de prueba de 40 mm. La matriz y su fuente de lluvia aparecen en **¿Por qué?**.
- SMAP se verificó con la descarga original de AppEEARS y su catálogo de granulos. La prueba en Chrome confirma que se usa para inicializar el balance y que se puede comparar con el supuesto anterior.
- IMERG Final V07B se importó desde los NetCDF diarios originales de NASA GES DISC. La serie de La Maica tiene 304 días UTC válidos del 1 de noviembre de 2024 al 31 de agosto de 2025. El corte de IMERG Early V07C se verificó en los 144 HDF5 originales y contiene tres fechas en hora boliviana, del 11 al 13 de noviembre de 2026. El importador conserva faltantes distintos de cero. [Reproducir el corte y habilitar Earthdata](docs/data-import.md#imerg-final-y-early)
- Pendientes de campo: historial y turno reales de La Maica, superficie, ventanas y variedades, cotizaciones de semilla y una prueba de comprensión con productor, regante o técnico. D13 requiere su propio perfil de suelo y clima, calendario, secuencia, alternativas compatibles y riego. El resultado del modelo es una simulación. Las cifras de ahorro real requieren validación en campo.
- Las 15 preguntas de evaluación están pendientes de correspondencia. El PDF documenta la escala de 0 a 4. La evidencia disponible incluye pruebas automatizadas, trazabilidad por fuente, comparación reproducible y recorrido móvil.
## Prototipo independiente de Carla

La aplicación integrada se ejecuta desde la raíz. El prototipo de interfaz
anterior está en `prototipo/` y el simulador de consola se ejecuta con
`node piloto.mjs`.
