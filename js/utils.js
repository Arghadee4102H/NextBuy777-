// Utility Helpers for NextBuy 77

/**
 * Format paise (integer) to Indian Rupees string format (₹1,23,456.00)
 * @param {number} paise 
 * @param {boolean} includeSymbol 
 * @returns {string}
 */
export function formatCurrency(paise, includeSymbol = true) {
  const rupees = (Number(paise) || 0) / 100;
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(rupees);
  return includeSymbol ? `₹${formatted}` : formatted;
}

/**
 * Format Date to Asia/Kolkata (IST)
 * @param {Date|string|number} date 
 * @param {string} locale ('en-IN', 'bn-IN', 'hi-IN')
 * @returns {string}
 */
export function formatDateIST(date, locale = 'en-IN') {
  if (!date) return '';
  const d = date?.toDate ? date.toDate() : new Date(date);
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
}

/**
 * Sanitize text to prevent HTML injection
 * @param {string} str 
 * @returns {string}
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Toast notification system
 * @param {string} message 
 * @param {'success'|'danger'|'warning'|'info'} type 
 * @param {number} durationMs 
 */
export function showToast(message, type = 'info', durationMs = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button style="background:none;border:none;color:#fff;cursor:pointer;font-size:16px;margin-left:12px;" aria-label="Close">&times;</button>
  `;

  const closeBtn = toast.querySelector('button');
  const removeToast = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 250);
  };

  closeBtn.addEventListener('click', removeToast);
  container.appendChild(toast);

  setTimeout(removeToast, durationMs);
}

/**
 * Normalize and validate Indian UTR / Transaction Reference Number
 * 6 to 35 alphanumeric characters
 * @param {string} utr 
 * @returns {{ valid: boolean, normalized: string }}
 */
export function validateUtr(utr) {
  if (!utr || typeof utr !== 'string') return { valid: false, normalized: '' };
  const normalized = utr.trim().replace(/\s+/g, '').toUpperCase();
  const valid = /^[A-Z0-9]{6,35}$/.test(normalized);
  return { valid, normalized };
}

/**
 * Validate PIN Code format
 * Supports standard Indian PIN codes as well as custom configured numeric/alphanumeric PINs
 * @param {string} pin 
 * @returns {boolean}
 */
export function validatePinCode(pin) {
  if (!pin) return false;
  const cleaned = pin.toString().trim();
  return /^[0-9A-Za-z]{3,10}$/.test(cleaned);
}

/**
 * Validate 10-digit Indian Mobile Number
 * @param {string} mobile 
 * @returns {boolean}
 */
export function validateIndianMobile(mobile) {
  if (!mobile) return false;
  const cleaned = mobile.toString().trim().replace(/[\s\-\(\)]/g, '').replace(/^(?:\+91|91|0)/, '');
  return /^[6-9]\d{9}$/.test(cleaned);
}

/**
 * Copy text to clipboard
 * @param {string} text 
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      textarea.remove();
      return success;
    }
  } catch (err) {
    console.error('Clipboard copy failed', err);
    return false;
  }
}

/**
 * Universal image URL extractor:
 * Parses full HTML embed codes (e.g. ImgBB <a ...><img src="..." .../></a> or <img src="...">),
 * BBCode, Markdown, or direct image URLs.
 * Extracts ONLY the clean raw image src URL so no extra clutter or links render.
 * @param {string} input
 * @returns {string}
 */
export function extractImageUrl(input) {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  // 1. Check for <img ... src="..." ...> HTML embed code
  const imgMatch = trimmed.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && imgMatch[1]) {
    return imgMatch[1].trim();
  }

  // 2. Check for BBCode [img]...[/img]
  const bbMatch = trimmed.match(/\[img\](.*?)\[\/img\]/i);
  if (bbMatch && bbMatch[1]) {
    return bbMatch[1].trim();
  }

  // 3. Check for markdown ![...](url)
  const mdMatch = trimmed.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/i);
  if (mdMatch && mdMatch[1]) {
    return mdMatch[1].trim();
  }

  // 4. Check for direct URL (http/https) in the input string
  const urlMatch = trimmed.match(/(https?:\/\/[^\s"'<>]+)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1].trim();
  }

  return trimmed;
}

