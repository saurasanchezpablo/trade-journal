/** Spanish for the shell-settings area: English source text → Spanish. See lib/i18n.ts. */
const es: Record<string, string> = {
  // Settings page
  "Fix this multiplier line before saving (use SYMBOL=number, for example ES=50): {lines}":
    "Corrige esta línea de multiplicador antes de guardar (usa SÍMBOLO=número, por ejemplo ES=50): {lines}",
  "Fix these multiplier lines before saving (use SYMBOL=number, for example ES=50): {lines}":
    "Corrige estas líneas de multiplicador antes de guardar (usa SÍMBOLO=número, por ejemplo ES=50): {lines}",
  "Save failed": "No se pudo guardar",
  "Save failed.": "No se pudo guardar.",
  Journal: "Diario",
  "Display timezone (IANA)": "Zona horaria de visualización (IANA)",
  "Display timezone": "Zona horaria de visualización",
  "Trade times, calendars, journal days, and analytics use this timezone.":
    "Las horas de las operaciones, los calendarios, los días del diario y los análisis usan esta zona horaria.",
  "Use this device's timezone ({zone})": "Usar la zona horaria de este dispositivo ({zone})",
  "Default import timezone (IANA)": "Zona horaria de importación predeterminada (IANA)",
  "Default import timezone": "Zona horaria de importación predeterminada",
  "Use your broker statement's timezone for timestamps without an offset. You can override it for each file. Changing this setting affects future imports only.":
    "Usa la zona horaria del extracto de tu bróker para las marcas de tiempo sin desfase. Puedes cambiarla en cada archivo. Este ajuste solo afecta a las importaciones futuras.",
  "Contract multipliers (futures/options), one per line as SYMBOL=multiplier":
    "Multiplicadores de contrato (futuros/opciones), uno por línea como SÍMBOLO=multiplicador",
  "Saving multipliers recalculates existing trade P&L from fills and preserves annotations.":
    "Al guardar los multiplicadores se recalcula el P&L de las operaciones existentes a partir de las ejecuciones y se conservan las anotaciones.",
  "Saved ✓": "Guardado ✓",
  Save: "Guardar",
  "Your data": "Tus datos",
  "Full backup (JSON)": "Copia de seguridad completa (JSON)",
  "Trades (CSV)": "Operaciones (CSV)",
  // Settings API messages
  "Enter valid settings.": "Introduce ajustes válidos.",
  "Choose Anthropic, OpenAI or Google Gemini.": "Elige Anthropic, OpenAI o Google Gemini.",
  "Enter a valid model ID.": "Introduce un ID de modelo válido.",
  "Enter a valid IANA display timezone.":
    "Introduce una zona horaria de visualización IANA válida.",
  "Enter a valid IANA import timezone.": "Introduce una zona horaria de importación IANA válida.",
  "Contract multipliers must be positive numbers.":
    "Los multiplicadores de contrato deben ser números positivos.",
  // Loading
  "Loading page": "Cargando página",
  "Loading page…": "Cargando página…",
  // Accounts page
  "Sync finished with {inserted} new fills. {skipped} broker record(s) were skipped: {reasons}":
    "Sincronización terminada con {inserted} ejecuciones nuevas. Se omitieron {skipped} registros del bróker: {reasons}",
  "Sync failed": "La sincronización falló",
  "Could not load your accounts: {error}": "No se pudieron cargar tus cuentas: {error}",
  "Try again": "Intentar de nuevo",
  "Loading accounts…": "Cargando cuentas…",
  "No accounts yet. Create one on the Import page.":
    "Aún no hay cuentas. Crea una en la página Importar.",
  "account kind|sync": "sincronizada",
  "account kind|import": "importada",
  "account kind|manual": "manual",
  "Sync now": "Sincronizar ahora",
  Unarchive: "Desarchivar",
  Archive: "Archivar",
  "Delete account": "Eliminar cuenta",
  'Delete "{name}" and ALL its trades? This cannot be undone.':
    "¿Eliminar «{name}» y TODAS sus operaciones? No se puede deshacer.",
  "Could not update the account.": "No se pudo actualizar la cuenta.",
  "Could not delete the account.": "No se pudo eliminar la cuenta.",
  "Broker equity:": "Capital en el bróker:",
  "{count} open positions · synced {when}": "{count} posiciones abiertas · sincronizada {when}",
  never: "nunca",
  "Initial balance (anchors drawdown %)": "Saldo inicial (base del % de drawdown)",
  "Enter a number with a dot for decimals, like 101.5.":
    "Introduce un número con punto para los decimales, como 101.5.",
  "Could not save the balance.": "No se pudo guardar el saldo.",
  "Profit calculation": "Cálculo del beneficio",
  "Could not change the profit calculation.": "No se pudo cambiar el cálculo del beneficio.",
  "Weighted average": "Media ponderada",
  'Clear ALL trades from "{name}"? The account stays.':
    "¿Borrar TODAS las operaciones de «{name}»? La cuenta se mantiene.",
  "Could not clear the account.": "No se pudo vaciar la cuenta.",
  "Clear trades": "Borrar operaciones",
  "No other account to transfer into.": "No hay otra cuenta a la que transferir.",
  "Transfer all data into which account?\n{list}\n\nEnter a number:":
    "¿A qué cuenta quieres transferir todos los datos?\n{list}\n\nEscribe un número:",
  "Enter one of the listed numbers.": "Escribe uno de los números de la lista.",
  "Could not transfer the data.": "No se pudieron transferir los datos.",
  "Transfer data": "Transferir datos",
  // Accounts API messages
  "Account not found": "Cuenta no encontrada",
  "Destination account not found": "Cuenta de destino no encontrada",
  "Enter valid account details.": "Introduce datos de cuenta válidos.",
  "Enter valid account settings.": "Introduce ajustes de cuenta válidos.",
  "Broker connection failed": "La conexión con el bróker falló",
  "Unknown action": "Acción desconocida",
  // Login
  "Single sign-on is not configured correctly. The server log says what to fix.":
    "El inicio de sesión único no está bien configurado. El registro del servidor indica qué corregir.",
  "The sign-in provider could not be reached. Try again in a moment.":
    "No se pudo contactar con el proveedor de inicio de sesión. Inténtalo de nuevo en un momento.",
  "The sign-in provider did not sign you in.":
    "El proveedor de inicio de sesión no te dejó entrar.",
  "That sign-in expired or was already used. Start again.":
    "Ese inicio de sesión caducó o ya se usó. Empieza de nuevo.",
  "The sign-in provider's answer could not be verified. The server log has details.":
    "No se pudo verificar la respuesta del proveedor de inicio de sesión. El registro del servidor tiene los detalles.",
  "Your account is not allowed into this journal.": "Tu cuenta no tiene acceso a este diario.",
  "Sign-in failed. Try again.": "No se pudo iniciar sesión. Inténtalo de nuevo.",
  "Could not reach the journal. Try again.":
    "No se pudo contactar con el diario. Inténtalo de nuevo.",
  "Signed out.": "Sesión cerrada.",
  "Sign in with {provider}": "Iniciar sesión con {provider}",
  "Single sign-on": "inicio de sesión único",
  or: "o",
  Password: "Contraseña",
  "Unlocking…": "Desbloqueando…",
  Unlock: "Desbloquear",
  "Password sign-in is not enabled; use single sign-on.":
    "El inicio de sesión con contraseña no está activado; usa el inicio de sesión único.",
  "Too many wrong passwords. Wait a few minutes and try again.":
    "Demasiadas contraseñas incorrectas. Espera unos minutos e inténtalo de nuevo.",
  "Wrong password": "Contraseña incorrecta",
  // Import page
  "Import trades": "Importar operaciones",
  "File upload": "Subir archivo",
  "Broker sync": "Sincronizar bróker",
  Manual: "Manual",
  "Add executions manually": "Añadir ejecuciones a mano",
  "Import preview failed": "La vista previa de la importación falló",
  "{count} invalid rows were skipped: {warning}":
    "Se omitieron {count} filas no válidas: {warning}",
  "Imported {inserted} executions ({duplicates} duplicates skipped, {corrected} fee corrections).":
    "Se importaron {inserted} ejecuciones ({duplicates} duplicadas omitidas, {corrected} correcciones de comisiones).",
  "Import failed": "La importación falló",
  "Suggested by AI: check each column, then preview.":
    "Sugerido por la IA: revisa cada columna y después genera la vista previa.",
  "Not found: {fields}.": "No encontrado: {fields}.",
  "No suggestion": "Sin sugerencia",
  "Upload a statement or export": "Sube un extracto o una exportación",
  "Statement timezone (IANA)": "Zona horaria del extracto (IANA)",
  "Statement timezone": "Zona horaria del extracto",
  "Choose the timezone used by your broker's statement. Timestamps with an explicit offset keep that offset. Your journal displays times in {zone}.":
    "Elige la zona horaria que usa el extracto de tu bróker. Las marcas de tiempo con un desfase explícito lo conservan. Tu diario muestra las horas en {zone}.",
  "Enter a valid IANA timezone, such as Europe/Helsinki.":
    "Introduce una zona horaria IANA válida, como Europe/Madrid.",
  "Drop or choose a CSV / HTML statement": "Suelta o elige un extracto CSV / HTML",
  "Auto-detected: {formats}. Anything else goes to column mapping.":
    "Se detectan automáticamente: {formats}. Cualquier otro pasa a la asignación de columnas.",
  "Reading…": "Leyendo…",
  "Preview file": "Vista previa del archivo",
  Symbol: "Símbolo",
  Preview: "Vista previa",
  "Format not recognized. Map your columns (nothing is guessed silently):":
    "Formato no reconocido. Asigna tus columnas (nada se adivina sin avisar):",
  "mapping field|symbol": "símbolo",
  "mapping field|side": "sentido",
  "mapping field|quantity": "cantidad",
  "mapping field|price": "precio",
  "mapping field|fee": "comisión",
  "mapping field|timestamp": "fecha y hora",
  "{field} (optional)": "{field} (opcional)",
  column: "columna",
  "Sends the header row and the first five rows to your AI provider":
    "Envía la fila de cabecera y las cinco primeras filas a tu proveedor de IA",
  "Suggest with AI": "Sugerir con IA",
  "Preview with mapping": "Vista previa con la asignación",
  "Suggest with AI sends the header row and the first five rows to your AI provider.":
    "Sugerir con IA envía la fila de cabecera y las cinco primeras filas a tu proveedor de IA.",
  "{count} execution": "{count} ejecución",
  "{count} executions": "{count} ejecuciones",
  "{count} symbol": "{count} símbolo",
  "{count} symbols": "{count} símbolos",
  "{count} row skipped": "{count} fila omitida",
  "{count} rows skipped": "{count} filas omitidas",
  "Statement timezone: {zone}. Preview times: {display}.":
    "Zona horaria del extracto: {zone}. Horas de la vista previa: {display}.",
  "Showing the first 5 executions.": "Se muestran las 5 primeras ejecuciones.",
  "Recovering an older NinjaTrader import or correcting its timezone? Import the complete history into a new journal account, then compare totals. Keep the original account and its reviews until you have verified the recovery.":
    "¿Recuperas una importación antigua de NinjaTrader o corriges su zona horaria? Importa el historial completo en una cuenta nueva del diario y compara los totales. Conserva la cuenta original y sus revisiones hasta que hayas verificado la recuperación.",
  "Correcting a previous import? Remove the affected trades before importing again with a different timezone to avoid duplicates. Back up your data first.":
    "¿Corriges una importación anterior? Elimina las operaciones afectadas antes de volver a importar con otra zona horaria para evitar duplicados. Haz antes una copia de seguridad de tus datos.",
  "Importing…": "Importando…",
  Import: "Importar",
  "Connection failed": "La conexión falló",
  "Connect a broker (read-only keys, stored encrypted on YOUR machine)":
    "Conecta un bróker (claves de solo lectura, guardadas cifradas en TU equipo)",
  "Broker / exchange": "Bróker / exchange",
  "Choose a broker": "Elige un bróker",
  "Account name": "Nombre de la cuenta",
  "Connecting…": "Conectando…",
  "Connect & sync": "Conectar y sincronizar",
  "API key": "Clave de API",
  "API secret": "Secreto de API",
  "API secret key": "Clave secreta de API",
  "API key ID": "ID de clave de API",
  "API passphrase": "Frase de contraseña de API",
  "API access token": "Token de acceso de API",
  "API refresh token": "Token de actualización de API",
  "Private key": "Clave privada",
  // Import API messages
  "content is required": "Falta el contenido",
  "accountId is required to commit": "Elige una cuenta para importar",
  "mode must be preview or commit": "El modo debe ser preview o commit",
  "No executions to import": "No hay ejecuciones que importar",
  "Enter a valid IANA statement timezone.": "Introduce una zona horaria IANA del extracto válida.",
  "The file has no header row to map.": "El archivo no tiene fila de cabecera que asignar.",
  "Invalid symbol": "Símbolo no válido",
  "Invalid filename": "Nombre de archivo no válido",
  "name and kind are required": "Faltan el nombre y el tipo",
  // Account picker
  "Account creation failed.": "No se pudo crear la cuenta.",
  "Into account": "En la cuenta",
  "Choose an account": "Elige una cuenta",
  "Cancel new account": "Cancelar cuenta nueva",
  "New account": "Cuenta nueva",
  "Create account": "Crear cuenta",
  "Trading test account": "Cuenta de prueba",
  Currency: "Divisa",
  "Starting balance": "Saldo inicial",
  "Creating…": "Creando…",
  // Account selector
  "{count} accounts": "{count} cuentas",
  "Selected account": "Cuenta seleccionada",
  "All accounts": "Todas las cuentas",
  "Could not load demo data.": "No se pudieron cargar los datos de demostración.",
  "Select account": "Seleccionar cuenta",
  "Loading demo…": "Cargando demo…",
  "{name} (archived)": "{name} (archivada)",
  "Load demo data": "Cargar datos de demostración",
  "{count} account": "{count} cuenta",
  // AI settings
  "{name} key removed.": "Clave de {name} eliminada.",
  "{name} settings saved.": "Ajustes de {name} guardados.",
  "Couldn’t save AI settings.": "No se pudieron guardar los ajustes de IA.",
  "AI (bring your own key)": "IA (usa tu propia clave)",
  "Use Anthropic, OpenAI or Google Gemini for recaps, trade critiques, and “ask your journal”. Your key is encrypted at rest. AI requests go from your server directly to the provider you select.":
    "Usa Anthropic, OpenAI o Google Gemini para resúmenes, críticas de operaciones y “pregunta a tu diario”. Tu clave se guarda cifrada. Las peticiones de IA van desde tu servidor directamente al proveedor que elijas.",
  "Active provider: {provider} · {status}": "Proveedor activo: {provider} · {status}",
  "Key configured": "Clave configurada",
  "Not configured": "Sin configurar",
  Provider: "Proveedor",
  "Model ID": "ID del modelo",
  "Use a text model available to your provider account. Each provider keeps its own model and key.":
    "Usa un modelo de texto disponible en tu cuenta del proveedor. Cada proveedor guarda su propio modelo y su clave.",
  "On Gemini's free tier, Google may use what you send (your trades and notes) to improve its products, and people may review it; a key from a Cloud project with billing enabled keeps it out.":
    "En el nivel gratuito de Gemini, Google puede usar lo que envías (tus operaciones y notas) para mejorar sus productos, y hay personas que pueden revisarlo; una clave de un proyecto de Cloud con la facturación activada lo evita.",
  "{name} API key": "Clave de API de {name}",
  "Using {variable} from the server environment. Change or remove that variable on the server to update the key.":
    "Se usa {variable} del entorno del servidor. Cambia o quita esa variable en el servidor para actualizar la clave.",
  "Leave blank to keep your saved key, or enter a replacement.":
    "Déjalo en blanco para conservar la clave guardada, o escribe una nueva.",
  "Add your API key, then save to use this provider.":
    "Añade tu clave de API y guarda para usar este proveedor.",
  "Saving…": "Guardando…",
  "Save AI settings": "Guardar ajustes de IA",
  "Remove {name} key": "Quitar la clave de {name}",
  "Enter a valid Anthropic API key.": "Introduce una clave de API de Anthropic válida.",
  "Enter a valid OpenAI API key.": "Introduce una clave de API de OpenAI válida.",
  "Enter a valid Google Gemini API key.": "Introduce una clave de API de Google Gemini válida.",
  "Anthropic uses an environment key. Update or remove it on the server.":
    "Anthropic usa una clave del entorno. Actualízala o quítala en el servidor.",
  "OpenAI uses an environment key. Update or remove it on the server.":
    "OpenAI usa una clave del entorno. Actualízala o quítala en el servidor.",
  "Google Gemini uses an environment key. Update or remove it on the server.":
    "Google Gemini usa una clave del entorno. Actualízala o quítala en el servidor.",
  // Filter bar
  "range|All": "Todo",
  "range|YTD": "Año",
  "Filter by dates, symbols, strategy, outcome, and more. All selected conditions must match.":
    "Filtra por fechas, símbolos, estrategia, resultado y más. Deben cumplirse todas las condiciones elegidas.",
  Filters: "Filtros",
  "Filters · {count}": "Filtros · {count}",
  "Filter your journal": "Filtra tu diario",
  "Times use {zone}. Dates use the closing day, or opening day for open trades. All selected conditions must match.":
    "Las horas usan {zone}. Las fechas usan el día de cierre, o el de apertura en las operaciones abiertas. Deben cumplirse todas las condiciones elegidas.",
  "Clear filters": "Borrar filtros",
  "Apply filters": "Aplicar filtros",
  // Filter fields
  "About {label}": "Acerca de {label}",
  From: "Desde",
  To: "Hasta",
  Strategy: "Estrategia",
  "Symbols (comma-separated)": "Símbolos (separados por comas)",
  "Exclude symbols": "Excluir símbolos",
  "Required tags (comma-separated)": "Etiquetas obligatorias (separadas por comas)",
  "Required mistakes": "Errores obligatorios",
  Direction: "Dirección",
  Outcome: "Resultado",
  "Review status": "Estado de revisión",
  "Asset class": "Tipo de activo",
  "First included date. Closed trades use their closing day; open trades use their opening day.":
    "Primera fecha incluida. Las operaciones cerradas usan su día de cierre; las abiertas, su día de apertura.",
  "Last included date. Dates follow the journal time zone.":
    "Última fecha incluida. Las fechas siguen la zona horaria del diario.",
  "Include trades assigned to this playbook. All includes trades without a playbook.":
    "Incluye las operaciones asignadas a este playbook. Todo incluye también las operaciones sin playbook.",
  "Include these symbols. Separate multiple symbols with commas, for example AAPL, NVDA.":
    "Incluye estos símbolos. Separa varios símbolos con comas, por ejemplo AAPL, NVDA.",
  "Hide these symbols from the results. Separate multiple symbols with commas.":
    "Oculta estos símbolos de los resultados. Separa varios símbolos con comas.",
  "Filter by tags recorded on your trades. Separate multiple tags with commas.":
    "Filtra por las etiquetas de tus operaciones. Separa varias etiquetas con comas.",
  "Filter by recorded trading mistakes. Separate multiple mistakes with commas.":
    "Filtra por los errores de trading registrados. Separa varios errores con comas.",
  "Find trades you have marked reviewed, or those still awaiting review.":
    "Encuentra las operaciones que marcaste como revisadas, o las que aún esperan revisión.",
  "Trade profit or loss expressed as a multiple of the trade's initial risk.":
    "Beneficio o pérdida de la operación expresado como múltiplo de su riesgo inicial.",
  "The planned reward relative to the trade's initial risk.":
    "La recompensa prevista en relación con el riesgo inicial de la operación.",
  "Time between opening and closing a trade, measured in minutes.":
    "Tiempo entre la apertura y el cierre de una operación, en minutos.",
  All: "Todo",
  Long: "Largo",
  Short: "Corto",
  "All closed": "Todas las cerradas",
  "status|Open": "Abierta",
  "status|Win": "Ganadora",
  "status|Loss": "Perdedora",
  Breakeven: "Sin ganancia",
  Reviewed: "Revisada",
  Unreviewed: "Sin revisar",
  "asset class|equity": "acciones",
  "asset class|futures": "futuros",
  "asset class|forex": "forex",
  "asset class|option": "opciones",
  "asset class|crypto": "cripto",
  "asset class|cfd": "CFD",
  "asset class|other": "otro",
  "Accounts · none selected means all": "Cuentas · ninguna seleccionada equivale a todas",
  "Size, price, risk and time": "Tamaño, precio, riesgo y tiempo",
  "Total entry quantity · min": "Cantidad total de entrada · mín",
  "Total entry quantity · max": "Cantidad total de entrada · máx",
  "Entry price · min": "Precio de entrada · mín",
  "Entry price · max": "Precio de entrada · máx",
  "Exit price · min": "Precio de salida · mín",
  "Exit price · max": "Precio de salida · máx",
  "Minutes held · min": "Minutos abierta · mín",
  "Minutes held · max": "Minutos abierta · máx",
  "Realized R · min": "R realizado · mín",
  "Realized R · max": "R realizado · máx",
  "Planned R · min": "R previsto · mín",
  "Planned R · max": "R previsto · máx",
  "Net P&L · min": "P&L neto · mín",
  "Net P&L · max": "P&L neto · máx",
  "Rating · min": "Valoración · mín",
  "Rating · max": "Valoración · máx",
  "Entry after": "Entrada después de",
  "Entry before": "Entrada antes de",
  "Exit after": "Salida después de",
  "Exit before": "Salida antes de",
  "weekday|Sun": "Dom",
  "weekday|Mon": "Lun",
  "weekday|Tue": "Mar",
  "weekday|Wed": "Mié",
  "weekday|Thu": "Jue",
  "weekday|Fri": "Vie",
  "weekday|Sat": "Sáb",
  // Import reconciliation
  "Review NinjaTrader import": "Revisa la importación de NinjaTrader",
  "Keep each source account separate inside your selected journal account. Review the result before saving.":
    "Mantén separada cada cuenta de origen dentro de la cuenta del diario elegida. Revisa el resultado antes de guardar.",
  "Source mapping for {source}": "Asignación de origen para {source}",
  "Choose the source this file belongs to": "Elige el origen al que pertenece este archivo",
  "Create a separate source account": "Crear una cuenta de origen aparte",
  "If an account or connection was renamed, select its existing source. Choose a new source only for a genuinely different account.":
    "Si se cambió el nombre de una cuenta o conexión, elige su origen existente. Elige un origen nuevo solo para una cuenta realmente distinta.",
  "{count} new fill": "{count} ejecución nueva",
  "{count} new fills": "{count} ejecuciones nuevas",
  "{count} duplicate fill": "{count} ejecución duplicada",
  "{count} duplicate fills": "{count} ejecuciones duplicadas",
  "{count} fee correction": "{count} corrección de comisiones",
  "{count} fee corrections": "{count} correcciones de comisiones",
  "{symbol} multiplier: missing, set it in Settings":
    "Multiplicador de {symbol}: falta, configúralo en Ajustes",
  "{symbol} multiplier: {value}": "Multiplicador de {symbol}: {value}",
  "Open Settings, then review again": "Abre Ajustes y vuelve a revisar",
  "Destination account after import ({currency})":
    "Cuenta de destino después de la importación ({currency})",
  "{count} closed trade": "{count} operación cerrada",
  "{count} closed trades": "{count} operaciones cerradas",
  "{count} open trade": "{count} operación abierta",
  "{count} open trades": "{count} operaciones abiertas",
  "Closed-trade net P&L:": "P&L neto de las operaciones cerradas:",
  "Fees:": "Comisiones:",
  "This export includes every execution for each listed source contract between its first and last timestamp. It is not a partial selection of repeated fills.":
    "Esta exportación incluye todas las ejecuciones de cada contrato de origen listado entre su primera y su última marca de tiempo. No es una selección parcial de ejecuciones repetidas.",
  commission: "comisión",
  "Plus {count} more fee correction.": "Y {count} corrección de comisiones más.",
  "Plus {count} more fee corrections.": "Y {count} correcciones de comisiones más.",
  "Apply these commission corrections to the existing executions and recalculate P&L.":
    "Aplicar estas correcciones de comisiones a las ejecuciones existentes y recalcular el P&L.",
  "Reviewing…": "Revisando…",
  "Review import": "Revisar importación",
  "Review complete. Import will save this result; if the file, settings or journal changes, another review is required.":
    "Revisión completa. Importar guardará este resultado; si cambian el archivo, los ajustes o el diario, hará falta otra revisión.",
  // Journal defaults
  Account: "Cuenta",
  "Symbol (blank = all)": "Símbolo (vacío = todos)",
  "e.g. ES": "p. ej. ES",
  "Breakeven, fees and risk defaults": "Valores predeterminados de breakeven, comisiones y riesgo",
  "Breakeven range (±)": "Rango de breakeven (±)",
  "Range unit": "Unidad del rango",
  "Account currency": "Divisa de la cuenta",
  "% of entry notional": "% del nocional de entrada",
  "Closed trades within this net P&L range count as breakeven. Actual P&L is unchanged. Percentage mode uses entry price × total entry quantity × contract multiplier; configure multipliers for derivatives first.":
    "Las operaciones cerradas dentro de este rango de P&L neto cuentan como breakeven. El P&L real no cambia. El modo porcentaje usa precio de entrada × cantidad total de entrada × multiplicador del contrato; configura antes los multiplicadores de los derivados.",
  "Default fees": "Comisiones predeterminadas",
  "Applied to new fills with a zero fee, including explicit zeroes. Nonzero imported fees and existing fills are kept. The first matching rule wins.":
    "Se aplican a las ejecuciones nuevas con comisión cero, incluidos los ceros explícitos. Se conservan las comisiones importadas distintas de cero y las ejecuciones existentes. Gana la primera regla que coincida.",
  "Fee amount": "Importe de la comisión",
  "Charge per": "Cobrar por",
  Execution: "Ejecución",
  "Unit / contract": "Unidad / contrato",
  "Remove fee rule": "Quitar regla de comisión",
  "Add fee rule": "Añadir regla de comisión",
  "Stop and target defaults": "Stop y objetivo predeterminados",
  "Distances from weighted entry, adjusted for long or short direction. Applied only when a new trade is first created. The first matching rule wins.":
    "Distancias desde la entrada ponderada, ajustadas a la dirección larga o corta. Solo se aplican cuando se crea una operación nueva. Gana la primera regla que coincida.",
  "Stop distance": "Distancia del stop",
  "Target distance": "Distancia del objetivo",
  "Distance unit": "Unidad de distancia",
  "Price points": "Puntos de precio",
  "% of entry price": "% del precio de entrada",
  "Remove risk rule": "Quitar regla de riesgo",
  "Add risk rule": "Añadir regla de riesgo",
  "Defaults saved": "Valores predeterminados guardados",
  "Save defaults": "Guardar valores predeterminados",
  "Defaults must be an object.": "Los valores predeterminados deben ser un objeto.",
  "Defaults contain unknown fields.": "Los valores predeterminados tienen campos desconocidos.",
  "Breakeven must be a nonnegative amount or percentage.":
    "El breakeven debe ser un importe o porcentaje no negativo.",
  "Each default must be an object.": "Cada valor predeterminado debe ser un objeto.",
  "A default contains unknown fields.": "Un valor predeterminado tiene campos desconocidos.",
  "Invalid default account or symbol.": "Cuenta o símbolo predeterminado no válido.",
  "Fees must be nonnegative.": "Las comisiones no pueden ser negativas.",
  "Stop and target distances must be positive.":
    "Las distancias del stop y del objetivo deben ser positivas.",
  // Market data CSV
  "Market candles imported. Choose Market data CSV on a trade or in Reports.":
    "Velas de mercado importadas. Elige CSV de datos de mercado en una operación o en Informes.",
  "Dataset and its saved estimates removed.":
    "Conjunto de datos y sus estimaciones guardadas eliminados.",
  "CSV request failed.": "La solicitud del CSV falló.",
  "Market data CSV": "CSV de datos de mercado",
  "Upload one instrument and candle resolution per file, up to 5 MB / 50,000 rows. Required columns: time, open, high, low, close. Volume is optional. Time is the bar open: ISO-8601 with timezone, Unix seconds or milliseconds. Daily bars must start at 00:00 UTC. These are market candles, separate from trade execution imports.":
    "Sube un instrumento y una temporalidad por archivo, hasta 5 MB / 50.000 filas. Columnas obligatorias: time, open, high, low, close. El volumen es opcional. La hora es la apertura de la vela: ISO-8601 con zona horaria, segundos o milisegundos Unix. Las velas diarias deben empezar a las 00:00 UTC. Son velas de mercado, independientes de las importaciones de ejecuciones.",
  "Download generic CSV header template": "Descargar plantilla genérica de cabecera CSV",
  "Candle CSV": "CSV de velas",
  "Use a CSV smaller than 5 MB.": "Usa un CSV de menos de 5 MB.",
  "Could not read this file.": "No se pudo leer este archivo.",
  "Instrument symbol": "Símbolo del instrumento",
  "Exact symbol used in your file": "Símbolo exacto que usa tu archivo",
  "Candle resolution": "Temporalidad de las velas",
  "Choose the file’s resolution": "Elige la temporalidad del archivo",
  "Quote currency": "Divisa de cotización",
  "Price basis": "Base de precios",
  "Choose the file’s price basis": "Elige la base de precios del archivo",
  "Unadjusted / raw": "Sin ajustar / bruto",
  "Split adjusted": "Ajustado por splits",
  "Other adjusted": "Otro ajuste",
  Midpoint: "Precio medio",
  Bid: "Bid",
  "price|Ask": "Ask",
  "Validate & preview candles": "Validar y previsualizar velas",
  "{count} candles · {from} to {to}": "{count} velas · de {from} a {to}",
  "First candles (UTC)": "Primeras velas (UTC)",
  "candle|Time": "Hora",
  "candle|Open": "Apertura",
  "candle|High": "Máximo",
  "candle|Low": "Mínimo",
  "candle|Close": "Cierre",
  "Import market candles": "Importar velas de mercado",
  "{count} candles": "{count} velas",
  "Remove {name} and the MAE/MFE estimates saved from it?":
    "¿Quitar {name} y las estimaciones MAE/MFE guardadas a partir de él?",
  "Remove dataset": "Quitar conjunto de datos",
  "Invalid CSV request.": "Solicitud de CSV no válida.",
  "Invalid candle CSV.": "CSV de velas no válido.",
  "Choose a CSV action.": "Elige una acción para el CSV.",
  "Choose a CSV file.": "Elige un archivo CSV.",
  "Choose a dataset.": "Elige un conjunto de datos.",
  "Enter a file name.": "Escribe un nombre de archivo.",
  "Enter the exact instrument symbol.": "Escribe el símbolo exacto del instrumento.",
  "Choose a candle resolution.": "Elige una temporalidad.",
  "Enter the quote currency, such as USD or USDT.":
    "Escribe la divisa de cotización, como USD o USDT.",
  "Choose the file's price basis.": "Elige la base de precios del archivo.",
  "Provide a market CSV request.": "Envía una solicitud de CSV de mercado.",
  // Market data settings
  "Market data": "Datos de mercado",
  "Connect historical prices for estimated MAE/MFE and candle replay on closed trades. Vela renders the charts. No data source is enabled or selected by default. Choose a connection or upload your own candles. Market data connections are separate from broker sync and AI.":
    "Conecta precios históricos para estimar el MAE/MFE y repetir las velas de las operaciones cerradas. Vela dibuja los gráficos. Ninguna fuente de datos está activada ni elegida por defecto. Elige una conexión o sube tus propias velas. Las conexiones de datos de mercado son independientes de la sincronización con el bróker y de la IA.",
  "Loading connections…": "Cargando conexiones…",
  "Public endpoint reachable. No API key or paid data plan is required. Candle availability depends on the pair, date range and public API limits.":
    "El servicio público responde. No hace falta clave de API ni un plan de datos de pago. La disponibilidad de velas depende del par, del rango de fechas y de los límites de la API pública.",
  "Connection verified. Instrument coverage depends on your provider access.":
    "Conexión verificada. Los instrumentos disponibles dependen de tu acceso al proveedor.",
  "Credentials saved. Test the connection to verify access.":
    "Credenciales guardadas. Prueba la conexión para verificar el acceso.",
  "Public market data enabled.": "Datos de mercado públicos activados.",
  "Connection removed.": "Conexión eliminada.",
  "Connection update failed.": "No se pudo actualizar la conexión.",
  "Managed by server environment": "Gestionado por el entorno del servidor",
  "Enabled · no key required": "Activada · sin clave",
  "Credentials saved": "Credenciales guardadas",
  "Not connected": "Sin conectar",
  "Credentials are encrypted locally and used only by the server for market data. Saved secrets are never returned to the browser or included in journal exports.":
    "Las credenciales se cifran en local y solo las usa el servidor para los datos de mercado. Los secretos guardados nunca se devuelven al navegador ni se incluyen en las exportaciones del diario.",
  "Complete all required fields in the server environment.":
    "Completa todos los campos obligatorios en el entorno del servidor.",
  "Enter replacement {field}": "Escribe un nuevo valor para {field}",
  "Enter {field}": "Escribe {field}",
  "Save credentials": "Guardar credenciales",
  "Enable source": "Activar fuente",
  "Test connection": "Probar conexión",
  "Disable source": "Desactivar fuente",
  "Remove credentials": "Quitar credenciales",
  "Choose a market data provider.": "Elige un proveedor de datos de mercado.",
  "Choose a valid connection action.": "Elige una acción de conexión válida.",
  "This source does not use API keys.": "Esta fuente no usa claves de API.",
  "Only public sources can be enabled without credentials.":
    "Solo las fuentes públicas se pueden activar sin credenciales.",
  // Market data providers (lib/market-providers.ts)
  "Historical candles. Stock and ETF prices are split adjusted; coverage depends on your plan.":
    "Velas históricas. Los precios de acciones y ETF están ajustados por splits; la cobertura depende de tu plan.",
  "US stocks and crypto. Choose a stock or crypto feed; SIP requires appropriate data access. Stock prices are unadjusted.":
    "Acciones de EE. UU. y cripto. Elige un feed de acciones o de cripto; SIP requiere el acceso a datos adecuado. Los precios de las acciones no están ajustados.",
  "Public Binance spot candles. No API key required. Availability depends on your region and the listed pair.":
    "Velas públicas de spot de Binance. Sin clave de API. La disponibilidad depende de tu región y del par listado.",
  "Public Bybit candles and live prices for perpetuals and futures, spot and inverse contracts. No API key required; availability depends on your region.":
    "Velas públicas y precios en directo de Bybit para perpetuos y futuros, spot y contratos inversos. Sin clave de API; la disponibilidad depende de tu región.",
  "Public Coinbase Exchange spot candles. No API key required; intervals without trades may have no candle.":
    "Velas públicas de spot de Coinbase Exchange. Sin clave de API; los intervalos sin negociación pueden no tener vela.",
  "Public OKX candles for spot pairs and perpetual swaps, with years of 1-minute history. No API key required; availability depends on your region.":
    "Velas públicas de OKX para pares spot y swaps perpetuos, con años de historial de 1 minuto. Sin clave de API; la disponibilidad depende de tu región.",
  "Public Kraken candles for crypto and a dozen major currency pairs (EUR/USD, GBP/USD, USD/JPY...). No API key required, but only the latest 720 candles of each size: about 12 hours of 1m, 30 days of 1h, two years of 1d.":
    "Velas públicas de Kraken para cripto y una docena de pares de divisas principales (EUR/USD, GBP/USD, USD/JPY...). Sin clave de API, pero solo las 720 últimas velas de cada temporalidad: unas 12 horas de 1m, 30 días de 1h, dos años de 1d.",
  "Daily candles for US stocks and ETFs from nasdaq.com, the last ten years, split adjusted. No API key required; not an official API, so it can change. For indices use Yahoo Finance.":
    "Velas diarias de acciones y ETF de EE. UU. desde nasdaq.com, de los últimos diez años, ajustadas por splits. Sin clave de API; no es una API oficial, así que puede cambiar. Para índices usa Yahoo Finance.",
  "Stocks and ETFs worldwide, indices, futures, currency pairs and crypto. No API key required, but it is not an official API: Yahoo throttles it and refuses some networks. Intraday history is short (1m for 30 days, 5m to 30m for 60 days, 1h for two years); daily for the whole history.":
    "Acciones y ETF de todo el mundo, índices, futuros, pares de divisas y cripto. Sin clave de API, pero no es una API oficial: Yahoo la limita y rechaza algunas redes. El historial intradía es corto (1m durante 30 días, de 5m a 30m durante 60 días, 1h durante dos años); el diario cubre todo el historial.",
  "Forex and CFD candles from your v20 account. Midpoint prices, UTC-aligned bars and tick-count volume; no spread or FX conversion is included.":
    "Velas de forex y CFD de tu cuenta v20. Precios medios, velas alineadas a UTC y volumen por número de ticks; no incluye spread ni conversión de divisas.",
  "Local OHLCV candle files. Upload market prices separately from your trade executions.":
    "Archivos locales de velas OHLCV. Sube los precios de mercado aparte de tus ejecuciones.",
  "Key ID": "ID de clave",
  "Secret key": "Clave secreta",
  "Access token": "Token de acceso",
  "v20 account ID": "ID de cuenta v20",
  Environment: "Entorno",
  Practice: "Práctica",
  Live: "Real",
  // Privacy, theme, sign-out, update notice
  "Could not read your privacy preference.": "No se pudo leer tu preferencia de privacidad.",
  "Privacy changed for this page, but could not be saved in this browser.":
    "La privacidad cambió en esta página, pero no se pudo guardar en este navegador.",
  "Privacy mode on": "Modo privado activado",
  "Privacy mode off": "Modo privado desactivado",
  "Hide balances, P&L and trade prices across the journal":
    "Oculta saldos, P&L y precios de las operaciones en todo el diario",
  Privacy: "Privacidad",
  "Privacy mode": "Modo privado",
  On: "Activado",
  Off: "Desactivado",
  "Monetary value hidden": "Importe oculto",
  "Turn off privacy mode to edit this value": "Desactiva el modo privado para editar este valor",
  "Appearance changed, but your browser could not save it for next time.":
    "La apariencia cambió, pero tu navegador no pudo guardarla para la próxima vez.",
  "Switch to light mode": "Cambiar a modo claro",
  "Switch to dark mode": "Cambiar a modo oscuro",
  "Light mode": "Modo claro",
  "Dark mode": "Modo oscuro",
  "Sign out ({who})": "Cerrar sesión ({who})",
  "Sign out": "Cerrar sesión",
  "{release} is available: see what is new": "{release} está disponible: mira las novedades",
  "A new update is available": "Hay una nueva actualización disponible",
  // Timezone picker
  "Choose a timezone": "Elige una zona horaria",
  "{label} options": "Opciones de {label}",
  "Search timezones": "Buscar zonas horarias",
  "Search city or timezone…": "Busca una ciudad o zona horaria…",
  Timezones: "Zonas horarias",
  "{count} timezone": "{count} zona horaria",
  "{count} timezones": "{count} zonas horarias",
  "No matching timezone. Try a city or a full timezone name.":
    "Ninguna zona horaria coincide. Prueba con una ciudad o el nombre completo de la zona.",
  // Manual entry and add trade
  "Couldn’t save the trade. Try again.": "No se pudo guardar la operación. Inténtalo de nuevo.",
  "Execution {number}": "Ejecución {number}",
  "Date & time": "Fecha y hora",
  Side: "Sentido",
  Buy: "Compra",
  Sell: "Venta",
  Quantity: "Cantidad",
  qty: "cant.",
  Price: "Precio",
  price: "precio",
  Fee: "Comisión",
  fee: "comisión",
  "Notes (optional)": "Notas (opcional)",
  "Your setup, why you took the trade, or what you learned…":
    "Tu setup, por qué tomaste la operación o qué aprendiste…",
  "Markdown supported. Notes are saved with the trade; existing notes are kept when adding to an open position.":
    "Admite Markdown. Las notas se guardan con la operación; al añadir a una posición abierta se conservan las notas existentes.",
  "Add execution": "Añadir ejecución",
  "Save trade": "Guardar operación",
  "Execution {list} is incomplete: fill in the time, quantity and price (numbers with a dot for decimals), or clear it.":
    "La ejecución {list} está incompleta: rellena la hora, la cantidad y el precio (números con punto para los decimales), o vacíala.",
  "Executions {list} are incomplete: fill in the time, quantity and price (numbers with a dot for decimals), or clear them.":
    "Las ejecuciones {list} están incompletas: rellena la hora, la cantidad y el precio (números con punto para los decimales), o vacíalas.",
  "Dates and times use your device’s timezone. Executions matching an open position on {symbol} are stitched into round trips automatically ({count} legs so far).":
    "Las fechas y horas usan la zona horaria de tu dispositivo. Las ejecuciones que coinciden con una posición abierta en {symbol} se unen automáticamente en operaciones completas ({count} tramos por ahora).",
  "the symbol": "el símbolo",
  "Add trade": "Añadir operación",
  "Choose an account and enter your buys and sells. Save an entry alone for an open position, or include the exit to record a closed trade.":
    "Elige una cuenta e introduce tus compras y ventas. Guarda solo una entrada para una posición abierta, o incluye la salida para registrar una operación cerrada.",
  "accountId and a non-empty executions array are required":
    "Elige una cuenta y añade al menos una ejecución",
  "every execution needs symbol, side, quantity > 0, price, executedAt":
    "Cada ejecución necesita símbolo, sentido, cantidad > 0, precio y fecha",
  "Notes must be at most 100,000 characters.":
    "Las notas no pueden superar los 100.000 caracteres.",
  // UI primitives
  Close: "Cerrar",
  "Loading calendar": "Cargando calendario",
  "Choose {label} date": "Elegir fecha: {label}",
  "Enter a valid date (YYYY-MM-DD).": "Introduce una fecha válida (AAAA-MM-DD).",
  "Enter a valid date (YYYY-MM-DD) on or before {max}.":
    "Introduce una fecha válida (AAAA-MM-DD) igual o anterior a {max}.",
  "Enter a valid date (YYYY-MM-DD) on or after {min}.":
    "Introduce una fecha válida (AAAA-MM-DD) igual o posterior a {min}.",
  "Enter a valid date (YYYY-MM-DD) on or before {max} on or after {min}.":
    "Introduce una fecha válida (AAAA-MM-DD) entre {min} y {max}.",
  "{label} calendar": "Calendario de {label}",
  Clear: "Borrar",
  Today: "Hoy",
};

export default es;
