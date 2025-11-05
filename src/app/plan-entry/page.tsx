import PlanEntryForm from '@/components/plan-entry/PlanEntryForm';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface PlanEntryPageProps {
  searchParams: { client?: string };
}

export default function PlanEntryPage({ searchParams }: PlanEntryPageProps) {
  return (
    <div className="container mx-auto p-8">
      <div className="mb-4">
        <Link href="/plans">
          <Button variant="outline">View Plans</Button>
        </Link>
      </div>
      <PlanEntryForm initialClientId={searchParams.client} />
    </div>
  );
}