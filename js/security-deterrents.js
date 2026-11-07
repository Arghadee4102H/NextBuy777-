// Security & Casual Copying Deterrents - Section 41
// Note: UI deterrents only; never applied to inputs, forms, UPI ID copy, or accessibility text.

class SecurityDeterrents {
  constructor() {
    this.config = {
      disableTextSelection: true,
      disableImageContextMenu: true,
      disableImageDragging: true
    };
  }

  init(customConfig = {}) {
    this.config = { ...this.config, ...customConfig };

    if (this.config.disableTextSelection) {
      document.body.classList.add('anti-copy-enabled');
    }

    if (this.config.disableImageDragging) {
      document.body.classList.add('anti-drag-enabled');
    }

    if (this.config.disableImageContextMenu) {
      this.attachContextMenuDeterrent();
    }
  }

  attachContextMenuDeterrent() {
    document.addEventListener('contextmenu', (e) => {
      // Check if target is an image, banner, or product display card
      const target = e.target;
      const isDisplayElement = target.matches('img, .banner-slider-container, .product-image-wrap, .banner-placeholder');
      const isInteractive = target.closest('input, textarea, select, a, button, .selectable-text, .upi-id-badge, .legal-content-card');

      if (isDisplayElement && !isInteractive) {
        e.preventDefault();
      }
    });
  }
}

export const securityDeterrents = new SecurityDeterrents();

