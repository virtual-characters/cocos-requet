/**
 * Trim excess whitespace off the beginning and end of a string
 *
 * @param {String} str The String to trim
 * @returns {String} The String freed of excess whitespace
 */
export function trim(str: string) {
    return str.trim
        ? str.trim()
        : str.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
}

/**
 * Determines whether the specified URL is absolute
 *
 * @param {string} url The URL to test
 * @returns {boolean} True if the specified URL is absolute, otherwise false
 */
export function isAbsoluteURL(url: string) {
    // A URL is considered absolute if it begins with "<scheme>://" or "//" (protocol-relative URL).
    // RFC 3986 defines scheme name as a sequence of characters beginning with a letter and followed
    // by any combination of letters, digits, plus, period, or hyphen.
    return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
}

/**
 * Creates a new URL by combining the specified URLs
 *
 * @param {string} baseURL The base URL
 * @param {string} relativeURL The relative URL
 * @returns {string} The combined URL
 */
export function combineURLs(baseURL: string, relativeURL: string) {
    return relativeURL
        ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
        : baseURL;
}

/**
 * Creates a new URL by combining the baseURL with the requestedURL,
 * only when the requestedURL is not already an absolute URL.
 * If the requestURL is absolute, this function returns the requestedURL untouched.
 *
 * @param {string} baseURL The base URL
 * @param {string} requestedURL Absolute or relative URL to combine
 * @returns {string} The combined full path
 */
export function buildFullPath(baseURL: string, requestedURL: string) {
    if (baseURL && !isAbsoluteURL(requestedURL)) {
        return combineURLs(baseURL, requestedURL);
    }
    return requestedURL;
}

function encode(val: string) {
    return encodeURIComponent(val)
        .replace(/%3A/gi, ':')
        .replace(/%24/g, '$')
        .replace(/%2C/gi, ',')
        .replace(/%20/g, '+')
        .replace(/%5B/gi, '[')
        .replace(/%5D/gi, ']');
}

function isObject(val: any) {
    return val !== null && typeof val === 'object';
}

const kindOf = (function (cache) {
    var toString = Object.prototype.toString;

    return function (thing: any) {
        var str = toString.call(thing);
        return cache[str] || (cache[str] = str.slice(8, -1).toLowerCase());
    };
})(Object.create(null));

function kindOfTest(type: string) {
    type = type.toLowerCase();
    return function isKindOf(thing: any) {
        return kindOf(thing) === type;
    };
}

const isDate = kindOfTest('Date');

export function buildURL(url: string, params?: Record<string, any>) {
    if (!params) {
        return url;
    }
    const parts: string[] = [];
    Object.entries(params).forEach(([key, value]) => {
        if (value == null) return;
        if (Array.isArray(value)) {
            key = key + '[]';
        } else {
            value = [value];
        }
        value.forEach((v: any) => {
            if (isDate(v)) {
                v = v.toISOString();
            } else if (isObject(v)) {
                v = JSON.stringify(v);
            }
            parts.push(`${encode(key)}=${encode(v)}`);
        });
    });

    return url + (url.indexOf('?') === -1 ? '?' : '&') + parts.join('&');
}

// Headers whose duplicates are ignored by node
// c.f. https://nodejs.org/api/http.html#http_message_headers
const ignoreDuplicateOf = [
    'age',
    'authorization',
    'content-length',
    'content-type',
    'etag',
    'expires',
    'from',
    'host',
    'if-modified-since',
    'if-unmodified-since',
    'last-modified',
    'location',
    'max-forwards',
    'proxy-authorization',
    'referer',
    'retry-after',
    'user-agent',
];

/**
 * Parse headers into an object
 *
 * ```
 * Date: Wed, 27 Aug 2014 08:58:49 GMT
 * Content-Type: application/json
 * Connection: keep-alive
 * Transfer-Encoding: chunked
 * ```
 *
 * @param {String} headers Headers needing to be parsed
 * @returns {Object} Headers parsed into an object
 */
export function parseHeaders(
    headers: string
): Record<string, string | string[]> {
    const parsed: Record<string, string | string[]> = {};
    if (!headers) {
        return parsed;
    }

    headers.split('\n').forEach((line) => {
        const i = line.indexOf(':');
        const key = trim(line.slice(0, i)).toLowerCase();
        const val = trim(line.slice(i + 1));
        if (key) {
            if (parsed[key] && ignoreDuplicateOf.indexOf(key) >= 0) {
                return;
            }
            if (key === 'set-cookie') {
                if (!parsed[key]) {
                    parsed[key] = [val];
                } else {
                    (parsed[key] as string[]).push(val);
                }
            } else {
                parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
            }
        }
    });

    return parsed;
}

export function parseProtocol(url: string): string {
    const match = /^([-+\w]{1,25})(:?\/\/|:)/.exec(url);
    return (match && match[1]) || '';
}

export function stringifySafely(rawValue: any) {
    if (typeof rawValue === 'string') {
        try {
            JSON.parse(rawValue);
            return trim(rawValue);
        } catch (e: any) {
            if (e.name !== 'SyntaxError') {
                throw e;
            }
        }
    }

    return JSON.stringify(rawValue);
}
