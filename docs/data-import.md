# Datos regionales de La Maica

Field Shift usa un corte regional reproducible para ensayar las rotaciones. Las coordenadas de referencia son **−17.42442, −66.18272**. Los archivos fuente y las credenciales se guardan fuera del repositorio. Importar resultados públicos de la referencia y recompilar con `docker compose up --build --detach --wait` incorpora el nuevo corte. Utiliza otro archivo o flujo local para extracciones de parcelas privadas.

| Fuente | Estado al 15 de noviembre de 2026 | Qué usa la aplicación |
| --- | --- | --- |
| NASA POWER | 304 días completos entre el 1 de noviembre de 2024 y el 31 de agosto de 2025, UTC. | Máxima, mínima, humedad, viento a 2 m y radiación para ET₀. PRECTOTCORR queda como respaldo donde falte IMERG Final. La altitud devuelta corresponde a la grilla de POWER. |
| SoilGrids WCS | 24 coberturas verificadas, con cuatro propiedades y seis profundidades entre 0 y 200 cm. | Perfil de una celda válida a 227 m de la referencia. La celda en la coordenada de referencia carece de valores utilizables para el perfil. Los valores son predicciones regionales. |
| GPM IMERG Final | 304 días UTC importados de los NetCDF originales de NASA GES DISC, colección `GPM_3IMERGDF` V07B, en mm/día. | El balance da prioridad a IMERG Final. La comparación muestra su versión y cobertura. |
| GPM IMERG Early | 192 HDF5 originales V07C de NASA GES DISC. La Maica cubre del 11 al 13 de noviembre de 2026. Tirani cubre del 11 al 14. Cada día tiene 48 valores válidos en hora boliviana. | Agua usa los totales de Early dentro de la celda y las fechas importadas. Open-Meteo cubre los días sin Early y las ubicaciones fuera de ambas celdas. |
| SMAP L4 v8 | El paquete de AppEEARS trae las dos variables, ocho intervalos de tres horas del 11 de noviembre de 2024 UTC y sus ocho granulos verificados en CMR. | Usa el promedio diario de humedad radicular junto con SoilGrids para iniciar la demo con 62,94 % del agua disponible. La humedad superficial se muestra como contexto. |

## Qué habilitar en Earthdata

1. Inicia sesión en [Earthdata Login](https://urs.earthdata.nasa.gov/). Autoriza [NASA GES DISC](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDF_07/summary) y [AppEEARS](https://appeears.earthdatacloud.nasa.gov/) al entrar por primera vez. Si vas a bajar gránulos SMAP directamente, autoriza también la aplicación de acceso de [NSIDC DAAC](https://nsidc.org/data/spl4smgp/versions/8). El menú **Applications → Authorized Apps** permite preautorizar las aplicaciones para descargas por terminal. [Guía oficial](https://urs.earthdata.nasa.gov/documentation/for_users/how_to_preauth_app)
2. En [Earthdata Search para IMERG Early](https://search.earthdata.nasa.gov/search/granules?p=C2723758340-GES_DISC), filtra los **tres días locales más recientes con cobertura completa**. Usa **Download All → Download all data → Done → Download Data** para obtener los archivos HDF5 originales con sus nombres. Guarda las exportaciones fuera del repositorio. El normalizador extrae la celda más cercana a **−17.42442, −66.18272**. El corte SMAP del **11 de noviembre de 2024 UTC** y el corte histórico de IMERG Final ya están integrados.
3. Importa con los comandos de abajo y vuelve a compilar Docker. Para quien ya tenga acceso, compartir las exportaciones permite continuar con la importación. Las credenciales se gestionan en Earthdata o en el cliente local de descarga. [Instrucciones de descarga con cURL y Wget](https://urs.earthdata.nasa.gov/documentation/for_users/data_access/curl_and_wget)

## NASA POWER y SoilGrids

Python 3.11 o posterior ejecuta el importador. La extracción WCS requiere `rasterio` y el muestreo de granulos NASA requiere `xarray` y `netCDF4`. Pueden instalarse en un entorno virtual aparte. La aplicación Docker usa los JSON preparados y puede compilar sin estas dependencias.

```sh
python3 scripts/import-nasa.py power --start 2024-11-01 --end 2025-08-31
python3 -m venv /tmp/field-shift-data-env
/tmp/field-shift-data-env/bin/pip install rasterio xarray netCDF4
/tmp/field-shift-data-env/bin/python scripts/import-nasa.py soil
```

El importador rechaza unidades inesperadas y escribe los valores ausentes como `null`. POWER permite reproducir el corte desde una respuesta original con `--raw /ruta/power.json`. Para SoilGrids, `--tiff-dir /ruta/recortes` lee los 24 GeoTIFF identificados por nombre, por ejemplo `wv0033_0-5cm.tif`. El procedimiento obtiene los valores medios para `wv0033`, `wv1500`, `sand` y `clay` del mismo píxel WCS en EPSG:4326. Selecciona la coordenada válida más cercana con datos completos en todas las capas dentro del recorte. Divide `wv0033` y `wv1500` por 1000 para obtener m³/m³, y `sand` y `clay` por 10 para obtener porcentajes.

Fuentes y uso público. [NASA POWER Daily](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) · [SoilGrids WCS](https://docs.isric.org/globaldata/soilgrids/wcs.html) · [ISRIC y licencia CC BY 4.0](https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_02.html)

## IMERG Final y Early

El corte histórico incluido usa la variable `precipitation` de los 304 NetCDF diarios originales V07B. Para el punto de referencia de La Maica (−17.42442, −66.18272), se toma la celda de 0,1° centrada en **−17.45, −66.15**. La serie contiene un valor en mm/día por cada fecha UTC del **1 de noviembre de 2024 al 31 de agosto de 2025**, ambas inclusive. Se guarda en la clave `imerg` de `src/data/la-maica-sources.json`. [Producto diario de NASA GES DISC](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDF_07/summary)

Con una sesión [Earthdata Login](https://urs.earthdata.nasa.gov/) autorizada para NASA GES DISC, busca las colecciones `GPM_3IMERGDF` v07 para Final diario y `GPM_3IMERGHHE` v07 para Early de media hora. Para Final también se admite `GPM_3IMERGHH` de media hora. Descarga o solicita subconjuntos que contengan la celda alrededor de la referencia, conservando los nombres de granulo, la variable `precipitation` y las coordenadas `lat` y `lon`. El importador admite NetCDF4 y HDF5 georreferenciados y rechaza archivos con una versión o corrida distinta de la especificada. Los productos diarios son acumulaciones `mm/day` para días UTC; una tasa `mm/h` de media hora se multiplica por 0,5 antes de sumarla.

Ejemplo para Final diario V07B. Para otra versión, usa la que figure en cada nombre de archivo. Los argumentos delimitan el mismo periodo UTC que POWER. Los días sin Final completo se conservan como faltantes y el balance usa POWER para esas fechas.

```sh
DATA_PY=/tmp/field-shift-data-env/bin/python
"$DATA_PY" scripts/import-nasa.py normalize-imerg /ruta/final /tmp/field-shift-final.csv --run final --version 07B --daily
"$DATA_PY" scripts/import-nasa.py imerg-final /tmp/field-shift-final.csv --units mm/day --version 07B --start 2024-11-01 --end 2025-08-31
```

El importador también admite una extracción alternativa de `IMERG_PRECTOT` en UTC con `python3 scripts/import-nasa.py imerg-final-power`. Ese comando reemplaza la serie incluida. Exige que el periodo termine al menos 120 días atrás para evitar IMERG Late y registra la consulta a la API pública. [Metodología NASA POWER para IMERG](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/#imerg-integrated-multi-satellite-retrievals-for-gpm)

El corte Early V07C incluido se descargó mediante Earthdata Download desde NASA GES DISC. El importador usa la variable `precipitation` de la celda centrada en **−17.45, −66.15** y guarda los totales de 24 horas en `src/data/imerg-early.json`. La revisión de los 144 HDF5 confirmó **0 mm** el 11, **18,51 mm** el 12 y **5,98 mm** el 13 de noviembre de 2026 en hora boliviana. [Gránulos del corte en Earthdata Search](https://search.earthdata.nasa.gov/search/granules?p=C2723758340-GES_DISC&qt=2026-11-11T04%3A00%3A00.000Z%2C2026-11-14T03%3A59%3A59.999Z)

Para reproducir el corte de La Maica, filtra del `2026-11-11 04:00 UTC` al `2026-11-14 03:59:59 UTC`. Los gránulos empiezan a las `04:00 UTC` del primer día y terminan con el intervalo que empieza a las `03:30 UTC` del día siguiente al final. Esa ventana cubre tres días completos en Bolivia. [Frecuencia y latencia de IMERG](https://gpm.nasa.gov/data/imerg)

```sh
"$DATA_PY" scripts/import-nasa.py normalize-imerg /ruta/early /tmp/field-shift-early.csv --run early --version 07C
"$DATA_PY" scripts/import-nasa.py imerg-early /tmp/field-shift-early.csv --units mm/h --version 07C --start 2026-11-11 --end 2026-11-13
```

También se admite un CSV revisado con encabezado `timestamp_utc,precipitation` para medias horas UTC o `date,precipitation` para Final diario UTC. La conversión conserva cero como valor válido. Una marca fuera de la rejilla o un intervalo duplicado se trata como error. Con cualquier intervalo faltante, el total del día queda `null`. Una importación sin ningún día completo conserva el corte anterior. Usa `--units mm` únicamente si cada intervalo de media hora contiene una acumulación y la escala ya se aplicó.

Para incorporar Tirani, usa el mismo conjunto de granulos originales si contiene esa celda. Agrega `--site tirani` en ambos comandos. El importador verifica que la coordenada de la grilla sea la de Tirani y actualiza únicamente esa celda. Si la descarga es regional, debe incluir el centro `−17.35, −66.15`. La celda de La Maica se conserva y se puede actualizar con `--site la-maica`.

El corte incluido de **Tirani** dio **0 mm** el 11, **10,735 mm** el 12, **5,64 mm** el 13 y **14,175 mm** el 14 de noviembre de 2026. Para reproducir únicamente el 14 en hora boliviana, filtra del `2026-11-14 04:00:00 UTC` al `2026-11-15 03:59:59 UTC`. Descarga los 48 HDF5 originales con **Download All → Download all data → Done → Download Data → Download Files** y Earthdata Download. Usa `--site tirani` y `--start 2026-11-14 --end 2026-11-14` para agregar ese día. [Gránulos del 14 de noviembre en Earthdata Search](https://search.earthdata.nasa.gov/search/granules?p=C2723758340-GES_DISC&qt=2026-11-14T04%3A00%3A00.000Z%2C2026-11-15T03%3A59%3A59.999Z)

Fuentes y cita. [Directorio NASA GPM](https://gpm.nasa.gov/data/directory) · [Final diario V07](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDF_07/summary) · [Early de media hora V07](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGHHE_07/summary) · [NASA GIS Final](https://gis.earthdata.nasa.gov/portal/rest/services/GESDISC/GPM_3IMERGHH/ImageServer) · [NASA GIS Early](https://gis.earthdata.nasa.gov/portal/rest/services/GESDISC/GPM_3IMERGHHE/ImageServer)

## SMAP L4 v8

En [AppEEARS](https://appeears.earthdatacloud.nasa.gov/) abre **Extract → Point Sample**, inicia sesión con Earthdata, introduce la coordenada pública y el periodo, y elige `SPL4SMGP.008`. Selecciona `Geophysical_Data_sm_surface` y `Geophysical_Data_sm_rootzone` y descarga el CSV del punto. AppEEARS puede rotular el producto como diario y entregar ocho filas con hora UTC por día. El normalizador calcula el promedio aritmético de ambas variables con las ocho lecturas de 01:30 a 22:30 UTC. Si falta un intervalo o un valor, deja el día como `missing`. También admite series ya agregadas con una fila por día.

```sh
python3 scripts/import-nasa.py normalize-appeears /ruta/LaMaica-results.csv /tmp/field-shift-smap.csv
# En el CSV normalizado, marca accepted solo en las filas revisadas.
python3 scripts/import-nasa.py smap /tmp/field-shift-smap.csv
```

El esquema normalizado es `date,surface,root,quality`, con fracciones m³/m³ en `surface` y `root`. El normalizador conserva los pares numéricos como `suspect` hasta revisar la fecha, la ubicación, los rangos, los faltantes y los avisos del proveedor. La revisión del piloto comprobó la solicitud AppEEARS, la misma celda en las ocho filas, su cobertura completa, ambas fracciones en rango y el catálogo CMR. El corte del 11 de noviembre de 2024 pertenece a la versión científica `Vv8012` y queda fuera del incidente de geolocalización de mayo a julio de 2026. `accepted` registra esta revisión para la demo. El paquete entregado contiene las dos capas de humedad sin una capa de control de calidad por píxel. [Aviso de actualización de NSIDC](https://nsidc.org/data/user-resources/data-announcements/data-set-updates-smap-level-4)

El CSV original `La-Maica-SMAP-SPL4SMGP-008-results.csv` tiene SHA-256 `885adf26d3584f2e19ad413ba074e1bdff98b3ae88827bce4bb051a2b65d1da8`. Para el punto de La Maica, los promedios son **0,15911811 m³/m³ en superficie** y **0,26286319 m³/m³ en la zona radicular**. La app incluye el promedio revisado en `src/data/la-maica-sources.json`.

El balance usa la fracción radicular revisada para estimar cuánto queda entre marchitez y capacidad de campo. Convierte la humedad de 0–100 cm a milímetros y la normaliza contra ambas láminas integradas de SoilGrids a 1 m. Acota la fracción a 0–100 % y la aplica al almacenamiento inicial de cada rotación. La humedad superficial se muestra como contexto y las capas que incorporan las raíces luego conservan el supuesto de 72 %. La comparación mantiene la misma humedad inicial en ambos turnos y muestra una referencia con POWER y 72 % cuando usa datos satelitales en el cálculo.

Cita de SMAP. Reichle, R. et al. (2025). *SMAP L4 Global 3-hourly 9 km EASE-Grid Surface and Root Zone Soil Moisture Geophysical Data*, versión 8. NASA NSIDC DAAC. [DOI](https://doi.org/10.5067/T5RUATAQREF8) · [Extracción de puntos en AppEEARS](https://nsidc.org/data/user-resources/help-center/how-extract-point-and-area-data-samples-using-appeears)
