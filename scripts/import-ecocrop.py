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

(ROOT / "src/data/ecocrop.json").write_text(
    json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
)
