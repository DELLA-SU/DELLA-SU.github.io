# Public Dropi publication

The GitHub Pages site at https://della-su.github.io/ is served from `docs/` on
`codex/dropi-review-pages`. The repository's default `main` branch and its
wardrobe prototype are preserved separately. Local wardrobe work should continue
on its existing branch; it is not part of the published Dropi directory.

The converter snapshot comes from DELLA-SU/dropi commit
`a057e4baf436d7810ba0ed5e168556cc6950442a`. Root-relative links, canonical URLs,
the sitemap and analytics configuration are adapted for the domain root.
The existing https://della-su.github.io/dropi/ project site is not reconfigured.

Run `npm ci` and `npm test` for analytics and conversion checks. The four
practical guides, contact page and privacy notice are static HTML inside `docs/`.
Keep the existing publisher ID and affiliate disclosure accurate when updating.
Publishing a website is separate from Google AdSense approval.

To restore the earlier wardrobe publication, change this repository's Pages
source back to `main` and `/`. No force-push or deletion is necessary.
