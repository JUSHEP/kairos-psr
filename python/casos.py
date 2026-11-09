"""Los tres casos que aparecen en el colab."""
from kairos_core import Problema


def caso_base():
    # Noches del lunes y martes 18:00-22:00, tope 4 h (8 bloques), sin bloques fijos.
    return Problema(
        nombre="Caso base (3 tareas)",
        dias=["Lunes", "Martes"],
        inicio=18 * 60, fin=22 * 60, tope_bloques=8,
        tareas={
            "A": {"nombre": "Proyecto final", "dur": 6, "prio": 5, "vence": (1, 8)},
            "B": {"nombre": "Taller",         "dur": 6, "prio": 3, "vence": (0, 8)},
            "C": {"nombre": "Lectura",        "dur": 2, "prio": 2, "vence": (1, 8)},
        },
    )


def caso_realista():
    # Lunes a miércoles 14:00-22:00, tope 6 h (12 bloques), clases fijas (R1).
    return Problema(
        nombre="Caso realista (5 tareas)",
        dias=["Lunes", "Martes", "Miércoles"],
        inicio=14 * 60, fin=22 * 60, tope_bloques=12,
        fijos=[(0, "14:00", "16:00"), (1, "18:00", "20:00")],
        tareas={
            "T1": {"nombre": "Ensayo",     "dur": 8, "prio": 5, "vence": (2, 16)},
            "T2": {"nombre": "Ejercicios", "dur": 4, "prio": 4, "vence": (0, 16)},
            "T3": {"nombre": "Lectura",    "dur": 2, "prio": 2, "vence": (1, 16)},
            "T4": {"nombre": "Proyecto",   "dur": 6, "prio": 5, "vence": (2, 16)},
            "T5": {"nombre": "Foro",       "dur": 2, "prio": 1, "vence": (0, 16)},
        },
    )


def caso_estres():
    p = caso_realista()
    tareas = dict(p.tareas)
    tareas["T6"] = {"nombre": "Estudio Parcial", "dur": 8, "prio": 5, "vence": (1, 16)}
    tareas["T7"] = {"nombre": "Video",           "dur": 6, "prio": 2, "vence": (0, 16)}
    return Problema(
        nombre="Prueba de estrés (7 tareas)",
        dias=p.dias, inicio=14 * 60, fin=22 * 60, tope_bloques=12,
        fijos=p.fijos, tareas=tareas,
    )
