/**
 * Simple test to verify the AlbumSelector performance improvements
 * Run this after connecting to a Roon core and playing some albums
 */

import { getAlbumSelectorMetrics } from './roonService.js';

function formatMetrics() {
  try {
    const data = getAlbumSelectorMetrics();
    const { metrics, cacheStats } = data;

    console.log('\n=== AlbumSelector Performance Metrics ===');
    console.log(`Pool builds: ${metrics.poolBuilds}`);
    console.log(`Cache hits: ${metrics.cacheHits}`);
    console.log(`Cache misses: ${metrics.cacheMisses}`);
    console.log(`Total API calls: ${metrics.apiCalls}`);
    console.log(
      `Average selection time: ${metrics.totalSelectTime > 0 ? Math.round(metrics.totalSelectTime / (metrics.cacheHits + metrics.cacheMisses)) : 0}ms`
    );

    console.log('\n=== Cache Statistics ===');
    console.log(`Pools in cache: ${cacheStats.poolsInCache}`);
    if (cacheStats.poolsInCache > 0) {
      console.log(
        `Oldest cache age: ${Math.round(cacheStats.oldestCacheAge / 1000)}s`
      );
      console.log(`Cache keys: ${cacheStats.cacheKeys.join(', ')}`);
    }

    const hitRate =
      metrics.cacheHits + metrics.cacheMisses > 0
        ? Math.round(
            (metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) *
              100
          )
        : 0;
    console.log(`Cache hit rate: ${hitRate}%`);

    return data;
  } catch (error) {
    console.error('Error getting metrics:', error.message);
    return null;
  }
}

// Export for use in Node.js REPL or other testing
export { formatMetrics };

// If run directly, show current metrics
if (import.meta.url === `file://${process.argv[1]}`) {
  formatMetrics();
}
