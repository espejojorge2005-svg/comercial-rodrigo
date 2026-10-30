import { HttpException, HttpStatus } from '@nestjs/common';

interface AttemptBucket {
  count: number;
  resetAt: number;
}

/**
 * Limitador de intentos en memoria por ventana deslizante fija para mitigar fuerza bruta
 * sobre credenciales y PINs administrativos de 4-6 dígitos.
 */
export class AuthRateLimiter {
  private readonly buckets = new Map<string, AttemptBucket>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  assertAllowed(key: string, customMessage?: string): void {
    const now = Date.now();
    this.cleanupExpired(now);

    const bucket = this.buckets.get(key);
    if (bucket && now < bucket.resetAt && bucket.count >= this.maxAttempts) {
      const retrySeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      throw new HttpException(
        customMessage ||
          `Demasiados intentos fallidos. Por seguridad, espere ${retrySeconds} segundos antes de volver a intentar.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(key: string): void {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || now >= existing.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
    } else {
      existing.count += 1;
    }
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private cleanupExpired(now: number): void {
    if (this.buckets.size < 200) return;
    for (const [k, v] of this.buckets.entries()) {
      if (now >= v.resetAt) {
        this.buckets.delete(k);
      }
    }
  }
}

