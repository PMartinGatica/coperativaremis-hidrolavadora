import type { AppConfig } from '../config.js';
import { DemoPaymentProvider } from './demoProvider.js';
import { MercadoPagoPaymentProvider } from './mercadoPagoProvider.js';
import type { PaymentProvider } from './provider.js';

export type { PaymentProvider } from './provider.js';
export { DemoPaymentProvider } from './demoProvider.js';
export { MercadoPagoPaymentProvider } from './mercadoPagoProvider.js';

export function createPaymentProvider(config: AppConfig): PaymentProvider {
  if (config.paymentProvider === 'mercadopago') {
    return new MercadoPagoPaymentProvider(config);
  }
  return new DemoPaymentProvider();
}
