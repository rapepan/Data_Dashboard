import type { FastifyReply, FastifyRequest } from 'fastify';
import { strokeUnitService } from '../services/stroke-unit.service';

export const strokeUnitController = {
  status(_req: FastifyRequest, reply: FastifyReply) {
    reply.send(strokeUnitService.status());
  },
};
