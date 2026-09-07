export const SEO_DOMAIN = 'https://ezihubb.com';

/**
 * Serialize JSON-LD safely for an inline script element. Escaping `<` keeps
 * the JSON value unchanged while preventing seller-controlled text from
 * creating a closing script tag in the HTML parser.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Build canonical + hreflang alternates for a given site-relative path
 * (e.g. '/categories/mugs').
 *
 * `next-intl`'s `routing.ts` has no `localePrefix` override, so it defaults
 * to `'always'` — every locale, INCLUDING the default `en`, is served under
 * a `/xx` prefix (`/en/...`, never bare `/...`). The canonical MUST match
 * the URL actually served, or Google treats the real `/en/...` page as a
 * duplicate of a canonical URL that itself 307/308-redirects — this was the
 * root cause of most "Alternate page with proper canonical tag" / "Page
 * with redirect" entries in Search Console.
 */
export function buildAlternates(path: string, locale: string) {
  // '/' + '/' would double up; the locale root is just `/xx`, no trailing path.
  const suffix = path === '/' ? '' : path;
  return {
    canonical: `${SEO_DOMAIN}/${locale}${suffix}`,
    languages: {
      'en':        `${SEO_DOMAIN}/en${suffix}`,
      'vi':        `${SEO_DOMAIN}/vi${suffix}`,
      'zh':        `${SEO_DOMAIN}/zh${suffix}`,
      'x-default': `${SEO_DOMAIN}/en${suffix}`,
    },
  };
}
