import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@qafe/contracts';
import type { FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { ApiException } from '../errors.js';
import type { Storage } from './storage.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Accepted image types, recognised by their first bytes (the declared type is not trusted). */
const SIGNATURES: { type: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/png',
    ext: 'png',
    test: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    type: 'image/webp',
    ext: 'webp',
    test: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

const unsupported = () =>
  new ApiException(
    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    ErrorCode.unsupportedImage,
    'Use a JPEG, PNG or WebP image',
  );

/**
 * Reads one image from a multipart request and stores it under
 * `venues/<venueId>/<folder>/<uuid>.<ext>`. Returns the public URL.
 */
export async function storeImage(
  req: FastifyRequest,
  storage: Storage,
  venueId: string,
  folder: 'items' | 'logo',
): Promise<string> {
  let file;
  try {
    file = await req.file({ limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });
  } catch {
    throw unsupported();
  }
  if (!file) throw unsupported();

  const body = await file.toBuffer().catch((error: unknown) => {
    if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new ApiException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        ErrorCode.fileTooLarge,
        'The image is larger than 5 MB',
      );
    }
    throw error;
  });
  const kind = SIGNATURES.find((s) => s.test(body));
  if (!kind) throw unsupported();

  return storage.put(`venues/${venueId}/${folder}/${randomUUID()}.${kind.ext}`, body, kind.type);
}
