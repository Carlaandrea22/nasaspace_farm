# Consulta de agua comprensible

Solicitud de Carla: explicar el aviso de suelo, ampliar los cuatro cultivos del piloto y hacer la consulta intuitiva.

- Diagnóstico: SoilGrids HTTP 200, pero las veinte propiedades/horizontes devuelven null en −17.40633, −66.19196. Distinguir falta de cobertura de indisponibilidad; no repetir reintentos inútiles ni inventar suelo.
- Mensaje con acción: información del suelo pendiente, lluvia/pronóstico siguen disponibles. Nombres técnicos en detalle desplegable.
- Consulta de agua con doce cultivos agrupados: cuatro del piloto y ocho perfiles FAO-56 de cultivos presentes en los valles. Para nuevos cultivos pedir cosecha prevista; alfalfa pide último y próximo corte. No ampliar automáticamente el recomendador de rotaciones con ventanas locales sin validar.
- Preguntas directas, datos avanzados plegados, estados útiles, sin duplicar coordenadas ni imponer cuenta.
- Verificar unidades/perfiles, error sin cobertura, acceso a pronóstico, selección y cálculo de papa/alfalfa, escritorio y móvil.

Decisión de implementación: ampliar el catálogo de agua, manteniendo separados los perfiles para recomendar rotaciones. Los datos requeridos para cada cálculo son distintos; una lista grande por sí sola no valida fechas de siembra locales.
