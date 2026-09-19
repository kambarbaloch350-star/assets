import { player } from '../core/save';
import { faNum } from '../core/i18n';
import { el } from './dom';
import { sfx } from '../platform/audio';

/** Reusable wallet chip. Click → store. Animates when the balance changes. */
export function coinChip(onPlus: () => void): HTMLElement {
  const chip = el('button', 'coinchip') as HTMLButtonElement;
  const img = el('img');
  img.src = './ui/img_coin.png';
  img.alt = '';
  const num = el('span', 'num', faNum(player.coins));
  const plus = el('span', 'coinchip__plus', '+');

  chip.append(plus, num, img);
  chip.setAttribute('data-coinchip', '1');
  chip.onclick = () => {
    sfx.play('tap');
    onPlus();
  };

  let last = player.coins;
  const sync = () => {
    if (player.coins === last) return;
    last = player.coins;
    num.textContent = faNum(player.coins);
    chip.classList.remove('is-bump');
    void chip.offsetWidth;
    chip.classList.add('is-bump');
  };
  player.subscribe(sync);

  return chip;
}

/** Animate N coins flying from a point into the wallet chip. */
export function flyCoins(fromX: number, fromY: number, count = 8, onDone?: () => void) {
  const chip = document.querySelector('.screen.is-active [data-coinchip]') as HTMLElement | null;
  const target = chip?.getBoundingClientRect();
  const tx = target ? target.left + target.width / 2 : window.innerWidth / 2;
  const ty = target ? target.top + target.height / 2 : 40;

  for (let i = 0; i < count; i++) {
    const c = el('i', 'coinfly');
    c.style.left = `${fromX - 14}px`;
    c.style.top = `${fromY - 14}px`;
    document.body.appendChild(c);

    const delay = i * 55;
    const spreadX = (Math.random() - 0.5) * 120;
    const spreadY = -40 - Math.random() * 70;

    c.animate(
      [
        { transform: 'translate(0,0) scale(0.55)', opacity: 0 },
        { transform: `translate(${spreadX}px, ${spreadY}px) scale(1.1)`, opacity: 1, offset: 0.32 },
        { transform: `translate(${tx - fromX}px, ${ty - fromY}px) scale(0.42)`, opacity: 0.9 },
      ],
      { duration: 760, delay, easing: 'cubic-bezier(.4,0,.5,1)', fill: 'forwards' },
    ).onfinish = () => {
      c.remove();
      if (i === count - 1) {
        sfx.play('cash', 0.5);
        onDone?.();
      }
    };
  }
}
