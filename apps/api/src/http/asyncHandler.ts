import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Envuelve handlers async: Express 4 no captura rechazos de promesas. */
export function ah(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
