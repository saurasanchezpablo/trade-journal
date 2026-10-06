import chartTools from "./chart-tools";
import charts from "./charts";
import common from "./common";
import dashboardReports from "./dashboard-reports";
import features from "./features";
import journalAi from "./journal-ai";
import propAlerts from "./prop-alerts";
import reports from "./reports";
import server from "./server";
import shellSettings from "./shell-settings";
import trades from "./trades";

/**
 * Every Spanish string, keyed by its English source text. One module per area of the app
 * (they are merged here; a text two areas share reads the same in both).
 */
export const ES: Readonly<Record<string, string>> = {
  ...common,
  ...shellSettings,
  ...dashboardReports,
  ...reports,
  ...trades,
  ...charts,
  ...chartTools,
  ...journalAi,
  ...features,
  ...propAlerts,
  ...server,
};
