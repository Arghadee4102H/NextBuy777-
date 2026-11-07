# Firestore Database Architecture — NextBuy 77

This document defines the authoritative Cloud Firestore schema, collections, document IDs, field types, and security access policies for **NextBuy 77**.

---

## 1. Summary of Collections

| Collection Name | Document ID Pattern | Public Access | Authenticated Customer | Admin Permissions |
| :--- | :--- | :--- | :--- | :--- |
| `products` | Auto-generated UID / Slug | Read (if published) | Read (if published) | Full (`products.*`) |
| `productStats` | Same as `productId` | Read Only | Read Only | Trusted Backend / Admin |
| `inventory` | Same as `productId` | Denied | Reserved via Transaction | Full (`inventory.*`) |
| `categories` | Auto-generated UID | Read (if active) | Read (if active) | Full (`categories.manage`) |
| `banners` | Auto-generated UID | Read (if active) | Read (if active) | Full (`banners.manage`) |
| `pinCodes` | 6-digit PIN code string | Read Only | Read Only | Full (`pincodes.manage`) |
| `orders` | Auto-generated UID | Denied | Read/Create Own | Full (`orders.*`, `payments.*`) |
| `utrIndex` | Normalized UTR string | Denied | Create (Claim) Own | Full (`payments.verify`) |
| `inventoryMovements`| `MOV_{timestamp}_{id}` | Denied | Create via Transaction | Read Only (`auditlogs.view`) |
| `promoCodes` | Uppercase promo code | Denied | Read (on checkout) | Full (`promos.manage`) |
| `promoUsage` | `USE_{orderId}_{code}` | Denied | Create on Checkout | Full (`promos.manage`) |
| `users` | Customer Auth `uid` | Denied | Read/Update permitted fields | Full (`users.viewBasic/PII`) |
| `users/{uid}/addresses`| Auto-generated UID | Denied | Full CRUD (Own addresses) | Read (`users.viewPII`) |
| `users/{uid}/cart` | `current` | Denied | Full CRUD (Own cart) | Denied |
| `websiteSettings` | `public`, `delivery` | Read (`public`) | Read | Full (`settings.general`) |
| `paymentSettings` | `razorpay`, `upi` | Denied | Denied | Full (`settings.payment`) |
| `adminUsers` | Admin Auth `uid` | Denied | Denied | Super Admin (`admins.manage`) |
| `adminActivityLogs` | Auto-generated UID | Denied | Denied | Read Only (`auditlogs.view`) |

---

## 2. Document Field Specifications

### 2.1 `products/{productId}`
```json
{
  "name": {
    "en": "Classic Golden Bangle Bracelet",
    "bn": "ক্লাসিক গোল্ডেন চুড়ি ব্রেসলেট",
    "hi": "क्लासिक गोल्डन बैंगल ब्रेसलेट"
  },
  "description": {
    "en": "Premium imitation gold bangle with high-durability polish.",
    "bn": "উচ্চ স্থায়িত্বের পালিশ সহ প্রিমিয়াম অনুকরণ সোনার চুড়ি।",
    "hi": "उच्च स्थायित्व पॉलिश के साथ प्रीमियम नकली सोने की चूड़ी।"
  },
  "categoryId": "cat_jewellery_01",
  "categoryName": "Imitation Jewellery",
  "sku": "NB-BANG-001",
  "pricePaise": 49900,
  "originalPricePaise": 99900,
  "discountPercent": 50,
  "availableStock": 25,
  "images": [
    "https://storage.googleapis.com/.../products/bangle_01.jpg"
  ],
  "published": true,
  "featured": true,
  "newArrival": false,
  "searchTokens": ["cla", "clas", "classic", "gold", "bangle", "nb-bang-001"],
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp"
}
```

### 2.2 `inventory/{productId}`
*Maintained separately from `products` to ensure edits never wipe inventory counts (Section 25).*
```json
{
  "onHand": 25,
  "reserved": 3,
  "available": 22,
  "lowStockThreshold": 5,
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp"
}
```

### 2.3 `productStats/{productId}`
*Rating and sales aggregations updated exclusively via backend transactions upon review approval or order verification.*
```json
{
  "ratingCount": 14,
  "ratingSum": 68,
  "ratingAverage": 4.85,
  "salesCount": 42
}
```

### 2.4 `orders/{orderId}`
```json
{
  "orderNumber": "ORD-108422",
  "customerUid": "usr_google_93817",
  "customerEmail": "customer@gmail.com",
  "customerName": "Rahul Sharma",
  "addressSnapshot": {
    "fullName": "Rahul Sharma",
    "mobile": "9876543210",
    "houseBuilding": "Flat 4B, Greenfield Apts",
    "streetLocality": "Park Street",
    "cityVillage": "Kolkata",
    "district": "Kolkata",
    "state": "West Bengal",
    "pinCode": "700016"
  },
  "itemsSnapshot": [
    {
      "id": "prod_123",
      "name": { "en": "Classic Golden Bangle" },
      "sku": "NB-BANG-001",
      "pricePaise": 49900,
      "quantity": 1,
      "lineTotalPaise": 49900
    }
  ],
  "subtotalPaise": 49900,
  "promoDiscountPaise": 0,
  "bonusUsedPaise": 0,
  "deliveryPaise": 5000,
  "finalPayablePaise": 54900,
  "paymentMethod": "MANUAL_UPI",
  "paymentStatus": "Payment Submitted",
  "orderStatus": "Processing",
  "utr": "123456789012",
  "reservationExpiresAt": "2026-10-28T18:30:00.000Z",
  "idempotencyKey": "IDEMP_k8s2_9281a",
  "termsAcceptedAt": "2026-10-27T18:30:00.000Z",
  "termsVersion": "2026-10-27",
  "statusHistory": [
    {
      "status": "Pending Payment",
      "timestamp": "2026-10-27T18:30:00.000Z",
      "updatedBy": "usr_google_93817"
    },
    {
      "status": "Payment Submitted",
      "utr": "123456789012",
      "timestamp": "2026-10-27T18:35:00.000Z",
      "updatedBy": "usr_google_93817"
    }
  ],
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp"
}
```

### 2.5 `utrIndex/{normalizedUtr}`
*Guarantees strict global uniqueness of UTR / UPI reference numbers across the platform.*
```json
{
  "utr": "123456789012",
  "orderId": "ord_91823",
  "customerUid": "usr_google_93817",
  "claimedAt": "Timestamp"
}
```

### 2.6 `pinCodes/{pinCode}`
*Document ID is the 6-digit postal code.*
```json
{
  "pinCode": "700001",
  "district": "Kolkata",
  "state": "West Bengal",
  "chargePaise": 5000,
  "additionalChargePaise": 0,
  "active": true,
  "updatedAt": "Timestamp"
}
```

### 2.7 `adminUsers/{uid}`
```json
{
  "uid": "adm_88192",
  "email": "admin@nextbuy77.com",
  "displayName": "Super Admin",
  "role": "Super Admin",
  "permissions": ["ALL"],
  "status": "active",
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp"
}
```

