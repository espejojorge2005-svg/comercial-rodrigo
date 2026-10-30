import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module.js';

function buildAllowedOrigins(): boolean | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void) {
  const rawOrigins = process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '';
  const explicitOrigins = rawOrigins
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  return (origin, callback) => {
    // Permitir peticiones sin header Origin (ej. health checks, apps nativas, tests)
    if (!origin) {
      callback(null, true);
      return;
    }

    const cleanOrigin = origin.replace(/\/$/, '');

    // Si se configuró lista explícita en entorno, validarla más localhost en dev
    if (explicitOrigins.length > 0) {
      if (
        explicitOrigins.includes(cleanOrigin) ||
        (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin))
      ) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origen CORS no autorizado: ${origin}`), false);
      return;
    }

    // Fallback seguro para despliegues Vercel + desarrollo local
    if (
      /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/i.test(cleanOrigin) ||
      /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/i.test(cleanOrigin)
    ) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origen CORS no autorizado: ${origin}`), false);
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cabeceras HTTP de endurecimiento de seguridad
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Habilitar CORS restringido a orígenes autorizados
  app.enableCors({
    origin: buildAllowedOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // Habilitar validación global estricta con class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Comercial Rodrigo API corriendo en: http://0.0.0.0:${port}`);
  console.log(`🩺 Health check disponible en: http://0.0.0.0:${port}/health`);
}
await bootstrap();
