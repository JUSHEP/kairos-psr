# Kairos · árbol de búsqueda del agente (PSR)

Simulador web del agente **Kairos**, un planificador de tareas para estudiantes modelado como un Problema de Satisfacción de Restricciones (PSR) que además maximiza la prioridad de las tareas programadas.

**Abrir la aplicación:** https://jushep.github.io/kairos-psr/

## Qué muestra

- El árbol de búsqueda se construye nodo por nodo: reproducir, avanzar paso a paso o saltar a cualquier nodo.
- Tres métodos: fuerza bruta, VMR + VMRe + CD, y VMR + VMRe + CD + poda optimista.
- En cada nodo: restricciones R2 y R4, dominios antes y después (CD), la tarea que elige VMR, el orden de VMRe, los retrocesos y la cuenta de la cota optimista cuando se poda.
- El horario resultante, la prioridad cubierta y las alertas de las tareas que quedan en Ø.
- La comparación de nodos evaluados entre los tres métodos.
- Los tres casos del colab, con edición de tareas, bloques fijos y calendario.

## Modelo

- Variables: las tareas. Dominio: bloques de inicio de 30 min, más Ø (no programada).
- R1: no usar bloques fijos (clases). R2: sin cruces y 30 min de descanso entre tareas del mismo día. R3: terminar antes del plazo. R4: tope de horas por día.
- Objetivo: maximizar la suma de prioridades de las tareas programadas.

## Resultados (nodos evaluados)

| Caso | Fuerza bruta | VMR + VMRe + CD | + Poda |
|---|---:|---:|---:|
| Base (3 tareas) | 320 | 119 | 17 |
| Realista (5 tareas + clases) | 123.240 | 34.542 | 37 |
| Prueba de estrés (7 tareas) | 583.426 | 50.795 | 46 |

## Estructura

- `index.html`: la aplicación completa en un solo archivo.
- `src/`: el código separado. `engine.js` (algoritmo), `presets.js` (casos), `app.js` (interfaz), `shell.html` (estructura y estilos). `python src/build.py` vuelve a armar `index.html`.
- `python/`: el algoritmo del colab en Python, con registro de cada nodo.
- `pruebas/`: comparan el motor JavaScript con el Python del colab, nodo por nodo, en los 3 casos y los 3 métodos.

```
python pruebas/test_paridad.py
node pruebas/test_paridad.js
```

## Colab

El notebook del proyecto, organizado por fases y sin comentarios: [`colab/Kairos_colab.ipynb`](colab/Kairos_colab.ipynb) · [Abrir en Google Colab](https://colab.research.google.com/github/JUSHEP/kairos-psr/blob/main/colab/Kairos_colab.ipynb)
