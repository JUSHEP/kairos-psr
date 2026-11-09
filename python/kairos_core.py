"""
Kairos (PSR) - el mismo algoritmo del colab, con registro de cada nodo del árbol.

Reproduce sin cambios la lógica del colab:
  - Fuerza bruta: backtracking con orden estático de variables y valores.
  - VMR + VMRe + CD: backtracking con las tres heurísticas.
  - Poda por cota optimista (opcional).
La única diferencia es que, además de contar nodos, guarda cada nodo
(padre, tarea, valor, estado) para poder dibujar el árbol.
"""

NO_PROGRAMADA = None  # 'Ø'


class Problema:
    """Datos de un caso: días, jornada, tope diario (R4), tareas y bloques fijos (R1)."""

    def __init__(self, nombre, dias, inicio, fin, tope_bloques, tareas,
                 fijos=(), exigir_descanso=True, bloque_min=30):
        self.nombre = nombre
        self.dias = dias
        self.inicio = inicio                      # minutos desde las 00:00
        self.bloque_min = bloque_min
        self.bloques_por_dia = (fin - inicio) // bloque_min
        self.tope = tope_bloques                  # R4 en bloques
        self.tareas = tareas
        self.orden = list(tareas)
        self.fijos = list(fijos)
        self.exigir_descanso = exigir_descanso
        self.ocupados = {d: set() for d in range(len(dias))}
        for d, ini, fin_ in self.fijos:
            self.ocupados[d].update(range(self.a_bloque(ini), self.a_bloque(fin_)))

    # ---------- utilidades ----------
    def a_bloque(self, hhmm):
        h, m = map(int, hhmm.split(":"))
        return (h * 60 + m - self.inicio) // self.bloque_min

    def hora(self, bloque):
        m = self.inicio + bloque * self.bloque_min
        return f"{m // 60:02d}:{m % 60:02d}"

    def texto_valor(self, tarea, valor, corto=True):
        if valor is NO_PROGRAMADA:
            return "Ø"
        d, ini = valor
        dia = self.dias[d][:3] if corto else self.dias[d]
        fin = ini + self.tareas[tarea]["dur"]
        return f"{dia} {self.hora(ini)}" if corto else f"{dia} {self.hora(ini)} - {self.hora(fin)}"

    # ---------- R1 + dominio inicial ----------
    def dominios_iniciales(self):
        dominios = {}
        for t, info in self.tareas.items():
            dia_v, blq_v = info["vence"]
            dom = []
            for d in range(len(self.dias)):
                for ini in range(self.bloques_por_dia):
                    fin = ini + info["dur"]
                    if fin > self.bloques_por_dia:                      # no cabe en la jornada
                        continue
                    if d > dia_v or (d == dia_v and fin > blq_v):       # fecha límite
                        continue
                    hasta = fin + 1 if self.exigir_descanso else fin    # tarea + descanso
                    hasta = min(hasta, self.bloques_por_dia)
                    if any(b in self.ocupados[d] for b in range(ini, hasta)):   # R1
                        continue
                    dom.append((d, ini))
            dominios[t] = dom
        return dominios

    # ---------- R2 + R4 ----------
    def consistente(self, asignacion, tarea, valor):
        if valor is NO_PROGRAMADA:
            return True
        dia, ini = valor
        fin = ini + self.tareas[tarea]["dur"]
        bloques_dia = self.tareas[tarea]["dur"]
        for otra, v in asignacion.items():
            if v is NO_PROGRAMADA or v[0] != dia:
                continue
            ini2 = v[1]
            fin2 = ini2 + self.tareas[otra]["dur"]
            bloques_dia += self.tareas[otra]["dur"]
            if not (ini >= fin2 + 1 or ini2 >= fin + 1):              # R2
                return False
        return bloques_dia <= self.tope                                # R4

    def motivo_inconsistencia(self, asignacion, tarea, valor):
        """Solo para explicar el nodo: qué restricción falló (R2 o R4)."""
        dia, ini = valor
        fin = ini + self.tareas[tarea]["dur"]
        bloques_dia = self.tareas[tarea]["dur"]
        for otra, v in asignacion.items():
            if v is NO_PROGRAMADA or v[0] != dia:
                continue
            ini2 = v[1]
            fin2 = ini2 + self.tareas[otra]["dur"]
            bloques_dia += self.tareas[otra]["dur"]
            if not (ini >= fin2 + 1 or ini2 >= fin + 1):
                return f"R2 con {otra}"
        if bloques_dia > self.tope:
            return "R4 tope diario"
        return None

    def prioridad(self, asignacion):
        return sum(self.tareas[t]["prio"] for t, v in asignacion.items() if v is not NO_PROGRAMADA)


# ============================================================
# Registro del árbol
# ============================================================
class Registro:
    def __init__(self, guardar=True):
        self.guardar = guardar
        self.nodos = []
        if guardar:
            self.nodos.append({"id": 0, "padre": None, "prof": 0, "tarea": None,
                               "valor": None, "estado": "raiz", "orden": 0})

    def nuevo(self, padre, prof, tarea, valor, orden):
        if not self.guardar:
            return None
        nid = len(self.nodos)
        self.nodos.append({"id": nid, "padre": padre, "prof": prof, "tarea": tarea,
                           "valor": valor, "estado": "expandido", "orden": orden})
        return nid

    def marcar(self, nid, **datos):
        if self.guardar and nid is not None:
            self.nodos[nid].update(datos)


class Resultado:
    def __init__(self, metodo, guardar=True):
        self.metodo = metodo
        self.nodos = 0
        self.podas = 0
        self.primera_poda_en_nodo = None
        self.vacios_detectados = 0
        self.mejor_prio = -1
        self.mejor_asig = None
        self.mejor_nodo = None
        self.arbol = Registro(guardar)


# ============================================================
# Fuerza bruta (orden estático, sin heurísticas)
# ============================================================
def fuerza_bruta(p, guardar=True):
    res = Resultado("Fuerza bruta", guardar)
    dom = {t: d + [NO_PROGRAMADA] for t, d in p.dominios_iniciales().items()}

    def bt(asig, i, padre):
        if i == len(p.orden):                                   # asignación completa
            pr = p.prioridad(asig)
            res.arbol.marcar(padre, estado="hoja", prioridad=pr)
            if pr > res.mejor_prio:
                res.mejor_prio, res.mejor_asig, res.mejor_nodo = pr, dict(asig), padre
                res.arbol.marcar(padre, nuevo_mejor=True)
            return
        t = p.orden[i]
        for v in dom[t]:
            res.nodos += 1
            nid = res.arbol.nuevo(padre, i + 1, t, v, res.nodos)
            if p.consistente(asig, t, v):
                asig[t] = v
                bt(asig, i + 1, nid)
                del asig[t]
            else:
                res.arbol.marcar(nid, estado="inconsistente",
                                 motivo=p.motivo_inconsistencia(asig, t, v))

    bt({}, 0, 0)
    return res


# ============================================================
# Heurísticas (iguales al colab)
# ============================================================
def comprobacion_directa(p, dominios, asignacion, tarea, valor):
    nueva = dict(asignacion)
    nueva[tarea] = valor
    return {t: [v for v in dom if p.consistente(nueva, t, v)]
            for t, dom in dominios.items() if t != tarea}


def seleccionar_variable_vmr(p, dominios):
    return min(dominios, key=lambda t: (len(dominios[t]), p.orden.index(t)))


def ordenar_valores_vmre(p, tarea, dominios, asignacion):
    puntuados = []
    for v in dominios[tarea]:
        restantes = comprobacion_directa(p, dominios, asignacion, tarea, v)
        puntuados.append((sum(len(d) for d in restantes.values()), v))
    puntuados.sort(key=lambda x: -x[0])
    return [v for _, v in puntuados] + [NO_PROGRAMADA], puntuados


# ============================================================
# Backtracking con VMR + VMRe + CD (+ poda optimista opcional)
# ============================================================
def busqueda_heuristica(p, usar_poda, guardar=True):
    nombre = "VMR + VMRe + CD + Poda" if usar_poda else "VMR + VMRe + CD"
    res = Resultado(nombre, guardar)

    def bt(asig, dominios, nid, prof):
        acumulada = p.prioridad(asig)
        res.arbol.marcar(nid, acumulada=acumulada)

        if not dominios:                                        # hoja: plan completo
            res.arbol.marcar(nid, estado="hoja", prioridad=acumulada)
            if acumulada > res.mejor_prio:
                res.mejor_prio, res.mejor_asig, res.mejor_nodo = acumulada, dict(asig), nid
                res.arbol.marcar(nid, nuevo_mejor=True)
            return

        if usar_poda:
            cota = acumulada + sum(p.tareas[t]["prio"] for t, d in dominios.items() if d)
            res.arbol.marcar(nid, cota=cota, mejor_al_evaluar=res.mejor_prio)
            if cota <= res.mejor_prio:
                res.podas += 1
                if res.primera_poda_en_nodo is None:
                    res.primera_poda_en_nodo = res.nodos
                res.arbol.marcar(nid, estado="podado")
                return

        tarea = seleccionar_variable_vmr(p, dominios)
        valores, puntuados = ordenar_valores_vmre(p, tarea, dominios, asig)
        res.arbol.marcar(nid, var_elegida=tarea,
                         tam_dominios={t: len(d) for t, d in dominios.items()})

        for valor in valores:
            res.nodos += 1
            if valor is NO_PROGRAMADA:
                nuevos = {t: d for t, d in dominios.items() if t != tarea}
                vacio = []
            else:
                nuevos = comprobacion_directa(p, dominios, asig, tarea, valor)
                vacio = [t for t, d in nuevos.items() if len(d) == 0]
                if vacio:
                    res.vacios_detectados += 1
            cid = res.arbol.nuevo(nid, prof + 1, tarea, valor, res.nodos)
            res.arbol.marcar(cid, vaciados=vacio,
                             dominios_despues={t: len(d) for t, d in nuevos.items()})
            asig[tarea] = valor
            bt(asig, nuevos, cid, prof + 1)
            del asig[tarea]

    bt({}, p.dominios_iniciales(), 0, 0)
    return res
