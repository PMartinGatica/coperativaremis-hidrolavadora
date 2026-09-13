-- 0002: PIN de 4 dígitos por patente (remis/socio)
--   Hash (hashSecret), nunca en claro. NULL = sin PIN, grandfather clause: las filas
--   existentes siguen sin exigir PIN hasta que un admin les asigne uno.

ALTER TABLE "vehicles" ADD COLUMN "pin" text;
