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

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Comercial Rodrigo API corriendo en: http://0.0.0.0:${port}`);
  console.log(`🩺 Health check disponible en: http://0.0.0.0:${port}/health`);
}
await bootstrap();
