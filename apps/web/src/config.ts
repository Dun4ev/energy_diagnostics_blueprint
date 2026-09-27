import source from '../../../config/brand.example.json';
import type { components } from './api/generated';
export const brand: components['schemas']['BrandConfig'] = {
  productName: source.productName, organizationName: source.organizationName,
  logoLight: source.logoLight, logoDark: source.logoDark, logoAlt: source.logoAlt,
  favicon: source.favicon, locale: 'ru-RU', timezone: source.timezone,
  primaryColor: source.tokens['brand.primary'], navBackground: source.tokens['nav.background'],
};
// Semantic tokens are independent of brand overrides.
export const semanticTokens = Object.fromEntries(
  Object.entries(source.tokens).filter(([key]) => /^(risk|quality|chart|topology)\./.test(key)),
);
export function applyTokens() {
  for (const [key, value] of Object.entries(source.tokens)) {
    document.documentElement.style.setProperty(`--${key.replaceAll('.', '-')}`, value);
  }
  document.documentElement.style.setProperty('--brand-primary', brand.primaryColor);
  document.documentElement.style.setProperty('--nav-background', brand.navBackground);
}
