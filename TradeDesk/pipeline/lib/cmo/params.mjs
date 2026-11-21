/**
 * params.mjs — the frozen parameter set for the CMO library.
 *
 * Loads pipeline/lib/cmo/params.json (import attribute, not fs) and exports
 * it as PARAMS. Every library function takes an optional `params` argument
 * defaulting to PARAMS, so tests and the backtest can pass variants without
 * touching the frozen file.
 *
 * Purity: no fs, no http, no clock. The JSON import is resolved at load
 * time by the module system, not by reading files in logic.
 */
import PARAMS from './params.json' with { type: 'json' };

export { PARAMS };
export default PARAMS;

/** params_version carried on every row the pipeline writes. */
export const PARAMS_VERSION = PARAMS.params_version;
