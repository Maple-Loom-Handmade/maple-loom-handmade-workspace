import Link from 'next/link';
import Image from 'next/image';
import { getTranslations, getLocale } from 'next-intl/server';
import { CLIENT_ROUTES } from '@ezihubb/constants';
import {
  GIFT_GUIDE_SLUGS,
  getGiftGuide,
  getGiftGuideContent,
} from '../../lib/gift-guides';

// ── Social icon SVGs ──────────────────────────────────────────────────────────

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.79 1.53V6.78a4.85 4.85 0 01-1.02-.09z" />
    </svg>
  );
}

function PinterestIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

// ── Brand logo (matches Navbar style) ────────────────────────────────────────

function BrandLogo() {
  return (
    <div className="inline-flex items-center bg-white rounded-lg px-2.5 py-1.5">
      <Image
        src="/logo.png"
        alt="EziHubb"
        width={161}
        height={46}
        className="h-9 w-auto object-contain"
      />
    </div>
  );
}

// ── Main Footer ───────────────────────────────────────────────────────────────

export async function Footer() {
  const t      = await getTranslations('footer');
  const locale = await getLocale();
  const year   = new Date().getFullYear();

  const socials = [
    { Icon: InstagramIcon, href: 'https://instagram.com/ezihubb', label: 'Instagram' },
    { Icon: TikTokIcon,    href: 'https://tiktok.com/@ezihubb',           label: 'TikTok'    },
    { Icon: PinterestIcon, href: 'https://pinterest.com/ezihubb',          label: 'Pinterest' },
    { Icon: FacebookIcon,  href: 'https://facebook.com/ezihubb',           label: 'Facebook'  },
  ];

  const aboutLinks = [
    { label: t('about.ourStory'),   href: `/${locale}${CLIENT_ROUTES.PAGE_OUR_STORY}`    },
    { label: t('about.howItWorks'), href: `/${locale}${CLIENT_ROUTES.PAGE_HOW_IT_WORKS}` },
    { label: t('about.reviews'),    href: `/${locale}${CLIENT_ROUTES.PAGE_REVIEWS}`      },
    { label: t('about.careers'),    href: `/${locale}${CLIENT_ROUTES.PAGE_CAREERS}`      },
  ];

  const helpLinks = [
    { label: t('help.contact'),  href: `/${locale}${CLIENT_ROUTES.PAGE_CONTACT}`       },
    { label: t('help.faq'),      href: `/${locale}${CLIENT_ROUTES.PAGE_FAQ}`            },
    { label: t('help.shipping'), href: `/${locale}${CLIENT_ROUTES.PAGE_SHIPPING_INFO}`  },
    { label: t('help.returns'),  href: `/${locale}${CLIENT_ROUTES.PAGE_RETURNS}`        },
  ];

  const guideLinks = GIFT_GUIDE_SLUGS.map((slug) => {
    const guide = getGiftGuide(slug);
    if (!guide) return null;
    return {
      label: getGiftGuideContent(guide, locale).title,
      href: `/${locale}/${slug}`,
    };
  }).filter((guide): guide is { label: string; href: string } => guide !== null);

  return (
    <footer className="bg-[#2D2D2D] text-white mt-auto">
      <div className="max-w-[1280px] mx-auto px-4 md:px-6 py-10 md:py-12">

        {/* ── Main grid ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10">

          {/* Brand column — spans 2 on lg */}
          <div className="lg:col-span-2">
            <div className="mb-4">
              <BrandLogo />
            </div>
            <p className="text-[#9CA3AF] text-sm leading-relaxed max-w-xs">
              {t('tagline')}
            </p>
            <div className="flex gap-3 mt-5">
              {socials.map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-9 h-9 bg-[#3D3D4E] rounded-full flex items-center justify-center hover:bg-primary transition-colors"
                >
                  <Icon />
                </a>
              ))}
            </div>
          </div>

          {/* About column */}
          <div>
            <h3 className="font-semibold mb-4 text-sm tracking-wide uppercase">
              {t('about.title')}
            </h3>
            <ul className="space-y-3">
              {aboutLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[#D1D5DB] text-sm hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Help column */}
          <div>
            <h3 className="font-semibold mb-4 text-sm tracking-wide uppercase">
              {t('help.title')}
            </h3>
            <ul className="space-y-3">
              {helpLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[#D1D5DB] text-sm hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Bottom bar ────────────────────────────────────────────────── */}
        <nav
          aria-label={locale === 'vi' ? 'Cẩm nang quà tặng' : locale === 'zh' ? '礼物指南' : 'Gift guides'}
          className="mt-10 border-t border-[#3D3D4E] pt-6"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-white">
            {locale === 'vi' ? 'Cẩm nang quà tặng' : locale === 'zh' ? '礼物指南' : 'Gift guides'}
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-3">
            {guideLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm text-[#D1D5DB] transition-colors hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-10 pt-6 border-t border-[#3D3D4E] flex flex-col sm:flex-row items-center justify-between gap-3 text-[#B7BDC7] text-xs">
          <p>{t('copyright', { year })}</p>
          <div className="flex gap-4">
            <Link href={`/${locale}${CLIENT_ROUTES.PAGE_PRIVACY_POLICY}`} className="hover:text-white transition-colors">
              {t('privacyPolicy')}
            </Link>
            <Link href={`/${locale}${CLIENT_ROUTES.PAGE_TERMS}`} className="hover:text-white transition-colors">
              {t('termsOfService')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
