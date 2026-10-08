import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeRequest, pageLabel } from '../src/utils/request-labels';
import { logger } from '../src/utils/logger';

afterEach(() => vi.restoreAllMocks());

describe('แยกประเภท request (ข้อความในเทอร์มินัล)', () => {
  it('เปิดหน้า = GET ปกติ · ชื่อภาษาไทยแทน path · ไม่สน query string', () => {
    expect(describeRequest('GET', '/api/dental/report?start=2026-10-01&end=2026-10-07', false)).toEqual({ kind: 'page', label: 'ทันตกรรม' });
    expect(describeRequest('GET', '/api/admin/feedback/12/images/a.jpg', false)).toEqual({ kind: 'page', label: 'แจ้งปัญหา · ดูรูปแนบ' });
  });

  it('ทำรายการ = POST/PUT/DELETE', () => {
    expect(describeRequest('POST', '/api/auth/login', false)).toEqual({ kind: 'action', label: 'เข้าสู่ระบบ' });
    expect(describeRequest('PUT', '/api/admin/feedback/7/status', false)).toEqual({ kind: 'action', label: 'เปลี่ยนสถานะเรื่องแจ้งปัญหา' });
  });

  it('เบื้องหลัง = header X-Background หรือ endpoint ที่หน้าเว็บเช็คเองเสมอ', () => {
    expect(describeRequest('GET', '/api/feedback/mine/summary', true)).toEqual({ kind: 'background', label: 'เช็คกระดิ่งเรื่องที่แจ้ง' });
    // ตัวเฝ้าระบบ / ช่องสัญญาณสด ส่ง header ไม่ได้ — ยังนับเป็นเบื้องหลัง
    expect(describeRequest('GET', '/api/health', false).kind).toBe('background');
    expect(describeRequest('GET', '/api/system/status', false).kind).toBe('background');
    // ข้อมูลเทียบช่วงก่อน — รายงานเดียวกันแต่เป็นคำขอเบื้องหลัง
    expect(describeRequest('GET', '/api/dental/report?start=x', true, 'compare')).toEqual({ kind: 'background', label: 'ข้อมูลเทียบช่วงก่อน · ทันตกรรม' });
  });

  it('path ที่ไม่รู้จัก → แสดง path เดิม (ไม่มี query string)', () => {
    expect(describeRequest('GET', '/api/../etc/passwd?x=1', false)).toEqual({ kind: 'page', label: '/api/../etc/passwd' });
    expect(describeRequest('POST', '/wp-login.php', false)).toEqual({ kind: 'action', label: '/wp-login.php' });
  });

  it('ชื่อหน้าสำหรับประวัติการใช้งาน', () => {
    expect(pageLabel('/api/opd/appointments')).toBe('ผู้ป่วยนอก · นัดหมายรายคลินิก');
    expect(pageLabel('/api/nope')).toBeNull();
  });
});

describe('logger.request', () => {
  const capture = () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((text: string) => { lines.push(String(text)); });
    return lines;
  };

  it('เบื้องหลังที่ปกติไม่พิมพ์ · ผิดพลาด / ช้า พิมพ์เสมอ', () => {
    const lines = capture();
    logger.request('GET', 200, '/api/system/status', 'guest', '10.0.0.1', 3, { kind: 'background', label: 'เช็คสถานะระบบ' });
    expect(lines.filter(l => l.includes('เช็คสถานะระบบ'))).toHaveLength(0);
    logger.request('GET', 500, '/api/system/status', 'guest', '10.0.0.1', 3, { kind: 'background', label: 'เช็คสถานะระบบ' });
    logger.request('GET', 200, '/api/feedback/mine/summary', 'u1', '10.0.0.1', 2500, { kind: 'background', label: 'เช็คกระดิ่งเรื่องที่แจ้ง' });
    expect(lines.filter(l => l.includes('เบื้องหลัง'))).toHaveLength(2);
  });

  it('เปิดหน้า / ทำรายการ พิมพ์ชื่อภาษาไทย · สถานะปกติไม่แสดงเลข', () => {
    const lines = capture();
    logger.request('GET', 200, '/api/dental/report', 'u1', '10.0.0.1', 40, { kind: 'page', label: 'ทันตกรรม' });
    logger.request('POST', 401, '/api/auth/login', 'guest', '10.0.0.1', 40, { kind: 'action', label: 'เข้าสู่ระบบ' });
    const page = lines.find(l => l.includes('ทันตกรรม'))!;
    expect(page).toContain('เปิดหน้า');
    expect(page).not.toContain('200');
    expect(lines.find(l => l.includes('เข้าสู่ระบบ'))).toContain('401');
  });
});
