import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyLineSignature } from '../line-utils';

function makeSignature(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}

describe('verifyLineSignature', () => {
  const secret = 'test-secret';
  const body = '{"events":[]}';

  it('正しい署名でtrueを返す', () => {
    const sig = makeSignature(body, secret);
    expect(verifyLineSignature(body, sig, secret)).toBe(true);
  });

  it('間違った署名でfalseを返す', () => {
    expect(verifyLineSignature(body, 'wrong-sig', secret)).toBe(false);
  });

  it('空の署名でfalseを返す', () => {
    expect(verifyLineSignature(body, '', secret)).toBe(false);
  });

  it('ボディが変わると署名が無効になる', () => {
    const sig = makeSignature(body, secret);
    expect(verifyLineSignature('{"events":[1]}', sig, secret)).toBe(false);
  });

  it('シークレットが変わると署名が無効になる', () => {
    const sig = makeSignature(body, secret);
    expect(verifyLineSignature(body, sig, 'other-secret')).toBe(false);
  });
});
