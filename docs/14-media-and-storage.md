# 14 — Media and storage

Property listings live or die on photographs. A Lagos listing with four decent photos of a real flat gets
enquiries; the same listing with stock images does not. This document defines the upload pipeline, the
transformation set, and the rules around who may store what.

## 1. Split of responsibilities

| Asset | Storage | Access model |
|---|---|---|
| Property photos and video | Cloudinary `image`/`video` | Public once published, private while in draft |
| Floor plans, site plans, title documents | Cloudinary `raw` | Staff and the owner only until released |
| Signed agreements, receipts, statements | Cloudinary `raw` | Signed URLs, logged |
| KYC and ID verification | Cloudinary `raw`, `visibility = 'private'` | Staff with `document_read_any`, access logged |
| Tenant avatars | Cloudinary `image` | Public read, signed write |
| Inspection photos | Cloudinary `image` | Ticket participants |

One provider for all of it. A second provider for documents would double the integration surface, the
credentials, and the failure modes, for no benefit.

## 2. Direct browser upload

The browser never proxies file bytes through the API.

```
1. GET  /v1/properties/{id}/media/upload-ticket
   → { "cloudName": "courtland", "apiKey": "…", "timestamp": 1789…, "signature": "…", "folder": "courtland/media/2026/09" }
   The signature is an HMAC of the timestamp and folder using CLOUDINARY_API_SECRET, computed server-side.
2. The browser POSTs the file directly to https://api.cloudinary.com/v1_1/courtland/image/upload
   with the signed parameters.
3. On 200, the browser sends only the resulting identifiers back:
   POST /v1/properties/{id}/media
   { "publicId": "courtland/media/2026/09/abc123", "width": 1600, "height": 1200,
     "bytes": 384112, "format": "jpg", "sortOrder": 0, "kind": "photo" }
4. The API validates the public_id prefix against the ticket's folder. A client cannot register an
   asset from someone else's folder, and cannot claim a public_id that Cloudinary does not have.
```

Why direct: an API instance streaming 8 MB video uploads burns memory and connection slots on the same
process that serves the listing page. Direct upload puts that load on Cloudinary's edge, where it belongs.

### 2.1 The upload ticket

| Field | Purpose |
|---|---|
| `cloudName` | The Cloudinary cloud |
| `apiKey` | Public by design; it identifies, it does not authorise |
| `timestamp` | Expiry check: the API rejects a signature older than 1 hour |
| `signature` | HMAC-SHA1 of `folder + timestamp` with the API secret |
| `folder` | Server-chosen per property and month, so an orphan is identifiable |

The API secret never leaves the server. The ticket's signature is scoped to one folder and one hour, so it
cannot be reused to upload to another property's folder.

### 2.2 Client-side optimisation

Before upload, the browser resizes and re-encodes through `browser-image-compression`:

| Constraint | Value | Why |
|---|---|---|
| Max dimension | 2560 px | Larger is wasted on a phone screen and in a carousel |
| JPEG quality | 0.82 | Visually indistinguishable, roughly 40% smaller |
| Max file | 8 MB | Cloudinary's limit |
| Video | H.264, 1080p, no audio | Audio is not needed for a property walkthrough |
| WebP | Where supported | ~30% smaller than JPEG at the same quality |

The server still validates. Client-side optimisation is for bandwidth and upload time; it is not a
security control, and the API trusts nothing it receives from the browser.

## 3. Transformations

Defined once as named transformations in the Cloudinary account, referenced by name. Transformation strings
are never built from user input.

| Name | Transformation | Used by |
|---|---|---|
| `card_sm` | `c_fill,g_auto,w_400,h_300,q_auto,f_auto` | Search result cards |
| `card_md` | `c_fill,g_auto,w_640,h_480,q_auto,f_auto` | Search grid, 2-column |
| `card_lg` | `c_fill,g_auto,w_960,h_640,q_auto,f_auto` | Search grid, 3-column |
| `hero` | `c_fill,g_auto,w_1600,h_900,q_auto,f_auto` | Listing hero |
| `gallery_full` | `c_limit,w_2000,q_auto,f_auto` | Lightbox |
| `thumb` | `c_fill,w_160,h_120,q_auto,f_auto` | Admin table, unit picker |
| `avatar` | `c_thumb,g_face,w_256,h_256,r_max,q_auto,f_auto` | Portal header |
| `avatar_sm` | `c_thumb,g_face,w_64,h_64,r_max,q_auto,f_auto` | Notice list |
| `blurhash` | `c_fill,w_32,h_24,q_1,e_blur:2000` | Placeholder while loading |
| `doc_preview` | `c_limit,w_1200,q_auto,f_auto` | PDF first page, via Cloudinary's PDF page selection |

`f_auto` means Cloudinary negotiates WebP or AVIF where the browser supports it. `g_auto` picks the focal
point automatically for `c_fill`, which stops a listing photo from being cropped to the neighbour's wall.

### 3.1 Serving

```ts
// packages/media/src/url.ts
export function mediaUrl(publicId: string, transform: TransformName, opts?: { blur?: boolean }) {
  const t = opts?.blur ? `${TRANSFORMS[transform]},e_blur:2000,q_1` : TRANSFORMS[transform]
  return `https://res.cloudinary.com/${env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/${t}/${publicId}`
}
```

`TRANSFORMS` is a closed record type. An arbitrary transformation string from a caller is not accepted, so
a caller cannot request a 10,000-pixel-wide render of a private document.

## 4. `property_media`

```sql
create table public.property_media (
  id                uuid primary key default gen_random_uuid(),
  property_id       uuid not null references public.properties (id) on delete cascade,
  cloudinary_id     text not null,
  kind              media_kind not null default 'photo',   -- photo|floor_plan|site_plan|video|360
  sort_order        int  not null default 0,
  width             int,
  height            int,
  bytes             int,
  format            text,
  caption           text,
  alt_text          text,
  blurhash          text,
  is_cover          boolean not null default false,
  created_by        uuid references auth.users (id),
  created_at        timestamptz not null default now(),
  unique (property_id, cloudinary_id)
);
```

### 4.1 Cover photo

Exactly one per property. Enforced with a partial unique index, not with application logic:

```sql
create unique index property_media_single_cover
  on public.property_media (property_id)
  where is_cover;
```

Setting a new cover in one statement:

```sql
update property_media set is_cover = false where property_id = $1;
update property_media set is_cover = true  where property_id = $1 and id = $2;
```

Two statements inside a transaction. The unique index makes a concurrent double-cover impossible: one of the
two transactions fails and retries.

### 4.2 Ordering

`sort_order` is a sparse integer. Reordering sends the whole ordered list:

```
PATCH /v1/properties/{id}/media/reorder
{ "orderedIds": ["…","…","…"] }
```

The API validates that the set of ids exactly equals the property's current media set. A partial list would
leave ambiguous ordering; a superset would let a client attach media it does not own.

### 4.3 Deletion

Deleting a `property_media` row does not delete the Cloudinary asset. It enqueues `media-orphan-cleanup`,
which deletes assets with no referencing row after 24 hours. The delay exists so an accidental deletion is
recoverable by re-registering the same public_id, and so a delete that was a client-side mistake does not
irreversibly destroy an asset within the same request.

Deleting a property cascades to `property_media` and enqueues the same cleanup.

## 5. Video and 360

| Kind | Support | Notes |
|---|---|---|
| `video` | Yes | H.264 MP4, up to 100 MB, poster frame generated by Cloudinary |
| `360` | Yes | Equirectangular projection, used for the virtual tour |

A video's poster frame is generated by Cloudinary (`so_0` on the transformed URL), so the listing card does
not load a video's first frame as a separate asset.

360 tours need a viewer. `@cloudinary/js-cloudinary-viewer` in `apps/web` renders the equirectangular image
with drag interaction. It is loaded lazily, only on a listing that has a 360 asset, so the bundle cost is
paid by the listings that need it and nobody else.

## 6. Validation

Server-side, in this order:

| Check | Rule | Rejected with |
|---|---|---|
| Content type | `image/jpeg`, `image/png`, `image/webp`, `video/mp4` | 422 |
| Bytes | ≤ 8 MB image, ≤ 100 MB video | 413 |
| Dimensions | Image ≤ 6000 px on the long edge; video ≤ 3840×2160 | 422 |
| Cloudinary public_id prefix | Must match the ticket's folder | 422 |
| Asset exists | Head request to Cloudinary | 422 |
| Count | ≤ 30 media per property | 409 |
| Ownership | The caller owns the property, or has `property_update_any` | 403 |

Dimension limits are not arbitrary. A 12000-pixel panorama is a legitimate 360 image and is accepted through
the 360 path with its own limit; it is not a phone photo that happened to come out wrong.

## 7. Alt text

`alt_text` is required before a property can be published.

| Rule | Reason |
|---|---|
| Required at publish | An image with no alt text is invisible to a screen-reader user and to a search engine |
| 10–160 characters | Long enough to describe, short enough to be read |
| Must not start with "image of" or "picture of" | Screen readers already announce that it is an image |
| Must describe the room, not the listing | "L-shaped kitchen with granite counters and a gas cooker", not "Nice flat in Lekki" |

The publish endpoint rejects a property with a cover photo that has no `alt_text`, with a 422 naming the
media id. This is a small requirement with a real effect on who can use the site.

## 8. Security

| Concern | Handling |
|---|---|
| Upload abuse | Signed upload tickets scoped to a folder and an hour. Rate limited per user. |
| Malicious images | Content-type verified against the actual asset by Cloudinary's `resource_type`. No SVG is accepted, since SVG can carry script. |
| Private document leakage | `visibility = 'private'` assets are served only through a signed URL minted after an RLS-scoped read, with a 5-minute expiry and an access log row. |
| Hotlinking | Allowed for published listing images, which is desirable for social sharing. Private assets use signed URLs, which prevent it. |
| Deleted-but-cached | A signed URL that has already been issued stays valid for up to 5 minutes. Accepted and documented; the alternative, a proxy, costs an API request per download. |
| Cross-property asset registration | The folder prefix check. A public_id from property A's folder cannot be attached to property B. |

## 9. Storage and cost

| Item | Plan | Limit |
|---|---|---|
| Cloudinary | Plus | 25 GB storage, 25 GB bandwidth/month |
| Estimated assets | ~2,000 properties × 12 photos × 400 KB | ~10 GB |
| Estimated bandwidth | 50,000 page views × 8 transformed images × 40 KB | ~16 GB/month |

Headroom is roughly 1.5×. The estimate is in the launch checklist; if actual usage approaches 80% of the
plan, the upgrade is the Plus → Pro step, which is a configuration change and not a code change.

`media-orphan-cleanup` is what keeps that estimate honest. Without it, every abandoned draft accumulates
photos forever, and storage cost is the most predictable way to have an unexpected bill.

## 10. Dead-code rules

| Rule | Enforcement |
|---|---|
| Every transformation is used | `tooling/scripts/check-media-transforms.mjs` cross-checks `TRANSFORMS` keys against `mediaUrl` call sites |
| No transformation string is built from input | A lint rule: `mediaUrl` takes a `TransformName`, not a string. The type system enforces it. |
| Every `media_kind` has a viewer component | Same test |
| No orphan asset | `media-orphan-cleanup` plus a nightly orphan count in the ops dashboard |
| Every viewer is reachable from a listing | Knip on `apps/web/src/features/properties` |

## 11. Related documents

- Property model these attach to: [`04-domain-model.md`](./04-domain-model.md)
- Document (PDF) storage, which is `raw` not `image`: [`12-documents-and-pdfs.md`](./12-documents-and-pdfs.md)
- `media-orphan-cleanup` job: [`11-scheduling-and-jobs.md`](./11-scheduling-and-jobs.md)
- Storage security: [`19-security.md`](./19-security.md)
- Env vars: [`22-configuration-and-environments.md`](./22-configuration-and-environments.md)
