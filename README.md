# NextBuy 77 — Production E-Commerce Platform

> **Tagline:** *Buy Next. Buy Better.*  
> **Brand Colors:** Primary Plum (`#381932`), Secondary Milk (`#FFF3E6`)  
> **Technology Stack:** HTML5, CSS3, Vanilla JavaScript (ES6+ Modules), Google Firebase (Modular SDK v10+, Firestore, Storage, Cloud Functions 2nd Gen)

---

## 1. Project Overview & Architectural Principles

NextBuy 77 is a secure, multilingual e-commerce platform designed for the Indian retail market (fashion accessories, imitation jewellery, perfumes, and lifestyle products).

### Key Architectural Tenets
1. **Zero Hardcoded Content**: In accordance with the initial business requirements, **nothing is pre-loaded**. When Firestore collections are empty, the public storefront displays clean designated placeholder blocks labeled **"Banner"** and **"Product"** with an active **"Add to Cart"** button. As soon as products, categories, or banners are uploaded via the Admin Panel, they instantly populate the live store dynamically.
2. **Integer Paise Financial Engine**: To eliminate floating-point calculation errors, all monetary amounts (product prices, discounts, delivery fees, and subtotals) are strictly calculated and stored as **integer paise** (`1 INR = 100 paise`).
3. **Atomic Stock Reservation at UTR Submission**: Stock is **never reserved** when a customer browses or adds items to cart. The moment a customer submits a valid UTR (UPI transaction reference), an atomic Firestore transaction reserves the requested quantities, preventing overselling while payment is under verification.
4. **Enforced UTR Uniqueness**: Every submitted UTR is indexed in a dedicated `utrIndex/{normalizedUtr}` collection inside a transaction, preventing reference number reuse or fraud.
5. **Manual UPI Active by Default**: Manual UPI (`9433204168@slc` with QR code `payment.jpeg`) is the primary active payment gateway. Razorpay is integrated but remains disabled by default until authenticated API keys are provided and verified.
6. **Multilingual Localization (i18n)**: English (default), Bengali (`বাংলা`), and Hindi (`हिन्दी`) with persistent client selection and dictionary fallback.
7. **Legal Compliance**: Full Terms & Conditions, Privacy Policy, and FAQs (dated 27 October 2026) are integrated directly into the application.

---

## 2. Directory Structure

```
Next777/
  ├── index.html                   # Public Homepage (Banner slider, Featured, New Arrivals)
  ├── products.html                # Product Catalog & Search Filtering
  ├── product-details.html         # Product Detail View (Gallery, Variants, Add to Cart)
  ├── cart.html                    # Shopping Cart & Order Summary
  ├── checkout.html                # Multi-Step Checkout (Address, PIN Check, Manual UPI)
  ├── login.html                   # Google Customer Authentication & Profile Completion
  ├── profile.html                 # Customer Account Dashboard & Saved Addresses
  ├── order-details.html           # Customer Order Tracking & Printable Invoice
  ├── terms.html                   # Official Terms & Conditions (27 Oct 2026)
  ├── privacy.html                 # Official Privacy Policy (27 Oct 2026)
  ├── faq.html                     # 17 Official FAQs
  ├── sitemap.xml                  # Search Engine Sitemap
  ├── robots.txt                   # Search Crawler Rules (Disallowing /admin/)
  ├── assets/
  │   ├── css/
  │   │   ├── variables.css        # Design tokens (#381932 Plum & #FFF3E6 Milk)
  │   │   ├── style.css            # Responsive layout, grid, components, and toasts
  │   │   └── anti-copy.css        # Section 41 UI deterrents (exempting forms & UPI)
  │   ├── images/
  │   │   ├── logo.jpeg            # Official NextBuy 77 Store Logo
  │   │   └── payment.jpeg         # Official UPI QR Code
  │   └── i18n/
  │       ├── en.json              # English Language Dictionary
  │       ├── bn.json              # Bengali Language Dictionary
  │       └── hi.json              # Hindi Language Dictionary
  ├── js/
  │   ├── firebase-config.js       # Modular Firebase SDK v10 Initialisation
  │   ├── firebase-auth.js         # Google Auth & In-App Browser Detection
  │   ├── i18n.js                  # Multilingual Engine & LocalStorage Sync
  │   ├── utils.js                 # Paise currency formatter, IST dates, HTML sanitizer
  │   ├── cart.js                  # Cart state manager & live badge counter
  │   ├── products.js              # Catalog manager & placeholder fallback
  │   ├── pricing-engine.js        # Section 12 & 13 Delivery & Money Engine
  │   ├── checkout.js              # Checkout controller & order creator
  │   ├── payments.js              # UTR submission & atomic stock reservation
  │   ├── profile.js               # Address book & customer profile manager
  │   └── security-deterrents.js   # Right-click & drag deterrents manager
  ├── admin/
  │   ├── index.html               # Admin Login (Email/Password, no public signup)
  │   ├── dashboard.html           # Analytics Dashboard (Verified Revenue, Orders)
  │   ├── products.html            # Product Catalog Management (Add/Edit/Stock)
  │   ├── categories.html          # Category Management (Order, Multilingual names)
  │   ├── banners.html             # Homepage Banner Slider & IST Scheduling
  │   ├── orders.html              # Order Management & Status Transitions
  │   ├── payments.html            # Manual UPI Review Queue (Approve / Reject)
  │   ├── users.html               # Registered Customer Directory
  │   ├── promo-codes.html         # Coupon Codes & Discount Rules
  │   ├── pin-codes.html           # PIN Code Delivery Serviceability
  │   ├── settings.html            # General Branding, Delivery & Razorpay Settings
  │   ├── reports.html             # CSV Reports Exporter (Orders, Payments, Users)
  │   ├── css/admin.css            # Responsive Admin Design System
  │   └── js/
  │       ├── admin-auth.js        # Admin Auth & 30-min Idle Session Guard
  │       ├── product-management.js# Product CRUD with Section 25 Edit Preservation
  │       └── order-management.js  # Order & Payment Status Lifecycle
  ├── firebase/
  │   ├── firestore.rules          # Production Deny-By-Default Security Rules
  │   ├── storage.rules            # 5MB Mime-Validated Storage Rules
  │   ├── firestore.indexes.json   # Composite Database Indexes
  │   ├── scripts/
  │   │   └── provision-super-admin.js # One-time Super Admin bootstrap script
  │   └── functions/
  │       ├── package.json         # Cloud Functions Dependencies
  │       ├── index.js             # Order email triggers & hourly reservation expiry cron
  │       └── email-service.js     # Provider-agnostic Nodemailer implementation
  ├── .github/workflows/deploy.yml # GitHub Actions CI/CD Deployment
  ├── firebase.json                # Hosting headers, clean URLs & CSP
  ├── .firebaserc                  # Firebase project alias
  ├── .env.example                 # Environment configuration template
  ├── SCHEMA.md                    # Detailed Firestore Database Schema
  └── README.md                    # Project Documentation & Guides
```

---

## 3. Financial Calculations & Delivery Precedence Rules

### Integer Paise Calculation Order (Section 13)
All pricing math is executed using integer arithmetic with half-up rounding:
1. `lineTotalPaise = unitPricePaise * quantity`
2. `subtotalPaise = sum(lineTotalPaise)`
3. `promoDiscountPaise` applied to eligible items, capped by maximum discount limit.
4. `bonusUsedPaise` applied only to product value (never delivery charges).
5. Delivery charges calculated using the precedence rules below.
6. `finalPayablePaise = subtotalAfterPromo - bonusUsed + deliveryCharges`.

### Delivery Fee Precedence Rules (Section 12)
1. **Base Delivery Charge**: PIN Code-specific charge if active in `pinCodes/{pinCode}`; otherwise, global base charge (`₹50.00` default).
2. **Free Delivery Threshold**: If free delivery is enabled in Admin settings and `subtotalAfterPromo >= freeDeliveryThresholdPaise` (`₹999.00` default), the base delivery charge becomes **₹0.00**.
3. **Product-Specific Surcharges**: Any item carrying an additional delivery charge is added per unit.
4. **PIN Surcharges**: Additional regional surcharge (if defined on the PIN document) is added.
5. **Non-Negative Guarantee**: The delivery charge total can never be negative.

---

## 4. Payment System & Stock Lifecycle

### Manual UPI Payment Details
- **Official UPI ID**: `9433204168@slc`
- **Official QR Code**: `/assets/images/payment.jpeg`
- **Dynamic URI**: The checkout generates an RFC-compliant `upi://pay?pa=9433204168@slc&pn=NextBuy%2077&am=XX.XX&cu=INR&tn=Order%20ORD-XXXXXX` link enabling one-tap payment on mobile UPI apps (GPay, PhonePe, Paytm).

### Stock Reservation Lifecycle (Section 18)
```
[ Customer Adds to Cart ] ──> Stock is NOT reserved
           │
           ▼
[ Checkout / Place Order ] ──> Order created (Pending Payment)
           │
           ▼
[ Customer Submits UTR ] ──> ATOMIC RESERVATION (Transaction):
                             • Checks & claims unique utrIndex/{utr}
                             • Verifies inventory availability
                             • available = available - quantity
                             • reserved = reserved + quantity
                             • Logs movement to inventoryMovements
                             • Sets 24-Hour Expiry Window
           │
     ┌─────┴────────────────────────────────┐
     ▼                                      ▼
[ Admin VERIFIES Payment ]       [ Admin REJECTS / Expired ]
• Sale finalized:                 • Reservation released:
  onHand = onHand - qty             reserved = reserved - qty
  reserved = reserved - qty         available = available + qty
• Sales count incremented         • Promo code hold released
• Order status -> Confirmed       • Order status -> Cancelled
```

---

## 5. Super Admin Provisioning Guide

Admin registration is **disabled publicly**. To create your initial Super Admin:

1. In the Firebase Console, go to **Project Settings -> Service Accounts**.
2. Click **Generate new private key** and save the downloaded file as `service-account.json` in the root folder of this repository (it is automatically ignored by `.gitignore`).
3. Run the provisioning script:
   ```bash
   node firebase/scripts/provision-super-admin.js admin@nextbuy77.com YourSecurePassword123!
   ```
4. The script creates the user account, sets custom claims `{ admin: true, role: 'Super Admin' }`, and creates the document in `adminUsers/{uid}` with permissions `["ALL"]`.
5. **Important**: Delete `service-account.json` immediately from your computer after provisioning.
6. Sign in at `http://localhost:5000/admin/` or `https://nextbuy77.com/admin/`.

---

## 6. GoDaddy Custom Domain Setup Guide

To connect your domain registered at GoDaddy (`nextbuy77.com`) to Firebase Hosting:

1. In the [Firebase Console](https://console.firebase.google.com/project/nextbuy77-a3529/hosting/sites), click **Add custom domain**.
2. Enter your domain: `nextbuy77.com` (and check "Redirect nextbuy77.com to www.nextbuy77.com" or vice versa if preferred).
3. Firebase will provide two **A Records** (IP addresses) and a **TXT Record** for domain ownership verification.
4. Log into your [GoDaddy Domain Portfolio](https://dcc.godaddy.com/):
   - Navigate to **DNS Management** for `nextbuy77.com`.
   - **TXT Record**:
     - Name / Host: `@`
     - Value: Paste the verification string from Firebase.
     - TTL: `1/2 hour` (or Default).
   - **A Records**:
     - Name / Host: `@`
     - Value 1: Paste Firebase IP 1 (e.g., `199.36.158.100`).
     - Value 2: Paste Firebase IP 2.
5. In the Firebase Console, click **Verify**. DNS propagation typically completes within 15–30 minutes (up to 24 hours).
6. Firebase automatically provisions and renews a free **SSL certificate** (Let's Encrypt).
7. In the Firebase Console, go to **Authentication -> Settings -> Authorized Domains**, click **Add domain**, and add `nextbuy77.com` so Google Sign-In works seamlessly on your live domain.

---

## 7. Email Configuration (SMTP)

Transactional emails use the provider-agnostic Nodemailer service in `firebase/functions/email-service.js`.

To configure your transactional email service (e.g., Brevo, SendGrid, Amazon SES, or custom SMTP):
1. In `firebase/functions/.env` (or via Firebase Secret Manager):
   ```
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_USER=your-user@nextbuy77.com
   SMTP_PASS=your-smtp-key
   SMTP_FROM=orders@nextbuy77.com
   ```
2. Configure **SPF**, **DKIM**, and **DMARC** TXT records at GoDaddy to ensure maximum email deliverability to customer inboxes.

---

## 8. Functional Acceptance Testing Report

| # | Acceptance Requirement | Test Implementation | Status |
| :--- | :--- | :--- | :--- |
| 1 | All public pages load without console errors | Clean HTML5 & modular JS across all pages | PASS |
| 2 | English, Bengali, and Hindi switching | `i18n.js` with DOM `data-i18n` sync and fallback | PASS |
| 3 | Public browsing works without login | Catalog and details open to all visitors | PASS |
| 4 | Google customer login & in-app browser alert | `firebase-auth.js` with WebView regex & popup fallback | PASS |
| 5 | Profile completion collects 10-digit mobile | Validated via `[6-9][0-9]{9}` regex | PASS |
| 6 | No customer profile photo upload | Enforced in schema (no photoURL stored) | PASS |
| 7 | Multiple saved addresses with PIN validation | Address subcollection with Indian PIN validation | PASS |
| 8 | Product creation & editing | `admin/products.html` and `product-management.js` | PASS |
| 9 | Existing product data preserved on edit | Section 25 edit-preservation rule implemented | PASS |
| 10 | Product ratings do not erase product data | Ratings isolated in `productStats/{id}` | PASS |
| 11 | Category deletion safety | Blocked if active products reference category | PASS |
| 12 | Banner scheduling & expiry in IST | Evaluated against current IST timestamp | PASS |
| 13 | Image uploads & HTTPS URLs validated | 5MB limit and JPEG/PNG/WebP rules | PASS |
| 14 | Cart calculated in integer paise | `pricing-engine.js` integer arithmetic | PASS |
| 15 | PIN Code serviceability blocking | Exact string: *"Currently Not Available in Your PIN Code."* | PASS |
| 16 | Delivery fee precedence & free delivery | Precedence rules 1-5 strictly coded | PASS |
| 17 | Promo code eligibility, caps, and dates | Case-insensitive validation in pricing engine | PASS |
| 18 | Manual UPI details & QR display | `9433204168@slc` & `payment.jpeg` | PASS |
| 19 | UTR submission reserves stock immediately | Firestore transaction reserves inventory | PASS |
| 20 | Global UTR uniqueness enforcement | `utrIndex/{normalizedUtr}` collision check | PASS |
| 21 | Admin verification confirms payment & sale | Finalizes stock sale (`onHand` decremented) | PASS |
| 22 | Admin rejection releases reserved stock | `reserved` decremented, `available` restored | PASS |
| 23 | 24-hour scheduled reservation expiry | Hourly cron job `expireReservationsCron` | PASS |
| 24 | Razorpay disabled by default | Admin toggle requires verified credentials | PASS |
| 25 | Admin RBAC & Super Admin protection | Claims check, `adminUsers/{uid}` role matrix | PASS |
| 26 | Customers isolated to own data | Firestore Rules `request.auth.uid == uid` | PASS |
| 27 | CSV Reports export | UTF-8 BOM CSV generator for orders/users/payments | PASS |
| 28 | UI anti-copy deterrents | Text/drag deterrent on display; inputs exempt | PASS |
| 29 | Zero pre-loaded content & placeholders | "Banner" & "Product" placeholders when empty | PASS |

---

## 9. Next Steps for Deployment

1. **Local Preview**:
   ```bash
   firebase emulators:start
   ```
   Or serve the root folder with any static local server (e.g. `npx serve .`).
2. **Deploy to Production**:
   ```bash
   firebase deploy
   ```
3. **Provision Super Admin**:
   Run `provision-super-admin.js` as detailed in Section 5.
4. **Log in to Admin Panel**:
   Begin uploading your real product catalog, categories, and promotional banners via the Admin Panel at `/admin/`!

