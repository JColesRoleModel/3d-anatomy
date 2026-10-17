/**
 * Lazy Image Loader Utility
 * 
 * Optimizes image loading using the Intersection Observer API to load images
 * only when they enter or are about to enter the viewport. This significantly
 * improves initial page load performance.
 * 
 * Usage:
 *   const loader = new LazyImageLoader();
 *   loader.observe(imageElement); // where imageElement has data-src attribute
 */

class LazyImageLoader {
    /**
     * @param {Object} options - Configuration options
     * @param {string} options.rootMargin - Margin around root (default: '50px')
     * @param {number} options.threshold - Visibility threshold (default: 0.01)
     */
    constructor(options = {}) {
        this.rootMargin = options.rootMargin || '50px';
        this.threshold = options.threshold || 0.01;
        this.observer = this.createObserver();
        this.loadedImages = new Set();
    }

    /**
     * Create the Intersection Observer instance
     */
    createObserver() {
        // Fallback for browsers without IntersectionObserver
        if (!('IntersectionObserver' in window)) {
            return null;
        }

        return new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadImage(entry.target);
                }
            });
        }, {
            rootMargin: this.rootMargin,
            threshold: this.threshold
        });
    }

    /**
     * Load an image by setting its src from data-src
     * @param {HTMLImageElement} img - The image element to load
     */
    loadImage(img) {
        // Skip if already loaded
        if (this.loadedImages.has(img)) return;

        const src = img.dataset.src;
        if (src) {
            // Add loading class for fade-in animation
            img.classList.add('lazy-loading');

            // Set the actual source
            img.src = src;

            // Handle load success
            img.onload = () => {
                img.classList.remove('lazy-loading');
                img.classList.add('lazy-loaded');
                img.removeAttribute('data-src');
                this.loadedImages.add(img);
            };

            // Handle load error
            img.onerror = () => {
                img.classList.remove('lazy-loading');
                img.classList.add('lazy-error');
                console.warn('Failed to load image:', src);
            };

            // Stop observing this image
            if (this.observer) {
                this.observer.unobserve(img);
            }
        }
    }

    /**
     * Start observing an image element
     * @param {HTMLImageElement} element - The image element to observe
     */
    observe(element) {
        // Fallback: load immediately if no IntersectionObserver support
        if (!this.observer) {
            this.loadImage(element);
            return;
        }

        this.observer.observe(element);
    }

    /**
     * Stop observing an element
     * @param {HTMLImageElement} element - The element to stop observing
     */
    unobserve(element) {
        if (this.observer) {
            this.observer.unobserve(element);
        }
    }

    /**
     * Disconnect the observer and clean up
     */
    disconnect() {
        if (this.observer) {
            this.observer.disconnect();
        }
        this.loadedImages.clear();
    }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.LazyImageLoader = LazyImageLoader;
}
