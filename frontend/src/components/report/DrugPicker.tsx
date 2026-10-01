import { useMemo, useState } from 'react';
import type { DrugCatalogItem } from '../../types/reports';

interface DrugPickerProps {
  catalog: DrugCatalogItem[];
  value: DrugCatalogItem | null;
  onChange: (drug: DrugCatalogItem | null) => void;
}

const TYPE_LABEL = { herb: 'สมุนไพร', common: 'สามัญ' };

/** ช่องค้นหา + เลือกรายการยา (พิมพ์รหัสหรือชื่อยา) */
export default function DrugPicker({ catalog, value, onChange }: DrugPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? catalog.filter(d => d.code.includes(q) || d.name.toLowerCase().includes(q)) : catalog).slice(0, 12);
  }, [catalog, query]);

  const pick = (drug: DrugCatalogItem) => {
    onChange(drug);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="drug-picker">
      <label className="drug-picker-input">
        <i className="fa-solid fa-magnifying-glass" />
        <input
          value={open ? query : value ? `${value.code} · ${value.name}` : query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={e => {
            if (e.key === 'Enter' && results[0]) pick(results[0]);
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="พิมพ์ค้นหารหัสยา หรือชื่อรายการยาเพื่อเปรียบเทียบ 3 ปี..."
        />
        {value && !open && (
          <button type="button" className="drug-picker-clear" onMouseDown={e => { e.preventDefault(); onChange(null); }} aria-label="ล้างรายการที่เลือก">
            <i className="fa-solid fa-xmark" />
          </button>
        )}
      </label>
      {open && (
        <ul className="drug-picker-list">
          {results.map(drug => (
            <li key={drug.code}>
              {/* onMouseDown: เลือกก่อน input เสีย focus (onBlur ปิดรายการ) */}
              <button type="button" onMouseDown={e => { e.preventDefault(); pick(drug); }} className={value?.code === drug.code ? 'active' : ''}>
                <code>{drug.code}</code>
                <span>{drug.name}</span>
                <small className={`type-${drug.type}`}>{TYPE_LABEL[drug.type]}</small>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="empty">ไม่พบรายการยา</li>}
        </ul>
      )}
    </div>
  );
}
