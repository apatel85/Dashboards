/**
 * Where the data JSON lives.
 *
 * TradeDesk V2 ships no data of its own: it reads the files the original
 * TradeDesk pipeline already publishes, so both apps always show the same
 * numbers and there is nothing extra to refresh.
 *   dev   → Vite serves ../TradeDesk/public (see vite.config.ts) at BASE_URL/data/
 *   build → same-origin GitHub Pages path of the original app's data folder
 */
export const DATA_BASE: string = import.meta.env.DEV
  ? `${import.meta.env.BASE_URL}data/`
  : '/Dashboards/TradeDesk/dist/data/';
