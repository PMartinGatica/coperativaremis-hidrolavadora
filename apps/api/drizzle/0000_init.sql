-- HIDRO SELF-SERVICE — migración inicial
-- Restricciones de idempotencia a nivel de base de datos:
--   uq_payments_external_id     -> un único pago por id externo
--   uq_payments_session         -> un único pago por sesión
--   uq_authorizations_payment   -> UNA SOLA autorización por pago (nunca 2 ciclos)
--   uq_authorizations_session   -> una sola autorización por sesión
--   uq_sessions_active_machine  -> NUNCA dos sesiones activas para la misma máquina

CREATE TABLE "machines" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'OFFLINE' NOT NULL,
	"price_ars" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"machine_id" text NOT NULL,
	"device_identifier" text NOT NULL,
	"firmware_version" text,
	"last_heartbeat_at" timestamp with time zone,
	"status" text DEFAULT 'OFFLINE' NOT NULL,
	"secret_enc" text NOT NULL,
	"last_relay_state" boolean DEFAULT false NOT NULL,
	"last_wifi_rssi" integer,
	"last_uptime" integer,
	"current_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_machine_id_unique" UNIQUE("machine_id"),
	CONSTRAINT "devices_device_identifier_unique" UNIQUE("device_identifier"),
	CONSTRAINT "devices_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"machine_id" text NOT NULL,
	"payment_id" text,
	"authorization_id" text,
	"status" text DEFAULT 'IDLE' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_seconds" integer NOT NULL,
	"interruption_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"external_payment_id" text NOT NULL,
	"provider" text NOT NULL,
	"machine_id" text NOT NULL,
	"session_id" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"raw_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE "authorizations" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"machine_id" text NOT NULL,
	"payment_id" text NOT NULL,
	"status" text DEFAULT 'AUTHORIZED' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authorizations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "authorizations_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "authorizations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE cascade ON UPDATE no action
);

CREATE TABLE "device_events" (
	"id" text PRIMARY KEY NOT NULL,
	"machine_id" text NOT NULL,
	"device_id" text NOT NULL,
	"session_id" text,
	"type" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "device_commands" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"machine_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);

CREATE TABLE "admin_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);

CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "uq_sessions_active_machine" ON "sessions" USING btree ("machine_id") WHERE "status" IN ('IDLE','PAYMENT_PENDING','PAYMENT_APPROVED','AUTHORIZED','WAITING_FOR_BUTTON','RUNNING');
CREATE INDEX "idx_sessions_machine_created" ON "sessions" USING btree ("machine_id","created_at");
CREATE INDEX "idx_sessions_status" ON "sessions" USING btree ("status");
CREATE UNIQUE INDEX "uq_payments_external_id" ON "payments" USING btree ("external_payment_id");
CREATE UNIQUE INDEX "uq_payments_session" ON "payments" USING btree ("session_id");
CREATE INDEX "idx_payments_machine_created" ON "payments" USING btree ("machine_id","created_at");
CREATE INDEX "idx_payments_status" ON "payments" USING btree ("status");
CREATE UNIQUE INDEX "uq_authorizations_payment" ON "authorizations" USING btree ("payment_id");
CREATE UNIQUE INDEX "uq_authorizations_session" ON "authorizations" USING btree ("session_id");
CREATE INDEX "idx_authorizations_machine_status" ON "authorizations" USING btree ("machine_id","status");
CREATE INDEX "idx_device_events_session" ON "device_events" USING btree ("session_id");
CREATE INDEX "idx_device_events_machine_created" ON "device_events" USING btree ("machine_id","created_at");
CREATE INDEX "idx_audit_entity" ON "audit_logs" USING btree ("entity","entity_id");
CREATE INDEX "idx_audit_created" ON "audit_logs" USING btree ("created_at");
CREATE INDEX "idx_commands_machine_status" ON "device_commands" USING btree ("machine_id","status");
