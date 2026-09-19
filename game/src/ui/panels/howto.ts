import { T } from '../../core/i18n';
import { el, md } from '../dom';
import { makePanel, bigBtn } from './base';

const STEPS = [
  'هر خانه با یک کارت *عدد هدف* (طلایی) باز می‌شود.',
  'سپس کارت‌هایی که *حاصلشان همان عدد است* را روی آن بگذار.',
  'وقتی خانه کامل شد، *پاک می‌شود* و دوباره آزاد می‌گردد.',
  'در ستون‌ها فقط کارت‌های *هم‌ارزش* روی هم می‌نشینند.',
  'روی *دستهٔ کارت* بزن تا کارت تازه پخش شود.',
  'همهٔ کارت‌ها را پاک کن تا مرحله تمام شود و *۵۰ سکه* بگیری!',
];

export function openHowTo() {
  const { panel, close } = makePanel({ closable: true });
  panel.appendChild(el('h2', 'panel__title', T.howTo));

  // little visual demo: 12 ← 7+5
  const demo = el('div', 'howto__demo');
  const m = el('div', 'demo-card master num', '۱۲');
  const eq = el('div', 'demo-eq', '←');
  const a = el('div', 'demo-card num', '۷ + ۵');
  const b = el('div', 'demo-card num', '۳ × ۴');
  demo.append(b, a, eq, m);
  panel.appendChild(demo);

  const list = el('div', '');
  list.style.marginTop = '6px';
  STEPS.forEach((s, i) => {
    const r = el('div', 'howto__step');
    r.append(el('div', 'howto__n num', String(i + 1).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])));
    r.appendChild(el('div', 'howto__t', md(s)));
    list.appendChild(r);
  });
  panel.appendChild(list);

  const done = bigBtn(T.gotIt, 'play', () => close());
  done.style.marginTop = '12px';
  panel.appendChild(done);
}
