# Datos regionales de La Maica

Field Shift usa un corte regional reproducible para ensayar las rotaciones. Las coordenadas de referencia son **−17.42442, −66.18272**. Los archivos fuente y las credenciales se guardan fuera del repositorio. Importar resultados públicos de la referencia y recompilar con `docker compose up --build --detach --wait` incorpora el nuevo corte. Utiliza otro archivo o flujo local para extracciones de parcelas privadas.

| Fuente | Estado al 14 de noviembre de 2026 | Qué usa la aplicación |
| --- | --- | --- |
| NASA POWER | 304 días completos entre el 1 de noviembre de 2024 y el 31 de agosto de 2025, UTC. | Máxima, mínima, humedad, viento a 2 m y radiación para ET₀. PRECTOTCORR aporta la precipitación histórica regional mientras falte IMERG Final. La altitud devuelta corresponde a la grilla de POWER. |
| SoilGrids WCS | 24 coberturas verificadas, con cuatro propiedades y seis profundidades entre 0 y 200 cm. | Perfil de una celda válida a 227 m de la referencia. La celda en la coordenada de referencia carece de valores utilizables para el perfil. Los valores son predicciones regionales. |
| GPM IMERG Final | Gránulo localizado en CMR. GES DISC devuelve 401 tras redirigir a Earthdata Login. NASA GIS devolvió muestras, con consultas incompletas y tiempos de espera para la serie. El servicio griddap de NOAA declara cero como relleno. | Se habilita al importar un corte válido alineado con POWER. El corte publicado contiene el registro vacío. |
| GPM IMERG Early | Gránulo localizado en CMR. GES DISC devuelve 401 tras redirigir a Earthdata Login. NASA GIS informa 48 intervalos en el catálogo para los días de prueba, pero fallaron consultas al píxel y ninguna jornada quedó completa. | Se habilita al importar los últimos días completos, en hora boliviana. El corte publicado contiene el registro vacío. |
| SMAP L4 v8 | El catálogo AppEEARS confirma el producto y ambas variables. La consulta de tareas devuelve 403 sin sesión. | Indicador regional de humedad a 9 km. El corte publicado no tiene observaciones. La información de SMAP se presenta como contexto y no reemplaza la retención de SoilGrids ni un dato de campo. |

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

Con una sesión [Earthdata Login](https://urs.earthdata.nasa.gov/) autorizada para NASA GES DISC, busca las colecciones `GPM_3IMERGDF` v07 para Final diario y `GPM_3IMERGHHE` v07 para Early de media hora. Para Final también se admite `GPM_3IMERGHH` de media hora. Descarga o solicita subconjuntos que contengan la celda alrededor de la referencia, conservando los nombres de granulo, la variable `precipitation` y las coordenadas `lat` y `lon`. El importador admite NetCDF4 y HDF5 georreferenciados y rechaza archivos con una versión o corrida distinta de la especificada. Los productos diarios son acumulaciones `mm/day` para días UTC; una tasa `mm/h` de media hora se multiplica por 0,5 antes de sumarla.

Ejemplo para Final diario V07B. Para otra versión, usa la que figure en cada nombre de archivo. Final debe abarcar el mismo periodo UTC que POWER.

```sh
DATA_PY=/tmp/field-shift-data-env/bin/python
"$DATA_PY" scripts/import-nasa.py normalize-imerg /ruta/final /tmp/field-shift-final.csv --run final --version 07B --daily
"$DATA_PY" scripts/import-nasa.py imerg-final /tmp/field-shift-final.csv --units mm/day --version 07B --start 2024-11-01 --end 2025-08-31
```

Ejemplo para Early de media hora V07C. Usa granulos de `04:00 UTC` del primer día hasta `03:30 UTC` del día siguiente al final. Esa ventana cubre medianoche a medianoche en Bolivia.

```sh
"$DATA_PY" scripts/import-nasa.py normalize-imerg /ruta/early /tmp/field-shift-early.csv --run early --version 07C
"$DATA_PY" scripts/import-nasa.py imerg-early /tmp/field-shift-early.csv --units mm/h --version 07C --start 2026-11-11 --end 2026-11-13
```

También se admite un CSV revisado con encabezado `timestamp_utc,precipitation` para medias horas UTC o `date,precipitation` para Final diario UTC. La conversión conserva cero como valor válido. Una marca fuera de la rejilla o un intervalo duplicado se trata como error. Con cualquier intervalo faltante, el total del día queda `null`. Usa `--units mm` únicamente si cada intervalo de media hora contiene una acumulación y la escala ya se aplicó.

Fuentes y cita. [Directorio NASA GPM](https://gpm.nasa.gov/data/directory) · [Final diario V07](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDF_07/summary) · [Early de media hora V07](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGHHE_07/summary) · [NASA GIS Final](https://gis.earthdata.nasa.gov/portal/rest/services/GESDISC/GPM_3IMERGHH/ImageServer) · [NASA GIS Early](https://gis.earthdata.nasa.gov/portal/rest/services/GESDISC/GPM_3IMERGHHE/ImageServer)

## SMAP L4 v8

En [AppEEARS](https://appeears.earthdatacloud.nasa.gov/) abre **Extract → Point Sample**, inicia sesión con Earthdata, introduce la coordenada pública y el periodo, y elige `SPL4SMGP.008`. Selecciona `Geophysical_Data_sm_surface` y `Geophysical_Data_sm_rootzone` y descarga el CSV del punto. AppEEARS anuncia granularidad diaria para ese muestreo. Si usas directamente el producto NSIDC de tres horas, prepara una serie diaria ya agregada y especifica el criterio de cobertura. Para la muestra de AppEEARS:

```sh
python3 scripts/import-nasa.py normalize-appeears /ruta/LaMaica-results.csv /tmp/field-shift-smap.csv
python3 scripts/import-nasa.py smap /tmp/field-shift-smap.csv
```

El esquema normalizado es `date,surface,root,quality`, con fracciones m³/m³ en `surface` y `root`. Verifica fecha, ubicación, valores de relleno y avisos del proveedor. El normalizador clasifica como `missing` los pares incompletos y conserva los pares numéricos como `suspect` hasta revisar la calidad. Registra `accepted` solo cuando esa revisión quede documentada. NSIDC reporta una incidencia de geolocalización entre el 14 de mayo y el 28 de julio de 2026. Antes de usar fechas afectadas, confirma que los granulos se hayan reemplazado.

Cita de SMAP. Reichle, R. et al. (2025). *SMAP L4 Global 3-hourly 9 km EASE-Grid Surface and Root Zone Soil Moisture Geophysical Data*, versión 8. NASA NSIDC DAAC. [DOI](https://doi.org/10.5067/T5RUATAQREF8) · [Extracción de puntos en AppEEARS](https://nsidc.org/data/user-resources/help-center/how-extract-point-and-area-data-samples-using-appeears)
