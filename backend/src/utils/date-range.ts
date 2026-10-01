import type { FastifyReply } from 'fastify';

export interface DateRangeQuery {
  start?: string;
  end?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** อ่านช่วงวันที่จาก query (?start=YYYY-MM-DD&end=YYYY-MM-DD) — ไม่ส่งมา = ต้นเดือนถึงวันนี้; ผิดรูปแบบตอบ 400 และคืน null */
export function parseDateRange(query: DateRangeQuery, reply: FastifyReply): { start: string; end: string } | null {
  const end = ISO_DATE.test(query.end ?? '') ? query.end! : today();
  const start = ISO_DATE.test(query.start ?? '') ? query.start! : `${end.slice(0, 8)}01`;
  if (start > end) {
    reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'วันเริ่มต้นต้องไม่เกินวันสิ้นสุด' });
    return null;
  }
  return { start, end };
}
