-- Host dependencies only: apply before the three feature migrations on an EMPTY database.
-- Existing hosts should map these interfaces, not run duplicate CREATE TABLE statements.
CREATE FUNCTION public.forbid_delete() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'delete is forbidden on %', TG_TABLE_NAME USING ERRCODE = 'P0001'; END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.forbid_truncate() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF pg_catalog.current_setting('sales_crm.test_truncate', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'truncate is forbidden on %', TG_TABLE_NAME USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"last_touched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_session_token_hash_key" UNIQUE("session_token_hash")
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"nickname" text,
	"login_method" text NOT NULL,
	"roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"google_subject" text,
	"google_chat_user_name" text,
	"last_login_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_key" UNIQUE("email"),
	CONSTRAINT "users_google_subject_key" UNIQUE("google_subject"),
	CONSTRAINT "users_google_chat_user_name_key" UNIQUE("google_chat_user_name"),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_roles_known" CHECK ("users"."roles" <@ array['md', 'system_admin', 'finance', 'bd', 'am', 'intake_admin', 'external_referrer', 'seller_assist']::text[]),
	CONSTRAINT "users_status_known" CHECK ("users"."status" in ('active', 'inactive')),
	CONSTRAINT "users_login_method_known" CHECK ("users"."login_method" in ('workspace', 'personal_google'))
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "role_permission_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"grants" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "role_permission_versions_version_key" UNIQUE("version"),
	CONSTRAINT "role_permission_versions_version_positive" CHECK ("role_permission_versions"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "role_permission_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_actor_kind_known" CHECK ("events"."actor_kind" in ('user', 'system', 'google_chat', 'import')),
	CONSTRAINT "events_actor_user_required" CHECK ("events"."actor_kind" = 'system' or "events"."actor_user_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "field_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"reason" text,
	"changed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "field_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cron_heartbeats" (
	"name" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL,
	"last_duration_ms" integer,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "cron_heartbeats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outbox_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_jobs_dedupe_key" UNIQUE("dedupe_key"),
	CONSTRAINT "outbox_jobs_status_known" CHECK ("outbox_jobs"."status" in ('pending', 'processing', 'succeeded', 'retryable_failed', 'dead', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "outbox_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chat_action_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"issued_for_user_id" uuid NOT NULL,
	"chat_message_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_action_tokens_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "chat_action_tokens_purpose_known" CHECK ("chat_action_tokens"."purpose" in ('lead.claim', 'lead.pass', 'lead.set_call_time', 'contact.log', 'followup.quick', 'md.assign', 'md.take', 'renewal.set_status', 'renewal.log')),
	CONSTRAINT "chat_action_tokens_subject_type_known" CHECK ("chat_action_tokens"."subject_type" in ('lead', 'claim_offer', 'follow_up', 'renewal_task'))
);
--> statement-breakpoint
ALTER TABLE "chat_action_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"kind" text NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"space_name" text NOT NULL,
	"transport" text DEFAULT 'chat_api' NOT NULL,
	"webhook_id" uuid,
	"webhook_revision" integer,
	"webhook_idempotency" text,
	"webhook_first_attempt_revision" integer,
	"subject_type" text NOT NULL,
	"subject_id" uuid,
	"notification" text NOT NULL,
	"payload" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"provider_applied_revision" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"external_message_name" text,
	"delivered_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"last_error_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_dedupe_key_key" UNIQUE("dedupe_key"),
	CONSTRAINT "chat_messages_kind_known" CHECK ("chat_messages"."kind" in ('new_lead', 'claimed_notice', 'owner_lead', 'claim_reminder', 'contact_reminder', 'md_no_claim', 'md_missed_deadline', 'md_grade_a', 'duplicate_attached', 'assigned_direct', 'digest_0845', 'digest_1330', 'digest_1630', 'md_digest_1730', 'renewal_talk_due', 'renewal_quote_due', 'renewal_risk', 'dispute_opened', 'space_bind', 'bug_reported', 'bug_replied', 'bug_status_changed')),
	CONSTRAINT "chat_messages_subject_type_known" CHECK ("chat_messages"."subject_type" in ('lead', 'claim_offer', 'follow_up', 'renewal_task', 'deadline_item', 'dispute', 'chat_space', 'digest', 'bug_report')),
	CONSTRAINT "chat_messages_notification_known" CHECK ("chat_messages"."notification" in ('default', 'force', 'silent')),
	CONSTRAINT "chat_messages_status_known" CHECK ("chat_messages"."status" in ('pending', 'reconciliation_required', 'delivered', 'superseded', 'dead')),
	CONSTRAINT "chat_messages_transport_known" CHECK ("chat_messages"."transport" in ('chat_api', 'webhook')),
	CONSTRAINT "chat_messages_webhook_idempotency_known" CHECK ("chat_messages"."webhook_idempotency" is null or "chat_messages"."webhook_idempotency" in ('message_id', 'none')),
	CONSTRAINT "chat_messages_webhook_reference" CHECK ("chat_messages"."transport" <> 'webhook' or ("chat_messages"."webhook_id" is not null and "chat_messages"."webhook_revision" is not null and "chat_messages"."webhook_revision" > 0)),
	CONSTRAINT "chat_messages_webhook_first_attempt_revision_positive" CHECK ("chat_messages"."webhook_first_attempt_revision" is null or "chat_messages"."webhook_first_attempt_revision" > 0),
	CONSTRAINT "chat_messages_delivered_has_name" CHECK ("chat_messages"."status" <> 'delivered' or "chat_messages"."external_message_name" is not null)
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chat_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"google_space_name" text NOT NULL,
	"display_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"event_fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_spaces_google_space_name_key" UNIQUE("google_space_name"),
	CONSTRAINT "chat_spaces_event_fingerprint_key" UNIQUE("event_fingerprint"),
	CONSTRAINT "chat_spaces_status_known" CHECK ("chat_spaces"."status" in ('pending', 'active', 'disabled')),
	CONSTRAINT "chat_spaces_active_has_user" CHECK ("chat_spaces"."status" <> 'active' or "chat_spaces"."user_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "chat_spaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chat_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"encrypted_url" text,
	"google_space_name" text,
	"credential_revision" integer DEFAULT 1 NOT NULL,
	"idempotency_mode" text DEFAULT 'unknown' NOT NULL,
	"verified_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error_class" text,
	"disabled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_webhooks_user_id_key" UNIQUE("user_id"),
	CONSTRAINT "chat_webhooks_status_known" CHECK ("chat_webhooks"."status" in ('active', 'broken', 'disabled')),
	CONSTRAINT "chat_webhooks_idempotency_mode_known" CHECK ("chat_webhooks"."idempotency_mode" in ('unknown', 'message_id', 'none')),
	CONSTRAINT "chat_webhooks_credential_revision_positive" CHECK ("chat_webhooks"."credential_revision" > 0),
	CONSTRAINT "chat_webhooks_active_verified" CHECK ("chat_webhooks"."status" <> 'active' or ("chat_webhooks"."encrypted_url" is not null and "chat_webhooks"."verified_at" is not null and "chat_webhooks"."google_space_name" is not null)),
	CONSTRAINT "chat_webhooks_disabled_cleared" CHECK ("chat_webhooks"."status" <> 'disabled' or "chat_webhooks"."encrypted_url" is null)
);
--> statement-breakpoint
ALTER TABLE "chat_webhooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text
);
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text,
	"email" text,
	"phone_e164" text,
	"line_id" text,
	"is_primary" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text,
	"company_name_normalized" text,
	"primary_contact_id" uuid,
	"owner_user_id" uuid,
	"submitted_by_user_id" uuid,
	"services" text[] DEFAULT '{}'::text[] NOT NULL,
	"entry_point" text,
	"source_kind" text,
	"routing_mode" text,
	"stage" text DEFAULT 'new' NOT NULL,
	"grade" text,
	"is_legacy" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone,
	"first_customer_contact_at" timestamp with time zone,
	"first_real_contact_at" timestamp with time zone,
	"stage_changed_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"archive_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"google_event_id" text NOT NULL,
	"summary" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"provider_applied_revision" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error_class" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_subject_key" UNIQUE("subject_type","subject_id"),
	CONSTRAINT "calendar_events_subject_type_known" CHECK ("calendar_events"."subject_type" in ('follow_up', 'renewal_task')),
	CONSTRAINT "calendar_events_status_known" CHECK ("calendar_events"."status" in ('pending', 'synced', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calendar_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"encrypted_token" text,
	"revoked_at" timestamp with time zone,
	"last_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_feeds_user_id_key" UNIQUE("user_id"),
	CONSTRAINT "calendar_feeds_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "calendar_feeds_token_hash_sha256" CHECK ("calendar_feeds"."token_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "calendar_feeds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission_versions" ADD CONSTRAINT "role_permission_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_changes" ADD CONSTRAINT "field_changes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_action_tokens" ADD CONSTRAINT "chat_action_tokens_issued_for_user_id_users_id_fk" FOREIGN KEY ("issued_for_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_action_tokens" ADD CONSTRAINT "chat_action_tokens_chat_message_id_chat_messages_id_fk" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_action_tokens" ADD CONSTRAINT "chat_action_tokens_consumed_by_user_id_users_id_fk" FOREIGN KEY ("consumed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_webhook_id_chat_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."chat_webhooks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_spaces" ADD CONSTRAINT "chat_spaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_webhooks" ADD CONSTRAINT "chat_webhooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_primary_contact_id_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_feeds" ADD CONSTRAINT "calendar_feeds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "events_subject_idx" ON "events" USING btree ("subject_type","subject_id","occurred_at");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE INDEX "field_changes_entity_idx" ON "field_changes" USING btree ("entity_type","entity_id","changed_at");--> statement-breakpoint
CREATE INDEX "outbox_jobs_claim_idx" ON "outbox_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "chat_action_tokens_open_by_message_idx" ON "chat_action_tokens" USING btree ("chat_message_id") WHERE "chat_action_tokens"."consumed_at" is null and "chat_action_tokens"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "chat_messages_subject_idx" ON "chat_messages" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "chat_messages_recipient_created_idx" ON "chat_messages" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_spaces_active_user_key" ON "chat_spaces" USING btree ("user_id") WHERE "chat_spaces"."status" = 'active';