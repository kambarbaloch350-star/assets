import { T, faNum } from '../core/i18n';
import { player } from '../core/save';
import { TOTAL_LEVELS } from '../core/levels';
import { clear, el, toast } from '../ui/dom';
import { router, topbar, type Screen } from '../ui/router';
import { coinChip } from '../ui/coinchip';
import { sfx } from '../platform/audio';

const CHAPTER = 20;
const CHAPTER_NAMES = [
  'گام نخست',
  'راه فیروزه',
  'باغ اعداد',
  'کوچهٔ ضرب',
  'کاخ تقسیم',
  'گنج بزرگ',
];

export function createLevels(): Screen {
  const root = el('div', 'levels');
  root.appendChild(
    topbar(T.levelSelect, () => router.go('menu'), coinChip(() => router.go('store'))),
  );

  const scroll = el('div', 'levels__scroll');
  root.appendChild(scroll);

  function build() {
    clear(scroll);
    const unlocked = player.state.unlocked;

    for (let c = 0; c * CHAPTER < TOTAL_LEVELS; c++) {
      const from = c * CHAPTER + 1;
      const to = Math.min(TOTAL_LEVELS, (c + 1) * CHAPTER);
      scroll.appendChild(
        el('div', 'levels__chapter', CHAPTER_NAMES[c] ?? `فصل ${faNum(c + 1)}`),
      );

      const grid = el('div', 'levels__grid');
      for (let n = from; n <= to; n++) {
        const rec = player.record(n);
        const isLocked = n > unlocked;
        const isNext = n === unlocked;

        const b = el('button', 'lvl') as HTMLButtonElement;
        if (isLocked) b.classList.add('lvl--locked');
        else if (isNext) b.classList.add('lvl--next');
        else if (rec) b.classList.add('lvl--done');

        b.appendChild(el('span', 'num', isLocked ? '' : faNum(n)));
        if (isLocked) b.appendChild(el('span', 'lvl__lock', '🔒'));

        if (rec) {
          const st = el('div', 'lvl__stars');
          for (let i = 0; i < 3; i++) {
            st.appendChild(el('i', i < rec.stars ? 'on' : '', '★'));
          }
          b.appendChild(st);
        }

        b.onclick = () => {
          if (isLocked) {
            sfx.play('bubble', 0.3);
            toast('این مرحله هنوز قفل است', 'warn');
            return;
          }
          sfx.play('tap');
          router.go('game', { level: n });
        };
        grid.appendChild(b);
      }
      scroll.appendChild(grid);
    }
  }

  return {
    name: 'levels',
    root,
    onEnter() {
      build();
      // scroll the current level into view
      requestAnimationFrame(() => {
        const next = scroll.querySelector('.lvl--next') as HTMLElement | null;
        if (next) {
          scroll.scrollTop = Math.max(0, next.offsetTop - scroll.clientHeight / 2);
        }
      });
    },
  };
}
