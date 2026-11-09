/* Casos del colab, escritos como los ve el usuario (horas y días). */
const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const CASOS = {
  base: {
    titulo: "Caso base · 3 tareas (A, B, C)",
    nDias: 2, inicio: "18:00", fin: "22:00", topeHoras: 4,
    fijos: [],
    tareas: [
      { id: "A", nombre: "Proyecto final", horas: 3, prio: 5, venceDia: 1, venceHora: "22:00" },
      { id: "B", nombre: "Taller",         horas: 3, prio: 3, venceDia: 0, venceHora: "22:00" },
      { id: "C", nombre: "Lectura",        horas: 1, prio: 2, venceDia: 1, venceHora: "22:00" },
    ],
  },
  realista: {
    titulo: "Caso realista · 5 tareas + clases fijas",
    nDias: 3, inicio: "14:00", fin: "22:00", topeHoras: 6,
    fijos: [
      { dia: 0, desde: "14:00", hasta: "16:00", nombre: "Clase" },
      { dia: 1, desde: "18:00", hasta: "20:00", nombre: "Clase" },
    ],
    tareas: [
      { id: "T1", nombre: "Ensayo",     horas: 4, prio: 5, venceDia: 2, venceHora: "22:00" },
      { id: "T2", nombre: "Ejercicios", horas: 2, prio: 4, venceDia: 0, venceHora: "22:00" },
      { id: "T3", nombre: "Lectura",    horas: 1, prio: 2, venceDia: 1, venceHora: "22:00" },
      { id: "T4", nombre: "Proyecto",   horas: 3, prio: 5, venceDia: 2, venceHora: "22:00" },
      { id: "T5", nombre: "Foro",       horas: 1, prio: 1, venceDia: 0, venceHora: "22:00" },
    ],
  },
  estres: {
    titulo: "Prueba de estrés · 7 tareas",
    nDias: 3, inicio: "14:00", fin: "22:00", topeHoras: 6,
    fijos: [
      { dia: 0, desde: "14:00", hasta: "16:00", nombre: "Clase" },
      { dia: 1, desde: "18:00", hasta: "20:00", nombre: "Clase" },
    ],
    tareas: [
      { id: "T1", nombre: "Ensayo",          horas: 4, prio: 5, venceDia: 2, venceHora: "22:00" },
      { id: "T2", nombre: "Ejercicios",      horas: 2, prio: 4, venceDia: 0, venceHora: "22:00" },
      { id: "T3", nombre: "Lectura",         horas: 1, prio: 2, venceDia: 1, venceHora: "22:00" },
      { id: "T4", nombre: "Proyecto",        horas: 3, prio: 5, venceDia: 2, venceHora: "22:00" },
      { id: "T5", nombre: "Foro",            horas: 1, prio: 1, venceDia: 0, venceHora: "22:00" },
      { id: "T6", nombre: "Estudio Parcial", horas: 4, prio: 5, venceDia: 1, venceHora: "22:00" },
      { id: "T7", nombre: "Video",           horas: 3, prio: 2, venceDia: 0, venceHora: "22:00" },
    ],
  },
};

function aMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/* Datos de pantalla -> configuración del motor (bloques de 30 min). */
function configMotor(caso) {
  const inicio = aMin(caso.inicio), fin = aMin(caso.fin);
  return {
    dias: DIAS_SEMANA.slice(0, caso.nDias),
    inicio, fin,
    tope: Math.round(caso.topeHoras * 2),
    exigirDescanso: true,
    fijos: caso.fijos.map(f => ({ dia: f.dia, desde: f.desde, hasta: f.hasta })),
    tareas: caso.tareas.map(t => ({
      id: t.id, nombre: t.nombre, dur: Math.round(t.horas * 2), prio: t.prio,
      vence: [t.venceDia, Math.floor((aMin(t.venceHora) - inicio) / 30)],
    })),
  };
}

if (typeof module !== "undefined") module.exports = { CASOS, DIAS_SEMANA, aMin, configMotor };
