import type { NextFunction, Request, Response } from 'express';
import { AppError } from '@hidro/shared';
import type { AppConfig } from '../config.js';
import { verifyToken } from '../services/adminService.js';

export interface AdminPrincipal {
  id: string;
  email: string;
  role: string;
}

/** Autenticación administrativa: JWT Bearer (MVP simple pero real). */
export function requireAdmin(config: AppConfig) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header('authorization');
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', 'Se requiere autenticación.');
    }
    const user = verifyToken(config, header.slice(7));
    if (!user) {
      throw new AppError('UNAUTHORIZED', 'Token inválido o vencido. Volvé a iniciar sesión.');
    }
    req.admin = user;
    next();
  };
}
