# 12 — Documents and PDFs

Courtland produces and stores agreements, receipts, statements, inspection reports, and KYC files. The
storage model, the PDF pipeline, the signing flow, and the access rules are defined here.

## 1. What gets generated

| Document | Trigger | Template | Signed? | `documents.kind` |
|---|---|---|---|---|
| Tenancy agreement | Contract reaches `approved` | `lease_v1` | Yes | `tenancy_agreement` |
| Sale agreement | Contract reaches `approved` | `sale_v1` | Yes | `contract_of_sale` |
| Instalment agreement | An `installment` contract reaches `approved` | `installment_v1` | Yes | `installment_agreement` |
| Renewal agreement | Successor contract reaches `approved` | `lease_v1` | Yes | `tenancy_agreement` |
| Payment receipt | `payment.succeeded` | `receipt_v1` | No | `receipt` |
| Monthly statement | `statement-generate`, or on request | `statement_v1` | No | `monthly_statement` |
| Owner statement | `statement-generate`, for a landlord's portfolio | `owner_statement_v1` | No | `payout_statement` |
| Arrears notice | `arrears-sweep` or staff action | `arrears_notice_v1` | No | `arrears_notice` |
| Notice to vacate | Termination | `notice_to_vacate_v1` | No | `notice_to_vacate` |
| Title release | Title release approved and issued | `title_release_v1` | Yes | `title_release` |
| Payout advice | Payout initiated | `payout_advice_v1` | No | `payout_advice` |
| Inspection report | Staff action on a maintenance ticket | `inspection_report_v1` | No | `inspection_report` |
| KYC bundle | Staff action during owner verification | `kyc_bundle_v1` | No | `kyc_bundle` |

Twelve templates. Each is a handlebars template plus a type, with a version. A `documents` row records both
`kind` and `template_version`, so a document from 2026 says what it says forever and a template edit never
retroactively changes a released document.

There is no commission statement. "Agent" in Courtland means the landlord's own agent or vendor, recorded as
`owners.owner_type = 'agent'`; there is no Courtland sales force with commission runs in v1, so a template
and a payout run for one would both be dead code.

## 2. Storage

Cloudinary for bytes, Postgres for metadata. Never a database blob, never a filesystem path.

| Item | Where | Why |
|---|---|---|
| PDF bytes | Cloudinary, `resource_type: 'raw'`, `folder: 'courtland/documents/{yyyy}/{mm}'` | Offloads the API, survives redeploys, has signed URLs |
| Image bytes | Cloudinary, `resource_type: 'image'`, `folder: 'courtland/media/{yyyy}/{mm}'` | Transformation pipeline for thumbnails |
| Metadata | `documents` table | Queryable, RLS-protected, auditable |
| Access log | `document_access_log` | Who read what, when |

Why Cloudinary rather than Supabase Storage: signed URLs with a short expiry, image transformations for
the gallery, and it does not compete with the database for resources on a small Supabase plan.

Why not Postgres: a 2 MB PDF in a `bytea` column makes every `select *` on `documents` load megabytes, and
backups grow by a factor that has nothing to do with the data's importance.

### 2.1 The `documents` row

| Column | Purpose |
|---|---|
| `id`, `contract_id`, `property_id`, `owner_id`, `owner_user_id` | Scope. At least one is set. |
| `origin` | `generated` or `uploaded`. Decides whether a template is required, and the table CHECK enforces it |
| `kind` | The `document_kind` enum in [`05 § 4`](./05-database-schema.md#4-enums): eleven generated kinds, then the uploaded-evidence kinds |
| `template_key`, `template_version` | What generated it, pinned at generation time |
| `rendered_data` | The JSON the template was rendered with, kept so a document can be explained years later |
| `storage_public_id`, `mime_type`, `byte_size`, `page_count`, `checksum_sha256` | Storage and integrity |
| `status` | `draft`, `generated`, `signed`, `released`, `superseded`, `void` |
| `visibility` | `private`, `staff`, `counterparty`, `public` |
| `version`, `supersedes_document_id`, `created_by`, `expires_at` | Lineage |

`storage_public_id`, `byte_size` and `checksum_sha256` are nullable for exactly one reason: a `draft` row is
inserted before `generate-document` runs, so a render failure leaves a row with no file instead of no row. The
CHECK constraints in [`05 § 10.1`](./05-database-schema.md#101-documents) make those three nullable exactly
when `status = 'draft'` and mandatory the moment it is not, so nothing can be signed or released without bytes
behind it.

### 2.2 Access, not file paths

A `documents` row being readable is one decision; the file being fetchable is another. Both are required,
and both are server-side.

```
GET /v1/documents/{id}/download
1. SELECT ... FROM documents WHERE id = $1
   -- RLS applies. If the row is not visible, this returns zero rows and the API returns 404.
2. If visibility = 'private', require document_read_any and write an audit row.
3. Generate a Cloudinary signed URL, 5-minute expiry, response-content-disposition attachment.
4. INSERT INTO document_access_log (document_id, user_id, ip, user_agent, reason)
5. Return { url, expiresAt }
```

The API never proxies the bytes. A signed URL means the download goes Cloudinary → browser directly, so a
2 MB PDF does not consume an API instance, and an expired URL is worthless.

The `reason` parameter is required when a staff member downloads a `visibility = 'private'` document. It
goes in the audit log and is what makes an access log worth keeping.

## 3. Generation pipeline

```
1. A document row is inserted with status = 'draft' and no storage_public_id.
2. INSERT INTO outbox_events (event_type = 'document.requested', payload = { documentId })
3. inngest 'generate-document' runs:
     a. step 'load'       read the document row and its source data through RLS-free service reads
     b. step 'render'     handlebars → PDFKit → Buffer, in memory
     c. step 'upload'     Cloudinary upload, `resource_type: 'raw'`
     d. step 'persist'    write storage_public_id, byte_size, checksum_sha256, page_count; status = 'generated'
     e. step 'release'    if visibility allows, status = 'released'
4. 'release-document' handles the case where a document was generated as private and later released.
```

Generation is asynchronous because it is slow: a 12-page agreement with an embedded font takes 2–4 seconds,
and doing that inline inside a contract activation request would hold an HTTP connection open and risk a
gateway timeout at the worst moment. The client is told `202` with a `pollUrl`.

```
POST /v1/contracts/{id}/activate
→ 202 Accepted
{ "data": { "status": "generating", "documentId": "…", "pollUrl": "/v1/documents/…" } }
```

### 3.1 Rendering

`packages/pdf` owns the renderer. One package, three consumers: the API, and scripts. It is the only place
allowed to import `pdfkit`.

```ts
// packages/pdf/src/render.ts
export async function renderPdf(
  templateKey: string,
  data: TemplateData,
): Promise<{ buffer: Buffer; pageCount: number; checksum: string }> {
  const tpl = await loadTemplate(templateKey)     // compiled handlebars, cached
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true })

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks)
      resolve({ buffer, pageCount: doc.bufferedPageRange().count, checksum: sha256(buffer) })
    })
    doc.on('error', reject)

    doc.pipe(createRenderStream(tpl, data, doc))
    doc.end()
  })
}
```

`bufferPages: true` because the footer needs the page count, which is only known after the last page. The
footer is stamped in a second pass.

### 3.2 Fonts

Embedded, not linked. A PDF that fetches a font at render time will look different on the recipient's
machine, and in the worst case will show nothing.

| Use | Font | Licence |
|---|---|---|
| Body | Inter | SIL Open Font License 1.1 |
| Headings | Inter SemiBold | Same |
| Amounts in figures | Inter tabular numerals | Same |
| Signature blocks | Handwritten, raster image | Not embedded as a font |

Inter's tabular numerals matter for money columns: proportional digits make a column of figures look
uneven, and a receipt where the amounts do not line up reads as a fake receipt.

### 3.3 Templates

```
packages/pdf/templates/
  lease_v1.handlebars               tenancy and renewal agreement
  sale_v1.handlebars                sale agreement
  installment_v1.handlebars         instalment payment plan agreement
  receipt_v1.handlebars             payment receipt
  statement_v1.handlebars           tenant monthly statement
  owner_statement_v1.handlebars     landlord portfolio statement
  arrears_notice_v1.handlebars      arrears notice
  notice_to_vacate_v1.handlebars    notice to vacate
  title_release_v1.handlebars       title release
  payout_advice_v1.handlebars       payout advice
  inspection_report_v1.handlebars   maintenance inspection report
  kyc_bundle_v1.handlebars          compiled KYC pack
  partials/                         header, footer, moneyTable, partyBlock, clause, signatureBlock
```

Versioned in the filename. A change to `lease_v1` after release would rewrite what "v1" means, so a change
means a new file: `lease_v2`. Old rows keep pointing at `lease_v1`, which is why the row records
`template_version`.

Each template has a partial structure:

```hbs
{{> header title=title reference=contract.reference }}
<section class="parties">
  {{#each parties}}
    <p>{{roleLabel}}: {{name}}{{#if signatureDocumentId}} — signed {{signedAt}}{{/if}}</p>
  {{/each}}
</section>
<section class="money">
  {{> moneyTable rows=scheduleLines totals=totals currency=currency}}
</section>
{{> footer pageCount=pageCount}}
```

`{{> moneyTable}}` is a partial that formats every amount through `formatNaira`, so no template can print
`45000000` without the naira sign and separators, and no template can round.

### 3.4 What the agreement contains

A Nigerian residential tenancy agreement needs more than a rent figure. The template covers the sections
that matter and are commonly missing:

1. Parties, with full legal names, addresses, and identification numbers
2. The premises, described by address and by unit identifier
3. The term, start and end dates
4. Rent, the period, the due date, and the escalation cap
5. The security deposit, and the conditions for its return
6. Service charge and what it covers
7. Utilities and who pays each one
8. Maintenance obligations on both sides
9. Repair and alterations
10. Access by the landlord, with notice
11. Assignment and subletting
12. Default and remedies
13. Termination and notice periods
14. Jurisdiction and dispute resolution
15. The Rent Control Act 2023, referenced explicitly where the escalation cap applies
16. Signatures, dates, and witness details

The template's `terms` object is populated from the contract's `terms` JSONB, so staff compose clauses from
a validated set rather than typing free text into a legal document. A `custom_clauses` array exists for the
rare negotiated addition, and it is rendered in a visually distinct block with a note that it is an
amendment.

## 4. Signing

No third-party e-signature product in v1. Nigerian tenancy agreements are commonly signed by hand and
scanned, and integrating a signature vendor adds cost and a data-residency question for a flow that a
photograph solves.

```
1. Staff generates the agreement. status = 'generated', visibility = 'counterparty'.
2. Both parties receive the document in their portal and a signed-in link by SMS.
3. Each party signs on paper, or in the portal on a canvas if they choose to.
4. Upload: the signed PDF or a photo of each page.
   → Cloudinary, folder 'courtland/signatures/{contractId}'
   → documents row, kind = 'signature', status = 'signed'
   → contract_parties.signature_document_id set, signed_at set
5. Staff marks the contract 'executed' once all required parties have signed.
   → the original unsigned agreement is superseded but retained
   → status = 'released'
```

The canvas signature produces a transparent PNG placed onto a PDF page with PDFKit. It is an image of a
signature, and it is treated as one: it is not a cryptographic signature, the template says so, and a
dispute goes to the same evidence as any other scan.

What is stored is the signed artefact and the timestamp and the identity of the uploader. That is enough
for the practical purpose and honest about what it is.

## 5. Statements and receipts

### 5.1 Receipt

Generated on `payment.succeeded`, from the ledger row and its allocations.

```
Courtland — Payment Receipt
Receipt: RCP-2026-000412-03
Date: 30 August 2026, 16:02

Payer:   Amaka Okonkwo
Contract: CL-2026-000412, 3-bed flat, Lekki Phase 1
Amount received:      ₦37,500.00
Provider fee:        −   ₦562.50
Net credited:         ₦36,937.50

  Rent, October 2026            ₦37,500.00
  to landlord                   ₦36,387.50
  Courtland management fee       ₦   562.50

Method: Card ending 4417
Reference: PSK_9fj20dk1
```

The allocation breakdown is shown. A tenant who sees a management fee and wonders why the credited amount
is less than what they paid has their answer on the receipt.

### 5.2 Monthly statement

For tenants and for owners, generated on the 1st of each month by `statement-generate`.

| For a tenant | For an owner |
|---|---|
| Rent due and paid per month | Rent collected per property |
| Arrears brought forward and cleared | Deductions: maintenance, repairs |
| Deposits held | Payouts made |
| Service charges | Funds held |
| Notices served | Fees earned |

Both are generated from the ledger, never from a running total on the contract, so a statement and the
ledger cannot disagree.

## 6. Retention

| Document | Retention | Basis |
|---|---|---|
| Agreements, terminated contracts | 7 years after termination | Limitation Act; practical dispute window |
| Receipts, statements, payout advice | 7 years | Tax and audit |
| KYC and ID verification | 7 years after the relationship ends | AML/CFT obligations |
| Inspection reports and photographs | 3 years after the ticket closes | Dispute window |
| Draft, never released | 30 days, then deleted by `document-cleanup` | Not a record of anything |
| Superseded drafts | 30 days after supersession | Not a record of anything |
| `private` staff documents | 7 years, access logged | Investigation |

Deleting a draft is different from deleting a record. `document-cleanup` only touches rows that were never
released, which is why `status` and `released_at` are separate fields.

## 7. Failure modes

| Failure | Handling |
|---|---|
| Template missing or invalid | Job fails, retries twice, then alerts. The document row stays `draft`. The contract is not blocked: a contract can be `approved` with a failed document, and the UI says so. |
| Font fails to load | Job fails. Rendered output without a font is worse than no output. |
| Cloudinary upload fails | Job retries. `media-orphan-cleanup` catches assets uploaded without a row. |
| Signed upload is not a PDF | Rejected at upload with a 422. The client re-photographs. |
| A PDF has a virus or malformed structure | Not scanned in v1. Sources are the parties themselves and Cloudinary's own scan. Recorded as a known gap in [`19-security.md`](./19-security.md). |
| Template change breaks rendering in production | Versioned templates mean the deployed version is the tested version. A deploy that removes a template fails `tooling/scripts/check-template-usage.mjs` in CI. |
| Generation exceeds the job timeout | 120-second step timeout; PDFKit on a 12-page document takes seconds, so a timeout means a real problem and should alert. |

## 8. Dead-code rules

| Rule | Enforcement |
|---|---|
| Every template is used | `tooling/scripts/check-template-usage.mjs` cross-checks `document.kind` values against the template directory |
| Every template has a fixture test | Renders with sample data in CI; a template that throws fails the build |
| Every `documents.kind` has a template | Same test |
| No unused partial | Knip on `packages/pdf/templates/**/*.handlebars` partial usage |
| No orphan Cloudinary asset | `media-orphan-cleanup` plus a nightly count in the reconciliation report |

## 9. Related documents

- Cloudinary upload and transformations: [`14-media-and-storage.md`](./14-media-and-storage.md)
- Notification of a generated document: [`13-notifications.md`](./13-notifications.md)
- RLS for `documents`: [`07-authorization-and-rls.md`](./07-authorization-and-rls.md#46-documents)
- The `generate-document` job: [`11-scheduling-and-jobs.md`](./11-scheduling-and-jobs.md)
- Compliance retention: [`25-nigeria-compliance.md`](./25-nigeria-compliance.md)
