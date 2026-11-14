// Products & Dynamic Content Manager - NextBuy 77
import { db } from './firebase-config.js';
import { collection, query, where, getDocs, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { formatCurrency, escapeHtml, showToast, extractImageUrl } from './utils.js';
import { i18n } from './i18n.js';
import { cartManager } from './cart.js';

class ProductManager {
  constructor() {
    this.currentLanguage = i18n.currentLanguage || 'en';
    this.subscribed = false;
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
   * Render Top Banner Section with Both Automatic and Manual Sliding
   * Automatically slides on interval and allows manual swipe, arrows, and dot navigation.
   * Extracts clean image URL from ImgBB HTML embed code or direct links with zero clutter.
   */
  async renderBannerSlider(containerId = 'banner-slider-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (this.bannerSliderInterval) {
      clearInterval(this.bannerSliderInterval);
      this.bannerSliderInterval = null;
    }

    const banners = await this.getActiveBanners();

    if (banners.length === 0) {
      container.innerHTML = `
        <div class="banner-placeholder">
          <div class="banner-placeholder-icon">🏷️</div>
          <h2 class="banner-placeholder-title" data-i18n="home.bannerPlaceholderTitle">${i18n.t('home.bannerPlaceholderTitle')}</h2>
          <p class="banner-placeholder-text" data-i18n="home.bannerPlaceholderText">${i18n.t('home.bannerPlaceholderText')}</p>
        </div>
      `;
      return;
    }

    let slidesHtml = '';
    let dotsHtml = '';

    banners.forEach((b, idx) => {
      const alt = this.getLocalizedText(b.altText) || 'Promotional Banner';
      const cleanImg = extractImageUrl(b.imageUrl) || 'assets/images/logo.jpeg';

      slidesHtml += `
        <div class="banner-slide" data-index="${idx}">
          <a href="${b.linkUrl || '#'}" style="display:block;">
            <img src="${escapeHtml(cleanImg)}" alt="${escapeHtml(alt)}" class="banner-image" loading="${idx === 0 ? 'eager' : 'lazy'}">
          </a>
        </div>
      `;

      dotsHtml += `
        <button class="banner-dot ${idx === 0 ? 'active' : ''}" data-slide="${idx}" aria-label="Slide ${idx + 1}"></button>
      `;
    });

    container.innerHTML = `
      <div class="banner-slider-wrapper">
        <div class="banner-slider-track" id="banner-track">
          ${slidesHtml}
        </div>
        ${banners.length > 1 ? `
          <button class="banner-nav-btn banner-prev-btn" id="banner-prev" aria-label="Previous Banner">&lsaquo;</button>
          <button class="banner-nav-btn banner-next-btn" id="banner-next" aria-label="Next Banner">&rsaquo;</button>
          <div class="banner-dots-wrap" id="banner-dots">
            ${dotsHtml}
          </div>
        ` : ''}
      </div>
    `;

    if (banners.length <= 1) return;

    const track = document.getElementById('banner-track');
    const dots = container.querySelectorAll('.banner-dot');
    let currentIndex = 0;
    const totalSlides = banners.length;

    const goToSlide = (idx) => {
      currentIndex = (idx + totalSlides) % totalSlides;
      const slideEl = track.children[currentIndex];
      if (slideEl) {
        track.scrollTo({
          left: slideEl.offsetLeft,
          behavior: 'smooth'
        });
      }
      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentIndex);
      });
    };

    const nextSlide = () => goToSlide(currentIndex + 1);
    const prevSlide = () => goToSlide(currentIndex - 1);

    const startAutoSlide = () => {
      stopAutoSlide();
      this.bannerSliderInterval = setInterval(nextSlide, 4500);
    };

    const stopAutoSlide = () => {
      if (this.bannerSliderInterval) {
        clearInterval(this.bannerSliderInterval);
        this.bannerSliderInterval = null;
      }
    };

    document.getElementById('banner-prev')?.addEventListener('click', () => {
      prevSlide();
      startAutoSlide();
    });

    document.getElementById('banner-next')?.addEventListener('click', () => {
      nextSlide();
      startAutoSlide();
    });

    dots.forEach(dot => {
      dot.addEventListener('click', (e) => {
        const slideIdx = parseInt(e.currentTarget.getAttribute('data-slide'), 10);
        goToSlide(slideIdx);
        startAutoSlide();
      });
    });

    // Touch Swipe on mobile
    let touchStartX = 0;
    let touchEndX = 0;

    track.addEventListener('touchstart', (e) => {
      stopAutoSlide();
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    track.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      if (touchStartX - touchEndX > 40) {
        nextSlide();
      } else if (touchEndX - touchStartX > 40) {
        prevSlide();
      }
      startAutoSlide();
    }, { passive: true });

    container.addEventListener('mouseenter', stopAutoSlide);
    container.addEventListener('mouseleave', startAutoSlide);

    track.addEventListener('scroll', () => {
      const scrollPos = track.scrollLeft;
      const slideWidth = track.clientWidth;
      if (slideWidth > 0) {
        const activeIdx = Math.round(scrollPos / slideWidth);
        if (activeIdx !== currentIndex && activeIdx >= 0 && activeIdx < totalSlides) {
          currentIndex = activeIdx;
          dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === currentIndex);
          });
        }
      }
    }, { passive: true });

    startAutoSlide();
  }

  /**
   * Render Category Products in Two Independent Horizontal Sliding Rows (Mobile Optimized)
   * Top row contains Math.ceil(N / 2) items, Bottom row contains Math.floor(N / 2) items.
   * On mobile, 2 products are displayed side-by-side with a portion of the 3rd visible.
   * Interacting with row 1 slides ONLY row 1; row 2 remains completely independent.
   */
  renderCategoryTwoRowSlider(containerId, products = [], categoryTitle = '', categoryLink = '') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!products || products.length === 0) {
      // 7 placeholder products (4 top row, 3 bottom row) as specified by user
      const totalPlaceholders = 7;
      const topCount = Math.ceil(totalPlaceholders / 2); // 4
      const bottomCount = Math.floor(totalPlaceholders / 2); // 3

      const createPlaceholderCard = () => `
        <div class="product-card product-card-placeholder">
          <div class="product-image-wrap">
            <div class="product-placeholder-img">
              <span class="product-placeholder-icon">🛍️</span>
              <span style="font-weight:600; font-size:13px;" data-i18n="home.productPlaceholderTitle">${i18n.t('home.productPlaceholderTitle')}</span>
            </div>
          </div>
          <div class="product-card-body">
            <span style="font-size:11px; color:var(--color-text-light); text-transform:uppercase;" data-i18n="home.productPlaceholderCategory">${i18n.t('home.productPlaceholderCategory')}</span>
            <h3 class="product-title" data-i18n="home.productPlaceholderTitle">${i18n.t('home.productPlaceholderTitle')}</h3>
            <div class="product-price-row">
              <span class="product-price">₹0.00</span>
            </div>
            <button class="btn btn-primary btn-block add-to-cart-placeholder-btn" data-i18n="home.addToCart">
              ${i18n.t('home.addToCart')}
            </button>
          </div>
        </div>
      `;

      let topRowHtml = '';
      for (let i = 0; i < topCount; i++) topRowHtml += createPlaceholderCard();

      let bottomRowHtml = '';
      for (let i = 0; i < bottomCount; i++) bottomRowHtml += createPlaceholderCard();

      container.innerHTML = `
        <div class="category-showcase-wrap">
          ${categoryTitle ? `
            <div class="section-title-wrap" style="margin-bottom: 12px;">
              <h2 class="section-title">${escapeHtml(categoryTitle)}</h2>
              ${categoryLink ? `<a href="${categoryLink}" style="font-size: 13px; font-weight: 600;">View All &rarr;</a>` : ''}
            </div>
          ` : ''}
          <div class="category-two-tier-container">
            <div class="category-scroll-row row-top" tabindex="0">
              ${topRowHtml}
            </div>
            <div class="category-scroll-row row-bottom" tabindex="0">
              ${bottomRowHtml}
            </div>
          </div>
        </div>
      `;

      container.querySelectorAll('.add-to-cart-placeholder-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          cartManager.addItem({ id: 'sample_placeholder', name: { en: 'Product' }, pricePaise: 0 }, 1);
        });
      });
      return;
    }

    // Split items into two independent rows
    const topCount = Math.ceil(products.length / 2);
    const topRowItems = products.slice(0, topCount);
    const bottomRowItems = products.slice(topCount);

    const renderCard = (p) => {
      const name = this.getLocalizedText(p.name);
      const priceFormatted = formatCurrency(p.pricePaise || (p.price ? p.price * 100 : 0));
      const origPriceFormatted = p.originalPricePaise ? formatCurrency(p.originalPricePaise) : '';
      const rawImg = (p.images && p.images[0]) || '';
      const img = extractImageUrl(rawImg) || 'assets/images/logo.jpeg';

      return `
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
    };

    let topRowHtml = topRowItems.map(p => renderCard(p)).join('');
    let bottomRowHtml = bottomRowItems.map(p => renderCard(p)).join('');

    container.innerHTML = `
      <div class="category-showcase-wrap">
        ${categoryTitle ? `
          <div class="section-title-wrap" style="margin-bottom: 12px;">
            <h2 class="section-title">${escapeHtml(categoryTitle)}</h2>
            ${categoryLink ? `<a href="${categoryLink}" style="font-size: 13px; font-weight: 600;">View All &rarr;</a>` : ''}
          </div>
        ` : ''}
        <div class="category-two-tier-container">
          <div class="category-scroll-row row-top" tabindex="0">
            ${topRowHtml}
          </div>
          ${bottomRowHtml ? `
            <div class="category-scroll-row row-bottom" tabindex="0">
              ${bottomRowHtml}
            </div>
          ` : ''}
        </div>
      </div>
    `;

    container.querySelectorAll('.add-to-cart-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const prod = products.find(item => item.id === id);
        if (prod) cartManager.addItem(prod, 1);
      });
    });
  }

  /**
   * Render Standard Product Grid
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
      const rawImg = (p.images && p.images[0]) || '';
      const img = extractImageUrl(rawImg) || 'assets/images/logo.jpeg';

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
    this.renderCategoryTwoRowSlider('featured-grid', featured, 'Featured Highlights', 'products.html?filter=featured');

    const all = await this.getProducts();
    this.renderCategoryTwoRowSlider('all-products-grid', all, 'New Arrivals & Catalog', 'products.html');

    if (!this.subscribed) {
      this.subscribed = true;
      try {
        const prodRef = collection(db, 'products');
        onSnapshot(query(prodRef, where('published', '==', true), limit(24)), () => {
          this.getProducts({ featured: true }).then(f => this.renderCategoryTwoRowSlider('featured-grid', f, 'Featured Highlights', 'products.html?filter=featured'));
          this.getProducts().then(a => this.renderCategoryTwoRowSlider('all-products-grid', a, 'New Arrivals & Catalog', 'products.html'));
        }, (err) => console.warn('Product real-time listener notice:', err));

        const bannersRef = collection(db, 'banners');
        onSnapshot(query(bannersRef, where('active', '==', true), limit(5)), () => {
          this.renderBannerSlider('banner-slider-container');
        }, (err) => console.warn('Banner real-time listener notice:', err));
      } catch (e) {
        console.warn('Real-time listener setup:', e);
      }
    }
  }

  /**
   * Render Horizontally Scrollable Category Pills Bar
   */
  async renderCategoryPills(containerId = 'category-pills-bar', activeId = 'all', onSelect = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const categories = await this.getCategories();
    let pillsHtml = `
      <button class="category-pill ${activeId === 'all' ? 'active' : ''}" data-cat-id="all">
        🏷️ All Categories
      </button>
    `;

    if (categories.length > 0) {
      categories.forEach(cat => {
        const name = this.getLocalizedText(cat.name) || cat.id;
        pillsHtml += `
          <button class="category-pill ${activeId === cat.id ? 'active' : ''}" data-cat-id="${cat.id}">
            ${escapeHtml(name)}
          </button>
        `;
      });
    } else {
      const defaults = [
        { id: 'fashion', name: 'Fashion & Accessories', icon: '👗' },
        { id: 'jewellery', name: 'Imitation Jewellery', icon: '💎' },
        { id: 'perfumes', name: 'Perfumes & Lifestyle', icon: '🌸' }
      ];
      defaults.forEach(d => {
        pillsHtml += `
          <button class="category-pill ${activeId === d.id ? 'active' : ''}" data-cat-id="${d.id}">
            ${d.icon} ${d.name}
          </button>
        `;
      });
    }

    container.innerHTML = `<div class="category-pills-bar">${pillsHtml}</div>`;

    container.querySelectorAll('.category-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const catId = e.currentTarget.getAttribute('data-cat-id');
        container.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        if (typeof onSelect === 'function') onSelect(catId);
      });
    });
  }

  /**
   * Render Store Catalog Organized By Category
   * Multiple rows (top and bottom), all products arranged side-by-side.
   * Users can scroll both horizontally within rows and vertically through category collections.
   */
  async renderCatalogByCategories(containerId = 'catalog-products-grid', searchQuery = '', selectedCategoryId = 'all') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const categories = await this.getCategories();
    const products = await this.getProducts();

    let filteredProducts = products;
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      filteredProducts = products.filter(p => {
        const name = this.getLocalizedText(p.name).toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        return name.includes(lower) || sku.includes(lower);
      });
    }

    if (selectedCategoryId && selectedCategoryId !== 'all') {
      filteredProducts = filteredProducts.filter(p => p.categoryId === selectedCategoryId);
    }

    // If completely empty database, render default category shelves with user requested placeholders
    if (filteredProducts.length === 0) {
      const defaultShelves = [
        { id: 'cat-fashion', title: 'Fashion Accessories' },
        { id: 'cat-jewellery', title: 'Imitation Jewellery' },
        { id: 'cat-perfumes', title: 'Perfumes & Fragrances' }
      ];

      container.innerHTML = defaultShelves.map(shelf => `
        <div id="${shelf.id}" style="margin-bottom: 32px;"></div>
      `).join('');

      defaultShelves.forEach(shelf => {
        this.renderCategoryTwoRowSlider(shelf.id, [], shelf.title);
      });
      return;
    }

    // Group products by category
    const categoryMap = new Map();

    if (categories.length > 0) {
      categories.forEach(cat => {
        categoryMap.set(cat.id, {
          title: this.getLocalizedText(cat.name) || cat.id,
          products: []
        });
      });
    }

    const unassigned = [];
    filteredProducts.forEach(p => {
      if (p.categoryId && categoryMap.has(p.categoryId)) {
        categoryMap.get(p.categoryId).products.push(p);
      } else if (p.categoryName) {
        let found = false;
        for (const [id, val] of categoryMap.entries()) {
          if (val.title.toLowerCase() === p.categoryName.toLowerCase()) {
            val.products.push(p);
            found = true;
            break;
          }
        }
        if (!found) unassigned.push(p);
      } else {
        unassigned.push(p);
      }
    });

    let shelvesHtml = '';
    let shelfIndex = 0;

    for (const [catId, group] of categoryMap.entries()) {
      if (group.products.length > 0) {
        const shelfDomId = `shelf-${catId}-${shelfIndex++}`;
        shelvesHtml += `<div id="${shelfDomId}" style="margin-bottom: 36px;"></div>`;
      }
    }

    if (unassigned.length > 0) {
      const unassignedId = `shelf-unassigned-${shelfIndex++}`;
      shelvesHtml += `<div id="${unassignedId}" style="margin-bottom: 36px;"></div>`;
    }

    container.innerHTML = shelvesHtml;

    // Render two-row slider for each populated shelf
    shelfIndex = 0;
    for (const [catId, group] of categoryMap.entries()) {
      if (group.products.length > 0) {
        const shelfDomId = `shelf-${catId}-${shelfIndex++}`;
        this.renderCategoryTwoRowSlider(shelfDomId, group.products, group.title);
      }
    }

    if (unassigned.length > 0) {
      const unassignedId = `shelf-unassigned-${shelfIndex++}`;
      this.renderCategoryTwoRowSlider(unassignedId, unassigned, 'More Curated Lifestyle Products');
    }
  }
}

export const productManager = new ProductManager();

