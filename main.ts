import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const LOOKBACK = 30;
const ENTRY_SLIPPAGE_BPS = 100;
const EXIT_SLIPPAGE_BPS = 100;

// Every CBBTC close seen, in bar order.
const closes: bigint[] = [];
// Highest close seen while a position is held; null while flat.
let peakClose: bigint | null = null;
// Cash to spend on the entry buy, set when the entry signal fires; null otherwise.
// Part 2 turns this into the buy order.
let entryNotional: bigint | null = null;

// True when the latest close beats every close of the 30 bars before it.
function entrySignal(latest: bigint): boolean {
  if (closes.length < LOOKBACK + 1) return false;
  const prev = closes.slice(-LOOKBACK - 1, -1);
  let top = prev[0] as bigint;
  for (const c of prev) if (c > top) top = c;
  return latest > top;
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const latest = BigInt(bar.c);
    closes.push(latest);
    const held = state.positions.get(SYMBOL);
    const flat = held === undefined || held.qty === 0n;
    entryNotional = null;
    if (!flat) {
      if (peakClose === null || latest > peakClose) peakClose = latest;
      // Exit: latest close fell 2% or more below the peak since entry.
      if (peakClose !== null && latest * 100n < peakClose * 98n) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: EXIT_SLIPPAGE_BPS }];
      }
      return [];
    }
    peakClose = null;
    if (entrySignal(latest)) entryNotional = state.cash;
    if (entryNotional !== null) {
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: entryNotional, max_slippage_bps: ENTRY_SLIPPAGE_BPS }];
    }
    return [];
  },
});
