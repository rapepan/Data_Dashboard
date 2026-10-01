import type { LabelValue } from '../../types/reports';

interface FlowStepsProps {
  steps: LabelValue[];
  icons: string[];
  /** ขั้นที่คนติดมากที่สุด (ไฮไลต์สีแดง) — ไม่ระบุ = ไม่ไฮไลต์ */
  highlightIndex?: number;
  highlightLabel?: string;
}

/** ขั้นตอนการรับบริการแบบกล่องเรียงต่อกันพร้อมลูกศร (Patient Flow) */
export default function FlowSteps({ steps, icons, highlightIndex, highlightLabel = 'คิวมากที่สุด' }: FlowStepsProps) {
  return (
    <ol className="flow-steps" style={{ ['--steps' as string]: steps.length }}>
      {steps.map((step, i) => (
        <li key={step.label} className={i === highlightIndex ? 'hot' : ''}>
          {i === highlightIndex && <span className="flow-flag">{highlightLabel}</span>}
          <span className="flow-icon"><i className={`fa-solid ${icons[i] ?? 'fa-clock'}`} /></span>
          <span className="flow-label">{step.label}</span>
          <b className="flow-value">{step.value.toLocaleString('en-US')}</b>
        </li>
      ))}
    </ol>
  );
}
