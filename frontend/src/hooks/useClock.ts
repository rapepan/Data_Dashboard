import { useEffect, useState } from 'react';

export function useClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return {
    time: now.toLocaleTimeString('en-GB', { hour12: false }),
    date: now.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}
