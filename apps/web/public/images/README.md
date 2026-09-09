# Image Folders

## /images/banners/
Desktop and mobile hero banner images (data-driven via `apps/web/src/lib/promos.ts`).
- `hero-produce.jpg` — Legacy hero reference (keep for sourcing).
- `slide-flash.jpg` — Flash Sale slide artwork (recommended: 900x650px, right-side crop).
- `slide-budget.jpg` — Budget Pick slide artwork (recommended: 900x650px, right-side crop).
- `slide-popular.jpg` — Popular Right Now slide artwork (recommended: 900x650px, right-side crop).
- `slide-new.jpg` — New Arrivals slide artwork (recommended: 900x650px, right-side crop).
- `market-day.jpg` — Market Day sidebar image (recommended: 400x300px).

The mobile hero is a carousel that reuses the same four slide artworks.

Images are not hardcoded: edit `apps/web/src/lib/promos.ts` to point a slide at a
static file (`image.url`) or a live DB-served image (`image.storageKey` →
`/api/media/<key>`). A slide with no image (or a failed load) falls back to its
own gradient + icon, so it never looks wrong.

## /images/categories/
Category card images for the category grid.
- Name them by category slug: `fresh-vegetables.jpg`, `fresh-fruits.jpg`, etc.
- Recommended size: 200x200px

## /images/placeholder/
Fallback images when no product/category image exists.
- `product.jpg` — Default product image
- `seller.jpg` — Default seller avatar
