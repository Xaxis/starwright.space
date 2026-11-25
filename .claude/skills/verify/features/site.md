# Site

The pieces around the pages: the 404 page, the icons, and the share card.

<!-- covers: page:404, asset:icons, asset:og-image -->

## Sub-features

- 404: any unknown path renders "No rung here" with links to the ladder, tower, inventions and start, with status 404.
- icons: `/icon.svg` (the mark), `/favicon.ico`, `/apple-icon.png`, named in the manifest.
- og-image: `/opengraph-image.png`, named by `og:image` on every page, absolute on the site's own domain.

## How to reach it

- `/no-such-page`; the browser tab icon; a link to the site pasted in a chat.

## How to check it

Static: none beyond the build.

Runtime:

```sh
curl -s -o /dev/null -w '%{http_code}\n' localhost:4527/no-such-page
curl -s localhost:4527/no-such-page | grep -o 'No rung here'
for a in /icon.svg /favicon.ico /apple-icon.png; do curl -s -o /dev/null -w "%{http_code} %{content_type} $a\n" localhost:4527$a; done
curl -s localhost:4527/ | grep -o '<meta property="og:image[^>]*>'
```

Proves it when: 404 and "No rung here"; each icon 200 with an image type; `og:image` points at `/opengraph-image.png` with width 1200 and height 630, on the site address in a build (`next dev` writes localhost there instead).

## Gotchas

- Regenerate icons with `tools/icons.ts` after editing icon.svg, and the card with `tools/og.ts` after changing the hero.
