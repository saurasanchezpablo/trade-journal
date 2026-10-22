/** Spanish for Video intelligence (analysts' claims checked against the market). See lib/i18n.ts. */
const es: Record<string, string> = {
  // Navigation and page
  "Video intelligence": "Inteligencia de vídeo",
  "What the analysts you follow claimed in their videos, checked against what the market did afterwards. Predictions and simulated trades are kept apart: a right direction is not a profitable trade.":
    "Lo que afirmaron en sus vídeos los analistas que sigues, contrastado con lo que hizo el mercado después. Las predicciones y las operaciones simuladas se tratan por separado: acertar la dirección no es una operación rentable.",
  Claims: "Afirmaciones",
  Claim: "Afirmación",
  Analysts: "Analistas",
  Analyst: "Analista",
  Strategies: "Estrategias",
  Processing: "Procesamiento",
  "Predictions by analyst": "Predicciones por analista",
  "Predictions by instrument": "Predicciones por instrumento",

  // Filters
  "All analysts": "Todos los analistas",
  Any: "Cualquiera",
  Bullish: "Alcista",
  Bearish: "Bajista",
  "Only what the analyst said": "Solo lo que dijo el analista",

  // Overview
  "Nothing has been processed yet. Start it in Processing: every stored video is read once (with your AI provider, for those with a transcript) and its claims are checked against market data from your enabled sources.":
    "Aún no se ha procesado nada. Empieza en Procesamiento: cada vídeo guardado se lee una vez (con tu proveedor de IA, los que tienen transcripción) y sus afirmaciones se contrastan con los datos de mercado de tus fuentes activadas.",
  Library: "Biblioteca",
  "Videos processed": "Vídeos procesados",
  "{count} stored video": "{count} vídeo guardado",
  "{count} stored videos": "{count} vídeos guardados",
  "Pending or failed": "Pendientes o fallidos",
  "{settled} settled · {pending} pending · {unevaluable} unevaluable":
    "{settled} resueltas · {pending} pendientes · {unevaluable} no evaluables",
  "Strategy levels": "Niveles de estrategia",
  "Only level C setups are simulated as trades.":
    "Solo las configuraciones de nivel C se simulan como operaciones.",
  Predictions: "Predicciones",
  "Target hit rate": "Tasa de objetivo alcanzado",
  "95% interval {low} to {high}, n={n}": "Intervalo del 95% de {low} a {high}, n={n}",
  "No settled claims yet": "Aún no hay afirmaciones resueltas",
  "Direction right at horizon": "Dirección acertada al horizonte",
  "n={n}": "n={n}",
  "Target hit after the horizon": "Objetivo alcanzado tras el horizonte",
  "Stated probabilities (Brier)": "Probabilidades indicadas (Brier)",
  "{n} claims with a probability the analyst stated; 0 is perfect, 0.25 is a coin flip":
    "{n} afirmaciones con una probabilidad indicada por el analista; 0 es perfecto, 0.25 es lanzar una moneda",
  "Simulated trades (level C)": "Operaciones simuladas (nivel C)",
  "Small sample": "Muestra pequeña",
  "Expectancy (net)": "Esperanza (neta)",
  "Net total": "Total neto",
  "Gross {gross}": "Bruto {gross}",
  "Data quality": "Calidad de los datos",
  "Quotes found word for word in the transcript: {verified}; approximately: {approximate}; not found: {notFound}; from summaries (no quote): {none}.":
    "Citas encontradas palabra por palabra en la transcripción: {verified}; aproximadamente: {approximate}; no encontradas: {notFound}; de resúmenes (sin cita): {none}.",
  "Claims count from the video's publication. A claim with no stated horizon uses the system's default for its timeframe (labelled on the claim). Rates under 20 settled claims are shown with a small-sample warning and should not be compared.":
    "Las afirmaciones cuentan desde la publicación del vídeo. Una afirmación sin horizonte indicado usa el del sistema para su temporalidad (se indica en la afirmación). Las tasas con menos de 20 afirmaciones resueltas llevan un aviso de muestra pequeña y no deben compararse.",
  "By direction": "Por dirección",
  "By kind of claim": "Por tipo de afirmación",
  Kind: "Tipo",
  "By market regime at the claim": "Por régimen de mercado en la afirmación",
  Regime: "Régimen",
  "By origin": "Por origen",
  Origin: "Origen",

  // Claims table
  "No claims match these filters.": "Ninguna afirmación coincide con estos filtros.",
  Published: "Publicado",
  Level: "Nivel",
  "Trade (net)": "Operación (neta)",
  "system horizon": "horizonte del sistema",

  // Strategies
  "Saved. The setups are simulated again in the background.":
    "Guardado. Las configuraciones se vuelven a simular en segundo plano.",
  "Simulated trades by analyst": "Operaciones simuladas por analista",
  "Simulated trades by instrument": "Operaciones simuladas por instrumento",
  "Simulated trades by market regime": "Operaciones simuladas por régimen de mercado",
  "Execution assumptions": "Supuestos de ejecución",
  "A setup is traded once: a limit entry at the near edge of the stated zone (at the open when a candle opens past it), between the video's publication and the horizon's end.":
    "Cada configuración se opera una vez: entrada límite en el borde cercano de la zona indicada (a la apertura si una vela abre más allá), entre la publicación del vídeo y el final del horizonte.",
  "Exit at the stop, at the nearest target once price trades beyond it by the buffer, or at the close of the last candle inside the horizon. A gap past the stop exits at the open.":
    "Salida en el stop, en el objetivo más cercano cuando el precio lo supera por el margen, o al cierre de la última vela dentro del horizonte. Un hueco que salta el stop sale a la apertura.",
  "A stop and a target inside one candle count as the stop, and the trade is flagged ambiguous. The entry candle can stop a trade out but not take its target.":
    "Un stop y un objetivo dentro de una misma vela cuentan como stop, y la operación se marca como ambigua. La vela de entrada puede cerrar una operación por stop, pero no alcanzar su objetivo.",
  "Returns are per trade, as a share of the entry, summed one after another (no compounding, no position sizing).":
    "Los rendimientos son por operación, como fracción de la entrada, sumados uno tras otro (sin interés compuesto ni tamaño de posición).",
  "Commission per side (bps)": "Comisión por lado (pb)",
  "Slippage per fill (bps)": "Deslizamiento por ejecución (pb)",
  "Target buffer (bps)": "Margen del objetivo (pb)",

  // Processing
  Queued: "En cola",
  Running: "En curso",
  "Nothing to read": "Nada que leer",
  "Action failed": "La acción falló",
  "Stored videos": "Vídeos guardados",
  "{n} with a transcript or summary": "{n} con transcripción o resumen",
  "AI tokens used": "Tokens de IA usados",
  "{input} in · {output} out": "{input} de entrada · {output} de salida",
  "Paused: the video under way finishes its step, then nothing more runs until you resume.":
    "En pausa: el vídeo en curso termina su paso y después no se ejecuta nada más hasta que reanudes.",
  "Running in the background: new videos are read as their summaries arrive, and pending claims are evaluated again every six hours.":
    "En segundo plano: los vídeos nuevos se leen a medida que llegan sus resúmenes, y las afirmaciones pendientes se vuelven a evaluar cada seis horas.",
  "Not started. Videos with a transcript are read by your AI provider (it uses tokens); videos without one are taken from their summary.":
    "Sin iniciar. Los vídeos con transcripción los lee tu proveedor de IA (consume tokens); los que no la tienen se toman de su resumen.",
  "Queue new videos ({n})": "Poner en cola vídeos nuevos ({n})",
  "Start: read every video": "Empezar: leer todos los vídeos",
  "Cancel queued": "Cancelar los de la cola",
  "Retry failed": "Reintentar los fallidos",
  "Evaluate pending claims now": "Evaluar ahora las afirmaciones pendientes",
  "No video has been queued yet.": "Aún no se ha puesto ningún vídeo en cola.",
  Video: "Vídeo",
  State: "Estado",
  "Read from": "Leído de",
  Summary: "Resumen",
  "Retried after {time}": "Se reintenta después de {time}",
  "Read again": "Volver a leer",

  // Video detail
  "Queued to be read again.": "En cola para volver a leerse.",
  "All videos": "Todos los vídeos",
  "published {time} UTC": "publicado el {time} UTC",
  "Watch on YouTube": "Ver en YouTube",
  "Read from: {source} · extractor {extractor} · evaluator {evaluator}":
    "Leído de: {source} · extractor {extractor} · evaluador {evaluator}",
  "No checkable claims were found in this video.":
    "No se encontraron afirmaciones comprobables en este vídeo.",
  "This video has not been processed yet.": "Este vídeo aún no se ha procesado.",
  "{value} {unit} (stated)": "{value} {unit} (indicado)",
  "to {date} (system default for its timeframe)":
    "hasta el {date} (horizonte del sistema para su temporalidad)",
  "Level {level}": "Nivel {level}",
  "Quote verified": "Cita verificada",
  "Quote approximately found": "Cita encontrada aproximadamente",
  "Quote not found in transcript": "Cita no encontrada en la transcripción",
  "No quote": "Sin cita",
  "What was claimed": "Lo que se afirmó",
  Horizon: "Horizonte",
  "Quoted price": "Precio citado",
  "Probability stated": "Probabilidad indicada",
  Invalidation: "Invalidación",
  "on a close": "al cierre",
  "Extraction confidence": "Confianza de la extracción",
  "What happened": "Lo que pasó",
  "Reference price (market)": "Precio de referencia (mercado)",
  "Evaluated as": "Evaluada como",
  "Time to target": "Tiempo hasta el objetivo",
  "Time to invalidation": "Tiempo hasta la invalidación",
  "Best move (MFE)": "Mejor movimiento (MFE)",
  "Worst move (MAE)": "Peor movimiento (MAE)",
  "Direction at horizon": "Dirección al horizonte",
  Right: "Acertada",
  Wrong: "Errada",
  Flat: "Sin cambio",
  "Move at horizon": "Movimiento al horizonte",
  Triggered: "Activada",
  "Simulated trade (hypothetical)": "Operación simulada (hipotética)",
  "Still open": "Aún abierta",
  "Result in R": "Resultado en R",
  "No cost / 2× cost": "Sin coste / coste 2×",
  "A stop and a target fell inside one candle: counted as the stop.":
    "Un stop y un objetivo cayeron dentro de una misma vela: cuenta como stop.",
  "Costs: {commission} bps commission per side, {slippage} bps slippage per fill, target buffer {buffer} bps.":
    "Costes: {commission} pb de comisión por lado, {slippage} pb de deslizamiento por ejecución, margen del objetivo {buffer} pb.",
  "Market data: {provider} {symbol}, {resolution} candles ({bars}), read {time}. Evaluator {version}.":
    "Datos de mercado: {provider} {symbol}, velas de {resolution} ({bars}), leídos el {time}. Evaluador {version}.",
  "No market data. Evaluator {version}.": "Sin datos de mercado. Evaluador {version}.",
  "Regime at the claim: {trend}, {volatility} volatility.":
    "Régimen en la afirmación: {trend}, volatilidad {volatility}.",

  // Claim chart
  "Horizon end": "Fin del horizonte",
  Reference: "Referencia",

  // Prediction and trade tables
  Settled: "Resueltas",
  "Claims whose target was hit, or that were invalidated or expired inside their horizon. Pending, untriggered, ambiguous and unevaluable claims are counted apart, never as misses.":
    "Afirmaciones cuyo objetivo se alcanzó, o que se invalidaron o expiraron dentro de su horizonte. Las pendientes, no activadas, ambiguas y no evaluables se cuentan aparte, nunca como fallos.",
  "Target hit rate (95% interval)": "Tasa de objetivo alcanzado (intervalo del 95%)",
  "Right but missed": "Acertada pero fallida",
  "Direction right at the horizon's end, yet the target was missed or the invalidation came first: a timing or risk problem.":
    "Dirección acertada al final del horizonte, pero el objetivo no se alcanzó o la invalidación llegó antes: un problema de timing o de riesgo.",
  "Median time to target": "Tiempo mediano hasta el objetivo",
  Pending: "Pendiente",
  Unevaluable: "No evaluable",
  "No claims yet.": "Aún no hay afirmaciones.",
  "No simulated trades yet: only setups that state an entry, a stop and a target are traded.":
    "Aún no hay operaciones simuladas: solo se operan las configuraciones que indican una entrada, un stop y un objetivo.",
  "Win rate (95% interval)": "Porcentaje de acierto (intervalo del 95%)",
  "Cost sensitivity": "Sensibilidad a los costes",
  "The same trades with no commission or slippage, and with twice the costs set below.":
    "Las mismas operaciones sin comisión ni deslizamiento, y con el doble de los costes fijados abajo.",
  Ambiguous: "Ambiguo",
  to: "a",

  // Claim statuses
  "Target hit": "Objetivo alcanzado",
  "Target hit late": "Objetivo alcanzado tarde",
  Expired: "Expirado",
  "Not evaluated": "Sin evaluar",

  // Kinds, origins, job states, directions and regimes (shown as data)
  forecast: "previsión",
  conditional: "condicional",
  setup: "configuración",
  level: "nivel",
  commentary: "comentario",
  explicit: "explícita",
  inferred: "inferida",
  summary: "resumen",
  queued: "en cola",
  running: "en curso",
  done: "hecho",
  failed: "fallido",
  unavailable: "no disponible",
  neutral: "neutral",
  uptrend: "tendencia alcista",
  downtrend: "tendencia bajista",
  high: "alta",
  normal: "normal",
  unknown: "desconocida",
  Unknown: "Desconocido",
  "Uptrend, high volatility": "Tendencia alcista, volatilidad alta",
  "Uptrend, normal volatility": "Tendencia alcista, volatilidad normal",
  "Uptrend, volatility unknown": "Tendencia alcista, volatilidad desconocida",
  "Downtrend, high volatility": "Tendencia bajista, volatilidad alta",
  "Downtrend, normal volatility": "Tendencia bajista, volatilidad normal",
  "Downtrend, volatility unknown": "Tendencia bajista, volatilidad desconocida",

  // Simulated trade exits, horizon units, trigger sides
  stop: "stop",
  time: "tiempo",
  open: "abierta",
  hours: "horas",
  days: "días",
  weeks: "semanas",
  months: "meses",
  above: "por encima de",
  below: "por debajo de",

  // Evaluation reasons and notes (from the engine)
  "No candles for this instrument around the claim.":
    "No hay velas de este instrumento en torno a la afirmación.",
  "No candle had closed by the time of the claim.":
    "Ninguna vela había cerrado en el momento de la afirmación.",
  "No horizon was stated: the system's default horizon for its timeframe is used.":
    "No se indicó horizonte: se usa el horizonte del sistema para su temporalidad.",
  "No direction was stated: taken as long from where the targets lie.":
    "No se indicó dirección: se toma como largo por dónde están los objetivos.",
  "No direction was stated: taken as short from where the targets lie.":
    "No se indicó dirección: se toma como corto por dónde están los objetivos.",
  "The claim names no direction and no one-sided target.":
    "La afirmación no indica dirección ni un objetivo a un solo lado.",
  "A conditional claim is followed from the candle after its trigger was reached.":
    "Una afirmación condicional se sigue desde la vela posterior a que se alcanzara su activación.",
  "The target and the invalidation were reached inside the same candle.":
    "El objetivo y la invalidación se alcanzaron dentro de la misma vela.",
  "The claim has no target, no invalidation and no horizon to check.":
    "La afirmación no tiene objetivo, invalidación ni horizonte que comprobar.",
  "Entry on a limit at the near edge of the stated zone (at the open if a candle opens past it).":
    "Entrada límite en el borde cercano de la zona indicada (a la apertura si una vela abre más allá).",
  "A target fills only once price trades beyond it; a stop and a target inside one candle count as the stop.":
    "Un objetivo solo se ejecuta cuando el precio lo supera; un stop y un objetivo dentro de una misma vela cuentan como stop.",
  "The setup does not state an entry, a stop and a target.":
    "La configuración no indica una entrada, un stop y un objetivo.",
  "The stop is not on the low side of the entry.": "El stop no está por debajo de la entrada.",
  "The stop is not on the high side of the entry.": "El stop no está por encima de la entrada.",
  "No target lies beyond the entry in the setup's direction.":
    "Ningún objetivo está más allá de la entrada en la dirección de la configuración.",
  "No horizon: the trade is followed until the data ends and stays open after that.":
    "Sin horizonte: la operación se sigue hasta que acaban los datos y después queda abierta.",
  "Price never reached the entry zone inside the horizon.":
    "El precio nunca alcanzó la zona de entrada dentro del horizonte.",

  // Market data, worker and API messages
  "A commodity's spot price has no keyless source, and its futures are a different instrument: not evaluated.":
    "El precio al contado de una materia prima no tiene fuente sin clave, y sus futuros son otro instrumento: no se evalúa.",
  "Enable Yahoo Finance in Settings → Market data to evaluate index claims.":
    "Activa Yahoo Finance en Ajustes → Datos de mercado para evaluar afirmaciones sobre índices.",
  "Yahoo Finance no longer keeps candles this far back.":
    "Yahoo Finance ya no guarda velas tan antiguas.",
  "The claim's time is in the future.": "El momento de la afirmación está en el futuro.",
  "The video has no transcript and no summary to read.":
    "El vídeo no tiene transcripción ni resumen que leer.",
  "The step failed.": "El paso falló.",
  "No transcript or summary yet.": "Aún no hay transcripción ni resumen.",
  "AI is not configured: add a provider in Settings, then retry.":
    "La IA no está configurada: añade un proveedor en Ajustes y vuelve a intentarlo.",
  "Invalid channel.": "Canal no válido.",
  "Invalid instrument.": "Instrumento no válido.",
  "Invalid direction.": "Dirección no válida.",
  "Status must be one of pending, not_triggered, target_hit, target_hit_late, invalidated, expired, ambiguous, unevaluable, not_evaluated.":
    "El estado debe ser uno de pending, not_triggered, target_hit, target_hit_late, invalidated, expired, ambiguous, unevaluable, not_evaluated.",
  "Dates must be YYYY-MM-DD.": "Las fechas deben tener el formato AAAA-MM-DD.",
  "Costs must be between 0 and 500 basis points.":
    "Los costes deben estar entre 0 y 500 puntos básicos.",
  "Unknown action.": "Acción desconocida.",
  "Invalid video id.": "ID de vídeo no válido.",
  "Choose a video to read again.": "Elige un vídeo para volver a leerlo.",
  "Processing is running; try again when it is done.":
    "El procesamiento está en marcha; vuelve a intentarlo cuando termine.",
};

export default es;
