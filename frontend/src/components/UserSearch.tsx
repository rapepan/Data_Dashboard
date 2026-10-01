import { useMemo, useRef, useState, type KeyboardEvent } from 'react';

export interface UserOption {
  loginname: string;
  count: number;
  last: string;
}

interface UserSearchProps {
  value: string;
  onChange: (value: string) => void;
  users: UserOption[];
}

const MAX_SHOWN = 5;

function lastSeen(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

export default function UserSearch({ value, onChange, users }: UserSearchProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const found = q ? users.filter(u => u.loginname.toLowerCase().includes(q)) : users;
    return [...found].sort((a, b) => {
      const aStart = a.loginname.toLowerCase().startsWith(q) ? 0 : 1;
      const bStart = b.loginname.toLowerCase().startsWith(q) ? 0 : 1;
      return aStart - bStart || b.last.localeCompare(a.last);
    }).slice(0, MAX_SHOWN);
  }, [users, value]);

  const pick = (loginname: string) => {
    onChange(loginname);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open || matches.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % matches.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + matches.length) % matches.length); }
    if (e.key === 'Enter') { e.preventDefault(); pick(matches[Math.min(active, matches.length - 1)].loginname); }
  };

  const showList = open && matches.length > 0 && !(matches.length === 1 && matches[0].loginname === value);

  return (
    <div className="user-search">
      <label className="table-search">
        <i className="fa-solid fa-user" />
        <input
          ref={inputRef}
          value={value}
          onChange={e => { onChange(e.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder="ชื่อผู้ใช้..."
          role="combobox"
          aria-expanded={showList}
          aria-autocomplete="list"
        />
        {value && (
          <button type="button" className="user-search-clear" onMouseDown={e => { e.preventDefault(); onChange(''); }} aria-label="ล้าง">
            <i className="fa-solid fa-xmark" />
          </button>
        )}
      </label>
      {showList && (
        <ul className="user-search-list" role="listbox">
          {matches.map((u, i) => (
            <li key={u.loginname} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'active' : ''} onMouseDown={e => { e.preventDefault(); pick(u.loginname); }} onMouseEnter={() => setActive(i)}>
                <i className="fa-solid fa-circle-user" />
                <span className="user-search-name">{u.loginname}</span>
                <small>{u.count.toLocaleString()} รายการ · ล่าสุด {lastSeen(u.last)}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
