# Field Shift Cochabamba

PWA para pequeños productores y regantes del municipio de Cochabamba. Compara rotaciones con los mismos datos de clima y suelo, ensaya un retraso en el riego y reúne lo que conviene confirmar antes del siguiente turno. Proyecto de [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/) con [enfoque de Cochabamba](https://www.spaceappschallenge-cbba.com/index.php).

**Estado.** MVP local de cuatro pantallas. La Maica, D9 / Itocta, tiene un caso ilustrativo de punta a punta. Tirani, D13 / Tunari, tiene prueba territorial y respuesta explícita de datos faltantes. Los borradores se guardan en el navegador sin cuenta.

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

Abre [localhost:3000](http://localhost:3000) y selecciona **Continuar sin cuenta**. El puerto se puede cambiar con `FIELD_SHIFT_PORT=3001 docker compose up --build --detach --wait`. Consulta registros con `docker compose logs app` y detén el servicio con `docker compose stop`.

La PWA se puede instalar en un navegador compatible. Después de que el service worker aparezca activo, las cuatro vistas, la comparación, los mapas base locales y los borradores funcionan sin señal. La app guarda los resultados territoriales consultados con el borrador. El pronóstico conserva una copia fechada por ubicación después de una consulta y suspende la ficha de inspección cuando opera con esa copia. Los servicios externos en vivo requieren conexión. Docker publica el puerto en loopback. Para probar instalación en un teléfono físico, usa un acceso HTTPS local con certificado reconocido por el dispositivo.

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

1. Abre [Mi parcela](http://localhost:3000/la-maica/mi-parcela). Carga **La Maica · D9 / Itocta** y consulta el GAMC. Revisa las tres capas y guarda el borrador. Al recuperar la ficha puedes leer sus datos con el mapa cerrado.
2. En **Mi cultivo y mi agua**, registra dos campañas, cultivo actual, uso de cosecha, prioridad y turno. Si no sabes el volumen, escribe caudal y duración o define el volumen de escenario explícitamente. Guarda cada ficha antes de pasar a otra pantalla.
3. En **Comparar tres rotaciones**, elige **Demo La Maica**. La primera campaña es maíz forrajero. La segunda compara avena forrajera, cebada forrajera y haba. Alterna **Turno previsto / 5 días más tarde**, compara las métricas y abre **¿Por qué?** para ver el periodo, la procedencia y los supuestos. El haba queda condicionada al destino, al agua y a la aptitud local. **Mi parcela** cambia a los datos guardados cuando hay un perfil suficiente y compatible con el corte histórico.
4. Abre **Mi próximo turno** para leer la lluvia reciente, el pronóstico a 7 y 14 días y la acción para revisar con el regante. Cuando coinciden lluvia intensa y exposición cartografiada, abre la ficha de inspección y descárgala. El caso positivo se puede repetir con `npm run test:e2e`, que usa condiciones controladas.
5. Regresa a **Mi parcela**, selecciona **Tirani · D13 / Tunari**, consulta GAMC y guarda. La comparación indica qué datos faltan y mantiene las rotaciones de La Maica dentro de su demo. Separa la información agrícola guardada por coordenadas para evitar atribuir cultivos de una parcela a otra.

Con el corte inicial, el turno de 400 m³ pasa del 26 al 31 de mayo de 2025. Los días de estrés cambian de 0 a 1 en avena, de 0 a 4 en cebada y de 5 a 10 en haba. La avena conserva la preferencia del modelo para forraje. El calendario de riego cada 17 días y el volumen se eligieron para mostrar la sensibilidad del modelo y figuran como supuestos de la demo.

## Datos y licencias

| Fuente | Uso |
| --- | --- |
| [GAMC · Proyecto 04](https://recursosgamc.cochabamba.bo/api-doc) | Límite Distritos, Periurbanos y Drenaje e Influencia. WMS con BBOX de la vista en EPSG:3857. La consulta usa los atributos y distingue coincidencia única, ambigua, consulta vacía e indisponibilidad. |
| [NASA POWER Daily](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) | Serie regional diaria UTC de noviembre de 2024 a agosto de 2025 para ET₀. Precipitación corregida como fuente de respaldo histórico si falta una serie Final validada. |
| [GPM IMERG](https://gpm.nasa.gov/data/directory) y [SMAP L4 v8](https://nsidc.org/data/spl4smgp/versions/8) | Final para lluvia histórica si se importa una serie validada. Early para lluvia reciente aplicable. SMAP da contexto regional de humedad a 9 km con fecha y calidad. |
| [SoilGrids](https://docs.isric.org/globaldata/soilgrids/wcs.html) | Textura y retención a 33 y 1.500 kPa en seis profundidades. La celda utilizable está a 227 m de la referencia. Predicción regional bajo [CC BY 4.0](https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_02.html). |
| [Open-Meteo](https://open-meteo.com/en/docs) | Pronóstico diario para Cochabamba en America/La_Paz. Los días recientes modelados quedan etiquetados como tal cuando falta IMERG Early. Los datos diarios se mantienen separados del histórico de rotaciones. |
| [FAO-56](https://www.fao.org/4/x0490e/x0490e0e.htm), [EcoCrop](DatosPlantas/EcoCrop_DB.csv), [SEFO-SAM cebada](https://www.sefosam.com.bo/pdf/cebada.pdf) y [SEFO-SAM haba](https://sefosam.com.bo/pdf/ft-haba.pdf) | Kc, balance, aptitud de referencia, dosis de siembra y rendimientos cuando la fuente lo permite. Las ventanas de la demo son supuestos y el costo local de semilla queda por cotizar. |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Recortes vectoriales de La Maica y Tirani bajo ODbL. |
| [Foto del valle de 51114u9](https://commons.wikimedia.org/wiki/File:Valle_de_Cochabamba_desde_Cordillera_Tunari.jpg) | Wikimedia Commons, CC BY-SA 4.0, reducida y recortada visualmente en la portada. |
| [React Bits FadeContent](https://www.reactbits.dev/animations/fade-content) | Adaptación localizada al cambio de escenario con la [licencia de React Bits](src/features/comparison/REACT-BITS-LICENSE.md). Respeta movimiento reducido. |

Procedimiento y estado de cada extracción en [Datos regionales de La Maica](docs/data-import.md). El PDF de planificación se conserva en [InformacionNasa](InformacionNasa/caso-piloto-la-maica.pdf). Los resultados separan estimaciones regionales, previsiones meteorológicas, declaraciones del productor y supuestos.

## Modelo y decisiones

- **Demanda.** Penman–Monteith FAO-56 diario con radiación en MJ/m²/día, viento a 2 m, humedad media, temperaturas extremas y altitud local de referencia de 2.560 m. ETc potencial = ET₀ × Kc. Kc varía entre establecimiento, desarrollo, máxima demanda y fin de ciclo.
- **Agua en raíces.** Integra la diferencia entre capacidad de campo y punto de marchitez hasta la raíz efectiva. Parte de 72% de agua disponible y aplica 85% de lluvia efectiva y 75% de eficiencia de riego. Acota el almacenamiento, descuenta drenaje por exceso y reduce ET real cuando falta agua. La lámina suplementaria se calcula con un balance paralelo que procura alcanzar el umbral al cierre del día. Caudal en L/s × minutos × 0,06 da m³. m³ ÷ (10 × ha) da mm.
- **Comparación.** Se mantienen clima, suelo, calendario, volumen, prioridad y demás turnos constantes. Se descartan ventanas, duraciones o fechas incompatibles antes de ordenar. Entre opciones compatibles se antepone la viabilidad y se ordena por estrés y lámina suplementaria, o en orden inverso para «Usar menos agua». La cobertura deshace empates y sirve como indicador de manejo, separado de una medición de salud del suelo. La matriz expone supuestos y restricciones que pueden cambiar la elección.
- **Decisión operativa.** La segunda semana del pronóstico tiene mayor incertidumbre. La ficha se activa ante 30 mm o más en un día de los primeros tres de pronóstico o en IMERG Early del día anterior, junto a una coincidencia de drenaje y un distrito único consultado ese día. Es un umbral de inspección del MVP. Estimar un desborde en un canal específico requiere información hidráulica.

## Arquitectura

Una aplicación Next.js App Router en Docker conserva la UI existente con React, TypeScript, Tailwind y shadcn/ui. Las páginas públicas y sus recursos se precargan en el service worker, independiente de IndexedDB y de los adaptadores de servidor. Las APIs dinámicas usan variables del servidor y las respuestas privadas quedan fuera de la caché de la PWA.

| Ruta | Responsabilidad |
| --- | --- |
| `src/app/la-maica/` | Piloto y cuatro pantallas enlazadas como invitado. |
| `src/features/pilot/` y `src/features/territory/` | Formularios, mapa Leaflet, ficha municipal y referencias territoriales. |
| `src/features/comparison/` | Matriz y gráfico Recharts, escenarios y trazabilidad. |
| `src/domain/water-balance/` | Conversión de unidades, ET₀, balance diario y orden de preferencias. |
| `src/features/operations/` | Pronóstico, etapa del cultivo y ficha de inspección. |
| `src/server/` y `src/app/api/` | Adaptadores de GAMC y Open-Meteo, con validación y tiempo de espera. |
| `src/lib/browser/` | Índice de borradores y registro del service worker. |
| `src/data/` y `public/pilots/` | Series regionales preparadas y recortes públicos de mapa. |
| `tests/` | Balance, territorio, pronóstico, importación y pruebas en navegador. |

## Verificación y pendientes

- GAMC en vivo con las nueve combinaciones de capa y operación `GetMap`, `GetLegendGraphic` y `GetFeatureInfo`. D9 e Itocta y D13 y Tunari devolvieron una coincidencia única. También se verificaron una respuesta ambigua y una sin coincidencias.
- NASA POWER y SoilGrids regionales comprobados. Open-Meteo respondió con 14 días para La Maica. La ficha de inspección se abrió y descargó con exposición GAMC real de D4 y un pronóstico de prueba de 40 mm. La matriz y su fuente de lluvia aparecen en **¿Por qué?**.
- IMERG Final y Early quedan pendientes de un subconjunto completo y validado. La consulta de granulos oficiales requiere una sesión Earthdata autorizada y la alternativa pública dio muestras incompletas. AppEEARS requiere acceso autenticado para la extracción SMAP. El importador incluye ambos procedimientos y conserva faltantes distintos de cero.
- Pendientes de campo: historial y turno reales de La Maica, superficie, ventanas y variedades, cotizaciones de semilla y una prueba de comprensión con productor, regante o técnico. D13 requiere su propio perfil de suelo y clima, calendario, secuencia, alternativas compatibles y riego. El resultado del modelo es una simulación. Las cifras de ahorro real requieren validación en campo.
- Las 15 preguntas de evaluación están pendientes de correspondencia. El PDF documenta la escala de 0 a 4. La evidencia disponible incluye pruebas automatizadas, trazabilidad por fuente, comparación reproducible y recorrido móvil.
- La cuenta opcional con Better Auth y PostgreSQL queda para una etapa posterior al MVP de invitado.
