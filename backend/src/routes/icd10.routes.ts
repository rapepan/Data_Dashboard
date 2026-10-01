import type { FastifyInstance } from 'fastify';
import { icd10Controller } from '../controllers/icd10.controller';

/** ต้อง login (สิทธิ์หน้า icd10 — ตรวจตอน register ใน routes/index.ts) */
export async function icd10Routes(fastify: FastifyInstance) {
  fastify.get('/icd10/summary', icd10Controller.summary);
}
