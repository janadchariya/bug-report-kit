CREATE TABLE "bug_report_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bug_report_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"body" text,
	"reporter_activity_seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bug_report_comments_author_request_key" UNIQUE("author_user_id","request_id"),
	CONSTRAINT "bug_report_comments_id_report_key" UNIQUE("id","bug_report_id"),
	CONSTRAINT "bug_report_comments_body_bounds" CHECK ("bug_report_comments"."body" is null or length("bug_report_comments"."body") <= 4000),
	CONSTRAINT "bug_report_comments_activity_nonnegative" CHECK ("bug_report_comments"."reporter_activity_seq" >= 0)
);
--> statement-breakpoint
ALTER TABLE "bug_report_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bug_report_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bug_report_id" uuid NOT NULL,
	"comment_id" uuid,
	"kind" text NOT NULL,
	"content" "bytea",
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_count" integer NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_by_user_id" uuid,
	"removed_at" timestamp with time zone,
	"removed_reason" text,
	CONSTRAINT "bug_report_images_kind_parent" CHECK (("bug_report_images"."kind" = 'screenshot' and "bug_report_images"."comment_id" is null) or ("bug_report_images"."kind" = 'comment' and "bug_report_images"."comment_id" is not null)),
	CONSTRAINT "bug_report_images_mime_known" CHECK ("bug_report_images"."mime_type" in ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "bug_report_images_dimensions" CHECK ("bug_report_images"."width" between 1 and 1920 and "bug_report_images"."height" between 1 and 1920),
	CONSTRAINT "bug_report_images_bytes_bounded" CHECK ("bug_report_images"."byte_count" between 1 and 2097152 and ("bug_report_images"."content" is null or octet_length("bug_report_images"."content") = "bug_report_images"."byte_count")),
	CONSTRAINT "bug_report_images_removal_consistent" CHECK (("bug_report_images"."content" is not null and "bug_report_images"."removed_by_user_id" is null and "bug_report_images"."removed_at" is null and "bug_report_images"."removed_reason" is null) or ("bug_report_images"."content" is null and "bug_report_images"."removed_by_user_id" is not null and "bug_report_images"."removed_at" is not null and "bug_report_images"."removed_reason" is not null and length(btrim("bug_report_images"."removed_reason")) between 1 and 500))
);
--> statement-breakpoint
ALTER TABLE "bug_report_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bug_report_status_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bug_report_id" uuid NOT NULL,
	"changed_by_user_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bug_report_status_changes_from_known" CHECK ("bug_report_status_changes"."from_status" is null or "bug_report_status_changes"."from_status" in ('new', 'in_progress', 'done', 'cancelled')),
	CONSTRAINT "bug_report_status_changes_to_known" CHECK ("bug_report_status_changes"."to_status" in ('new', 'in_progress', 'done', 'cancelled')),
	CONSTRAINT "bug_report_status_changes_transition" CHECK (("bug_report_status_changes"."from_status" is null and "bug_report_status_changes"."to_status" = 'new') or ("bug_report_status_changes"."from_status" is not null and (("bug_report_status_changes"."from_status" = 'new' and "bug_report_status_changes"."to_status" in ('in_progress', 'cancelled')) or ("bug_report_status_changes"."from_status" = 'in_progress' and "bug_report_status_changes"."to_status" in ('done', 'cancelled')) or ("bug_report_status_changes"."from_status" in ('done', 'cancelled') and "bug_report_status_changes"."to_status" = 'in_progress')))),
	CONSTRAINT "bug_report_status_changes_reason_bounds" CHECK ("bug_report_status_changes"."reason" is null or length(btrim("bug_report_status_changes"."reason")) between 1 and 500),
	CONSTRAINT "bug_report_status_changes_cancel_reason" CHECK ("bug_report_status_changes"."to_status" <> 'cancelled' or "bug_report_status_changes"."reason" is not null)
);
--> statement-breakpoint
ALTER TABLE "bug_report_status_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bug_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"description" text,
	"page_path" text NOT NULL,
	"page_query" text DEFAULT '' NOT NULL,
	"viewport_width" integer NOT NULL,
	"viewport_height" integer NOT NULL,
	"user_agent" text NOT NULL,
	"os_name" text,
	"os_version" text,
	"browser_name" text,
	"browser_version" text,
	"device_type" text,
	"app_build_sha" text,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" text,
	"assigned_to_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"reporter_activity_seq" integer DEFAULT 0 NOT NULL,
	"reporter_read_seq" integer DEFAULT 0 NOT NULL,
	"reporter_last_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bug_reports_reporter_request_key" UNIQUE("reporter_user_id","request_id"),
	CONSTRAINT "bug_reports_status_known" CHECK ("bug_reports"."status" in ('new', 'in_progress', 'done', 'cancelled')),
	CONSTRAINT "bug_reports_priority_known" CHECK ("bug_reports"."priority" is null or "bug_reports"."priority" in ('low', 'medium', 'high', 'critical')),
	CONSTRAINT "bug_reports_version_positive" CHECK ("bug_reports"."version" >= 1),
	CONSTRAINT "bug_reports_read_bounds" CHECK ("bug_reports"."reporter_read_seq" >= 0 and "bug_reports"."reporter_activity_seq" >= "bug_reports"."reporter_read_seq"),
	CONSTRAINT "bug_reports_summary_bounds" CHECK (length(btrim("bug_reports"."summary")) between 1 and 200),
	CONSTRAINT "bug_reports_description_bounds" CHECK ("bug_reports"."description" is null or length("bug_reports"."description") <= 4000),
	CONSTRAINT "bug_reports_context_bounds" CHECK (length("bug_reports"."page_path") between 1 and 2048 and length("bug_reports"."page_path") + length("bug_reports"."page_query") + case when "bug_reports"."page_query" = '' then 0 else 1 end <= 2048 and length("bug_reports"."user_agent") <= 2048),
	CONSTRAINT "bug_reports_viewport_bounds" CHECK ("bug_reports"."viewport_width" between 1 and 16384 and "bug_reports"."viewport_height" between 1 and 16384),
	CONSTRAINT "bug_reports_os_known" CHECK ("bug_reports"."os_name" is null or "bug_reports"."os_name" in ('Windows', 'macOS', 'iOS', 'iPadOS', 'Android', 'Linux', 'Chrome OS', 'Unknown')),
	CONSTRAINT "bug_reports_browser_known" CHECK ("bug_reports"."browser_name" is null or "bug_reports"."browser_name" in ('Chrome', 'Firefox', 'Safari', 'Edge', 'Opera', 'Samsung Internet', 'Unknown')),
	CONSTRAINT "bug_reports_device_known" CHECK ("bug_reports"."device_type" is null or "bug_reports"."device_type" in ('desktop', 'mobile', 'tablet', 'unknown')),
	CONSTRAINT "bug_reports_versions_bounded" CHECK (("bug_reports"."os_version" is null or ("bug_reports"."os_version" ~ '^[0-9]+([.][0-9]+)*$' and length("bug_reports"."os_version") <= 32)) and ("bug_reports"."browser_version" is null or ("bug_reports"."browser_version" ~ '^[0-9]+([.][0-9]+)*$' and length("bug_reports"."browser_version") <= 32))),
	CONSTRAINT "bug_reports_build_sha_valid" CHECK ("bug_reports"."app_build_sha" is null or "bug_reports"."app_build_sha" ~ '^[a-fA-F0-9]{7,64}$')
);
--> statement-breakpoint
ALTER TABLE "bug_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bug_report_comments" ADD CONSTRAINT "bug_report_comments_bug_report_id_bug_reports_id_fk" FOREIGN KEY ("bug_report_id") REFERENCES "public"."bug_reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_comments" ADD CONSTRAINT "bug_report_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_images" ADD CONSTRAINT "bug_report_images_bug_report_id_bug_reports_id_fk" FOREIGN KEY ("bug_report_id") REFERENCES "public"."bug_reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_images" ADD CONSTRAINT "bug_report_images_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_images" ADD CONSTRAINT "bug_report_images_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_images" ADD CONSTRAINT "bug_report_images_comment_report_fk" FOREIGN KEY ("comment_id","bug_report_id") REFERENCES "public"."bug_report_comments"("id","bug_report_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_status_changes" ADD CONSTRAINT "bug_report_status_changes_bug_report_id_bug_reports_id_fk" FOREIGN KEY ("bug_report_id") REFERENCES "public"."bug_reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_status_changes" ADD CONSTRAINT "bug_report_status_changes_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bug_report_comments_report_created_idx" ON "bug_report_comments" USING btree ("bug_report_id","created_at","id");--> statement-breakpoint
CREATE INDEX "bug_report_comments_author_created_idx" ON "bug_report_comments" USING btree ("author_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bug_report_images_screenshot_key" ON "bug_report_images" USING btree ("bug_report_id") WHERE "bug_report_images"."kind" = 'screenshot';--> statement-breakpoint
CREATE UNIQUE INDEX "bug_report_images_comment_key" ON "bug_report_images" USING btree ("comment_id") WHERE "bug_report_images"."comment_id" is not null;--> statement-breakpoint
CREATE INDEX "bug_report_images_report_idx" ON "bug_report_images" USING btree ("bug_report_id");--> statement-breakpoint
CREATE INDEX "bug_report_status_changes_report_created_idx" ON "bug_report_status_changes" USING btree ("bug_report_id","created_at","id");--> statement-breakpoint
CREATE INDEX "bug_reports_status_created_idx" ON "bug_reports" USING btree ("status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bug_reports_reporter_created_idx" ON "bug_reports" USING btree ("reporter_user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bug_reports_assignee_idx" ON "bug_reports" USING btree ("assigned_to_user_id") WHERE "bug_reports"."assigned_to_user_id" is not null;--> statement-breakpoint
CREATE INDEX "bug_reports_unread_idx" ON "bug_reports" USING btree ("reporter_user_id") WHERE "bug_reports"."reporter_read_seq" < "bug_reports"."reporter_activity_seq";
--> statement-breakpoint
-- Preserve image identity/metadata while allowing one-way removal and text privacy redaction.
CREATE FUNCTION public.bug_image_update_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF ROW(NEW.id, NEW.bug_report_id, NEW.comment_id, NEW.kind, NEW.mime_type,
         NEW.width, NEW.height, NEW.byte_count, NEW.uploaded_by_user_id, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.bug_report_id, OLD.comment_id, OLD.kind, OLD.mime_type,
         OLD.width, OLD.height, OLD.byte_count, OLD.uploaded_by_user_id, OLD.created_at) THEN
    RAISE EXCEPTION 'bug image identity and metadata are immutable';
  END IF;
  IF OLD.content IS NULL THEN
    IF NEW.content IS NOT NULL OR NEW.removed_by_user_id IS DISTINCT FROM OLD.removed_by_user_id
       OR NEW.removed_at IS DISTINCT FROM OLD.removed_at THEN
      RAISE EXCEPTION 'bug image removal cannot be reversed or replaced';
    END IF;
  ELSIF NEW.content IS NOT NULL AND NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'bug image content cannot be replaced';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER bug_report_images_update_guard BEFORE UPDATE ON public.bug_report_images FOR EACH ROW EXECUTE FUNCTION public.bug_image_update_guard();
--> statement-breakpoint
CREATE TRIGGER bug_reports_forbid_delete BEFORE DELETE ON public.bug_reports FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();
--> statement-breakpoint
CREATE TRIGGER bug_reports_forbid_truncate BEFORE TRUNCATE ON public.bug_reports FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_truncate();
--> statement-breakpoint
CREATE TRIGGER bug_report_comments_forbid_delete BEFORE DELETE ON public.bug_report_comments FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();
--> statement-breakpoint
CREATE TRIGGER bug_report_comments_forbid_truncate BEFORE TRUNCATE ON public.bug_report_comments FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_truncate();
--> statement-breakpoint
CREATE TRIGGER bug_report_status_changes_forbid_delete BEFORE DELETE ON public.bug_report_status_changes FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();
--> statement-breakpoint
CREATE TRIGGER bug_report_status_changes_forbid_truncate BEFORE TRUNCATE ON public.bug_report_status_changes FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_truncate();
--> statement-breakpoint
CREATE TRIGGER bug_report_images_forbid_delete BEFORE DELETE ON public.bug_report_images FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();
--> statement-breakpoint
CREATE TRIGGER bug_report_images_forbid_truncate BEFORE TRUNCATE ON public.bug_report_images FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_truncate();
