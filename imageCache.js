/**
 * LRU (Least Recently Used) Image Cache
 *
 * Caches album art data URLs to reduce memory usage and API calls.
 * When cache is full, automatically evicts the least recently used image.
 *
 * Memory savings:
 * - Before: 100 images × 100KB = 10MB+
 * - After:  50 images × 100KB = 5MB
 * - Reduction: ~50% memory usage
 */

export class LRUImageCache {
  /**
   * Creates an LRU cache for image data URLs
   * @param {number} maxSize - Maximum number of images to cache (default: 50)
   */
  constructor(maxSize = 50) {
    this.cache = new Map(); // Map maintains insertion order
    this.maxSize = maxSize;

    // Statistics for monitoring cache effectiveness
    this.hits = 0; // Cache hits (image found in cache)
    this.misses = 0; // Cache misses (image not in cache)
    this.evictions = 0; // Number of images evicted
  }

  /**
   * Retrieves an image from cache
   * Moves accessed image to most recent position (LRU behavior)
   * @param {string} key - Image key to retrieve
   * @returns {string|null} Data URL or null if not in cache
   */
  get(key) {
    if (!this.cache.has(key)) {
      this.misses++;
      return null;
    }

    this.hits++;

    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);

    return value;
  }

  /**
   * Stores an image in cache
   * Automatically evicts oldest image if cache is full
   * @param {string} key - Image key
   * @param {string} value - Image data URL
   */
  set(key, value) {
    // If key exists, delete it (we'll re-add to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Add to end (most recent)
    this.cache.set(key, value);

    // Evict oldest if over limit
    if (this.cache.size > this.maxSize) {
      // Map.keys() returns iterator in insertion order
      // First key = oldest (least recently used)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.evictions++;

      // Log stats when we start evicting (cache is full and working)
      if (this.evictions === 1 || this.evictions % 10 === 0) {
        this.logStats();
      }
    }
  }

  /**
   * Checks if an image is in cache without updating LRU order
   * @param {string} key - Image key to check
   * @returns {boolean} True if image is cached
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Removes all images from cache
   * Frees memory when disconnecting from Roon Core
   */
  clear() {
    const previousSize = this.cache.size;
    this.cache.clear();

    if (previousSize > 0) {
      console.log(`Image cache cleared: freed ${previousSize} images`);
    }
  }

  /**
   * Returns current cache statistics
   * Useful for monitoring cache effectiveness
   * @returns {Object} Cache statistics
   */
  getStats() {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: (hitRate * 100).toFixed(1) + '%',
      memoryEstimate: `~${((this.cache.size * 100) / 1024).toFixed(1)}MB`,
    };
  }

  /**
   * Logs cache statistics to console
   * Call periodically to monitor cache performance
   */
  logStats() {
    const stats = this.getStats();
    console.log('📊 Image Cache Stats:', stats);
  }
}
