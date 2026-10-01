import { HttpStatus, type PipeTransform } from '@nestjs/common';
import { ErrorCode } from '@qafe/contracts';
import type { z } from 'zod';
import { ApiException } from './errors.js';

/** Validates and parses a body or query with a schema from @qafe/contracts. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.validationFailed,
        'Request validation failed',
        result.error.issues.map((i) => ({
          path: i.path.join('.'),
          code: i.code,
          message: i.message,
        })),
      );
    }
    return result.data;
  }
}
