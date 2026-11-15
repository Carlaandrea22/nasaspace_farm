# Entrega local: consulta por parcela

Verificación del 15 de noviembre de 2026. La consulta pública se abre desde el mapa en `/consulta`. No requiere una cuenta ni guardar una parcela. El informe conserva el diseño, el clima, la aptitud por cultivo y el contexto territorial existentes.

## Flujo para la demostración

1. Seleccionar un punto o dibujar los cuatro vértices del terreno. Abrir su informe.
2. **Ya tengo un cultivo y quiero revisar el agua:** indicar cultivo y fecha de siembra si no se conocen. El terreno se hereda del mapa. La consulta incluye doce opciones agrupadas; los cultivos nuevos piden cosecha prevista y la alfalfa establecida pide último y próximo corte. Se pueden ajustar riegos, humedad y eficiencias; todos los supuestos se muestran en el resultado.
3. Leer lluvia prevista, demanda y días con posible falta de agua. Comparar el turno original con cinco días de retraso. Descargar la ficha para coordinar con regantes.
4. **Quiero planificar qué sembrar después:** reutiliza el cultivo y las fechas declaradas en agua. El productor indica qué siembra habitualmente después, su prioridad y el destino de la cosecha. La comparación usa dos campañas por rotación, con el mismo periodo histórico, suelo y escenario sin riego. Se pueden ingresar costos de semilla en Bs/ha y comparar la diferencia con la habitual.
5. Consultar clima, aptitud de cultivos, panorama estacional y capas municipales. **Imprimir o guardar PDF** incluye ambos módulos visitados, aunque uno esté plegado.

Para una demostración preparada, desde **Encuentra tu parcela** usar **Tirani** o **La Maica** junto a **Marcar centro**, dibujar la parcela y pulsar **Consultar esta parcela**. Los accesos solo mueven el mapa; los datos se consultan para la selección del usuario. No se precargan datos de manejo: la persona elige su consulta, introduce cultivo y fechas, y solicita el cálculo. El suelo de Tirani se lee de su extracción oficial guardada, conservando fecha y procedencia; clima y pronóstico siguen sus fuentes. Hay un segundo ejemplo de La Maica con referencia cercana de suelo. [Guion completo de la demo](demo-desde-el-mapa.md).

## Consigna y evidencia implementada

| Objetivo local | Implementación | Alcance real |
|---|---|---|
| Humedad superficial y radicular SMAP | Subconjunto público NASA POWER SMAP L4; 20 celdas regionales | Hasta 2026-11-10. Superficie 0–5 cm y raíces 0–100 cm. Grilla de unos 9 km; producto marcado `reviewing` por el proveedor. No es medición dentro de la parcela. |
| GPM IMERG casi en tiempo real | Corte Early V07C validado con 192 gránulos. Días locales completos del 11 al 13 de noviembre en La Maica y del 11 al 14 en Tirani. | Dos celdas de 0,1°, La Maica (−17,45 / −66,15) y Tirani (−17,35 / −66,15). Fuera de las celdas o fechas verificadas se identifica la lluvia modelada. |
| Radiación y temperatura NASA POWER | Consulta por coordenada, tres años completos para balance histórico | Para esta entrega, 2023–2025 UTC. Radiación, viento a 2 m, humedad, temperaturas y elevación de grilla alimentan ET₀ FAO-56. IMERG Final vía POWER tiene prioridad en la lluvia histórica. |
| Clima histórico y aptitud | Módulo existente POWER + EcoCrop | Diez años completos, 2016–2025, tiempo solar local. Evaluación térmica; no garantiza cosecha ni sustituye la comparación hídrica. |
| Pronóstico a 7–14 días | Open-Meteo por coordenada, lluvia, ET₀, mínimas y máximas | Pronóstico complementario, no observación ni pronóstico de NASA. Un hueco invalida el balance continuo. |
| Suelo | SoilGrids ISRIC: arena, arcilla, agua a 33 y 1500 kPa, cinco horizontes hasta 1 m | Predicción de 250 m. Consulta por punto, referencia vecina explícita cuando corresponde. Respaldos verificados de La Maica y Tirani restringidos a su vecindad. |
| Balance por parcela | Retención radicular, Kc por fase, demanda, lluvia efectiva, turnos, pérdidas y estrés | Modelo diario simplificado; eficiencias y duración editables. Exceso sobre capacidad es pérdida por drenaje/escorrentía, no diagnóstico hidráulico de inundación. |
| Tres rotaciones y prioridades | Habitual + dos alternativas; calendario, destino, estrés, agua adicional, frío y cobertura | Misma serie y supuestos para las tres. Agua prioriza necesidad neta; diversificar prioriza alternar familias; las demás priorizan estrés entre opciones compatibles con el destino. No predice rentabilidad. |
| Restricciones y costos | Ventanas de siembra; semillas en Bs/ha declaradas por productor | Diferencia frente a la habitual, sin inventar precios. Rendimientos de referencia solo donde hay fuente; no se proyecta cosecha local sin calibración. |
| Sostenibilidad | Cobertura por etapa y explicación de cereales/leguminosas | Nitrógeno, plagas y residuos son consideraciones cualitativas. No se simulan balances de nutrientes ni erosión. |
| Recursos GAMC | GetFeatureInfo de límites distritales, periurbanos y drenaje | Los tres servicios autorizados, clave solo en servidor. Ausencia de coincidencia no significa ausencia de riesgo. |
| Coordinación y alertas | Ficha de inspección por lluvia y drenaje, PDF de riego y envío a canales configurables | Los canales de regantes y GAMC deben configurarse con autorización. Cada canal confirma aceptación por separado. Sin configuración, se ofrece descarga y compartición manual. |
| Acceso simple | Consulta pública, respuestas compactas, reutilización de ubicación y datos declarados, móvil y PDF | Las fuentes nuevas requieren conexión. El service worker existente permite reabrir la interfaz; datos guardados no se presentan como pronóstico vigente. |

## Cómo se armonizan las fuentes

La selección usa el punto o centro del polígono. La superficie permite convertir mm a volumen: **1 mm en 1 ha = 10 m³**. No se afirma que dibujar un polígono mejore la resolución del satélite o calcule el promedio de todos sus píxeles.

El SMAP reciente se admite si tiene entre uno y siete días de antigüedad y existe una serie continua para actualizarlo hasta hoy. Su humedad radicular se convierte a fracción de agua disponible usando la retención de SoilGrids. Se avanza con lluvia IMERG Early donde corresponda y lluvia/ET₀ modeladas en los demás días. El riego pasado es un supuesto explícito; se puede declarar un evento. Si el usuario no lo indica se supone que no hubo riego. La media diaria UTC se aproxima al comienzo del siguiente día local: se declara la posible diferencia de horario.

Si SMAP está vencido o no cubre la ubicación, se ofrece humedad modelada Open-Meteo de hoy, integrada hasta 81 cm, o un supuesto elegido por el usuario. Si faltan suelo o datos continuos, el cálculo queda sin resultado; no aparece un estado favorable falso.

La API distingue suelo disponible, sin cobertura, incompleto e indisponible. En −17.40633, −66.19196, SoilGrids respondió HTTP 200 con los valores de los cinco horizontes vacíos en la comprobación del 15 de noviembre: falta cobertura utilizable, no significa suelo no apto. El mensaje público lo explica y enlaza al pronóstico. Solo un fallo de conexión/proveedor ofrece reintento; no se inventa retención para completar el cálculo.

## Cultivos de la consulta de agua

Se ofrecen maíz forrajero, avena forrajera, cebada forrajera, alfalfa, papa, zanahoria, cebolla de cabeza, lechuga, haba, arveja verde, maíz en grano y trigo. La selección regional se apoya en [Agrecol Andes](https://www.agrecolandes.org/wp-content/uploads/2022/04/Construyendo-Agroecologia-fin.pdf) y en el [estudio de productores de Caico, Cochabamba](https://www.scielo.org.bo/scielo.php?lng=en&nrm=iso&pid=S1683-07892017000200007&script=sci_arttext&tlng=es). No afirma que todo el municipio sea apto para los doce cultivos.

Los ocho perfiles añadidos usan Kc de la [tabla 12 de FAO-56](https://www.fao.org/4/x0490e/x0490e0b.htm) y raíces/agotamiento de la [tabla 22](https://www.fao.org/4/x0490e/x0490e0e.htm). La profundidad elegida está dentro del rango publicado y no supera el metro de suelo disponible. Alfalfa, maíz en grano y trigo usan el límite inferior de 1 m; raíces más profundas requieren información adicional. Alfalfa usa coeficientes por periodo de corte, maíz en grano corresponde a cosecha seca y trigo a primavera sin dormancia. Los nuevos perfiles requieren fecha de cosecha/corte en vez de inventar una duración local. Las etapas son proporciones simplificadas del ciclo declarado, no una calibración por variedad.

El catálogo sirve para el balance del cultivo actual y la comparación pública, según la evidencia disponible. Las rotaciones con ventana estimada se contrastan con EcoCrop. La alfalfa establecida se evalúa entre cortes. El simulador histórico de La Maica conserva sus cuatro perfiles iniciales.

Las rotaciones se reproducen en el periodo común más reciente que permita evaluar las tres secuencias de forma continua. Se conservan las fechas de referencia de las campañas y se usa SMAP del día previo cuando existe, o un supuesto del 50 % de la reserva útil. Es una comparación histórica. El clima mensual se presenta separado del balance UTC.

El drenaje de GAMC aporta contexto cartográfico, no caudal, capacidad, estado de mantenimiento ni nivel de agua en los canales. Las propiedades de suelo explican almacenamiento y pérdidas; falta calibración local para modelar infiltración y anegamiento reales.

## Datos entregados y actualización

- `src/data/smap-cochabamba.json`: humedad real regional, fechas, celdas, valores nulos y procedencia. La copia temporal disponible tiene un hueco entre septiembre y noviembre de 2026; no se interpola. Se completa la última semana desde el almacén espacial más reciente.
- `src/data/soil-pilots.json`: extracción SoilGrids verificada para Tirani, con fecha y URL; el respaldo de La Maica permanece en `la-maica-sources.json`.
- `src/data/imerg-early.json`: cortes Early de La Maica y Tirani. Actualizar los cortes requiere descargar e importar archivos fuente. Cada actualización conserva la otra celda.
- `/api/parcel-sources`: suelo, humedad y SMAP por ubicación. `kind=history` entrega POWER/IMERG de los tres últimos años completos.
- `/api/weather`, `/api/climate`, `/api/territory`: pronóstico, clima histórico y tres capas municipales existentes.

```powershell
npm run data:smap
npm run data:soil
npm run build
```

La descarga SMAP utiliza el archivo público oficial y **no requiere cuenta Earthdata**. Solo descarga bloques necesarios para Cochabamba. Una nueva compilación incorpora el corte actualizado. No descarga la base mundial de NASA ni instala una actualización periódica.

Configurar `GAMC_API_KEY` en el entorno del servidor; en desarrollo se usa `.env.local`, ignorado por Git. Para Docker seguir el mecanismo `.env`/secretos del README. No poner la clave en variables `NEXT_PUBLIC_*`.

## Fuentes

- [NASA POWER: SMAP e IMERG, descripción y acceso público](https://power.larc.nasa.gov/docs/methodology/data/sources_hydrology/).
- [NASA POWER: API diaria](https://power.larc.nasa.gov/docs/services/api/temporal/daily/).
- [NASA GPM IMERG](https://gpm.nasa.gov/data/imerg).
- [Open-Meteo](https://open-meteo.com/en/docs).
- [SoilGrids ISRIC](https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_02.html).
- [FAO-56](https://www.fao.org/4/x0490e/x0490e00.htm).
- [GAMC Proyecto 04](https://recursosgamc.cochabamba.bo/api-doc).

El catálogo oficial enumera posibles recursos, no exige mezclar todos. WSS, SSURGO, CropScape, PRISM, NAIP y los productos estadounidenses señalados en ese catálogo no aportan cobertura local adecuada. Landsat/Sentinel NDVI, SRTM, ECOSTRESS y GEDI no están integrados en este entregable; no se muestran índices, pendientes ni rendimientos atribuidos a ellos. Se integran las tres familias NASA expresamente solicitadas por la consigna local.

## Verificación y límites de la entrega

Pruebas unitarias: conservación de agua, datos faltantes frente a cero, unidades, límites del píxel IMERG, turnos, inicialización, heladas y priorización. Prueba de navegador `test:delivery`: fuentes reales de La Maica, agua, retraso del turno, ficha descargable, reutilización de datos, tres rotaciones, clima, impresión, 1440 px y móvil de 390 px, más caso sin suelo/pronóstico. Lint y compilación de producción.

```powershell
npm test
npm run lint
npm run build
$env:FIELD_SHIFT_TEST_URL='http://127.0.0.1:3119'
$env:PLAYWRIGHT_CHROMIUM_CHANNEL='chrome'
npm run test:delivery
```

La prueba de fuentes reales depende de disponibilidad de los proveedores y del corte de datos; las pruebas unitarias no. `test:e2e` conserva el guion legado anterior a los cambios del flujo público; `test:delivery` verifica el flujo actual. Capturas y PDF de comprobación se escriben en `.data-cache/verification`, ignorado por Git.

Para operación institucional faltan validar coeficientes, variedades, rendimiento y precios con productores/técnicos locales, mantener las importaciones recientes y acordar destinatarios/canales de alertas con GAMC y asociaciones. El software permite consultar y preparar avisos; no debe presentarse como sistema de alerta institucional ya conectado ni como recomendación agronómica calibrada.
