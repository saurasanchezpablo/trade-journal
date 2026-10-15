/**
 * Spanish for text added to the dashboard, accounts, import, trades, calendar, notebook and settings pages, and the trade replay controls. English source text → Spanish. See lib/i18n.ts.
 */
const es: Record<string, string> = {
  // Dashboard and calendar (accounts in several currencies)
  "{trades} · {rate} trade win rate": "{trades} · {rate} de operaciones ganadoras",
  "{currency} accounts": "Cuentas en {currency}",
  "Account settings": "Ajustes de cuentas",

  // Dashboard layouts
  "Dashboard layouts": "Diseños del panel",
  "Close dashboard layouts": "Cerrar diseños del panel",
  Presets: "Predefinidos",
  "Choose a focus, then make it yours with Customize.":
    "Elige un enfoque y luego hazlo tuyo con Personalizar.",
  "Apply {name} preset": "Aplicar el diseño predefinido {name}",
  Default: "Predeterminado",
  "Your saved layouts": "Tus diseños guardados",

  // Accounts
  "Create an account for manual trades or file imports.":
    "Crea una cuenta para operaciones manuales o importaciones de archivos.",
  "No accounts yet. Use New account to create your first one.":
    "Aún no hay cuentas. Usa Cuenta nueva para crear la primera.",

  // Import: file upload and AI parsing
  "Enable AI parsing to upload a PDF statement.":
    "Activa la lectura con IA para subir un extracto en PDF.",
  "AI uploads must be 8 MB or smaller.": "Los archivos para la IA deben ocupar 8 MB o menos.",
  "Choose a CSV, TSV, HTML, XML, TXT or PDF file. XTB Excel reports use the XTB importer with AI turned off.":
    "Elige un archivo CSV, TSV, HTML, XML, TXT o PDF. Los informes de Excel de XTB usan el importador de XTB con la IA desactivada.",
  "Use a smaller export: AI text parsing supports up to 150,000 characters.":
    "Usa una exportación más pequeña: la lectura de texto con IA admite hasta 150.000 caracteres.",
  "Drop or choose a statement for AI parsing": "Suelta o elige un extracto para leerlo con IA",
  "Drop or choose a CSV / HTML / XML statement or an XTB Excel report":
    "Suelta o elige un extracto CSV / HTML / XML o un informe de Excel de XTB",
  "CSV, TSV, HTML, XML, TXT or PDF. Your file stays local until you preview with AI.":
    "CSV, TSV, HTML, XML, TXT o PDF. Tu archivo no sale de tu equipo hasta que pidas la vista previa con IA.",
  "Auto-detected: {formats}. Anything else goes to column mapping. XTB: one .xlsx per account. Closed positions and open holdings are imported; cash operations are left out.":
    "Detección automática: {formats}. Cualquier otro formato pasa a la asignación de columnas. XTB: un .xlsx por cuenta. Se importan las posiciones cerradas y las abiertas; los movimientos de efectivo quedan fuera.",
  "AI is reading your statement…": "La IA está leyendo tu extracto…",
  "Position identity and ordering (optional)": "Identidad y orden de las posiciones (opcional)",
  "For Open/Close Long/Short rows, map source position IDs, execution IDs or sequence numbers when available. Columns named Position ID, Execution ID, Fill ID and Sequence are recognized automatically. An order ID is not an execution ID.":
    "Para las filas Open/Close Long/Short, asigna los ID de posición, los ID de ejecución o los números de secuencia del origen cuando los haya. Las columnas llamadas Position ID, Execution ID, Fill ID y Sequence se reconocen automáticamente. Un ID de orden no es un ID de ejecución.",
  "Position ID": "ID de posición",
  "Execution ID": "ID de ejecución",
  Sequence: "Secuencia",
  "Open long": "Abre largo",
  "Open short": "Abre corto",
  "Close long": "Cierra largo",
  "Close short": "Cierra corto",
  "{quantity} @ {price} · Fees {fee}": "{quantity} @ {price} · Comisiones {fee}",
  "Source: {source}": "Fuente: {source}",
  "I compared all extracted executions with my statement, including the account, quantities, prices, fees and timestamps. Import this preview.":
    "He comparado todas las ejecuciones extraídas con mi extracto, incluidas la cuenta, las cantidades, los precios, las comisiones y las horas. Quiero importar esta vista previa.",

  // Import: broker sync
  "{skipped} broker record(s) were skipped: {reasons}":
    "Se omitieron {skipped} registros del bróker: {reasons}",
  "Could not load the import timezone. Refresh and try again.":
    "No se pudo cargar la zona horaria de importación. Recarga la página y vuelve a intentarlo.",
  "Statement timezone: {zone}. Used for Flex timestamps without an offset, and required for Flex XML files uploaded into this account. Change it in Settings → Journal before connecting.":
    "Zona horaria del extracto: {zone}. Se usa para las horas de Flex sin desfase y es obligatoria para los archivos XML de Flex que subas a esta cuenta. Cámbiala en Ajustes → General antes de conectar.",
  "Loading statement timezone…": "Cargando la zona horaria del extracto…",

  // Notebook: deleting a folder
  "Could not delete the folder. Try again.": "No se pudo eliminar la carpeta. Vuelve a intentarlo.",
  "Delete “{name}”?": "¿Eliminar «{name}»?",
  "The folder will be removed. Its notes will be kept in My notes.":
    "Se eliminará la carpeta. Sus notas se conservarán en Mis notas.",
  "Deleting…": "Eliminando…",
  "Delete folder": "Eliminar carpeta",
  "Delete folder: {name}": "Eliminar carpeta: {name}",

  // Settings sections
  "Settings sections": "Secciones de ajustes",
  "Settings section": "Sección de ajustes",
  General: "General",
  "Choose the journal's language and the timezones used to display and import your trades.":
    "Elige el idioma del diario y las zonas horarias con las que se muestran e importan tus operaciones.",
  Trading: "Trading",
  "Manage contract multipliers, breakeven rules, fees, and risk defaults.":
    "Gestiona los multiplicadores de contrato, las reglas de breakeven, las comisiones y los valores de riesgo predeterminados.",
  "Set a reporting currency and saved exchange rates for combined performance.":
    "Define una divisa de referencia y los tipos de cambio guardados para el rendimiento combinado.",
  "Connect price history or upload candles for replay and trade analysis.":
    "Conecta un historial de precios o sube velas para la repetición y el análisis de operaciones.",
  AI: "IA",
  "Choose your AI provider and manage your model and API key.":
    "Elige tu proveedor de IA y gestiona tu modelo y tu clave de API.",
  "Data & backups": "Datos y copias de seguridad",
  "Download your journal data for safekeeping or use in other tools.":
    "Descarga los datos de tu diario para guardarlos o usarlos en otras herramientas.",
  "Export your data": "Exporta tus datos",
  "Save a full journal backup, or export your trades as a CSV.":
    "Guarda una copia de seguridad completa del diario o exporta tus operaciones a CSV.",

  // Settings: AI provider (OpenAI-compatible servers)
  "OpenAI-compatible": "Compatible con OpenAI",
  "Use Anthropic, OpenAI, Google Gemini or an OpenAI-compatible server such as Ollama, LM Studio or OpenRouter for recaps, trade critiques, and “ask your journal”. Your key is encrypted at rest. AI requests go from your server directly to the provider you select.":
    "Usa Anthropic, OpenAI, Google Gemini o un servidor compatible con OpenAI, como Ollama, LM Studio u OpenRouter, para resúmenes, críticas de operaciones y “pregunta a tu diario”. Tu clave se guarda cifrada. Las peticiones de IA van desde tu servidor directamente al proveedor que elijas.",
  "Server configured": "Servidor configurado",
  "e.g. llama3.1:8b": "p. ej. llama3.1:8b",
  "Use a text model available to your provider account or server. Each provider keeps its own model and key.":
    "Usa un modelo de texto disponible en tu cuenta del proveedor o en tu servidor. Cada proveedor guarda su propio modelo y su clave.",
  "Server URL": "URL del servidor",
  "The API root your server documents, usually ending in /v1, such as http://localhost:11434/v1 for Ollama or https://openrouter.ai/api/v1. It must be reachable from the machine running the journal.":
    "La raíz de la API que indica la documentación de tu servidor, normalmente terminada en /v1, como http://localhost:11434/v1 para Ollama o https://openrouter.ai/api/v1. Tiene que ser accesible desde la máquina en la que se ejecuta el diario.",
  "API key (optional)": "Clave de API (opcional)",
  Optional: "Opcional",
  "Leave blank to keep your saved key. Saving a different server URL removes it.":
    "Déjalo en blanco para conservar la clave guardada. Si guardas otra URL de servidor, se elimina.",
  "Only needed if your server requires one.": "Solo hace falta si tu servidor la pide.",

  // Trade replay controls
  "Candle replay controls": "Controles de la repetición de velas",
  "Restart replay": "Reiniciar la repetición",
  "Previous candle": "Vela anterior",
  "Show all candles": "Mostrar todas las velas",
  "Preparing candle replay…": "Preparando la repetición de velas…",
};

export default es;
