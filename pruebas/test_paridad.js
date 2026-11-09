// Compara el motor JS con las trazas de Python, nodo por nodo.
const Kairos = require("../src/engine.js");
const { CASOS, configMotor } = require("../src/presets.js");
const py = require("./trazas_python.json");

let fallos = 0;
for (const clave of ["base", "realista", "estres"]) {
  const P = Kairos.crearProblema(configMotor(CASOS[clave]));
  for (const metodo of ["fb", "cd", "poda"]) {
    const t0 = Date.now();
    const { st, traza } = Kairos.ejecutarSync(P, metodo, { cap: 2500, limite: 5e6 });
    const ms = Date.now() - t0;
    const ref = py[clave][metodo];
    const errores = [];
    if (st.nodos !== ref.nodos) errores.push(`nodos ${st.nodos} != ${ref.nodos}`);
    if (st.mejorPrio !== ref.mejor) errores.push(`mejor ${st.mejorPrio} != ${ref.mejor}`);
    if (metodo !== "fb" && st.vacios !== ref.vacios) errores.push(`vacios ${st.vacios} != ${ref.vacios}`);
    if (metodo === "poda") {
      if (st.podas !== ref.podas) errores.push(`podas ${st.podas} != ${ref.podas}`);
      if (st.primeraPoda !== ref.primera_poda) errores.push(`primera poda ${st.primeraPoda} != ${ref.primera_poda}`);
    }
    if (traza.length !== ref.traza.length) errores.push(`largo traza ${traza.length} != ${ref.traza.length}`);
    const m = Math.min(traza.length, ref.traza.length);
    for (let i = 0; i < m && errores.length < 5; i++) {
      const a = traza[i], b = ref.traza[i];
      const tA = a.id === 0 ? null : a.t, vA = a.id === 0 ? null : a.v;
      const estA = a.estado;
      if (a.id !== b.id || a.padre !== b.padre || tA !== b.t || vA !== b.v || estA !== b.estado)
        errores.push(`nodo ${i}: js ${JSON.stringify({ id: a.id, padre: a.padre, t: tA, v: vA, e: estA })} py ${JSON.stringify(b)}`);
      if (b.cota !== null && b.cota !== undefined && a.cota !== b.cota) errores.push(`nodo ${i} cota ${a.cota} != ${b.cota}`);
      if (b.prioridad !== null && b.prioridad !== undefined && a.prioridad !== b.prioridad) errores.push(`nodo ${i} prioridad ${a.prioridad} != ${b.prioridad}`);
    }
    fallos += errores.length;
    console.log(`${clave.padEnd(9)} ${metodo.padEnd(5)} nodos ${String(st.nodos).padStart(7)} podas ${String(st.podas).padStart(3)} mejor ${st.mejorPrio} | ${ms} ms | ${errores.length ? "FALLA: " + errores.join(" ; ") : "igual a Python"}`);
  }
}
process.exit(fallos ? 1 : 0);
