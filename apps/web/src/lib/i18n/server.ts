/**
 * Spanish for text the server writes: notifications (chart alerts and their plan notes,
 * YouTube summaries, digests, tests) and digest status lines. English source text → Spanish.
 * See lib/i18n.ts.
 */
const es: Record<string, string> = {
  // Chart alerts (lib/alert-messages.ts), in the open chart and from the background watcher
  "Chart alert": "Alerta del gráfico",
  "Zone alert": "Alerta de zona",
  "{symbol} crossed above {label} at {price}": "{symbol} cruzó por encima de {label} en {price}",
  "{symbol} crossed below {label} at {price}": "{symbol} cruzó por debajo de {label} en {price}",
  "{low} to {high}": "{low} a {high}",
  "{symbol} entered the zone {range}": "{symbol} entró en la zona {range}",
  "{symbol} broke above the zone {range}": "{symbol} rompió por encima de la zona {range}",
  "{symbol} broke below the zone {range}": "{symbol} rompió por debajo de la zona {range}",
  // Plan notes under an alert (lib/alert-explain.ts)
  "a scenario": "un escenario",
  "direction|long": "largo",
  "direction|short": "corto",
  "Plan: the trigger of {name}, crossed the other way.":
    "Plan: la activación de {name}, cruzada en sentido contrario.",
  "target {price}": "objetivo {price}",
  "wrong below {price}": "invalidado por debajo de {price}",
  "wrong above {price}": "invalidado por encima de {price}",
  "Plan: sets off {name}, {details}.": "Plan: activa {name}, {details}.",
  "Plan: sets off {name}.": "Plan: activa {name}.",
  "Plan: target of {name} reached.": "Plan: objetivo de {name} alcanzado.",
  "Plan: back through the target of {name}.": "Plan: vuelve a cruzar el objetivo de {name}.",
  "Plan: back past the invalidation of {name}.": "Plan: vuelve a cruzar la invalidación de {name}.",
  "Plan: {name} is invalidated here.": "Plan: {name} queda invalidado aquí.",
  "Testing it as support.": "La está probando como soporte.",
  "Testing it as resistance.": "La está probando como resistencia.",
  "Resistance broken; it may hold as support now.":
    "Resistencia rota; ahora puede aguantar como soporte.",
  "Support broken; it may act as resistance now.":
    "Soporte roto; ahora puede actuar como resistencia.",
  "No scenario at this level.": "No hay ningún escenario en este nivel.",
  "Bias {bias}: this move is with it.": "Sesgo {bias}: este movimiento va a favor.",
  "Bias {bias}: this move is against it.": "Sesgo {bias}: este movimiento va en contra.",
  // YouTube summaries (server/external-analysis/process.ts)
  "New analysis: {channel}": "Nuevo análisis: {channel}",
  "{title}. Bias {bias}; main scenario: {scenario}.":
    "{title}. Sesgo {bias}; escenario principal: {scenario}.",
  "{title}. Bias {bias}.": "{title}. Sesgo {bias}.",
  "bias|long": "alcista",
  "bias|short": "bajista",
  "bias|neutral": "neutral",
  "bias|mixed": "mixto",
  // Test notification
  "Test alert": "Alerta de prueba",
  "Alerts from the journal reach this device.": "Las alertas del diario llegan a este dispositivo.",
  // Scheduled digests (server/ai-digests/run.ts)
  "No closed trades or day note that day.": "Ese día no hay operaciones cerradas ni nota del día.",
  "Session recap · {weekday} {day}": "Resumen de la sesión · {weekday} {day}",
  "Session recap for {day} (scheduled)": "Resumen de la sesión del {day} (programado)",
  "{count} trade reviewed": "{count} operación revisada",
  "{count} trades reviewed": "{count} operaciones revisadas",
  "Your day note reviewed": "Tu nota del día, revisada",
  "No closed trades or day lessons that week.":
    "Esa semana no hay operaciones cerradas ni lecciones del día.",
  "Weekly review · {from} to {to}": "Revisión semanal · {from} a {to}",
  "Weekly review for {from} to {to} (scheduled)":
    "Revisión semanal del {from} al {to} (programada)",
  "AI returned no text.": "La IA no devolvió texto.",
  "{count}. Tap to read it and ask follow-ups.": "{count}. Tócala para leerla y hacer preguntas.",
  "Sent to {count} device or webhook.": "Enviado a {count} dispositivo o webhook.",
  "Sent to {count} devices or webhooks.": "Enviado a {count} dispositivos o webhooks.",
  "Written; its notification was held back ({reason}, see the Alerts page).":
    "Escrito; su notificación se retuvo ({reason}, mira la página de Alertas).",
  "Written, but no browser or webhook is set up to receive it.":
    "Escrito, pero ningún navegador ni webhook está configurado para recibirlo.",
  // Why a notification was not sent (lib/alert-preferences.ts MUTE_REASONS)
  paused: "en pausa",
  "quiet hours": "horas de silencio",
  "turned off": "desactivado",
  "source muted": "fuente silenciada",
  // Language setting
  "Choose English or Spanish.": "Elige inglés o español.",
};

export default es;
