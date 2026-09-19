import { T, faNum } from '../../core/i18n';
import { player } from '../../core/save';
import { el, toast } from '../dom';
import { makePanel, bigBtn } from './base';
import { sfx } from '../../platform/audio';
import { ads } from '../../platform/tapsell';

function row(icon: string, label: string, control: HTMLElement): HTMLElement {
  const r = el('div', 'setrow');
  r.append(el('div', 'setrow__ico', icon), el('div', 'setrow__lbl', label), control);
  return r;
}

function toggle(initial: boolean, onChange: (v: boolean) => void): HTMLElement {
  const t = el('button', `switch${initial ? ' on' : ''}`);
  t.onclick = () => {
    const on = !t.classList.contains('on');
    t.classList.toggle('on', on);
    sfx.play('tap');
    onChange(on);
  };
  return t;
}

export function openSettings() {
  const { panel, close } = makePanel({ closable: true });
  panel.appendChild(el('h2', 'panel__title', T.settings));

  const list = el('div', '');
  list.style.marginTop = '8px';

  list.appendChild(
    row('🔊', T.sound, toggle(player.state.sound, () => player.toggle('sound'))),
  );
  list.appendChild(
    row('🎵', T.music, toggle(player.state.music, () => player.toggle('music'))),
  );

  const langTag = el('div', '', T.persian);
  langTag.style.cssText = 'font-size:13px;color:var(--turq);font-weight:800';
  list.appendChild(row('🌐', T.language, langTag));

  // Remove-ads state
  const adState = el('div', '');
  adState.style.cssText = 'font-size:12.5px;font-weight:800';
  if (player.state.noAds) {
    adState.textContent = T.adsRemoved;
    adState.style.color = '#6ee7a0';
  } else {
    const b = el('button', '', T.buy);
    b.style.cssText =
      'padding:7px 14px;border-radius:11px;font-size:12px;font-weight:900;background:linear-gradient(180deg,#ffd45f,#e0951c);color:#4a2a00';
    b.onclick = () => {
      close();
      window.dispatchEvent(new CustomEvent('open-store'));
    };
    adState.appendChild(b);
  }
  list.appendChild(row('🚫', T.removeAds, adState));

  panel.appendChild(list);

  // stats
  const stats = el('div', 'win__note');
  stats.innerHTML =
    `★ ${faNum(player.totalStars)} &nbsp;•&nbsp; ${T.level} ${faNum(player.state.unlocked)} ` +
    `&nbsp;•&nbsp; 🪙 ${faNum(player.coins)}`;
  stats.style.marginTop = '14px';
  panel.appendChild(stats);

  // reset
  const reset = el('button', 'danger', T.resetProgress);
  let armed = false;
  reset.onclick = () => {
    if (!armed) {
      armed = true;
      reset.textContent = T.resetConfirm;
      sfx.play('bubble', 0.3);
      setTimeout(() => {
        armed = false;
        reset.textContent = T.resetProgress;
      }, 3200);
      return;
    }
    player.resetAll();
    ads.setNoAds(false);
    close();
    toast('پیشرفت پاک شد', 'warn');
    window.dispatchEvent(new CustomEvent('progress-reset'));
  };
  panel.appendChild(reset);

  panel.appendChild(
    el(
      'div',
      'store__foot',
      `${T.appName} • ${T.version} ۱٫۰٫۰<br>تبلیغات: تپسل &nbsp;•&nbsp; پرداخت: کافه‌بازار`,
    ),
  );

  const done = bigBtn(T.gotIt, 'play', () => close());
  done.style.marginTop = '10px';
  panel.appendChild(done);
}
