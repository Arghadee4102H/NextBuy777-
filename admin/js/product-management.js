// Product Management Controller - NextBuy 77
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
    try {
      const snap = await getDocs(query(collection(db, 'categories'), orderBy('name.en', 'asc')));
      this.categories = [];
      snap.forEach(d => this.categories.push({ id: d.id, ...d.data() }));

      const select = document.getElementById('prod-category');
      if (select) {
        select.innerHTML = '<option value="">Select Category</option>' + 
          this.categories.map(c => `<option value="${c.id}">${c.name?.en || 'Category'}</option>`).join('');
      }
    } catch (e) {
      console.warn('Categories loaded', e);
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
      const seller = p.sellerName || 'NextBuy 77 Official';

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

    const currentSellerId = auth.currentUser?.uid || 'SELLER_NEXTBUY_OFFICIAL';
    const currentSellerName = formData.sellerName?.trim() || 'NextBuy 77 Official Seller';

    const rawImgInput = (formData.images && formData.images[0]) || '';
    const cleanImageUrl = extractImageUrl(rawImgInput) || 'assets/images/logo.jpeg';

    const payload = {
      name: {
        en: formData.nameEn?.trim() || '',
        bn: formData.nameBn?.trim() || '',
        hi: formData.nameHi?.trim() || ''
      },
      description: {
        en: formData.descEn?.trim() || '',
        bn: formData.descBn?.trim() || '',
        hi: formData.descHi?.trim() || ''
      },
      categoryId: formData.categoryId || '',
      categoryName: formData.categoryName || '',
      sku: formData.sku?.trim().toUpperCase() || `SKU-${Date.now().toString().slice(-6)}`,
      pricePaise,
      originalPricePaise,
      discountPercent,
      availableStock: stockQty,
      images: [cleanImageUrl],
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
        warranty: formData.warranty || 'NextBuy 77 Quality Assured',
        shippingOrigin: formData.shippingOrigin || 'West Bengal, India',
        verifiedMerchant: true
      },
      searchTokens: this.generateSearchTokens({ en: formData.nameEn, bn: formData.nameBn, hi: formData.nameHi }, formData.sku),
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
        document.getElementById('prod-name-en').value = p.name?.en || '';
        document.getElementById('prod-name-bn').value = p.name?.bn || '';
        document.getElementById('prod-name-hi').value = p.name?.hi || '';
        document.getElementById('prod-desc-en').value = p.description?.en || '';
        document.getElementById('prod-sku').value = p.sku || '';
        document.getElementById('prod-price').value = ((p.pricePaise || 0) / 100).toFixed(2);
        document.getElementById('prod-orig-price').value = ((p.originalPricePaise || 0) / 100).toFixed(2);
        document.getElementById('prod-stock').value = p.availableStock !== undefined ? p.availableStock : 0;
        document.getElementById('prod-category').value = p.categoryId || '';
        document.getElementById('prod-published').checked = Boolean(p.published);
        document.getElementById('prod-featured').checked = Boolean(p.featured);
        document.getElementById('prod-new').checked = Boolean(p.newArrival);
        const currentImg = (p.images && p.images[0]) || '';
        document.getElementById('prod-image-url').value = currentImg;
        const previewWrap = document.getElementById('prod-img-preview-wrap');
        const previewImg = document.getElementById('prod-img-preview');
        if (currentImg && previewWrap && previewImg) {
          previewImg.src = extractImageUrl(currentImg);
          previewWrap.style.display = 'flex';
        } else if (previewWrap) {
          previewWrap.style.display = 'none';
        }
        
        // Seller rules
        if (document.getElementById('prod-seller-name')) {
          document.getElementById('prod-seller-name').value = p.sellerName || '';
        }
        if (document.getElementById('prod-dispatch-sla')) {
          document.getElementById('prod-dispatch-sla').value = p.sellerReferenceRules?.dispatchSlaHours || 24;
        }
        if (document.getElementById('prod-return-policy')) {
          document.getElementById('prod-return-policy').value = p.sellerReferenceRules?.returnPolicy || '';
        }
      }
    } else {
      document.getElementById('modal-title').textContent = 'Add New Product';
      document.getElementById('prod-published').checked = true;
      if (document.getElementById('prod-seller-name')) {
        document.getElementById('prod-seller-name').value = 'NextBuy 77 Official Seller';
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

  closeModal() {
    this.currentEditingId = null;
    document.getElementById('product-modal').style.display = 'none';
  }
}

export const productManager = new ProductManager();
