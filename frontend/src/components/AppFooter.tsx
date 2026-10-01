import { Link } from 'react-router-dom';
import { DEVELOPER_TEAM } from '../config/contact';

/** ข้อความลิขสิทธิ์ท้ายทุกหน้า (รวมหน้า login) — ชื่อหน่วยงานแก้ได้ที่ config/contact.ts */
export default function AppFooter() {
  return (
    <footer className="app-footer no-print">
      © {new Date().getFullYear()} DATA BSTH. พัฒนาโดย{DEVELOPER_TEAM.name} {DEVELOPER_TEAM.organization}. สงวนลิขสิทธิ์.
      <Link to="/contact" className="app-footer-link"><i className="fa-solid fa-headset" /> ติดต่อผู้พัฒนา</Link>
    </footer>
  );
}
