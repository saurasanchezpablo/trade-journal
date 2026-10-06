/** Spanish for the reports area: English source text → Spanish. See lib/i18n.ts. */
const es: Record<string, string> = {
  // Groups the journal names itself (report breakdowns, calendar, trade lists)
  "group|Sun": "Dom",
  "group|Mon": "Lun",
  "group|Tue": "Mar",
  "group|Wed": "Mié",
  "group|Thu": "Jue",
  "group|Fri": "Vie",
  "group|Sat": "Sáb",
  "group|long": "largo",
  "group|short": "corto",
  "group|win": "ganadora",
  "group|loss": "perdedora",
  "group|breakeven": "sin ganancia",
  "group|open": "abierta",
  "group|Open": "Abierta",
  "group|Untagged": "Sin etiqueta",
  "group|None": "Ninguno",
  "group|Unassigned": "Sin asignar",
  "group|Unspecified": "Sin especificar",
  "group|equity": "acciones",
  "group|option": "opciones",
  "group|futures": "futuros",
  "group|forex": "forex",
  "group|crypto": "cripto",
  "group|cfd": "CFD",
  "group|other": "otro",
  "group|-2 to -1R": "-2 a -1R",
  Sunday: "Domingo",
  Monday: "Lunes",
  Tuesday: "Martes",
  Wednesday: "Miércoles",
  Thursday: "Jueves",
  Friday: "Viernes",
  Saturday: "Sábado",

  // Report dimensions (packages/core DIMENSIONS)
  Strategy: "Estrategia",
  Tag: "Etiqueta",
  Mistake: "Error",
  Direction: "Dirección",
  "Asset class": "Clase de activo",
  Weekday: "Día de la semana",
  Month: "Mes",
  "Entry hour": "Hora de entrada",
  "Exit hour": "Hora de salida",
  "Entry · 15 minutes": "Entrada · 15 minutos",
  "Exit · 15 minutes": "Salida · 15 minutos",
  "Holding time": "Tiempo en posición",
  "Position size": "Tamaño de posición",
  "Entry price": "Precio de entrada",
  "Exit price": "Precio de salida",
  "Realized R": "R realizado",
  "Planned R": "R planificado",
  Outcome: "Resultado",

  // Reports page
  Overview: "Resumen",
  "Performance trends": "Tendencias de rendimiento",
  "Trade explorer": "Explorador de operaciones",
  Breakdowns: "Desgloses",
  "Cross-analysis": "Análisis cruzado",
  "Compare groups": "Comparar grupos",
  Habits: "Hábitos",
  "Loading trade explorer…": "Cargando el explorador de operaciones…",
  "Loading performance trends…": "Cargando las tendencias de rendimiento…",
  "Closed trades": "Operaciones cerradas",
  "Net P&L": "P&L neto",
  "Win rate": "Porcentaje de acierto",
  "Profit factor": "Factor de beneficio",
  "Entry volume": "Volumen de entrada",
  "Avg holding time": "Tiempo medio en posición",
  "Avg planned R": "R planificado medio",
  "Avg realized R": "R realizado medio",
  "Avg duration": "Duración media",
  Trades: "Operaciones",
  "Win %": "% acierto",
  "Win rate {rate}": "Acierto {rate}",
  "No trades": "Sin operaciones",
  "Cell values are net P&L in {currency}.": "Los valores de las celdas son P&L neto en {currency}.",
  "account currency": "la divisa de la cuenta",
  "Account currency": "Divisa de la cuenta",
  "No closed trades match these filters.": "Ninguna operación cerrada coincide con estos filtros.",
  "Group by": "Agrupar por",
  "Then by": "Después por",
  "{primary} by {secondary}": "{primary} por {secondary}",
  "{dimension} performance": "Rendimiento: {dimension}",
  "Filters: {filters}": "Filtros: {filters}",
  "Closed trades: {trades} | Net P&L: {pnl} | Win rate: {rate}":
    "Operaciones cerradas: {trades} | P&L neto: {pnl} | Acierto: {rate}",
  "{trades} trades | P&L {pnl} | Win {win} | Planned {planned}R | Realized {realized}R | Volume {volume} | Holding time {holding}":
    "{trades} operaciones | P&L {pnl} | Acierto {win} | Planificado {planned}R | Realizado {realized}R | Volumen {volume} | Tiempo en posición {holding}",
  "Loading report…": "Cargando el informe…",
  "These accounts use different currencies ({currencies}). Select accounts with the same currency in Filters to compare monetary results.":
    "Estas cuentas usan divisas distintas ({currencies}). Elige en Filtros cuentas con la misma divisa para comparar resultados monetarios.",
  "Performance by {dimension}": "Rendimiento por {dimension}",
  "Closed trades only. Dates use the closing day; weekday and entry time use the opening time in {timeZone}. Volume is total entry quantity. R uses weighted entry and total entry quantity; missing or invalid risk inputs are excluded from R averages. Derivatives require a configured multiplier for realized R. Multiple tags or mistakes can place a trade in more than one group, so those group totals can overlap.":
    "Solo operaciones cerradas. Las fechas usan el día de cierre; el día de la semana y la hora de entrada usan la hora de apertura en {timeZone}. El volumen es la cantidad total de entrada. El R usa la entrada ponderada y la cantidad total de entrada; los datos de riesgo que faltan o no son válidos se excluyen de las medias de R. Los derivados necesitan un multiplicador configurado para el R realizado. Varias etiquetas o errores pueden poner una operación en más de un grupo, así que los totales de esos grupos pueden solaparse.",
  "your journal timezone": "la zona horaria de tu diario",
  "Long trades": "Operaciones en largo",
  "Short trades": "Operaciones en corto",
  "Trades: {trades} | P&L: {pnl}": "Operaciones: {trades} | P&L: {pnl}",
  "Win rate: {rate} | Planned R: {planned} | Realized R: {realized}":
    "Acierto: {rate} | R planificado: {planned} | R realizado: {realized}",
  "Each group has its own filters. Compare strategies, accounts, periods, or trade characteristics. Groups may overlap.":
    "Cada grupo tiene sus propios filtros. Compara estrategias, cuentas, periodos o características de las operaciones. Los grupos pueden solaparse.",
  "Select accounts with the same currency in both groups. Currency conversion is not applied.":
    "Elige cuentas con la misma divisa en los dos grupos. No se aplica conversión de divisas.",
  "Group {group} name": "Nombre del grupo {group}",
  "Edit filters": "Editar filtros",
  "{b} minus {a}:": "{b} menos {a}:",
  "net P&L": "P&L neto",
  "{count} trades": "{count} operaciones",
  "{count} trade": "{count} operación",
  "{a} vs {b}": "{a} vs {b}",
  "Group {group}: {filters}": "Grupo {group}: {filters}",
  "Group {group} filters": "Filtros del grupo {group}",
  "Apply to group": "Aplicar al grupo",

  // Overview
  "By symbol": "Por símbolo",
  "Long vs short": "Largo vs corto",
  "By weekday": "Por día de la semana",
  "By holding time": "Por tiempo en posición",
  "By tag": "Por etiqueta",
  "By mistake": "Por error",
  "By playbook": "Por playbook",
  "column|symbol": "símbolo",
  "column|Long vs short": "Largo vs corto",
  "column|weekday": "día de la semana",
  "column|holding time": "tiempo en posición",
  "column|tag": "etiqueta",
  "column|mistake": "error",
  "column|playbook": "playbook",
  "Trading overview": "Resumen de trading",
  "Trade time performance (opening hour)": "Rendimiento por hora (hora de apertura)",
  "{trades} trades | Net P&L {pnl}": "{trades} operaciones | P&L neto {pnl}",
  "{trades} trades | Win {win} | Net P&L {pnl}":
    "{trades} operaciones | Acierto {win} | P&L neto {pnl}",
  "Trade time performance": "Rendimiento por hora",
  "Annotate trades to unlock this breakdown.": "Anota operaciones para ver este desglose.",
  "No data yet.": "Aún no hay datos.",
  "Weekday and hour use trade opening times. Overview trade counts include open positions; win rates use closed trades. Holding time requires a closed trade. Tags and mistakes can overlap. By symbol shows the top 20 by net P&L; Breakdowns includes every symbol and additional metrics for closed trades.":
    "El día de la semana y la hora usan la hora de apertura. Los recuentos del resumen incluyen posiciones abiertas; el porcentaje de acierto usa operaciones cerradas. El tiempo en posición necesita una operación cerrada. Las etiquetas y los errores pueden solaparse. Por símbolo muestra los 20 mejores por P&L neto; Desgloses incluye todos los símbolos y más métricas de las operaciones cerradas.",

  // MAE and MFE estimates
  "Calculating {done} of {total} · {symbol}": "Calculando {done} de {total} · {symbol}",
  "History request failed.": "Falló la solicitud del histórico.",
  "Estimate unavailable.": "Estimación no disponible.",
  "Stopped. {saved} estimates saved · {failed} unavailable · {skipped} not processed.":
    "Detenido. {saved} estimaciones guardadas · {failed} no disponibles · {skipped} sin procesar.",
  "{saved} estimates saved · {failed} unavailable · {skipped} not processed.":
    "{saved} estimaciones guardadas · {failed} no disponibles · {skipped} sin procesar.",
  "MAE & MFE estimates": "Estimaciones de MAE y MFE",
  "{saved} of {total} closed trades have saved estimates. Estimated gross excursions exclude fees; MAE is shown as a positive adverse amount. Missing values are excluded from plots, never counted as zero.":
    "{saved} de {total} operaciones cerradas tienen estimaciones guardadas. Las excursiones brutas estimadas no incluyen comisiones; el MAE se muestra como una cantidad adversa positiva. Los valores que faltan se excluyen de los gráficos, nunca cuentan como cero.",
  "Calculate missing estimates": "Calcular las estimaciones que faltan",
  "Loads {resolution} candles for this selection using each trade’s recorded symbol. This uses your provider allowance and may take several minutes. For custom symbols or a specific CSV dataset, load and save estimates from the individual trade.":
    "Carga velas de {resolution} para esta selección con el símbolo registrado de cada operación. Usa el cupo de tu proveedor y puede tardar varios minutos. Para símbolos personalizados o un conjunto de datos CSV concreto, carga y guarda las estimaciones desde cada operación.",
  "Estimate data provider": "Proveedor de datos para estimar",
  "Choose a data source": "Elige una fuente de datos",
  "Estimate candle resolution": "Temporalidad de las velas para estimar",
  "Estimate dataset": "Conjunto de datos para estimar",
  "Choose a dataset": "Elige un conjunto de datos",
  "I confirm these symbols, price adjustments and quote currencies match the fills and account currency ({currencies}).":
    "Confirmo que estos símbolos, ajustes de precio y divisas de cotización coinciden con las ejecuciones y la divisa de la cuenta ({currencies}).",
  none: "ninguno",
  "Select accounts with one currency to calculate estimates together.":
    "Elige cuentas con una sola divisa para calcular las estimaciones juntas.",
  "Calculate {count} missing estimate": "Calcular {count} estimación que falta",
  "Calculate {count} missing estimates": "Calcular {count} estimaciones que faltan",
  "Connect a market data provider in Settings":
    "Conecta un proveedor de datos de mercado en Ajustes",
  "Stop calculation": "Detener el cálculo",

  // Performance trends
  "Loading trend chart": "Cargando el gráfico de tendencia",
  "Loading performance trends": "Cargando las tendencias de rendimiento",
  "Unable to load performance trends.": "No se pudieron cargar las tendencias de rendimiento.",
  "{count} closed trade": "{count} operación cerrada",
  "{count} closed trades": "{count} operaciones cerradas",
  "Active account and filters": "Cuenta y filtros activos",
  "Closing order": "Orden de cierre",
  "No closed trades in this selection": "No hay operaciones cerradas en esta selección",
  "Change the date range or filters to explore your trading history. Open positions are excluded.":
    "Cambia el rango de fechas o los filtros para explorar tu historial de trading. Las posiciones abiertas no se incluyen.",
  "These trades use different currencies ({currencies}). Win rate is available; select accounts with one currency to compare P&L and largest trades. No currency conversion is applied.":
    "Estas operaciones usan divisas distintas ({currencies}). El porcentaje de acierto está disponible; elige cuentas con una sola divisa para comparar el P&L y las operaciones más grandes. No se aplica conversión de divisas.",
  "Win-rate trend": "Tendencia del porcentaje de acierto",
  "Average trade P&L trend": "Tendencia del P&L medio por operación",
  "Last 20 closed trades at each point": "Últimas 20 operaciones cerradas en cada punto",
  "Breakevens included": "Incluye operaciones sin ganancia",
  "After fees": "Después de comisiones",
  "Latest full window": "Última ventana completa",
  "Selected-period win rate": "Porcentaje de acierto del periodo",
  "Selected-period average": "Media del periodo",
  "Closed-trade sequence": "Secuencia de operaciones cerradas",
  "Dashed line: selected-period win rate": "Línea discontinua: porcentaje de acierto del periodo",
  "Dashed line: selected-period average": "Línea discontinua: media del periodo",
  "{count} more closed trade is needed for the first full 20-trade window.":
    "Falta {count} operación cerrada más para la primera ventana completa de 20 operaciones.",
  "{count} more closed trades are needed for the first full 20-trade window.":
    "Faltan {count} operaciones cerradas más para la primera ventana completa de 20 operaciones.",
  "Latest window available. A line chart appears at 27 closed trades, when there are 8 full windows to compare.":
    "Última ventana disponible. El gráfico de líneas aparece con 27 operaciones cerradas, cuando hay 8 ventanas completas para comparar.",
  "Largest winning and losing trade": "Mayor operación ganadora y perdedora",
  "Individual closed trades, after fees, not daily totals. Uses your journal’s win/loss classification.":
    "Operaciones cerradas individuales, después de comisiones, no totales diarios. Usa la clasificación de ganadoras y perdedoras de tu diario.",
  "Largest winner": "Mayor ganadora",
  "Largest loser": "Mayor perdedora",
  "No winning trades in this selection.": "No hay operaciones ganadoras en esta selección.",
  "No losing trades in this selection.": "No hay operaciones perdedoras en esta selección.",
  "Explore window values and trades": "Explorar los valores de cada ventana y sus operaciones",
  "Each row covers 20 trades ending at the linked trade. Dates use {timeZone}.":
    "Cada fila cubre 20 operaciones que terminan en la operación enlazada. Las fechas usan {timeZone}.",
  "Window / closing trade": "Ventana / operación de cierre",
  "Avg net P&L": "P&L neto medio",
  "Only trades within your selection are used; earlier trades are not borrowed to fill a window. Rolling windows overlap and describe recent results, not a forecast. Small samples can change sharply.":
    "Solo se usan operaciones de tu selección; no se toman operaciones anteriores para completar una ventana. Las ventanas móviles se solapan y describen resultados recientes, no una previsión. Las muestras pequeñas pueden cambiar mucho.",

  // Trade explorer
  "Loading scatter plot": "Cargando el gráfico de dispersión",
  "Loading trade explorer": "Cargando el explorador de operaciones",
  "Unable to load trade explorer.": "No se pudo cargar el explorador de operaciones.",
  "Duration (minutes)": "Duración (minutos)",
  "Entry time ({timeZone})": "Hora de entrada ({timeZone})",
  "Estimated {measure} ({currency})": "{measure} estimado ({currency})",
  "Net P&L ({currency})": "P&L neto ({currency})",
  "{minutes} min": "{minutes} min",
  "All {count} comparable trades, newest close first. Each link opens the original trade.":
    "Las {count} operaciones comparables, las cerradas más recientemente primero. Cada enlace abre la operación original.",
  "Trade / closed": "Operación / cierre",
  "Page {page} of {pages}": "Página {page} de {pages}",
  "Compare individual trades, not group averages":
    "Compara operaciones individuales, no medias de grupo",
  "Scatter plot presets": "Ajustes rápidos del gráfico de dispersión",
  "MAE vs net P&L": "MAE vs P&L neto",
  "MFE vs net P&L": "MFE vs P&L neto",
  "MAE vs MFE": "MAE vs MFE",
  "{x} vs {y}": "{x} vs {y}",
  "Trade outcomes by holding time": "Resultados por tiempo en posición",
  "Trade outcomes by entry time": "Resultados por hora de entrada",
  "{count} of {total} closed trades comparable":
    "{count} de {total} operaciones cerradas comparables",
  "One point per trade": "Un punto por operación",
  "Gross excursion estimates; net P&L after fees":
    "Estimaciones de excursión bruta; P&L neto después de comisiones",
  "X axis": "Eje X",
  "Y axis": "Eje Y",
  "Entry time": "Hora de entrada",
  "Estimated MAE": "MAE estimado",
  "Estimated MFE": "MFE estimado",
  "Change the date range or filters to explore your history. Open positions are excluded.":
    "Cambia el rango de fechas o los filtros para explorar tu historial. Las posiciones abiertas no se incluyen.",
  "These trades use different currencies ({currencies}). Select accounts with one currency for monetary axes, or use Duration and Realized R to compare risk-normalized outcomes. No currency conversion is applied.":
    "Estas operaciones usan divisas distintas ({currencies}). Elige cuentas con una sola divisa para los ejes monetarios, o usa Duración y R realizado para comparar resultados normalizados por riesgo. No se aplica conversión de divisas.",
  "{count} trades excluded:": "{count} operaciones excluidas:",
  "realized R requires a valid planned stop-loss and any required contract multiplier;":
    "el R realizado necesita un stop loss planificado válido y el multiplicador de contrato que haga falta;",
  "MAE/MFE require saved, current market-data estimates.":
    "MAE/MFE necesitan estimaciones guardadas y actuales de datos de mercado.",
  "Both axes require valid values and timestamps.":
    "Los dos ejes necesitan valores y marcas de tiempo válidos.",
  "R = net P&L ÷ planned risk from your stop-loss. Uses weighted entry and total entry quantity; it does not measure maximum intratrade risk.":
    "R = P&L neto ÷ riesgo planificado según tu stop loss. Usa la entrada ponderada y la cantidad total de entrada; no mide el riesgo máximo durante la operación.",
  "Positive net P&L": "P&L neto positivo",
  "Negative net P&L": "P&L neto negativo",
  "Zero net P&L": "P&L neto cero",
  "Select a point to inspect its trade. Overlapping points remain individually accessible in the table.":
    "Elige un punto para ver su operación. Los puntos superpuestos siguen accesibles uno a uno en la tabla.",
  "Closed {date}": "Cerrada {date}",
  "Open trade": "Abrir operación",
  Dismiss: "Descartar",
  "No trades have the data required for these axes. Try another axis or adjust your filters.":
    "Ninguna operación tiene los datos que necesitan estos ejes. Prueba otro eje o ajusta los filtros.",
  "Fewer than 8 comparable trades. Review the exact values below, or widen your filters to reveal a useful scatter plot.":
    "Menos de 8 operaciones comparables. Revisa los valores exactos abajo, o amplía los filtros para ver un gráfico de dispersión útil.",
  "Small sample: treat apparent patterns cautiously until more trades are available.":
    "Muestra pequeña: toma los patrones con cautela hasta tener más operaciones.",
  "Comparable trades": "Operaciones comparables",
  "Explore all {count} trades": "Explorar las {count} operaciones",
  "Duration is elapsed time from first entry to final exit, including overnight hours. Entry time uses the journal timezone; midnight neighbors appear at opposite ends of that axis. Patterns describe this selection, not causation or a recommended holding time.":
    "La duración es el tiempo desde la primera entrada hasta la salida final, incluidas las horas nocturnas. La hora de entrada usa la zona horaria del diario; las horas cercanas a medianoche aparecen en extremos opuestos de ese eje. Los patrones describen esta selección, no una causa ni un tiempo en posición recomendado.",

  // Habits
  "{count} trade · {won} won": "{count} operación · {won} ganadas",
  "{count} trades · {won} won": "{count} operaciones · {won} ganadas",
  "a trade": "por operación",
  "{count} closed trades, days in {timeZone}. A habit is flagged when it has at least five trades on each side and does worse than the rest.":
    "{count} operaciones cerradas, días en {timeZone}. Un hábito se marca cuando tiene al menos cinco operaciones en cada lado y le va peor que al resto.",
  "These trades use {currencies}, so amounts are not shown. Select accounts with one currency to see them.":
    "Estas operaciones usan {currencies}, así que no se muestran importes. Elige cuentas con una sola divisa para verlos.",
  "Revenge trades": "Operaciones de venganza",
  "Trading on after losses": "Seguir operando tras pérdidas",
  "Sizing up after a loss": "Subir el tamaño tras una pérdida",
  "Size creeping up": "Tamaño que va subiendo",
  "Results fading later in the day": "Resultados que empeoran a lo largo del día",
  "COSTING YOU": "TE CUESTA",
  "TOO FEW TRADES": "POCAS OPERACIONES",
  "NO HARM FOUND": "SIN PERJUICIO",
  about: "unos",
  "against your usual result": "frente a tu resultado habitual",
  "Size up on {symbols}.": "Más tamaño en {symbols}.",
  "{symbol} ({earlier} to {recent})": "{symbol} ({earlier} a {recent})",
  "These trades": "Estas operaciones",
  "The rest": "El resto",
  "Recent examples": "Ejemplos recientes",

  // Rule adherence
  "Rule adherence": "Cumplimiento de reglas",
  "{evaluated}/{possible} rule assessments across {total} filtered closed trades.":
    "{evaluated}/{possible} evaluaciones de reglas en {total} operaciones cerradas filtradas.",
  "{count} trade still needs assessment.": "Falta evaluar {count} operación.",
  "{count} trades still need assessment.": "Falta evaluar {count} operaciones.",
  "All rules followed": "Todas las reglas cumplidas",
  "At least one broken": "Al menos una incumplida",
  "{count} trade · {win} win": "{count} operación · {win} de acierto",
  "{count} trades · {win} win": "{count} operaciones · {win} de acierto",
  "P&L hidden for mixed currencies.": "P&L oculto con divisas mezcladas.",
  "Performance by rule": "Rendimiento por regla",
  "{rate} followed": "{rate} cumplida",
  "{count} assessment": "{count} evaluación",
  "{count} assessments": "{count} evaluaciones",
  "Followed: {followed} trades / {followedWin} win · Broken: {broken} / {brokenWin} win":
    "Cumplida: {followed} operaciones / {followedWin} de acierto · Incumplida: {broken} / {brokenWin} de acierto",
  "Net P&L:": "P&L neto:",
  "rule|followed": "cumplida",
  "rule|broken": "incumplida",

  // Calendar
  "Previous month": "Mes anterior",
  "Next month": "Mes siguiente",
  "Loading calendar": "Cargando el calendario",
  "Loading performance insights": "Cargando el análisis de rendimiento",
  Week: "Semana",
  "{count} trading day": "{count} día operado",
  "{count} trading days": "{count} días operados",
  "{count} green": "{count} en verde",
  "Month:": "Mes:",
  "Multiple currencies": "Varias divisas",
  "P&L hidden": "P&L oculto",
  "Week total": "Total semanal",
  "Loading daily performance chart": "Cargando el gráfico de rendimiento diario",
  "Performance insights": "Análisis de rendimiento",
  "Visible month × active filters · Closed trades, after fees · {timeZone}":
    "Mes visible × filtros activos · Operaciones cerradas, después de comisiones · {timeZone}",
  "View matching trades": "Ver las operaciones",
  "No closed trades in this view": "No hay operaciones cerradas en esta vista",
  "Choose another month or adjust your account and filters. Open positions and days without trades aren’t included in performance insights.":
    "Elige otro mes o ajusta la cuenta y los filtros. Las posiciones abiertas y los días sin operaciones no entran en el análisis de rendimiento.",
  "These trades use {currencies}. Select accounts with one currency to compare monetary performance; no exchange-rate conversion is applied.":
    "Estas operaciones usan {currencies}. Elige cuentas con una sola divisa para comparar el rendimiento monetario; no se aplica conversión de divisas.",
  "Sum of net P&L for closed trades in this month and filter selection. Includes fees. No currency conversion.":
    "Suma del P&L neto de las operaciones cerradas de este mes y estos filtros. Incluye comisiones. Sin conversión de divisas.",
  "Average daily P&L": "P&L diario medio",
  "Per day with closed trades": "Por día con operaciones cerradas",
  "Net P&L divided by trading days. Days without closed trades are excluded; break-even trading days are included.":
    "P&L neto dividido entre los días operados. Los días sin operaciones cerradas no cuentan; los días operados sin ganancia sí.",
  "Trade win rate": "Porcentaje de acierto",
  "{wins} wins · {losses} losses · {breakevens} break-even":
    "{wins} ganadoras · {losses} perdedoras · {breakevens} sin ganancia",
  "Winning closed trades divided by all closed trades, including break-even trades. Uses your journal's configured break-even rule.":
    "Operaciones cerradas ganadoras divididas entre todas las cerradas, incluidas las que no tienen ganancia. Usa la regla de sin ganancia configurada en tu diario.",
  "Total closed trades": "Total de operaciones cerradas",
  "Round-trip trades, not executions": "Operaciones completas, no ejecuciones",
  "Counts completed trades whose closing day falls in the visible month and selected date range, with all other filters applied.":
    "Cuenta las operaciones completadas cuyo día de cierre cae en el mes visible y en el rango de fechas elegido, con el resto de filtros aplicados.",
  "Best & worst day": "Mejor y peor día",
  "Best day": "Mejor día",
  "Worst day": "Peor día",
  "One trading day; both extrema are the same.": "Un solo día operado; los dos extremos coinciden.",
  "Highest and lowest daily net P&L.": "P&L neto diario más alto y más bajo.",
  "Average green & red day": "Día verde y rojo medio",
  "{count} profitable day": "{count} día con beneficio",
  "{count} profitable days": "{count} días con beneficio",
  "{count} losing day": "{count} día con pérdida",
  "{count} losing days": "{count} días con pérdida",
  "Each average uses only its own group.": "Cada media usa solo su propio grupo.",
  "Day consistency": "Constancia diaria",
  "{green} positive · {red} negative · {flat} flat days":
    "{green} positivos · {red} negativos · {flat} días planos",
  "Share of trading days with strictly positive net P&L. This is a profitable-day rate, not a risk-adjusted score or a prediction. Flat days stay in the denominator.":
    "Parte de los días operados con P&L neto estrictamente positivo. Es un porcentaje de días con beneficio, no una puntuación ajustada por riesgo ni una predicción. Los días planos siguen en el denominador.",
  "Daily performance": "Rendimiento diario",
  "Net P&L by closing day": "P&L neto por día de cierre",
  "Dashed line: 5-trading-day average": "Línea discontinua: media de 5 días operados",
  "A trend needs more than one day": "Una tendencia necesita más de un día",
  "Explore an earlier month with more trading history.":
    "Explora un mes anterior con más historial de trading.",
  "Daily values & trade links ({count})": "Valores diarios y enlaces a operaciones ({count})",
  "Daily results for the current month and filters":
    "Resultados diarios del mes actual y los filtros",
  "Closing day": "Día de cierre",
  "Performance by weekday": "Rendimiento por día de la semana",
  "Closing-day net P&L": "P&L neto por día de cierre",
  "Select a row": "Elige una fila",
  "Most profitable weekday": "Día de la semana más rentable",
  "No profitable weekday yet": "Aún no hay ningún día de la semana rentable",
  "{weekday}: {trades} trades. Inspect closing days.":
    "{weekday}: {trades} operaciones. Ver los días de cierre.",
  "{weekday}: {trades} trades, {pnl}. Inspect closing days.":
    "{weekday}: {trades} operaciones, {pnl}. Ver los días de cierre.",
  "{weekday} · {trades} trades across {days} days":
    "{weekday} · {trades} operaciones en {days} días",
  "Small sample: {count} trading day. Weekday results and consistency describe this selection only.":
    "Muestra pequeña: {count} día operado. Los resultados por día de la semana y la constancia describen solo esta selección.",
  "Small sample: {count} trading days. Weekday results and consistency describe this selection only.":
    "Muestra pequeña: {count} días operados. Los resultados por día de la semana y la constancia describen solo esta selección.",

  // Results by day type
  "Results by day type": "Resultados por tipo de día",
  Period: "Periodo",
  "Last {count} days": "Últimos {count} días",
  Refresh: "Actualizar",
  Show: "Mostrar",
  "Trend or range, quiet or volatile, news or not: from each symbol's daily candles.":
    "Tendencia o rango, tranquilo o volátil, con noticias o sin ellas: según las velas diarias de cada símbolo.",
  "Reading daily candles…": "Leyendo las velas diarias…",
  "No closed trades with candles in this period.":
    "No hay operaciones cerradas con velas en este periodo.",
  "Day type": "Tipo de día",
  "Trend day up": "Día de tendencia alcista",
  "Trend day down": "Día de tendencia bajista",
  "Range day": "Día de rango",
  "Mixed day": "Día mixto",
  Quiet: "Tranquilo",
  "Normal volatility": "Volatilidad normal",
  Volatile: "Volátil",
  "High-impact news": "Noticias de alto impacto",
  "No high-impact news": "Sin noticias de alto impacto",
  "Each trade counts once per group (shape, volatility, news).":
    "Cada operación cuenta una vez por grupo (forma, volatilidad, noticias).",
  "Your accounts use {currencies}, so net P&L is not added across them.":
    "Tus cuentas usan {currencies}, así que el P&L neto no se suma entre ellas.",
  "Left out: {symbols}.": "Excluidos: {symbols}.",
  "No chart of it yet.": "Aún no tiene gráfico.",
  "Market data is unavailable.": "Los datos de mercado no están disponibles.",

  // Ask your journal
  "Ask your journal": "Pregunta a tu diario",
  "Why do my Monday shorts keep failing?": "¿Por qué fallan siempre mis cortos de los lunes?",
  "A new chat uses the selected accounts and filters. The AI looks up trades, stats, notes and charts within them; follow-ups keep that scope.":
    "Un chat nuevo usa las cuentas y los filtros elegidos. La IA busca operaciones, estadísticas, notas y gráficos dentro de ellos; las preguntas siguientes mantienen ese alcance.",
  "What's my most expensive mistake?": "¿Cuál es mi error más caro?",
  "Which weekday should I stop trading?": "¿Qué día de la semana debería dejar de operar?",
  "Am I better at longs or shorts?": "¿Se me dan mejor los largos o los cortos?",
  "What do my five worst trades have in common?":
    "¿Qué tienen en común mis cinco peores operaciones?",
  "Uses the selected accounts and journal filters. Changing filters clears the answer.":
    "Usa las cuentas y los filtros del diario elegidos. Cambiar los filtros borra la respuesta.",
  "Ask your journal a question": "Hazle una pregunta a tu diario",
  "Thinking…": "Pensando…",
  Ask: "Preguntar",
};

export default es;
