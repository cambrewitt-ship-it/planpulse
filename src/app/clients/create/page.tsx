'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, updateClientLogoUrl } from '@/lib/db/plans';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Check,
  Building2,
  BarChart2,
  Plug,
  Upload,
  X,
} from 'lucide-react';
import { MediaPlanGrid, MediaPlanChannel, createEmptyChannel } from '@/components/media-plan-builder/media-plan-grid';
import AdPlatformConnector from '@/components/AdPlatformConnector';
import Image from 'next/image';

type Step = 1 | 2 | 3;

const STEPS = [
  { num: 1 as Step, label: 'Client Details', icon: Building2 },
  { num: 2 as Step, label: 'Media Plan', icon: BarChart2 },
  { num: 3 as Step, label: 'Connect Platforms', icon: Plug },
];

export default function CreateClientPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [clientId, setClientId] = useState<string | null>(null);

  // Step 1
  const [clientName, setClientName] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2
  const [channels, setChannels] = useState<MediaPlanChannel[]>(() => [createEmptyChannel()]);
  const [commission, setCommission] = useState(0);
  const [savingPlan, setSavingPlan] = useState(false);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreateClient = async () => {
    if (!clientName.trim()) return;
    setCreating(true);
    try {
      const client = await createClient(clientName.trim());
      const newClientId = client.id;

      if (logoFile) {
        try {
          const fd = new FormData();
          fd.append('file', logoFile);
          const res = await fetch(`/api/clients/${newClientId}/upload-logo`, {
            method: 'POST',
            body: fd,
          });
          if (res.ok) {
            const { url } = await res.json();
            await updateClientLogoUrl(newClientId, url);
          } else {
            const { error } = await res.json();
            console.error('Logo upload failed (non-fatal):', error);
          }
        } catch (logoError) {
          console.error('Logo upload failed (non-fatal):', logoError);
        }
      }

      setClientId(newClientId);
      setStep(2);
    } catch (error) {
      console.error('Error creating client:', error);
      let errorMessage = 'Error creating client. Please try again.';
      if (error instanceof Error) {
        try {
          const errorData = JSON.parse(error.message);
          errorMessage = errorData.message || errorData.details || errorMessage;
        } catch {
          errorMessage = error.message || errorMessage;
        }
      }
      alert(errorMessage);
    } finally {
      setCreating(false);
    }
  };

  const handleSaveMediaPlan = async () => {
    if (!clientId) return;
    setSavingPlan(true);
    try {
      await fetch(`/api/clients/${clientId}/media-plan-builder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels, commission }),
      });
    } catch (error) {
      console.error('Error saving media plan:', error);
    } finally {
      setSavingPlan(false);
    }
    setStep(3);
  };

  const handleFinish = () => {
    router.push(clientId ? `/clients/${clientId}/dashboard` : '/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Back link */}
        <div className="mb-8">
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Clients
            </Button>
          </Link>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center mb-10">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isCompleted = step > s.num;
            const isCurrent = step === s.num;
            return (
              <div key={s.num} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                      isCompleted
                        ? 'bg-green-500 border-green-500 text-white'
                        : isCurrent
                        ? 'bg-white border-blue-500 text-blue-500'
                        : 'bg-white border-gray-200 text-gray-400'
                    }`}
                  >
                    {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <span
                    className={`mt-1 text-xs font-medium ${
                      isCurrent ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-400'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`w-24 h-0.5 mx-2 mb-4 ${step > s.num ? 'bg-green-400' : 'bg-gray-200'}`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Step 1: Client Details */}
        {step === 1 && (
          <Card className="max-w-lg mx-auto">
            <CardHeader>
              <CardTitle>Client Details</CardTitle>
              <CardDescription>Name your client and add their logo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-2">
                <Label htmlFor="client-name">Client Name *</Label>
                <Input
                  id="client-name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Enter client name"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateClient()}
                />
              </div>

              <div className="grid gap-2">
                <Label>Logo (optional)</Label>
                {logoPreview ? (
                  <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 group">
                    <Image
                      src={logoPreview}
                      alt="Logo preview"
                      fill
                      style={{ objectFit: 'contain' }}
                      className="p-2"
                    />
                    <button
                      onClick={handleRemoveLogo}
                      className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3 text-gray-600" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-400 hover:text-blue-400 transition-colors"
                  >
                    <Upload className="h-5 w-5" />
                    <span className="text-xs">Upload</span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoSelect}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleCreateClient}
                  disabled={creating || !clientName.trim()}
                  className="flex-1"
                >
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Next: Media Plan
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
                <Link href="/dashboard">
                  <Button variant="outline">Cancel</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Media Plan Builder */}
        {step === 2 && clientId && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Media Plan Builder</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Configure media channels and budget allocation
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(3)}>
                  Skip for now
                </Button>
                <Button onClick={handleSaveMediaPlan} disabled={savingPlan}>
                  {savingPlan ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      Save & Continue
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
            <div
              className="rounded-lg p-6"
              style={{ background: '#FDFCF8', border: '0.5px solid #E8E4DC', borderRadius: 6 }}
            >
              <MediaPlanGrid
                channels={channels}
                onChannelsChange={setChannels}
                commission={commission}
                onCommissionChange={setCommission}
              />
            </div>
          </div>
        )}

        {/* Step 3: Connect Platforms */}
        {step === 3 && clientId && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Connect Ad Platforms</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Link advertising accounts to pull in performance data
                </p>
              </div>
              <Button onClick={handleFinish}>
                Finish Setup
                <Check className="h-4 w-4 ml-2" />
              </Button>
            </div>
            <AdPlatformConnector clientId={clientId} />
          </div>
        )}
      </div>
    </div>
  );
}
