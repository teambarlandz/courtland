# Courtland Property Management & Sales System

## Project Specifications & Architecture Document

### 1. Project Overview

Courtland is a comprehensive, full-service real estate web application designed to handle both property management and real estate sales across the Nigerian market. The system manages diverse property types (from multi-tenanted "face-me-I-face-you" setups to luxury flats, self-contained apartments, and land sales). It streamlines listings, tenant onboarding, buyer installment tracking, rent payments, legal compliance, and landlord/vendor payouts.

### 2. Brand Identity & UI/UX Guidelines

* **Primary Color:** Espresso (deep, warm, premium)
* **Background/Base Color:** Ivory
* **Text & Contrast:** Espresso Brown or Charcoal (avoid pure black for a softer, premium contrast against Ivory)

#### Animation & Micro-interactions
Animations should be smooth, grounded, and deliberate to evoke trust and stability:
* **Property Card Lift:** Cards lift slightly (`-translate-y-1`) with a deeper shadow on hover for a tactile feel.
* **Fade & Slide-Up:** Page content fades in from 0% opacity and slides up slightly (20px) to allow images to load gracefully.
* **Skeleton Pulses:** Admin dashboards use pulsing ivory/light gray skeleton loaders while fetching data, preventing layout shifts.
* **Press State:** Buttons scale down by 5% (`active:scale-95`) when clicked to provide immediate physical feedback and prevent double-clicks.
* **Number Tallying:** Metric cards rapidly tally up from zero to their actual value on load.

### 3. User Roles & Workflows

#### A. Visitors (Public)
* Browse available property and land listings (filtered by Sale vs. Rent).
* View property details, images, sizes, and pricing.

#### B. Tenants (Renters)
* **Tenant Portal:** Authenticated dashboard for active renters.
* **Payments:** View upcoming rent/due dates, pay rent and service charges, and download automated receipts.
* **Maintenance:** Raise tickets for compound/room issues.
* **Legal Docs:** Access tenancy agreements and house rules.

#### C. Buyers (Purchasers)
* **Buyer Portal:** Authenticated dashboard for tracking property or land purchases.
* **Installment Tracking:** View total property cost, amount paid, and upcoming installment due dates.
* **Document Access:** Access Offer Letters, Contracts of Sale, Receipts, and ultimately, Title Deeds/Survey Plans upon completion of payment.

#### D. Landlords & Property Vendors
* **Registration:** Register and apply for Courtland to manage or sell their properties/land.
* **Financial Dashboard:** View total earnings, pending payouts, sale progress, and itemized maintenance deductions for rentals.
* **Asset Overview:** View the real-time status of their assets managed by Courtland (e.g., vacant, occupied, sold).

#### E. Admins (Courtland Back Office)
* **Granular Management:** Manage properties down to the room level for rentals, or track plot allocations for land sales.
* **Legal Tracking:** Verify who holds the legal tenancy/sale agreement versus who is occupying the space.
* **Dynamic Filtering:** Create custom filters to sort clients by payment status, lease expiration, title document status, or active disputes.
* **Enforcement & Approvals:** Serve quit notices, process evictions, and approve the release of title documents for completed sales.

### 4. Core System Features

* **Flexible Property Categorization:**
  * *Residential Rentals:* Face-me-I-face-you, Self-contained, Flats, Apartments.
  * *Residential Sales:* Duplexes, Mansions, Terraces.
  * *Land Sales:* Tracked by Size (Sqm/Plots), Topography, Coordinates, and Title Documents (e.g., C of O, Excision, Gazette).

* **Financial Ledger & Routing (Paystack):**
  * *Rentals:* Recurring logic with payment splitting (deducting management fees before routing to the landlord).
  * *Sales:* Tracking Outright vs. Installment payment plans. The ledger calculates running balances until the debt hits zero.

* **Automated Scheduling:**
  * Tracking rental due dates and triggering automated reminders (30 days prior).
  * Tracking installment due dates for property/land buyers.

* **Heavy Document Management:**
  * Secure storage and retrieval of Deeds of Assignment, Contracts of Sale, Survey Plans, and Tenancy Agreements.

### 5. Technical Stack & Architecture

#### Frontend
* **Customer Facing (Visitors, Tenants, Buyers):** Next.js (Hosted on Vercel)
* **Back Office (Admin & Landlords):** React + Refine (Hosted on Vercel)
* **Styling & Animations:** Tailwind CSS + Framer Motion

#### Backend & Infrastructure
* **API:** TypeScript / Express (Hosted on Render)
* **Database & Authentication:** Supabase (PostgreSQL for complex relational data + Supabase Phone/Email OTP Auth)
* **Background Tasks (Cron Jobs):** Trigger.dev, Inngest, or Render native cron jobs for daily midnight checks (rent dues, late fees, installment reminders).

#### External Services & Integrations
* **Payments:** Paystack (Card/transfer payments and "Paystack Split").
* **Media & Document Storage:** Cloudinary (On-the-fly image optimization for listings and secure CDN for heavy legal/KYC documents).
* **Notification Engine:** Resend (For reliable transactional email delivery: receipts, legal notices, installment reminders).

### 6. Database Schema Needs (High-Level Concept)

To support both rentals and sales seamlessly, the Supabase schema requires a highly normalized structure:

* `Users` (Role-based: Admin, Landlord, Tenant, Buyer)
* `Properties` (The core asset, categorizing listing_type as Sale or Rent, and property_type as Land, Flat, etc.)
* `Units` (Child of Properties: Used strictly for multi-tenanted rental structures)
* `Land_Details` (Child of Properties: Tracks Sqm, Title type, Coordinates)
* `Contracts` (Polymorphic table tracking Leases for rentals AND Sales Agreements for buyers)
* `Payments_Ledger` (Tracks all financial transactions, tied to a Contract, marking it as rent, installment, or outright purchase)
* `Maintenance_Tickets` (Tied to a Unit/Property and a Tenant)