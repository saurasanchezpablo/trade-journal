/** Spanish for beta features, indicator (RSI) alerts and urgent alerts. See lib/i18n.ts. */
const es: Record<string, string> = {
  // Beta features
  "Beta features": "Funciones beta",
  "Switch experimental features on or off.": "Activa o desactiva las funciones experimentales.",
  "Experimental parts of the journal. Switched off, they leave the sidebar, their pages and their background work stop; what they stored is kept for when you switch them on again.":
    "Partes experimentales del diario. Desactivadas, salen de la barra lateral y se detienen sus páginas y su trabajo en segundo plano; lo que guardaron se conserva para cuando vuelvas a activarlas.",
  "The claims in the YouTube videos you follow, checked against what the market did afterwards. Uses AI tokens to read each video.":
    "Las afirmaciones de los vídeos de YouTube que sigues, contrastadas con lo que hizo el mercado después. Usa tokens de IA para leer cada vídeo.",
  "Trading strategies from published research, backtested on Binance's daily history, with signal monitoring and paper trading. No orders are ever placed.":
    "Estrategias de trading de la investigación publicada, probadas con el histórico diario de Binance, con vigilancia de señales y operativa simulada. Nunca se envía ninguna orden.",
  "This is a beta feature and it is off.": "Es una función beta y está desactivada.",
  "Turn it on in Settings, Beta features.": "Actívala en Ajustes, Funciones beta.",
  "Video intelligence is a beta feature that is off. Turn it on in Settings, Beta features.":
    "Inteligencia de vídeo es una función beta desactivada. Actívala en Ajustes, Funciones beta.",
  "Strategy research is a beta feature that is off. Turn it on in Settings, Beta features.":
    "Investigación de estrategias es una función beta desactivada. Actívala en Ajustes, Funciones beta.",
  "Each beta feature needs true or false.": "Cada función beta necesita verdadero o falso.",
  // Indicator alerts
  "Indicator alerts": "Alertas de indicadores",
  "An indicator rule watched in the background, such as RSI crossing 70, fires.":
    "Salta una regla de indicador vigilada en segundo plano, como el RSI cruzando 70.",
  "{count} watched": "{count} vigiladas",
  "RSI alerts the server checks with no page open, computed as TradingView computes ta.rsi. On candle close checks each finished candle (no false alarms); as it happens checks the forming candle (sooner, but the cross can undo itself by the close). Each rule fires at most once per candle.":
    "Alertas de RSI que el servidor comprueba sin ninguna página abierta, calculadas como TradingView calcula ta.rsi. Al cierre de vela comprueba cada vela terminada (sin falsas alarmas); en el momento comprueba la vela en formación (antes, pero el cruce puede deshacerse antes del cierre). Cada regla salta como mucho una vez por vela.",
  "Watch this alert": "Vigilar esta alerta",
  urgent: "urgente",
  "on candle close": "al cierre de vela",
  "as it happens": "en el momento",
  "Waiting for the first check…": "Esperando la primera comprobación…",
  "RSI now {value} (checked {time})": "RSI ahora {value} (comprobado a las {time})",
  "last fired {time}": "saltó por última vez el {time}",
  "RSI length": "Longitud del RSI",
  Condition: "Condición",
  Check: "Comprobar",
  "Note (optional)": "Nota (opcional)",
  "Urgent (repeat until acknowledged)": "Urgente (repetir hasta confirmar)",
  "Add alert": "Añadir alerta",
  "crosses above": "cruza por encima de",
  "crosses below": "cruza por debajo de",
  crosses: "cruza",
  "Overbought: crosses above 70": "Sobrecompra: cruza por encima de 70",
  "Oversold: crosses below 30": "Sobreventa: cruza por debajo de 30",
  "Not enough candles yet for this RSI.": "Aún no hay velas suficientes para este RSI.",
  "{symbol} {timeframe}: RSI({length}) crossed {direction} {level}":
    "{symbol} {timeframe}: el RSI({length}) cruzó {direction} {level}",
  "RSI {value} (was {previous}) {when}.": "RSI {value} (era {previous}) {when}.",
  "at the candle's close": "al cierre de la vela",
  "on the forming candle": "en la vela en formación",
  "Price {price}.": "Precio {price}.",
  "Invalid indicator alert.": "Alerta de indicador no válida.",
  "Choose a market data source.": "Elige una fuente de datos de mercado.",
  "Enter a symbol.": "Escribe un símbolo.",
  "Choose a timeframe.": "Elige una temporalidad.",
  "Only RSI alerts are available.": "Solo hay alertas de RSI.",
  "The RSI length must be a whole number from 2 to 200.":
    "La longitud del RSI debe ser un número entero de 2 a 200.",
  "Choose crosses above, crosses below or crosses.":
    "Elige cruza por encima, cruza por debajo o cruza.",
  "The RSI level must be between 0 and 100.": "El nivel del RSI debe estar entre 0 y 100.",
  "Choose on candle close or as it happens.": "Elige al cierre de vela o en el momento.",
  "The note is at most 300 characters.": "La nota tiene como mucho 300 caracteres.",
  "At most 50 indicator alerts. Delete one first.":
    "Como mucho 50 alertas de indicadores. Borra una primero.",
  // Urgent alerts
  Urgent: "Urgente",
  "until seen": "hasta verla",
  "Urgent alerts": "Alertas urgentes",
  "Hard to miss: sent to the webhook at the highest priority (ntfy: long vibration, shown over other apps), kept on screen in browsers until dismissed, sounded as an alarm on every open journal page, and sent again until you acknowledge them (open the notification, or press Acknowledge).":
    "Difíciles de pasar por alto: se envían al webhook con la máxima prioridad (ntfy: vibración larga, sobre las demás apps), se quedan en pantalla en los navegadores hasta que las cierras, suenan como alarma en cada página abierta del diario y se reenvían hasta que las confirmas (abre la notificación o pulsa Confirmar).",
  "Repeat every": "Repetir cada",
  "Maximum repeats": "Repeticiones máximas",
  times: "veces",
  "Send an urgent test": "Enviar una prueba urgente",
  "Urgent test sent to {count} destinations. Acknowledge it to stop it.":
    "Prueba urgente enviada a {count} destinos. Confírmala para detenerla.",
  "Urgent test alert": "Alerta urgente de prueba",
  "Urgent alerts look like this. Open it or acknowledge it to stop the reminders.":
    "Así llegan las alertas urgentes. Ábrela o confírmala para detener los recordatorios.",
  "Reminder {n}: {title}": "Recordatorio {n}: {title}",
  Acknowledge: "Confirmar",
  "Acknowledge all": "Confirmar todas",
  "Sound on": "Activar sonido",
  "Sound off on this page": "Silenciar en esta página",
  "Click anywhere on the page to let the alarm sound.":
    "Haz clic en cualquier parte de la página para que pueda sonar la alarma.",
  "sent {n} times": "enviada {n} veces",
  "Urgent must be true or false.": "Urgente debe ser verdadero o falso.",
  "Urgent alerts repeat every 1, 2, 5, 10, 15 minutes.":
    "Las alertas urgentes se repiten cada 1, 2, 5, 10 o 15 minutos.",
  "Urgent alerts repeat at most 30 times.": "Las alertas urgentes se repiten como mucho 30 veces.",
};

export default es;
