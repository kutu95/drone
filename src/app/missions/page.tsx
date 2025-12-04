'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Mission, fetchMissions, deleteMission } from '@/lib/supabase';
import MissionList from '@/components/MissionList';
import Link from 'next/link';

export default function MissionsPage() {
  const { user, loading: authLoading } = useAuth();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
      } else {
        loadMissions();
      }
    }
  }, [user, authLoading, router]);

  const loadMissions = async () => {
    try {
      const data = await fetchMissions();
      setMissions(data);
    } catch (error) {
      console.error('Failed to load missions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this mission?')) return;
    
    try {
      await deleteMission(id);
      setMissions(missions.filter(m => m.id !== id));
    } catch (error) {
      console.error('Failed to delete mission:', error);
      alert('Failed to delete mission');
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
          <h1 className="text-2xl font-bold mb-4">Loading...</h1>
        </div>
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
              <div className="flex gap-2">
                <Link
                  href="/missions/new"
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  New Mission
                </Link>
                <Link
                  href="/missions/mapping/new"
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  New Mapping Mission
                </Link>
              </div>
              <Link
                href="/orthomosaics"
                className="text-gray-600 hover:text-gray-800"
              >
                Orthomosaics
              </Link>
              <Link
                href="/logs"
                className="text-gray-600 hover:text-gray-800"
              >
                Flight Logs
              </Link>
              <Link
                href="/photos"
                className="text-gray-600 hover:text-gray-800"
              >
                Photo Search
              </Link>
              <Link
                href="/batteries"
                className="text-gray-600 hover:text-gray-800"
              >
                Batteries
              </Link>
              <Link
                href="/fleet"
                className="text-gray-600 hover:text-gray-800"
              >
                Fleet
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
        <h2 className="text-3xl font-bold mb-6">My Missions</h2>
        <MissionList missions={missions} onDelete={handleDelete} />
      </main>
    </div>
  );
}



