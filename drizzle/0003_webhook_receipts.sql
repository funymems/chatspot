CREATE TABLE "webhook_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"http_status" integer NOT NULL,
	"outcome" text NOT NULL,
	"account_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"event_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "webhook_receipts_provider_time_idx" ON "webhook_receipts" USING btree ("provider","received_at");