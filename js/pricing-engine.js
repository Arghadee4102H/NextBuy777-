// Pricing Engine & Delivery Precedence Rules - NextBuy 77
// All money values are calculated and stored in INTEGER PAISE (1 INR = 100 paise)
import { db } from './firebase-config.js';
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Standard rounding rule: Round half up per line item
 * @param {number} num 
 * @returns {number}
 */
export function roundHalfUp(num) {
  return Math.round(num);
}

/**
 * Generate unique client idempotency key for checkout attempts
 * @returns {string}
 */
export function generateIdempotencyKey() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `IDEMP_${timestamp}_${randomPart}`;
}

/**
 * Check PIN Code Serviceability and Retrieve Delivery Settings
 * STRICT RULE: Orders can ONLY be placed using PIN codes configured in the admin panel (/pinCodes collection).
 * If a PIN code is not in the system or inactive, delivery is marked strictly unserviceable.
 * @param {string} pinCode e.g. '7000' or '700001'
 * @returns {Promise<{ serviceable: boolean, pinData: Object|null, message?: string, reason?: string }>}
 */
export async function checkPinServiceability(pinCode) {
  if (!pinCode) {
    return { serviceable: false, pinData: null, reason: 'Please enter a PIN code to check service availability.' };
  }

  const pinDocId = pinCode.toString().trim();
  if (pinDocId.length < 3) {
    return { serviceable: false, pinData: null, reason: 'Please enter a valid PIN code.' };
  }

  try {
    // 1. Direct doc ID lookup in pinCodes collection
    const pinRef = doc(db, 'pinCodes', pinDocId);
    const snap = await getDoc(pinRef);

    if (snap.exists()) {
      const data = snap.data();
      if (data.active !== false) {
        return { 
          serviceable: true, 
          pinData: data, 
          message: `Congratulations, orders can be placed for your PIN code ${pinDocId}!` 
        };
      } else {
        return { 
          serviceable: false, 
          pinData: null, 
          reason: `Service unavailable: PIN code ${pinDocId} is currently not accepting new orders.` 
        };
      }
    }

    // 2. Fallback query matching pinCode field (in case document ID differs)
    const q = query(collection(db, 'pinCodes'), where('pinCode', '==', pinDocId));
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      const docData = querySnap.docs[0].data();
      if (docData.active !== false) {
        return { 
          serviceable: true, 
          pinData: docData, 
          message: `Congratulations, orders can be placed for your PIN code ${pinDocId}!` 
        };
      } else {
        return { 
          serviceable: false, 
          pinData: null, 
          reason: `Service unavailable: PIN code ${pinDocId} is currently not accepting new orders.` 
        };
      }
    }
  } catch (err) {
    console.warn('Error verifying PIN Code with Firebase pinCodes collection:', err);
  }

  // Not configured in the admin panel -> Service unavailable
  return { 
    serviceable: false, 
    pinData: null, 
    reason: `Service unavailable: Orders cannot be placed for PIN code "${pinDocId}". We currently do not service this location.` 
  };
}

/**
 * Calculate Delivery Charges using Section 12 PRECEDENCE RULES:
 * 1. Base delivery charge = PIN Code-specific charge if active, otherwise global charge.
 * 2. If free delivery enabled & subtotal after promo >= minOrder, base charge = 0.
 * 3. Product-specific additional charges added per line or unit.
 * 4. PIN Code record additional charge added last.
 * 5. Delivery total can NEVER be negative.
 * 
 * @param {Object} params
 * @param {number} params.subtotalAfterPromoPaise
 * @param {Object} params.pinData
 * @param {Array} params.cartItems
 * @param {Object} params.deliverySettings
 * @returns {{ deliveryPaise: number, isFree: boolean, breakdown: Object }}
 */
export function calculateDeliveryCharge({
  subtotalAfterPromoPaise = 0,
  pinData = null,
  cartItems = [],
  deliverySettings = {
    globalBaseChargePaise: 5000, // ₹50 default
    freeDeliveryEnabled: true,
    freeDeliveryThresholdPaise: 99900 // ₹999 free delivery
  }
}) {
  // Step 1: Base delivery charge
  let baseChargePaise = (pinData && pinData.chargePaise !== undefined)
    ? pinData.chargePaise
    : (deliverySettings.globalBaseChargePaise || 5000);

  let isFree = false;

  // Step 2: Free delivery threshold
  if (
    deliverySettings.freeDeliveryEnabled &&
    subtotalAfterPromoPaise >= (deliverySettings.freeDeliveryThresholdPaise || 99900)
  ) {
    baseChargePaise = 0;
    isFree = true;
  }

  // Step 3: Product-specific additional charges
  let productAdditionalPaise = 0;
  cartItems.forEach(item => {
    if (item.additionalDeliveryPaise) {
      productAdditionalPaise += (item.additionalDeliveryPaise * (item.quantity || 1));
    }
  });

  // Step 4: PIN-specific additional charge
  const pinAdditionalPaise = (pinData && pinData.additionalChargePaise) ? pinData.additionalChargePaise : 0;

  // Step 5: Total delivery charge (cannot be negative)
  const totalDeliveryPaise = Math.max(0, baseChargePaise + productAdditionalPaise + pinAdditionalPaise);

  return {
    deliveryPaise: totalDeliveryPaise,
    isFree,
    breakdown: {
      baseChargePaise,
      productAdditionalPaise,
      pinAdditionalPaise
    }
  };
}

/**
 * Calculate Complete Order Pricing Breakdown (Section 13)
 * Order of calculation:
 * 1. Line total = price * quantity
 * 2. Subtotal = sum of line totals
 * 3. Promo discount (capped by max discount)
 * 4. Bonus / Loyalty redemption (applied to product value only)
 * 5. Delivery and additional charges
 * 6. Final payable = subtotal - promo - bonus + delivery
 * 
 * @param {Object} params 
 * @returns {Object}
 */
export function calculateOrderTotals({
  items = [],
  promoCode = null,
  bonusRedeemPaise = 0,
  pinData = null,
  deliverySettings = {}
}) {
  // 1. Line totals & Subtotal
  let subtotalPaise = 0;
  const processedItems = items.map(item => {
    const unitPricePaise = item.pricePaise || 0;
    const qty = item.quantity || 1;
    const lineTotalPaise = unitPricePaise * qty;
    subtotalPaise += lineTotalPaise;
    return {
      ...item,
      lineTotalPaise
    };
  });

  // 2. Promo discount
  let promoDiscountPaise = 0;
  if (promoCode && promoCode.active) {
    if (!promoCode.minOrderPaise || subtotalPaise >= promoCode.minOrderPaise) {
      if (promoCode.discountType === 'percentage') {
        const calculated = roundHalfUp((subtotalPaise * promoCode.discountPercent) / 100);
        promoDiscountPaise = promoCode.maxDiscountPaise 
          ? Math.min(calculated, promoCode.maxDiscountPaise) 
          : calculated;
      } else if (promoCode.discountType === 'fixed') {
        promoDiscountPaise = Math.min(promoCode.discountAmountPaise || 0, subtotalPaise);
      }
    }
  }

  const subtotalAfterPromoPaise = Math.max(0, subtotalPaise - promoDiscountPaise);

  // 3. Bonus redemption (product value only, never delivery)
  const maxBonusAllowed = Math.min(subtotalAfterPromoPaise, bonusRedeemPaise);
  const finalBonusUsedPaise = Math.max(0, maxBonusAllowed);
  const subtotalAfterBonusPaise = subtotalAfterPromoPaise - finalBonusUsedPaise;

  // 4. Delivery Calculation
  const deliveryCalc = calculateDeliveryCharge({
    subtotalAfterPromoPaise,
    pinData,
    cartItems: processedItems,
    deliverySettings
  });

  // 5. Final Payable
  const finalPayablePaise = subtotalAfterBonusPaise + deliveryCalc.deliveryPaise;

  return {
    subtotalPaise,
    promoDiscountPaise,
    bonusUsedPaise: finalBonusUsedPaise,
    deliveryPaise: deliveryCalc.deliveryPaise,
    isFreeDelivery: deliveryCalc.isFree,
    finalPayablePaise,
    items: processedItems
  };
}

