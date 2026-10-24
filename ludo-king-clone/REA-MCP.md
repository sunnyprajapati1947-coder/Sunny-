# REA MCP — Plugged 🔌

**Source:** https://github.com/morluto/rea (`rea-agents` v6.7.0, MIT)
**MCP server name:** `io.github.morluto/rea`
**Transport:** stdio via `npx -y rea-agents mcp`

## Is repo mein kahan plug hai

| File | Kis ke liye |
|---|---|
| `../.mcp.json` | Claude Code / generic MCP clients (repo root) |
| `../.cursor/mcp.json` | Cursor |
| `../.vscode/mcp.json` | VS Code (`servers` format) |
| `./.mcp.json` | Sirf is Ludo folder mein kaam karne par |

Sab mein ek hi registration hai:

```json
{
  "mcpServers": {
    "rea": {
      "command": "npx",
      "args": ["-y", "rea-agents", "mcp"],
      "env": { "REA_MCP_INPUT_SCHEMA_PROFILE": "compact" }
    }
  }
}
```

Agent ko restart karne par `rea` MCP tools available ho jayenge.
Official auto-setup chahiye to: `npx rea-agents setup`

## Verification (jo humne actually chalaya)

```bash
npx -y rea-agents --help        # rea@6.7.0 CLI OK
npx -y rea-agents doctor        # Node 22 OK; JS analysis ready (native engines optional)
npx -y rea-agents capabilities  # providers listed
npx -y rea-agents analyze-javascript-application ./ludo-king-clone --json
```

Static JavaScript/Electron analysis ke liye koi native engine (Hopper/Ghidra/IDA)
nahi chahiye — `doctor` mein unka "missing" hona is web app ke liye normal hai.

## Clean-room note

REA ka kaam hai kisi app ko samajhna. Ludo King ek copyrighted commercial app
hai, isliye humne usko reverse-engineer karke kuch copy **nahi** kiya.
Humne public Ludo rules (board layout, 6 par bahar, safe star, kata, home race)
se apna original code likha hai — REA ko sirf apni hi bani app ko verify
karne ke liye use kiya. Yahi sahi aur legal tareeka hai "same jaisa dikhe"
wala clone banane ka.

## Evidence (live run)

`analyze-javascript-application ./src` safal raha — REA ne hamari app ka
static JS graph banaya (`graph_id: jsrg_8af35784...`, authority:
shipped-artifact, koi code execute nahi hua). Pure folder par chalane par
`node_modules` bhi scan hota hai, isliye `src` par chalana behtar hai.

## v3.0 note — about "reverse engineer Ludo King"
REA is plugged in this repo and was used to analyze OUR OWN app. We did not
(and will not) point REA at the commercial Ludo King binary to extract its
code, art or branding — that would be copyright/trademark infringement, and
no such binary was provided anyway. Instead, every requested feature
(online rooms, lobby, captures, bonus turns) was implemented originally
from the public rules of Ludo. See README for the clean-room note.
