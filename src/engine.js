/* ============================================================
   Kairos (PSR) - motor de búsqueda
   Traducción directa del colab (Python) a JavaScript:
     - Fuerza bruta: backtracking con orden estático.
     - VMR + VMRe + CD, con poda por cota optimista opcional.
   Cada nodo evaluado se entrega como un evento para dibujar el árbol.
   ============================================================ */
const Kairos = (() => {
  const NO = -1;            // valor 'Ø' (no programada)
  const BITS = 64;          // valor = día * 64 + bloque de inicio

  const dia = v => Math.floor(v / BITS);
  const blq = v => v % BITS;

  function aBloque(hhmm, inicio) {
    const [h, m] = hhmm.split(":").map(Number);
    return Math.floor((h * 60 + m - inicio) / 30);
  }

  /* cfg = { dias:[...], inicio:min, fin:min, tope:bloques,
             tareas:[{id, nombre, dur, prio, vence:[d, b]}],
             fijos:[{dia, desde:"HH:MM", hasta:"HH:MM"}], exigirDescanso } */
  function crearProblema(cfg) {
    const n = cfg.tareas.length;
    const bpd = Math.floor((cfg.fin - cfg.inicio) / 30);
    const ocupados = cfg.dias.map(() => new Set());
    for (const f of cfg.fijos) {
      const a = aBloque(f.desde, cfg.inicio), b = aBloque(f.hasta, cfg.inicio);
      for (let x = Math.max(0, a); x < Math.min(bpd, b); x++) ocupados[f.dia].add(x);
    }
    const dur = cfg.tareas.map(t => t.dur);
    const prio = cfg.tareas.map(t => t.prio);
    const exigir = cfg.exigirDescanso !== false;

    // R1 + duración + fecha límite (igual a dominios_iniciales del colab)
    const dominios = cfg.tareas.map(t => {
      const [dv, bv] = t.vence;
      const dom = [];
      for (let d = 0; d < cfg.dias.length; d++) {
        for (let ini = 0; ini < bpd; ini++) {
          const fin = ini + t.dur;
          if (fin > bpd) continue;
          if (d > dv || (d === dv && fin > bv)) continue;
          let hasta = exigir ? fin + 1 : fin;
          hasta = Math.min(hasta, bpd);
          let libre = true;
          for (let b = ini; b < hasta; b++) if (ocupados[d].has(b)) { libre = false; break; }
          if (!libre) continue;
          dom.push(d * BITS + ini);
        }
      }
      return dom;
    });

    // R2 + R4 (igual a consistente del colab). asig[t] === undefined -> sin asignar
    function consistente(asig, t, v) {
      if (v === NO) return true;
      const d = dia(v), ini = blq(v), fin = ini + dur[t];
      let bloques = dur[t];
      for (let o = 0; o < n; o++) {
        const w = asig[o];
        if (w === undefined || w === NO || dia(w) !== d) continue;
        const ini2 = blq(w), fin2 = ini2 + dur[o];
        bloques += dur[o];
        if (!(ini >= fin2 + 1 || ini2 >= fin + 1)) return false;
      }
      return bloques <= cfg.tope;
    }

    // Solo para explicar un nodo inconsistente
    function motivo(asig, t, v) {
      const d = dia(v), ini = blq(v), fin = ini + dur[t];
      let bloques = dur[t];
      for (let o = 0; o < n; o++) {
        const w = asig[o];
        if (w === undefined || w === NO || dia(w) !== d) continue;
        const ini2 = blq(w), fin2 = ini2 + dur[o];
        bloques += dur[o];
        if (!(ini >= fin2 + 1 || ini2 >= fin + 1)) return { r: "R2", con: o };
      }
      if (bloques > cfg.tope) return { r: "R4", bloques };
      return null;
    }

    function prioridad(asig) {
      let s = 0;
      for (let t = 0; t < n; t++) if (asig[t] !== undefined && asig[t] !== NO) s += prio[t];
      return s;
    }

    return { cfg, n, bpd, ocupados, dur, prio, dominios, consistente, motivo, prioridad };
  }

  function nuevoEstado(limite) {
    return { nodos: 0, podas: 0, primeraPoda: null, vacios: 0, mejorPrio: -1, mejorAsig: null,
             mejorNodo: null, incumbentes: [], limite, detenido: false };
  }

  /* ---------------- Fuerza bruta ---------------- */
  function* fuerzaBruta(P, st, cap) {
    const n = P.n;
    const dom = P.dominios.map(d => d.concat([NO]));
    const asig = new Array(n);
    yield { id: 0, padre: null, prof: 0, estado: "raiz", siguiente: 0,
            tam: P.dominios.map((d, t) => [t, d.length]) };

    function* bt(i, padre) {
      const t = i;
      for (const v of dom[t]) {
        st.nodos++;
        const id = st.nodos, detalle = id <= cap;
        if (P.consistente(asig, t, v)) {
          asig[t] = v;
          if (i + 1 === n) {
            const pr = P.prioridad(asig), antes = st.mejorPrio;
            let nuevo = false;
            if (pr > st.mejorPrio) {
              st.mejorPrio = pr; st.mejorAsig = asig.slice(); nuevo = true;
              st.mejorNodo = detalle ? id : null;
              if (detalle) st.incumbentes.push(id);
            }
            if (detalle) yield { id, padre, prof: i + 1, t, v, estado: "hoja", prioridad: pr, nuevoMejor: nuevo, mejorAntes: antes };
            else if ((id & 511) === 0) yield null;
          } else {
            if (detalle) yield { id, padre, prof: i + 1, t, v, estado: "expandido", acum: P.prioridad(asig), siguiente: i + 1 };
            else if ((id & 511) === 0) yield null;
            yield* bt(i + 1, id);
          }
          asig[t] = undefined;
        } else {
          if (detalle) yield { id, padre, prof: i + 1, t, v, estado: "inconsistente", motivo: P.motivo(asig, t, v) };
          else if ((id & 511) === 0) yield null;
        }
        if (st.detenido) return;
        if (st.nodos >= st.limite) { st.detenido = true; return; }
      }
    }
    if (n > 0) yield* bt(0, 0);
  }

  /* ---------------- VMR + VMRe + CD (+ poda) ---------------- */
  function* heuristica(P, usarPoda, st, cap) {
    const n = P.n;
    const asig = new Array(n);

    // CD: recorta los dominios pendientes tras asignar `tarea = v`
    function cd(pend, tarea, v) {
      const prev = asig[tarea];
      asig[tarea] = v;
      const out = [];
      for (const [t, vals] of pend) {
        if (t === tarea) continue;
        const f = [];
        for (const w of vals) if (P.consistente(asig, t, w)) f.push(w);
        out.push([t, f]);
      }
      asig[tarea] = prev;
      return out;
    }

    function* bt(pend, nodo) {
      const acum = P.prioridad(asig);
      const detalle = nodo.id <= cap;
      nodo.acum = acum;

      if (pend.length === 0) {                                  // hoja
        const antes = st.mejorPrio;
        let nuevo = false;
        if (acum > st.mejorPrio) {
          st.mejorPrio = acum; st.mejorAsig = asig.slice(); nuevo = true;
          st.mejorNodo = detalle ? nodo.id : null;
          if (detalle) st.incumbentes.push(nodo.id);
        }
        if (detalle) { nodo.estado = "hoja"; nodo.prioridad = acum; nodo.nuevoMejor = nuevo; nodo.mejorAntes = antes; yield nodo; }
        else if ((nodo.id & 511) === 0) yield null;
        return;
      }

      if (usarPoda) {                                           // poda por cota optimista
        let cota = acum;
        for (const [t, vals] of pend) if (vals.length) cota += P.prio[t];
        nodo.cota = cota; nodo.mejorAlEvaluar = st.mejorPrio;
        if (cota <= st.mejorPrio) {
          st.podas++;
          if (st.primeraPoda === null) st.primeraPoda = st.nodos;
          if (detalle) { nodo.estado = "podado"; yield nodo; }
          else if ((nodo.id & 511) === 0) yield null;
          return;
        }
      }

      // VMR: menos valores legales; empate -> orden original
      let k = 0;
      for (let i = 1; i < pend.length; i++) if (pend[i][1].length < pend[k][1].length) k = i;
      const [tarea, vals] = pend[k];

      // VMRe: más bloques libres para las demás primero; 'Ø' al final
      const puntuados = vals.map(v => {
        let s = 0;
        for (const [, d] of cd(pend, tarea, v)) s += d.length;
        return [s, v];
      });
      puntuados.sort((a, b) => b[0] - a[0]);                   // sort estable
      const orden = puntuados.map(x => x[1]).concat([NO]);

      if (detalle) {
        nodo.estado = nodo.id === 0 ? "raiz" : "expandido";
        nodo.var = tarea;
        nodo.tam = pend.map(([t, d]) => [t, d.length]);
        nodo.vmre = puntuados.map(([s, v]) => [v, s]);
        yield nodo;
      } else if ((nodo.id & 511) === 0) yield null;

      for (const v of orden) {
        st.nodos++;
        const id = st.nodos;
        let nuevos, vaciados = [];
        if (v === NO) nuevos = pend.filter(([t]) => t !== tarea);
        else {
          nuevos = cd(pend, tarea, v);
          for (const [t, d] of nuevos) if (d.length === 0) vaciados.push(t);
          if (vaciados.length) st.vacios++;
        }
        const hijo = { id, padre: nodo.id, prof: nodo.prof + 1, t: tarea, v, vaciados,
                       despues: id <= cap ? nuevos.map(([t, d]) => [t, d.length]) : null };
        asig[tarea] = v;
        yield* bt(nuevos, hijo);
        asig[tarea] = undefined;
        if (st.detenido) return;
        if (st.nodos >= st.limite) { st.detenido = true; return; }
      }
    }

    const raiz = { id: 0, padre: null, prof: 0, t: null, v: null };
    yield* bt(P.dominios.map((d, t) => [t, d.slice()]), raiz);
  }

  function generador(P, metodo, st, cap) {
    if (metodo === "fb") return fuerzaBruta(P, st, cap);
    return heuristica(P, metodo === "poda", st, cap);
  }

  /* Ejecuta por tramos para no congelar la página. */
  function ejecutar(P, metodo, { cap = 2500, limite = 2e6, tiempoMax = 15000, alProgresar, alTerminar }) {
    const st = nuevoEstado(limite);
    const gen = generador(P, metodo, st, cap);
    const traza = [];
    let cancelado = false;
    const t0 = performance.now();
    function tramo() {
      if (cancelado) return;
      const fin = performance.now() + 14;
      while (performance.now() < fin) {
        for (let i = 0; i < 300; i++) {
          const r = gen.next();
          if (r.done) { st.ms = performance.now() - t0; alTerminar && alTerminar(st, traza); return; }
          if (r.value) traza.push(r.value);
        }
      }
      if (performance.now() - t0 > tiempoMax) {           // tope de tiempo: se corta la búsqueda
        st.detenido = true; st.porTiempo = true; st.ms = performance.now() - t0;
        alTerminar && alTerminar(st, traza);
        return;
      }
      alProgresar && alProgresar(st);
      setTimeout(tramo, 0);
    }
    setTimeout(tramo, 0);
    return { cancelar() { cancelado = true; } };
  }

  /* Ejecución directa (para pruebas) */
  function ejecutarSync(P, metodo, { cap = 2500, limite = 2e6 } = {}) {
    const st = nuevoEstado(limite);
    const traza = [];
    for (const ev of generador(P, metodo, st, cap)) if (ev) traza.push(ev);
    return { st, traza };
  }

  return { NO, BITS, dia, blq, aBloque, crearProblema, ejecutar, ejecutarSync };
})();

if (typeof module !== "undefined") module.exports = Kairos;
