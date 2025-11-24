// src/app/page.tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 flex flex-col items-center justify-center p-24">
        <div className="text-center space-y-8">
          <h1 className="text-4xl font-bold">Marketing Dashboard</h1>
          <p className="text-gray-600">Manage your client campaigns efficiently</p>
          
          <div className="flex flex-col gap-4 items-center">
            <div className="flex gap-4 justify-center">
              <Link href="/plan-entry">
                <Button size="lg">Create Media Plan</Button>
              </Link>
              <Link href="/plans">
                <Button size="lg" variant="outline">View Plans</Button>
              </Link>
            </div>
            <div className="flex gap-4 justify-center mt-4">
              <Link href="/clients">
                <Button size="lg" variant="outline">View Clients</Button>
              </Link>
              <Link href="/clients/create">
                <Button size="lg" variant="outline">Create Client</Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}