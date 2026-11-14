// Cart State & Management - NextPay 7
import { formatCurrency, showToast } from './utils.js';
import { i18n } from './i18n.js';

const CART_STORAGE_KEY = 'nextbuy77_cart';

class CartManager {
  constructor() {
    this.cart = this.loadCart();
  }

  loadCart() {
    try {
      const data = localStorage.getItem(CART_STORAGE_KEY);
      return data ? JSON.parse(data) : { items: [] };
    } catch (e) {
      console.error('Failed to parse cart data from localStorage', e);
      return { items: [] };
    }
  }

  saveCart() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(this.cart));
    this.updateCartBadge();
    window.dispatchEvent(new CustomEvent('cartUpdated', { detail: this.cart }));
  }

  getItems() {
    return this.cart.items || [];
  }

  getItemCount() {
    return (this.cart.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0);
  }

  /**
   * Add product to cart
   * @param {Object} product 
   * @param {number} quantity 
   * @param {Object|null} variant 
   */
  addItem(product, quantity = 1, variant = null) {
    if (!product || !product.id) {
      // Placeholder product fallback
      showToast(i18n.t('notifications.cartAdded') || 'Product added to cart!', 'success');
      return;
    }

    const cartKey = variant ? `${product.id}_${variant.sku || variant.name}` : product.id;
    const existingIndex = this.cart.items.findIndex(item => item.cartKey === cartKey);

    if (existingIndex > -1) {
      this.cart.items[existingIndex].quantity += quantity;
    } else {
      this.cart.items.push({
        cartKey,
        id: product.id,
        name: product.name || { en: 'Product' },
        pricePaise: product.pricePaise || (product.price ? Math.round(product.price * 100) : 0),
        image: (product.images && product.images[0]) || 'assets/images/logo.jpeg',
        variant: variant || null,
        quantity: quantity,
        sku: variant?.sku || product.sku || 'SKU-DEFAULT',
        maxStock: product.availableStock || 99
      });
    }

    this.saveCart();
    showToast(i18n.t('notifications.cartAdded') || 'Product added to cart!', 'success');
  }

  removeItem(cartKey) {
    this.cart.items = this.cart.items.filter(item => item.cartKey !== cartKey);
    this.saveCart();
    showToast(i18n.t('notifications.cartRemoved') || 'Product removed from cart.', 'info');
  }

  updateQuantity(cartKey, quantity) {
    const item = this.cart.items.find(i => i.cartKey === cartKey);
    if (!item) return;

    if (quantity <= 0) {
      this.removeItem(cartKey);
    } else {
      item.quantity = Math.min(quantity, item.maxStock || 99);
      this.saveCart();
    }
  }

  clearCart() {
    this.cart = { items: [] };
    this.saveCart();
  }

  calculateSubtotalPaise() {
    return this.cart.items.reduce((sum, item) => sum + (item.pricePaise * item.quantity), 0);
  }

  updateCartBadge() {
    const badges = document.querySelectorAll('.cart-badge');
    const count = this.getItemCount();
    badges.forEach(badge => {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-block' : 'inline-block';
    });
  }
}

export const cartManager = new CartManager();


