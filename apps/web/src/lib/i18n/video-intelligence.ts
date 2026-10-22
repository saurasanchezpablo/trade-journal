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

  // Charts
  "How each analyst's claims ended": "Cómo terminaron las afirmaciones de cada analista",
  "Against chance: analyst against the opposite bet":
    "Frente al azar: el analista contra la apuesta contraria",
  "Each claim is also evaluated turned the other way (same distances, opposite direction) on the same candles. Dots are hit rates, whiskers their 95% intervals: an analyst whose whisker overlaps their mirror's shows no evidence of skill.":
    "Cada afirmación se evalúa también al revés (mismas distancias, dirección opuesta) sobre las mismas velas. Los puntos son porcentajes de acierto y los bigotes sus intervalos del 95%: un analista cuyo bigote se solapa con el de su espejo no muestra indicios de habilidad.",
  "Mirror (opposite bet)": "Espejo (apuesta contraria)",
  "Claims per month, by outcome": "Afirmaciones por mes, según resultado",
  "Best and worst move of each claim": "Mejor y peor movimiento de cada afirmación",
  "No evaluated claims yet.": "Aún no hay afirmaciones evaluadas.",
  "Stated probabilities against what happened": "Probabilidades indicadas frente a lo que ocurrió",
  "Stated probabilities": "Probabilidades indicadas",
  "Stated probability": "Probabilidad indicada",
  "How often it happened": "Con qué frecuencia ocurrió",
  "Perfect calibration": "Calibración perfecta",
  Stated: "Indicada",
  Observed: "Observada",
  "Cumulative return of the simulated trades": "Rendimiento acumulado de las operaciones simuladas",
  "No closed simulated trades yet.": "Aún no hay operaciones simuladas cerradas.",
  "Trades by result in R": "Operaciones por resultado en R",
  "No cost": "Sin costes",
  "2× cost": "Costes ×2",

  // Against chance
  "Against chance": "Frente al azar",
  "Too few claims to tell": "Muy pocas afirmaciones para saberlo",
  "Better than chance": "Mejor que el azar",
  "Worse than chance": "Peor que el azar",
  "No evidence of an edge": "Sin indicios de ventaja",
  "No claim has been settled both ways yet.":
    "Aún no hay ninguna afirmación resuelta en ambos sentidos.",
  Pairs: "Pares",
  "Analyst hit rate": "Acierto del analista",
  "Mirror hit rate": "Acierto del espejo",
  "Only analyst / only mirror": "Solo analista / solo espejo",
  "Claims where only the analyst's target came first, and claims where only the opposite bet's did. When both or neither won, the claim says nothing about skill.":
    "Afirmaciones en las que solo llegó primero el objetivo del analista, y en las que solo llegó el de la apuesta contraria. Cuando ganan ambos o ninguno, la afirmación no dice nada sobre la habilidad.",
  "p-value": "Valor p",
  "The chance of a split at least this uneven if the analyst had no edge (exact two-sided sign test). Under 5% is unlikely to be luck; with many analysts, about one in twenty passes by luck alone.":
    "La probabilidad de un reparto al menos así de desigual si el analista no tuviera ventaja (prueba de signos exacta de dos colas). Por debajo del 5% es poco probable que sea suerte; con muchos analistas, aproximadamente uno de cada veinte la pasa solo por suerte.",
  Verdict: "Veredicto",
  "On {pairs} claims settled both ways, the analysts' targets came first {analyst} of the time; the same distances bet the other way, {mirror}.":
    "En {pairs} afirmaciones resueltas en ambos sentidos, los objetivos de los analistas llegaron primero el {analyst} de las veces; las mismas distancias apostadas al revés, el {mirror}.",
  "p = {p} (sign test, {a} analyst-only against {m} mirror-only wins)":
    "p = {p} (prueba de signos, {a} victorias solo del analista frente a {m} solo del espejo)",

  // How it's calculated: steps
  "How it's calculated": "Cómo se calcula",
  "Where the numbers come from": "De dónde salen los números",
  "1. The video": "1. El vídeo",
  "Its transcript (captions or one you pasted) or, without one, its summary. Nothing else about the video is read.":
    "Su transcripción (subtítulos o una que pegaste) o, si no la tiene, su resumen. No se lee nada más del vídeo.",
  "2. The claims": "2. Las afirmaciones",
  "Your AI provider lists each checkable statement with a verbatim quote. The journal then looks the quote up in the transcript itself: verified, approximate or not found. A video without a transcript gives its summary's scenarios and setups, marked as such, with no quote. This is the only step that uses AI.":
    "Tu proveedor de IA enumera cada afirmación comprobable con una cita literal. Después el diario busca la cita en la propia transcripción: verificada, aproximada o no encontrada. Un vídeo sin transcripción aporta los escenarios y configuraciones de su resumen, marcados como tales, sin cita. Es el único paso que usa IA.",
  "3. The market": "3. El mercado",
  "The instrument is matched to one of your enabled sources (never guessed across asset classes). Closed candles from before the video to after its horizon are downloaded and stored, with the source, symbol, candle size and time read.":
    "El instrumento se asocia a una de tus fuentes activadas (nunca se adivina entre clases de activo). Se descargan y guardan las velas cerradas desde antes del vídeo hasta después de su horizonte, con la fuente, el símbolo, la temporalidad y el momento de la lectura.",
  "4. The evaluation": "4. La evaluación",
  "Plain code, no AI: from the stored candles it finds the reference price (the last close before publication), then which came first after it, the target or the invalidation, inside the horizon. A setup with an entry, a stop and a target is also traded once under fixed rules. The same claim on the same candles always gives the same result.":
    "Código sin IA: a partir de las velas guardadas busca el precio de referencia (el último cierre antes de la publicación) y después qué llegó primero, el objetivo o la invalidación, dentro del horizonte. Una configuración con entrada, stop y objetivo además se opera una vez con reglas fijas. La misma afirmación sobre las mismas velas siempre da el mismo resultado.",
  "5. The statistics": "5. La estadística",
  "Outcomes are counted per analyst, instrument, direction, kind of claim and market regime, with 95% intervals, and each group is compared with its mirror: the same claims bet the other way.":
    "Los resultados se cuentan por analista, instrumento, dirección, tipo de afirmación y régimen de mercado, con intervalos del 95%, y cada grupo se compara con su espejo: las mismas afirmaciones apostadas al revés.",
  "Every claim's page shows this path for that claim: the quote, the source and candles read, and the candles that decided it.":
    "La página de cada afirmación muestra este recorrido para ella: la cita, la fuente y las velas leídas, y las velas que la decidieron.",

  // How it's calculated: worked example
  "A worked example": "Un ejemplo resuelto",
  "A video published on 1 October at 12:00 says bitcoin rallies to 87,000, invalid below 80,000, on the 4-hour chart. No horizon is said, so the system uses ten days (to 11 October 12:00), labelled on the claim.":
    "Un vídeo publicado el 1 de octubre a las 12:00 dice que bitcoin sube hasta 87,000, invalidado por debajo de 80,000, en el gráfico de 4 horas. No indica horizonte, así que el sistema usa diez días (hasta el 11 de octubre a las 12:00), y así se señala en la afirmación.",
  "Reference: the 11:00 candle closed at 83,905.76, the last close before publication.":
    "Referencia: la vela de las 11:00 cerró en 83,905.76, el último cierre antes de la publicación.",
  "From the 12:00 candle on, the first candle whose high reaches 87,000 is the 2 October 12:00 candle; no candle had reached 80,000 before it.":
    "Desde la vela de las 12:00, la primera vela cuyo máximo llega a 87,000 es la del 2 de octubre a las 12:00; ninguna vela había llegado a 80,000 antes.",
  "Outcome: target hit, 1 day after publication.":
    "Resultado: objetivo alcanzado, 1 día después de la publicación.",
  "Its mirror, a short to 80,921.57 (as far below the reference as 87,000 is above it) invalid above 88,002.21, also reached its target inside the horizon, on 8 October at 15:00. Both sides won, so this claim counts for neither in the comparison with chance: only claims where one side won and the other did not can show skill.":
    "Su espejo, un corto hasta 80,921.57 (tan por debajo de la referencia como 87,000 está por encima) invalidado por encima de 88,002.21, también alcanzó su objetivo dentro del horizonte, el 8 de octubre a las 15:00. Ganaron ambos lados, así que esta afirmación no cuenta para ninguno en la comparación con el azar: solo las afirmaciones en las que un lado ganó y el otro no pueden mostrar habilidad.",

  // How it's calculated: metrics
  "What each number means": "Qué significa cada número",
  Number: "Número",
  "How it is computed": "Cómo se calcula",
  "How to read it": "Cómo leerlo",
  "Targets hit inside the horizon ÷ claims settled (target hit, invalidated, expired or hit late). Pending, untriggered, ambiguous and unevaluable claims are left out, never counted as misses.":
    "Objetivos alcanzados dentro del horizonte ÷ afirmaciones resueltas (objetivo alcanzado, invalidada, expirada o alcanzado tarde). Las pendientes, sin activar, ambiguas y no evaluables se dejan fuera, nunca cuentan como fallos.",
  "The share of finished calls that reached their target in time. The interval is where the true rate likely lies given how few claims there are.":
    "La proporción de predicciones terminadas que alcanzaron su objetivo a tiempo. El intervalo es donde probablemente está el porcentaje real, dado lo pocas que son las afirmaciones.",
  "95% interval (Wilson)": "Intervalo del 95% (Wilson)",
  "A range computed from the count of hits and the sample size; it narrows as claims accumulate.":
    "Un rango calculado a partir del número de aciertos y del tamaño de la muestra; se estrecha a medida que se acumulan afirmaciones.",
  "If two analysts' intervals overlap a lot, the data cannot tell them apart.":
    "Si los intervalos de dos analistas se solapan mucho, los datos no permiten distinguirlos.",
  "The close of the last candle inside the horizon against the reference price (moves under 0.05% are flat), among claims whose horizon ended.":
    "El cierre de la última vela dentro del horizonte frente al precio de referencia (los movimientos de menos del 0.05% cuentan como planos), entre las afirmaciones cuyo horizonte terminó.",
  "Whether the analyst read the direction, regardless of their target and stop.":
    "Si el analista acertó la dirección, independientemente de su objetivo y su stop.",
  "Direction right at the horizon's end, but the invalidation came first or the target was never reached.":
    "Dirección acertada al final del horizonte, pero la invalidación llegó antes o el objetivo nunca se alcanzó.",
  "Right idea, wrong levels or timing.": "Idea correcta, niveles o momento equivocados.",
  "The same claims with the opposite direction and every level the same distance away, evaluated on the same candles.":
    "Las mismas afirmaciones con la dirección opuesta y cada nivel a la misma distancia, evaluadas sobre las mismas velas.",
  "What betting against the analyst scored. Close to the analyst's rate means no evidence of skill.":
    "Lo que habría obtenido apostar contra el analista. Si se acerca al porcentaje del analista, no hay indicios de habilidad.",
  "p-value (sign test)": "Valor p (prueba de signos)",
  "On claims where only one side won, how likely a split at least this uneven would be if each claim were a coin flip.":
    "En las afirmaciones en las que solo ganó un lado, la probabilidad de un reparto al menos así de desigual si cada afirmación fuera lanzar una moneda.",
  "Under 5%: unlikely to be luck. With many analysts compared, expect about one in twenty to pass by chance.":
    "Por debajo del 5%: poco probable que sea suerte. Al comparar muchos analistas, cuenta con que aproximadamente uno de cada veinte la pase por azar.",
  "MFE / MAE": "MFE / MAE",
  "The best and worst move from the reference price inside the horizon, as a percentage.":
    "El mejor y el peor movimiento desde el precio de referencia dentro del horizonte, en porcentaje.",
  "A target hit after a deep MAE was hard to hold.":
    "Un objetivo alcanzado tras un MAE profundo era difícil de aguantar.",
  "Brier score": "Puntuación de Brier",
  "Average of (stated probability − outcome)², only for probabilities the analyst stated.":
    "Media de (probabilidad indicada − resultado)², solo para las probabilidades que indicó el analista.",
  "0 is perfect; always saying 50% scores 0.25.": "0 es perfecto; decir siempre 50% da 0.25.",
  "Expectancy, win rate, R": "Esperanza, porcentaje de acierto, R",
  "From the simulated trades of level C setups only, after commission and slippage. R is the result over the stop's distance.":
    "Solo a partir de las operaciones simuladas de las configuraciones de nivel C, después de comisiones y deslizamiento. R es el resultado dividido entre la distancia al stop.",
  "Hypothetical results of the stated rules, not the analyst's own trading record.":
    "Resultados hipotéticos de las reglas indicadas, no el historial de operaciones del propio analista.",

  // How it's calculated: tests and audit
  "How the results are tested": "Cómo se prueban los resultados",
  "Hand-made cases": "Casos hechos a mano",
  "Every outcome (target hit, invalidated, ambiguous, pending, expired, late, untriggered) on candles built so the right answer is known.":
    "Cada resultado (objetivo alcanzado, invalidada, ambigua, pendiente, expirada, tardía, sin activar) sobre velas construidas para que se conozca la respuesta correcta.",
  "Real candles": "Velas reales",
  "Bitcoin's hourly candles from October 2026 with results worked out separately, by another program: reference, target times and the setup's fills match to the decimal.":
    "Velas horarias de bitcoin de octubre de 2026 con resultados calculados por separado, con otro programa: la referencia, los momentos de los objetivos y las ejecuciones de la configuración coinciden hasta el decimal.",
  "3,000 random markets": "3,000 mercados aleatorios",
  "Every evaluation compared with a second, independent implementation of the rules; they always agree.":
    "Cada evaluación se compara con una segunda implementación independiente de las reglas; siempre coinciden.",
  "No look-ahead": "Sin mirar al futuro",
  "Removing every candle after the deciding one never changes an outcome, and one candle fewer always leaves it pending.":
    "Quitar todas las velas posteriores a la decisiva nunca cambia un resultado, y una vela menos siempre lo deja pendiente.",
  "No bias": "Sin sesgo",
  "A claim and its mirror on a mirrored market always get the same outcome; multiplying all prices by any number changes nothing; higher costs never improve a trade.":
    "Una afirmación y su espejo sobre un mercado reflejado siempre obtienen el mismo resultado; multiplicar todos los precios por cualquier número no cambia nada; unos costes más altos nunca mejoran una operación.",
  "The statistics": "La estadística",
  "On random markets, analysts who guess are flagged as better than chance under 10% of the time (5% expected), while an analyst who knows the future is flagged over 80% of the time. The 95% intervals contain the true rate about 95% of the time.":
    "En mercados aleatorios, los analistas que adivinan salen como mejores que el azar menos del 10% de las veces (se espera un 5%), mientras que un analista que conoce el futuro sale así más del 80% de las veces. Los intervalos del 95% contienen el porcentaje real aproximadamente el 95% de las veces.",
  Reproducibility: "Reproducibilidad",
  "The audit below computes every stored result again from the stored candles and compares it, field by field.":
    "La auditoría de abajo vuelve a calcular cada resultado guardado a partir de las velas guardadas y lo compara, campo a campo.",
  "Check every stored result now": "Comprobar ahora todos los resultados guardados",
  "Recomputes each evaluation from its stored candles; nothing is downloaded.":
    "Recalcula cada evaluación a partir de sus velas guardadas; no se descarga nada.",
  "{bad} of {checked} results could not be reproduced.":
    "{bad} de {checked} resultados no se pudieron reproducir.",
  "All {checked} results were reproduced exactly from the stored candles.":
    "Los {checked} resultados se reprodujeron exactamente a partir de las velas guardadas.",
  "Not checked: {none} claims without candles (unevaluable) and {old} judged by an older evaluator (they are evaluated again in the background).":
    "Sin comprobar: {none} afirmaciones sin velas (no evaluables) y {old} juzgadas por un evaluador anterior (se vuelven a evaluar en segundo plano).",
  "Limits to keep in mind": "Límites a tener en cuenta",
  "The results describe the videos you followed and stored, not the analyst's whole record.":
    "Los resultados describen los vídeos que seguiste y guardaste, no el historial completo del analista.",
  "A claim is only as good as its reading: check the quote on its page, especially for inferred claims.":
    "Una afirmación vale lo que vale su lectura: revisa la cita en su página, sobre todo en las afirmaciones inferidas.",
  "Candles do not show the order of prices inside them: when a target and an invalidation share a candle, the claim is ambiguous rather than a win.":
    "Las velas no muestran el orden de los precios dentro de ellas: cuando un objetivo y una invalidación comparten vela, la afirmación es ambigua y no un acierto.",
  "Under 20 settled claims, rates are shown with a small-sample warning and should not be compared.":
    "Con menos de 20 afirmaciones resueltas, los porcentajes se muestran con un aviso de muestra pequeña y no deberían compararse.",
  "Comparing many analysts, about one in twenty will look better than chance by luck alone.":
    "Al comparar muchos analistas, aproximadamente uno de cada veinte parecerá mejor que el azar solo por suerte.",

  // Audit fields (a result that could not be reproduced lists them)
  status: "estado",
  "reference price": "precio de referencia",
  "target time": "momento del objetivo",
  "invalidation time": "momento de la invalidación",
  "best and worst move": "mejor y peor movimiento",
  "direction at horizon": "dirección en el horizonte",
  baseline: "apuesta contraria",
  "simulated trade": "operación simulada",

  // Claim detail: how this was decided
  "Against chance:": "Frente al azar:",
  "the same distances bet the other way ({side}, target {target}) ended {status} on the same candles.":
    "las mismas distancias apostadas al revés ({side}, objetivo {target}) terminaron con resultado {status} sobre las mismas velas.",
  "How this was decided": "Cómo se decidió",
  "Reference: the candle opening {time} closed at {price}, the last close before the video.":
    "Referencia: la vela que abrió el {time} cerró en {price}, el último cierre antes del vídeo.",
  "Trigger: the candle opening {time} traded {direction} {price} (high {high}, low {low}).":
    "Activación: la vela que abrió el {time} cotizó {direction} {price} (máximo {high}, mínimo {low}).",
  "Target {price}: first reached by the candle opening {time} ({extreme} {value}).":
    "Objetivo {price}: lo alcanzó primero la vela que abrió el {time} ({extreme} {value}).",
  "candle|high": "máximo",
  "candle|low": "mínimo",
  "Invalidation {price}: the candle opening {time} closed beyond it, at {close}.":
    "Invalidación {price}: la vela que abrió el {time} cerró más allá, en {close}.",
  "Invalidation {price}: first reached by the candle opening {time} (high {high}, low {low}).":
    "Invalidación {price}: la alcanzó primero la vela que abrió el {time} (máximo {high}, mínimo {low}).",
  "The candle opening {time} (high {high}, low {low}) reached both the target {target} and the invalidation {invalidation}: which came first is unknown.":
    "La vela que abrió el {time} (máximo {high}, mínimo {low}) alcanzó tanto el objetivo {target} como la invalidación {invalidation}: no se sabe cuál llegó primero.",
  "Horizon end: the last candle inside it, opening {time}, closed at {close}: {move} from {reference}.":
    "Fin del horizonte: la última vela dentro de él, que abrió el {time}, cerró en {close}: {move} desde {reference}.",
};

export default es;
