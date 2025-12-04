'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import MappingMissionCreator from '@/components/MappingMissionCreator';
import { saveMission } from '@/lib/supabase';
import { Mission } from '@/lib/types';
import Link from 'next/link';

export default function NewMappingMissionPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMissionCreate = async (mission: Mission) => {
    try {
      setSaving(true);
      setError(null);
      
      await saveMission(mission);
      
      // Redirect to missions page
      router.push('/missions');
    } catch (err) {
      console.error('Error creating mapping mission:', err);
      setError(err instanceof Error ? err.message : 'Failed to create mission');
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push('/missions');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/missions" className="text-blue-600 hover:text-blue-800 mb-4 inline-block">
          ← Back to Missions
        </Link>
        <h1 className="text-3xl font-bold">New Mapping Mission</h1>
        <p className="text-gray-600 mt-2">
          Create a mapping mission for orthomosaic generation. Draw an area on the map and configure flight parameters.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {saving && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded mb-4">
          Saving mission...
        </div>
      )}

      <MappingMissionCreator
        onMissionCreate={handleMissionCreate}
        onCancel={handleCancel}
      />
    </div>
  );
}

