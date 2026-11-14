// Product Management Controller - NextPay 7
import { db, storage, auth } from '../../js/firebase-config.js';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  serverTimestamp, 
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { formatCurrency, showToast, escapeHtml, extractImageUrl } from '../../js/utils.js';

class ProductManager {
  constructor() {
    this.products = [];
    this.categories = [];
    this.currentEditingId = null;
    this.unsubscribeProducts = null;
  }

  async init() {
    await this.loadCategories();
    this.listenToProducts();
  }

  async loadCategories() {
    const defaultCategories = [
      { id: 'fashion-accessories', name: { en: 'Fashion & Accessories' } },
      { id: 'imitation-jewellery', name: { en: 'Imitation Jewellery' } },
      { id: 'perfumes-lifestyle', name: { en: 'Perfumes & Lifestyle' } },
      { id: 'general-collection', name: { en: 'General Collection' } }
    ];

    try {
      const snap = await getDocs(query(collection(db, 'categories'), orderBy('name.en', 'asc')));
      const loaded = [];
      snap.forEach(d => loaded.push({ id: d.id, ...d.data() }));
      this.categories = loaded.length > 0 ? loaded : defaultCategories;
    } catch (e) {
      console.warn('Categories query fallback to defaults:', e);
      this.categories = defaultCategories;
    }

    const select = document.getElementById('prod-category');
    if (select) {
      select.innerHTML = '<option value="">Select Category</option>' + 
        this.categories.map(c => `<option value="${c.id}">${c.name?.en || c.name || 'Category'}</option>`).join('');
    }
  }

  /**
   * Real-time listener for products collection in Firebase.
   * Automatically reflects items added directly in Firebase or via Admin Panel.
   */
  listenToProducts() {
    const tbody = document.getElementById('products-tbody');
    if (!tbody) return;

    if (this.unsubscribeProducts) {
      this.unsubscribeProducts();
    }

    try {
      const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
      this.unsubscribeProducts = onSnapshot(q, (snapshot) => {
        this.products = [];
        snapshot.forEach(d => this.products.push({ id: d.id, ...d.data() }));
        this.renderProductsTable();
      }, (err) => {
        console.error('Real-time products snapshot error:', err);
      });
    } catch (err) {
      console.error('Error attaching products listener', err);
    }
  }

  renderProductsTable() {
    const tbody = document.getElementById('products-tbody');
    if (!tbody) return;

    if (this.products.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--color-text-muted); padding: 48px;">
            No products created yet. Click "+ Add New Product" to create your first item.
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    this.products.forEach(p => {
      const title = p.name?.en || 'Untitled Product';
      const price = formatCurrency(p.pricePaise || 0);
      const rawImg = (p.images && p.images[0]) || '../assets/images/logo.jpeg';
      const img = extractImageUrl(rawImg) || '../assets/images/logo.jpeg';
      const stock = p.availableStock !== undefined ? p.availableStock : (p.stock || 0);
      const seller = p.sellerName || 'NextPay 7 Official';

      html += `
        <tr>
          <td>
            <img src="${escapeHtml(img)}" alt="${escapeHtml(title)}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 6px; border: 1px solid var(--color-border);">
          </td>
          <td>
            <strong>${escapeHtml(title)}</strong><br>
            <span style="font-size: 11px; color: var(--color-text-muted);">SKU: ${escapeHtml(p.sku || 'N/A')}</span><br>
            <span style="font-size: 11px; color: var(--color-primary); font-weight: 500;">Seller: ${escapeHtml(seller)}</span>
          </td>
          <td>${escapeHtml(p.categoryName || 'General')}</td>
          <td><strong>${price}</strong></td>
          <td>
            <span class="status-badge ${stock > 5 ? 'badge-success' : (stock > 0 ? 'badge-warning' : 'badge-danger')}">
              ${stock} in stock
            </span>
          </td>
          <td>
            <span class="status-badge ${p.published ? 'badge-success' : 'badge-danger'}">
              ${p.published ? 'Published' : 'Draft'}
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm btn-secondary edit-product-btn" data-id="${p.id}">Edit</button>
              <button class="btn btn-sm btn-secondary delete-product-btn" data-id="${p.id}" style="color: var(--color-danger);">&times;</button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;

    tbody.querySelectorAll('.edit-product-btn').forEach(b => {
      b.addEventListener('click', (e) => this.openEditModal(e.currentTarget.getAttribute('data-id')));
    });

    tbody.querySelectorAll('.delete-product-btn').forEach(b => {
      b.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this product?')) {
          await this.deleteProduct(id);
        }
      });
    });
  }

  generateSearchTokens(nameObj, sku) {
    const tokens = new Set();
    const addStr = (str) => {
      if (!str) return;
      const clean = str.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      clean.split(/\s+/).forEach(w => {
        if (w.length >= 2) {
          tokens.add(w);
          for (let i = 2; i <= w.length; i++) tokens.add(w.slice(0, i));
        }
      });
    };

    if (nameObj) {
      addStr(nameObj.en);
      addStr(nameObj.bn);
      addStr(nameObj.hi);
    }
    if (sku) addStr(sku);
    return Array.from(tokens);
  }

  async saveProduct(formData) {
    const priceRupees = parseFloat(formData.priceRupees) || 0;
    const origPriceRupees = parseFloat(formData.origPriceRupees) || priceRupees;
    const pricePaise = Math.round(priceRupees * 100);
    const originalPricePaise = Math.round(origPriceRupees * 100);
    const stockQty = parseInt(formData.stock, 10) || 0;

    const discountPercent = originalPricePaise > pricePaise 
      ? Math.round(((originalPricePaise - pricePaise) / originalPricePaise) * 100) 
      : 0;

    const currentSellerId = auth.currentUser?.uid || 'SELLER_NEXTPAY_OFFICIAL';
    const currentSellerName = formData.sellerName?.trim() || 'NextPay 7 Official Seller';

    const rawImgInput = (formData.images && formData.images[0]) || '';
    const cleanImageUrl = extractImageUrl(rawImgInput) || 'assets/images/logo.jpeg';

    // Multi-image collection & validation (Section requirement: 1 to 5 images, at least 1 required)
    const rawImagesList = Array.isArray(formData.images) ? formData.images : (rawImgInput ? [rawImgInput] : []);
    const cleanImages = [];
    rawImagesList.forEach(img => {
      const cleaned = extractImageUrl(img);
      if (cleaned && !cleanImages.includes(cleaned)) {
        cleanImages.push(cleaned);
      }
    });

    if (cleanImages.length === 0) {
      throw new Error('At least one product image is required. Please provide an image URL or HTML embed code.');
    }

    const prodName = (formData.name || formData.nameEn || '').trim();
    const prodDesc = (formData.description || formData.descEn || '').trim();

    if (!prodName) {
      throw new Error('Product name is required.');
    }

    const payload = {
      name: {
        en: prodName
      },
      description: {
        en: prodDesc
      },
      categoryId: formData.categoryId || 'general-collection',
      categoryName: formData.categoryName || 'General Collection',
      sku: formData.sku?.trim().toUpperCase() || `SKU-${Date.now().toString().slice(-6)}`,
      pricePaise,
      originalPricePaise,
      discountPercent,
      availableStock: stockQty,
      images: cleanImages,
      published: Boolean(formData.published),
      featured: Boolean(formData.featured),
      newArrival: Boolean(formData.newArrival),
      sellerId: currentSellerId,
      sellerName: currentSellerName,
      sellerReferenceRules: {
        sellerId: currentSellerId,
        sellerName: currentSellerName,
        dispatchSlaHours: parseInt(formData.dispatchSlaHours || 24, 10),
        returnPolicy: formData.returnPolicy || '7 Days Replacement for Damaged/Defective Items',
        warranty: formData.warranty || 'NextPay 7 Quality Assured',
        shippingOrigin: formData.shippingOrigin || 'West Bengal, India',
        verifiedMerchant: true
      },
      searchTokens: this.generateSearchTokens({ en: prodName }, formData.sku),
      updatedAt: serverTimestamp()
    };

    if (this.currentEditingId) {
      // Edit Preservation Rule: Only update target product document
      const prodRef = doc(db, 'products', this.currentEditingId);
      await updateDoc(prodRef, payload);

      // Keep inventory doc synchronized
      await setDoc(doc(db, 'inventory', this.currentEditingId), {
        onHand: stockQty,
        available: stockQty,
        updatedAt: serverTimestamp()
      }, { merge: true });

      showToast('Product updated successfully under seller rules!', 'success');
    } else {
      payload.createdAt = serverTimestamp();
      const docRef = await addDoc(collection(db, 'products'), payload);

      // Initialize inventory doc
      await setDoc(doc(db, 'inventory', docRef.id), {
        onHand: stockQty,
        reserved: 0,
        available: stockQty,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Initialize productStats
      await setDoc(doc(db, 'productStats', docRef.id), {
        ratingCount: 0,
        ratingSum: 0,
        ratingAverage: 0,
        salesCount: 0
      });

      showToast('New product created under seller reference rules!', 'success');
    }

    this.closeModal();
  }

  async deleteProduct(id) {
    try {
      await deleteDoc(doc(db, 'products', id));
      await deleteDoc(doc(db, 'inventory', id));
      showToast('Product removed.', 'info');
    } catch (e) {
      showToast('Failed to delete product', 'danger');
    }
  }

  openEditModal(id = null) {
    this.currentEditingId = id;
    const modal = document.getElementById('product-modal');
    const form = document.getElementById('product-form');
    form.reset();

    if (id) {
      const p = this.products.find(item => item.id === id);
      if (p) {
        document.getElementById('modal-title').textContent = 'Edit Product';
        const nameInput = document.getElementById('prod-name') || document.getElementById('prod-name-en');
        if (nameInput) nameInput.value = p.name?.en || (typeof p.name === 'string' ? p.name : '');
        const descInput = document.getElementById('prod-desc') || document.getElementById('prod-desc-en');
        if (descInput) descInput.value = p.description?.en || (typeof p.description === 'string' ? p.description : '');
        document.getElementById('prod-sku').value = p.sku || '';
        document.getElementById('prod-price').value = ((p.pricePaise || 0) / 100).toFixed(2);
        document.getElementById('prod-orig-price').value = ((p.originalPricePaise || 0) / 100).toFixed(2);
        document.getElementById('prod-stock').value = p.availableStock !== undefined ? p.availableStock : 0;
        document.getElementById('prod-category').value = p.categoryId || '';
        document.getElementById('prod-published').checked = Boolean(p.published);
        document.getElementById('prod-featured').checked = Boolean(p.featured);
        document.getElementById('prod-new').checked = Boolean(p.newArrival);
        // Populate multi-image slots
        this.initImageSlots(p.images || []);
        
        // Seller rules
        if (document.getElementById('prod-seller-name')) {
          document.getElementById('prod-seller-name').value = p.sellerName || 'NextPay 7 Official Seller';
        }
        if (document.getElementById('prod-dispatch-sla')) {
          document.getElementById('prod-dispatch-sla').value = p.sellerReferenceRules?.dispatchSlaHours || 24;
        }
        if (document.getElementById('prod-return-policy')) {
          document.getElementById('prod-return-policy').value = p.sellerReferenceRules?.returnPolicy || '7 Days Replacement for Damaged/Defective Items';
        }
      }
    } else {
      document.getElementById('modal-title').textContent = 'Add New Product';
      document.getElementById('prod-published').checked = true;
      
      // Initialize single empty primary slot for new product
      this.initImageSlots([]);

      if (document.getElementById('prod-seller-name')) {
        document.getElementById('prod-seller-name').value = 'NextPay 7 Official Seller';
      }
      if (document.getElementById('prod-dispatch-sla')) {
        document.getElementById('prod-dispatch-sla').value = 24;
      }
      if (document.getElementById('prod-return-policy')) {
        document.getElementById('prod-return-policy').value = '7 Days Replacement for Damaged/Defective Items';
      }
    }

    modal.style.display = 'flex';
  }

  /**
   * Initialize Multi-Image Upload Slots (1 up to 5 images)
   */
  initImageSlots(existingImages = []) {
    const container = document.getElementById('product-images-container');
    if (!container) return;
    container.innerHTML = '';

    const list = (existingImages && existingImages.length > 0) ? existingImages.slice(0, 5) : [''];
    list.forEach((img, idx) => {
      this.addImageSlot(img, idx === 0);
    });
    this.updateImageSlotsUI();
  }

  /**
   * Add a new image slot section (up to max 5)
   */
  addImageSlot(initialValue = '', isPrimary = false) {
    const container = document.getElementById('product-images-container');
    if (!container) return;

    const currentSlots = container.querySelectorAll('.product-image-slot').length;
    if (currentSlots >= 5) {
      showToast('Maximum of 5 images allowed per product.', 'warning');
      return;
    }

    const slotIndex = currentSlots + 1;
    const isMain = isPrimary || slotIndex === 1;

    const slotDiv = document.createElement('div');
    slotDiv.className = 'product-image-slot';
    slotDiv.style.cssText = 'background: #ffffff; border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 10px; position: relative;';

    const cleanInitial = initialValue ? extractImageUrl(initialValue) : '';

    slotDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 12px; font-weight: 700; color: ${isMain ? 'var(--color-primary)' : 'var(--color-text-main)'};">
          ${isMain ? '⭐ Primary Product Image (Main) *' : `Additional Image #${slotIndex}`}
        </span>
        ${!isMain ? `<button type="button" class="btn btn-sm btn-secondary remove-img-slot-btn" style="color: var(--color-danger); border-color: var(--color-danger); padding: 2px 8px; font-size: 11px;">✕ Remove Image</button>` : ''}
      </div>
      <textarea rows="2" class="search-input slot-img-input" style="border-radius: var(--radius-md); font-family: monospace; font-size: 11px; resize: vertical; width: 100%;" placeholder="Paste HTML embed code (e.g. from ImgBB) or direct image URL">${escapeHtml(initialValue)}</textarea>
      <div class="slot-img-preview-wrap" style="margin-top: 6px; display: ${cleanInitial ? 'flex' : 'none'}; align-items: center; gap: 8px;">
        <img class="slot-img-preview" src="${escapeHtml(cleanInitial)}" alt="Preview" style="height: 48px; width: 48px; object-fit: cover; border-radius: 4px; border: 1px solid var(--color-border);">
        <span style="font-size: 11px; color: var(--color-success); font-weight: 600;">✓ Image code recognized</span>
      </div>
    `;

    const textarea = slotDiv.querySelector('.slot-img-input');
    const previewWrap = slotDiv.querySelector('.slot-img-preview-wrap');
    const previewImg = slotDiv.querySelector('.slot-img-preview');

    textarea.addEventListener('input', () => {
      const val = textarea.value.trim();
      const clean = extractImageUrl(val);
      if (clean) {
        previewImg.src = clean;
        previewWrap.style.display = 'flex';
      } else {
        previewWrap.style.display = 'none';
      }
    });

    const removeBtn = slotDiv.querySelector('.remove-img-slot-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        slotDiv.remove();
        this.updateImageSlotsUI();
      });
    }

    container.appendChild(slotDiv);
    this.updateImageSlotsUI();
  }

  updateImageSlotsUI() {
    const container = document.getElementById('product-images-container');
    const addBtn = document.getElementById('add-product-image-btn');
    const hint = document.getElementById('image-count-hint');
    if (!container) return;

    const count = container.querySelectorAll('.product-image-slot').length;
    if (hint) hint.textContent = `${count} / 5 images`;

    if (addBtn) {
      addBtn.disabled = count >= 5;
      if (count >= 5) {
        addBtn.style.opacity = '0.5';
        addBtn.title = 'Maximum 5 images reached';
      } else {
        addBtn.style.opacity = '1';
        addBtn.title = 'Add another image';
      }
    }
  }

  getImagesFromSlots() {
    const container = document.getElementById('product-images-container');
    if (!container) return [];

    const inputs = container.querySelectorAll('.slot-img-input');
    const images = [];

    inputs.forEach(input => {
      const raw = input.value.trim();
      if (raw) {
        const clean = extractImageUrl(raw);
        if (clean && !images.includes(clean)) images.push(clean);
      }
    });

    return images;
  }

  closeModal() {
    this.currentEditingId = null;
    document.getElementById('product-modal').style.display = 'none';
  }
}

export const productManager = new ProductManager();

