"""Generate the Cochabamba screening catalogue from Zama's EcoCrop CSV."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPECIES = {
    "2175": ("Maíz forrajero", "forraje"),
    "481": ("Avena forrajera", "forraje"),
    "1232": ("Cebada forrajera", "forraje"),
    "2146": ("Haba", "consumo"),
    "1971": ("Papa", "consumo"),
    "871": ("Zanahoria", "consumo"),
    "551": ("Cebolla (cabeza)", "consumo"),
    "1313": ("Lechuga", "consumo"),
    "1721": ("Arveja (verde)", "consumo"),
    "238663": ("Maíz en grano", "consumo"),
    "2114": ("Trigo", "consumo"),
}

# Growing-period examples from FAO-56, table 11. These are scenario lengths,
# and the table's planting months and locations are not transferred to Cochabamba.
PLANTING_DAYS = {
    "1971": 130,  # Potato, semi-arid climate.
    "871": 100,  # Carrot, arid climate.
    "551": 150,  # Dry bulb onion, Mediterranean.
    "1313": 75,  # Lettuce, Mediterranean.
    "1721": 90,  # Peas, Europe.
    "238663": 140,  # Grain maize, arid climate.
    "2114": 135,  # Barley/oats/wheat, 35–45° latitude.
}

with (ROOT / "DatosPlantas/EcoCrop_DB.csv").open(encoding="latin-1", newline="") as stream:
    rows = {row["EcoPortCode"]: row for row in csv.DictReader(stream) if row["EcoPortCode"] in SPECIES}

catalogue = []
for code, (name, use) in SPECIES.items():
    row = rows[code]
    temperature = [float(row[key]) for key in ("TMIN", "TOPMN", "TOPMX", "TMAX")]
    rainfall = [float(row[key]) for key in ("RMIN", "ROPMN", "ROPMX", "RMAX")]
    minimum_days, maximum_days = (int(row[key]) for key in ("GMIN", "GMAX"))
    days = (minimum_days + maximum_days + 1) // 2
    if temperature != sorted(temperature) or rainfall != sorted(rainfall) or not 1 <= minimum_days <= maximum_days <= 365:
        raise ValueError(f"Rangos inválidos para {name}")
    catalogue.append({
        "code": code, "name": name, "species": row["ScientificName"], "use": use,
        "days": days, "cycleRange": [minimum_days, maximum_days], "temperature": temperature, "rainfall": rainfall,
        "optimalPh": [float(row[key]) for key in ("PHOPMN", "PHOPMX")],
    })
    if code in PLANTING_DAYS:
        planting_days = PLANTING_DAYS[code]
        if not minimum_days <= planting_days <= maximum_days:
            raise ValueError(f"Ciclo de referencia fuera del rango EcoCrop para {name}")
        catalogue[-1]["plantingDays"] = planting_days

(ROOT / "src/data/ecocrop.json").write_text(
    json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
)
