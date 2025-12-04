'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { OrthomosaicProject, fetchOrthomosaicProject } from '@/lib/supabase';
import OrthomosaicViewer from '@/components/OrthomosaicViewer';
import Link from 'next/link';

export default function OrthomosaicDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<OrthomosaicProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
      } else {
        loadProject();
      }
    }
  }, [user, authLoading, router, projectId]);

  const loadProject = async () => {
    try {
      const data = await fetchOrthomosaicProject(projectId);
      setProject(data);
    } catch (err) {
      console.error('Failed to load orthomosaic project:', err);
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    const { supabase } = await import('@/lib/supabase');
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold mb-4">Loading...</h1>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <h1 className="text-2xl font-bold">DJI Air 3 Mission Planner</h1>
              <Link href="/orthomosaics" className="text-blue-600 hover:text-blue-800">
                ← Back to Orthomosaics
              </Link>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
            {error || 'Project not found'}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold">DJI Air 3 Mission Planner</h1>
            <div className="flex gap-4 items-center">
              <Link href="/missions" className="text-gray-600 hover:text-gray-800">
                Missions
              </Link>
              <Link href="/orthomosaics" className="text-gray-600 hover:text-gray-800">
                Orthomosaics
              </Link>
              <Link href="/logs" className="text-gray-600 hover:text-gray-800">
                Flight Logs
              </Link>
              <Link href="/photos" className="text-gray-600 hover:text-gray-800">
                Photo Search
              </Link>
              <button
                onClick={handleSignOut}
                className="text-gray-600 hover:text-gray-800"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link href="/orthomosaics" className="text-blue-600 hover:text-blue-800 mb-4 inline-block">
            ← Back to Orthomosaics
          </Link>
        </div>

        <OrthomosaicViewer project={project} height="800px" />
      </main>
    </div>
  );
}

