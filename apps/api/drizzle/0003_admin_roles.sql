-- 0003: roles y usuarios del panel (ADR-062, docs/designs/roles-usuarios.md)
--   Escrita a mano como la 0002 (el journal de drizzle-kit está desincronizado, ver TODOS.md).
--   Tiene que correr igual en PGlite y en Postgres. El runner (db/migrate.ts) no envuelve cada
--   archivo en una transacción: la abre este mismo archivo.
--
--   - name / active / token_version / must_change_password: cuentas con nombre, baja inmediata
--     (cada pedido compara token_version con el del JWT) y clave inicial que hay que cambiar.
--   - must_change_password DEFAULT false: la cuenta técnica no puede cambiar su clave desde la
--     app (la manda ADMIN_PASSWORD); con true quedaría bloqueada para siempre. Se pone true
--     explícito al crear o resetear desde el panel.
--   - Todas las filas existentes pasan a 'tecnico': el SQL no puede leer ADMIN_EMAIL y hoy todas
--     las cuentas son de Insolva. El default nuevo es 'operador' (el menor privilegio).

BEGIN;

ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true NOT NULL;
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "token_version" integer DEFAULT 0 NOT NULL;
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;

UPDATE "admin_users" SET "role" = 'tecnico';

ALTER TABLE "admin_users" ALTER COLUMN "role" SET DEFAULT 'operador';
ALTER TABLE "admin_users" DROP CONSTRAINT IF EXISTS "admin_users_role_check";
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_role_check" CHECK ("role" IN ('tecnico', 'admin', 'operador'));

COMMIT;
