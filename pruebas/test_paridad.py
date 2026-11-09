"""Exporta las trazas de Python para compararlas con el motor JS, nodo por nodo."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "python"))
from casos import caso_base, caso_realista, caso_estres
from kairos_core import fuerza_bruta, busqueda_heuristica, NO_PROGRAMADA

CAP = 2500


def cod(v):
    return -1 if v is NO_PROGRAMADA else v[0] * 64 + v[1]


def exportar(p, res, cap=CAP):
    orden = p.orden
    nodos = []
    for n in res.arbol.nodos[: cap + 1]:
        nodos.append({
            "id": n["id"], "padre": n["padre"], "estado": n["estado"],
            "t": None if n["tarea"] is None else orden.index(n["tarea"]),
            "v": None if n["tarea"] is None else cod(n["valor"]),
            "cota": n.get("cota"), "prioridad": n.get("prioridad"),
        })
    return {"nodos": res.nodos, "podas": res.podas, "vacios": res.vacios_detectados,
            "mejor": res.mejor_prio, "primera_poda": res.primera_poda_en_nodo, "traza": nodos}


salida = {}
for clave, caso in (("base", caso_base), ("realista", caso_realista), ("estres", caso_estres)):
    p = caso()
    salida[clave] = {
        "fb": exportar(p, fuerza_bruta(p)),
        "cd": exportar(p, busqueda_heuristica(p, usar_poda=False)),
        "poda": exportar(p, busqueda_heuristica(p, usar_poda=True)),
    }
json.dump(salida, open(Path(__file__).resolve().parent / "trazas_python.json", "w"))
print({k: {m: v[m]["nodos"] for m in v} for k, v in salida.items()})
