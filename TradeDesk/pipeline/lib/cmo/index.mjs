/**
 * index.mjs — single entry point for the CMO shared library (spec §5).
 *
 * The nightly pipeline, the backtest harness (WO-03) and the browser
 * (WO-09, via Vite) import the same functions from here, so the score
 * that was tested is the score that is shown.
 *
 * Purity contract (WO-01 accept): nothing in this directory imports
 * `fs` or `http` or reads the clock. All bars, filings and chains are
 * passed in as arguments; `asOf` dates are passed in, never read from
 * the clock. params.json is loaded by the module system (import
 * attribute), not by file reads in logic.
 */
export { PARAMS, PARAMS_VERSION } from './params.mjs';
export { clamp, mean, stdev, round, trueRange } from './util.mjs';
export {
  sma, ema, atr, adrPct, rvol, rsRaw, trendTemplate, priorMove,
  contraction, gapInfo, closeLocation, avwap, rsLineNewHigh,
} from './indicators.mjs';
export { regimeState, regimeAllows } from './regime.mjs';
export { epsSurprise, sue, growthYoY, acceleration, marginTrend } from './fundamentals.mjs';
export { detectA1, detectA2, detectA1S, detectA2S, detectA3S, positionSizing } from './setups.mjs';
export { tradeScore, readinessScore, gradeFor } from './score.mjs';
export { percentileRank } from './rank.mjs';
export { tierOutcome, bucketKey, lookupProbability, wilsonInterval, adrBand, atrBand } from './tiers.mjs';
export { openingRange, orbSignal, openingRvol } from './orb.mjs';
export { noiseValue, noiseBands, noiseSignal } from './noiseBand.mjs';
export { normCDF, bsPrice, bsDelta, bsGamma, expectedMove, chooseContract } from './options.mjs';
export { dteScore } from './dte-score.mjs';
