import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppContext } from './context.js';
import { ah } from './http/asyncHandler.js';
import { adminRoutes } from './http/routes/adminRoutes.js';
import { demoRoutes } from './http/routes/demoRoutes.js';
import { deviceRoutes } from './http/routes/deviceRoutes.js';
import { healthRoutes } from './http/routes/healthRoutes.js';
import { publicRoutes } from './http/routes/publicRoutes.js';
import { webhookRoutes } from './http/routes/webhookRoutes.js';
import {
  captureRawBody,
  createGlobalRateLimit,
  errorHandler,
  notFoundHandler,
  requestId,
  requestLogger,
} from './http/middleware.js';

export function buildApp(ctx: AppContext): Express {
  const app = express();
  app.disable('x-powered-by');
  // Detrás de reverse proxy (producción) la IP real viene en X-Forwarded-For:
  // sin esto, express-rate-limit ve siempre la IP del proxy.
  if (ctx.config.trustProxy > 0) {
    app.set('trust proxy', ctx.config.trustProxy);
  }
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        // Orígenes permitidos: configurados + localhost en desarrollo
        if (!origin) return cb(null, true);
        const allowed = ctx.config.corsOrigins.some((o) => origin.startsWith(o)) ||
          (ctx.config.nodeEnv !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
        if (allowed) return cb(null, true);
        return cb(new Error('CORS: origen no permitido'));
      },
    }),
  );
  app.use(requestId);
  app.use(requestLogger(ctx.logger));
  app.use(createGlobalRateLimit());
  app.use(express.json({ limit: '64kb', verify: captureRawBody }));

  app.use('/health', healthRoutes(ctx));
  app.use('/api/public', publicRoutes(ctx));
  app.use('/api/device', deviceRoutes(ctx));
  app.use('/api/admin', adminRoutes(ctx));
  app.use('/api/webhooks', webhookRoutes(ctx));
  app.use('/api/demo', demoRoutes(ctx));

  // Raíz: guía de endpoints (la API no tiene interfaz visual propia).
  app.get('/', (_req, res) => {
    res.json({
      name: 'HIDRO SELF-SERVICE API',
      mode: ctx.config.paymentProvider === 'demo' ? 'DEMO MODE' : 'MERCADO PAGO',
      message: 'Esto es la API JSON. La interfaz web está en otra URL.',
      web: ctx.config.publicAppUrl,
      endpoints: {
        health: '/health',
        machine: '/api/public/machines/HIDRO-01',
        clientUI: `${ctx.config.publicAppUrl}/machine/HIDRO-01`,
        adminUI: `${ctx.config.publicAppUrl}/admin`,
        deviceSimulator: `${ctx.config.publicAppUrl}/demo/device`,
      },
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler(ctx.logger));
  return app;
}

export { ah };
