/** Spanish for the dashboard-reports area: English source text → Spanish. See lib/i18n.ts. */
const es: Record<string, string> = {
  // Dashboard page
  "Could not load the dashboard.": "No se pudo cargar el panel.",
  "No trades match these filters. Clear or adjust Filters to see more results.":
    "Ninguna operación coincide con estos filtros. Borra o ajusta los filtros para ver más resultados.",
  "These accounts use different currencies ({currencies}). Select accounts with the same currency in Filters to compare monetary results.":
    "Estas cuentas usan monedas distintas ({currencies}). Selecciona en los filtros cuentas con la misma moneda para comparar resultados monetarios.",
  "About {title}": "Sobre {title}",
  // Dashboard cards
  "Net P&L": "P&L neto",
  "Trade win %": "% de acierto por operación",
  "Profit factor": "Factor de beneficio",
  "Day win %": "% de días ganadores",
  "Avg win / loss": "Ganancia / pérdida media",
  "Edge Score": "Edge Score",
  "Cumulative P&L": "P&L acumulado",
  "Daily P&L": "P&L diario",
  Calendar: "Calendario",
  Activity: "Actividad",
  "Max drawdown": "Drawdown máximo",
  Streaks: "Rachas",
  "Expectancy / trade": "Esperanza por operación",
  "Avg duration": "Duración media",
  "Best / worst day": "Mejor / peor día",
  "Trade time performance": "Rendimiento por hora",
  // Card contents
  "Realized profit and loss net of fees, over the selected range.":
    "Pérdidas y ganancias realizadas, netas de comisiones, en el periodo seleccionado.",
  "{amount} vs prior 7d": "{amount} frente a los 7 días anteriores",
  "{count} closed trade · {fees} fees": "{count} operación cerrada · {fees} de comisiones",
  "{count} closed trades · {fees} fees": "{count} operaciones cerradas · {fees} de comisiones",
  "Winning trades divided by all closed trades, including breakevens.":
    "Operaciones ganadoras entre todas las operaciones cerradas, incluidas las que quedan sin ganancia.",
  "Trade win rate": "Porcentaje de acierto por operación",
  "{count} W": "{count} G",
  "{count} BE": "{count} E",
  "{count} L": "{count} P",
  "Gross profit ÷ gross loss. Above 1 means the wins outweigh the losses.":
    "Beneficio bruto ÷ pérdida bruta. Por encima de 1, las ganancias superan a las pérdidas.",
  "gross profit ÷ gross loss": "beneficio bruto ÷ pérdida bruta",
  "Green trading days ÷ all trading days in the selected range.":
    "Días en positivo ÷ todos los días operados en el periodo seleccionado.",
  "Day win rate": "Porcentaje de días ganadores",
  "{count} day": "{count} día",
  "{count} days": "{count} días",
  "Average winning trade ÷ average losing trade. The bar shows the two to scale.":
    "Operación ganadora media ÷ operación perdedora media. La barra muestra las dos a escala.",
  "Average win vs average loss, to scale": "Ganancia media frente a pérdida media, a escala",
  "{win} avg win · {loss} avg loss": "{win} ganancia media · {loss} pérdida media",
  "A 0–100 score combining win rate, profit factor, average win/loss, drawdown, recovery, and consistency. Requires at least five closed trades.":
    "Una puntuación de 0 a 100 que combina el porcentaje de acierto, el factor de beneficio, la ganancia/pérdida media, el drawdown, la recuperación y la consistencia. Necesita al menos cinco operaciones cerradas.",
  "Needs 5+ closed trades. The formula is open: {link}.":
    "Necesita 5 o más operaciones cerradas. La fórmula es abierta: {link}.",
  "read it": "léela",
  "Daily net cumulative P&L": "P&L neto acumulado diario",
  "Running total of net profit and loss over the selected period. The drawdown bars below show declines from the running equity peak.":
    "Total acumulado de pérdidas y ganancias netas en el periodo seleccionado. Las barras de drawdown de abajo muestran las caídas desde el máximo del capital.",
  "Net daily P&L": "P&L neto diario",
  "Net profit or loss for each trading day. Bars above zero are profitable; bars below zero are losses.":
    "Ganancia o pérdida neta de cada día operado. Las barras por encima de cero son ganancias; las de debajo, pérdidas.",
  "Full calendar": "Calendario completo",
  "Recent trades": "Operaciones recientes",
  "Open positions": "Posiciones abiertas",
  "No closed trades yet": "Aún no hay operaciones cerradas",
  "Flat: no open positions": "Sin posición: no hay posiciones abiertas",
  "status|Breakeven": "Sin ganancia",
  "Largest peak-to-trough drop of the cumulative P&L curve.":
    "La mayor caída de máximo a mínimo de la curva de P&L acumulado.",
  "set an initial balance for %": "define un saldo inicial para ver el %",
  "recovery {value}x": "recuperación {value}x",
  "Current run of consecutive wins (W) or losses (L), with the best and worst runs.":
    "Racha actual de operaciones ganadoras (G) o perdedoras (P) seguidas, con la mejor y la peor racha.",
  "{count}W": "{count}G",
  "{count}L": "{count}P",
  "best {best}W · worst {worst}L": "mejor {best}G · peor {worst}P",
  "Average net P&L per closed trade: what one more trade is worth on your numbers.":
    "P&L neto medio por operación cerrada: lo que vale una operación más según tus números.",
  "avg {r}R over {count} risk-tagged trade": "media de {r}R en {count} operación con riesgo",
  "avg {r}R over {count} risk-tagged trades": "media de {r}R en {count} operaciones con riesgo",
  "tag stop-losses to unlock R multiples": "añade stop loss para ver los múltiplos de R",
  "Average time from first entry fill to final exit.":
    "Tiempo medio desde la primera ejecución de entrada hasta la salida final.",
  "winners vs losers in Reports": "ganadoras frente a perdedoras en Informes",
  "Highest and lowest single-day net P&L in the selected range.":
    "El mayor y el menor P&L neto de un solo día en el periodo seleccionado.",
  "Trades grouped by their opening hour. The upper chart shows net P&L; the lower chart shows trade count.":
    "Operaciones agrupadas por su hora de apertura. El gráfico de arriba muestra el P&L neto; el de abajo, el número de operaciones.",
  // Empty journal
  "Your journal is empty": "Tu diario está vacío",
  "Connect a broker for automatic sync, upload a statement from 10+ platforms (including your TradeZella export), or add trades manually.":
    "Conecta un bróker para sincronizar automáticamente, sube un extracto de más de 10 plataformas (incluida tu exportación de TradeZella) o añade operaciones a mano.",
  "Import your first trades": "Importa tus primeras operaciones",
  "Load demo data": "Cargar datos de demostración",
  "Could not load the demo data.": "No se pudieron cargar los datos de demostración.",
  "Demo data lands in its own account; delete it anytime under Accounts.":
    "Los datos de demostración van a su propia cuenta; puedes eliminarlos cuando quieras en Cuentas.",
  // Dashboard layout
  "Saved dashboard preferences could not be read. All cards are shown.":
    "No se pudieron leer las preferencias guardadas del panel. Se muestran todas las tarjetas.",
  "Layout saved": "Diseño guardado",
  "Your layout changed, but could not be saved in this browser.":
    "Tu diseño cambió, pero no se pudo guardar en este navegador.",
  Card: "Tarjeta",
  "{card} moved. Layout saved.": "{card} movida. Diseño guardado.",
  "All cards are shown. Layout saved.": "Se muestran todas las tarjetas. Diseño guardado.",
  "Loading dashboard layout…": "Cargando el diseño del panel…",
  "{name} loaded": "{name} cargado",
  "{name} saved": "{name} guardado",
  "{visible} of {total} cards": "{visible} de {total} tarjetas",
  "Original card order restored. All cards are shown.":
    "Orden original de las tarjetas restablecido. Se muestran todas las tarjetas.",
  "{count} card is hidden in this layout.": "{count} tarjeta está oculta en este diseño.",
  "{count} cards are hidden in this layout.": "{count} tarjetas están ocultas en este diseño.",
  "Show all cards": "Mostrar todas las tarjetas",
  "All cards are hidden. Choose Show all cards to restore them.":
    "Todas las tarjetas están ocultas. Elige Mostrar todas las tarjetas para recuperarlas.",
  "Press Space or Enter to pick up a card. Use the arrow keys to move, then Space or Enter to drop. Press Escape to cancel.":
    "Pulsa Espacio o Intro para coger una tarjeta. Usa las flechas para moverla y luego Espacio o Intro para soltarla. Pulsa Escape para cancelar.",
  "Picked up {card}.": "Has cogido {card}.",
  "{card} is over {target}.": "{card} está sobre {target}.",
  "Outside the cards. Drop here to cancel.": "Fuera de las tarjetas. Suelta aquí para cancelar.",
  "{card} placed at position {position} of {total}.":
    "{card} colocada en la posición {position} de {total}.",
  "Move cancelled.": "Movimiento cancelado.",
  "Move cancelled. Layout unchanged.": "Movimiento cancelado. El diseño no cambia.",
  "Rearrange {card}": "Reordenar {card}",
  "Drag to rearrange {card}": "Arrastra para reordenar {card}",
  "Move card": "Mover tarjeta",
  "Move {card} earlier": "Mover {card} hacia delante",
  "Move {card} later": "Mover {card} hacia atrás",
  // Customize cards
  Customize: "Personalizar",
  "Dashboard cards": "Tarjetas del panel",
  "{count} visible": "{count} visibles",
  "Close customization": "Cerrar personalización",
  "Find dashboard cards": "Buscar tarjetas del panel",
  "Find a card…": "Buscar una tarjeta…",
  "Clear card search": "Borrar búsqueda de tarjetas",
  "Show {card}": "Mostrar {card}",
  "No matching cards": "Ninguna tarjeta coincide",
  "Clear search": "Borrar búsqueda",
  "Restore default layout": "Restablecer el diseño predeterminado",
  "Reset layout": "Restablecer diseño",
  "{count} card found.": "{count} tarjeta encontrada.",
  "{count} cards found.": "{count} tarjetas encontradas.",
  "{visible} of {total} visible.": "{visible} de {total} visibles.",
  // Saved layouts
  "Saved dashboard layouts": "Diseños del panel guardados",
  Layouts: "Diseños",
  "Saved layouts": "Diseños guardados",
  "{count} saved": "{count} guardados",
  "Close saved layouts": "Cerrar diseños guardados",
  "Find a layout": "Buscar un diseño",
  "Find a layout…": "Buscar un diseño…",
  "Load {name}": "Cargar {name}",
  "{count} card": "{count} tarjeta",
  "{count} cards": "{count} tarjetas",
  "{count} card · Current layout": "{count} tarjeta · Diseño actual",
  "{count} cards · Current layout": "{count} tarjetas · Diseño actual",
  "No matching layouts": "Ningún diseño coincide",
  "Make this dashboard yours": "Haz tuyo este panel",
  "Save your favorite card arrangements and switch between them here.":
    "Guarda tus distribuciones de tarjetas favoritas y cambia entre ellas aquí.",
  "Save current layout": "Guardar el diseño actual",
  "Layout name": "Nombre del diseño",
  "e.g. Weekly review": "p. ej. Revisión semanal",
  // Charts
  Hidden: "Oculto",
  "Daily net profit and loss. Exact values and trade links are available in the table below.":
    "Pérdidas y ganancias netas diarias. Los valores exactos y los enlaces a las operaciones están en la tabla de abajo.",
  "5-trading-day average": "Media de 5 días operados",
  "Daily net P&L": "P&L neto diario",
  "Win %": "% de acierto",
  "Avg win/loss": "Ganancia/pérdida media",
  Drawdown: "Drawdown",
  Recovery: "Recuperación",
  Consistency: "Consistencia",
  Score: "Puntuación",
  "Price change from average entry": "Cambio de precio desde la entrada media",
  "Net cash in selected period": "Efectivo neto en el periodo seleccionado",
  "{label}: {value}": "{label}: {value}",
  "no data": "sin datos",
  "Relative drawdown": "Drawdown relativo",
  "Initial balance required": "Hace falta un saldo inicial",
  "Max −{value}": "Máx. −{value}",
  "Set an initial balance to chart relative drawdown.":
    "Define un saldo inicial para ver el drawdown relativo.",
  "Win rate over 20-trade windows. Exact values and links follow below.":
    "Porcentaje de acierto en ventanas de 20 operaciones. Los valores exactos y los enlaces están debajo.",
  "Average net P&L over 20-trade windows. Exact values and links follow below.":
    "P&L neto medio en ventanas de 20 operaciones. Los valores exactos y los enlaces están debajo.",
  "Trade #{number}": "Operación n.º {number}",
  "Trade #{number} · {date}": "Operación n.º {number} · {date}",
  "Last 20 trades": "Últimas 20 operaciones",
  "Net P&L (hidden)": "P&L neto (oculto)",
  "Net P&L ({currency})": "P&L neto ({currency})",
  Trades: "Operaciones",
  "Individual trade outcomes. Select a point to inspect; all trades also have links in the table below.":
    "Resultado de cada operación. Selecciona un punto para inspeccionarla; todas las operaciones tienen también enlace en la tabla de abajo.",
  "Closed {date}": "Cerrada el {date}",
  "{value} minutes": "{value} minutos",
  "{time} entry": "Entrada a las {time}",
  "Estimated {metric}: {value}": "{metric} estimado: {value}",
  "Net P&L: {value}": "P&L neto: {value}",
  "Realized R: {value}": "R realizado: {value}",
  "Select to inspect this trade": "Selecciona para inspeccionar esta operación",
  "Positive net P&L": "P&L neto positivo",
  "Negative net P&L": "P&L neto negativo",
  "Zero net P&L": "P&L neto cero",
};

export default es;
