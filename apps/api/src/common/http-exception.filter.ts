import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ErrorCode, type ApiErrorBody } from '@qafe/contracts';
import type { FastifyReply } from 'fastify';

/** Every error leaves the API as { error: { code, message, details? } }. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const body: ApiErrorBody =
        typeof response === 'object' && response !== null && 'error' in response
          ? (response as ApiErrorBody)
          : {
              error: {
                code: status === 404 ? ErrorCode.notFound : `http_${status}`,
                message: exception.message,
              },
            };
      void reply.status(status).send(body);
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    const body: ApiErrorBody = {
      error: { code: ErrorCode.internal, message: 'Internal server error' },
    };
    void reply.status(500).send(body);
  }
}
