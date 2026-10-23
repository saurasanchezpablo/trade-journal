#!/usr/bin/env python3
"""Independent reference results for the research engine (packages/core/src/research).

Re-implements, in numpy/scipy and without reading the TypeScript, the rules stated in
docs/trading/BACKTESTING.md: daily decisions at the close of day t with data up to t, executed
at the open of day t+1, open-to-open returns, costs on |target weight − drifted weight|, cash income on idle capital, perpetual funding
on events in (open[t+1], open[t+2]], metrics with 365-day annualization, the Probabilistic and
Deflated Sharpe ratios (Bailey & Lopez de Prado) and CSCV's probability of backtest
overfitting. Writes packages/core/tests/fixtures/research-reference.json, which the TypeScript
tests compare against.

Run: python3 scripts/research/reference.py
"""
import itertools
import json
import math
import os

import numpy as np
from scipy import stats

DAY = 86_400_000
YEAR = 365
rng = np.random.default_rng(20261022)

# ── Synthetic market: two spot assets and one perpetual with 8-hourly funding ──
N = 900
t0 = 1_577_836_800_000  # 2020-01-01
times = [t0 + i * DAY for i in range(N)]


def walk(start, vol, drift):
    closes = [start]
    for _ in range(N - 1):
        closes.append(closes[-1] * math.exp(rng.normal(drift, vol)))
    bars = []
    prev = start
    for i, c in enumerate(closes):
        o = prev * math.exp(rng.normal(0, vol * 0.2))
        hi = max(o, c) * (1 + abs(rng.normal(0, vol * 0.3)))
        lo = min(o, c) * (1 - abs(rng.normal(0, vol * 0.3)))
        bars.append({"time": times[i], "open": o, "high": hi, "low": lo, "close": c, "volume": 1000.0})
        prev = c
    return bars


btc = walk(10_000, 0.035, 0.0006)
eth = walk(200, 0.045, 0.0004)
perp = [dict(b, open=b["open"] * (1 + rng.normal(0, 0.0005)), close=b["close"] * (1 + rng.normal(0, 0.0005))) for b in btc]
funding = []
level = 0.0001
for i in range(N * 3):
    level = 0.9 * level + 0.1 * 0.0001 + rng.normal(0, 0.00008)
    funding.append({"time": t0 + i * 8 * 3_600_000, "rate": level})

FEE = {"spot": 10, "perp": 5}
SLIP = {"spot": 5, "perp": 5}
CASH = 0.03


# ── Strategies (as written in the spec) ──
def closes(bars, t):
    return np.array([b["close"] for b in bars[: t + 1]])


def sma_trend(t, held, window=50):
    c = closes(btc, t)
    if len(c) < window:
        return {"BTC": 0.0}
    return {"BTC": 1.0 if c[-1] > c[-window:].mean() else 0.0}


def vol_target(t, held, target=0.5, lookback=30):
    c = closes(btc, t)
    if len(c) < lookback + 1:
        return {"BTC": 0.0}
    r = np.diff(np.log(c[-lookback - 1:]))
    vol = r.std(ddof=1) * math.sqrt(YEAR)
    return {"BTC": min(1.0, target / vol)}


def mean_reversion(t, held, window=10, entry=1.5, exit_z=0.0):
    c = closes(btc, t)
    if len(c) < window + 1:
        return {"BTC": 0.0}
    recent = c[-window:]
    z = (c[-1] - recent.mean()) / recent.std(ddof=1)
    holding = held.get("BTC", 0) > 0
    long = (z < exit_z) if holding else (z < -entry)
    return {"BTC": 1.0 if long else 0.0}


def rotation(t, held, lookback=30):
    best, best_r = None, None
    for name, bars in (("BTC", btc), ("ETH", eth)):
        if t < lookback:
            continue
        r = bars[t]["close"] / bars[t - lookback]["close"] - 1
        if best_r is None or r > best_r:
            best, best_r = name, r
    return {best: 1.0} if best is not None and best_r > 0 else {}


def carry(t, held, periods=21, entry=0.10, exit_a=0.05, leverage=2):
    close_time = times[t] + DAY
    seen = [f["rate"] for f in funding if f["time"] <= close_time]
    if len(seen) < periods:
        return {}
    annual = float(np.mean(seen[-periods:])) * 3 * YEAR
    holding = held.get("PERP", 0) < 0
    on = annual > exit_a if holding else annual > entry
    a = 1 / (1 + 1 / leverage)
    return {"BTC": a, "PERP": -a} if on else {}


def backtest(strategy, instruments, warmup, max_gross=1.0):
    held = {k: 0.0 for k in instruments}
    out = []
    for t in range(warmup, N - 2):
        w = strategy(t, held)
        w = {k: float(w.get(k, 0.0)) for k in instruments}
        g = sum(abs(x) for x in w.values())
        if g > max_gross:
            w = {k: x * max_gross / g for k, x in w.items()}
        o1, o2 = times[t + 1], times[t + 2]
        ret = CASH / YEAR * max(0.0, 1 - sum(abs(x) for x in w.values()))
        moves = {}
        for k, (kind, bars) in instruments.items():
            change = abs(w[k] - held[k])
            ret -= change * (FEE[kind] + SLIP[kind]) / 10_000
            moves[k] = bars[t + 2]["open"] / bars[t + 1]["open"] - 1
            ret += w[k] * moves[k]
            if kind == "perp":
                ret -= w[k] * sum(f["rate"] for f in funding if o1 < f["time"] <= o2)
        out.append(ret)
        # Positions drift with prices: tomorrow's trades start from the drifted weights.
        held = {k: w[k] * (1 + moves[k]) / (1 + ret) for k in instruments}
    return out


# ── Metrics ──
def metrics(r, cash=CASH):
    r = np.asarray(r)
    x = r - cash / YEAR
    n = len(r)
    years = n / YEAR
    growth = float(np.prod(1 + r))
    sd = r.std(ddof=1)
    eq = np.cumprod(1 + r)
    peak = np.maximum.accumulate(np.concatenate([[1.0], eq]))[1:]
    dd = 1 - eq / peak
    var = np.quantile(r, 0.05)
    return {
        "totalReturn": growth - 1,
        "cagr": growth ** (1 / years) - 1,
        "volatility": sd * math.sqrt(YEAR),
        "sharpe": x.mean() / x.std(ddof=1) * math.sqrt(YEAR),
        "sortino": x.mean() / math.sqrt(np.mean(np.minimum(x, 0) ** 2)) * math.sqrt(YEAR),
        "maxDrawdown": float(dd.max()),
        "skewness": float(stats.skew(r)),
        "kurtosis": float(stats.kurtosis(r)),
        "var95": float(-var),
        "cvar95": float(-r[r <= var].mean()),
    }


def psr(r, benchmark=0.0):
    r = np.asarray(r) - CASH / YEAR  # excess over cash, as every Sharpe here
    sr = r.mean() / r.std(ddof=1)
    g3 = stats.skew(r)
    g4 = stats.kurtosis(r, fisher=False)
    return float(stats.norm.cdf((sr - benchmark) * math.sqrt(len(r) - 1) / math.sqrt(1 - g3 * sr + (g4 - 1) / 4 * sr * sr)))


def dsr(r, trial_sharpes):
    v = np.var(trial_sharpes, ddof=1)
    n = len(trial_sharpes)
    g = 0.5772156649015329
    sr0 = math.sqrt(v) * ((1 - g) * stats.norm.ppf(1 - 1 / n) + g * stats.norm.ppf(1 - 1 / (n * math.e)))
    return psr(r, sr0), sr0


def pbo(matrix, blocks):
    matrix = np.asarray(matrix)
    n_cfg, length = matrix.shape
    size = length // blocks
    parts = [(b * size, length if b == blocks - 1 else (b + 1) * size) for b in range(blocks)]

    def sharpe(row, chosen):
        x = np.concatenate([row[a:b] for a, b in (parts[i] for i in chosen)])
        return x.mean() / x.std(ddof=1)

    logits = []
    for train in itertools.combinations(range(blocks), blocks // 2):
        test = [i for i in range(blocks) if i not in train]
        ins = [sharpe(row, train) for row in matrix]
        best = int(np.argmax(ins))
        outs = [sharpe(row, test) for row in matrix]
        rank = sum(1 for x in outs if x < outs[best]) + 1
        w = rank / (n_cfg + 1)
        logits.append(math.log(w / (1 - w)))
    return sum(1 for l in logits if l <= 0) / len(logits), len(logits)


spot = {"BTC": ("spot", btc)}
runs = {
    "buyHold": backtest(lambda t, h: {"BTC": 1.0}, spot, 0),
    "smaTrend50": backtest(sma_trend, spot, 0),
    "volTarget": backtest(vol_target, spot, 0),
    "meanReversion": backtest(mean_reversion, spot, 0),
    "rotation": backtest(rotation, {"BTC": ("spot", btc), "ETH": ("spot", eth)}, 0),
    "carry": backtest(carry, {"BTC": ("spot", btc), "PERP": ("perp", perp)}, 0, max_gross=2.0),
}
grid = [backtest(lambda t, h, w=w: sma_trend(t, h, w), spot, 0) for w in (10, 20, 50, 100, 150, 200)]
excess = [np.asarray(g) - CASH / YEAR for g in grid]
trial_sr = [float(np.mean(g) / np.std(g, ddof=1)) for g in excess]
d, sr0 = dsr(runs["smaTrend50"], trial_sr)
p, splits = pbo([g[-800:] for g in excess], 8)

fixture = {
    "source": "scripts/research/reference.py (numpy %s, scipy %s)" % (np.__version__, __import__("scipy").__version__),
    "bars": {"BTC": btc, "ETH": eth, "PERP": perp},
    "funding": funding,
    "returns": {k: v for k, v in runs.items()},
    "metrics": {k: metrics(v) for k, v in runs.items()},
    "psr": {k: psr(v) for k, v in runs.items()},
    "cashRate": CASH,
    "deflated": {"dsr": d, "threshold": sr0, "trialSharpes": trial_sr},
    "pbo": {"pbo": p, "splits": splits, "blocks": 8, "windows": [10, 20, 50, 100, 150, 200], "lastDays": 800},
    "normal": {"cdf": {str(x): float(stats.norm.cdf(x)) for x in (-3, -1.5, -0.2, 0, 0.7, 2.1, 4)},
               "ppf": {str(q): float(stats.norm.ppf(q)) for q in (0.001, 0.02, 0.3, 0.5, 0.8, 0.975, 0.9999)}},
}
path = os.path.join(os.path.dirname(__file__), "../../packages/core/tests/fixtures/research-reference.json")
with open(path, "w") as f:
    json.dump(fixture, f)
print("wrote", os.path.normpath(path), {k: round(v["sharpe"], 4) for k, v in fixture["metrics"].items()}, "dsr", round(d, 4), "pbo", p)
