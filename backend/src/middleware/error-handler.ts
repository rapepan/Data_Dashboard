import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const statusCode = error.statusCode ?? 500;
    // error ฝั่งระบบ (5xx) พิมพ์ stack ในเทอร์มินัลไว้ไล่ปัญหา — ผู้ใช้เห็นแค่ข้อความกลาง ๆ
    if (statusCode >= 500) logger.error(`${request.method} ${request.url.split('?')[0]} — ${error.message}`, error);
    reply.status(statusCode).send({
      statusCode,
      error: statusCode >= 500 ? 'Internal Server Error' : error.name,
      message: statusCode >= 500 ? 'เกิดข้อผิดพลาดภายในระบบ' : error.message,
    });
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send({ statusCode: 404, error: 'Not Found', message: `ไม่พบ route: ${request.method} ${request.url}` });
  });
}
