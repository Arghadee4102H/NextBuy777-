// Internationalization (i18n) Engine - NextPay 7 (English Strictly)

const SUPPORTED_LANGUAGES = ['en'];
const DEFAULT_LANGUAGE = 'en';
const STORAGE_KEY = 'nextpay7_lang';

class I18nManager {
  constructor() {
    this.currentLanguage = 'en';
    this.dictionaries = {};
    this.fallbackDictionary = null;
  }

  getStoredLanguage() {
    return 'en';
  }

  async init() {
    // Exclusively English across the entire site
    await this.loadDictionary('en');
    this.fallbackDictionary = this.dictionaries['en'];
    this.applyTranslations();
  }

  async loadDictionary(lang) {
    if (this.dictionaries[lang]) return;
    try {
      const dictUrl = new URL(`../assets/i18n/${lang}.json`, import.meta.url).href;
      const response = await fetch(dictUrl);
      if (!response.ok) throw new Error(`Could not load ${dictUrl}`);
      this.dictionaries[lang] = await response.json();
    } catch (err) {
      console.warn(`Failed to load dictionary for ${lang}`, err);
    }
  }

  async setLanguage(lang) {
    this.currentLanguage = 'en';
    this.applyTranslations();
  }

  t(path) {
    const keys = path.split('.');
    let val = this.resolveKey(this.dictionaries[this.currentLanguage], keys);
    if (val === undefined && this.fallbackDictionary) {
      val = this.resolveKey(this.fallbackDictionary, keys);
    }
    return val !== undefined ? val : path;
  }

  resolveKey(obj, keys) {
    if (!obj) return undefined;
    let curr = obj;
    for (const k of keys) {
      if (curr && typeof curr === 'object' && k in curr) {
        curr = curr[k];
      } else {
        return undefined;
      }
    }
    return curr;
  }

  applyTranslations() {
    document.documentElement.lang = this.currentLanguage;

    // Update text content for data-i18n
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const text = this.t(key);
      if (text) el.textContent = text;
    });

    // Update placeholders for data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      const text = this.t(key);
      if (text) el.setAttribute('placeholder', text);
    });

    // Sync select dropdown if present
    const langSelect = document.getElementById('lang-select');
    if (langSelect && langSelect.value !== this.currentLanguage) {
      langSelect.value = this.currentLanguage;
    }
  }
}

export const i18n = new I18nManager();

