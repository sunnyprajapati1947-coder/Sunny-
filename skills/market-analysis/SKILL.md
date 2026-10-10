---
name: market-analysis
description: Run Nova's multi-role market analysis for a ticker (analysis only, never trading advice)
tools: market_analyze
---

# Market Analysis

Adapted from the TradingAgents framework: analysts, bull/bear researchers,
trader, and risk manager debate one ticker.

## Steps

1. Take the ticker symbol from the user request (e.g. AAPL, RELIANCE.NS).
2. Call the `market_analyze` tool with the symbol.
3. Read `stats` first: trend, RSI, drawdown, volatility.
4. Summarize the roles in this order: analyst, bull, bear, trader, risk.
5. Always end with the disclaimer: analysis only, not financial advice,
   and Nova never executes trades.

## Guardrails

- Never place orders or connect brokerage accounts.
- If the tool fails (offline), say price data could not be loaded.
- Never present the output as a recommendation to buy or sell.
