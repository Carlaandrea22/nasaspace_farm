# Entrega DSS Cochabamba

**Objetivo:** consultar agua y comparar tres rotaciones desde cualquier ubicación seleccionada, sin cuenta, con datos identificables y sin trasladar las mediciones de La Maica a otros terrenos.

**Arquitectura:** conservar informe, mapa y simulador histórico existentes. Consultar SoilGrids y NASA POWER por coordenada en servidor; aprovechar IMERG cuando coinciden celda y fecha; combinar pronóstico abierto y balance FAO-56. SMAP histórico se identifica como histórico, nunca humedad actual. La ausencia de observaciones se muestra y las hipótesis se pueden revisar.

**Stack:** Next.js App Router, React, TypeScript, modelos y pruebas Node existentes.

**Especificación:** consigna local adjunta por Carla el 15-11-2026 y flujo público aprobado en este chat.

- [x] Comprobar servicios GAMC con clave solo en servidor y procedencia de cada fuente.
- [x] Añadir consulta de suelo por punto y clima diario histórico con radiación, viento y lluvia para ET0.
- [x] Balance de agua a 14 días: cultivo/siembra, humedad inicial explícita, lluvia, ETc, turno opcional y resultado incompleto si faltan datos.
- [x] Comparar rotación habitual y dos alternativas sobre el mismo periodo histórico, suelo y riego; incluir ventanas, destino, cobertura, heladas y costos de semilla declarados.
- [x] Integrar resultados imprimibles, trazabilidad y ficha de coordinación sin envío automático.
- [x] Probar cálculo, fuentes, errores, aislamiento espacial, escritorio/móvil y compilación; documentar cobertura y limitaciones reales.

## Resultado

SMAP público descargado para 20 celdas hasta 2026-11-10 sin Earthdata. Se actualiza a hoy con balance explícito cuando la antigüedad y continuidad lo permiten; alternativamente humedad modelada/supuesto. IMERG Early conserva su celda y fechas originales. Suelo regional por punto y respaldo verificado en Tirani. NASA POWER e IMERG Final por coordenada para comparación histórica. Servicios GAMC verificados en La Maica y Tirani. 26 pruebas unitarias, dos pruebas de navegador (flujo real y ausencia de fuentes), lint y compilación. Ver `docs/entregable-local.md` para requisitos, procedencia y límites de operación institucional.

## Revisión

No convertir ausencia de lluvia en cero. No presentar pronóstico como observación NASA. No interpretar drenaje cartografiado como inundación confirmada. No recomendar un cultivo descartado por calendario. No mostrar humedad SMAP de 2024 como actual. No ocultar hipótesis de eficiencia, suelo vecino o humedad inicial. No enviar avisos sin destinatario autorizado.
