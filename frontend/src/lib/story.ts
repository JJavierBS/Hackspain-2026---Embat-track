/**
 * The build story, read from `git log` of main (non-merge commits, local time) and `docs/DECISIONS.md`.
 * Static by design: the page tells what happened on the weekend of 18–20 September 2026.
 */

export const REPO_URL = "https://github.com/JJavierBS/Hackspain-2026---Embat-track";

export type Author = "fran" | "jj" | "almudena";

export const AUTHORS: { id: Author; name: string; commits: number; swatch: string }[] = [
  { id: "fran", name: "Fran", commits: 130, swatch: "bg-ink" },
  { id: "jj", name: "José Javier", commits: 71, swatch: "bg-series-trajectory" },
  { id: "almudena", name: "Almudena", commits: 5, swatch: "bg-series-level" },
];

export interface HourBin {
  day: "vie" | "sáb" | "dom";
  hour: number;
  fran: number;
  jj: number;
  almudena: number;
}

const bin = (day: HourBin["day"], hour: number, fran = 0, jj = 0, almudena = 0): HourBin => ({ day, hour, fran, jj, almudena });

/** One bin per hour, from Friday 21:00 to Sunday 01:59. Merge commits are left out. */
export const HOURS: HourBin[] = [
  bin("vie", 21, 0, 2),
  bin("vie", 22),
  bin("vie", 23, 0, 1),
  bin("sáb", 0, 6, 5),
  bin("sáb", 1, 8, 1),
  bin("sáb", 2),
  bin("sáb", 3),
  bin("sáb", 4),
  bin("sáb", 5),
  bin("sáb", 6),
  bin("sáb", 7, 9, 5),
  bin("sáb", 8, 3, 4),
  bin("sáb", 9, 13, 7),
  bin("sáb", 10, 6, 5, 1),
  bin("sáb", 11, 13, 12),
  bin("sáb", 12, 2, 8),
  bin("sáb", 13, 8, 2),
  bin("sáb", 14, 17, 1),
  bin("sáb", 15, 0, 4),
  bin("sáb", 16, 12, 1),
  bin("sáb", 17, 5),
  bin("sáb", 18, 1, 0, 3),
  bin("sáb", 19, 2, 5),
  bin("sáb", 20, 0, 1, 1),
  bin("sáb", 21, 8, 7),
  bin("sáb", 22, 2),
  bin("sáb", 23, 7),
  bin("dom", 0, 4),
  bin("dom", 1, 4),
];

export const binTotal = (b: HourBin) => b.fran + b.jj + b.almudena;

export interface Commit {
  hash: string;
  time: string;
  subject: string;
}

/** A moment where the easy option lost to a measurement. */
export interface Turn {
  temptation: string;
  proof: { figure: string; caption: string };
  rule: string;
  /** Row in docs/DECISIONS.md, or the commit that closed it. */
  ref: string;
}

export interface Chapter {
  id: string;
  /** Short name on the reel and in the jump list. */
  short: string;
  title: string;
  span: string;
  /** Inclusive range of HOURS indexes. */
  bins: [number, number];
  thesis: string;
  body: string[];
  turns: Turn[];
  commits: Commit[];
}

export const CHAPTERS: Chapter[] = [
  {
    id: "esqueleto",
    short: "El esqueleto",
    title: "Primero, el esqueleto",
    span: "vie 21:11 – sáb 01:28",
    bins: [0, 4],
    thesis: "El viernes por la noche no había nada que puntuar. Así que construimos lo único que no se puede improvisar el domingo: la estructura donde vive la demo.",
    body: [
      "En cuatro horas llegaron al repositorio la especificación, la arquitectura y los planes para que dos personas avanzaran en paralelo sin pisarse. El backend cambió la plantilla por DuckDB embebido: un solo archivo que lee 2,5 millones de movimientos directamente del CSV y los agrega en segundos.",
      "El frontend ya tenía su mundo antes de tener un solo dato: un visor de radiología, un selector de comprador y una tira de 24 meses. Todo empaquetado en Docker. Todo vacío, y listo para llenarse bloque a bloque.",
    ],
    turns: [],
    commits: [
      { hash: "f7459c1", time: "00:44", subject: "docs(plans): add phase 1 parallel plans" },
      { hash: "5d8f838", time: "00:50", subject: "build(backend): move template to backend and switch to duckdb stack" },
      { hash: "d2dce1c", time: "00:59", subject: "build(docker): add compose stack and frontend nginx image" },
      { hash: "6a7e2e3", time: "01:08", subject: "docs(design): record the radiology lightbox design system" },
      { hash: "db7b33c", time: "01:20", subject: "feat(frontend): add synthetic demo data and data-driven views" },
    ],
  },
  {
    id: "datos",
    short: "Leer los datos",
    title: "Leer el dinero antes de puntuarlo",
    span: "sáb 07:09 – 09:56",
    bins: [10, 12],
    thesis: "El sábado empezó sin fórmulas. Primero le preguntamos a los datos qué significaba cada columna.",
    body: [
      "¿Qué signo tiene una factura emitida? ¿Cómo se convierte una divisa? ¿Qué flujo es intragrupo? Cada respuesta fue a DATA_FINDINGS.md y a la configuración, nunca al código. Luego reconstruimos el saldo diario de cada cuenta hacia atrás, desde la foto final: 4.890 productos, cero descuadres.",
      "A las 08:53 empezó la ráfaga. Los indicadores de liquidez, pagos, morosidad, concentración, deuda y fiscalidad llegaron en SQL, repartidos entre dos personas, en once minutos.",
    ],
    turns: [
      {
        temptation: "Cinco movimientos de 999.999.999 € inflan la caja de una empresa. Lo fácil es escribir una excepción con su nombre.",
        proof: { figure: "+4.000 M€", caption: "en un solo día, para una sola empresa" },
        rule: "Ninguna regla para una entidad, un producto o un valor concreto. El jurado probará X-Ray con otros CSV: cada umbral vive en la configuración.",
        ref: "d97df9b",
      },
    ],
    commits: [
      { hash: "474a855", time: "07:18", subject: "docs(data): record profiling findings for block 2" },
      { hash: "888a499", time: "07:26", subject: "feat(sql): reconstruct daily balances backwards from the snapshot" },
      { hash: "3a5cdc1", time: "09:02", subject: "feat(domain): add sub-score model and anchor interpolator" },
      { hash: "d97df9b", time: "09:08", subject: "docs(data): keep the pipeline free of entity-specific rules" },
      { hash: "0965dff", time: "09:14", subject: "fix(sql): score overdrafts, unknown payables and lost collections correctly" },
    ],
  },
  {
    id: "nota",
    short: "La nota",
    title: "Una nota que se explica sola",
    span: "sáb 10:01 – 13:49",
    bins: [13, 16],
    thesis: "A las 10:12 la cartera mostró datos reales por primera vez. Cada número ya sabía de dónde venía.",
    body: [
      "La nota nace de anclas absolutas, no de percentiles: una empresa que el sistema nunca ha visto puntúa igual que cualquier otra. Se parte en nivel y trayectoria, y su explicación es exacta: las contribuciones suman la nota, sin resto.",
      "Antes de comer ya existían el motor de límites de circulante, la prima dinámica, el cribado de momentum, las quince alertas tempranas y la repetición del monitor mes a mes. A las 12:55 llegó el test que sostiene todo lo demás: cortamos el futuro y comprobamos que el pasado no se mueve.",
    ],
    turns: [
      {
        temptation: "Para puntuar un grupo, hacer la media de los ratios de sus filiales.",
        proof: { figure: "31 días, no 75", caption: "de cobro para un grupo con una filial de 10 M€ a 30 días y otra de 100 k€ a 120" },
        rule: "Sumar los componentes, quitar los flujos intragrupo y recalcular cada ratio. Nunca promediar ratios entre empresas.",
        ref: "M2",
      },
    ],
    commits: [
      { hash: "5e553a3", time: "10:01", subject: "feat(api): add meta, profiles, portfolio and distribution endpoints" },
      { hash: "318dcd8", time: "10:04", subject: "feat(domain): add exact additive explanation of the final score" },
      { hash: "0fd2275", time: "10:06", subject: "feat(domain): add cusum change detection and regime classification" },
      { hash: "178914f", time: "10:12", subject: "feat(frontend): show portfolio, entity and methodology on real data" },
      { hash: "638902d", time: "11:14", subject: "feat(domain): add working-capital limit engine and simulator" },
      { hash: "097d621", time: "11:19", subject: "feat(alerting): add the fifteen early-warning rules" },
      { hash: "e00d2ce", time: "12:55", subject: "test: prove past values do not change when the future is cut" },
    ],
  },
  {
    id: "medir",
    short: "Medir",
    title: "Medir lo que duele",
    span: "sáb 14:11 – 17:56",
    bins: [17, 20],
    thesis: "La tarde fue de hacer la pregunta incómoda: ¿la nota avisa antes de que llegue el problema?",
    body: [
      "La proyección compitió contra lo más simple, repetir el último valor. La tendencia amortiguada perdió en todos los horizontes. La reversión a la mediana de cada entidad ganó desde el segundo mes, y se quedó.",
      "A las 14:42 escribimos la respuesta que no queríamos leer. A las 15:37 la app ya vivía en Vercel y Render. A las 16:02 cerramos tres temas en el mismo minuto: una línea base junto a cada cifra de anticipación, los pesos y el comprador.",
    ],
    turns: [
      {
        temptation: "Contar solo los aciertos: cuántas veces la nota bajó antes de un evento.",
        proof: { figure: "AUC 0,39–0,44", caption: "a 1–3 meses del evento: peor que el azar, antes de corregir las etiquetas" },
        rule: "Cada cifra de anticipación sale junto a su línea base ingenua. Si una señal no bate al azar, la pantalla lo dice.",
        ref: "M13",
      },
      {
        temptation: "Seguir afinando los pesos hasta que la cartera parezca razonable.",
        proof: { figure: "0,98", caption: "correlación de rangos con un error de ±50 % en cada peso. Cambiar de perfil la baja a 0,74" },
        rule: "Pesos AHP con fuentes, cerrados. Solo tres hechos los reabren: etiquetas reales, un experto de Embat o un test de robustez que falle.",
        ref: "W1",
      },
      {
        temptation: "Venderle la nota al banco, como decía la especificación.",
        proof: { figure: "Los datos son de la pyme", caption: "ningún banco ve una nota sin su consentimiento" },
        rule: "Paga primero la pyme cliente de Embat, como un módulo de su plan. El banco paga después, por cada línea abierta.",
        ref: "P1",
      },
    ],
    commits: [
      { hash: "225f020", time: "14:21", subject: "feat(domain): project the health score with a causal mean reversion" },
      { hash: "ba374d2", time: "14:42", subject: "docs(findings): explain why forward auc is below 0.5" },
      { hash: "3e033ee", time: "15:37", subject: "feat(deploy): proxy /api from Vercel to the Render backend" },
      { hash: "af69337", time: "16:02", subject: "feat(lead-time): compare every signal with a naive baseline" },
      { hash: "1add711", time: "16:02", subject: "docs(weights): justify every weight and close the topic" },
      { hash: "6dfac57", time: "16:02", subject: "docs(product): name the buyer and why it pays off" },
      { hash: "32608d1", time: "16:35", subject: "feat(ui): add the Algorithm page for expert tuning" },
    ],
  },
  {
    id: "producto",
    short: "El producto",
    title: "Del prototipo al producto",
    span: "sáb 18:13 – 23:55",
    bins: [21, 26],
    thesis: "Con la verdad por escrito, faltaba que X-Ray pareciera de Embat y aguantara a un jurado.",
    body: [
      "La app adoptó la identidad visual de Embat. Las recomendaciones pasaron de un plan redactado por IA generativa a un ranking de acciones construido con las contribuciones reales de cada entidad. Los meses sin movimientos dejaron de contar como cero.",
      "El pipeline aprendió a publicar una ejecución solo cuando termina entera. Y un experto ya podía ajustar una entidad por sector y ver el efecto al momento, sin escribir nada en la base de datos.",
    ],
    turns: [
      {
        temptation: "Un plan de acción escrito por un modelo generativo en cada consulta.",
        proof: { figure: "0 llamadas", caption: "a servicios externos durante la demo" },
        rule: "Plantillas que nombran el driver real de cada entidad. Una demo no depende de un tercero, y una frase con su causa se defiende mejor.",
        ref: "P5",
      },
      {
        temptation: "Leer un mes sin movimientos como un mes con flujos a cero.",
        proof: { figure: "917", caption: "meses-empresa sin un solo movimiento, leídos como flujos a cero" },
        rule: "Un hueco es un hueco. Ninguna variación se mide contra él, y el momentum vuelve a empezar después.",
        ref: "M9",
      },
    ],
    commits: [
      { hash: "e2e51c3", time: "18:13", subject: "feat(ui): apply the embat visual identity to the app" },
      { hash: "62b77c2", time: "19:48", subject: "revert(ai): remove the generative action plan" },
      { hash: "41f8974", time: "19:48", subject: "feat(recommendations): rank the top actions of every entity-month" },
      { hash: "55555ce", time: "20:55", subject: "fix(scoring): treat months without transactions as missing in variations" },
      { hash: "6826881", time: "21:13", subject: "feat(pipeline): publish a run only when every stage is done" },
      { hash: "48d51cb", time: "23:55", subject: "feat(tuning): add sector presets and a what-if score for one entity" },
    ],
  },
  {
    id: "honestidad",
    short: "La última hora",
    title: "La última hora fue la más honesta",
    span: "dom 00:04 – 01:43",
    bins: [27, 28],
    thesis: "Pasada la medianoche, la cartera enseñó algo que no cuadraba: todas las entidades nacían con un 100 y luego caían.",
    body: [
      "No era salud. Era falta de datos. Con un solo indicador disponible, ese indicador se llevaba todo el peso, y una deuda cero valía la nota máxima. La caída posterior fabricaba un deterioro que nunca ocurrió. A las 19:08 ya marcábamos esas notas como «Sin historial». No bastaba.",
      "A la 01:43 el motor dejó de puntuar un mes que los datos no sostienen, y la anticipación pasó a medirse contra un evento real: seis meses seguidos quemando caja. Con esa vara, el motor de límites recortó la línea antes de 70 de los 81 eventos, con 4,5 meses de antelación.",
    ],
    turns: [
      {
        temptation: "Publicar la nota igualmente, con una etiqueta de confianza baja.",
        proof: { figure: "173 → 8", caption: "entidades de 248 cuya primera nota era un 100. Las alertas de caída falsas bajaron de 43 a 1" },
        rule: "Si los datos no llegan al 40 % del peso del perfil, no hay nota. Ni en la exportación, ni en las alertas, ni en los productos.",
        ref: "M8",
      },
      {
        temptation: "Llamar evento a dos meses seguidos en que la caja no cubre la deuda.",
        proof: { figure: "29,7 %", caption: "de los meses cumplían la regla antigua: un estado de estos datos, no un evento" },
        rule: "Un evento de deterioro exige seis meses seguidos quemando caja. La pantalla imprime también la señal que no bate al azar.",
        ref: "M11",
      },
    ],
    commits: [
      { hash: "2b0d915", time: "00:57", subject: "docs: one decision register, one front door, and no stale claims" },
      { hash: "9d443fd", time: "01:29", subject: "fix(deploy): serve index.html for every deep link on Vercel" },
      { hash: "566ad03", time: "01:43", subject: "fix(score): refuse a month the data cannot support, and measure anticipation against a real event" },
    ],
  },
];
