'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Drone, fetchFleetDrones, updateDroneName, deleteDrone } from '@/lib/supabase';
import Link from 'next/link';

// Helper functions shared between components
function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return '0m';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
  }

  const hours = Math.floor(minutes / 60);
  const minutesLeft = minutes % 60;
  return `${hours}h ${minutesLeft}m`;
}

function formatDate(dateString?: string) {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString();
}

function formatDistance(meters: number) {
  if (!meters || meters <= 0) return '0 m';
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

export default function FleetPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [drones, setDrones] = useState<Drone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
      } else {
        loadFleetDrones();
      }
    }
  }, [user, authLoading, router]);

  const loadFleetDrones = async () => {
    try {
      setLoading(true);
      const fleetDrones = await fetchFleetDrones();
      setDrones(fleetDrones);
    } catch (err) {
      console.error('Failed to load fleet drones:', err);
      setError('Failed to load fleet drones');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    const { supabase } = await import('@/lib/supabase');
    await supabase.auth.signOut();
    router.push('/login');
  };

  const fleetStats = useMemo(() => {
    if (drones.length === 0) return null;
    const totalFlights = drones.reduce((sum, drone) => sum + (drone.flightCount || 0), 0);
    const totalFlightTime = drones.reduce((sum, drone) => sum + (drone.totalFlightTimeSeconds || 0), 0);
    const totalFlightDistance = drones.reduce((sum, drone) => sum + (drone.totalFlightDistanceM || 0), 0);
    return {
      totalDrones: drones.length,
      totalFlights,
      totalFlightTime,
      totalFlightDistance,
    };
  }, [drones]);

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
            <Link href="/missions" className="text-2xl font-bold hover:text-blue-600">
              DJI Air 3 Mission Planner
            </Link>
            <div className="flex gap-4 items-center">
              <Link
                href="/missions"
                className="text-gray-600 hover:text-gray-800"
              >
                Missions
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
                className="text-blue-600 font-semibold"
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold">Fleet Management</h2>
            <p className="text-gray-600 mt-1">View and manage all drones in your fleet.</p>
          </div>
          {fleetStats && (
            <div className="flex gap-6 text-sm text-gray-600">
              <div>
                <span className="block uppercase tracking-wide text-xs text-gray-500">Total Drones</span>
                <span className="text-lg font-semibold">{fleetStats.totalDrones}</span>
              </div>
              <div>
                <span className="block uppercase tracking-wide text-xs text-gray-500">Total Flights</span>
                <span className="text-lg font-semibold">{fleetStats.totalFlights}</span>
              </div>
              <div>
                <span className="block uppercase tracking-wide text-xs text-gray-500">Total Flight Time</span>
                <span className="text-lg font-semibold">{formatDuration(fleetStats.totalFlightTime)}</span>
              </div>
              <div>
                <span className="block uppercase tracking-wide text-xs text-gray-500">Total Distance</span>
                <span className="text-lg font-semibold">{formatDistance(fleetStats.totalFlightDistance)}</span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
            {error}
          </div>
        )}

        {drones.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No drones in fleet yet. Upload flight logs with drone information to automatically add them to your fleet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {drones.map((drone) => (
              <DroneCard
                key={drone.id}
                drone={drone}
                onNameUpdate={async (newName: string) => {
                  try {
                    await updateDroneName(drone.serialNumber, newName);
                    await loadFleetDrones();
                  } catch (err) {
                    console.error('Failed to update drone name:', err);
                    alert('Failed to update drone name');
                  }
                }}
                onDelete={async () => {
                  if (!confirm(`Are you sure you want to remove ${drone.name || drone.serialNumber} from your fleet?`)) {
                    return;
                  }
                  try {
                    await deleteDrone(drone.id);
                    await loadFleetDrones();
                  } catch (err) {
                    console.error('Failed to delete drone:', err);
                    alert('Failed to delete drone');
                  }
                }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function DroneCard({ 
  drone, 
  onNameUpdate, 
  onDelete 
}: { 
  drone: Drone; 
  onNameUpdate: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(drone.name || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setNameInput(drone.name || '');
  }, [drone.name]);

  const handleSaveName = async () => {
    setIsSaving(true);
    try {
      await onNameUpdate(nameInput);
      setIsEditingName(false);
    } catch (err) {
      console.error('Failed to save name:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setNameInput(drone.name || '');
    setIsEditingName(false);
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-100 p-6 flex flex-col gap-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Drone Name</p>
        {isEditingName ? (
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveName();
                } else if (e.key === 'Escape') {
                  handleCancelEdit();
                }
              }}
              placeholder="e.g., Drone #1"
              className="flex-1 border rounded px-2 py-1 text-lg font-semibold"
              autoFocus
              disabled={isSaving}
            />
            <button
              onClick={handleSaveName}
              disabled={isSaving}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancelEdit}
              disabled={isSaving}
              className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 text-sm"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group">
            <p
              className="text-lg font-semibold cursor-pointer hover:text-blue-600"
              onClick={() => setIsEditingName(true)}
              title="Click to edit name"
            >
              {drone.name || (
                <span className="text-gray-400 italic">Click to add name...</span>
              )}
            </p>
            <button
              onClick={() => setIsEditingName(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 text-sm"
              title="Edit name"
            >
              ✏️
            </button>
          </div>
        )}
        <p className="text-xs text-gray-400 font-mono mt-1 break-all">Serial: {drone.serialNumber}</p>
        {drone.model && (
          <p className="text-xs text-gray-500 mt-1">Model: {drone.model}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Flights</p>
          <p className="text-xl font-semibold">{drone.flightCount || 0}</p>
        </div>
        <div>
          <p className="text-gray-500">Total Flight Time</p>
          <p className="text-lg font-semibold">
            {formatDuration(drone.totalFlightTimeSeconds || 0)}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-gray-500">Total Flight Distance</p>
          <p className="text-lg font-semibold">
            {formatDistance(drone.totalFlightDistanceM || 0)}
          </p>
        </div>
      </div>

      <div className="text-xs text-gray-500 border-t pt-3">
        <p>First seen: {formatDate(drone.firstSeen)}</p>
        <p>Last seen: {formatDate(drone.lastSeen)}</p>
      </div>

      <button
        onClick={onDelete}
        className="mt-2 text-sm text-red-600 hover:text-red-800 self-start"
      >
        Remove from Fleet
      </button>
    </div>
  );
}

