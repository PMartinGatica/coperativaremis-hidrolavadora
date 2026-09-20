import { Router } from 'express';
import { AppError } from '@hidro/shared';
import type { AppContext } from '../../context.js';
import { processApproval } from '../../services/paymentService.js';
import { getPaymentBySession, insertAudit } from '../../repositories/repos.js';
import type { MercadoPagoPaymentProvider } from '../../payments/mercadoPagoProvider.js';
import { ah } from '../asyncHandler.js';

/**
 * POST /api/webhooks/mercadopago
 * 1. valida firma (HMAC-SHA256 con MERCADOPAGO_WEBHOOK_SECRET)
 * 2. re-consulta el pago al API de Mercado Pago (NUNCA confiar en el body)
 * 3. verifica importe, máquina y sesión -> processApproval idempotente
 * Respuesta SIEMPRE 200 ante webhook válido (Mercado Pago no re-reintenta).
 */
export function webhookRoutes(ctx: AppContext): Router {
  const r = Router();

  r.post('/mercadopago', ah(async (req, res) => {
    // Mercado Pago manda un webhook de "merchant_order" en paralelo a cada pago (confirmado
    // en pruebas reales, ADR-050/051): no tiene payment id y no hay nada que reconciliar acá.
    // Se ignora ANTES de validar firma -- devolverle 401 a esto en cada lavado real es la forma
    // de que MP termine desactivando el webhook por fallar seguido.
    const topic = typeof req.query.topic === 'string' ? req.query.topic : (req.body as Record<string, unknown> | undefined)?.topic;
    if (topic && topic !== 'payment') {
      return res.status(200).json({ ok: true, result: 'ignored_topic' });
    }

    if (ctx.provider.name !== 'mercadopago') {
      await insertAudit(ctx.db, {
        actor: 'system',
        action: 'WEBHOOK_INVALID',
        entity: 'webhook',
        entityId: null,
        metadata: { reason: 'webhook recibido con PAYMENT_PROVIDER=demo' },
      });
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Webhook no disponible en modo demo.' } });
    }

    const validation = await ctx.provider.validateWebhook({
      headers: req.headers,
      body: req.body,
      query: req.query as Record<string, string | string[] | undefined>,
    });
    if (!validation.valid || !validation.providerPaymentId) {
      await insertAudit(ctx.db, {
        actor: 'system',
        action: 'WEBHOOK_INVALID',
        entity: 'webhook',
        entityId: null,
        metadata: { reason: validation.reason ?? 'invalid' },
      });
      return res.status(401).json({ error: { code: 'PAYMENT_INVALID_WEBHOOK', message: 'Webhook inválido (firma/estructura).' } });
    }

    // Re-consulta REAL contra Mercado Pago
    const mp = ctx.provider as MercadoPagoPaymentProvider;
    let remote: Awaited<ReturnType<MercadoPagoPaymentProvider['getPaymentById']>>;
    try {
      remote = await mp.getPaymentById(validation.providerPaymentId);
    } catch (err) {
      ctx.logger.error('mp payment re-query failed', { paymentId: validation.providerPaymentId, err: String(err) });
      // 500 para que Mercado Pago reintente (puede ser falla transitoria del API de MP)
      return res.status(500).json({ error: { code: 'INTERNAL', message: 'No se pudo re-consultar el pago.' } });
    }

    // Casamos por external_reference (sessionId): un pago solo pertenece a su sesión.
    const payment = remote.externalReference
      ? await getPaymentBySession(ctx.db, remote.externalReference)
      : null;
    if (!payment) {
      await insertAudit(ctx.db, {
        actor: 'system',
        action: 'WEBHOOK_UNKNOWN_PAYMENT',
        entity: 'webhook',
        entityId: validation.providerPaymentId,
        metadata: { externalReference: remote.externalReference },
      });
      return res.status(200).json({ ok: true, result: 'ignored' });
    }

    const result = await processApproval(ctx, {
      externalPaymentId: payment.externalPaymentId,
      providerStatus: remote.status,
      providerRawStatus: remote.rawStatus,
      providerAmount: remote.amount,
      source: 'webhook',
    });
    res.status(200).json({ ok: true, result: result.result });
  }));

  return r;
}
