-- 0001: patentes y tres tarifas por categoría
--   remis  -> price_remis_ars   ($500  remis de la cooperativa registrado)
--   socio  -> price_socio_ars   ($2.000 auto particular del socio)
--   externo -> price_externo_ars ($8.000 particular no asociado — patente NO registrada)

CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"plate" text NOT NULL,
	"category" text NOT NULL,
	"owner_name" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "uq_vehicles_plate" ON "vehicles" USING btree ("plate");
CREATE INDEX "idx_vehicles_category" ON "vehicles" USING btree ("category");

ALTER TABLE "machines" ADD COLUMN "price_remis_ars" integer;
ALTER TABLE "machines" ADD COLUMN "price_socio_ars" integer;
ALTER TABLE "machines" ADD COLUMN "price_externo_ars" integer;

-- backfill: los precios previos pasan a las tres tarifas (luego se ajustan desde admin)
UPDATE "machines"
SET "price_remis_ars" = "price_ars",
    "price_socio_ars" = "price_ars",
    "price_externo_ars" = "price_ars"
WHERE "price_remis_ars" IS NULL;

ALTER TABLE "machines" ALTER COLUMN "price_remis_ars" SET NOT NULL;
ALTER TABLE "machines" ALTER COLUMN "price_socio_ars" SET NOT NULL;
ALTER TABLE "machines" ALTER COLUMN "price_externo_ars" SET NOT NULL;
ALTER TABLE "machines" DROP COLUMN "price_ars";

ALTER TABLE "sessions" ADD COLUMN "plate" text;
ALTER TABLE "sessions" ADD COLUMN "plate_category" text;
CREATE INDEX "idx_sessions_plate_created" ON "sessions" USING btree ("plate","created_at");
