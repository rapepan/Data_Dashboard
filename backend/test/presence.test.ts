import { describe, expect, it } from 'vitest';
import { statusOf } from '../src/auth/presence';

const now = Date.parse('2026-10-01T10:00:00Z');
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

describe('สถานะออนไลน์', () => {
  it('กดใช้งานภายใน 5 นาที → ใช้งานอยู่', () => {
    expect(statusOf({ lastSeen: ago(0), lastActive: ago(4), loggedOutAt: null }, now)).toBe('active');
  });

  it('ยังมีสัญญาณจากหน้าเว็บ แต่ไม่ได้กดอะไรเกิน 5 นาที → เปิดค้างไว้', () => {
    expect(statusOf({ lastSeen: ago(1), lastActive: ago(12), loggedOutAt: null }, now)).toBe('idle');
  });

  it('ไม่มีสัญญาณเกิน 3 นาที (ปิดเว็บแล้ว) → ออฟไลน์', () => {
    expect(statusOf({ lastSeen: ago(4), lastActive: ago(4), loggedOutAt: null }, now)).toBe('offline');
  });

  it('logout หลังสัญญาณล่าสุด → ออฟไลน์ทันที', () => {
    expect(statusOf({ lastSeen: ago(1), lastActive: ago(1), loggedOutAt: ago(0) }, now)).toBe('offline');
  });

  it('login ใหม่หลังจาก logout → กลับมาออนไลน์', () => {
    expect(statusOf({ lastSeen: ago(0), lastActive: ago(0), loggedOutAt: ago(10) }, now)).toBe('active');
  });

  it('ไม่เคยมีสัญญาณเลย → ออฟไลน์', () => {
    expect(statusOf({ lastSeen: null, lastActive: null, loggedOutAt: null }, now)).toBe('offline');
  });
});
