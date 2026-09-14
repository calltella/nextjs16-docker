CREATE TABLE "card_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid DEFAULT auth.uid(),
	"name" text NOT NULL,
	"payment_method" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
