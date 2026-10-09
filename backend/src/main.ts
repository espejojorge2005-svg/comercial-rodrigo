import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Habilitar CORS para permitir llamadas desde el frontend en desarrollo y producción
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Habilitar validación global estricta con class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 Comercial Rodrigo API corriendo en: http://localhost:${port}`);
  console.log(`🩺 Health check disponible en: http://localhost:${port}/health`);
}
await bootstrap();
