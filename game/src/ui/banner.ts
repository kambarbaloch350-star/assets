import { T } from '../core/i18n';
import { player } from '../core/save';
import { el } from './dom';
import { ads } from '../platform/tapsell';

/**
 * Tapsell banner surface.
 *
 * In the Android wrapper the REAL Tapsell banner view is positioned by the
 * native layer over this exact strip; here we render an equivalent-size
 * placeholder so the web build has identical layout and safe-area handling.
 */
export function mountBanner(): HTMLElement {
  const bar = el('div', 'banner');
  bar.append(
    el('div', 'banner__tag', T.sponsored),
    el('div', 'banner__txt', 'اپلیکیشن‌های برتر ایرانی را در کافه‌بازار ببینید'),
    el('button', 'banner__cta', 'مشاهده'),
  );
  document.body.appendChild(bar);

  const setH = (on: boolean) =>
    document.documentElement.style.setProperty('--banner-h', on ? '56px' : '0px');

  ads.onBannerChange((visible) => {
    const on = visible && !player.state.noAds;
    bar.classList.toggle('is-on', on);
    setH(on);
  });

  return bar;
}
