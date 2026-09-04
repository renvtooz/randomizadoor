/**
 * Minimal storage helper with the same shape as the `window.storage` API that
 * Claude.ai artifacts provide, but backed by the browser's localStorage so this
 * app also works as a normal standalone website (GitHub Pages, Vercel, etc).
 *
 * get(key)   -> { key, value } | null
 * set(key,v) -> { key, value }
 */
export const storage = {
  async get(key) {
    try {
      const value = window.localStorage.getItem(key);
      if (value === null) return null;
      return { key, value };
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return { key, value };
    } catch (e) {
      return null;
    }
  },
};
