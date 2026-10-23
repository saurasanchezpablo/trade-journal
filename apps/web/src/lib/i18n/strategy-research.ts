/** Spanish for Strategy research (backtests, validation, signals and paper trading). See lib/i18n.ts. */
const es: Record<string, string> = {
  // Navigation and page
  "Strategy research": "Investigación de estrategias",
  "Trading strategies chosen from published evidence, tested on Binance's daily history after costs, and judged against a standard declared before the results. In-sample, walk-forward, holdout and paper results are kept apart.":
    "Estrategias elegidas a partir de la evidencia publicada, probadas con el histórico diario de Binance después de costes y juzgadas con un estándar declarado antes de ver los resultados. Los resultados dentro de muestra, walk-forward, de reserva y simulados se muestran por separado.",
  "Research and paper trading only: no order is ever placed and no exchange account is used. Past results, even out of sample, do not promise future returns. Nothing here is investment advice.":
    "Solo investigación y operativa simulada: nunca se envía una orden ni se usa una cuenta de exchange. Los resultados pasados, incluso fuera de muestra, no prometen rentabilidades futuras. Nada de esto es asesoramiento de inversión.",
  "Paper trading": "Operativa simulada",
  Method: "Método",
  Data: "Datos",
  "Sharpe ratio by kind of evidence": "Ratio de Sharpe por tipo de evidencia",
  "In-sample bars are the highest by construction: each is the best of several configurations, measured on the days it was chosen on. Walk-forward and holdout show what was left on days no choice saw.":
    "Las barras dentro de muestra son las más altas por construcción: cada una es la mejor de varias configuraciones, medida en los mismos días en que se eligió. Walk-forward y reserva muestran lo que quedó en días que ninguna elección vio.",
  "Saved. Run the research again to apply the new costs.":
    "Guardado. Vuelve a ejecutar la investigación para aplicar los nuevos costes.",
  "Download new data": "Descargar datos nuevos",
  "Download and run the research": "Descargar y ejecutar la investigación",
  "Stop monitoring": "Detener la vigilancia",
  "Start monitoring and paper trading": "Iniciar vigilancia y operativa simulada",
  "Forget every recorded signal and start the paper ledger again?":
    "¿Olvidar todas las señales registradas y empezar de nuevo el registro simulado?",
  "Reset paper ledger": "Reiniciar el registro simulado",
  "downloading data…": "descargando datos…",
  "running the research…": "ejecutando la investigación…",
  "recording signals…": "registrando señales…",
  "monitoring (checked every 10 minutes)": "vigilando (comprobado cada 10 minutos)",
  idle: "en reposo",
  "Data downloaded": "Datos descargados",
  "Research run": "Investigación ejecutada",
  "Signals checked": "Señales comprobadas",
  "Stale data, signals skipped for: {list}": "Datos atrasados, señales omitidas para: {list}",
  "Last {step} failed: {text}": "Falló el último paso ({step}): {text}",
  refresh: "descarga",
  research: "investigación",
  monitor: "vigilancia",
  "Cost assumptions": "Supuestos de costes",
  "Spot fee (bp)": "Comisión spot (pb)",
  "Perpetual fee (bp)": "Comisión de perpetuos (pb)",
  "Slippage per side (bp)": "Deslizamiento por lado (pb)",
  "Cash rate (% a year)": "Tipo del efectivo (% anual)",
  "Defaults: Binance taker fees for a regular account (spot 0.10%, USD-M futures 0.05%) and 5 bp slippage, conservative for BTC and ETH. The cash rate is an assumption (about the 2019 to 2025 average 3-month US Treasury bill yield): idle capital earns it and every Sharpe ratio is measured against it.":
    "Por defecto: comisiones taker de Binance para una cuenta normal (spot 0,10 %, futuros USD-M 0,05 %) y 5 pb de deslizamiento, conservador para BTC y ETH. El tipo del efectivo es un supuesto (aproximadamente la rentabilidad media de las letras del Tesoro de EE. UU. a 3 meses entre 2019 y 2025): lo gana el capital sin invertir y todo ratio de Sharpe se mide contra él.",
  "No research yet: download the data and run the research (about a minute the first time).":
    "Aún no hay investigación: descarga los datos y ejecútala (alrededor de un minuto la primera vez).",
  "None of the {n} candidates meets the evidence standard: all are experimental. Their signals can be monitored and paper traded, but no result here establishes an edge.":
    "Ninguna de las {n} candidatas cumple el estándar de evidencia: todas son experimentales. Sus señales pueden vigilarse y operarse en simulación, pero ningún resultado de aquí demuestra una ventaja.",
  "{meets} of {n} candidates meet the evidence standard (still research, not a promise of returns).":
    "{meets} de {n} candidatas cumplen el estándar de evidencia (sigue siendo investigación, no una promesa de rentabilidad).",
  "Configuration chosen": "Configuración elegida",
  "In-sample Sharpe": "Sharpe dentro de muestra",
  "Deflated Sharpe": "Sharpe deflactado",
  PBO: "PBO",
  "Walk-forward Sharpe": "Sharpe walk-forward",
  "vs benchmark": "frente a la referencia",
  "Walk-forward max DD": "Máx. drawdown walk-forward",
  "Holdout return": "Rentabilidad de reserva",
  Trials: "Pruebas",
  benchmark: "referencia",
  "cash (0)": "efectivo (0)",
  "Paper trading starts when monitoring starts: each day after the close, every strategy's frozen configuration decides, the decision is recorded once and never rewritten, and the paper ledger replays the recorded signals at the next open. Nothing that happened before that day is ever counted.":
    "La operativa simulada empieza al iniciar la vigilancia: cada día tras el cierre, la configuración congelada de cada estrategia decide, la decisión se registra una vez y nunca se reescribe, y el registro simulado reproduce las señales registradas en la siguiente apertura. Nada anterior a ese día cuenta.",
  "Since {date}. A few days or weeks of paper results say almost nothing about a strategy: read them as a check that the signals and the accounting work, not as evidence.":
    "Desde el {date}. Unos días o semanas de resultados simulados no dicen casi nada de una estrategia: léelos como una comprobación de que las señales y la contabilidad funcionan, no como evidencia.",
  "Current signal": "Señal actual",
  "Decided on": "Decidida el",
  "Paper days": "Días simulados",
  "Paper return": "Rentabilidad simulada",
  "no signal yet": "aún sin señal",
  changed: "cambió",
  "How a strategy is tested": "Cómo se prueba una estrategia",
  "Each strategy decides at the close of a day with only the candles (and funding) up to that close, and trades at the next day's open. Returns run from open to open.":
    "Cada estrategia decide al cierre de un día solo con las velas (y la financiación) hasta ese cierre, y opera en la apertura del día siguiente. Las rentabilidades van de apertura a apertura.",
  "Every trade pays commission and slippage; positions drift with prices, so holding a weight also trades. Perpetual shorts receive (or pay) the funding actually paid on Binance. Idle capital earns the cash rate.":
    "Cada operación paga comisión y deslizamiento; las posiciones derivan con los precios, así que mantener un peso también opera. Los cortos en perpetuos cobran (o pagan) la financiación realmente pagada en Binance. El capital sin invertir gana el tipo del efectivo.",
  "In-sample: every configuration of the strategy's small, pre-declared grid runs on the days before the holdout ({date}); the best Sharpe ratio is chosen.":
    "Dentro de muestra: cada configuración de la pequeña rejilla declarada de antemano se ejecuta en los días anteriores a la reserva ({date}); se elige el mejor ratio de Sharpe.",
  "Walk-forward: every 90 days, the configuration with the best Sharpe over the previous 730 days trades the next 90. Only before the holdout.":
    "Walk-forward: cada 90 días, la configuración con mejor Sharpe en los 730 días anteriores opera los 90 siguientes. Solo antes de la reserva.",
  "Holdout: the in-sample choice, frozen, on the days from {date}, which no choice ever saw.":
    "Reserva: la elección dentro de muestra, congelada, en los días desde el {date}, que ninguna elección vio.",
  "Paper: from the day monitoring starts, the recorded daily signals of the frozen configuration, replayed at the next open with the same accounting.":
    "Simulada: desde el día en que empieza la vigilancia, las señales diarias registradas de la configuración congelada, reproducidas en la siguiente apertura con la misma contabilidad.",
  "The evidence standard (declared before the results)":
    "El estándar de evidencia (declarado antes de los resultados)",
  "At least {years} years before the holdout and {days} days of holdout.":
    "Al menos {years} años antes de la reserva y {days} días de reserva.",
  "Deflated Sharpe ratio at least {v}: the probability that the chosen configuration's Sharpe ratio beats the best that luck would give over the number of configurations tried.":
    "Ratio de Sharpe deflactado de al menos {v}: la probabilidad de que el Sharpe de la configuración elegida supere el mejor que daría la suerte con el número de configuraciones probadas.",
  "Probability of backtest overfitting at most {v}: how often the best configuration on half of the history ranks below the median on the other half (combinatorially symmetric cross-validation).":
    "Probabilidad de sobreajuste del backtest de como mucho {v}: con qué frecuencia la mejor configuración en una mitad del histórico queda por debajo de la mediana en la otra mitad (validación cruzada combinatoriamente simétrica).",
  "Walk-forward Sharpe ratio above 0, with the bootstrap's 95% interval above 0.":
    "Ratio de Sharpe walk-forward por encima de 0, con el intervalo bootstrap del 95 % por encima de 0.",
  "Walk-forward Sharpe ratio above the benchmark's over the same days (BTC held; cash for the market-neutral carry).":
    "Ratio de Sharpe walk-forward por encima del de la referencia en los mismos días (BTC mantenido; efectivo para el carry neutral al mercado).",
  "Holdout return after costs above what cash earned over the same days.":
    "Rentabilidad de reserva después de costes por encima de lo que ganó el efectivo en los mismos días.",
  "Passing everything: meets the standard. Positive out of sample but failing a criterion: experimental. Not better than cash out of sample: rejected.":
    "Si lo supera todo: cumple el estándar. Positiva fuera de muestra pero falla algún criterio: experimental. No mejor que el efectivo fuera de muestra: rechazada.",
  "Versions: engine {engine}, catalog {catalog}, evaluation {evaluation}.":
    "Versiones: motor {engine}, catálogo {catalog}, evaluación {evaluation}.",
  "What the categories mean": "Qué significa cada categoría",
  "The full method, formulas, sources and limitations are in docs/trading/ in the journal's repository.":
    "El método completo, las fórmulas, las fuentes y las limitaciones están en docs/trading/ del repositorio del diario.",
  "No data downloaded yet.": "Aún no se han descargado datos.",
  "Public, keyless Binance endpoints; only closed daily candles are stored. Each refresh asks only for what is newer, spaced well under the published rate limits.":
    "Endpoints públicos de Binance sin clave; solo se guardan velas diarias cerradas. Cada actualización pide solo lo nuevo, espaciado muy por debajo de los límites publicados.",
  Rows: "Filas",
  Retrieved: "Obtenido",
  // Strategy page
  "All strategies": "Todas las estrategias",
  "BTC buy and hold (same days)": "BTC comprar y mantener (mismos días)",
  Hypothesis: "Hipótesis",
  "Why it can fail": "Por qué puede fallar",
  "A market-neutral book: it is judged against cash (its Sharpe ratio is already measured against the cash rate). BTC is shown only for scale.":
    "Una cartera neutral al mercado: se juzga frente al efectivo (su ratio de Sharpe ya se mide contra el tipo del efectivo). BTC se muestra solo como escala.",
  Instruments: "Instrumentos",
  "Costs: spot {spot} bp, perpetual {perp} bp, slippage {slip} bp, cash {cash} a year":
    "Costes: spot {spot} pb, perpetuo {perp} pb, deslizamiento {slip} pb, efectivo {cash} anual",
  "Not run yet: run the research on the Research page.":
    "Aún sin ejecutar: ejecuta la investigación en la página de investigación.",
  Results: "Resultados",
  "Selection bias": "Sesgo de selección",
  Regimes: "Regímenes",
  "Signals and paper": "Señales y simulada",
  "Against the evidence standard": "Frente al estándar de evidencia",
  "All metrics, by kind of evidence": "Todas las métricas, por tipo de evidencia",
  "{from} to {to}: {cagr} a year (Sharpe {sharpe}, worst drawdown {dd})":
    "Del {from} al {to}: {cagr} anual (Sharpe {sharpe}, peor drawdown {dd})",
  "against the benchmark's {cagr} a year (Sharpe {sharpe}, worst drawdown {dd}).":
    "frente al {cagr} anual de la referencia (Sharpe {sharpe}, peor drawdown {dd}).",
  "Every configuration tried (in-sample, before the holdout)":
    "Todas las configuraciones probadas (dentro de muestra, antes de la reserva)",
  "The chosen configuration (marked) is the best of these on the same days, so its in-sample Sharpe ratio is biased upwards. The Deflated Sharpe ratio and the probability of backtest overfitting measure how much.":
    "La configuración elegida (marcada) es la mejor de estas en los mismos días, así que su Sharpe dentro de muestra está sesgado al alza. El Sharpe deflactado y la probabilidad de sobreajuste miden cuánto.",
  "Deflated Sharpe ratio": "Ratio de Sharpe deflactado",
  "Daily Sharpe to beat: {v} (the best of {n} tries by luck)":
    "Sharpe diario a superar: {v} (el mejor de {n} intentos por suerte)",
  "Probability of backtest overfitting": "Probabilidad de sobreajuste del backtest",
  "{n} splits of 10 blocks; 0.5 is what pure luck gives":
    "{n} particiones de 10 bloques; 0,5 es lo que da la pura suerte",
  "One configuration: nothing was chosen": "Una sola configuración: no se eligió nada",
  "Trials recorded": "Pruebas registradas",
  "Distinct configurations ever evaluated, over {runs} evaluations":
    "Configuraciones distintas evaluadas alguna vez, en {runs} evaluaciones",
  "Walk-forward windows": "Ventanas walk-forward",
  "Each bar is a 90-day window traded by the configuration chosen on the 730 days before it ({n} configuration choices in all). A configuration that keeps changing is a sign the choice is mostly noise.":
    "Cada barra es una ventana de 90 días operada por la configuración elegida en los 730 días anteriores ({n} elecciones de configuración en total). Una configuración que cambia sin parar indica que la elección es sobre todo ruido.",
  "By market regime": "Por régimen de mercado",
  "Kind of evidence": "Tipo de evidencia",
  "Each day's regime comes from BTC's own past only: the previous close against its 200-day average (trend), and the previous 30 days' volatility against the median of all earlier days (calm or volatile).":
    "El régimen de cada día sale solo del pasado de BTC: el cierre anterior frente a su media de 200 días (tendencia) y la volatilidad de los 30 días anteriores frente a la mediana de todos los días previos (tranquilo o volátil).",
  "Monitoring is on: the first signal is recorded after the next daily close.":
    "La vigilancia está activa: la primera señal se registra tras el próximo cierre diario.",
  "No signals recorded: start monitoring on the Research page to record them and paper trade.":
    "No hay señales registradas: inicia la vigilancia en la página de investigación para registrarlas y operar en simulación.",
  "Latest signal": "Última señal",
  "decided on the close of {day}, to execute at the open of {exec}":
    "decidida al cierre del {day}, para ejecutarse en la apertura del {exec}",
  "Signal log": "Registro de señales",
  "No paper day accounted yet: a day counts once the open after it is known (the first signal executes at the open of {date}).":
    "Aún no hay ningún día simulado contabilizado: un día cuenta cuando se conoce la apertura siguiente (la primera señal se ejecuta en la apertura del {date}).",
  "Close of": "Cierre del",
  "Executes at the open of": "Se ejecuta en la apertura del",
  Recorded: "Registrada",
  late: "tarde",
  // Parts and metrics
  "Not run yet": "Sin ejecutar",
  "Not measurable": "No medible",
  Passed: "Superado",
  Days: "Días",
  "Total return": "Rentabilidad total",
  CAGR: "CAGR",
  "Compounded annual growth rate, after costs.":
    "Tasa de crecimiento anual compuesta, después de costes.",
  "Annualized standard deviation of daily returns.":
    "Desviación típica anualizada de las rentabilidades diarias.",
  "Sharpe ratio": "Ratio de Sharpe",
  "Mean daily return over the cash rate, divided by its standard deviation, × √365.":
    "Rentabilidad diaria media sobre el tipo del efectivo, dividida por su desviación típica, × √365.",
  "Sharpe 95% interval": "Intervalo del 95 % del Sharpe",
  "Stationary block bootstrap (2,000 resamples, mean block 10 days, fixed seed).":
    "Bootstrap estacionario por bloques (2.000 remuestreos, bloque medio de 10 días, semilla fija).",
  "Probabilistic Sharpe": "Sharpe probabilístico",
  "Probability that the true Sharpe ratio is above 0, given the sample's length, skewness and kurtosis.":
    "Probabilidad de que el verdadero ratio de Sharpe sea mayor que 0, dada la longitud, la asimetría y la curtosis de la muestra.",
  "Sortino ratio": "Ratio de Sortino",
  "Longest drawdown": "Drawdown más largo",
  "{n} days": "{n} días",
  "Calmar ratio": "Ratio de Calmar",
  "Worst day / 95% CVaR": "Peor día / CVaR 95 %",
  "Skewness / excess kurtosis": "Asimetría / exceso de curtosis",
  "Beta / correlation to benchmark": "Beta / correlación con la referencia",
  Exposure: "Exposición",
  "Average share of capital at work (Σ|weight|).": "Parte media del capital invertida (Σ|peso|).",
  "Turnover a year": "Rotación anual",
  "Σ|traded weight| a year: 2 means the whole book bought and sold once.":
    "Σ|peso operado| al año: 2 significa comprar y vender toda la cartera una vez.",
  "Costs paid": "Costes pagados",
  "Commission and slippage, as a share of starting capital, summed.":
    "Comisión y deslizamiento, como parte del capital inicial, sumados.",
  "Funding received": "Financiación cobrada",
  "Cash income": "Rendimiento del efectivo",
  Metric: "Métrica",
  "The worst rise of the perpetual from the open to the high on a day a short was held, against the margin posted (the backtest assumes it is topped up daily).":
    "La peor subida del perpetuo de la apertura al máximo en un día con un corto abierto, frente al margen depositado (el backtest supone que se repone a diario).",
  "Worst move against the short leg": "Peor movimiento contra la pata corta",
  "{move} of {margin} margin": "{move} de un margen del {margin}",
  Benchmark: "Referencia",
  cash: "efectivo",
  chosen: "elegida",
  Sharpe: "Sharpe",
  "In-sample": "Dentro de muestra",
  "Walk-forward": "Walk-forward",
  Holdout: "Reserva",
  Chosen: "Elegida",
  "Uptrend, calm": "Alcista, tranquilo",
  "Uptrend, volatile": "Alcista, volátil",
  "Downtrend, calm": "Bajista, tranquilo",
  "Downtrend, volatile": "Bajista, volátil",
  "Annualized mean": "Media anualizada",
  // Verdicts and categories (lib/strategy-research.ts)
  "Meets the standard": "Cumple el estándar",
  "Passed every pre-declared criterion. Still research, not a promise of returns.":
    "Superó todos los criterios declarados de antemano. Sigue siendo investigación, no una promesa de rentabilidad.",
  Experimental: "Experimental",
  "Positive out of sample but failed at least one criterion: not established.":
    "Positiva fuera de muestra pero falló al menos un criterio: no demostrada.",
  Rejected: "Rechazada",
  "Did no better than cash after costs in the walk-forward test.":
    "No lo hizo mejor que el efectivo después de costes en la prueba walk-forward.",
  "Insufficient data": "Datos insuficientes",
  "Not enough history to apply the standard.":
    "No hay histórico suficiente para aplicar el estándar.",
  "The passive comparison; not judged.": "La comparación pasiva; no se juzga.",
  "The best configuration, chosen and measured on the same days. Optimistic by construction.":
    "La mejor configuración, elegida y medida en los mismos días. Optimista por construcción.",
  "Walk-forward (out of sample)": "Walk-forward (fuera de muestra)",
  "Each window traded by the configuration chosen on the years before it.":
    "Cada ventana operada por la configuración elegida en los años anteriores.",
  "The frozen in-sample choice on days no choice ever saw.":
    "La elección dentro de muestra, congelada, en días que ninguna elección vio.",
  "Paper (live)": "Simulada (en vivo)",
  "Signals recorded as they happened, replayed at the next open. No real orders.":
    "Señales registradas según ocurrieron, reproducidas en la siguiente apertura. Sin órdenes reales.",
  "Signals recorded by the monitor as they happened, executed at the next open":
    "Señales registradas por la vigilancia según ocurrieron, ejecutadas en la siguiente apertura",
  // Families
  trend: "tendencia",
  "mean-reversion": "reversión a la media",
  regime: "régimen",
  "cross-asset": "entre activos",
  carry: "carry",
  // Catalog (packages/core/src/research/catalog.ts)
  "BTC buy and hold": "BTC comprar y mantener",
  "BTC time-series momentum": "Momentum temporal de BTC",
  "BTC moving-average trend": "Tendencia de media móvil de BTC",
  "BTC trend with volatility targeting": "Tendencia de BTC con objetivo de volatilidad",
  "BTC short-term mean reversion": "Reversión a la media de corto plazo en BTC",
  "BTC/ETH relative strength": "Fuerza relativa BTC/ETH",
  "BTC funding carry (cash and carry)": "Carry de financiación de BTC (cash and carry)",
  "Always 100% BTC": "Siempre 100 % BTC",
  "The passive benchmark every candidate must be compared with, after the same costs.":
    "La referencia pasiva con la que se compara cada candidata, después de los mismos costes.",
  "Full exposure to bitcoin's drawdowns (over 75% in 2018 and 2022).":
    "Exposición total a las caídas de bitcoin (más del 75 % en 2018 y 2022).",
  "Bitcoin's past return over weeks to months predicts the sign of its next returns (time-series momentum), so being out after negative periods avoids part of the large drawdowns.":
    "La rentabilidad pasada de bitcoin a semanas o meses predice el signo de las siguientes (momentum temporal), así que estar fuera tras periodos negativos evita parte de las grandes caídas.",
  "Whipsaws in sideways markets and late exits after sharp reversals; the effect has weakened in some studies.":
    "Señales falsas en mercados laterales y salidas tardías tras giros bruscos; el efecto se ha debilitado en algunos estudios.",
  "Holding bitcoin only while it closes above a moving average keeps most of its uptrends and avoids part of its bear markets.":
    "Mantener bitcoin solo mientras cierra por encima de una media móvil conserva la mayoría de sus tendencias alcistas y evita parte de sus mercados bajistas.",
  "Same as momentum: whipsaws and lag; very sensitive to the window when samples are short.":
    "Igual que el momentum: señales falsas y retraso; muy sensible a la ventana cuando las muestras son cortas.",
  "Combining a trend filter (the regime) with position sizing by realized volatility lowers drawdowns and improves risk-adjusted returns, since volatility clusters and is partly predictable.":
    "Combinar un filtro de tendencia (el régimen) con un tamaño de posición según la volatilidad realizada reduce las caídas y mejora la rentabilidad ajustada al riesgo, porque la volatilidad se agrupa y es en parte predecible.",
  "Volatility targeting cuts exposure after shocks, missing sharp rebounds; adds turnover.":
    "El objetivo de volatilidad reduce la exposición tras los sustos y se pierde rebotes bruscos; añade rotación.",
  "Sharp short-term sell-offs in bitcoin partly reverse within days (overreaction and liquidity provision), at least while the long-term trend is up.":
    "Las caídas bruscas de corto plazo en bitcoin se revierten en parte en pocos días (sobrerreacción y provisión de liquidez), al menos mientras la tendencia de largo plazo es alcista.",
  "Buying falling markets: losses are large when a sell-off becomes a crash; short-horizon effects are easily eaten by costs.":
    "Comprar mercados que caen: las pérdidas son grandes cuando una caída se convierte en desplome; los efectos de corto plazo se los comen fácilmente los costes.",
  "Between bitcoin and ether, the one with the stronger recent return keeps outperforming for a while (cross-sectional momentum), and cash when both fall.":
    "Entre bitcoin y ether, el de mayor rentabilidad reciente sigue haciéndolo mejor durante un tiempo (momentum transversal), y efectivo cuando ambos caen.",
  "Only two assets: little diversification of the signal; relative moves between them reverse often.":
    "Solo dos activos: poca diversificación de la señal; sus movimientos relativos se invierten a menudo.",
  "Perpetual futures funding is positive most of the time because leveraged demand is mostly long; a delta-neutral long spot, short perpetual book collects it.":
    "La financiación de los futuros perpetuos es positiva la mayor parte del tiempo porque la demanda apalancada es sobre todo larga; una cartera delta neutral, larga en spot y corta en el perpetuo, la cobra.",
  "Funding can turn negative; exchange and liquidation risk on the short leg in a rally (2x leverage here); returns compress as more capital does the trade.":
    "La financiación puede volverse negativa; riesgo de exchange y de liquidación de la pata corta en una subida (aquí apalancamiento 2x); la rentabilidad se comprime a medida que más capital hace la operación.",
  // Criteria (packages/core/src/research/evaluate.ts)
  "Holdout return after costs above what cash earned over the same days":
    "Rentabilidad de reserva después de costes por encima de lo que ganó el efectivo en los mismos días",
  "Walk-forward Sharpe above 0, with the bootstrap's 95% interval above 0":
    "Sharpe walk-forward por encima de 0, con el intervalo bootstrap del 95 % por encima de 0",
  "Walk-forward Sharpe above the benchmark's over the same days":
    "Sharpe walk-forward por encima del de la referencia en los mismos días",
  "Walk-forward return above cash (its Sharpe ratio is measured against the cash rate)":
    "Rentabilidad walk-forward por encima del efectivo (su ratio de Sharpe se mide contra el tipo del efectivo)",
  "Probability of backtest overfitting at most 0.25":
    "Probabilidad de sobreajuste del backtest de como mucho 0,25",
  "At least 3 years before the holdout and 180 days of holdout":
    "Al menos 3 años antes de la reserva y 180 días de reserva",
};

export default es;
