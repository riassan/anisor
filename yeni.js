/**
 * YeniWatch SoraExtractor Script
 * version: 1.0.0
 */

(function() {
    const sourceName = 'YeniWatch';
    const baseUrl = 'https://yeniwatch.net.tr';

    /**
     * Called to prepare the page before extracting.
     */
    function beforeExtract(page) {
        // Optionally run any JS on the page to reveal hidden content
        return page;
    }

    /**
     * Extract stream sources from the page.
     * @param {Document} doc - Parsed HTML document
     * @returns {Array} Array of source objects { url, quality, isM3U8 }
     */
    function getSources(doc) {
        const sources = [];
        // Example: find <video> tag with HLS source
        const video = doc.querySelector('video');
        if (video) {
            const src = video.getAttribute('src') || video.querySelector('source')?.getAttribute('src');
            if (src) {
                sources.push({
                    url: src,
                    quality: 'HD',
                    isM3U8: src.endsWith('.m3u8')
                });
            }
        }
        return sources;
    }

    /**
     * Register the extractor with Sora
     */
    Sora.addExtractor({
        name: sourceName,
        urlPatterns: ['https://yeniwatch.net.tr/*'],
        async beforeFetchPage(page) {
            return beforeExtract(page);
        },
        async extract(page) {
            const doc = page.getDocument();
            const sources = getSources(doc);
            return {
                streams: sources
            };
        }
    });
})();
