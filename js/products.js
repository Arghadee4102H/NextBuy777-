// Products & Dynamic Content Manager - NextBuy 77
import { db } from './firebase-config.js';
import { collection, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { formatCurrency, escapeHtml, showToast } from './utils.js';
import { i18n } from './i18n.js';
import { cartManager } from './cart.js';

class ProductManager {
  constructor() {
    this.currentLanguage = i18n.currentLanguage || 'en';
    window.addEventListener('languageChanged', (e) => {
      this.currentLanguage = e.detail.language;
      this.refreshUI();
    });
  }

  getLocalizedText(field) {
    if (!field) return '';
    if (typeof field === 'string') return field;
    return field[this.currentLanguage] || field['en'] || Object.values(field)[0] || '';
  }

  /**
   * Fetch active banners from Firestore or return empty array
   */
  async getActiveBanners() {
    try {
      const bannersRef = collection(db, 'banners');
      const q = query(bannersRef, where('active', '==', true), orderBy('order', 'asc'), limit(5));
      const snapshot = await getDocs(q);
      const banners = [];
      const now = new Date();

      snapshot.forEach(doc => {
        const data = doc.data();
        const start = data.startDate ? new Date(data.startDate) : null;
        const end = data.endDate ? new Date(data.endDate) : null;
        // Schedule filter
        if ((!start || start <= now) && (!end || end >= now)) {
          banners.push({ id: doc.id, ...data });
        }
      });
      return banners;
    } catch (err) {
      console.warn('Notice: Firestore banners collection is empty or rules pending. Using placeholder banner.', err);
      return [];
    }
  }

  /**
   * Fetch active categories from Firestore
   */
  async getCategories() {
    try {
      const catRef = collection(db, 'categories');
      const q = query(catRef, where('active', '==', true), orderBy('order', 'asc'));
      const snapshot = await getDocs(q);
      const categories = [];
      snapshot.forEach(doc => categories.push({ id: doc.id, ...doc.data() }));
      return categories;
    } catch (err) {
      console.warn('Notice: Categories collection empty. Using placeholder state.', err);
      return [];
    }
  }

  /**
   * Fetch published products
   * @param {Object} filterOptions
   */
  async getProducts(filterOptions = {}) {
    try {
      const prodRef = collection(db, 'products');
      let q = query(prodRef, where('published', '==', true), limit(24));

      if (filterOptions.featured) {
        q = query(prodRef, where('published', '==', true), where('featured', '==', true), limit(12));
      } else if (filterOptions.newArrival) {
        q = query(prodRef, where('published', '==', true), where('newArrival', '==', true), limit(12));
      } else if (filterOptions.category) {
        q = query(prodRef, where('published', '==', true), where('categoryId', '==', filterOptions.category), limit(24));
      }

      const snapshot = await getDocs(q);
      const products = [];
      snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));
      return products;
    } catch (err) {
      console.warn('Notice: Products collection empty or awaiting admin upload. Rendering placeholders.', err);
      return [];
    }
  }

  /**
   * Render Top Banner Section
   * Shows active banners if available; otherwise displays the clean "Banner" placeholder
   */
  async renderBannerSlider(containerId = 'banner-slider-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const banners = await this.getActiveBanners();

    if (banners.length === 0) {
      // User specification: "Placeholders like 'Banner' will appear where the actual banners should be."
      container.innerHTML = `
        <div class="banner-placeholder">
          <div class="banner-placeholder-icon">🏷️</div>
          <h2 class="banner-placeholder-title" data-i18n="home.bannerPlaceholderTitle">${i18n.t('home.bannerPlaceholderTitle')}</h2>
          <p class="banner-placeholder-text" data-i18n="home.bannerPlaceholderText">${i18n.t('home.bannerPlaceholderText')}</p>
        </div>
      `;
      return;
    }

    // Render active banner slider
    let html = `<div class="banner-slider" style="display:flex; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none;">`;
    banners.forEach((b, idx) => {
      const alt = this.getLocalizedText(b.altText) || 'Promotional Banner';
      html += `
        <div class="banner-slide" style="min-width:100%; flex-shrink:0; scroll-snap-align:start;">
          <a href="${b.linkUrl || '#'}" style="display:block;">
            <img src="${escapeHtml(b.imageUrl)}" alt="${escapeHtml(alt)}" class="banner-image" style="width:100%; max-height:420px; object-fit:cover; display:block;">
          </a>
        </div>
      `;
    });
    html += `</div>`;
    container.innerHTML = html;
  }

  /**
   * Render Product Grid
   * If products array is empty, renders user-requested Placeholders:
   * "Only an 'Add to Cart' option will be visible. Placeholders like 'Product' will appear where the actual products should be."
   */
  renderProductGrid(containerId, products = [], count = 8) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!products || products.length === 0) {
      let placeholdersHtml = '';
      for (let i = 1; i <= count; i++) {
        placeholdersHtml += `
          <div class="product-card product-card-placeholder">
            <div class="product-image-wrap">
              <div class="product-placeholder-img">
                <span class="product-placeholder-icon">🛍️</span>
                <span style="font-weight:600; font-size:14px;" data-i18n="home.productPlaceholderTitle">${i18n.t('home.productPlaceholderTitle')}</span>
              </div>
            </div>
            <div class="product-card-body">
              <span style="font-size:12px; color:var(--color-text-light); text-transform:uppercase; letter-spacing:0.5px;" data-i18n="home.productPlaceholderCategory">${i18n.t('home.productPlaceholderCategory')}</span>
              <h3 class="product-title" data-i18n="home.productPlaceholderTitle">${i18n.t('home.productPlaceholderTitle')}</h3>
              <div class="product-price-row">
                <span class="product-price" data-i18n="home.productPlaceholderPrice">${i18n.t('home.productPlaceholderPrice')}</span>
              </div>
              <button class="btn btn-primary btn-block placeholder-add-cart-btn" data-i18n="home.addToCart">
                ${i18n.t('home.addToCart')}
              </button>
            </div>
          </div>
        `;
      }
      container.innerHTML = placeholdersHtml;

      // Attach click events to placeholder Add to Cart buttons
      container.querySelectorAll('.placeholder-add-cart-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          cartManager.addItem({ id: 'sample_placeholder', name: { en: 'Product' }, pricePaise: 0 }, 1);
        });
      });
      return;
    }

    // Render real products
    let html = '';
    products.forEach(p => {
      const name = this.getLocalizedText(p.name);
      const priceFormatted = formatCurrency(p.pricePaise || (p.price ? p.price * 100 : 0));
      const origPriceFormatted = p.originalPricePaise ? formatCurrency(p.originalPricePaise) : '';
      const img = (p.images && p.images[0]) || 'assets/images/logo.jpeg';

      html += `
        <div class="product-card" data-product-id="${p.id}">
          <a href="product-details.html?id=${p.id}" class="product-image-wrap">
            <img src="${escapeHtml(img)}" alt="${escapeHtml(name)}" class="product-image" loading="lazy">
          </a>
          <div class="product-card-body">
            <h3 class="product-title"><a href="product-details.html?id=${p.id}">${escapeHtml(name)}</a></h3>
            <div class="product-price-row">
              <span class="product-price">${priceFormatted}</span>
              ${origPriceFormatted ? `<span class="product-original-price">${origPriceFormatted}</span>` : ''}
              ${p.discountPercent ? `<span class="product-discount-badge">${p.discountPercent}% OFF</span>` : ''}
            </div>
            <button class="btn btn-primary btn-block add-to-cart-btn" data-id="${p.id}" data-i18n="home.addToCart">
              ${i18n.t('home.addToCart')}
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.add-to-cart-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const prod = products.find(item => item.id === id);
        if (prod) cartManager.addItem(prod, 1);
      });
    });
  }

  async refreshUI() {
    await this.renderBannerSlider('banner-slider-container');
    const featured = await this.getProducts({ featured: true });
    this.renderProductGrid('featured-grid', featured, 4);

    const all = await this.getProducts();
    this.renderProductGrid('all-products-grid', all, 8);
  }
}

export const productManager = new ProductManager();

