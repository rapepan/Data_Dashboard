import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TipState {
  text: string;
  x: number;
  y: number;
  below: boolean;
}

const GAP = 8;
const SHOW_DELAY_MS = 250;

export default function GlobalTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const hide = () => {
      window.clearTimeout(timer.current);
      current.current = null;
      setTip(null);
    };

    const show = (target: EventTarget | null) => {
      const el = (target as HTMLElement | null)?.closest?.<HTMLElement>('[data-tip]');
      if (el === current.current) return;
      hide();
      if (!el?.dataset.tip) return;
      current.current = el;
      timer.current = window.setTimeout(() => {
        const rect = el.getBoundingClientRect();
        const below = rect.top < 60;
        setTip({ text: el.dataset.tip!, x: rect.left + rect.width / 2, y: below ? rect.bottom + GAP : rect.top - GAP, below });
      }, SHOW_DELAY_MS);
    };

    const onOver = (e: MouseEvent) => show(e.target);
    const onFocus = (e: FocusEvent) => show(e.target);
    document.addEventListener('mouseover', onOver);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', hide);
    document.addEventListener('mousedown', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      hide();
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('mousedown', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);

  if (!tip) return null;

  const x = Math.min(Math.max(tip.x, 150), window.innerWidth - 150);
  return createPortal(
    <div className={`global-tip${tip.below ? ' below' : ''}`} style={{ left: x, top: tip.y }} role="tooltip">
      {tip.text}
      <span className="global-tip-arrow" style={{ left: `calc(50% + ${tip.x - x}px)` }} />
    </div>,
    document.body,
  );
}
