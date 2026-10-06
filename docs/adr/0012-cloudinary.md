# ADR 0012: Cloudinary for media and documents, with direct browser upload

- Status: Accepted
- Date: 2026-02-15
- Deciders: Lead developer

## Context

Courtland stores property photographs and video, floor plans, signed agreements, receipts, statements, and
identity documents. The requirements are different per type: images need transformations and fast delivery;
documents need private access and short-lived signed URLs; everything needs an audit trail of who read what.

Volumes are modest: around 2,000 properties with 12 photographs each, growing slowly.

## Decision

**Cloudinary** for all file bytes, both images and raw documents. Postgres holds metadata only.

| Concern | Implementation |
|---|---|
| Upload path | Browser to Cloudinary directly, via a server-signed upload ticket scoped to a folder and an hour |
| Metadata | `property_media` and `documents` rows, RLS-protected |
| Image delivery | Named transformations: `card_sm`, `card_lg`, `hero`, `thumb`, `avatar`, `blurhash` |
| Private files | Signed URLs, 5-minute expiry, minted after an RLS-scoped read, with a `document_access_log` row |
| Format negotiation | `f_auto` so WebP or AVIF is served where supported |
| Bytes never through the API | The API mints signatures and reads rows; it does not proxy files |

## Alternatives considered

**Supabase Storage.** Rejected. It works and shares a bill with the database, but it lacks the transformation
pipeline, which is the main reason for Cloudinary: a 4000-pixel upload becomes a correctly cropped 400-pixel
card, a 256-pixel avatar, and a 32-pixel blurhash without three separate uploads. Image optimisation is most
of the appeal of a property site.

**Store image bytes in Postgres as `bytea`.** Rejected firmly. Every `select *` on `property_media` would
load megabytes, backups grow by a factor unrelated to the data's importance, and serving an image would
consume an API instance.

**An S3 bucket plus CloudFront or Imgix.** Rejected. This is what a larger operation would run, and it is
roughly the same capability at four times the configuration: bucket, policy, CDN distribution, an image
processor, signed-URL signing, and lifecycle rules. Cloudinary wraps all of that in one account.

**Upload through the API.** Rejected. An 8 MB video upload through an Express instance consumes memory and a
connection slot on the same process serving the listing page.

**Two providers, Cloudinary for images and something else for documents.** Rejected. Two integrations, two
credential sets, two failure modes, for no benefit. Cloudinary's `raw` resource type handles documents
properly.

**Local disk with an nginx serve.** Rejected. Render's filesystem is ephemeral, so a file would vanish on
redeploy.

## Consequences

**Easier.** Image optimisation is one URL change rather than a re-upload. Signed URLs mean the API does not
proxy bytes, so a 2 MB download costs nothing on the API. One provider for everything. Transformations are
named and referenced, so they cannot be built from user input.

**Harder.** An external dependency for every image, with a per-delivery bandwidth cost. Upload tickets add a
signature step that must be right or uploads fail. Private-document access is only as good as the expiry and
the audit write. `resource_type: 'raw'` for documents means the image transformation names do not apply, so
document previews need their own path.

**Cost.** Around 25 GB storage and 25 GB bandwidth on the Plus plan, estimated at roughly 60% utilisation at
launch. `media-orphan-cleanup` is what keeps that estimate honest, because abandoned drafts otherwise
accumulate photographs indefinitely.

## Revisit when

- Bandwidth consistently exceeds 80% of the plan. Check: Cloudinary's usage dashboard.
- Cost per GB becomes materially cheaper elsewhere at launch volume. Check: a total-cost comparison with S3
  plus an image processor.
- Upload failure rate from Cloudinary exceeds 1%. Check: the upload error rate in the observability dashboard.

Moving to S3 at that point is a change of URL signing and a static transform strategy, not a data migration,
because metadata is already in Postgres.

## Related

- [`../14-media-and-storage.md`](../14-media-and-storage.md)
- [`../12-documents-and-pdfs.md § Storage`](../12-documents-and-pdfs.md#2-storage)
- [`../19-security.md § Transport`](../19-security.md#11-transport-and-headers)
