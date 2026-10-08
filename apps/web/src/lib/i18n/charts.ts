/** Spanish for the charts area: English source text → Spanish. See lib/i18n.ts. */
const es: Record<string, string> = {
  // Charts page: opening a chart
  "Charts stream candles from a market data source you choose.":
    "Los gráficos reciben velas de la fuente de datos de mercado que elijas.",
  "Connect a provider or upload a candle CSV in Settings":
    "Conecta un proveedor o sube un CSV de velas en Ajustes",
  "Binance and Coinbase need no key; enable them there first.":
    "Binance y Coinbase no necesitan clave; actívalos allí primero.",
  Source: "Fuente",
  "Choose a source": "Elige una fuente",
  "Feed / file": "Feed / archivo",
  "Automatic matching file": "Archivo coincidente automático",
  "Opening…": "Abriendo…",
  Pause: "Pausa",
  "Go live": "Ver en directo",
  "Several charts at once, full screen": "Varios gráficos a la vez, a pantalla completa",
  Workspace: "Espacio de trabajo",
  Watchlist: "Lista de seguimiento",
  "{symbol} on {source}": "{symbol} en {source}",
  "Recent symbols": "Símbolos recientes",
  "Save and open": "Guardar y abrir",
  "Open anyway": "Abrir igualmente",
  "Remove {symbol} from the watchlist": "Quitar {symbol} de la lista de seguimiento",
  "Add {symbol} to the watchlist": "Añadir {symbol} a la lista de seguimiento",
  "Type a symbol and press Open. The chart loads the latest candles and keeps updating; your drawings save automatically.":
    "Escribe un símbolo y pulsa Abrir. El gráfico carga las últimas velas y se sigue actualizando; tus dibujos se guardan solos.",
  "Could not open the chart.": "No se pudo abrir el gráfico.",
  "This chart's latest changes could not be saved, so it stays open. Try again, or open the other chart anyway and lose them.":
    "No se pudieron guardar los últimos cambios de este gráfico, así que sigue abierto. Inténtalo de nuevo o abre el otro gráfico igualmente y piérdelos.",
  "Could not save chart settings.": "No se pudieron guardar los ajustes del gráfico.",
  "Chart settings could not be loaded ({error}), so changes to them are not saved. Reload the page to try again.":
    "No se pudieron cargar los ajustes del gráfico ({error}), así que sus cambios no se guardan. Recarga la página para intentarlo de nuevo.",
  // Market data sources: feeds and markets
  "Choose a data feed": "Elige una fuente de datos",
  "IEX stocks": "Acciones IEX",
  "SIP stocks": "Acciones SIP",
  "Crypto (US)": "Cripto (EE. UU.)",
  "Choose a market": "Elige un mercado",
  "Perpetuals and futures (USDT, USDC)": "Perpetuos y futuros (USDT, USDC)",
  Spot: "Spot",
  "Inverse (coin-margined)": "Inversos (con margen en moneda)",
  "Perpetual swaps": "Swaps perpetuos",
  "Choose stock or ETF": "Elige acción o ETF",
  Stock: "Acción",
  // Toolbar and status
  "Colours, chart type, formats, symbol and drawing defaults":
    "Colores, tipo de gráfico, formatos, símbolo y valores por defecto de los dibujos",
  Appearance: "Apariencia",
  "Log a setup you did not take: click the chart where you saw it":
    "Registra un setup que no tomaste: haz clic en el gráfico donde lo viste",
  "Missed trade": "Operación no tomada",
  "Add a support or resistance zone: click its two edges":
    "Añade una zona de soporte o resistencia: haz clic en sus dos bordes",
  Zone: "Zona",
  Layers: "Capas",
  "Click the chart where you saw the missed setup. Esc cancels.":
    "Haz clic en el gráfico donde viste el setup no tomado. Esc cancela.",
  "Now click the zone's other edge. Esc cancels.":
    "Ahora haz clic en el otro borde de la zona. Esc cancela.",
  "Click one edge of the support or resistance zone. Esc cancels.":
    "Haz clic en un borde de la zona de soporte o resistencia. Esc cancela.",
  "vs previous candle": "frente a la vela anterior",
  "No candles from this source for this symbol and candle size.":
    "Esta fuente no tiene velas para este símbolo y temporalidad.",
  "Loading candles…": "Cargando velas…",
  "Updated {time}": "Actualizado {time}",
  "feed|Data error": "Error de datos",
  "feed|No chart": "Sin gráfico",
  "feed|Loading": "Cargando",
  "feed|Paused": "En pausa",
  "feed|Real time": "Tiempo real",
  "feed|Live": "En directo",
  "Prices stream from the exchange as trades happen":
    "Los precios llegan del exchange a medida que se negocia",
  "New candles are fetched periodically": "Las velas nuevas se descargan periódicamente",
  "Not saved: {message}": "Sin guardar: {message}",
  "Saved {time}": "Guardado {time}",
  "Saves automatically": "Se guarda automáticamente",
  "Could not save.": "No se pudo guardar.",
  // A day's version
  "Your analysis as of {day}, over today's candles. Read-only: changes here are not saved.":
    "Tu análisis a fecha de {day}, sobre las velas de hoy. Solo lectura: aquí los cambios no se guardan.",
  "Back to the live analysis": "Volver al análisis actual",
  "Make this the live version": "Convertir en la versión actual",
  "Replace the live analysis with its {day} version? Today's version records the change; other days are kept.":
    "¿Reemplazar el análisis actual por su versión del {day}? La versión de hoy registra el cambio; los demás días se conservan.",
  "Could not restore that version.": "No se pudo restaurar esa versión.",
  "A day's version is read-only; open the live analysis.":
    "La versión de un día es de solo lectura; abre el análisis actual.",
  // Analysis card
  Analysis: "Análisis",
  "New {symbol} analysis": "Nuevo análisis de {symbol}",
  Title: "Título",
  "Opening range levels": "Niveles del rango de apertura",
  "Thesis, levels to watch, invalidation…": "Tesis, niveles a vigilar, invalidación…",
  "Add to journal": "Añadir al diario",
  "Journal day": "Día del diario",
  "Added to the {day} journal.": "Añadido al diario del {day}.",
  "Open journal day": "Abrir el día del diario",
  "Each day you work on this analysis keeps its own version in that day's journal, frozen when the day ends. Add saves the analysis as it is now as that day's version and puts it in the day note.":
    "Cada día que trabajas en este análisis guarda su propia versión en el diario de ese día, congelada cuando el día termina. Añadir guarda el análisis tal como está ahora como la versión de ese día y lo pone en la nota del día.",
  "Versions by day": "Versiones por día",
  "{day} (today, updating)": "{day} (hoy, actualizándose)",
  Journal: "Diario",
  "{count} drawing": "{count} dibujo",
  "{count} drawings": "{count} dibujos",
  "Delete this analysis": "Eliminar este análisis",
  'Delete "{name}" and its saved day versions? Journal notes keep a placeholder.':
    '¿Eliminar "{name}" y sus versiones guardadas por día? Las notas del diario conservan un marcador.',
  "Could not delete the analysis.": "No se pudo eliminar el análisis.",
  "Open a chart first.": "Abre primero un gráfico.",
  "Save the chart first: its latest changes are not saved.":
    "Guarda primero el gráfico: sus últimos cambios no están guardados.",
  "Could not add to the journal.": "No se pudo añadir al diario.",
  "All analyses": "Todos los análisis",
  "{count} saved": "{count} guardados",
  "Nothing saved yet. Draw on a chart and it saves itself.":
    "Aún no hay nada guardado. Dibuja en un gráfico y se guarda solo.",
  "No snapshot": "Sin captura",
  "Show fewer": "Mostrar menos",
  "Show all {count}": "Mostrar los {count}",
  // Plan
  Plan: "Plan",
  Bias: "Sesgo",
  Playbook: "Playbook",
  "No playbook": "Sin playbook",
  Neutral: "Neutral",
  Scenario: "Escenario",
  'Scenario {number}, e.g. "Breakout above the range"':
    'Escenario {number}, p. ej. "Ruptura por encima del rango"',
  "Scenario {number} name": "Nombre del escenario {number}",
  "Scenario {number} direction": "Dirección del escenario {number}",
  "Scenario {number} note": "Nota del escenario {number}",
  "Remove scenario {number}": "Quitar el escenario {number}",
  Trigger: "Activación",
  Target: "Objetivo",
  "Invalid at": "Invalidación en",
  "Scenario {number} trigger": "Activación del escenario {number}",
  "Scenario {number} target": "Objetivo del escenario {number}",
  "Scenario {number} invalid at": "Invalidación del escenario {number}",
  "Set scenario {number} trigger from the last selected line":
    "Poner la activación del escenario {number} desde la última línea seleccionada",
  "Set scenario {number} target from the last selected line":
    "Poner el objetivo del escenario {number} desde la última línea seleccionada",
  "Set scenario {number} invalid at from the last selected line":
    "Poner la invalidación del escenario {number} desde la última línea seleccionada",
  "Use the price of the horizontal line you last selected on the chart":
    "Usa el precio de la última línea horizontal que seleccionaste en el gráfico",
  "Condition or note, e.g. after a retest on 15m": "Condición o nota, p. ej. tras un retest en 15m",
  "Each journal day grades these: it suggests played out, invalidated or not triggered from the day's candles, and you confirm it there.":
    "Cada día del diario los evalúa: sugiere si se cumplieron, se invalidaron o no se activaron según las velas del día, y tú lo confirmas allí.",
  "For a long, the target sits above the trigger.":
    "En un largo, el objetivo va por encima de la activación.",
  "For a short, the target sits below the trigger.":
    "En un corto, el objetivo va por debajo de la activación.",
  "For a long, the invalidation sits below the trigger.":
    "En un largo, la invalidación va por debajo de la activación.",
  "For a short, the invalidation sits above the trigger.":
    "En un corto, la invalidación va por encima de la activación.",
  // Plan draft
  "No draft": "Sin borrador",
  "Save the analysis first": "Guarda primero el análisis",
  "Drafting…": "Redactando…",
  "Draft the day's plan": "Redactar el plan del día",
  "Plan draft": "Borrador del plan",
  "Draft for {day}. Add what you agree with.": "Borrador para el {day}. Añade lo que te convenza.",
  "Use it": "Usarlo",
  "No further scenarios.": "No hay más escenarios.",
  "A plan holds {count} scenarios": "Un plan admite {count} escenarios",
  "Trigger {trigger} · target {target} · invalid at {invalidation}":
    "Activación {trigger} · objetivo {target} · invalidación en {invalidation}",
  "Left out: {problems}.": "Descartado: {problems}.",
  none: "ninguno",
  // On the chart (overlays)
  "On the chart": "En el gráfico",
  "{list} shown": "Se muestra: {list}",
  "overlays|trades": "operaciones",
  "overlays|missed": "no tomadas",
  "overlays|zones": "zonas",
  "overlays|sessions": "sesiones",
  "overlays|calendar": "calendario",
  "overlays|nothing": "nada",
  "Open a chart to see your trades on it.": "Abre un gráfico para ver tus operaciones en él.",
  "Journal records": "Registros del diario",
  "My trades ({open} open, {closed} closed)":
    "Mis operaciones ({open} abiertas, {closed} cerradas)",
  "Closed trades": "Operaciones cerradas",
  "Off: only open positions": "Desactivado: solo posiciones abiertas",
  "Missed trades ({count})": "Operaciones no tomadas ({count})",
  "Violet diamonds": "Rombos violeta",
  "Support/resistance zones": "Zonas de soporte/resistencia",
  "Market sessions": "Sesiones de mercado",
  "Opens and closes, up to 1h candles": "Aperturas y cierres, con velas de hasta 1h",
  "Also show journal symbols": "Mostrar también símbolos del diario",
  "e.g. MES, ES": "p. ej. MES, ES",
  "Matching {symbols}.": "Coinciden {symbols}.",
  "No journal trades match this symbol yet.": "Aún no hay operaciones del diario con este símbolo.",
  "Click a marker to open its trade.": "Haz clic en una marca para abrir su operación.",
  // Economic calendar
  "Economic calendar": "Calendario económico",
  Show: "Mostrar",
  "Refresh the calendar": "Actualizar el calendario",
  "Show high-impact releases and bank holidays from the public ForexFactory weekly feed. Enabling it lets this server fetch the feed at most once an hour while a chart is open.":
    "Muestra los datos de alto impacto y los festivos bancarios del feed semanal público de ForexFactory. Al activarlo, este servidor descarga el feed como mucho una vez por hora mientras haya un gráfico abierto.",
  "Enable economic calendar": "Activar el calendario económico",
  Impact: "Impacto",
  Currencies: "Divisas",
  "Next 3 days": "Próximos 3 días",
  "No matching events.": "No hay eventos que coincidan.",
  "Not fetched yet": "Aún sin descargar",
  "ForexFactory feed": "feed de ForexFactory",
  Disable: "Desactivar",
  "Bank holiday": "Festivo bancario",
  "{impact} impact": "Impacto {impact}",
  "Forecast {value}": "Previsión {value}",
  "Previous {value}": "Anterior {value}",
  "impact|High": "Alto",
  "impact|Medium": "Medio",
  "impact|Low": "Bajo",
  "impact|Holiday": "Festivo",
  "Could not enable the economic calendar: {reason}":
    "No se pudo activar el calendario económico: {reason}",
  "Could not disable the economic calendar: {reason}":
    "No se pudo desactivar el calendario económico: {reason}",
  "Could not refresh the economic calendar: {reason}":
    "No se pudo actualizar el calendario económico: {reason}",
  "the request failed.": "la solicitud falló.",
  // Support and resistance
  "Support and resistance": "Soporte y resistencia",
  "{count} zone": "{count} zona",
  "{count} zones": "{count} zonas",
  "Add zone": "Añadir zona",
  "Click the zone's other edge.": "Haz clic en el otro borde de la zona.",
  "Click one edge of the zone on the chart.": "Haz clic en un borde de la zona en el gráfico.",
  "Mark a price range where price reacts. It extends to the present and tracks touches and breaks.":
    "Marca un rango de precios donde el precio reacciona. Se extiende hasta el presente y registra toques y rupturas.",
  "Zone label": "Etiqueta de la zona",
  "Show the zone on the chart": "Mostrar la zona en el gráfico",
  "Hide zone": "Ocultar zona",
  "Show zone": "Mostrar zona",
  "Delete zone": "Eliminar zona",
  Low: "Mínimo",
  High: "Máximo",
  "Zone low": "Mínimo de la zona",
  "Zone high": "Máximo de la zona",
  "The low must be under the high ({high}).":
    "El mínimo debe estar por debajo del máximo ({high}).",
  "The high must be above the low ({low}).": "El máximo debe estar por encima del mínimo ({low}).",
  "Enter a price, like 101.5.": "Escribe un precio, como 101.5.",
  "Zone kind": "Tipo de zona",
  Auto: "Auto",
  Support: "Soporte",
  Resistance: "Resistencia",
  "Support {low}–{high} · {touches} · holding": "Soporte {low}–{high} · {touches} · aguanta",
  "Support {low}–{high} · {touches} · testing": "Soporte {low}–{high} · {touches} · en prueba",
  "Support {low}–{high} · {touches} · broken": "Soporte {low}–{high} · {touches} · roto",
  "Resistance {low}–{high} · {touches} · holding": "Resistencia {low}–{high} · {touches} · aguanta",
  "Resistance {low}–{high} · {touches} · testing":
    "Resistencia {low}–{high} · {touches} · en prueba",
  "Resistance {low}–{high} · {touches} · broken": "Resistencia {low}–{high} · {touches} · rota",
  "{count} touch": "{count} toque",
  "{count} touches": "{count} toques",
  "{count} break": "{count} ruptura",
  "{count} breaks": "{count} rupturas",
  // Levels from a screenshot
  "Could not read the picture.": "No se pudo leer la imagen.",
  "That file is not a picture the browser can open.":
    "Ese archivo no es una imagen que el navegador pueda abrir.",
  "Could not read levels": "No se pudieron leer los niveles",
  "Levels from a screenshot": "Niveles desde una captura",
  "Reading…": "Leyendo…",
  "Read the levels": "Leer los niveles",
  "Choose or paste a chart picture; it is sent to your AI provider to read its levels.":
    "Elige o pega una imagen de un gráfico; se envía a tu proveedor de IA para leer sus niveles.",
  "Screenshot to read": "Captura para leer",
  "Levels read": "Niveles leídos",
  "The picture shows {shown}, not {symbol}: check the prices fit this chart.":
    "La imagen muestra {shown}, no {symbol}: comprueba que los precios encajan con este gráfico.",
  "No horizontal levels found in the picture.":
    "No se encontraron niveles horizontales en la imagen.",
  "{low} to {high}": "{low} a {high}",
  "level|zone": "zona",
  "level|line": "línea",
  "high confidence": "confianza alta",
  "medium confidence": "confianza media",
  "low confidence": "confianza baja",
  "Add {count} to the chart": "Añadir {count} al gráfico",
  // Indicators
  Indicators: "Indicadores",
  "{count} on the chart": "{count} en el gráfico",
  "Add indicator": "Añadir indicador",
  "My indicators": "Mis indicadores",
  "None saved yet.": "Aún no hay ninguno guardado.",
  "New Pine indicator…": "Nuevo indicador Pine…",
  New: "Nuevo",
  "No indicators yet. Add a built-in one or write your own in Pine Script.":
    "Aún no hay indicadores. Añade uno integrado o escribe el tuyo en Pine Script.",
  "Hide {name}": "Ocultar {name}",
  "Show {name}": "Mostrar {name}",
  "{name} settings": "Ajustes de {name}",
  "Edit {name} code": "Editar el código de {name}",
  "Remove {name}": "Quitar {name}",
  "My indicators ({count})": "Mis indicadores ({count})",
  "Add {name} to the chart": "Añadir {name} al gráfico",
  "Edit {name}": "Editar {name}",
  "Indicators run on PineTS (AGPL-3.0). Settings on the chart legend or the gear edit their inputs; they save with this analysis.":
    "Los indicadores funcionan con PineTS (AGPL-3.0). Los ajustes en la leyenda del gráfico o el engranaje editan sus parámetros; se guardan con este análisis.",
  "Could not save the indicator.": "No se pudo guardar el indicador.",
  // Built-in indicators
  Trend: "Tendencia",
  Momentum: "Momentum",
  Volatility: "Volatilidad",
  Volume: "Volumen",
  Signals: "Señales",
  "Simple moving average": "Media móvil simple",
  "Average close over a lookback, drawn on price.":
    "Cierre medio de un periodo, dibujado sobre el precio.",
  "Exponential moving average": "Media móvil exponencial",
  "Moving average weighted toward recent candles.":
    "Media móvil que da más peso a las velas recientes.",
  "EMA ribbon (9 / 21 / 50 / 200)": "Cinta de EMA (9 / 21 / 50 / 200)",
  "Four EMAs to read trend alignment at a glance.":
    "Cuatro EMA para ver de un vistazo si la tendencia está alineada.",
  "Volume-weighted average price with deviation bands, resetting each session, week, month, quarter or year (TradingView's VWAP).":
    "Precio medio ponderado por volumen con bandas de desviación, que se reinicia cada sesión, semana, mes, trimestre o año (el VWAP de TradingView).",
  "Moving average with bands at a number of standard deviations.":
    "Media móvil con bandas a un número de desviaciones típicas.",
  "Donchian channel": "Canal de Donchian",
  "Highest high and lowest low over a lookback.":
    "Máximo más alto y mínimo más bajo de un periodo.",
  "ATR trailing line that flips with the trend.":
    "Línea de seguimiento por ATR que gira con la tendencia.",
  "Average true range": "Rango verdadero medio (ATR)",
  "Average candle range including gaps; sizes stops.":
    "Rango medio de las velas, gaps incluidos; sirve para dimensionar stops.",
  "Relative strength index": "Índice de fuerza relativa (RSI)",
  "Momentum oscillator from 0 to 100 with 70/30 levels.":
    "Oscilador de momentum de 0 a 100 con niveles 70/30.",
  "Difference of two EMAs, its signal line and histogram.":
    "Diferencia de dos EMA, su línea de señal e histograma.",
  Stochastic: "Estocástico",
  "Close relative to its recent range, smoothed.":
    "Cierre respecto a su rango reciente, suavizado.",
  "Trend strength with the directional movement lines.":
    "Fuerza de la tendencia con las líneas de movimiento direccional.",
  "On-balance volume": "Volumen en balance (OBV)",
  "Running volume total, added on up closes and subtracted on down closes.":
    "Volumen acumulado que suma en cierres al alza y resta en cierres a la baja.",
  "Weighted moving average": "Media móvil ponderada",
  "Linear-weighted average; newer candles count more.":
    "Media con ponderación lineal; las velas más nuevas cuentan más.",
  "Hull moving average": "Media móvil de Hull",
  "Fast, smooth average with little lag; colour shows its slope.":
    "Media rápida y suave con poco retraso; el color muestra su pendiente.",
  "Volume-weighted moving average": "Media móvil ponderada por volumen",
  "Average close weighted by each candle's volume.":
    "Cierre medio ponderado por el volumen de cada vela.",
  "Arnaud Legoux moving average": "Media móvil de Arnaud Legoux",
  "Gaussian-weighted average that balances smoothness and lag.":
    "Media con ponderación gaussiana que equilibra suavidad y retraso.",
  "Moving averages 50 / 200": "Medias móviles 50 / 200",
  "The classic 50 and 200 period SMAs for the long-term trend.":
    "Las clásicas SMA de 50 y 200 periodos para la tendencia de largo plazo.",
  "Parabolic SAR": "SAR parabólico",
  "Trailing dots that flip sides when the trend reverses.":
    "Puntos de seguimiento que cambian de lado cuando la tendencia se gira.",
  "Ichimoku cloud": "Nube de Ichimoku",
  "Conversion and base lines with the cloud under the current candles.":
    "Líneas de conversión y base con la nube bajo las velas actuales.",
  "Linear regression channel": "Canal de regresión lineal",
  "Least-squares trend line with bands two deviations of the closes from the line away.":
    "Línea de tendencia por mínimos cuadrados con bandas a dos desviaciones de los cierres respecto a la línea.",
  "How recently the highest high and lowest low happened, from 0 to 100.":
    "Hace cuánto se produjeron el máximo más alto y el mínimo más bajo, de 0 a 100.",
  "Keltner channel": "Canal de Keltner",
  "EMA with bands a multiple of the average range away.":
    "EMA con bandas a un múltiplo del rango medio.",
  "Bollinger bandwidth": "Ancho de las Bandas de Bollinger",
  "Width of the Bollinger Bands; low values flag a squeeze.":
    "Ancho de las Bandas de Bollinger; los valores bajos señalan una compresión.",
  "Standard deviation": "Desviación estándar",
  "How far closes spread around their average.":
    "Cuánto se dispersan los cierres en torno a su media.",
  "Historical volatility": "Volatilidad histórica",
  "Annualised deviation of log returns, in percent (TradingView's HV).":
    "Desviación anualizada de los rendimientos logarítmicos, en porcentaje (el HV de TradingView).",
  "Chandelier exit": "Chandelier exit",
  "ATR trailing stops from the recent high and low.":
    "Stops de seguimiento por ATR desde el máximo y el mínimo recientes.",
  "Stochastic RSI": "RSI estocástico",
  "Stochastic applied to RSI; faster turns at the extremes.":
    "Estocástico aplicado al RSI; giros más rápidos en los extremos.",
  "Commodity channel index": "Índice de canal de materias primas (CCI)",
  "Distance from the average typical price, with ±100 levels.":
    "Distancia al precio típico medio, con niveles de ±100.",
  "Close within the recent range, from 0 to -100.":
    "Cierre dentro del rango reciente, de 0 a -100.",
  "Close minus the close a number of candles ago.":
    "Cierre menos el cierre de un número de velas atrás.",
  "Rate of change": "Tasa de cambio",
  "Percent change over a number of candles.": "Variación porcentual en un número de velas.",
  "True strength index": "Índice de fuerza verdadera (TSI)",
  "Double-smoothed momentum with a signal line.":
    "Momentum doblemente suavizado con línea de señal.",
  "Chande momentum oscillator": "Oscilador de momentum de Chande",
  "Up moves minus down moves over their sum, from -100 to 100.":
    "Movimientos al alza menos a la baja entre su suma, de -100 a 100.",
  "Awesome oscillator": "Awesome oscillator",
  "5 minus 34 period average of the candle midpoint, as columns.":
    "Media de 5 menos la de 34 periodos del punto medio de la vela, en columnas.",
  "Volume with average": "Volumen con media",
  "Volume columns by candle direction and their moving average.":
    "Columnas de volumen según la dirección de la vela y su media móvil.",
  "Money flow index": "Índice de flujo de dinero (MFI)",
  "Volume-weighted RSI from 0 to 100 with 80/20 levels.":
    "RSI ponderado por volumen de 0 a 100 con niveles 80/20.",
  "Chaikin money flow": "Flujo de dinero de Chaikin",
  "Buying or selling pressure: where closes sit in the range, times volume.":
    "Presión compradora o vendedora: dónde cierran las velas en su rango, por el volumen.",
  "Accumulation / distribution": "Acumulación / distribución",
  "Running total of volume weighted by where each close sits in its range.":
    "Volumen acumulado ponderado por dónde cierra cada vela en su rango.",
  "Price-volume trend": "Tendencia precio-volumen",
  "Running total of volume times the percent change.":
    "Acumulado del volumen por la variación porcentual.",
  "EMA cross signals": "Señales de cruce de EMA",
  "Marks and alerts when a fast EMA crosses a slow one.":
    "Marca y avisa cuando una EMA rápida cruza una lenta.",
  "RSI extremes": "Extremos del RSI",
  "Highlights candles where RSI leaves its overbought or oversold zone.":
    "Resalta las velas en las que el RSI sale de su zona de sobrecompra o sobreventa.",
  "Golden and death cross": "Cruce dorado y cruce de la muerte",
  "Marks and alerts when the 50 SMA crosses the 200 SMA.":
    "Marca y avisa cuando la SMA de 50 cruza la SMA de 200.",
  "MACD cross signals": "Señales de cruce del MACD",
  "Marks and alerts when MACD crosses its signal line.":
    "Marca y avisa cuando el MACD cruza su línea de señal.",
  "Bollinger breakouts": "Rupturas de Bollinger",
  "Marks and alerts when a close breaks outside the bands.":
    "Marca y avisa cuando un cierre rompe fuera de las bandas.",
  "Supertrend flips": "Cambios del Supertrend",
  "Marks and alerts when the Supertrend changes direction.":
    "Marca y avisa cuando el Supertrend cambia de dirección.",
  "Swing highs and lows": "Máximos y mínimos de swing",
  "Marks a swing high or low once enough candles on its right confirm it.":
    "Marca un máximo o mínimo de swing cuando suficientes velas a su derecha lo confirman.",
  // Alerts on the open chart
  "{count} recent": "{count} recientes",
  "While this page is open and live, get an alert when the price crosses a visible horizontal line, ray or trend line, enters or breaks a support/resistance zone, or when an indicator calls {code}{only}.":
    "Mientras esta página esté abierta y en directo, recibe una alerta cuando el precio cruce una línea horizontal, un rayo o una línea de tendencia visibles, entre en una zona de soporte/resistencia o la rompa, o cuando un indicador llame a {code}{only}.",
  " (only {kinds}, as chosen on the Alerts page)":
    " (solo {kinds}, según lo elegido en la página de Alertas)",
  "alert kinds|lines": "líneas",
  "alert kinds|zones": "zonas",
  "alert kinds|indicators": "indicadores",
  "alert kinds|none": "ninguna",
  "No alerts yet.": "Todavía no hay alertas.",
  "Show the line on the chart": "Mostrar la línea en el gráfico",
  Above: "Por encima",
  Below: "Por debajo",
  "Indicator alert": "Alerta de indicador",
  "Draw something first, so there is an analysis to watch.":
    "Dibuja algo primero para que haya un análisis que vigilar.",
  "Keep watching when this page is closed": "Seguir vigilando con esta página cerrada",
  "The server checks this analysis's lines and zones and notifies you. Indicator alerts only run while the chart is open.":
    "El servidor revisa las líneas y zonas de este análisis y te avisa. Las alertas de indicadores solo funcionan con el gráfico abierto.",
  "Browsers, webhook, which alerts you receive, quiet hours and every chart watched:":
    "Navegadores, webhook, qué alertas recibes, horas de silencio y todos los gráficos vigilados:",
  "Sent by the server": "Enviadas por el servidor",
  "not sent (see Alerts)": "no enviada (ver Alertas)",
  // Symbol field and candle sizes
  "Search: BTC": "Buscar: BTC",
  "Candle size": "Temporalidad",
  "Choose candle sizes": "Elegir temporalidades",
  "Show on the bar": "Mostrar en la barra",
  // Messages from the server (analyses, chart scripts, preferences, market data)
  "Chart analysis not found": "No se encontró el análisis del gráfico",
  "Chart snapshot not found": "No se encontró la captura del gráfico",
  "No snapshot of this analysis for that day": "No hay captura de este análisis para ese día",
  "That day has no version of this analysis.": "Ese día no tiene versión de este análisis.",
  "Choose a candle resolution.": "Elige una temporalidad.",
  "Choose a supported candle resolution.": "Elige una temporalidad admitida.",
  "Choose a chart symbol.": "Elige un símbolo para el gráfico.",
  "Choose a CSV file.": "Elige un archivo CSV.",
  "Choose a dataset.": "Elige un conjunto de datos.",
  "Choose a journal day to add this analysis to.":
    "Elige un día del diario al que añadir este análisis.",
  "Choose a journal day first.": "Elige primero un día del diario.",
  "Choose a valid journal day.": "Elige un día del diario válido.",
  "Choose a market data provider.": "Elige un proveedor de datos de mercado.",
  "Choose an outcome.": "Elige un resultado.",
  "Choose a range of at most three years.": "Elige un rango de tres años como máximo.",
  "Choose a start date in the past.": "Elige una fecha de inicio en el pasado.",
  "Choose the end of the history window.": "Elige el final de la ventana del histórico.",
  "Choose a trade.": "Elige una operación.",
  "That trade does not exist.": "Esa operación no existe.",
  "Say whether the trade is linked.": "Indica si la operación está vinculada.",
  "That scenario is not in the day's plan.": "Ese escenario no está en el plan del día.",
  "Invalid grade.": "Evaluación no válida.",
  "Indicator not found": "Indicador no encontrado",
  "Invalid candle CSV.": "CSV de velas no válido.",
  "Invalid CSV request.": "Solicitud CSV no válida.",
  "Provide a market CSV request.": "Envía una solicitud de CSV de mercado.",
  "Use a CSV smaller than 5 MB.": "Usa un CSV de menos de 5 MB.",
  "Search for a shorter symbol.": "Busca un símbolo más corto.",
  "This source does not use API keys.": "Esta fuente no usa claves de API.",
  "Invalid analysis.": "Análisis no válido.",
  "Notes are too long.": "Las notas son demasiado largas.",
  "Titles are 200 characters or fewer.": "Los títulos tienen 200 caracteres como máximo.",
  "Chart snapshots must be PNG images of 4 MB or less.":
    "Las capturas del gráfico deben ser imágenes PNG de 4 MB o menos.",
  "Keep at most 1000 drawings per chart.": "Mantén como máximo 1000 dibujos por gráfico.",
  "Drawings are too large to save. Remove some long strokes and try again.":
    "Los dibujos son demasiado grandes para guardarlos. Quita algunos trazos largos e inténtalo de nuevo.",
  "A zone needs a low below its high.": "Una zona necesita un mínimo por debajo de su máximo.",
  "Write the indicator's code.": "Escribe el código del indicador.",
  "The code is longer than 200 KB.": "El código ocupa más de 200 KB.",
  "The chart's indicators are too large to save.":
    "Los indicadores del gráfico son demasiado grandes para guardarlos.",
  // Watchlist (components/watchlist-panel.tsx, api/market-data/quotes)
  "Add a symbol": "Añadir un símbolo",
  "The watchlist holds at most {max} symbols.":
    "La lista de seguimiento admite como máximo {max} símbolos.",
  "Hide the watchlist": "Ocultar la lista de seguimiento",
  "Show or hide the watchlist": "Mostrar u ocultar la lista de seguimiento",
  "Star a symbol on its chart, or add one with +, to watch its price here.":
    "Marca un símbolo con la estrella en su gráfico, o añádelo con +, para seguir aquí su precio.",
  Last: "Último",
  Chg: "Var.",
  "Chg%": "Var.%",
  "No price": "Sin precio",
  "Prices show for the first {max} symbols.":
    "Los precios se muestran para los primeros {max} símbolos.",
  "Candle files have no live price.": "Los archivos de velas no tienen precio en directo.",
  "No price for this symbol.": "No hay precio para este símbolo.",
  "The price could not be read.": "No se pudo leer el precio.",
  "Cancelled.": "Cancelado.",
  "Send at most 40 symbols.": "Envía como máximo 40 símbolos.",
};

export default es;
