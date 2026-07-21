CREATE TABLE "builder_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"plan" jsonb NOT NULL,
	"linked_portfolio_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "builder_plans" ADD CONSTRAINT "builder_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_plans" ADD CONSTRAINT "builder_plans_linked_portfolio_id_portfolios_id_fk" FOREIGN KEY ("linked_portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "builder_plans_user_idx" ON "builder_plans" USING btree ("user_id");