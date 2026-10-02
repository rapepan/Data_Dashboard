import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { appDb } from '../repositories/app-db';
import { DATA_DIR } from '../utils/paths';

/** feedback_bell_seen = ผู้ดูแลกดดูกระดิ่งถึงเรื่องไหน · sessions_revoked_at = ถูกบังคับออกจากระบบเมื่อไร · whats_new_seen = ดูหน้าต่าง "มีอะไรใหม่" ของเวอร์ชันไหนแล้ว */
export type UserSettingName = 'feedback_bell_seen' | 'sessions_revoked_at' | 'whats_new_seen';

const FILE = path.join(DATA_DIR, 'user-settings.json');
type FileData = Record<string, Partial<Record<UserSettingName, string>>>;

function readFile(): FileData {
  if (!existsSync(FILE)) return {};
  try { return JSON.parse(readFileSync(FILE, 'utf8')) as FileData; } catch { return {}; }
}

export const userSettings = {
  /** ค่านี้ของทุกคน → { loginname: value } */
  async all(name: UserSettingName): Promise<Record<string, string>> {
    if (!appDb.isConfigured()) {
      return Object.fromEntries(Object.entries(readFile()).flatMap(([login, values]) => (values[name] ? [[login, values[name]!]] : [])));
    }
    const rows = await appDb.rows<RowDataPacket>(`SELECT loginname, value FROM ${appDb.t('user_settings')} WHERE name = ?`, [name]);
    return Object.fromEntries(rows.map(r => [r.loginname as string, r.value as string]));
  },

  async get(loginname: string, name: UserSettingName): Promise<string | null> {
    if (!appDb.isConfigured()) return readFile()[loginname]?.[name] ?? null;
    const rows = await appDb.rows<RowDataPacket>(`SELECT value FROM ${appDb.t('user_settings')} WHERE loginname = ? AND name = ?`, [loginname, name]);
    return rows[0]?.value ?? null;
  },

  async set(loginname: string, name: UserSettingName, value: string): Promise<void> {
    if (!appDb.isConfigured()) {
      const data = readFile();
      data[loginname] = { ...data[loginname], [name]: value };
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
      return;
    }
    await appDb.exec(
      `INSERT INTO ${appDb.t('user_settings')} (loginname, name, value, updated_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`,
      [loginname, name, value.slice(0, 255), new Date()],
    );
  },
};
