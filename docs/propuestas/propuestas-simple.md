# CuidaVoz — Propuestas (versión fácil)

> La misma lista que el documento técnico, pero en criollo: **qué es la idea, para qué sirve y
> cuánto cuesta hacerla**. La numeración (P1, P2…) coincide con la versión técnica por si querés
> profundizar. Esfuerzo: 🟢 bajo · 🟡 medio · 🔴 alto.

---

## P0 — Primero, la duda clave: ¿"hacer lo nuestro" es entrenar un modelo? ¿API o propio?

Hay una confusión muy común acá, así que la aclaro porque cambia todo:

**Un "modelo" y un "agente" son cosas distintas.**
- **Modelo** = el cerebro ya entrenado (Claude, Whisper). Entrenar uno cuesta plata, datos y placas de
  video (GPU).
- **Agente** = el **programa que nosotros escribimos alrededor de ese cerebro**: las instrucciones (su
  "personalidad"/rol), las herramientas que puede usar, la memoria, y el "bucle" de decidir-actuar.

👉 **"Crear nuestros propios agentes" NO es entrenar un modelo. Es escribir esa lógica.** Y eso **ya lo
estamos haciendo**: el agente de salud, el de bienestar, el que arma el reporte y el que verifica que no
mienta **son nuestros** — son código nuestro montado sobre Claude. **Lo que la materia valora (y lo que
es "nuestro") es la arquitectura de agentes, no el cerebro de abajo.** De hecho, en TODAS las clases
prácticas usaron Claude por API y armaron los agentes encima. Usar la API **no es hacer trampa**: es
exactamente lo que enseñaron.

**Entonces, ¿"no usar todo por API"? Hay tres niveles:**
1. **El cerebro principal (Claude):** conviene seguir con API. La teoría de la materia dice que un modelo
   chico bien instruido alcanza para tareas puntuales; entrenar uno propio para reemplazarlo **no mejora**
   y no entra en nuestro servidor. Lo valioso es cómo lo orquestamos, no cambiar el cerebro.
2. **Modelos chiquitos especializados (no son "el cerebro"):** acá SÍ podemos tener algo **propio y local**,
   y es realista. No se programan desde cero: se bajan ya hechos y se usan en dos líneas. Ejemplos:
   - un modelo de **"embeddings"** (para que el buscador entienda sinónimos — ver P1),
   - un **clasificador** chico (para detectar la intención del adulto, o pre-filtrar alertas).
   Estos sí podemos correrlos nosotros (con cuidado de la memoria del servidor).
3. **Entrenar nuestro propio cerebro generativo:** se puede (las clases lo enseñan: clases 6, 7 y 9 + el
   repo que me pasaste son justo "cómo entrenar un modelo"), **pero** necesita una GPU y no entra en el
   servidor gratis que usamos hoy. Para CuidaVoz como cerebro: mejor no. Si querés tocar entrenamiento
   **para la nota**, podemos hacer un experimento chico **aparte** (entrenar un mini-modelo para una
   tarea puntual) y mostrarlo, aunque no quede en producción.

**En una frase:** lo "nuestro" en CuidaVoz = **construir la arquitectura de agentes** (que conversan,
se especializan, usan herramientas) sobre Claude, y meter **1-2 modelos chicos propios** donde aportan
(el buscador, un clasificador). Entrenar un cerebro propio es caro y rinde poco acá; si lo hacemos, que
sea una demo académica chica.

---

## Parte 1 — Mejorar lo que ya hace el sistema

### P1 — Buscador inteligente (que entienda lo que la familia quiere decir) 🟡
**Qué es:** hoy, cuando la familia pregunta algo en el chat de consultas, el sistema busca por palabras
exactas. Si el reporte dice "se despierta de noche" y preguntás "¿cómo viene el descanso?", **no
encuentra nada** porque no coinciden las palabras.
**Qué aporta:** que el buscador entienda **significados** (que "descanso", "sueño" y "se despierta" van
juntos) **y** a la vez sea bueno con palabras exactas (nombres de remedios, dosis). Combinamos las dos
cosas. Es probablemente la mejora con mejor relación impacto/esfuerzo, y se demuestra fácil en vivo.

### P2 — "Termómetro" de calidad del sistema 🟡
**Qué es:** una forma de **medir con números** qué tan bien funciona el sistema (qué tan fiel es a lo
que dijo el adulto, si responde a lo que se pregunta, etc.), y un set de casos de prueba para no romper
nada cuando cambiamos algo.
**Qué aporta:** poder decir "mejoramos un 20%" con evidencia, no con "se ve mejor". Es justo lo que un
jurado quiere ver. Incluye una prueba clave: que el sistema **diga "no tengo esa información" en vez de
inventar** (peligrosísimo en salud).

### P3 — Detalle de medicamentos (no solo "tomó / no tomó") 🟡
**Qué es:** hoy solo sabemos si el adulto tomó la medicación (sí/no). Pasar a saber **qué** tomó:
nombre, dosis, frecuencia.
**Qué aporta:** un "historial de medicación" para la familia ("Enalapril 10mg, aparece todos los días;
Ibuprofeno, primera vez hoy"). Valor real para cuidar.

### P4 — Resumen semanal que cuenta la evolución 🟢
**Qué es:** el resumen semanal ya existe; mejorarlo para que **compare con la semana anterior** ("durmió
mejor que la semana pasada") y se asegure de no inventar datos.
**Qué aporta:** la familia ve **tendencias** ("viene mejorando / empeorando"), no fotos sueltas de cada día.

### P5 — Aviso de "algo cambió" entre semanas 🟡
**Qué es:** comparar el reporte de hoy con el anterior y avisar si hay un **cambio importante** ("hace 4
días que no toma la pastilla", "primera vez que menciona tristeza").
**Qué aporta:** detecta deterioros **graduales** que ningún día por separado muestra. Es lo que más le
importa a un médico.

---

## Parte 2 — Que los agentes trabajen mejor en equipo

### P6 — Agentes especializados que trabajan en paralelo 🟢/🟡
**Qué es:** hoy el "agente de salud" y el "agente de bienestar" trabajan **uno después del otro**.
Hacer que trabajen **al mismo tiempo**, cada uno enfocado en lo suyo.
**Qué aporta:** más rápido (importante porque tenemos un límite de tiempo por análisis) y de mejor calidad
(cada uno no se "contamina" con el tema del otro). Es **exactamente** lo que la materia premia: agentes
especializados que colaboran.

### P7 — Una "central de datos" y "manuales" para los agentes 🟡
**Qué es:** (a) una central única desde donde **todos** los agentes piden datos del adulto (en vez de que
cada uno arme su propia consulta), y (b) sacar las "reglas clínicas" de adentro del código a **manuales**
editables.
**Qué aporta:** ordena el sistema, deja registro de quién accedió a qué dato (importante en salud), y
permite que un médico edite los criterios sin tocar el código. Son dos temas enteros del programa de la
materia (se ve bien en la nota).

### P8 — Un agente "revisor" 🟢
**Qué es:** un agente extra que **revisa** el reporte antes de guardarlo (¿quedó algo afuera? ¿está bien
armado?).
**Qué aporta:** una segunda mirada de control de calidad. Refuerza la idea de "varios agentes piensan
mejor que uno".

### P9 — Un modelo propio (chico) corriendo en casa 🟢/🔴
**Qué es:** meter **un modelo nuestro** (no Claude) para una tarea puntual, como el buscador de P1 o un
clasificador. Es la respuesta concreta a "hagamos algo propio, no todo API".
**Qué aporta:** independencia de la API para esa tarea + es algo "nuestro" que podemos mostrar. Si
queremos, hasta podemos **entrenarlo** con nuestros datos (eso ya es 🔴 y necesita GPU aparte).

---

## Parte 3 — Funciones nuevas de producto (que el sistema *actúe*, no solo informe)

### P10 — "Quiero hablar con mi hija" → el sistema la contacta al toque ⭐ 🟡
**Qué es:** el adulto dice "quiero hablar con Ana" (o aprieta un botón y lo dice), y el sistema **entiende
el pedido y avisa/llama** a ese familiar automáticamente.
**Qué aporta:** convierte CuidaVoz de "le cuenta cosas a la familia" a "**conecta** al adulto con su familia
en el momento". Es tu idea, y es de las más lindas para mostrar y de más valor humano. (Empezar por un
aviso/WhatsApp es más fácil que una llamada telefónica de verdad.)

### P11 — Un asistente que repregunta 🟡/🔴
**Qué es:** en vez de una sola grabación, un agente que **conversa**: si el adulto dijo poco, le repregunta
("¿el dolor es nuevo? ¿desde cuándo?") hasta tener un buen panorama.
**Qué aporta:** mejores datos (más para detectar problemas) y una experiencia más natural y cálida para el
adulto.

### P12 — Agente que decide a quién avisar ante una alerta (y pide permiso si es grave) 🟡
**Qué es:** hoy el sistema **detecta** alertas graves pero **no avisa a nadie** (quedó a medio hacer). Este
agente decide **a quién** notificar y **cómo**, y para lo más grave **pide confirmación a un humano** antes
de escalar.
**Qué aporta:** cierra un agujero real (que las alertas lleguen) y evita falsas alarmas. Muy vendible.

### P13 — Recordatorios de medicación 🟡
**Qué es:** a partir de los medicamentos detectados (P3), el sistema le recuerda al adulto ("¿tomaste la
pastilla de la presión?") y anota la respuesta.
**Qué aporta:** pasa de **observar** a **ayudar activamente**; mejora que el adulto cumpla con la medicación.

### P14 — Si el adulto desaparece, lo vamos a buscar 🟢/🟡
**Qué es:** si el adulto **no graba** durante varios días, el sistema lo contacta para ver cómo está (y/o
avisa a la familia).
**Qué aporta:** la soledad y el aislamiento son un riesgo real; hoy "el silencio" es invisible, esto lo
convierte en una acción de cuidado.

### P15 — Detectar señales de deterioro cognitivo en el tiempo ⭐ 🟡/🔴
**Qué es:** analizar **cómo habla** el adulto a lo largo de las semanas (riqueza de vocabulario,
repeticiones, coherencia) para detectar un posible deterioro **gradual**.
**Qué aporta:** una capacidad de mucho valor clínico y académico (¡la materia listó "Detección de
Alzheimer" como proyecto ejemplo!). **Importante:** se presenta como "señal para consultar al médico",
nunca como un diagnóstico.

---

## Parte 4 — La base que hace posible lo demás

### P16 — Sacar el procesamiento "del mostrador" (clave) ⭐ 🟡/🔴
**Qué es:** hoy, cuando el adulto graba, el sistema procesa todo **mientras el navegador espera**, y hay
un límite de ~60 segundos (por eso a veces se queda "Enviando…"). La idea: que al grabar el sistema diga
"recibido" al instante y procese **por detrás**, mostrando el progreso.
**Qué aporta:** **elimina ese límite de tiempo de raíz**. Es importante porque casi todas las mejoras de
arriba **agregan trabajo** al procesamiento — sin esto, chocaríamos contra el límite. Y de paso la familia
ve el progreso ("analizando salud… verificando…") en vez de una rueda girando. Es "lo nuestro" en términos
de **arquitectura de producción**, que también suma en la nota.

### P17 — Ahorro y números de costo 🟢
**Qué es:** trucos para gastar menos (reusar partes repetidas de las instrucciones) y un panel con **cuánto
cuesta** y cuánto tarda cada reporte.
**Qué aporta:** baja el costo/latencia y nos da números reales para mostrar ("cada reporte cuesta X, el
sistema procesa Y por minuto"). La materia evalúa "eficiencia y costo".

---

## Mi recomendación (si tuviera que elegir para la presentación)
No hace falta hacer todo. Un combo que cuenta una historia redonda:
- **La base:** P16 (procesar por detrás, sin límite de tiempo).
- **El cerebro:** P1 (buscador inteligente) + P2 (termómetro de calidad).
- **El sello "agéntico":** P6 (agentes especializados en paralelo) + P7 (central de datos).
- **El "wow" de producto:** P10 (contactar a la familia al toque) **o** P12 (avisar alertas) — las dos
  cierran ese agujero de que hoy las alertas no le llegan a nadie y se ven geniales en vivo.
- **Una pieza fuerte de NLP:** P5 (avisar cambios) **o** P15 (deterioro cognitivo), según cuánto querás
  apuntar.

**La frase para cerrar la presentación:** *"CuidaVoz es un sistema de varios agentes especializados que
conversan entre sí, con un buscador inteligente de verdad, que se controla a sí mismo para no inventar, se
mide con números, y además **actúa** (contacta a la familia, avisa alertas) — todo sobre una arquitectura
lista para producción."*
