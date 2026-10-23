import accountsCurrencies from "./accounts-currencies";
import chartTools from "./chart-tools";
import charts from "./charts";
import common from "./common";
import dashboardReports from "./dashboard-reports";
import features from "./features";
import journalAi from "./journal-ai";
import pagesUpdate from "./pages-update";
import propAlerts from "./prop-alerts";
import reports from "./reports";
import server from "./server";
import serverUpdate from "./server-update";
import shellSettings from "./shell-settings";
import trades from "./trades";
import videoIntelligence from "./video-intelligence";
import strategyResearch from "./strategy-research";

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
  ...accountsCurrencies,
  ...pagesUpdate,
  ...serverUpdate,
  ...videoIntelligence,
  ...strategyResearch,
};
