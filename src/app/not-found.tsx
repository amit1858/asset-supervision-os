import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { PageContainer } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";

export default function NotFound() {
  return (
    <AppShell crumbs={[{ label: "Not found" }]}>
      <PageContainer>
        <EmptyState
          title="Not found"
          description="That asset or page does not exist in the synthetic dataset."
          action={
            <Link href="/" className="text-sm font-medium text-brand-text hover:underline">
              Back to Command Center →
            </Link>
          }
        />
      </PageContainer>
    </AppShell>
  );
}
