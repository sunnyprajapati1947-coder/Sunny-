"""Nova trading desk — multi-role market analysis, local-first.

Inspired by TauricResearch/TradingAgents: a multi-agent LLM financial trading
framework that mirrors a real trading firm (analysts, bull/bear researchers,
trader, risk management). Nova adapts the roles to its local lanes:

    price history -> deterministic stats -> analyst read
                 -> bull case + bear case (local model)
                 -> trader verdict -> risk guardrails

Hard rules that come from Nova policy, not this module:
- NOVA_BLOCK_AUTOMATIC_FINANCIAL_EXECUTION=true — Nova never places orders.
- Output is analysis only, never financial advice.
- Price data comes from Stooq's free CSV endpoint (no key).
"""
from __future__ import annotations

import csv
import io
import os
import re
from typing import Any
from urllib.request import Request, urlopen

MAX_ROWS = 400
SYMBOL_RE = re.compile(r"^[A-Za-z0-9.^-]{1,16}$")


def _clean_symbol(symbol: str) -> str:
    symbol = str(symbol or "").strip().upper()
    if not SYMBOL_RE.match(symbol):
        return ""
    return symbol


def _fetch_history(symbol: str, timeout: float = 10.0) -> list[dict[str, float]]:
    url = f"https://stooq.com/q/d/l/?s={symbol.lower()}&i=d"
    req = Request(url, headers={"User-Agent": "Nova-Assistant/1.0 (local-first)"})
    with urlopen(req, timeout=timeout) as response:
        raw = response.read(2_000_000)
    text = raw.decode("utf-8", errors="replace")
    if not text.strip() or text.strip().lower().startswith("przekroczony"):
        raise ValueError("No data for symbol.")
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for row in reader:
        try:
            rows.append({
                "date": row.get("Date", ""),
                "close": float(row["Close"]),
            })
        except (KeyError, TypeError, ValueError):
            continue
    if len(rows) < 30:
        raise ValueError(f"Only {len(rows)} rows returned; need at least 30.")
    return rows[-MAX_ROWS:]


def _sma(closes: list[float], window: int) -> float | None:
    if len(closes) < window:
        return None
    return sum(closes[-window:]) / window


def _rsi(closes: list[float], window: int = 14) -> float | None:
    if len(closes) < window + 1:
        return None
    gains, losses = 0.0, 0.0
    for i in range(-window, 0):
        change = closes[i] - closes[i - 1]
        if change >= 0:
            gains += change
        else:
            losses -= change
    if losses == 0:
        return 100.0
    rs = (gains / window) / (losses / window)
    return 100.0 - (100.0 / (1.0 + rs))


def _volatility(closes: list[float]) -> float | None:
    if len(closes) < 21:
        return None
    returns = [(closes[i] - closes[i - 1]) / closes[i - 1]
               for i in range(len(closes) - 20, len(closes))]
    mean = sum(returns) / len(returns)
    var = sum((r - mean) ** 2 for r in returns) / (len(returns) - 1)
    return var ** 0.5


def _max_drawdown(closes: list[float]) -> float | None:
    if len(closes) < 2:
        return None
    peak = closes[0]
    worst = 0.0
    for price in closes:
        peak = max(peak, price)
        if peak > 0:
            worst = min(worst, (price - peak) / peak)
    return worst


def compute_stats(rows: list[dict[str, float]]) -> dict[str, Any]:
    closes = [row["close"] for row in rows]
    latest = closes[-1]
    prev = closes[-2] if len(closes) >= 2 else latest
    change = (latest - prev) / prev if prev else 0.0
    sma20 = _sma(closes, 20)
    sma50 = _sma(closes, 50)
    rsi = _rsi(closes)
    vol = _volatility(closes)
    mdd = _max_drawdown(closes)
    trend = "uptrend" if sma20 and sma50 and sma20 > sma50 else (
        "downtrend" if sma20 and sma50 and sma20 < sma50 else "mixed")
    return {
        "rows": len(rows),
        "first_date": rows[0]["date"],
        "last_date": rows[-1]["date"],
        "latest_close": round(latest, 4),
        "change_1d_pct": round(change * 100.0, 3),
        "sma_20": round(sma20, 4) if sma20 else None,
        "sma_50": round(sma50, 4) if sma50 else None,
        "rsi_14": round(rsi, 2) if rsi is not None else None,
        "volatility_20d": round(vol, 5) if vol is not None else None,
        "max_drawdown_pct": round(mdd * 100.0, 2) if mdd is not None else None,
        "trend": trend,
    }


def _stats_brief(stats: dict[str, Any]) -> str:
    return (
        f"Latest close {stats['latest_close']} ({stats['change_1d_pct']:+.2f}% 1d), "
        f"SMA20 {stats['sma_20']}, SMA50 {stats['sma_50']}, RSI14 {stats['rsi_14']}, "
        f"20d volatility {stats['volatility_20d']}, max drawdown {stats['max_drawdown_pct']}%, "
        f"trend {stats['trend']}."
    )


def _offline_analysis(symbol: str, stats: dict[str, Any]) -> dict[str, Any]:
    """Deterministic read used when the local model lanes are offline."""
    bull = "Trend and momentum statistics do not show heavy selling pressure." \
        if stats["trend"] != "downtrend" else "Prices remain above the deepest drawdown point."
    bear = "Momentum is stretched and drawdown risk is real." \
        if (stats["rsi_14"] or 50) >= 70 or stats["trend"] == "downtrend" else \
        "RSI is not oversold and trend is not clearly bullish."
    return {
        "roles": {
            "analyst": f"{symbol}: {_stats_brief(stats)}",
            "bull_researcher": bull,
            "bear_researcher": bear,
            "trader": (
                "Bullish lean"
                if stats["trend"] == "uptrend" and (stats["rsi_14"] or 50) < 75
                else "Bearish lean" if stats["trend"] == "downtrend" else "Neutral / wait"
            ),
            "risk_manager": "Position sizing and stop-loss are mandatory; never all-in.",
        },
        "lane": "offline-deterministic",
    }


def _role_prompt(role: str, symbol: str, stats: dict[str, Any], history: str) -> str:
    brief = _stats_brief(stats)
    return (
        f"You are the {role} in Nova's market analysis desk for {symbol}. "
        f"Statistics: {brief}. {history} "
        f"Answer in 2 short sentences maximum."
    )


def market_analyze(symbol: str) -> dict[str, Any]:
    """Run Nova's multi-role market analysis for one ticker symbol.

    Analysis only: Nova never executes trades and this is not financial advice.
    """
    if not enabled():
        return {"success": False, "error": "Trading desk is disabled."}
    sym = _clean_symbol(symbol)
    if not sym:
        return {"success": False, "error": "Invalid ticker symbol."}

    try:
        rows = _fetch_history(sym)
    except Exception as exc:
        return {"success": False, "error": f"Could not load price history for {sym}: {exc}"}

    stats = compute_stats(rows)

    # Multi-role debate on the local lanes when available.
    roles: dict[str, str] = {}
    lane = "offline-deterministic"
    try:
        from core.fast_router import ask  # local lanes only, never a cloud key
        history = ""
        prompts = [
            ("analyst", "market analyst", ""),
            ("bull_researcher", "bull researcher", "Argue the bullish case."),
            ("bear_researcher", "bear researcher", "Argue the bearish case."),
        ]
        ok = True
        for key, role, extra in prompts:
            result = ask(_role_prompt(role, sym, stats, extra), timeout=15.0)
            if not result.get("success"):
                ok = False
                break
            roles[key] = str(result.get("answer") or "")[:600]
            history += f"{key}: {roles[key]} "
        if ok:
            trader = ask(
                _role_prompt("trader", sym, stats,
                             f"Analyst views: {history} Give a one-line stance."),
                timeout=15.0,
            )
            risk = ask(
                _role_prompt("risk manager", sym, stats,
                             "State the main risk and one guardrail in one line."),
                timeout=15.0,
            )
            if trader.get("success"):
                roles["trader"] = str(trader.get("answer") or "")[:600]
            if risk.get("success"):
                roles["risk_manager"] = str(risk.get("answer") or "")[:600]
            if {"analyst", "bull_researcher", "bear_researcher"} <= roles.keys():
                lane = "local-qwen"
    except Exception:
        roles = {}

    if not roles:
        offline = _offline_analysis(sym, stats)
        roles = offline["roles"]
        lane = offline["lane"]

    return {
        "success": True,
        "symbol": sym,
        "source": "stooq.com daily CSV (no key)",
        "stats": stats,
        "roles": roles,
        "lane": lane,
        "disclaimer": "Analysis only. Not financial advice. Nova never executes trades.",
    }


def enabled() -> bool:
    return os.getenv("NOVA_TRADING_DESK_ENABLED", "true").lower() == "true"
