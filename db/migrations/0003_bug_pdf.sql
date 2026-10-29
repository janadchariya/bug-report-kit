-- Sibling store keeps the existing image contract intact. PDF screening is a
-- best-effort byte scan in the action; uploads never use object storage.
CREATE TABLE "bug_report_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bug_report_id" uuid NOT NULL,
	"comment_id" uuid,
	"request_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" "bytea",
	"mime_type" text NOT NULL,
	"file_name" text NOT NULL,
	"byte_count" integer NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_by_user_id" uuid,
	"removed_at" timestamp with time zone,
	"removed_reason" text,
	CONSTRAINT "bug_report_files_uploader_request_key" UNIQUE("uploaded_by_user_id","request_id"),
	CONSTRAINT "bug_report_files_kind_parent" CHECK (("bug_report_files"."kind" = 'report_pdf' and "bug_report_files"."comment_id" is null) or ("bug_report_files"."kind" = 'comment_pdf' and "bug_report_files"."comment_id" is not null)),
	CONSTRAINT "bug_report_files_mime_known" CHECK ("bug_report_files"."mime_type" = 'application/pdf'),
	CONSTRAINT "bug_report_files_filename_bounds" CHECK (length(btrim("bug_report_files"."file_name")) between 1 and 200),
	CONSTRAINT "bug_report_files_bytes_bounded" CHECK ("bug_report_files"."byte_count" between 1 and 4194304 and ("bug_report_files"."content" is null or octet_length("bug_report_files"."content") = "bug_report_files"."byte_count")),
	CONSTRAINT "bug_report_files_removal_consistent" CHECK (("bug_report_files"."content" is not null and "bug_report_files"."removed_by_user_id" is null and "bug_report_files"."removed_at" is null and "bug_report_files"."removed_reason" is null) or ("bug_report_files"."content" is null and "bug_report_files"."removed_by_user_id" is not null and "bug_report_files"."removed_at" is not null and "bug_report_files"."removed_reason" is not null and length(btrim("bug_report_files"."removed_reason")) between 1 and 500))
);
--> statement-breakpoint
ALTER TABLE "bug_report_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bug_report_comments" ADD COLUMN "pending_pdf" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bug_report_files" ADD CONSTRAINT "bug_report_files_bug_report_id_bug_reports_id_fk" FOREIGN KEY ("bug_report_id") REFERENCES "public"."bug_reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_files" ADD CONSTRAINT "bug_report_files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_files" ADD CONSTRAINT "bug_report_files_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_report_files" ADD CONSTRAINT "bug_report_files_comment_report_fk" FOREIGN KEY ("comment_id","bug_report_id") REFERENCES "public"."bug_report_comments"("id","bug_report_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bug_report_files_report_key" ON "bug_report_files" USING btree ("bug_report_id") WHERE "bug_report_files"."kind" = 'report_pdf';--> statement-breakpoint
CREATE UNIQUE INDEX "bug_report_files_comment_key" ON "bug_report_files" USING btree ("comment_id") WHERE "bug_report_files"."comment_id" is not null;--> statement-breakpoint
CREATE INDEX "bug_report_files_report_idx" ON "bug_report_files" USING btree ("bug_report_id");--> statement-breakpoint
CREATE INDEX "bug_report_files_uploader_created_idx" ON "bug_report_files" USING btree ("uploaded_by_user_id","created_at");
--> statement-breakpoint
-- Removal is a one-way tombstone. Text fields remain editable by privacy erasure.
CREATE FUNCTION public.bug_file_update_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF ROW(NEW.id, NEW.bug_report_id, NEW.comment_id, NEW.request_id, NEW.kind,
         NEW.mime_type, NEW.byte_count, NEW.uploaded_by_user_id, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.bug_report_id, OLD.comment_id, OLD.request_id, OLD.kind,
         OLD.mime_type, OLD.byte_count, OLD.uploaded_by_user_id, OLD.created_at) THEN
    RAISE EXCEPTION 'bug file identity and metadata are immutable';
  END IF;
  IF OLD.content IS NULL THEN
    IF NEW.content IS NOT NULL OR NEW.removed_by_user_id IS DISTINCT FROM OLD.removed_by_user_id
       OR NEW.removed_at IS DISTINCT FROM OLD.removed_at THEN
      RAISE EXCEPTION 'bug file removal cannot be reversed or replaced';
    END IF;
  ELSIF NEW.content IS NOT NULL AND NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'bug file content cannot be replaced';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER bug_report_files_update_guard BEFORE UPDATE ON public.bug_report_files FOR EACH ROW EXECUTE FUNCTION public.bug_file_update_guard();
--> statement-breakpoint
CREATE TRIGGER bug_report_files_forbid_delete BEFORE DELETE ON public.bug_report_files FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();
--> statement-breakpoint
CREATE TRIGGER bug_report_files_forbid_truncate BEFORE TRUNCATE ON public.bug_report_files FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_truncate();
