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
  // rawBody: los webhooks (Didit, Mux) se verifican con la firma del cuerpo tal como llegó.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  // Detrás de Caddy (y, en un VPS compartido, también del proxy del dueño): la IP real llega en X-Forwarded-For.
  // Se confía solo en los saltos de redes privadas (Docker, localhost); los de internet no pueden falsificarla.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
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
