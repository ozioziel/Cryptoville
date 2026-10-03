import './env';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ErroresFilter } from './common/errores.filter';
import { leerConfiguracion } from './config/configuracion';

export async function crearApp() {
  const config = leerConfiguracion();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.set('trust proxy', 1); // detrás de Caddy: la IP real llega en X-Forwarded-For
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.useBodyParser('json', { limit: '64kb' });
  app.enableCors({
    origin: config.origenesCors.length ? config.origenesCors : false,
    credentials: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: true }),
  );
  app.useGlobalFilters(new ErroresFilter());
  app.enableShutdownHooks();
  return { app, config };
}

async function iniciar() {
  const { app, config } = await crearApp();
  await app.listen(config.puerto, '0.0.0.0');
  app.get(Logger).log(`API de Cryptoville escuchando en el puerto ${config.puerto}`);
}

if (require.main === module) {
  void iniciar();
}
