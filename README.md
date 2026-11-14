# Piloto Field Shift en La Maica

El piloto compara maíz forrajero seguido de avena, cebada o haba durante dos campañas. Desplaza un turno de riego de la segunda campaña cinco días y mantiene la misma lámina neta de 32 mm, el resto de los turnos, el suelo y el clima. La parcela y los valores de este ejercicio son ilustrativos.

## Ejecutar la comparación

Con Node.js, desde esta carpeta:

```sh
node piloto.mjs
node piloto.mjs --diversificar --csv=comparacion.csv
```

La primera ejecución exige forraje para ambas campañas. Con `--diversificar` se admite el haba como candidata. El orden favorece menos días sobre el umbral y después menos riego suplementario. El día cero corresponde al turno originalmente previsto y los días negativos indican estrés previo a ese turno. La tabla resume toda la segunda campaña. El CSV conserva ambas campañas para revisar cuándo cambia el resultado. Los días con cultivo son un indicador de calendario, distinto de la fracción de suelo cubierta.

## Qué calcula

El balance diario usa el esquema del [capítulo 8 de FAO 56](https://www.fao.org/4/x0490e/x0490e0e.htm). La reserva depende de la capacidad de campo, el punto de marchitez y la profundidad efectiva. El riego y la lluvia efectiva entran al inicio del día. La evapotranspiración se estima con ET₀ y Kc por etapa, ajustada por déficit cuando se supera el umbral. El indicador cuenta días en los que el agotamiento al cierre supera ese umbral. El riego suplementario resulta de una segunda simulación que agrega agua neta día a día para mantener el agotamiento dentro del umbral en la segunda campaña. Es una comparación teórica de láminas, independiente de la disponibilidad de turnos adicionales.

El modelo usa una profundidad fija de 0,60 m, un umbral fijo por cultivo y drenaje inmediato del excedente sobre capacidad de campo. Recibe lluvia ya efectiva y omite ascenso capilar. El clima, los turnos y los parámetros de cultivo son sintéticos. Los resultados ilustran sensibilidad a los supuestos del piloto y necesitan calibración de campo.

## Datos para pasar de la demo al piloto

- Confirmar parcela, área, secuencia habitual, ventanas de siembra y corte, destino del cultivo y fecha y lámina neta del turno. Sustituir la secuencia de referencia si el productor reporta otra.
- Alimentar el comparador con series alineadas de ET₀ de referencia derivada de NASA POWER y lluvia de IMERG ajustada a lluvia efectiva. Usar SMAP como contexto regional y obtener retención del suelo a las profundidades de la raíz para calibrar el balance.
- Integrar el mapa del GAMC y una vista «Mi próximo turno» que muestre el pronóstico abierto a 7 y 14 días y qué verificar con el regante. El catálogo municipal requiere una clave de servidor.
