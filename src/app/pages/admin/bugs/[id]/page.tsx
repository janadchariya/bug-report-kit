import { redirect } from "next/navigation";

/**
 * The standalone bug detail page has been folded into the split-view at
 * /admin/bugs. Preserve direct links by redirecting to the new shape.
 */
export default async function AdminBugDetailRedirect(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  redirect(`/admin/bugs?selected=${encodeURIComponent(id)}`);
}
