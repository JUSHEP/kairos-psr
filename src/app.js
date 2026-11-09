(() => {
"use strict";

/* ============================================================
   Kairos · interfaz del árbol de búsqueda
   ============================================================ */
const $ = (s, el = document) => el.querySelector(s);
const NO = Kairos.NO;
const CAP = 2500;            // nodos que se dibujan
const LIMITE = 2000000;      // tope de nodos por búsqueda (seguridad)
const DIA_CORTO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const METODOS = { fb: "Fuerza bruta", cd: "VMR + VMRe + CD", poda: "VMR + VMRe + CD + poda" };
const METODOS_CORTO = { fb: "Fuerza bruta", cd: "VMR+VMRe+CD", poda: "+ Poda" };
const MSG_CRITICA = "Alerta: Tarea crítica omitida. Sugerencia: Libera bloques fijos de tu calendario para hacerle espacio.";
const MSG_BAJA = "Sugerencia: Considera bajar su prioridad, reducir su duración o pedir más plazo.";
const MSG_MEDIA = "Aviso: Tarea de prioridad media omitida. Sugerencia: Revisa si puedes moverla a otro día o ampliar su plazo.";
const CAJA = { w: 140, h: 40 };
const MAX_TAREAS = 12;

const S = {
  clave: "base", origen: "base", caso: null, modificado: false,
  metodo: "poda",
  cfg: null, P: null, prioTotal: 0,
  run: null, calculo: null,
  paso: 0, max: 0, visibles: -1,
  reproduciendo: false, vel: 2, acum: 0, ultimoTs: 0,
  orient: "LR", etiquetas: true, etiquetasAuto: true, seguir: true,
  inspeccion: null, mejorMostrado: null, caminoActual: [], retornoMostrado: null,
  vista: { cx: 0, cy: 0, upp: 1 },
  comp: { clave: null, res: {}, calc: null, enCurso: null, nodosEnCurso: 0 },
  geo: null, elNodos: [], elAristas: [], elHalo: null,
  temporizador: null,
};

/* ---------------- utilidades ---------------- */
const copia = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const miles = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmtHM = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fmtH = bloques => `${String(bloques / 2).replace(".", ",")} h`;
const fmtHoras = h => `${String(h).replace(".", ",")} h`;

const tid = t => S.cfg.tareas[t].id;
const tnom = t => S.cfg.tareas[t].nombre;
const hora = b => fmtHM(S.cfg.inicio + b * 30);
const colorTarea = t => (t < 8 ? `var(--t${t + 1})` : "var(--t-otro)");
const tintaTarea = t => (t === 3 ? "var(--t4-ink)" : "#fff");

function valorCorto(t, v) {
  if (v === NO) return "Ø";
  return `${DIA_CORTO[Kairos.dia(v)]} ${hora(Kairos.blq(v))}`;
}
function valorLargo(t, v) {
  if (v === NO) return "Ø (no programada)";
  const b = Kairos.blq(v);
  return `${S.cfg.dias[Kairos.dia(v)]} ${hora(b)}–${hora(b + S.cfg.tareas[t].dur)}`;
}
function chip(t, id = tid(t)) {
  return `<span class="chip-tarea" style="background:${colorTarea(t)};color:${tintaTarea(t)}">${esc(id)}</span>`;
}
const tamTxt = arr => arr.map(([t, l]) => `${esc(tid(t))} ${l}`).join(" · ");
const lenDe = (arr, t) => (arr.find(x => x[0] === t) || [0, 0])[1];

/* ============================================================
   Problema y cálculo
   ============================================================ */
function prepararProblema() {
  S.cfg = configMotor(S.caso);
  S.P = Kairos.crearProblema(S.cfg);
  S.prioTotal = S.cfg.tareas.reduce((a, t) => a + t.prio, 0);
}
const claveCaso = () => JSON.stringify(S.cfg);

function mostrarCargando(activo, texto = "Calculando…") {
  const el = $("#cargando");
  el.classList.toggle("activo", activo);
  el.textContent = texto;
}

function recalcular() {
  detener();
  if (S.calculo) { S.calculo.cancelar(); S.calculo = null; }
  if (S.comp.calc) { S.comp.calc.cancelar(); S.comp.calc = null; S.comp.enCurso = null; }
  prepararProblema();
  renderDominios();
  mostrarCargando(true);
  const metodo = S.metodo;
  S.calculo = Kairos.ejecutar(S.P, metodo, {
    cap: CAP, limite: LIMITE,
    alProgresar: st => mostrarCargando(true, `Calculando… ${miles(st.nodos)} nodos`),
    alTerminar: (st, traza) => {
      S.calculo = null;
      mostrarCargando(false);
      cargarRun(metodo, st, traza);
      const clave = claveCaso();
      if (S.comp.clave !== clave) S.comp = { clave, res: {}, calc: null, enCurso: null, nodosEnCurso: 0 };
      S.comp.res[metodo] = resumenSt(st);
      calcularComparacion();
    },
  });
}

const resumenSt = st => ({ nodos: st.nodos, podas: st.podas, vacios: st.vacios, mejor: st.mejorPrio, detenido: st.detenido });

function calcularComparacion() {
  renderComparacion();
  if (S.comp.calc) return;
  const falta = ["fb", "cd", "poda"].find(m => !S.comp.res[m]);
  if (!falta) return;
  const clave = S.comp.clave;
  S.comp.enCurso = falta;
  S.comp.nodosEnCurso = 0;
  S.comp.calc = Kairos.ejecutar(S.P, falta, {
    cap: 0, limite: LIMITE,
    alProgresar: st => { S.comp.nodosEnCurso = st.nodos; renderComparacion(); },
    alTerminar: st => {
      if (S.comp.clave !== clave) return;
      S.comp.calc = null; S.comp.enCurso = null;
      S.comp.res[falta] = resumenSt(st);
      calcularComparacion();
    },
  });
}

function cargarRun(metodo, st, traza) {
  const m = traza.length - 1;
  const cum = {
    podas: new Int32Array(m + 1), inc: new Int32Array(m + 1), hojas: new Int32Array(m + 1),
    vac: new Int32Array(m + 1), mejor: new Int32Array(m + 1), ret: new Int32Array(m + 1),
  };
  let p = 0, i = 0, h = 0, v = 0, b = -1, r = 0;
  for (let k = 0; k <= m; k++) {
    const n = traza[k];
    if (n.estado === "podado") p++;
    if (n.estado === "inconsistente") i++;
    if (n.estado === "hoja" && k > 0) h++;
    if (n.vaciados && n.vaciados.length) v++;
    if (n.estado === "hoja" && n.nuevoMejor) b = n.prioridad;
    if (k >= 2 && n.padre !== k - 1) r++;
    cum.ret[k] = r;
    cum.podas[k] = p; cum.inc[k] = i; cum.hojas[k] = h; cum.vac[k] = v; cum.mejor[k] = b;
  }
  S.run = { metodo, st, traza, m, cum, incumbentes: st.incumbentes.slice() };
  S.max = m;
  S.inspeccion = null;
  $("#paso-inspeccion").hidden = true;
  if (S.etiquetasAuto) S.etiquetas = m <= 400;
  $("#btn-etiquetas").setAttribute("aria-pressed", String(S.etiquetas));
  S.vel = m <= 30 ? 2 : m <= 150 ? 10 : m <= 600 ? 60 : 200;
  $("#sel-vel").value = String(S.vel);
  $("#scrub").max = String(m);
  construirGeometria();
  dibujarArbol();
  ajustarVistaInicial();
  irA(m, { seguir: false });
  renderResultado();
  renderAviso();
}

/* ============================================================
   Geometría y dibujo del árbol
   ============================================================ */
function construirGeometria() {
  const T = S.run.traza, m = S.run.m;
  const hijos = Array.from({ length: m + 1 }, () => []);
  for (let k = 1; k <= m; k++) hijos[T[k].padre].push(k);
  const pos = new Float64Array(m + 1);
  let cur = 0;
  const pila = [[0, 0]];
  while (pila.length) {
    const top = pila[pila.length - 1];
    const id = top[0], h = hijos[id];
    if (top[1] < h.length) { pila.push([h[top[1]], 0]); top[1]++; }
    else { pila.pop(); pos[id] = h.length ? (pos[h[0]] + pos[h[h.length - 1]]) / 2 : cur++; }
  }
  S.geo = { hijos, pos, hojas: cur };
}

function coords(k) {
  const d = S.run.traza[k].prof, b = S.geo.pos[k];
  if (S.etiquetas) return S.orient === "LR" ? [d * 200, b * 50] : [b * 152, d * 92];
  return S.orient === "LR" ? [d * 120, b * 14] : [b * 14, d * 80];
}

function curva(px, py, x, y) {
  if (S.orient === "LR") {
    const a = S.etiquetas ? CAJA.w / 2 : 5;
    const x1 = px + a, x2 = x - a, mx = (x1 + x2) / 2;
    return `M${x1},${py} C${mx},${py} ${mx},${y} ${x2},${y}`;
  }
  const a = S.etiquetas ? CAJA.h / 2 : 5;
  const y1 = py + a, y2 = y - a, my = (y1 + y2) / 2;
  return `M${px},${y1} C${px},${my} ${x},${my} ${x},${y2}`;
}

function etiquetaNodo(n) {
  if (n.id === 0) {
    const l2 = S.run.metodo === "fb" ? "raíz · orden fijo" : (n.var !== undefined ? `raíz · VMR → ${tid(n.var)}` : "raíz");
    return ["Horario vacío", l2];
  }
  const l1 = `${tid(n.t)} = ${valorCorto(n.t, n.v)}`;
  let l2 = `#${n.id}`;
  if (n.estado === "expandido") l2 += S.run.metodo === "poda" ? ` · cota ${n.cota}` : ` · acum. ${n.acum}`;
  else if (n.estado === "hoja") l2 += ` · prioridad ${n.prioridad}`;
  else if (n.estado === "podado") l2 += ` · ✂ ${n.cota} ≤ ${n.mejorAlEvaluar}`;
  else if (n.estado === "inconsistente") l2 += ` · ✗ ${n.motivo ? n.motivo.r : ""}`;
  return [l1, l2];
}
const ESTADO_TXT = { raiz: "raíz", expandido: "expandido", hoja: "hoja (horario completo)", podado: "podado", inconsistente: "viola una restricción" };

function dibujarArbol() {
  const T = S.run.traza, m = S.run.m;
  const aristas = [], nodos = [];
  for (let k = 0; k <= m; k++) {
    const n = T[k];
    const [x, y] = coords(k);
    if (k > 0) {
      const [px, py] = coords(n.padre);
      aristas.push(`<path class="ed e-${n.estado}" d="${curva(px, py, x, y)}" style="display:none"/>`);
    }
    const [l1, l2] = etiquetaNodo(n);
    const tit = `<title>${esc(`${l1} · ${l2} · ${ESTADO_TXT[n.estado] || n.estado}`)}</title>`;
    const cuerpo = S.etiquetas
      ? `<rect class="caja" x="${-CAJA.w / 2}" y="${-CAJA.h / 2}" width="${CAJA.w}" height="${CAJA.h}" rx="7"/>` +
        `<text class="l1" text-anchor="middle" y="-3">${esc(l1)}</text><text class="l2" text-anchor="middle" y="12">${esc(l2)}</text>`
      : `<circle class="punto" r="${k === 0 ? 7 : 5}"/>`;
    nodos.push(`<g class="nd n-${n.estado}" data-id="${k}" transform="translate(${x},${y})" style="display:none">${tit}${cuerpo}</g>`);
  }
  $("#capa-aristas").innerHTML = aristas.join("");
  $("#capa-nodos").innerHTML = nodos.join("");
  S.elNodos = Array.from($("#capa-nodos").children);
  S.elAristas = [null, ...$("#capa-aristas").children];
  $("#capa-halo").innerHTML = S.etiquetas
    ? `<rect class="halo" x="${-CAJA.w / 2 - 5}" y="${-CAJA.h / 2 - 5}" width="${CAJA.w + 10}" height="${CAJA.h + 10}" rx="10"/>`
    : `<circle class="halo" r="10"/>`;
  S.elHalo = $("#capa-halo").firstElementChild;
  S.visibles = -1;
  S.mejorMostrado = null;
  S.caminoActual = [];
  S.retornoMostrado = null;
}

function redibujar() {
  if (!S.run) return;
  const paso = S.paso;
  dibujarArbol();
  ajustarVistaInicial();
  irA(paso, { seguir: false });
  if (S.inspeccion !== null) marcarInspeccion(S.inspeccion);
}

/* ---------------- vista: zoom y arrastre ---------------- */
function tamSvg() {
  const r = $("#svg").getBoundingClientRect();
  return { w: Math.max(60, r.width), h: Math.max(60, r.height), r };
}
function aplicarVista() {
  const { w, h } = tamSvg();
  const v = S.vista, vw = w * v.upp, vh = h * v.upp;
  $("#svg").setAttribute("viewBox", `${v.cx - vw / 2} ${v.cy - vh / 2} ${vw} ${vh}`);
}
function limites() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k <= S.run.m; k++) {
    const [x, y] = coords(k);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const hw = S.etiquetas ? CAJA.w / 2 : 8, hh = S.etiquetas ? CAJA.h / 2 : 8;
  return { x0: x0 - hw, x1: x1 + hw, y0: y0 - hh, y1: y1 + hh };
}
function escalaAjuste() {
  const b = limites(), { w, h } = tamSvg(), pad = 40;
  return { b, upp: Math.max((b.x1 - b.x0 + 2 * pad) / w, (b.y1 - b.y0 + 2 * pad + 80) / h) };
}
function verTodo() {
  const { b, upp } = escalaAjuste();
  S.vista = { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, upp: Math.max(upp, 0.5) };
  aplicarVista();
}
function ajustarVistaInicial() {
  const { upp } = escalaAjuste();
  if (upp <= 1.9) { verTodo(); return; }
  const [x, y] = coords(0);
  const { w, h } = tamSvg();
  S.vista.upp = 1.05;
  if (S.orient === "LR") { S.vista.cx = x - CAJA.w + (w * S.vista.upp) / 2 - 40; S.vista.cy = y; }
  else { S.vista.cx = x; S.vista.cy = y - CAJA.h + (h * S.vista.upp) / 2 - 40; }
  aplicarVista();
}
function zoomEn(f, px, py) {
  const v = S.vista;
  const nuevo = clamp(v.upp * f, 0.2, 80);
  const g = nuevo / v.upp;
  v.cx = px - (px - v.cx) * g;
  v.cy = py - (py - v.cy) * g;
  v.upp = nuevo;
  aplicarVista();
}
function aSvg(clientX, clientY) {
  const { w, h, r } = tamSvg(), v = S.vista;
  return [v.cx + (clientX - r.left - w / 2) * v.upp, v.cy + (clientY - r.top - h / 2) * v.upp];
}
function seguirNodo(k) {
  const [x, y] = coords(k);
  const { w, h } = tamSvg(), v = S.vista;
  const vw = w * v.upp, vh = h * v.upp;
  const mx = (S.etiquetas ? CAJA.w / 2 : 8) + 24 * v.upp, my = (S.etiquetas ? CAJA.h / 2 : 8) + 40 * v.upp;
  if (x < v.cx - vw / 2 + mx || x > v.cx + vw / 2 - mx || y < v.cy - vh / 2 + my || y > v.cy + vh / 2 - my) {
    v.cx = x; v.cy = y;
    aplicarVista();
  }
}

/* ============================================================
   Recorrido paso a paso
   ============================================================ */
function irA(k, { seguir = true } = {}) {
  if (!S.run) return;
  k = clamp(k, 0, S.max);
  if (S.visibles < k) {
    for (let i = S.visibles + 1; i <= k; i++) {
      S.elNodos[i].style.display = "";
      if (i > 0) S.elAristas[i].style.display = "";
    }
  } else if (S.visibles > k) {
    for (let i = S.visibles; i > k; i--) {
      S.elNodos[i].style.display = "none";
      if (i > 0) S.elAristas[i].style.display = "none";
    }
  }
  S.visibles = k;
  S.paso = k;
  actualizarMejor(k);
  actualizarRetorno(k);
  const [x, y] = coords(k);
  S.elHalo.setAttribute("transform", `translate(${x},${y})`);
  $("#scrub").value = String(k);
  $("#contador").textContent = `${miles(k)} / ${miles(S.max)}`;
  renderStats(k);
  if (S.inspeccion === null) renderPaso(k);
  if (S.seguir && seguir) seguirNodo(k);
  actualizarBotones();
}

function actualizarMejor(k) {
  const inc = S.run.incumbentes;
  let mejor = null;
  for (let i = inc.length - 1; i >= 0; i--) if (inc[i] <= k) { mejor = inc[i]; break; }
  if (mejor === S.mejorMostrado) return;
  if (S.mejorMostrado !== null) {
    S.elNodos[S.mejorMostrado].classList.remove("mejor");
    for (const e of S.caminoActual) S.elAristas[e].classList.remove("camino");
  }
  S.caminoActual = [];
  S.mejorMostrado = mejor;
  if (mejor !== null) {
    S.elNodos[mejor].classList.add("mejor");
    let x = mejor;
    while (x > 0) { S.elAristas[x].classList.add("camino"); S.caminoActual.push(x); x = S.run.traza[x].padre; }
  }
}

function actualizarRetorno(k) {
  if (S.retornoMostrado !== null && S.elNodos[S.retornoMostrado]) S.elNodos[S.retornoMostrado].classList.remove("retorno");
  S.retornoMostrado = null;
  const T = S.run.traza;
  if (k >= 2 && T[k].padre !== k - 1) {
    S.retornoMostrado = T[k].padre;
    S.elNodos[T[k].padre].classList.add("retorno");
  }
}

function reproducir() {
  if (!S.run) return;
  limpiarInspeccion();
  if (S.paso >= S.max) irA(0);
  S.reproduciendo = true;
  S.acum = 0;
  S.ultimoTs = performance.now();
  if (S.paso < S.max) irA(S.paso + 1);
  actualizarBotones();
  requestAnimationFrame(tick);
}
function detener() {
  S.reproduciendo = false;
  actualizarBotones();
}
function tick(ts) {
  if (!S.reproduciendo) return;
  const dt = Math.min(0.25, Math.max(0, (ts - S.ultimoTs) / 1000));
  S.ultimoTs = ts;
  S.acum += dt * S.vel;
  const n = Math.floor(S.acum);
  if (n > 0) {
    S.acum -= n;
    irA(S.paso + n);
    if (S.paso >= S.max) { detener(); return; }
  }
  requestAnimationFrame(tick);
}
function actualizarBotones() {
  const b = $("#btn-play");
  if (S.reproduciendo) b.textContent = "⏸ Pausa";
  else b.textContent = S.paso >= S.max && S.max > 0 ? "↺ Repetir" : "▶ Reproducir";
  $("#btn-inicio").disabled = $("#btn-atras").disabled = S.paso <= 0;
  $("#btn-paso").disabled = $("#btn-final").disabled = S.paso >= S.max;
}

/* ---------------- inspección con clic ---------------- */
function marcarInspeccion(k) {
  for (const el of document.querySelectorAll(".nd.inspeccion")) el.classList.remove("inspeccion");
  if (k !== null && S.elNodos[k]) S.elNodos[k].classList.add("inspeccion");
}
function inspeccionar(k) {
  if (!S.run || k > S.paso) return;
  detener();
  S.inspeccion = k;
  marcarInspeccion(k);
  $("#paso-inspeccion").hidden = k === S.paso;
  renderPaso(k);
}
function limpiarInspeccion() {
  if (S.inspeccion === null) return;
  S.inspeccion = null;
  marcarInspeccion(null);
  $("#paso-inspeccion").hidden = true;
  if (S.run) renderPaso(S.paso);
}

/* ============================================================
   Paneles
   ============================================================ */
function stat(et, va, clase = "") {
  return `<div class="stat panel ${clase}"><span class="et">${et}</span><span class="va">${va}</span></div>`;
}
function renderStats(k) {
  const R = S.run, c = R.cum, st = R.st;
  const total = `${miles(st.nodos)}${st.detenido ? "+" : ""}`;
  const items = [stat("Nodos evaluados", `${miles(k)}<small> de ${total}</small>`), stat("Retrocesos ↩", miles(c.ret[k]))];
  if (R.metodo === "fb") items.push(stat("Inconsistentes ✗", miles(c.inc[k])));
  else items.push(stat("Dominios vaciados por CD", miles(c.vac[k])));
  if (R.metodo === "poda") items.push(stat("Podas ✂", miles(c.podas[k])));
  items.push(stat("Horarios completos", miles(c.hojas[k])));
  const mej = c.mejor[k];
  items.push(stat("Mejor prioridad hasta aquí", mej < 0 ? "—" : `${mej}<small> de ${S.prioTotal}</small>`, mej >= 0 ? "ok" : ""));
  $("#estadisticas").innerHTML = items.join("");
}

function asignacionEn(k) {
  const T = S.run.traza, a = new Array(S.cfg.tareas.length);
  let x = T[k].estado === "inconsistente" ? T[k].padre : k;
  while (x > 0) { a[T[x].t] = T[x].v; x = T[x].padre; }
  return a;
}
function caminoTxt(k) {
  const T = S.run.traza, partes = [];
  let x = k;
  while (x > 0) { partes.push(`${esc(tid(T[x].t))} = ${esc(valorCorto(T[x].t, T[x].v))}`); x = T[x].padre; }
  return partes.reverse().join(" → ");
}

function vmreTxt(n) {
  if (!n.vmre) return "";
  const max = 6;
  const partes = n.vmre.slice(0, max).map(([v, s]) => `${esc(valorCorto(n.var, v))} (deja ${s})`);
  if (n.vmre.length > max) partes.push(`… ${n.vmre.length - max} más`);
  partes.push("Ø al final");
  return partes.join(" · ");
}
function cdTxt(n) {
  if (n.v === NO || !n.despues) return null;
  const padre = S.run.traza[n.padre];
  if (!padre || !padre.tam) return null;
  const antes = new Map(padre.tam);
  const cambios = [];
  for (const [t, l] of n.despues) {
    const a = antes.get(t);
    if (a !== undefined && a !== l) cambios.push(`${esc(tid(t))} ${a} → ${l}`);
  }
  let s = cambios.length
    ? `<b>CD</b> recorta los bloques de las tareas pendientes: ${cambios.join(" · ")}.`
    : (n.despues.length ? `<b>CD</b> revisa las tareas pendientes y no tiene que recortar nada.` : "");
  if (n.vaciados && n.vaciados.length) {
    const ids = n.vaciados.map(t => esc(tid(t))).join(", ");
    s += n.vaciados.length > 1 ? ` ${ids} quedan sin bloques: solo pueden ir a Ø.` : ` ${ids} queda sin bloques: solo puede ir a Ø.`;
  }
  return s || null;
}
function cotaTxt(n) {
  const pend = n.despues || n.tam || [];
  const con = pend.filter(([, l]) => l > 0).map(([t]) => `${S.cfg.tareas[t].prio} (${esc(tid(t))})`);
  const sin = pend.filter(([, l]) => l === 0).map(([t]) => esc(tid(t)));
  let s = `<b>Cota optimista</b> = ${n.acum} (acumulada)${con.map(c => " + " + c).join("")}` +
          `${sin.length ? ` + 0 (${sin.join(", ")} sin bloques)` : ""} = <b>${n.cota}</b>`;
  if (n.mejorAlEvaluar < 0) s += ". Todavía no hay un horario completo, así que no se puede podar.";
  else if (n.estado === "podado") s += ` ≤ mejor encontrado (${n.mejorAlEvaluar}) → <b>✂ se poda</b>: ni en el mejor caso esta rama supera al mejor horario.`;
  else s += ` > mejor encontrado (${n.mejorAlEvaluar}) → vale la pena seguir.`;
  return s;
}
function motivoTxt(n) {
  const m = n.motivo;
  if (!m) return "No cumple las restricciones: se descarta ✗.";
  if (m.r === "R2") {
    const a = asignacionEn(n.id);
    return `Choca con ${esc(tid(m.con))} (${esc(valorLargo(m.con, a[m.con]))}): se cruzan o no queda el descanso de 30 min. Viola <b>R2</b>, se descarta ✗.`;
  }
  return `Ese día sumaría ${fmtH(m.bloques)} de trabajo y el tope diario es ${fmtH(S.cfg.tope)}. Viola <b>R4</b>, se descarta ✗.`;
}

function retrocesoTxt(n) {
  const T = S.run.traza, k = n.id;
  if (k < 2 || n.padre === k - 1) return null;
  const prev = T[k - 1], padre = T[n.padre];
  const como = { hoja: "terminó en una hoja", podado: "fue podada", inconsistente: "violaba una restricción" }[prev.estado] || "ya se exploró";
  const destino = n.padre === 0 ? "la raíz" : `#${n.padre} (${esc(tid(padre.t))} = ${esc(valorCorto(padre.t, padre.v))})`;
  const niveles = prev.prof - padre.prof;
  return `↩ <b>Retroceso</b>: la rama del nodo #${k - 1} ${como}, así que el algoritmo deshace esa asignación, sube ${niveles} nivel${niveles > 1 ? "es" : ""} hasta ${destino} y prueba el siguiente valor de ${esc(tid(n.t))}.`;
}

function dominiosHTML(n) {
  const R = S.run, T = R.traza;
  const fila = (t, a, d, nota, clase) =>
    `<tr class="${clase}"><td>${chip(t)} ${esc(tnom(t))}</td>${a === undefined ? "" : `<td>${a}</td>`}<td class="des">${d}</td><td>${nota}</td></tr>`;
  if (R.metodo === "fb") {
    const a = asignacionEn(n.id);
    const pend = [];
    for (let t = 0; t < S.cfg.tareas.length; t++) if (a[t] === undefined) pend.push(t);
    if (!pend.length) return `<p class="sub" style="margin:0">No quedan tareas por asignar.</p>`;
    return `<p class="sub" style="margin:0 0 4px">La fuerza bruta no recorta dominios: cada tarea pendiente prueba todos sus valores.</p>` +
      `<table class="doms"><thead><tr><th>Tarea pendiente</th><th>Valores (bloques + Ø)</th><th></th></tr></thead><tbody>` +
      pend.map(t => fila(t, undefined, S.P.dominios[t].length + 1, "", "")).join("") + "</tbody></table>";
  }
  if (n.id === 0) {
    const filas = (n.tam || []).map(([t, l]) => fila(t, undefined, l, l === 0 ? "solo Ø" : "", l === 0 ? "vacio" : ""));
    return `<table class="doms"><thead><tr><th>Tarea</th><th>Bloques posibles</th><th></th></tr></thead><tbody>${filas.join("")}</tbody></table>`;
  }
  const antes = new Map(T[n.padre].tam || []);
  const despues = n.despues || [];
  if (!despues.length) return `<p class="sub" style="margin:0">No quedan tareas pendientes: el horario está completo.</p>`;
  const filas = despues.map(([t, d]) => {
    const a = antes.has(t) ? antes.get(t) : d;
    const nota = d === 0 ? "solo Ø" : a !== d ? `−${a - d}` : "";
    return fila(t, a, d, nota, d === 0 ? "vacio" : a !== d ? "cambio" : "");
  });
  return `<table class="doms"><thead><tr><th>Tarea pendiente</th><th>Antes</th><th>Después (CD)</th><th></th></tr></thead><tbody>${filas.join("")}</tbody></table>`;
}

function explicar(n) {
  const R = S.run, L = [];
  const fb = R.metodo === "fb", poda = R.metodo === "poda";
  if (n.id === 0) {
    L.push("Estado inicial: <b>horario vacío</b>, ninguna tarea tiene hora asignada.");
    if (fb) {
      L.push(`La fuerza bruta no usa heurísticas: toma las tareas en el orden fijo de la lista (${S.cfg.tareas.map(t => esc(t.id)).join(" → ")}) y prueba todos sus valores en orden, con Ø al final.`);
      if (n.tam) L.push(`Bloques posibles por tarea (R1, duración y plazo): ${tamTxt(n.tam)}.`);
    } else {
      if (n.tam) L.push(`Dominios iniciales (R1, duración y plazo ya aplicados): ${tamTxt(n.tam)} bloques.`);
      if (poda && n.cota !== undefined) L.push(cotaTxt(n));
      if (n.estado === "raiz") {
        L.push(`<b>VMR</b> elige ${esc(tid(n.var))}: es la tarea con menos bloques posibles (${lenDe(n.tam, n.var)}).`);
        L.push(`<b>VMRe</b> ordena sus valores por cuántos bloques dejan libres a las demás: ${vmreTxt(n)}.`);
      }
    }
    return L;
  }
  const rt = retrocesoTxt(n);
  if (rt) L.push(rt);
  L.push(n.v === NO
    ? `Se deja ${esc(tid(n.t))} <b>sin programar (Ø)</b>: no suma prioridad y no ocupa bloques.`
    : `Se prueba ${esc(tid(n.t))} = <b>${esc(valorLargo(n.t, n.v))}</b> (prioridad ${S.cfg.tareas[n.t].prio}).`);
  if (fb) {
    if (n.estado === "inconsistente") L.push(motivoTxt(n));
    else if (n.v !== NO) L.push("Cumple R2 (sin cruces y con 30 min de descanso) y R4 (tope diario) con lo que ya está asignado.");
    if (n.estado === "expandido") L.push(`Sigue ${esc(tid(n.siguiente))} en el orden fijo: ${S.P.dominios[n.siguiente].length} bloques + Ø por probar.`);
  } else {
    const c = cdTxt(n);
    if (c) L.push(c);
  }
  if (n.estado === "hoja") {
    L.push(`Todas las tareas tienen valor: es un <b>horario completo</b> con prioridad <b>${n.prioridad}</b>.`);
    if (n.nuevoMejor) L.push(n.mejorAntes < 0 ? "Es el primer horario completo: queda como <b>mejor horario</b> ★." : `Supera al mejor anterior (${n.mejorAntes}): ahora es el <b>mejor horario</b> ★.`);
    else if (n.prioridad === n.mejorAntes) L.push(`Empata con el mejor (${n.mejorAntes}). Como no lo supera, se queda el que ya estaba.`);
    else L.push(`No supera al mejor (${n.mejorAntes}): se descarta.`);
  } else if (poda && n.cota !== undefined) {
    L.push(cotaTxt(n));
  }
  if (!fb && n.estado === "expandido") {
    L.push(n.tam.length > 1
      ? `<b>VMR</b> elige ${esc(tid(n.var))} (${tamTxt(n.tam)} bloques: gana el menor).`
      : `Solo falta ${esc(tid(n.var))}.`);
    L.push(n.vmre && n.vmre.length
      ? `<b>VMRe</b> ordena sus valores: ${vmreTxt(n)}.`
      : `${esc(tid(n.var))} no tiene bloques posibles: solo se prueba Ø.`);
  }
  return L;
}

function pillEstado(n) {
  if (n.id === 0) return `<span class="pill">Raíz</span>`;
  switch (n.estado) {
    case "hoja": return n.nuevoMejor ? `<span class="pill p-mejor">★ Nuevo mejor</span>` : `<span class="pill p-hoja">Hoja</span>`;
    case "podado": return `<span class="pill p-podado">✂ Podado</span>`;
    case "inconsistente": return `<span class="pill p-inconsistente">✗ Inconsistente</span>`;
    default: return `<span class="pill">Expandido</span>`;
  }
}

function renderPaso(k) {
  const n = S.run.traza[k];
  $("#paso-titulo").textContent = k === 0 ? "Raíz del árbol" : `Nodo #${miles(k)} · nivel ${n.prof}`;
  $("#paso-pill").innerHTML = pillEstado(n);
  $("#paso-asig").innerHTML = k === 0 ? "Horario vacío" : `${chip(n.t)} ${esc(tid(n.t))} = ${esc(valorLargo(n.t, n.v))}`;
  const cam = caminoTxt(k);
  $("#paso-camino").innerHTML = cam ? `Camino desde la raíz: ${cam}` : "";
  $("#paso-explica").innerHTML = explicar(n).map(x => `<li>${x}</li>`).join("");
  $("#paso-dominios").innerHTML = dominiosHTML(n);
  const a = asignacionEn(k);
  const conflicto = n.estado === "inconsistente" ? { t: n.t, v: n.v } : null;
  $("#paso-cal").innerHTML = calendarioHTML(a, { destacar: k > 0 && !conflicto ? n.t : null, conflicto });
  const nos = [], pend = [];
  for (let t = 0; t < a.length; t++) {
    if (a[t] === NO) nos.push(chip(t));
    else if (a[t] === undefined && !(conflicto && conflicto.t === t)) pend.push(chip(t));
  }
  $("#paso-tareas").innerHTML =
    (nos.length ? `<span>En Ø:</span>${nos.join("")}` : "") +
    (pend.length ? `<span>${nos.length ? "· " : ""}Sin asignar todavía:</span>${pend.join("")}` : "");
}

function calendarioHTML(asig, { destacar = null, conflicto = null } = {}) {
  const cfg = S.cfg, bpd = S.P.bpd;
  const pct = b => `${(b / bpd * 100).toFixed(3)}%`;
  const paso = bpd > 24 ? 4 : 2;
  let h = `<div class="cal" style="--bloques:${bpd}"><div></div><div class="horas">`;
  for (let b = 0; b <= bpd; b += paso) {
    const tr = b === 0 ? "translateX(0)" : b + paso > bpd ? "translateX(-100%)" : "translateX(-50%)";
    h += `<span style="left:${pct(b)};transform:${tr}">${hora(b)}</span>`;
  }
  h += "</div>";
  for (let d = 0; d < cfg.dias.length; d++) {
    h += `<div class="dia">${DIA_CORTO[d]}</div><div class="pista">`;
    for (const f of S.caso.fijos) {
      if (f.dia !== d) continue;
      const a = clamp(Kairos.aBloque(f.desde, cfg.inicio), 0, bpd), b = clamp(Kairos.aBloque(f.hasta, cfg.inicio), 0, bpd);
      if (b > a) h += `<div class="barra-t fijo" style="left:${pct(a)};width:${pct(b - a)}" title="${esc((f.nombre || "Bloque fijo") + " " + f.desde + "–" + f.hasta)}">${esc(f.nombre || "Fijo")}</div>`;
    }
    for (let t = 0; t < asig.length; t++) {
      const v = asig[t];
      if (v === undefined || v === NO || Kairos.dia(v) !== d) continue;
      const b = Kairos.blq(v), dur = cfg.tareas[t].dur;
      h += `<div class="barra-t${t === destacar ? " destacado" : ""}" style="left:${pct(b)};width:${pct(dur)};background:${colorTarea(t)};color:${tintaTarea(t)}" title="${esc(`${tid(t)} ${tnom(t)} · ${valorLargo(t, v)} · prioridad ${cfg.tareas[t].prio}`)}">${esc(tid(t))}</div>`;
    }
    if (conflicto && conflicto.v !== NO && Kairos.dia(conflicto.v) === d) {
      const b = Kairos.blq(conflicto.v), dur = cfg.tareas[conflicto.t].dur;
      h += `<div class="barra-t conflicto" style="left:${pct(b)};width:${pct(dur)}" title="Valor probado: no cumple las restricciones">${esc(tid(conflicto.t))} ✗</div>`;
    }
    h += "</div>";
  }
  return h + "</div>";
}

function renderResultado() {
  const R = S.run, st = R.st, asig = st.mejorAsig;
  if (!asig) {
    $("#res-resumen").innerHTML = `<p class="sub">No se encontró un horario completo${st.detenido ? " antes del límite de la búsqueda" : ""}.</p>`;
    $("#res-cal").innerHTML = ""; $("#res-lista").innerHTML = ""; $("#res-alertas").innerHTML = "";
    return;
  }
  const pct = S.prioTotal ? (st.mejorPrio / S.prioTotal * 100).toFixed(1).replace(".", ",") : "0";
  const detenido = st.detenido ? ` La búsqueda se detuvo por ${st.porTiempo ? "tiempo" : "el límite de nodos"}: este es el mejor encontrado hasta ese punto.` : "";
  $("#res-resumen").innerHTML =
    `<div class="resumen-num"><span class="grande">${st.mejorPrio}/${S.prioTotal}</span><span>de prioridad cubierta (${pct} %)</span></div>` +
    `<p class="sub" style="margin:2px 0 0">Con ${METODOS[R.metodo]}: ${miles(st.nodos)} nodos evaluados.${detenido}</p>`;
  $("#res-cal").innerHTML = calendarioHTML(asig);
  $("#res-lista").innerHTML = S.cfg.tareas.map((t, i) =>
    `<li>${chip(i)}<span>${esc(t.nombre)} <span class="sub">· prioridad ${t.prio}</span></span><span class="cuando">${asig[i] === NO ? "Ø no programada" : esc(valorLargo(i, asig[i]))}</span></li>`).join("");
  const omitidas = S.cfg.tareas.map((t, i) => [t, i]).filter(([, i]) => asig[i] === NO);
  $("#res-alertas").innerHTML = omitidas.length
    ? omitidas.map(([t]) => {
        const clase = t.prio >= 4 ? "critica" : t.prio <= 2 ? "baja" : "media";
        const msg = t.prio >= 4 ? MSG_CRITICA : t.prio <= 2 ? MSG_BAJA : MSG_MEDIA;
        return `<li class="${clase}"><b>${esc(t.id)} ${esc(t.nombre)} · prioridad ${t.prio}</b>${esc(msg)}</li>`;
      }).join("")
    : `<li>Todas las tareas quedaron programadas.</li>`;
}

function renderAviso() {
  const st = S.run.st, partes = [];
  if (st.nodos > S.max) partes.push(`Se dibujan los primeros ${miles(S.max)} nodos de ${miles(st.nodos)}${st.detenido ? "+" : ""}. El horario y los totales son de la búsqueda completa.`);
  if (st.detenido) partes.push(st.porTiempo ? "La búsqueda se cortó a los 15 s." : `La búsqueda se cortó en ${miles(LIMITE)} nodos.`);
  $("#aviso").textContent = partes.join(" ");
}

/* ---------------- comparación ---------------- */
function compacto(n) {
  if (n >= 1e6) return `${n / 1e6}M`;
  if (n >= 1e3) return `${n / 1e3}K`;
  return String(n);
}
function renderComparacion() {
  const res = S.comp.res, fb = res.fb;
  let h = "<thead><tr><th>Método</th><th>Nodos</th><th>Menos que fuerza bruta</th><th>Podas</th><th>Prioridad</th></tr></thead><tbody>";
  for (const m of ["fb", "cd", "poda"]) {
    const r = res[m];
    if (!r) {
      const txt = S.comp.enCurso === m ? `calculando… ${miles(S.comp.nodosEnCurso)} nodos` : "en espera…";
      h += `<tr><td>${METODOS[m]}</td><td colspan="4" style="text-align:left;font-family:var(--font-ui)" class="sub">${txt}</td></tr>`;
      continue;
    }
    let red = "—";
    if (m !== "fb" && fb && !fb.detenido && fb.nodos > 0) {
      const x = 1 - r.nodos / fb.nodos;
      red = `${(x * 100).toFixed(x > 0.999 ? 2 : 1).replace(".", ",")} %`;
    }
    h += `<tr class="${m === S.metodo ? "sel" : ""}"><td>${METODOS[m]}</td><td>${miles(r.nodos)}${r.detenido ? "+" : ""}</td><td>${red}</td><td>${m === "poda" ? miles(r.podas) : "—"}</td><td>${r.mejor < 0 ? "—" : r.mejor}</td></tr>`;
  }
  $("#comp-tabla").innerHTML = h + "</tbody>";
  $("#comp-grafico").innerHTML = graficoLog();
}
function graficoLog() {
  const res = S.comp.res;
  const vals = ["fb", "cd", "poda"].filter(m => res[m]).map(m => Math.max(1, res[m].nodos));
  if (!vals.length) return "";
  const hi = Math.max(2, Math.ceil(Math.log10(Math.max(...vals)) - 1e-9));
  const W = 360, H = 124, x0 = 96, x1 = W - 78;
  const X = v => x0 + Math.log10(Math.max(1, v)) / hi * (x1 - x0);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Nodos evaluados por método en escala logarítmica">`;
  for (let p = 0; p <= hi; p++) {
    const x = X(10 ** p);
    s += `<line class="grid" x1="${x}" y1="6" x2="${x}" y2="${H - 24}"/><text x="${x}" y="${H - 9}" text-anchor="middle">${compacto(10 ** p)}</text>`;
  }
  ["fb", "cd", "poda"].forEach((m, i) => {
    const y = 20 + i * 30, r = res[m];
    s += `<text class="met" x="0" y="${y + 4}">${METODOS_CORTO[m]}</text>`;
    if (r) {
      const x = X(r.nodos);
      s += `<line class="guia" x1="${x0}" y1="${y}" x2="${x}" y2="${y}"/>` +
           `<circle class="punto" cx="${x}" cy="${y}" r="5.5"><title>${METODOS[m]}: ${miles(r.nodos)} nodos</title></circle>` +
           `<text x="${x + 10}" y="${y + 4}">${miles(r.nodos)}${r.detenido ? "+" : ""}</text>`;
    }
  });
  return s + `</svg><p class="sub" style="margin:2px 0 0">Escala logarítmica: cada línea vertical vale 10 veces la anterior.</p>`;
}

/* ============================================================
   Editor de datos
   ============================================================ */
function opcionesHoras(desde, hasta, sel) {
  let h = "";
  for (let m = desde; m <= hasta; m += 30) {
    const s = fmtHM(m);
    h += `<option value="${s}"${s === sel ? " selected" : ""}>${s}</option>`;
  }
  return h;
}
function opcionesDuracion(maxH, sel) {
  let h = "";
  for (let x = 0.5; x <= maxH + 1e-9; x += 0.5) h += `<option value="${x}"${Math.abs(x - sel) < 1e-9 ? " selected" : ""}>${fmtHoras(x)}</option>`;
  return h;
}
function opcionesDias(n, sel, corto = false) {
  let h = "";
  for (let d = 0; d < n; d++) h += `<option value="${d}"${d === sel ? " selected" : ""}>${corto ? DIA_CORTO[d] : DIAS_SEMANA[d]}</option>`;
  return h;
}

function renderEditor() {
  const c = S.caso, ini = aMin(c.inicio), fin = aMin(c.fin), jornH = (fin - ini) / 60;
  let h = `<label for="ed-dias">Días</label><select id="ed-dias" data-campo="nDias">`;
  for (let n = 1; n <= 7; n++) h += `<option value="${n}"${n === c.nDias ? " selected" : ""}>${n === 1 ? "Lunes" : "Lunes a " + DIAS_SEMANA[n - 1]}</option>`;
  h += `</select>`;
  h += `<label for="ed-inicio">Desde</label><select id="ed-inicio" data-campo="inicio">${opcionesHoras(5 * 60, 23 * 60, c.inicio)}</select>`;
  h += `<label for="ed-fin">Hasta</label><select id="ed-fin" data-campo="fin">${opcionesHoras(ini + 60, 24 * 60, c.fin)}</select>`;
  h += `<label for="ed-tope">Tope diario (R4)</label><select id="ed-tope" data-campo="topeHoras">${opcionesDuracion(jornH, c.topeHoras)}</select>`;
  $("#ed-calendario").innerHTML = h;

  $("#ed-tareas").innerHTML = c.tareas.map((t, i) => `
    <div class="tarea" data-t="${i}">
      <div class="cab">${chip(i, t.id)}
        <input type="text" id="t${i}-nombre" data-campo="nombre" value="${esc(t.nombre)}" aria-label="Nombre de la tarea ${esc(t.id)}">
        <button class="quitar" data-accion="quitar-tarea" title="Quitar la tarea" aria-label="Quitar la tarea ${esc(t.id)}"${c.tareas.length <= 1 ? " disabled" : ""}>×</button>
      </div>
      <div class="det">
        <label for="t${i}-horas">Duración</label><select id="t${i}-horas" data-campo="horas">${opcionesDuracion(jornH, t.horas)}</select>
        <label for="t${i}-prio">Prioridad</label><select id="t${i}-prio" data-campo="prio">${[1, 2, 3, 4, 5].map(p => `<option value="${p}"${p === t.prio ? " selected" : ""}>${p}</option>`).join("")}</select>
        <label for="t${i}-vdia">Vence</label><select id="t${i}-vdia" data-campo="venceDia">${opcionesDias(c.nDias, t.venceDia, true)}</select>
        <label for="t${i}-vhora">a las</label><select id="t${i}-vhora" data-campo="venceHora">${opcionesHoras(ini + 30, fin, t.venceHora)}</select>
      </div>
      <div class="dom" id="t${i}-dom"></div>
    </div>`).join("");
  $("#btn-agregar-tarea").disabled = c.tareas.length >= MAX_TAREAS;

  $("#ed-fijos").innerHTML = c.fijos.length ? c.fijos.map((f, i) => `
    <div class="fijo" data-f="${i}">
      <input type="text" id="f${i}-nombre" data-campo="nombre" value="${esc(f.nombre || "Clase")}" aria-label="Nombre del bloque fijo ${i + 1}">
      <select id="f${i}-dia" data-campo="dia" aria-label="Día del bloque fijo ${i + 1}">${opcionesDias(c.nDias, f.dia, true)}</select>
      <select id="f${i}-desde" data-campo="desde" aria-label="Inicio del bloque fijo ${i + 1}">${opcionesHoras(ini, fin - 30, f.desde)}</select>
      <select id="f${i}-hasta" data-campo="hasta" aria-label="Fin del bloque fijo ${i + 1}">${opcionesHoras(ini + 30, fin, f.hasta)}</select>
      <button class="quitar" data-accion="quitar-fijo" title="Quitar el bloque" aria-label="Quitar el bloque fijo ${i + 1}">×</button>
    </div>`).join("") : `<p class="sub" style="margin:0">Sin bloques fijos.</p>`;
}

function renderDominios() {
  if (!S.P) return;
  S.P.dominios.forEach((d, i) => {
    const el = $(`#t${i}-dom`);
    if (!el) return;
    el.classList.toggle("alerta", d.length === 0);
    el.textContent = d.length ? `Bloques de inicio posibles (R1 + plazo): ${d.length}` : "No cabe en ningún bloque: quedará en Ø.";
  });
}

function normalizar() {
  const c = S.caso;
  const ini = aMin(c.inicio);
  let fin = aMin(c.fin);
  if (fin < ini + 60) { fin = Math.min(24 * 60, ini + 60); c.fin = fmtHM(fin); }
  const jornH = (fin - ini) / 60;
  c.topeHoras = clamp(c.topeHoras, 0.5, jornH);
  for (const t of c.tareas) {
    t.horas = clamp(t.horas, 0.5, jornH);
    t.venceDia = clamp(t.venceDia, 0, c.nDias - 1);
    let vm = clamp(aMin(t.venceHora), ini + 30, fin);
    vm = ini + Math.round((vm - ini) / 30) * 30;
    t.venceHora = fmtHM(clamp(vm, ini + 30, fin));
  }
  c.fijos = c.fijos.filter(f => f.dia < c.nDias);
  for (const f of c.fijos) {
    let a = ini + Math.round((clamp(aMin(f.desde), ini, fin - 30) - ini) / 30) * 30;
    let b = ini + Math.round((clamp(aMin(f.hasta), ini + 30, fin) - ini) / 30) * 30;
    a = clamp(a, ini, fin - 30);
    if (b <= a) b = a + 30;
    f.desde = fmtHM(a); f.hasta = fmtHM(clamp(b, a + 30, fin));
  }
}

function marcarModificado() {
  S.modificado = true;
  const sel = $("#sel-caso"), op = sel.querySelector('option[value="personal"]');
  op.hidden = false;
  op.textContent = `Personalizado (desde: ${CASOS[S.origen].titulo.split(" · ")[0]})`;
  sel.value = "personal";
  $("#datos-nota").textContent = "Caso modificado. El agente vuelve a buscar con cada cambio.";
}
function programarRecalculo() {
  clearTimeout(S.temporizador);
  S.temporizador = setTimeout(recalcular, 300);
}

function siguienteId() {
  const ids = S.caso.tareas.map(t => t.id);
  if (ids.every(x => /^[A-Z]$/.test(x))) {
    for (let c = 65; c <= 90; c++) { const l = String.fromCharCode(c); if (!ids.includes(l)) return l; }
  }
  let n = 1;
  for (const x of ids) { const m = /^T(\d+)$/.exec(x); if (m) n = Math.max(n, +m[1] + 1); }
  while (ids.includes(`T${n}`)) n++;
  return `T${n}`;
}

function alCambiarDato(e) {
  const el = e.target, campo = el.dataset.campo;
  if (!campo) return;
  const c = S.caso;
  const tEl = el.closest("[data-t]"), fEl = el.closest("[data-f]");
  let estructura = false;
  if (tEl) {
    const t = c.tareas[+tEl.dataset.t];
    if (campo === "nombre") {
      t.nombre = el.value.trim() || t.id;
      if (S.cfg && S.cfg.tareas[+tEl.dataset.t]) S.cfg.tareas[+tEl.dataset.t].nombre = t.nombre;
      marcarModificado();
      if (S.run) { renderResultado(); renderPaso(S.inspeccion ?? S.paso); }
      return;
    }
    if (campo === "horas") t.horas = +el.value;
    else if (campo === "prio") t.prio = +el.value;
    else if (campo === "venceDia") t.venceDia = +el.value;
    else if (campo === "venceHora") t.venceHora = el.value;
  } else if (fEl) {
    const f = c.fijos[+fEl.dataset.f];
    if (campo === "nombre") { f.nombre = el.value.trim() || "Clase"; marcarModificado(); if (S.run) { renderResultado(); renderPaso(S.inspeccion ?? S.paso); } return; }
    if (campo === "dia") f.dia = +el.value;
    else if (campo === "desde") { f.desde = el.value; estructura = true; }
    else if (campo === "hasta") f.hasta = el.value;
  } else {
    if (campo === "nDias") c.nDias = +el.value;
    else if (campo === "inicio") c.inicio = el.value;
    else if (campo === "fin") c.fin = el.value;
    else if (campo === "topeHoras") c.topeHoras = +el.value;
    estructura = true;
  }
  marcarModificado();
  normalizar();
  if (estructura) renderEditor();
  programarRecalculo();
}

function alClicDatos(e) {
  const b = e.target.closest("[data-accion]");
  if (!b) return;
  const c = S.caso;
  if (b.dataset.accion === "quitar-tarea") {
    if (c.tareas.length <= 1) return;
    c.tareas.splice(+b.closest("[data-t]").dataset.t, 1);
  } else if (b.dataset.accion === "quitar-fijo") {
    c.fijos.splice(+b.closest("[data-f]").dataset.f, 1);
  } else return;
  marcarModificado();
  renderEditor();
  programarRecalculo();
}

function agregarTarea() {
  const c = S.caso;
  if (c.tareas.length >= MAX_TAREAS) return;
  c.tareas.push({ id: siguienteId(), nombre: "Nueva tarea", horas: 1, prio: 3, venceDia: c.nDias - 1, venceHora: c.fin });
  marcarModificado(); normalizar(); renderEditor(); programarRecalculo();
  const ultimo = $(`#t${c.tareas.length - 1}-nombre`);
  if (ultimo) { ultimo.focus(); ultimo.select(); }
}
function agregarFijo() {
  const c = S.caso, ini = aMin(c.inicio);
  c.fijos.push({ dia: 0, desde: fmtHM(ini), hasta: fmtHM(ini + 120), nombre: "Clase" });
  marcarModificado(); normalizar(); renderEditor(); programarRecalculo();
}

function cargarCaso(clave) {
  S.clave = clave;
  S.origen = clave;
  S.caso = copia(CASOS[clave]);
  S.modificado = false;
  const sel = $("#sel-caso");
  sel.querySelector('option[value="personal"]').hidden = true;
  sel.value = clave;
  $("#datos-nota").textContent = "Puedes cambiar cualquier dato; el agente vuelve a buscar solo.";
  renderEditor();
  recalcular();
}

/* ============================================================
   Eventos
   ============================================================ */
function enlazar() {
  $("#sel-caso").addEventListener("change", e => {
    if (e.target.value === "personal") return;
    cargarCaso(e.target.value);
  });
  $("#btn-datos").addEventListener("click", () => {
    const app = $("#app");
    const oculto = app.classList.toggle("sin-datos");
    $("#btn-datos").textContent = oculto ? "Mostrar datos" : "Ocultar datos";
    $("#btn-datos").setAttribute("aria-pressed", String(!oculto));
  });
  $("#btn-restablecer").addEventListener("click", () => cargarCaso(S.origen));
  $("#btn-agregar-tarea").addEventListener("click", agregarTarea);
  $("#btn-agregar-fijo").addEventListener("click", agregarFijo);
  const datos = $("#panel-datos");
  datos.addEventListener("change", alCambiarDato);
  datos.addEventListener("click", alClicDatos);

  for (const b of document.querySelectorAll("#seg-metodo button")) {
    b.addEventListener("click", () => {
      S.metodo = b.dataset.metodo;
      for (const x of document.querySelectorAll("#seg-metodo button")) x.setAttribute("aria-pressed", String(x === b));
      recalcular();
    });
  }
  $("#btn-play").addEventListener("click", () => (S.reproduciendo ? detener() : reproducir()));
  $("#btn-paso").addEventListener("click", () => { detener(); limpiarInspeccion(); irA(S.paso + 1); });
  $("#btn-atras").addEventListener("click", () => { detener(); limpiarInspeccion(); irA(S.paso - 1); });
  $("#btn-inicio").addEventListener("click", () => { detener(); limpiarInspeccion(); irA(0); });
  $("#btn-final").addEventListener("click", () => { detener(); limpiarInspeccion(); irA(S.max); });
  $("#scrub").addEventListener("input", e => { detener(); limpiarInspeccion(); irA(+e.target.value); });
  $("#sel-vel").addEventListener("change", e => { S.vel = +e.target.value; });

  $("#btn-orient").addEventListener("click", () => {
    S.orient = S.orient === "LR" ? "TB" : "LR";
    $("#btn-orient").textContent = S.orient === "LR" ? "Vertical" : "Horizontal";
    redibujar();
  });
  $("#btn-etiquetas").addEventListener("click", () => {
    S.etiquetasAuto = false;
    S.etiquetas = !S.etiquetas;
    $("#btn-etiquetas").setAttribute("aria-pressed", String(S.etiquetas));
    redibujar();
  });
  $("#btn-seguir").addEventListener("click", () => {
    S.seguir = !S.seguir;
    $("#btn-seguir").setAttribute("aria-pressed", String(S.seguir));
    if (S.seguir && S.run) seguirNodo(S.paso);
  });
  $("#btn-ajustar").addEventListener("click", () => S.run && verTodo());
  $("#btn-mas").addEventListener("click", () => zoomEn(1 / 1.3, S.vista.cx, S.vista.cy));
  $("#btn-menos").addEventListener("click", () => zoomEn(1.3, S.vista.cx, S.vista.cy));

  const svg = $("#svg");
  let arr = null;
  svg.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    const nd = e.target.closest ? e.target.closest(".nd") : null;
    arr = { x: e.clientX, y: e.clientY, cx: S.vista.cx, cy: S.vista.cy, movido: false, nodo: nd ? +nd.dataset.id : null };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", e => {
    if (!arr) return;
    const dx = e.clientX - arr.x, dy = e.clientY - arr.y;
    if (!arr.movido && Math.abs(dx) + Math.abs(dy) > 4) { arr.movido = true; svg.classList.add("arrastrando"); }
    if (arr.movido) {
      S.vista.cx = arr.cx - dx * S.vista.upp;
      S.vista.cy = arr.cy - dy * S.vista.upp;
      aplicarVista();
    }
  });
  const soltar = () => {
    if (arr && !arr.movido) {
      if (arr.nodo !== null) inspeccionar(arr.nodo);
      else limpiarInspeccion();
    }
    arr = null;
    svg.classList.remove("arrastrando");
  };
  svg.addEventListener("pointerup", soltar);
  svg.addEventListener("pointercancel", () => { arr = null; svg.classList.remove("arrastrando"); });
  svg.addEventListener("wheel", e => {
    e.preventDefault();
    const [px, py] = aSvg(e.clientX, e.clientY);
    zoomEn(Math.exp(e.deltaY * 0.0015), px, py);
  }, { passive: false });

  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => aplicarVista()).observe($("#lienzo"));

  document.addEventListener("keydown", e => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (["input", "select", "textarea", "button"].includes(tag) && e.key !== "Escape") {
      if (tag !== "button" || e.key === " " || e.key === "Enter") return;
    }
    if (!S.run) return;
    if (e.key === " ") { e.preventDefault(); S.reproduciendo ? detener() : reproducir(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); detener(); limpiarInspeccion(); irA(S.paso + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); detener(); limpiarInspeccion(); irA(S.paso - 1); }
    else if (e.key === "Home") { e.preventDefault(); detener(); limpiarInspeccion(); irA(0); }
    else if (e.key === "End") { e.preventDefault(); detener(); limpiarInspeccion(); irA(S.max); }
    else if (e.key === "Escape") limpiarInspeccion();
  });
}

enlazar();
cargarCaso("base");
})();
