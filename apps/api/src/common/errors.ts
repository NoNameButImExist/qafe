import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, type ApiErrorBody } from '@qafe/contracts';

/** HTTP error with a stable `code` that clients translate (see ErrorCode in @qafe/contracts). */
export class ApiException extends HttpException {
  constructor(status: HttpStatus, code: ErrorCode, message: string, details?: unknown) {
    const body: ApiErrorBody = { error: { code, message, details } };
    super(body, status);
  }
}

export const unauthorized = (message = 'Authentication required') =>
  new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.unauthorized, message);

export const forbidden = (message = 'Not allowed') =>
  new ApiException(HttpStatus.FORBIDDEN, ErrorCode.forbidden, message);

export const notFound = (message = 'Not found') =>
  new ApiException(HttpStatus.NOT_FOUND, ErrorCode.notFound, message);
