/**
 * Lets a view class add its own options (renderers bound to the instance) to a feature config passed in by the app.
 */

/**
 * Merges `config` into the `name` feature of a `features` config, keeping the options passed in. `false` stays
 * disabled
 * @param {Object} features The `features` config passed to the view
 * @param {String} name
 * @param {Object} config
 * @returns {Object} A new `features` config
 */
export const mergeFeature = (features, name, config) => {
    const value = features?.[name];

    return { ...features, [name] : value === false ? false : { ...(typeof value === 'object' ? value : null), ...config } };
};
