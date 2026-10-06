/** Spanish for the trades area: English source text → Spanish. See lib/i18n.ts. */
const es: Record<string, string> = {
  // Trades list
  "Select all matching trades": "Seleccionar todas las operaciones que coinciden",
  "Select trade": "Seleccionar operación",
  "Close date": "Fecha de cierre",
  long: "largo",
  short: "corto",
  Status: "Estado",
  Volume: "Volumen",
  Entry: "Entrada",
  Exit: "Salida",
  "Net P&L": "P&L neto",
  "Net ROI": "ROI neto",
  Fees: "Comisiones",
  Duration: "Duración",
  Execs: "Ejec.",
  Rating: "Valoración",
  Reviewed: "Revisada",
  "The action failed.": "La acción falló.",
  Columns: "Columnas",
  "Net cumulative P&L": "P&L neto acumulado",
  "Profit factor": "Factor de beneficio",
  "Trade win %": "% de operaciones ganadoras",
  "Avg win / loss": "Ganancia / pérdida media",
  "{count} selected": "{count} seleccionadas",
  "Mark reviewed": "Marcar como revisadas",
  Unreview: "Quitar revisión",
  "Tag to add": "Etiqueta que añadir",
  tag: "etiqueta",
  "action|Tag": "Etiquetar",
  "No trades match these filters.": "Ninguna operación coincide con estos filtros.",
  "Import some": "Importa algunas",
  "{from}–{to} of {total} trades": "{from}–{to} de {total} operaciones",
  "Page {page} of {pages}": "Página {page} de {pages}",
  "{count} trade": "{count} operación",
  "{count} trades": "{count} operaciones",
  "Delete {count} trade and its executions? This cannot be undone.":
    "¿Eliminar {count} operación y sus ejecuciones? No se puede deshacer.",
  "Delete {count} trades and their executions? This cannot be undone.":
    "¿Eliminar {count} operaciones y sus ejecuciones? No se puede deshacer.",

  // Trade page
  "Not saved: {reason}": "No guardado: {reason}",
  "Save failed": "No se pudo guardar",
  "Connection failed": "Falló la conexión",
  "AI critique failed": "La crítica de la IA falló",
  Gross: "Bruto",
  "Avg entry": "Entrada media",
  "Avg exit": "Salida media",
  "Net / entry notional": "Neto / nocional de entrada",
  "Planned R": "R planificado",
  "Realized R": "R realizado",
  "Running P&L": "P&L acumulado",
  "Times in {timeZone}": "Horas en {timeZone}",
  Executions: "Ejecuciones",
  "Correct a wrong price, quantity, side, fee, time or symbol, or add or remove a fill":
    "Corrige un precio, cantidad, lado, comisión, hora o símbolo incorrectos, o añade o quita una ejecución",
  "Edit fills": "Editar ejecuciones",
  Time: "Hora",
  Side: "Lado",
  Quantity: "Cantidad",
  Price: "Precio",
  Fee: "Comisión",
  "AI review": "Revisión con IA",
  "Thinking…": "Pensando…",
  "Critique this trade": "Critica esta operación",
  "Find similar past trades": "Buscar operaciones pasadas parecidas",
  "Ask about the critique": "Pregunta sobre la crítica",
  "Ask about this trade": "Pregunta sobre esta operación",
  "Chats about this trade can look up its fills, candles and your other trades in its account.":
    "Los chats sobre esta operación pueden consultar sus ejecuciones, sus velas y tus otras operaciones de su cuenta.",
  "Journal this trade": "Anota esta operación",
  "Rate {count} star": "Valorar con {count} estrella",
  "Rate {count} stars": "Valorar con {count} estrellas",
  "Stop loss": "Stop loss",
  "planned stop": "stop planificado",
  "Profit target": "Objetivo",
  "planned target": "objetivo planificado",
  Playbook: "Playbook",
  "No playbook": "Sin playbook",
  "Tags (comma-separated)": "Etiquetas (separadas por comas)",
  "breakout, A+ setup": "ruptura, setup A+",
  Mistakes: "Errores",
  "chased entry, moved stop": "entrada perseguida, stop movido",
  "Save now": "Guardar ahora",
  "Enter a number with a dot for decimals, like 101.5.":
    "Escribe un número con punto para los decimales, como 101.5.",
  "{symbol} · {direction} review": "Revisión de {symbol} · {direction}",
  "Status: {status} | Quantity: {quantity}": "Estado: {status} | Cantidad: {quantity}",
  "Entry: {entry} | Exit: {exit}": "Entrada: {entry} | Salida: {exit}",
  "Net P&L: {net} | Fees: {fees}": "P&L neto: {net} | Comisiones: {fees}",
  "Stop: {stop} | Target: {target}": "Stop: {stop} | Objetivo: {target}",
  "Tags: {tags} | Mistakes: {mistakes}": "Etiquetas: {tags} | Errores: {mistakes}",
  Unspecified: "Sin indicar",

  // Missed trades
  "Log opportunity": "Registrar oportunidad",
  "Record setups you watched but did not take. These observations never enter your trade count, P&L, or win rate.":
    "Registra los setups que viste pero no tomaste. Estas observaciones nunca cuentan en tu número de operaciones, tu P&L ni tu porcentaje de acierto.",
  "Search missed trades": "Buscar operaciones no tomadas",
  "Search symbol or notes": "Buscar símbolo o notas",
  "Show archived": "Mostrar archivadas",
  Restore: "Restaurar",
  Archive: "Archivar",
  "No strategy": "Sin estrategia",
  "No review yet.": "Aún sin revisión.",
  "Missed opportunity · {symbol}": "Oportunidad no tomada · {symbol}",
  "Observation only: no executed trade or actual P&L.":
    "Solo observación: sin operación ejecutada ni P&L real.",
  "Planned entry: {entry} | Stop: {stop} | Target: {target}":
    "Entrada planificada: {entry} | Stop: {stop} | Objetivo: {target}",
  "No archived opportunities here yet.": "Aún no hay oportunidades archivadas.",
  "No opportunities here yet.": "Aún no hay oportunidades.",
  "Edit opportunity": "Editar oportunidad",
  "Log a missed opportunity": "Registrar una oportunidad no tomada",
  Direction: "Dirección",
  Strategy: "Estrategia",
  "Observed at (device time)": "Observada a las (hora del dispositivo)",
  "Planned entry": "Entrada planificada",
  "Planned stop": "Stop planificado",
  "Planned target": "Objetivo planificado",
  "Why did you miss it? What will you do differently?":
    "¿Por qué la dejaste pasar? ¿Qué harás distinto?",
  "Could not save.": "No se pudo guardar.",
  "Save opportunity": "Guardar oportunidad",
  "chart level|Stop": "Stop",
  Target: "Objetivo",

  // Missed trade dialog (charts)
  "Prices must be numbers.": "Los precios deben ser números.",
  "Could not save the missed trade.": "No se pudo guardar la operación no tomada.",
  "Missed trade": "Operación no tomada",
  "{symbol} at {time} · {price}. Kept out of your trading stats.":
    "{symbol} el {time} · {price}. Queda fuera de tus estadísticas.",
  "Why you passed": "Por qué la dejaste pasar",
  "Save missed trade": "Guardar operación no tomada",
  optional: "opcional",

  // Market data & replay
  "{first} or {second}": "{first} o {second}",
  "History request failed.": "Falló la solicitud del histórico.",
  "{symbol} {resolution} candles from {provider}, as loaded for this trade before. Change the source below if it is not the right one.":
    "Velas de {symbol} en {resolution} de {provider}, como se cargaron antes para esta operación. Cambia la fuente abajo si no es la correcta.",
  "{symbol} {resolution} candles from {provider}, the source of your chart of this symbol. Change the source below if it is not the right one.":
    "Velas de {symbol} en {resolution} de {provider}, la fuente de tu gráfico de este símbolo. Cambia la fuente abajo si no es la correcta.",
  "{symbol} {resolution} candles from {provider}, chosen for this symbol. Change the source below if it is not the right one.":
    "Velas de {symbol} en {resolution} de {provider}, elegidas para este símbolo. Cambia la fuente abajo si no es la correcta.",
  "Market data & replay": "Datos de mercado y repetición",
  "The market around this trade, its replay, and how far price went against you (MAE) and in your favour (MFE) while it was open.":
    "El mercado alrededor de esta operación, su repetición y cuánto fue el precio en tu contra (MAE) y a tu favor (MFE) mientras estuvo abierta.",
  "Connect a market data provider in Settings":
    "Conecta un proveedor de datos de mercado en Ajustes",
  "to see this trade's candles, replay it and estimate MAE/MFE. Binance, Bybit and Coinbase need no key.":
    "para ver las velas de esta operación, repetirla y estimar el MAE/MFE. Binance, Bybit y Coinbase no necesitan clave.",
  "Open trade: candles up to now. Estimates are available once it closes.":
    "Operación abierta: velas hasta ahora. Las estimaciones estarán disponibles cuando se cierre.",
  "Data provider": "Proveedor de datos",
  "Choose a data source": "Elige una fuente de datos",
  "Provider symbol": "Símbolo del proveedor",
  "Candle resolution": "Temporalidad de las velas",
  "Data feed / dataset": "Feed de datos / conjunto de datos",
  "Automatic matching file": "Archivo coincidente automático",
  "Leave blank for automatic selection": "Déjalo en blanco para la selección automática",
  "Option contract history is not supported yet.":
    "El histórico de contratos de opciones aún no es compatible.",
  "Save the MAE/MFE estimate for Reports. I confirm that this instrument, price adjustments and quote currency match my fills and account ({currency}).":
    "Guardar la estimación de MAE/MFE para Informes. Confirmo que este instrumento, los ajustes de precio y la divisa de cotización coinciden con mis ejecuciones y mi cuenta ({currency}).",
  "MAE and MFE are worked out whenever candles load. Checked: they are also saved for Reports. Missing or mismatched data stays unavailable.":
    "El MAE y el MFE se calculan siempre que se cargan velas. Si está marcado, también se guardan para Informes. Los datos que faltan o no coinciden siguen sin estar disponibles.",
  "Loading history…": "Cargando histórico…",
  "Load candles & save estimates": "Cargar velas y guardar estimaciones",
  "Load candles & replay": "Cargar velas y repetir",
  "Show fills only": "Mostrar solo ejecuciones",
  "Show candles": "Mostrar velas",
  "Previously saved MAE/MFE estimates are shown below. Loading candles without the checkbox keeps those saved estimates; it does not calculate new ones.":
    "Abajo se muestran las estimaciones de MAE/MFE guardadas antes. Cargar velas sin marcar la casilla mantiene esas estimaciones guardadas; no calcula otras nuevas.",
  "Market data feature status": "Estado de las funciones de datos de mercado",
  "Estimated MAE": "MAE estimado",
  "Estimated MFE": "MFE estimado",
  "Trade replay": "Repetición de la operación",
  "Loading candles…": "Cargando velas…",
  "Data request failed": "Falló la solicitud de datos",
  "Load market data to calculate": "Carga datos de mercado para calcularlo",
  "Loaded: show candles to replay": "Cargado: muestra las velas para repetir",
  "Available after candles load": "Disponible cuando se carguen las velas",
  "No candles were returned for this instrument and trade period. Check the symbol, dataset and plan coverage.":
    "No llegaron velas para este instrumento y periodo de la operación. Revisa el símbolo, el conjunto de datos y la cobertura de tu plan.",
  "{move} in price ({percent})": "{move} de precio ({percent})",
  "Saved for Reports": "Guardado para Informes",
  "Not saved for Reports": "No guardado para Informes",
  "No money amount: see the limits below": "Sin importe: mira los límites abajo",
  Unavailable: "No disponible",
  "Historical candles": "Velas históricas",
  "{count} candle": "{count} vela",
  "{count} candles": "{count} velas",
  "Retrieved {time}": "Obtenidas el {time}",
  "Historical prices and excursion amounts are hidden in privacy mode.":
    "Los precios históricos y los importes de excursión se ocultan en modo privado.",
  "The market candles and recorded fill prices do not match. Replay shows market prices; fill labels and MAE/MFE estimates are withheld. See the data limits below.":
    "Las velas del mercado y los precios de las ejecuciones registradas no coinciden. La repetición muestra precios de mercado; las etiquetas de las ejecuciones y las estimaciones de MAE/MFE se ocultan. Mira los límites de los datos abajo.",
  Restart: "Reiniciar",
  Pause: "Pausa",
  Play: "Reproducir",
  "Next candle": "Siguiente vela",
  "Show all": "Mostrar todo",
  "Replay speed": "Velocidad de repetición",
  "Replay position": "Posición de la repetición",
  "{count} / {total} candles · Through {time} (UTC). While playing, each candle is drawn forming from open to close (through its low then high, or high then low for a down candle); the real order inside a candle is not known, so this is not a tick-by-tick simulation.":
    "{count} / {total} velas · Hasta {time} (UTC). Durante la reproducción, cada vela se dibuja formándose de la apertura al cierre (pasando por su mínimo y luego su máximo, o por su máximo y luego su mínimo en una vela bajista); el orden real dentro de una vela no se conoce, así que no es una simulación tick a tick.",
  "Estimated MAE · adverse": "MAE estimado · en contra",
  "Estimated MFE · favorable": "MFE estimado · a favor",
  "Hidden during replay": "Oculto durante la repetición",
  "Data coverage & estimate limits": "Cobertura de datos y límites de la estimación",
  "Recorded fills": "Ejecuciones registradas",
  "The replay chart could not be updated.": "No se pudo actualizar el gráfico de la repetición.",
  "The historical chart could not be rendered.": "No se pudo dibujar el gráfico histórico.",
  // Market data reasons and warnings from the server
  "Choose a data provider and the provider's symbol for this instrument.":
    "Elige un proveedor de datos y el símbolo del proveedor para este instrumento.",
  "Enable Binance, Bybit or Coinbase in Settings → Market data to see this trade's candles here.":
    "Activa Binance, Bybit o Coinbase en Ajustes → Datos de mercado para ver aquí las velas de esta operación.",
  "Enable {sources} in Settings → Market data to see this trade's candles here.":
    "Activa {sources} en Ajustes → Datos de mercado para ver aquí las velas de esta operación.",
  "No enabled source lists {symbol} with candles this far back. Choose a data provider and its symbol below.":
    "Ninguna fuente activada tiene {symbol} con velas tan antiguas. Elige abajo un proveedor de datos y su símbolo.",
  "No enabled exchange lists {symbol}. Choose a data provider and its symbol below.":
    "Ningún exchange activado tiene {symbol}. Elige abajo un proveedor de datos y su símbolo.",
  "{count} candles straddle a fill or trade boundary and were excluded; excursions may be understated.":
    "{count} velas cruzan una ejecución o el límite de la operación y se excluyeron; las excursiones pueden quedarse cortas.",
  "{resolution} candles are built from {base} candles, aligned to UTC.":
    "Las velas de {resolution} se construyen a partir de velas de {base}, alineadas a UTC.",
  "{resolution} candles are built from {base} candles, aligned to UTC weeks from Monday.":
    "Las velas de {resolution} se construyen a partir de velas de {base}, alineadas a semanas UTC que empiezan el lunes.",
  "The candles are quoted in {quote}, counted as the account's USD; stablecoins can drift slightly from the dollar.":
    "Las velas cotizan en {quote}, que cuenta como el USD de la cuenta; las stablecoins pueden desviarse un poco del dólar.",
  "The candle quote currency ({quote}) differs from this account ({currency}). Monetary estimates are unavailable; no FX conversion is applied.":
    "La divisa de cotización de las velas ({quote}) es distinta de la de esta cuenta ({currency}). Las estimaciones monetarias no están disponibles; no se aplica conversión de divisas.",
  "This trade is booked as another asset class; exchange prices can differ from your broker's.":
    "Esta operación está registrada como otra clase de activo; los precios del exchange pueden diferir de los de tu bróker.",
  "This trade is booked as a CFD instrument; exchange prices can differ from your broker's.":
    "Esta operación está registrada como un CFD; los precios del exchange pueden diferir de los de tu bróker.",
  "This trade is booked as a forex instrument; exchange prices can differ from your broker's.":
    "Esta operación está registrada como un instrumento de forex; los precios del exchange pueden diferir de los de tu bróker.",
  "Shown here, not saved to Reports: tick the confirmation and load again to save it.":
    "Se muestra aquí, sin guardar en Informes: marca la confirmación y vuelve a cargar para guardarlo.",
  "Recorded fills differ by more than 20% from matching market candles. Check for demo trades, a different instrument, quote currency or price adjustment basis. MAE/MFE estimates and fill labels are unavailable until the prices are reconciled.":
    "Las ejecuciones registradas se alejan más de un 20% de las velas del mercado correspondientes. Comprueba si son operaciones demo, otro instrumento, otra divisa de cotización u otra base de ajuste de precios. Las estimaciones de MAE/MFE y las etiquetas de las ejecuciones no estarán disponibles hasta que los precios cuadren.",
  "Monetary estimates need candles quoted in the account's currency. The price move is shown instead.":
    "Las estimaciones monetarias necesitan velas cotizadas en la divisa de la cuenta. En su lugar se muestra el movimiento de precio.",
  "Estimates are available for closed trades only.":
    "Las estimaciones solo están disponibles para operaciones cerradas.",
  "History is truncated. Load a coarser resolution for estimates.":
    "El histórico está recortado. Carga una temporalidad mayor para tener estimaciones.",
  "Set this symbol's contract multiplier in Settings before calculating monetary estimates.":
    "Configura el multiplicador del contrato de este símbolo en Ajustes antes de calcular estimaciones monetarias.",
  "Execution timestamps or quantities do not describe a complete position cycle.":
    "Las horas o cantidades de las ejecuciones no describen un ciclo de posición completo.",
  "Market history does not cover both entry and exit. Estimates are unavailable.":
    "El histórico del mercado no cubre la entrada y la salida. Las estimaciones no están disponibles.",
  "History contains gaps, which may be closed sessions or missing data. Estimates use observed candles only.":
    "El histórico tiene huecos, que pueden ser sesiones cerradas o datos que faltan. Las estimaciones solo usan las velas observadas.",
  "A reversing execution spans multiple trades. Excursion estimates are unavailable for this cycle.":
    "Una ejecución que da la vuelta a la posición abarca varias operaciones. Las estimaciones de excursión no están disponibles para este ciclo.",
  "The recorded fills do not return this position to flat. Estimates are unavailable.":
    "Las ejecuciones registradas no dejan esta posición a cero. Las estimaciones no están disponibles.",
  "No complete candle falls between fills. Choose a finer resolution; fill prices alone cannot estimate excursions.":
    "Ninguna vela completa cae entre las ejecuciones. Elige una temporalidad menor; los precios de las ejecuciones por sí solos no permiten estimar excursiones.",
  "Estimated gross position P&L, including realized partial exits and remaining exposure. Fees and currency conversion are excluded; the order of highs and lows within a candle is unknown.":
    "P&L bruto estimado de la posición, con las salidas parciales realizadas y la exposición restante. Se excluyen las comisiones y la conversión de divisas; el orden de máximos y mínimos dentro de una vela no se conoce.",
  "The position values exceed the supported numeric range.":
    "Los valores de la posición superan el rango numérico admitido.",
  "History reached a request limit. Choose a coarser resolution; incomplete history cannot produce estimates.":
    "El histórico llegó a un límite de solicitudes. Elige una temporalidad mayor; un histórico incompleto no permite estimaciones.",
  "History reached a provider or request limit. Select a coarser resolution; estimates are unavailable for incomplete history.":
    "El histórico llegó a un límite del proveedor o de solicitudes. Elige una temporalidad mayor; no hay estimaciones con un histórico incompleto.",
  "Provider prices may differ from your execution venue. Verify the exact instrument, contract, quote currency and price adjustment basis.":
    "Los precios del proveedor pueden diferir de los de tu mercado de ejecución. Comprueba el instrumento exacto, el contrato, la divisa de cotización y la base de ajuste de precios.",
  "LSE stock and ETF candles are split adjusted. Historical fills must use the same adjustment basis for estimates.":
    "Las velas de acciones y ETF de LSE están ajustadas por splits. Las ejecuciones históricas deben usar la misma base de ajuste para las estimaciones.",
  "Alpaca US crypto candles; prices may differ from your execution venue.":
    "Velas de cripto de Alpaca (EE. UU.); los precios pueden diferir de los de tu mercado de ejecución.",
  "Alpaca {feed} stock feed, unadjusted prices. IEX covers one exchange; feed coverage depends on your subscription.":
    "Feed de acciones {feed} de Alpaca, precios sin ajustar. IEX cubre un solo mercado; la cobertura del feed depende de tu suscripción.",
  "Binance spot prices may differ from other venues. Quote assets such as USDT are not converted into account currency.":
    "Los precios spot de Binance pueden diferir de otros mercados. Los activos de cotización como USDT no se convierten a la divisa de la cuenta.",
  "Bybit spot prices. Quote assets such as USDT are not converted into account currency.":
    "Precios spot de Bybit. Los activos de cotización como USDT no se convierten a la divisa de la cuenta.",
  "Bybit perpetual and futures prices: contract prices may differ from spot. Volume is in the contract's base units.":
    "Precios de perpetuos y futuros de Bybit: los precios de los contratos pueden diferir del spot. El volumen está en las unidades base del contrato.",
  "Bybit inverse (coin-margined) prices: contract prices may differ from spot. Volume is in the contract's base units.":
    "Precios inversos (con margen en la moneda) de Bybit: los precios de los contratos pueden diferir del spot. El volumen está en las unidades base del contrato.",
  "Coinbase Exchange spot prices. Candles may be absent when no trades occurred; gaps are never filled with invented prices.":
    "Precios spot de Coinbase Exchange. Puede faltar alguna vela cuando no hubo operaciones; los huecos nunca se rellenan con precios inventados.",
  "Kraken spot prices, the latest 720 candles of each size only. {pair} is quoted in {quote}; it is not converted into account currency.":
    "Precios spot de Kraken, solo las últimas 720 velas de cada temporalidad. {pair} cotiza en {quote}; no se convierte a la divisa de la cuenta.",
  "Local file: {name}. Price basis: {basis}. Volume may be omitted; only supplied candles are used.":
    "Archivo local: {name}. Base de precios: {basis}. El volumen puede faltar; solo se usan las velas proporcionadas.",
  "Nasdaq daily prices for the regular session, split adjusted and in US dollars. Unadjusted historical fills from before a split will not match.":
    "Precios diarios de Nasdaq de la sesión regular, ajustados por splits y en dólares estadounidenses. Las ejecuciones históricas sin ajustar de antes de un split no coincidirán.",
  "OANDA midpoint candles, aligned to UTC. Volume counts price updates, not traded units. Spread and currency conversion are excluded; set the multiplier to match your imported units.":
    "Velas de precio medio de OANDA, alineadas a UTC. El volumen cuenta actualizaciones de precio, no unidades negociadas. Se excluyen el spread y la conversión de divisas; ajusta el multiplicador a las unidades que importaste.",
  "OKX perpetual prices can differ from spot. One contract is {size}; set the contract multiplier in Settings to match the units in your fills. Volume is in the coin.":
    "Los precios de los perpetuos de OKX pueden diferir del spot. Un contrato es {size}; configura el multiplicador del contrato en Ajustes para que coincida con las unidades de tus ejecuciones. El volumen está en la moneda.",
  "OKX spot prices. Quote assets such as USDT are not converted into account currency.":
    "Precios spot de OKX. Los activos de cotización como USDT no se convierten a la divisa de la cuenta.",
  "Prices are in {unit}, not the main currency unit.":
    "Los precios están en {unit}, no en la unidad principal de la divisa.",
  "Yahoo Finance prices (unofficial, split adjusted, regular session). A future such as ES=F is the continuous front month, not a particular contract.":
    "Precios de Yahoo Finance (no oficiales, ajustados por splits, sesión regular). Un futuro como ES=F es el primer vencimiento continuo, no un contrato concreto.",
  // Data providers (descriptions shown under the market data form)
  "Historical candles. Stock and ETF prices are split adjusted; coverage depends on your plan.":
    "Velas históricas. Los precios de acciones y ETF están ajustados por splits; la cobertura depende de tu plan.",
  "US stocks and crypto. Choose a stock or crypto feed; SIP requires appropriate data access. Stock prices are unadjusted.":
    "Acciones de EE. UU. y cripto. Elige un feed de acciones o de cripto; SIP requiere el acceso a datos adecuado. Los precios de las acciones no están ajustados.",
  "Public Binance spot candles. No API key required. Availability depends on your region and the listed pair.":
    "Velas spot públicas de Binance. No hace falta clave de API. La disponibilidad depende de tu región y del par listado.",
  "Public Bybit candles and live prices for perpetuals and futures, spot and inverse contracts. No API key required; availability depends on your region.":
    "Velas públicas y precios en directo de Bybit para perpetuos y futuros, spot y contratos inversos. No hace falta clave de API; la disponibilidad depende de tu región.",
  "Public Coinbase Exchange spot candles. No API key required; intervals without trades may have no candle.":
    "Velas spot públicas de Coinbase Exchange. No hace falta clave de API; los intervalos sin operaciones pueden no tener vela.",
  "Public OKX candles for spot pairs and perpetual swaps, with years of 1-minute history. No API key required; availability depends on your region.":
    "Velas públicas de OKX para pares spot y swaps perpetuos, con años de histórico de 1 minuto. No hace falta clave de API; la disponibilidad depende de tu región.",
  "Public Kraken candles for crypto and a dozen major currency pairs (EUR/USD, GBP/USD, USD/JPY...). No API key required, but only the latest 720 candles of each size: about 12 hours of 1m, 30 days of 1h, two years of 1d.":
    "Velas públicas de Kraken para cripto y una docena de pares de divisas principales (EUR/USD, GBP/USD, USD/JPY...). No hace falta clave de API, pero solo da las últimas 720 velas de cada temporalidad: unas 12 horas de 1m, 30 días de 1h, dos años de 1d.",
  "Daily candles for US stocks and ETFs from nasdaq.com, the last ten years, split adjusted. No API key required; not an official API, so it can change. For indices use Yahoo Finance.":
    "Velas diarias de acciones y ETF de EE. UU. de nasdaq.com, de los últimos diez años, ajustadas por splits. No hace falta clave de API; no es una API oficial, así que puede cambiar. Para índices usa Yahoo Finance.",
  "Stocks and ETFs worldwide, indices, futures, currency pairs and crypto. No API key required, but it is not an official API: Yahoo throttles it and refuses some networks. Intraday history is short (1m for 30 days, 5m to 30m for 60 days, 1h for two years); daily for the whole history.":
    "Acciones y ETF de todo el mundo, índices, futuros, pares de divisas y cripto. No hace falta clave de API, pero no es una API oficial: Yahoo la limita y rechaza algunas redes. El histórico intradía es corto (1m durante 30 días, de 5m a 30m durante 60 días, 1h durante dos años); el diario, de todo el histórico.",
  "Forex and CFD candles from your v20 account. Midpoint prices, UTC-aligned bars and tick-count volume; no spread or FX conversion is included.":
    "Velas de forex y CFD de tu cuenta v20. Precios medios, barras alineadas a UTC y volumen por número de ticks; no incluye spread ni conversión de divisas.",
  "Local OHLCV candle files. Upload market prices separately from your trade executions.":
    "Archivos locales de velas OHLCV. Sube los precios de mercado por separado de las ejecuciones de tus operaciones.",
  // Market data API errors
  "Choose a market data provider.": "Elige un proveedor de datos de mercado.",
  "Enter the provider's exact instrument symbol.":
    "Escribe el símbolo exacto del instrumento en el proveedor.",
  "Invalid dataset.": "Conjunto de datos no válido.",
  "Choose a supported candle resolution.": "Elige una temporalidad de velas compatible.",
  "Invalid price basis confirmation.": "Confirmación de la base de precios no válida.",
  "Invalid response mode.": "Modo de respuesta no válido.",
  "Option contract history is not supported by this connector yet. An underlying's candles cannot stand in for option prices.":
    "Este conector aún no admite el histórico de contratos de opciones. Las velas del subyacente no sirven como precios de la opción.",
  "Trade must have valid past entry and exit timestamps.":
    "La operación debe tener horas de entrada y salida pasadas y válidas.",
  "This provider supplies crypto candles only. Choose a crypto trade.":
    "Este proveedor solo da velas de cripto. Elige una operación de cripto.",
  "Choose the Alpaca dataset that matches this trade's asset class.":
    "Elige el conjunto de datos de Alpaca que corresponde a la clase de activo de esta operación.",
  "OANDA supports forex and CFD instruments.": "OANDA admite instrumentos de forex y CFD.",

  // Execution chart
  "Execution price change (%)": "Cambio de precio de las ejecuciones (%)",
  "Price change from average entry": "Cambio de precio desde la entrada media",
  "No execution prices available.": "No hay precios de ejecución disponibles.",
  "Recorded fills as a percentage of average entry. Privacy mode keeps prices and monetary P&L hidden.":
    "Ejecuciones registradas como porcentaje de la entrada media. El modo privado mantiene ocultos los precios y el P&L monetario.",
  "No fills are recorded for this trade, so there is no price path to draw.":
    "Esta operación no tiene ejecuciones registradas, así que no hay recorrido de precio que dibujar.",
  "Price path from recorded fills. To view market candles, choose a data source and load history in Market data & replay.":
    "Recorrido del precio según las ejecuciones registradas. Para ver velas del mercado, elige una fuente de datos y carga el histórico en Datos de mercado y repetición.",

  // Strategy rules
  "The check failed": "La comprobación falló",
  "Strategy rule review": "Revisión de las reglas de la estrategia",
  "{percent}% followed · {assessed}/{total} rules assessed":
    "{percent}% cumplidas · {assessed}/{total} reglas evaluadas",
  "{assessed}/{total} rules assessed": "{assessed}/{total} reglas evaluadas",
  "Add rules to this playbook to review adherence.":
    "Añade reglas a este playbook para revisar si las cumples.",
  "Checking…": "Comprobando…",
  "Check with AI": "Comprobar con IA",
  "Apply {count} suggestion": "Aplicar {count} sugerencia",
  "Apply {count} suggestions": "Aplicar {count} sugerencias",
  "Not assessed": "Sin evaluar",
  "rule|Followed": "Cumplida",
  "rule|Broken": "Incumplida",
  "rule|followed": "cumplida",
  "rule|broken": "incumplida",
  "rule|can't tell": "no se puede saber",
  "AI: {verdict}.": "IA: {verdict}.",
  "Assign a playbook to check its rules for this trade.":
    "Asigna un playbook para comprobar sus reglas en esta operación.",
  "Choose an existing strategy rule.": "Elige una regla existente de la estrategia.",

  // Label suggestions
  "Could not apply the labels": "No se pudieron aplicar las etiquetas",
  "Add tag {label}": "Añadir la etiqueta {label}",
  "Add mistake {label}": "Añadir el error {label}",
  "mistake: ": "error: ",
  "(new)": "(nueva)",
  "Nothing to add.": "Nada que añadir.",
  "Rate {rating} of 5": "Valorar con {rating} de 5",
  "No suggestions": "Sin sugerencias",
  "Suggest labels": "Sugerir etiquetas",
  "Apply all": "Aplicar todo",
  "Select at most 20 trades": "Selecciona como máximo 20 operaciones",
  "Apply all suggestions": "Aplicar todas las sugerencias",
  "Label suggestions": "Sugerencias de etiquetas",

  // Attachments
  "Uploading…": "Subiendo…",
  "Add attachment": "Añadir adjunto",
  "Images or PDF · up to 8 MB each": "Imágenes o PDF · hasta 8 MB cada uno",
  "Upload attachment": "Subir adjunto",
  "Upload failed.": "La subida falló.",
  "Remove {name}": "Quitar {name}",
  "Remove {name}?": "¿Quitar {name}?",
  "Attachment owner not found.": "No se encontró a qué pertenece el adjunto.",
  "Files must be 8 MB or smaller.": "Los archivos deben ocupar 8 MB o menos.",
  "Choose a file up to 8 MB.": "Elige un archivo de hasta 8 MB.",
  "Supported files: PNG, JPEG, WebP and PDF.": "Archivos admitidos: PNG, JPEG, WebP y PDF.",
  "Attachment not found": "No se encontró el adjunto",

  // Review export
  "Export failed.": "La exportación falló.",
  "Export PDF": "Exportar PDF",
  "Export PNG": "Exportar PNG",
  "Turn off privacy mode to export financial figures.":
    "Desactiva el modo privado para exportar cifras financieras.",
  "Review export": "Exportar revisión",
  "Download {format}": "Descargar {format}",
  "Review text · download the PDF for the paginated document.":
    "Texto de la revisión · descarga el PDF para tener el documento paginado.",
  "Exported journal review": "Revisión del diario exportada",
  "PDF font does not support these characters: {characters}. Remove them for this export, or export a PNG review.":
    "La fuente del PDF no admite estos caracteres: {characters}. Quítalos para esta exportación o exporta la revisión en PNG.",
  "Could not load the PDF font.": "No se pudo cargar la fuente del PDF.",
  "Image export is unavailable in this browser.":
    "La exportación como imagen no está disponible en este navegador.",
  "Image export failed.": "La exportación como imagen falló.",

  // Fill editor and corrections
  "The fills could not be saved.": "No se pudieron guardar las ejecuciones.",
  "The trade is recalculated from these fills; a fill can also start or end another trade (a new symbol or an earlier exit).":
    "La operación se recalcula a partir de estas ejecuciones; una ejecución también puede abrir o cerrar otra operación (un símbolo nuevo o una salida anterior).",
  "Imported fills keep matching their statement: importing it again does not bring back the old values or a fill removed here.":
    "Las ejecuciones importadas siguen vinculadas a su extracto: importarlo otra vez no recupera los valores antiguos ni una ejecución quitada aquí.",
  "Fill {fill} time": "Hora de la ejecución {fill}",
  "Fill {fill} side": "Lado de la ejecución {fill}",
  "Fill {fill} quantity": "Cantidad de la ejecución {fill}",
  "Fill {fill} price": "Precio de la ejecución {fill}",
  "Fill {fill} fee": "Comisión de la ejecución {fill}",
  "Remove fill {fill}": "Quitar la ejecución {fill}",
  "Add a fill": "Añadir una ejecución",
  "Save the fills": "Guardar las ejecuciones",
  "Enter the symbol.": "Escribe el símbolo.",
  "A trade needs at least one fill. To remove it, delete the trade.":
    "Una operación necesita al menos una ejecución. Para quitarla, elimina la operación.",
  "Fill {fill}: enter a quantity above 0.": "Ejecución {fill}: escribe una cantidad mayor que 0.",
  "Fill {fill}: enter the price.": "Ejecución {fill}: escribe el precio.",
  "Fill {fill}: the fee must be a number.": "Ejecución {fill}: la comisión debe ser un número.",
  "Fill {fill}: enter the date and time.": "Ejecución {fill}: escribe la fecha y la hora.",
  "{count} correction to these fills": "{count} corrección de estas ejecuciones",
  "{count} corrections to these fills": "{count} correcciones de estas ejecuciones",
  "Added: {fill}": "Añadida: {fill}",
  "Removed: {fill}": "Quitada: {fill}",
  "Edited:": "Editada:",
  "Buy {quantity} {symbol} at {price}, {time}": "Compra de {quantity} {symbol} a {price}, {time}",
  "Sell {quantity} {symbol} at {price}, {time}": "Venta de {quantity} {symbol} a {price}, {time}",
  "fill|symbol": "símbolo",
  "fill|side": "lado",
  "fill|quantity": "cantidad",
  "fill|price": "precio",
  "fill|fee": "comisión",
  "fill|time": "hora",
  "A fill sent is not one of this trade's fills.":
    "Una de las ejecuciones enviadas no es de esta operación.",
  "The same fill was sent twice.": "Se envió la misma ejecución dos veces.",
  "A trade needs at least one fill. To remove the trade, delete it instead.":
    "Una operación necesita al menos una ejecución. Para quitar la operación, elimínala.",
  "A trade can have at most 500 fills here.":
    "Aquí una operación puede tener como máximo 500 ejecuciones.",

  // Trades API errors
  "Trade not found": "No se encontró la operación",
  "Trade not found.": "No se encontró la operación.",
  "Invalid stopLoss.": "Stop loss no válido.",
  "Invalid profitTarget.": "Objetivo no válido.",
  "Invalid rating.": "Valoración no válida.",
  "Invalid tags.": "Etiquetas no válidas.",
  "Invalid mistakes.": "Errores no válidos.",
  "Rating must be 1–5.": "La valoración debe ser de 1 a 5.",
  "Notes must be at most 100,000 characters.":
    "Las notas pueden tener como máximo 100.000 caracteres.",
  "Playbook not found.": "No se encontró el playbook.",
  "Enter a valid bulk action.": "Indica una acción en bloque válida.",
  "Unknown action": "Acción desconocida",
  "A trade can have at most 100 tags.": "Una operación puede tener como máximo 100 etiquetas.",
  // Missed trades API errors
  "Enter a symbol and direction.": "Escribe un símbolo y una dirección.",
  "Enter a valid observation time.": "Escribe una hora de observación válida.",
  "Notes are too long.": "Las notas son demasiado largas.",
  "Invalid entry price.": "Precio de entrada no válido.",
  "Invalid stop price.": "Precio de stop no válido.",
  "Invalid target price.": "Precio objetivo no válido.",
  "Strategy not found.": "No se encontró la estrategia.",
  "Missed trade not found.": "No se encontró la operación no tomada.",
  "Unknown resource": "Recurso desconocido",
  "Invalid id.": "Id no válido.",

  // Dictation and voice memo
  "Dictate your note": "Dicta tu nota",
  "Stop dictation": "Detener el dictado",
  "Starting…": "Iniciando…",
  "Listening · Stop": "Escuchando · Detener",
  Dictate: "Dictar",
  "Dictation help": "Ayuda del dictado",
  "Keyboard dictation types directly into your note. Use your keyboard’s microphone key or your system’s dictation shortcut. On Mac, enable Dictation in System Settings → Keyboard.":
    "El dictado del teclado escribe directamente en tu nota. Usa la tecla de micrófono de tu teclado o el atajo de dictado de tu sistema. En Mac, activa el Dictado en Ajustes del Sistema → Teclado.",
  "Use keyboard dictation": "Usar el dictado del teclado",
  Dismiss: "Descartar",
  "Note ready. Press your keyboard’s microphone key or dictation shortcut to speak.":
    "Nota lista. Pulsa la tecla de micrófono de tu teclado o el atajo de dictado para hablar.",
  "This browser does not support speech recognition. Open the journal in Chrome, or use keyboard dictation below.":
    "Este navegador no admite el reconocimiento de voz. Abre el diario en Chrome o usa abajo el dictado del teclado.",
  "Microphone or speech access was blocked. Allow microphone access in your browser and system settings, then try again.":
    "Se bloqueó el acceso al micrófono o a la voz. Permite el acceso al micrófono en los ajustes del navegador y del sistema y vuelve a intentarlo.",
  "No microphone is available. Connect or enable a microphone, then try again.":
    "No hay ningún micrófono disponible. Conecta o activa un micrófono y vuelve a intentarlo.",
  "No speech was detected. Try again and speak after the button says Listening.":
    "No se detectó voz. Vuelve a intentarlo y habla cuando el botón diga Escuchando.",
  "This browser could not reach its speech recognition service. Try Chrome with an internet connection, or use keyboard dictation below.":
    "Este navegador no pudo conectar con su servicio de reconocimiento de voz. Prueba Chrome con conexión a internet o usa abajo el dictado del teclado.",
  "This browser does not support dictation in your current language. Use keyboard dictation below.":
    "Este navegador no admite el dictado en tu idioma actual. Usa abajo el dictado del teclado.",
  "Speech recognition could not start in this browser. Try Chrome, or use keyboard dictation below.":
    "El reconocimiento de voz no pudo iniciarse en este navegador. Prueba Chrome o usa abajo el dictado del teclado.",
  "Could not make the note": "No se pudo crear la nota",
  "Voice memo": "Nota de voz",
  "Talk it through; the AI sorts it into a note you check before adding.":
    "Cuéntalo en voz alta; la IA lo ordena en una nota que revisas antes de añadirla.",
  Memo: "Nota de voz",
  "Dictate or type what happened, how you felt, what to keep and fix…":
    "Dicta o escribe qué pasó, cómo te sentiste, qué mantener y qué corregir…",
  "Writing…": "Escribiendo…",
  "Make it a note": "Convertir en nota",
  "Add to note": "Añadir a la nota",
  "Note preview": "Vista previa de la nota",
};

export default es;
