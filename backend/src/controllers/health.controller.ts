import type { FastifyReply, FastifyRequest } from 'fastify';

export const healthController = {
  check(_req: FastifyRequest, reply: FastifyReply) {
    reply.send({ status: 'ok', service: 'bsth-ops-backend', time: new Date().toISOString() });
  },
};
