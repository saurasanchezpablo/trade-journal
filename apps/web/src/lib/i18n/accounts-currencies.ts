/**
 * Spanish for the account creation form, account currencies and currency conversion, the AI statement parsing options, the trade rating and navigation, the calendar day preview, timezone and contract multiplier settings, and dashboard layout presets. English source text → Spanish. See lib/i18n.ts.
 */
const es: Record<string, string> = {
  // Account creation form
  "Account type": "Tipo de cuenta",
  "Manual trades": "Operaciones manuales",
  "File import": "Importación de archivos",

  // AI statement parsing options
  "Parse with AI": "Leer con IA",
  "AI statement parsing": "Lectura de extractos con IA",
  "AI parsing settings": "Ajustes de la lectura con IA",
  "Close AI parsing settings": "Cerrar los ajustes de la lectura con IA",
  "AI provider": "Proveedor de IA",
  "Leave blank to use your configured key": "Déjalo en blanco para usar tu clave configurada",
  "Enter your API key": "Introduce tu clave de API",
  "Keys entered here are used for this upload session only.":
    "Las claves que introduzcas aquí solo se usan en esta sesión de subida.",
  "Manage saved keys in {link}.": "Gestiona las claves guardadas en {link}.",
  "Your file will be sent to {provider} when you select {action}.":
    "Tu archivo se enviará a {provider} cuando selecciones {action}.",
  "Preview with AI": "Vista previa con IA",
  "Provider charges apply. Review the extracted trades before importing.":
    "Se aplican los cargos del proveedor. Revisa las operaciones extraídas antes de importar.",
  "CSV, TSV, HTML, XML, TXT and PDF · Up to 200 executions per preview. PDFs up to 8 MB; text exports up to 150,000 characters. For spreadsheets, export as CSV first. PDF support depends on your selected model.":
    "CSV, TSV, HTML, XML, TXT y PDF · Hasta 200 ejecuciones por vista previa. PDF de hasta 8 MB; exportaciones de texto de hasta 150.000 caracteres. Para hojas de cálculo, exporta primero a CSV. La compatibilidad con PDF depende del modelo seleccionado.",

  // Calendar day preview
  "Running net P&L across {count} closed trade":
    "P&L neto acumulado a lo largo de {count} operación cerrada",
  "Running net P&L across {count} closed trades":
    "P&L neto acumulado a lo largo de {count} operaciones cerradas",
  "Before first close": "Antes del primer cierre",
  "After last close": "Después del último cierre",
  "{count} closed trade · Net of fees": "{count} operación cerrada · Neto de comisiones",
  "{count} closed trades · Net of fees": "{count} operaciones cerradas · Neto de comisiones",
  "Select accounts with one currency to view the running P&L.":
    "Selecciona cuentas con una sola divisa para ver el P&L acumulado.",
  "No closed trades on this day.": "No hay operaciones cerradas este día.",

  // Currency notice (dashboard and calendar)
  "Trading P&L in {currency} · saved baseline conversion rates.":
    "P&L de trading en {currency} · tipos de cambio de referencia guardados.",
  "Edit rates": "Editar tipos de cambio",
  "Set up conversion to see your combined dashboard":
    "Configura la conversión para ver tu panel combinado",
  "Save conversion rates for {currencies} to use the reporting currency. Amounts below remain in their original currencies.":
    "Guarda tipos de cambio para {currencies} para usar la divisa de informe. Los importes de abajo se mantienen en sus divisas originales.",
  "These accounts use {currencies}. Set your conversion rates to combine their performance.":
    "Estas cuentas usan {currencies}. Configura tus tipos de cambio para combinar su rendimiento.",
  "Set up currency conversion": "Configurar la conversión de divisas",

  // Currency conversion settings
  "Currency conversion": "Conversión de divisas",
  "Combine accounts using your own saved exchange rates. Works entirely offline.":
    "Combina cuentas con tus propios tipos de cambio guardados. Funciona totalmente sin conexión.",
  "Convert dashboard and calendar to the reporting currency":
    "Convertir el panel y el calendario a la divisa de informe",
  "Reporting currency": "Divisa de informe",
  "Changing the reporting currency clears the draft rates. Enter new rates before saving.":
    "Al cambiar la divisa de informe se borran los tipos de cambio en borrador. Introduce los nuevos antes de guardar.",
  "Reporting-currency units per 1 {code}": "Unidades de la divisa de informe por 1 {code}",
  "These are fixed baseline rates, not live market rates. Changing saved rates recalculates all dashboard and calendar history, including starting balances and drawdown. Original account records, trade details and reports keep their account currencies.":
    "Son tipos de cambio de referencia fijos, no tipos de mercado en tiempo real. Al cambiar los tipos guardados se recalcula todo el historial del panel y del calendario, incluidos los saldos iniciales y el drawdown. Los registros originales de las cuentas, los detalles de las operaciones y los informes mantienen la divisa de su cuenta.",
  "Save conversion settings": "Guardar los ajustes de conversión",
  "Conversion settings saved. Dashboard and calendar figures now use these settings.":
    "Ajustes de conversión guardados. Las cifras del panel y del calendario ya usan estos ajustes.",
  "Enter a rate for {currencies} before enabling conversion.":
    "Introduce un tipo de cambio para {currencies} antes de activar la conversión.",
  "Could not save conversion rates.": "No se pudieron guardar los tipos de cambio.",

  // Timezone settings
  "Use this device's timezone ({timeZone})":
    "Usar la zona horaria de este dispositivo ({timeZone})",
  "Used for timestamps without an offset in file imports and IBKR broker sync. You can override it for each file. Existing trades are not changed; correcting an IBKR account's timezone requires a separate account for recovery.":
    "Se usa para las marcas de tiempo sin desfase en las importaciones de archivos y en la sincronización con el bróker IBKR. Puedes cambiarla para cada archivo. Las operaciones existentes no cambian; corregir la zona horaria de una cuenta de IBKR requiere una cuenta aparte para la recuperación.",
  "Save timezones": "Guardar zonas horarias",
  "Timezones saved.": "Zonas horarias guardadas.",

  // Contract multiplier settings
  "Contract multipliers": "Multiplicadores de contrato",
  "Futures/options: one per line, SYMBOL=multiplier":
    "Futuros/opciones: uno por línea, SÍMBOLO=multiplicador",
  "Use the exact symbol shown on your imported trades, including the contract month when present.":
    "Usa el símbolo exacto que aparece en tus operaciones importadas, incluido el mes del contrato si lo tiene.",
  "Check line {line}: enter a unique symbol and a positive multiplier, such as ESU6=50.":
    "Revisa la línea {line}: introduce un símbolo único y un multiplicador positivo, como ESU6=50.",
  "Save multipliers": "Guardar multiplicadores",
  "Contract multipliers saved.": "Multiplicadores de contrato guardados.",

  // Trade navigation
  "Trade navigation": "Navegación entre operaciones",
  "Back to trades": "Volver a operaciones",
  "Trade navigation scope": "Alcance de la navegación entre operaciones",
  "Filtered trades": "Operaciones filtradas",
  "All trades": "Todas las operaciones",
  "Same account": "Misma cuenta",
  "Retry navigation": "Reintentar la navegación",
  "Outside current filters": "Fuera de los filtros actuales",
  "{position} of {total} · By entry time": "{position} de {total} · Por hora de entrada",
  "Previous trade": "Operación anterior",
  "Next trade": "Operación siguiente",

  // Trade rating
  "Trade rating": "Valoración de la operación",
  "Rating was not saved. Try again.": "La valoración no se guardó. Inténtalo de nuevo.",

  // Dashboard layout presets
  "All cards in the original order.": "Todas las tarjetas en el orden original.",
  "Trading day": "Día de trading",
  "Calendar and recent trades first, then daily results.":
    "Primero el calendario y las operaciones recientes, después los resultados diarios.",
  Performance: "Rendimiento",
  "Returns, win rate, equity, and your trading edge.":
    "Rentabilidad, porcentaje de acierto, capital y tu ventaja como trader.",
  "Risk review": "Revisión del riesgo",
  "Drawdown, streaks, expectancy, and daily swings.":
    "Drawdown, rachas, esperanza y oscilaciones diarias.",
};

export default es;
