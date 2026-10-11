# Nova — TradingAgents Import Plan

Source:
TauricResearch/TradingAgents (multi-agent LLM financial trading framework)

What Nova adopted:
- The trading-firm role structure: analyst, bull researcher, bear researcher,
  trader, risk manager.
- The idea of a multi-role debate before any market stance.
- Free no-key price history (Stooq daily CSV) with deterministic statistics.

Where it lives:
- core/trading_desk.py (market_analyze)
- skills/market-analysis/SKILL.md

Rules:
1. NOVA_BLOCK_AUTOMATIC_FINANCIAL_EXECUTION stays true: Nova never places
   orders and never connects a brokerage account.
2. Output is analysis only and always carries the not-financial-advice
   disclaimer.
3. Falls back to a deterministic offline read when local lanes are down.
