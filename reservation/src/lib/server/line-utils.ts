import { createHmac } from 'crypto';

export function verifyLineSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
  return signature === expected;
}
