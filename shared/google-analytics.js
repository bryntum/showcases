/**
 * Google Analytics 4: the Vite tag descriptors vite.config.js injects into every page when the SHOWCASES_GA4_ID
 * environment variable holds a measurement ID. Production deploys only, see the root README. Build time code, not part
 * of the shared package's exports.
 */

// A GA4 measurement ID, e.g. G-1VY6776VJP. Checked, as it is written into an inline script and a URL
const measurementIdRe = /^G-[A-Z0-9]+$/;

/**
 * The tags loading GA4 for the measurement `id`: an inline script setting the consent defaults and queueing the
 * config, then Google's gtag.js loader
 * @param {String} id The GA4 measurement ID
 * @returns {Object[]} Vite `HtmlTagDescriptor`s
 */
export function googleAnalyticsTags(id) {
    if (!measurementIdRe.test(id)) {
        throw new Error(`SHOWCASES_GA4_ID must be a GA4 measurement ID like G-XXXXXXXXXX, got "${id}"`);
    }

    return [
        {
            tag      : 'script',
            // Google's gtag.js snippet with Consent Mode v2. The consent default must come before gtag.js loads and
            // before the config. Everything is denied, so GA4 sends cookieless pings only: no cookies, no ads. A
            // future consent banner would call gtag('consent', 'update', { analytics_storage : 'granted' }) here
            children : `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied'
});
gtag('js', new Date());
gtag('config', '${id}', { allow_google_signals: false, allow_ad_personalization_signals: false });`,
            injectTo : 'head'
        },
        {
            tag      : 'script',
            attrs    : { async : true, src : `https://www.googletagmanager.com/gtag/js?id=${id}` },
            injectTo : 'head'
        }
    ];
}
