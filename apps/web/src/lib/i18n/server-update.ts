/**
 * Spanish for API, broker sync and importer messages (account currencies, IBKR statement timezones, XTB workbooks, Open/Close position fills, AI statement parsing, notebook folders). English source text → Spanish. See lib/i18n.ts.
 */
const es: Record<string, string> = {
  // Accounts (api/accounts/[id], api/accounts/[id]/actions)
  "Choose a different destination account.": "Elige otra cuenta de destino.",
  "An IBKR account with synced history cannot change brokers. Connect a separate account to preserve its timestamp history.":
    "Una cuenta de IBKR con historial sincronizado no puede cambiar de bróker. Conecta una cuenta aparte para conservar el historial de sus horas.",
  // Notebook folders (api/folders/[id], api/notes)
  "Folder not found": "Carpeta no encontrada",
  "This folder cannot be deleted.": "Esta carpeta no se puede eliminar.",
  // Import (api/import)
  "Unsupported file encoding.": "Codificación de archivo no admitida.",
  "Enable AI parsing to upload PDF statements.":
    "Activa la lectura con IA para subir extractos en PDF.",
  "Turn off AI parsing for an XTB Excel report. The XTB importer reads it directly.":
    "Desactiva la lectura con IA para un informe de Excel de XTB. El importador de XTB lo lee directamente.",
  "Choose AI parsing or column mapping, not both.":
    "Elige la lectura con IA o la asignación de columnas, no ambas.",
  "Review the AI preview before importing.": "Revisa la vista previa de la IA antes de importar.",
  // AI settings (api/settings, server/ai.ts)
  "Choose Anthropic, OpenAI, Google Gemini or an OpenAI-compatible server.":
    "Elige Anthropic, OpenAI, Google Gemini o un servidor compatible con OpenAI.",
  "Enter a valid server URL, such as http://localhost:11434/v1.":
    "Escribe una URL de servidor válida, como http://localhost:11434/v1.",
  "AI is not configured — add your OpenAI-compatible server URL and model in Settings.":
    "La IA no está configurada: añade la URL y el modelo de tu servidor compatible con OpenAI en Ajustes.",
  "AI server unreachable: check the server URL in Settings and that the server is running.":
    "No se puede conectar con el servidor de IA: revisa la URL del servidor en Ajustes y que el servidor esté en marcha.",
  // AI feedback cards (lib/ai-feedback.ts)
  "Connect Anthropic, OpenAI, Google Gemini or an OpenAI-compatible server in Settings to ask questions, generate recaps, and review trades.":
    "Conecta Anthropic, OpenAI, Google Gemini o un servidor compatible con OpenAI en Ajustes para hacer preguntas, generar resúmenes y revisar operaciones.",
  "Couldn’t reach your AI server": "No se pudo conectar con tu servidor de IA",
  "Check the server URL in Settings and that the server is running and reachable from the journal.":
    "Revisa la URL del servidor en Ajustes y que el servidor esté en marcha y accesible desde el diario.",
  // Currency conversion (api/settings, lib/currencies.ts, server/currency-conversion.ts)
  "Enter valid conversion rates.": "Escribe tipos de cambio válidos.",
  "Enter valid currency conversion settings.":
    "Escribe unos ajustes de conversión de divisas válidos.",
  "Choose a reporting currency and enter valid conversion rates.":
    "Elige una divisa de informe y escribe tipos de cambio válidos.",
  "Conversion rates must be positive, finite numbers.":
    "Los tipos de cambio deben ser números positivos y finitos.",
  "The reporting currency always has a rate of 1.":
    "La divisa de informe siempre tiene un tipo de cambio de 1.",
  "The saved conversion rate produces an amount that is too large. Update it in Settings.":
    "El tipo de cambio guardado produce un importe demasiado grande. Actualízalo en Ajustes.",
  "A trade's account could not be found.": "No se encontró la cuenta de una operación.",
  // AI statement parsing (lib/ai-import.ts, server/ai-import.ts)
  "If you're having issues importing a file, AI parsing can help. The journal supports many broker exports, but column names and statement layouts can change. OpenAI or Anthropic can interpret unfamiliar formats and extract trades for your review. Check quantities, prices, fees and dates against your statement before importing. Your file is sent to your chosen provider using your API key; provider usage charges apply.":
    "Si tienes problemas para importar un archivo, la lectura con IA puede ayudarte. El diario admite muchas exportaciones de brókeres, pero los nombres de columna y el formato de los extractos pueden cambiar. OpenAI o Anthropic pueden interpretar formatos desconocidos y extraer las operaciones para que las revises. Comprueba cantidades, precios, comisiones y fechas con tu extracto antes de importar. Tu archivo se envía al proveedor que elijas con tu clave de API; se aplican los cargos de uso del proveedor.",
  "AI-assisted": "Asistido por IA",
  "Choose OpenAI or Anthropic.": "Elige OpenAI o Anthropic.",
  "Invalid API key.": "Clave de API no válida.",
  "Add an API key for the selected provider to parse this upload.":
    "Añade una clave de API del proveedor elegido para leer este archivo.",
  "PDF must be no larger than 8 MB.": "El PDF no puede superar los 8 MB.",
  "Upload a valid PDF statement.": "Sube un extracto en PDF válido.",
  "AI text parsing supports up to 150,000 characters. Use a smaller CSV, TSV, HTML, XML or text export, or upload a PDF.":
    "La lectura de texto con IA admite hasta 150.000 caracteres. Usa una exportación CSV, TSV, HTML, XML o de texto más pequeña, o sube un PDF.",
  "AI response was incomplete. Split the statement into smaller files.":
    "La respuesta de la IA llegó incompleta. Divide el extracto en archivos más pequeños.",
  "AI parsing failed or returned an incomplete response. Check your key, model, provider credits and file size, then try again. PDF uploads require a model that accepts PDFs.":
    "La lectura con IA falló o devolvió una respuesta incompleta. Revisa tu clave, el modelo, el crédito del proveedor y el tamaño del archivo, y vuelve a intentarlo. Para subir PDF necesitas un modelo que acepte PDF.",
  "AI could not extract the complete statement. Try a smaller, single-account execution export.":
    "La IA no pudo extraer el extracto completo. Prueba con una exportación de ejecuciones más pequeña y de una sola cuenta.",
  "AI returned an invalid statement review. Try again.":
    "La IA devolvió una revisión del extracto no válida. Inténtalo de nuevo.",
  "This statement contains multiple accounts. Upload one account at a time.":
    "Este extracto contiene varias cuentas. Sube una cuenta cada vez.",
  "AI parsing supports 1–200 executions per preview. Split larger statements.":
    "La lectura con IA admite de 1 a 200 ejecuciones por vista previa. Divide los extractos más grandes.",
  "AI returned an invalid execution.": "La IA devolvió una ejecución no válida.",
  "AI returned an invalid symbol.": "La IA devolvió un símbolo no válido.",
  "AI returned an ambiguous timestamp.": "La IA devolvió una fecha y hora ambigua.",
  "AI returned an invalid timestamp.": "La IA devolvió una fecha y hora no válida.",
  "AI returned an invalid fee.": "La IA devolvió una comisión no válida.",
  "AI returned an invalid asset class.": "La IA devolvió una clase de activo no válida.",
  "AI did not provide a source reference for every execution.":
    "La IA no indicó la referencia de origen de todas las ejecuciones.",
  "Invalid execution.": "Ejecución no válida.",
  "AI found indistinguishable duplicate fills. Use a broker-specific execution export to preserve their identities.":
    "La IA encontró ejecuciones duplicadas imposibles de distinguir. Usa una exportación de ejecuciones propia del bróker para conservar su identidad.",
  "AI preview expired or the file changed. Preview it again before importing.":
    "La vista previa de la IA caducó o el archivo cambió. Vuelve a generar la vista previa antes de importar.",
  // IBKR statement timezones (server/ibkr-flex-xml-import.ts, ibkr-sync-timezone.ts, sync.ts)
  "Choose a named IANA statement timezone for IBKR Flex statements, such as America/New_York, not a UTC offset.":
    "Elige una zona horaria IANA con nombre para los extractos Flex de IBKR, como America/New_York, no un desfase UTC.",
  "No executions could be read from this Flex statement. Include the Trades section at Execution level in the Flex Query.":
    "No se pudo leer ninguna ejecución de este extracto Flex. Incluye la sección Trades a nivel Execution en la Flex Query.",
  "Enter a valid IANA default import timezone in Settings → Journal.":
    "Escribe una zona horaria IANA válida como zona horaria de importación predeterminada en Ajustes → Diario.",
  "This IBKR account has history from before timezone-aware sync. Back up your data, verify Default import timezone in Settings → Journal, and connect a separate IBKR account. Compare the corrected history using the account filter; keep the original account and its notes.":
    "Esta cuenta de IBKR tiene historial anterior a la sincronización con zona horaria. Haz una copia de seguridad de tus datos, comprueba la zona horaria de importación predeterminada en Ajustes → Diario y conecta una cuenta de IBKR aparte. Compara el historial corregido con el filtro de cuentas; conserva la cuenta original y sus notas.",
  "Cannot transfer synced history with an unknown IBKR statement timezone. Back up your data, verify Default import timezone in Settings → Journal, and connect a separate IBKR account. Compare the corrected history using the account filter; keep the original account and its notes.":
    "No se puede transferir un historial sincronizado con una zona horaria de extracto de IBKR desconocida. Haz una copia de seguridad de tus datos, comprueba la zona horaria de importación predeterminada en Ajustes → Diario y conecta una cuenta de IBKR aparte. Compara el historial corregido con el filtro de cuentas; conserva la cuenta original y sus notas.",
  "Cannot transfer IBKR synced history into another broker connection. Use a separate manual account to preserve its timezone provenance.":
    "No se puede transferir un historial sincronizado de IBKR a la conexión de otro bróker. Usa una cuenta manual aparte para conservar el origen de su zona horaria.",
  "Cannot combine synced histories with unknown or different IBKR statement timezones. Back up your data, verify Default import timezone in Settings → Journal, and connect a separate IBKR account. Compare the corrected history using the account filter; keep the original account and its notes.":
    "No se pueden combinar historiales sincronizados con zonas horarias de extracto de IBKR desconocidas o distintas. Haz una copia de seguridad de tus datos, comprueba la zona horaria de importación predeterminada en Ajustes → Diario y conecta una cuenta de IBKR aparte. Compara el historial corregido con el filtro de cuentas; conserva la cuenta original y sus notas.",
  "The IBKR connection changed during sync. Try again.":
    "La conexión de IBKR cambió durante la sincronización. Inténtalo de nuevo.",
  // Open/Close position fills (packages/importers formats/fills.ts)
  "These position rows contain multiple source accounts. Export and import one account at a time.":
    "Estas filas de posiciones contienen varias cuentas de origen. Exporta e importa una cuenta cada vez.",
  "Open/Close position labels keep long and short positions separate. Closes are checked against the selected account when saving. For futures, configure the multiplier for each imported symbol in Settings.":
    "Las etiquetas Open/Close de posición mantienen separadas las posiciones largas y cortas. Los cierres se comprueban con la cuenta elegida al guardar. En futuros, configura el multiplicador de cada símbolo importado en Ajustes.",
  // XTB workbooks (server/xtb-import.ts, packages/importers formats/xtb.ts)
  "Excel uploads must be a .xlsx file of 5 MB or less.":
    "Los archivos de Excel deben ser .xlsx de 5 MB o menos.",
  "This file is not an .xlsx workbook.": "Este archivo no es un libro .xlsx.",
  "This XTB workbook has no Closed Positions sheet.":
    "Este libro de XTB no tiene la hoja Closed Positions.",
  "XTB closed positions are trade-level. Each row becomes an entry and an exit at the reported prices. Account-currency Gross Profit is kept as the position result, because price × volume is not the P&L when a conversion rate applies.":
    "Las posiciones cerradas de XTB son por operación. Cada fila se convierte en una entrada y una salida a los precios indicados. El Gross Profit en la divisa de la cuenta se guarda como resultado de la posición, porque precio × volumen no es el P&L cuando se aplica un tipo de cambio.",
  "Open holdings are entry fills tagged with their XTB position id. A later report that closes the same id adds the exit and skips this entry.":
    "Las posiciones abiertas son ejecuciones de entrada marcadas con su id de posición de XTB. Un informe posterior que cierre el mismo id añade la salida y omite esta entrada.",
  "Open Time and Close Time are labeled UTC and are imported as UTC.":
    "Open Time y Close Time están marcadas como UTC y se importan como UTC.",
  "This file contains more than one XTB account. Import one account workbook at a time.":
    "Este archivo contiene más de una cuenta de XTB. Importa el libro de una cuenta cada vez.",
  "This XTB report has no closed or open positions to import.":
    "Este informe de XTB no tiene posiciones cerradas ni abiertas que importar.",
  // Excel workbooks (packages/importers xlsx.ts)
  "Multi-part .xlsx archives are not supported.": "No se admiten archivos .xlsx en varias partes.",
  "ZIP64 workbooks are not supported. Save the file again in Excel.":
    "No se admiten libros ZIP64. Vuelve a guardar el archivo en Excel.",
  "This workbook is too large to be an account statement.":
    "Este libro es demasiado grande para ser un extracto de cuenta.",
  "Password-protected workbooks are not supported. Export the report again without a password.":
    "No se admiten libros protegidos con contraseña. Vuelve a exportar el informe sin contraseña.",
  "This workbook is damaged: a part is larger than the archive declares.":
    "Este libro está dañado: una parte es más grande de lo que indica el archivo.",
  "This .xlsx workbook is damaged and could not be read.":
    "Este libro .xlsx está dañado y no se pudo leer.",
  "This is a legacy .xls or password-protected workbook. Export the report again as .xlsx without a password.":
    "Es un libro .xls antiguo o protegido con contraseña. Vuelve a exportar el informe como .xlsx sin contraseña.",
  "This workbook has no sheets.": "Este libro no tiene hojas.",
};

export default es;
