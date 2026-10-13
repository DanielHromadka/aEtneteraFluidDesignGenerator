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
