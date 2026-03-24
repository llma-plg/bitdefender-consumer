# MCP Apps on Adobe I/O Runtime

Build [MCP Apps](https://modelcontextprotocol.github.io/ext-apps/) on Adobe I/O Runtime. Create AI tools with interactive widgets that render in any MCP-compatible host (Claude, Cursor, etc.).

Uses the **official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)** with the [MCP Apps extension](https://modelcontextprotocol.github.io/ext-apps/api/documents/Overview.html) for delivering interactive UIs alongside tool results.

## How It Works

1. **`actions.json` drives registration.** Every entry in `actions.json` becomes an MCP tool. The file contains all metadata: name, description, input schema, annotations, widget config, etc.
2. **Handler folders are optional.** If `actions/<name>/index.js` exists, it provides the tool handler. If no folder exists, the tool is still registered but returns empty content.
3. **Widgets are auto-wired.** Actions with `widget.html` or EDS config in `actions.json` get a `ui://` resource registered automatically. Hosts that support MCP Apps render it in a sandboxed iframe.
4. **Progressive enhancement.** All tools return text for any MCP client. Widget-enabled hosts also get the rich UI.

## `actions.json` Lifecycle

| Environment | Source | How it gets there |
|-------------|--------|-------------------|
| **Local dev** | `actions.example.json` | Copy to `actions.json` manually |
| **Production** | Database (via UI) | Deploy pipeline fetches from API, writes `actions.json` before build |

In production, `actions.json` is **replaced** by the deploy pipeline with whatever actions the user has defined for that app in the UI. The local file is never used in production.

`actions.json` is gitignored. `actions.example.json` ships with the template as a starting point.

## Quick Start

```bash
cp actions.example.json actions.json  # Local dev config
npm install
npm test
npm run dev
```

## Adding a New Action

1. **Define it in `actions.json`** with name, description, inputSchema, annotations, and optional widget config.
2. **(Optional) Add a handler** at `actions/<name>/index.js`. Without a handler, the tool returns empty content -- useful for widget-only actions.
3. **(Optional) Add a widget** via one of:
   - `actions/<name>/widget.html` -- custom self-contained HTML
   - EDS config in `actions.json` (`widget_type: "EDS"` + `eds_widget`) -- auto-generated `aem-embed` template
4. The loader picks it up automatically -- no registration boilerplate needed.

## Action Types

| Type | Handler folder | Widget | Use case |
|------|---------------|--------|----------|
| Tool only | `actions/<name>/index.js` | -- | Computation, API calls |
| Tool + widget | `actions/<name>/index.js` + `widget.html` | Custom HTML | Interactive UI with custom logic |
| Tool + EDS widget | `actions/<name>/index.js` | EDS config in `actions.json` | AEM Edge Delivery content |
| Widget only (no handler) | -- | EDS config in `actions.json` | Pure widget, no server logic |

## Widget Resolution Priority

1. `widget.html` file in the action directory (always wins)
2. EDS config in `actions.json` (auto-generates `aem-embed` template)
3. No widget (tool-only)

## `content` vs `structuredContent`

| | `content` | `structuredContent` |
|---|-----------|---------------------|
| **Consumer** | LLM / text-only hosts | Widget (iframe) |
| **Format** | `[{ type: 'text', text: '...' }]` | Arbitrary JSON |
| **Token cost** | Counts against context window | Zero (not sent to LLM) |

## Project Structure

```
your-mcp-app/
├── server/
│   ├── index.js               # Entry point, request routing
│   └── loader.js              # Config-driven action registration
├── actions/                   # Handler directories
│   └── echo/
│       └── index.js           # Example: simple echo tool
├── test/
│   ├── fixtures/actions.json  # Test config
│   └── server.test.js
├── actions.example.json       # Copy to actions.json for local dev
├── actions.json               # ← gitignored, generated in production
├── app.config.yaml            # I/O Runtime config
├── webpack.config.js
└── package.json
```

## Deployment

```bash
npm run build    # Webpack → dist/index.js
npm run deploy   # Deploy to I/O Runtime
```

In production, the deploy pipeline handles build and deploy automatically. It fetches the app's action definitions from the API, writes `actions.json`, runs `npm install && npm run build`, and deploys the bundle to Adobe I/O Runtime.
