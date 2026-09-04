import type { AdminPrincipal } from '../auth/adminAuth.js';
import type { DeviceRow } from '../db/schema.js';

declare module 'express-serve-static-core' {
  interface Request {
    admin?: AdminPrincipal;
    device?: DeviceRow;
    rawBody?: Buffer;
    requestId?: string;
  }
}
