# Nova — public-apis Import Plan

Source:
public-apis/public-apis (a collective list of free APIs)

What Nova adopted:
- A curated offline copy of the no-auth, HTTPS-only entries from
  assistant-useful categories.
- Working no-key clients for the best four services an assistant uses:
  wttr.in (weather), Frankfurter (currency), dictionaryapi.dev (definitions),
  Wikipedia REST (topic summaries).

Where it lives:
- core/data/api_directory.json (curated by github/curate_source_data.py)
- core/public_api_tools.py (api_weather / api_currency / api_dictionary /
  api_wikipedia / api_directory_search)

Rules:
1. Read-only HTTP GET with bounded timeouts and response sizes.
2. No API keys, no accounts, no telemetry.
3. Every failure degrades gracefully so Nova stays usable offline.
