# ADR 0013: PDFKit for generation, handlebars for templates

- Status: Accepted
- Date: 2026-02-15
- Deciders: Lead developer

## Context

Courtland generates eleven document types: tenancy and sale agreements, receipts, monthly statements, arrears
notices, notices to vacate, inspection reports, payout advice, commission statements, and KYC bundles. These
are legal and financial documents. They need to look professional, paginate correctly, embed fonts, show money
accurately, and be reproducible.

The templates change when a clause changes or a court requires something different, which means they must be
editable by someone who is not a programmer, or at least reviewable in a diff.

## Decision

**Handlebars** for the template language and **PDFKit** for rendering, in a single `packages/pdf` package.

```ts
const { buffer, pageCount, checksum } = await renderPdf('lease_v1', data)
```

| Concern | Implementation |
|---|---|
| Templates | Handlebars files, versioned in the filename: `lease_v1`, `lease_v2` |
| Rendering | PDFKit, streaming to a buffer |
| Fonts | Inter, embedded. Never linked |
| Money | Every amount through `formatNaira`, in a shared `moneyTable` partial |
| Page numbers | `bufferPages: true`, footers stamped in a second pass |
| Reproducibility | The document row records the template and version, so a document from March says what it said |
| Change control | A change to a template means a **new file**. Editing `lease_v1` would rewrite what "v1" means |
| Rendering location | In the worker, asynchronously. The API returns `202` with a `pollUrl` |

## Alternatives considered

**Puppeteer or Playwright printing HTML.** Rejected. The output quality is excellent and the templates would be
HTML, which is easier to edit. The costs are decisive: a Chromium instance per render, roughly 300 MB of
memory, several seconds per document, and font rendering that can differ between the build machine and CI.
Courtland generates a receipt per payment and a statement monthly per tenant, so this is a hot path.

**React-PDF.** Rejected. Ties document generation to React, which is awkward in the worker process, and its
layout model is less capable than PDFKit's for a paginated legal document.

**LaTeX.** Rejected. Excellent output, and a poor fit for a template that Nigerian legal content must be able
to edit: LaTeX escaping alone is a source of document corruption, and a font or package problem fails at build
time rather than runtime.

**Docx templates with an office document library.** Rejected. Office documents are for editing, not for
archival. A lease agreement should be a PDF that cannot be casually altered, with a checksum.

**HTML to PDF via a service.** Rejected. An external dependency for every document, plus a data-transfer
question for legal documents containing identity data.

**Handlebars versus Mustache versus EJS versus a typed template.** Handlebars because it has partials, which
is what makes eleven document types share a header, footer, party block, and money table; and because it
escapes by default. The triple-stache is banned by lint, because unescaped interpolation is how a property
title containing `<script>` reaches a tenant's PDF viewer.

## Consequences

**Easier.** Layout is precise, output is deterministic, rendering is a few hundred milliseconds of CPU with no
browser. Templates are plain text, diffable, and reviewable. Versioned templates mean a deployed template is
always a tested one.

**Harder.** PDFKit's absolute positioning is manual; a page break in the wrong place is a layout bug, not a
CSS problem. Templates must use the shared partials rather than their own money formatting, which is enforced
by a lint rule and a fixture test. Adding a template version is a new file, so the template directory grows.

**Cost.** Roughly a day per new document type after the pipeline exists. Typesetting a new agreement is the
bulk of it, and it needs a lawyer's review anyway.

## Revisit when

- A document type needs a layout PDFKit cannot produce well, such as a complex table with merged cells across
  pages. Check: a template requiring manual coordinate arithmetic for a table.
- More than about 30 document types exist. Check: the template directory exceeding 30 files with a shared
  partial library.
- Font embedding fails on a specific script. Check: a document needing a script Inter does not cover.

If the first condition appears, an HTML-to-PDF path for that document type only is the pragmatic answer: two
renderers, chosen per template, with the template declaring which.

## Related

- [`../12-documents-and-pdfs.md`](../12-documents-and-pdfs.md)
- [`../09-contracts-and-billing.md § The billing schedule`](../09-contracts-and-billing.md#4-the-billing-schedule)
- ADR 0007, the money representation templates must respect
