import { Skeleton } from "@/components/ui/skeleton";

/** The Bug reports page while the first page loads: the list column and an empty report pane. */
export function BugsLoading() {
  return (
    <div className="grid gap-2 px-3 py-3 md:w-[340px]">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}
