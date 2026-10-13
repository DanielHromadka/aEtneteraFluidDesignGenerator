# Fluid Poster Generator

Webová stránka, která z libovolného souboru (nebo textu) spočítá SHA-256 a z něj deterministicky vygeneruje „liquid silk“ plakát ve stylu reference v `image*.jpeg`.

- Spuštění: otevři `index.html` v prohlížeči (žádný build).
- Popis vizuálu a algoritmu: [DESIGN.md](DESIGN.md)
- `index.html#text` vygeneruje plakát pro daný text.

## Nasazení

Živě: https://boldnewera.pages.dev (Cloudflare Pages, projekt `boldnewera`). Nasazuje se jen `index.html`:

```sh
mkdir -p /tmp/dist && cp index.html /tmp/dist/
npx wrangler pages deploy /tmp/dist --project-name boldnewera --branch main
```

## MCP server (Claude)

`mcp/` je Cloudflare Worker s MCP nástrojem `generate_poster`. Vykresluje plakát přes Cloudflare Browser Rendering z živého webu, takže výsledek je stejný jako v editoru. Vrací obrázek a odkaz do editoru.

- Endpoint: `https://boldnewera-mcp.danielhromadka1.workers.dev/mcp`
- Auth: token (soubor `.mcp-token`, není v gitu) jako `Authorization: Bearer <token>`, nebo v cestě `/mcp/<token>`

Claude Code:

```sh
claude mcp add --transport http boldnewera https://boldnewera-mcp.danielhromadka1.workers.dev/mcp \
  --header "Authorization: Bearer $(cat .mcp-token)"
```

claude.ai: Settings → Connectors → Add custom connector → URL `https://boldnewera-mcp.danielhromadka1.workers.dev/mcp/<token>`.

Nasazení: `cd mcp && npm install && npx wrangler deploy` (token: `npx wrangler secret put MCP_TOKEN`).
Free plán Cloudflare: 10 min prohlížeče denně, nový prohlížeč cca jednou za 20 s.
