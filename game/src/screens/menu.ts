import { T, faNum } from '../core/i18n';
import { player } from '../core/save';
import { el } from '../ui/dom';
import { router, type Screen } from '../ui/router';
import { coinChip } from '../ui/coinchip';
import { sfx } from '../platform/audio';
import { openSettings } from '../ui/panels/settings';
import { openHowTo } from '../ui/panels/howto';

export function createMenu(): Screen {
  const root = el('div', 'menu');

  // top-right wallet
  const bar = el('div', 'topbar');
  bar.style.width = '100%';
  bar.style.position = 'absolute';
  bar.style.top = 'calc(var(--safe-t))';
  const gear = el('button', 'iconbtn', '⚙');
  gear.onclick = () => {
    sfx.play('tap');
    openSettings();
  };
  const help = el('button', 'iconbtn', '؟');
  help.onclick = () => {
    sfx.play('tap');
    openHowTo();
  };
  bar.append(gear, help, el('div', 'topbar__title', ''), coinChip(() => router.go('store')));
  root.appendChild(bar);

  // crest / logo
  const crest = el('div', 'menu__crest');
  crest.appendChild(el('div', 'menu__rays'));
  const med = el('div', 'menu__medallion');
  med.appendChild(el('div', 'menu__glyph', '۷×۸'));
  crest.appendChild(med);
  root.appendChild(crest);

  root.appendChild(el('h1', 'menu__name t-title', T.appName));
  root.appendChild(el('div', 'menu__tag', T.tagline));

  // buttons
  const stack = el('div', 'menu__stack');

  const play = el('button', 'bigbtn bigbtn--play');
  const playLabel = el('span', '', T.play);
  play.append(el('span', 'bigbtn__ico', '▶'), playLabel);
  play.onclick = () => {
    sfx.play('bubble');
    router.go('game', { level: player.state.unlocked });
  };

  const levels = el('button', 'bigbtn bigbtn--violet');
  levels.append(el('span', 'bigbtn__ico', '☷'), el('span', '', T.levels));
  levels.onclick = () => {
    sfx.play('tap');
    router.go('levels');
  };

  const store = el('button', 'bigbtn bigbtn--gold');
  store.append(el('span', 'bigbtn__ico', '🛍'), el('span', '', T.store));
  store.onclick = () => {
    sfx.play('tap');
    router.go('store');
  };

  stack.append(play, levels, store);
  root.appendChild(stack);

  // stats footer
  const foot = el('div', 'menu__foot');
  const stats = el('div', '');
  stats.style.cssText =
    'font-size:12.5px;color:var(--muted);font-weight:700;display:flex;gap:16px;align-items:center';
  foot.appendChild(stats);
  root.appendChild(foot);

  root.appendChild(el('div', 'menu__ver', `${T.version} ۱٫۰٫۰`));

  const sync = () => {
    const lv = player.state.unlocked;
    playLabel.textContent = lv > 1 ? `${T.continueGame} ${faNum(lv)}` : T.play;
    stats.innerHTML =
      `<span>★ ${faNum(player.totalStars)}</span>` +
      `<span>${T.level} ${faNum(Math.max(1, lv - 1))} ${player.state.noAds ? '• بدون تبلیغ' : ''}</span>`;
  };
  player.subscribe(sync);

  return {
    name: 'menu',
    root,
    onEnter: sync,
  };
}
