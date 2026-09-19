import { T, faNum } from '../../core/i18n';
import { COINS_PER_LEVEL } from '../../core/economy';
import { player } from '../../core/save';
import { confetti, el } from '../dom';
import { makePanel, bigBtn } from './base';
import { flyCoins } from '../coinchip';
import { sfx } from '../../platform/audio';
import { ads } from '../../platform/tapsell';

/** Attach a Tapsell native ad to a panel (skipped when ads are removed). */
async function attachNative(panel: HTMLElement) {
  if (player.state.noAds) return;
  const ad = await ads.requestNative();
  if (!ad) return;

  const n = el('div', 'nativead');
  n.appendChild(el('div', 'nativead__ico', '◆'));
  const b = el('div', 'nativead__b');
  const t = el('div', 'nativead__t');
  t.append(el('span', '', ad.title), el('span', 'nativead__sp', ad.sponsoredLabel || T.sponsored));
  b.append(t, el('div', 'nativead__d', ad.description));
  n.append(b, el('button', 'nativead__cta', ad.cta));
  panel.appendChild(n);
}

// ------------------------------------------------------------------ WIN

export function showWin(o: {
  level: number;
  stars: number;
  earned: number;
  moves: number;
  onNext: () => void;
  onReplay: () => void;
  onMenu: () => void;
}): Promise<void> {
  return new Promise((resolve) => {
    const { panel, close } = makePanel({ closable: false });
    panel.appendChild(el('div', 'win__burst'));
    confetti(panel, 60);

    panel.appendChild(el('h2', 'panel__title', T.levelComplete));
    panel.appendChild(
      el('p', 'panel__msg', `${T.level} <b>${faNum(o.level)}</b> — ${faNum(o.moves)} ${T.moves}`),
    );

    // stars
    const st = el('div', 'win__stars');
    const nodes: HTMLElement[] = [];
    for (let i = 0; i < 3; i++) {
      const s = el('div', `win__star${i === 1 ? ' mid' : ''}`);
      nodes.push(s);
      st.appendChild(s);
    }
    panel.appendChild(st);
    nodes.forEach((n, i) => {
      if (i < o.stars) {
        setTimeout(() => {
          n.classList.add('on');
          sfx.play('reward', 0.4);
        }, 260 + i * 200);
      }
    });

    // coin reward — exactly 50, first clear only
    const rw = el('div', 'win__reward');
    const img = el('img');
    img.src = './ui/img_coin.png';
    img.alt = '';
    rw.append(img, el('span', 'num', `+${faNum(o.earned)}`));
    panel.appendChild(rw);

    if (o.earned > 0) {
      setTimeout(() => {
        const r = rw.getBoundingClientRect();
        flyCoins(r.left + r.width / 2, r.top + r.height / 2, 9);
      }, 900);
    } else {
      panel.appendChild(
        el(
          'div',
          'win__note',
          `این مرحله قبلاً پاداش <b>${faNum(COINS_PER_LEVEL)}</b> سکه‌ای خود را داده است.`,
        ),
      );
    }

    void attachNative(panel);

    const next = bigBtn(T.nextLevel, 'play', () => {
      close();
      o.onNext();
      resolve();
    }, '▶');
    next.style.marginTop = '8px';
    panel.appendChild(next);

    const row = el('div', 'panel__row');
    row.append(
      bigBtn(T.replay, 'violet', () => {
        close();
        o.onReplay();
        resolve();
      }),
      bigBtn(T.backToMenu, 'teal', () => {
        close();
        o.onMenu();
        resolve();
      }),
    );
    panel.appendChild(row);
  });
}

// --------------------------------------------------------- OUT OF MOVES

export function showOutOfMoves(
  price: number,
  onBuy: () => boolean,
  onRestart: () => void,
  onMenu: () => void,
) {
  const { panel, close } = makePanel({ closable: false });
  panel.appendChild(el('h2', 'panel__title', T.outOfMoves));
  panel.appendChild(el('p', 'panel__msg', T.outOfMovesMsg));

  const buy = el('button', 'bigbtn bigbtn--gold') as HTMLButtonElement;
  buy.innerHTML = `<span>${T.buyMoves} +۱۵</span>`;
  const tag = el('span', 'bigbtn__sub', `${faNum(price)} 🪙`);
  buy.appendChild(tag);
  buy.onclick = () => {
    sfx.play('tap');
    if (onBuy()) close();
  };
  panel.appendChild(buy);

  void attachNative(panel);

  const row = el('div', 'panel__row');
  row.append(
    bigBtn(T.restart, 'violet', () => {
      close();
      onRestart();
    }),
    bigBtn(T.backToMenu, 'teal', () => {
      close();
      onMenu();
    }),
  );
  panel.appendChild(row);
}

// ---------------------------------------------------------------- STUCK

export function showStuck(price: number, onJoker: () => boolean, onRestart: () => void) {
  const { panel, close } = makePanel({ closable: true });
  panel.appendChild(el('h2', 'panel__title', T.noMoves));
  panel.appendChild(el('p', 'panel__msg', T.noMovesMsg));

  const owned = player.state.inv.joker;
  const b = el('button', 'bigbtn bigbtn--gold') as HTMLButtonElement;
  b.innerHTML = `<span>${T.joker}</span>`;
  b.appendChild(el('span', 'bigbtn__sub', owned > 0 ? `×${faNum(owned)}` : `${faNum(price)} 🪙`));
  b.onclick = () => {
    sfx.play('tap');
    if (onJoker()) close();
  };
  panel.appendChild(b);

  const row = el('div', 'panel__row');
  row.append(
    bigBtn(T.restart, 'violet', () => {
      close();
      onRestart();
    }),
  );
  panel.appendChild(row);
}

// ---------------------------------------------------------------- PAUSE

export function showPause(onRestart: () => void, onMenu: () => void, onStore: () => void) {
  const { panel, close } = makePanel({ closable: true });
  panel.appendChild(el('h2', 'panel__title', '⏸'));
  panel.appendChild(el('p', 'panel__msg', 'بازی متوقف شد'));

  const stack = el('div', '');
  stack.style.cssText = 'display:flex;flex-direction:column;gap:10px';
  stack.append(
    bigBtn('ادامه', 'play', () => close()),
    bigBtn(T.restart, 'violet', () => {
      close();
      onRestart();
    }),
    bigBtn(T.store, 'gold', () => {
      close();
      onStore();
    }),
    bigBtn(T.backToMenu, 'teal', () => {
      close();
      onMenu();
    }),
  );
  panel.appendChild(stack);
}

// --------------------------------------------------------- NEED COINS

export function showNeedCoins(price: number, onStore: () => void) {
  const { panel, close } = makePanel({ closable: true });
  panel.appendChild(el('h2', 'panel__title', T.notEnoughCoins));
  panel.appendChild(
    el(
      'p',
      'panel__msg',
      `برای این کار <b>${faNum(price)}</b> سکه لازم است.<br>موجودی تو: <b>${faNum(player.coins)}</b>`,
    ),
  );
  panel.appendChild(
    bigBtn(T.goToStore, 'gold', () => {
      close();
      onStore();
    }, '🛍'),
  );
  // Note: deliberately NO "watch an ad for coins" option here.
  panel.appendChild(
    el(
      'div',
      'win__note',
      'سکه فقط با تکمیل مراحل (۵۰ سکه) یا خرید از فروشگاه به دست می‌آید.',
    ),
  );
}
