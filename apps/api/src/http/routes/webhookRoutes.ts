import type { Request } from 'express';
import { Router } from 'express';
import { AppError } from '@hidro/shared';
import type { AppContext } from '../../context.js';
import { processApproval } from '../../services/paymentService.js';
import { getPaymentBySession, insertAudit } from '../../repositories/repos.js';
import type { MercadoPagoPaymentProvider } from '../../payments/mercadoPagoProvider.js';
import type { WebhookValidation } from '../../payments/provider.js';
import { ah } from '../asyncHandler.js';

/** Razón por la que `validateWebhook` rechaza cuando el servidor no tiene el secret cargado. */
const MISSING_SECRET_REASON = 'webhook secret no configurado';

type WebhookDisposition = {
  kind: 'unverifiable_ipn' | 'misconfigured' | 'invalid';
  auditAction: 'WEBHOOK_IGNORED_IPN' | 'WEBHOOK_INVALID';
};

/**
 * Qué hacer con una notificación que NO pasó la validación de firma. Se llama siempre después
 * de validar, nunca antes: así una notificación firmada y legítima jamás depende de reconocer
 * su forma.
 *
 * La vía IPN legada se reconoce por su forma: trae `topic` (query o body) y NO trae `data.id`
 * en el query. ⚠️ Express 4 usa `qs` con `allowDots:false`, así que `?data.id=X` llega como la
 * clave LITERAL `'data.id'` — `req.query.data?.id` daría `undefined` siempre y clasificaría como
 * IPN legada a la vía nueva, que es justo lo que no puede pasar.
 */
export function classifyInvalidWebhook(req: Request, validation: WebhookValidation): WebhookDisposition {
  if (validation.reason === MISSING_SECRET_REASON) {
    return { kind: 'misconfigured', auditAction: 'WEBHOOK_INVALID' };
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const hasTopic = typeof req.query.topic === 'string' || typeof body.topic === 'string';
  const hasQueryDataId = typeof req.query['data.id'] === 'string';
  if (hasTopic && !hasQueryDataId) {
    return { kind: 'unverifiable_ipn', auditAction: 'WEBHOOK_IGNORED_IPN' };
  }
  return { kind: 'invalid', auditAction: 'WEBHOOK_INVALID' };
}

/**
 * POST /api/webhooks/mercadopago
 * 1. valida firma (HMAC-SHA256 con MERCADOPAGO_WEBHOOK_SECRET)
 * 2. re-consulta el pago al API de Mercado Pago (NUNCA confiar en el body)
 * 3. verifica importe, máquina y sesión -> processApproval idempotente
 *
 * MERCADO PAGO AVISA DE CADA PAGO POR DOS VÍAS EN PARALELO (verificado contra MP real el
 * 2026-09-20, ADR-051; el porqué de cada respuesta, en ADR-052):
 *
 *   ?data.id=X&type=payment   body {"data":{"id":"X"},...}   vía Webhooks  -> FIRMADA, se procesa
 *   ?id=X&topic=payment       body {"resource":"X",...}      vía IPN legada -> firma NO validable
 *
 * La firma de la vía IPN no se puede verificar con nuestro secret: es así por diseño de MP, que
 * lo documenta ("despite receiving the x-Signature header, they do not allow validation through
 * the secret key") y que anunció que va a discontinuar IPN. Se le acusa recibo con 200 y no se
 * procesa: el pago entra por la vía firmada.
 *
 * Contestar 200 NO es un detalle cosmético en ninguna dirección: si MP no recibe 200/201
 * REINTENTA la notificación hasta 4 días. Por eso el 200 se le da solo a lo que es esperado y
 * no verificable; ante un problema de configuración nuestro se devuelve 5xx a propósito, para
 * que esa cola de reintentos siga viva y el pago se recupere sola cuando se arregle.
 */
export function webhookRoutes(ctx: AppContext): Router {
  const r = Router();

  r.post('/mercadopago', ah(async (req, res) => {
    // La guarda de provider va PRIMERO: en modo demo este endpoint no existe, y no tiene
    // sentido contestarle 200 a un POST anónimo antes de decidir eso (ADR-052).
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

    // Mercado Pago manda un webhook de "merchant_order" en paralelo a cada pago (confirmado
    // en pruebas reales, ADR-050/051): no tiene payment id y no hay nada que reconciliar acá.
    const topic = typeof req.query.topic === 'string' ? req.query.topic : (req.body as Record<string, unknown> | undefined)?.topic;
    if (topic && topic !== 'payment') {
      return res.status(200).json({ ok: true, result: 'ignored_topic' });
    }

    const validation = await ctx.provider.validateWebhook({
      headers: req.headers,
      body: req.body,
      query: req.query as Record<string, string | string[] | undefined>,
    });
    // Se valida ANTES de clasificar, y la condición compuesta se mantiene entera: clasificar
    // por la forma del request primero permitiría descartar en silencio una notificación
    // FIRMADA Y LEGÍTIMA si MP cambiara un formato. Lo válido nunca llega hasta acá.
    if (!validation.valid || !validation.providerPaymentId) {
      const disposition = classifyInvalidWebhook(req, validation);
      // El audit no puede decidir qué contesta el endpoint: si la base está caída, un throw acá
      // convertiría el acuse en un 500 y MP reintentaría durante días algo que igual ignoramos.
      try {
        await insertAudit(ctx.db, {
          actor: 'system',
          action: disposition.auditAction,
          entity: 'webhook',
          entityId: null,
          // Metadata de tamaño fijo: este camino lo alcanza tráfico anónimo, así que nunca se
          // guardan body ni query (serían escrituras de tamaño arbitrario en la base).
          metadata: { reason: validation.reason ?? 'invalid' },
        });
      } catch (err) {
        ctx.logger.error('no se pudo auditar un webhook rechazado', { reason: validation.reason, err: String(err) });
      }
      if (disposition.kind === 'unverifiable_ipn') {
        // Esperado y no verificable: se acusa recibo para que MP no reintente 4 días algo que
        // igual no vamos a procesar. El pago entra por la vía firmada.
        return res.status(200).json({ ok: true, result: 'ignored_unverifiable_ipn' });
      }
      if (disposition.kind === 'misconfigured') {
        // Problema NUESTRO (falta el secret). 503 a propósito: mantiene viva la cola de
        // reintentos de MP, así que al cargar el secret la notificación diferida se procesa
        // sola. Un 200 acá apagaría la única recuperación automática que queda.
        ctx.logger.error('webhook rechazado por configuración faltante: MP va a reintentar', { reason: validation.reason });
        return res.status(503).json({ error: { code: 'INTERNAL', message: 'Webhook no configurado en el servidor.' } });
      }
      // Firma inválida en la vía firmada: o el secret está mal cargado, o alguien golpea el
      // endpoint. En los dos casos queremos que grite.
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
