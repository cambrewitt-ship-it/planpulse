import HealthCheckAgentDemoStory from '@/components/features/HealthCheckAgentDemoStory';

export const metadata = {
  robots: { index: false, follow: false },
};

// Bare capture surface for scripts/record-agent-video.mjs — no site chrome
// (see the /marketing/video/ exclusions in TopBar.tsx and FloatingAIChat.tsx).
// Not linked from anywhere; visit directly with ?format=vertical|square.
export default async function HealthCheckVideoPage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string }>;
}) {
  const { format } = await searchParams;
  const resolved = format === 'square' ? 'square' : 'vertical';

  return (
    <div style={{ margin: 0, background: '#FBF9F6' }}>
      <HealthCheckAgentDemoStory format={resolved} />
    </div>
  );
}
