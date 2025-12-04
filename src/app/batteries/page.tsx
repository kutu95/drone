'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { BatteryStats, fetchBatteryStats, saveBatteryLabel, deleteBatteryLabel } from '@/lib/supabase';

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

function formatDistance(meters: number) {
  if (!meters || meters <= 0) return '0 m';
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

export default function BatteriesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [batteryStats, setBatteryStats] = useState<BatteryStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
      } else {
        loadBatteryStats();
      }
    }
  }, [user, authLoading, router]);

  const loadBatteryStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const stats = await fetchBatteryStats();
      setBatteryStats(stats);
    } catch (err) {
      console.error('Failed to load battery stats:', err);
      setError('Failed to load battery statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    try {
      setIsRecalculating(true);
      setError(null);

      // Get the access token from Supabase session
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Not authenticated. Please sign in and try again.');
      }

      const response = await fetch('/api/recalculate-battery-stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        credentials: 'include', // Include cookies for authentication
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to recalculate statistics');
      }

      // Reload stats after recalculation
      await loadBatteryStats();
      
      alert('Battery statistics recalculated successfully!');
    } catch (err) {
      console.error('Failed to recalculate battery stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to recalculate battery statistics');
      alert(`Failed to recalculate: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsRecalculating(false);
    }
  };

  const totalFleetStats = useMemo(() => {
    if (batteryStats.length === 0) return null;
    const totalFlights = batteryStats.reduce((sum, stat) => sum + stat.flightCount, 0);
    const totalFlightTime = batteryStats.reduce((sum, stat) => sum + stat.totalFlightTimeSeconds, 0);
    const totalDistance = batteryStats.reduce((sum, stat) => sum + stat.totalDistanceM, 0);
    return {
      totalFlights,
      totalFlightTime,
      totalDistance,
    };
  }, [batteryStats]);

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
                className="text-blue-600 font-semibold"
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
                onClick={async () => {
                  const { supabase } = await import('@/lib/supabase');
                  await supabase.auth.signOut();
                  router.push('/login');
                }}
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
            <h2 className="text-3xl font-bold">Battery Monitoring</h2>
            <p className="text-gray-600 mt-1">
              Track health and usage for each intelligent flight battery.
            </p>
          </div>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            {totalFleetStats && (
              <div className="flex gap-6 text-sm text-gray-600">
                <div>
                  <span className="block uppercase tracking-wide text-xs text-gray-500">Fleet Flights</span>
                  <span className="text-lg font-semibold">{totalFleetStats.totalFlights}</span>
                </div>
                <div>
                  <span className="block uppercase tracking-wide text-xs text-gray-500">Fleet Flight Time</span>
                  <span className="text-lg font-semibold">{formatDuration(totalFleetStats.totalFlightTime)}</span>
                </div>
                <div>
                  <span className="block uppercase tracking-wide text-xs text-gray-500">Fleet Distance</span>
                  <span className="text-lg font-semibold">{formatDistance(totalFleetStats.totalDistance)}</span>
                </div>
              </div>
            )}
            <button
              onClick={handleRecalculate}
              disabled={isRecalculating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              title="Recalculate all battery statistics from flight logs"
            >
              {isRecalculating ? 'Recalculating...' : 'Recalculate Stats'}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
            {error}
          </div>
        )}

        {batteryStats.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 mb-4">
              No battery data found yet. Upload flight logs with battery serial numbers to populate this dashboard.
            </p>
            <p className="text-sm text-gray-400 mb-4">
              If you have uploaded logs but see this message, click "Recalculate Stats" to populate the cache.
            </p>
            <button
              onClick={handleRecalculate}
              disabled={isRecalculating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {isRecalculating ? 'Recalculating...' : 'Recalculate Stats'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {batteryStats.map((battery) => (
              <BatteryCard
                key={battery.serialNumber}
                battery={battery}
                onLabelUpdate={async (newLabel: string) => {
                  try {
                    if (newLabel.trim()) {
                      await saveBatteryLabel(battery.serialNumber, newLabel);
                    } else {
                      await deleteBatteryLabel(battery.serialNumber);
                    }
                    await loadBatteryStats();
                  } catch (err) {
                    console.error('Failed to update battery label:', err);
                    alert('Failed to update battery label');
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

function BatteryCard({ battery, onLabelUpdate }: { battery: BatteryStats; onLabelUpdate: (label: string) => Promise<void> }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelInput, setLabelInput] = useState(battery.label || '');
  const [isSaving, setIsSaving] = useState(false);

  // Update label input when battery prop changes (only if different)
  const currentLabel = battery.label || '';
  useEffect(() => {
    if (!isEditingLabel && labelInput !== currentLabel) {
      setLabelInput(currentLabel);
    }
  }, [currentLabel, isEditingLabel]); // Only depend on the actual value, not labelInput

  const handleSaveLabel = async () => {
    setIsSaving(true);
    try {
      await onLabelUpdate(labelInput);
      setIsEditingLabel(false);
    } catch (err) {
      console.error('Failed to save label:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setLabelInput(battery.label || '');
    setIsEditingLabel(false);
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-100 p-6 flex flex-col gap-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Battery Label</p>
        {isEditingLabel ? (
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveLabel();
                } else if (e.key === 'Escape') {
                  handleCancelEdit();
                }
              }}
              placeholder="e.g., Battery #1"
              className="flex-1 border rounded px-2 py-1 text-lg font-semibold"
              autoFocus
              disabled={isSaving}
            />
            <button
              onClick={handleSaveLabel}
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
              onClick={() => setIsEditingLabel(true)}
              title="Click to edit label"
            >
              {battery.label || (
                <span className="text-gray-400 italic">Click to add label...</span>
              )}
            </p>
            <button
              onClick={() => setIsEditingLabel(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 text-sm"
              title="Edit label"
            >
              ✏️
            </button>
          </div>
        )}
        <p className="text-xs text-gray-400 font-mono mt-1 break-all">Serial: {battery.serialNumber}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Flights</p>
          <p className="text-xl font-semibold">{battery.flightCount}</p>
        </div>
        <div>
          <p className="text-gray-500">Total Flight Time</p>
          <p className="text-lg font-semibold">{formatDuration(battery.totalFlightTimeSeconds)}</p>
        </div>
        <div>
          <p className="text-gray-500">Avg Flight Time</p>
          <p className="text-lg font-semibold">{formatDuration(battery.averageFlightTimeSeconds)}</p>
        </div>
        <div>
          <p className="text-gray-500">Total Distance</p>
          <p className="text-lg font-semibold">{formatDistance(battery.totalDistanceM)}</p>
        </div>
        <div>
          <p className="text-gray-500">Avg Battery Usage</p>
          <p className="text-lg font-semibold">
            {battery.averageBatteryUsagePercent !== undefined
              ? `${battery.averageBatteryUsagePercent.toFixed(1)}%`
              : 'N/A'}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Last Flight</p>
          <p className="text-lg font-semibold">
            {battery.lastFlightDate
              ? new Date(battery.lastFlightDate).toLocaleDateString()
              : 'N/A'}
          </p>
        </div>
      </div>

      <div className="text-xs text-gray-500 border-t pt-3">
        <p>
          First flight:{' '}
          {battery.firstFlightDate
            ? new Date(battery.firstFlightDate).toLocaleDateString()
            : 'N/A'}
        </p>
        <p>
          Total battery usage:{' '}
          {battery.totalBatteryUsagePercent !== undefined
            ? `${battery.totalBatteryUsagePercent.toFixed(1)}%`
            : 'N/A'}
        </p>
      </div>

      {/* Battery Health Information */}
      {(battery.averageVoltage !== undefined || battery.averageTemperature !== undefined || battery.fullCapacity !== undefined) && (
        <div className="border-t pt-3">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Battery Health</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {battery.averageVoltage !== undefined && (
              <div>
                <p className="text-gray-500">Avg Voltage</p>
                <p className="font-semibold">{battery.averageVoltage.toFixed(2)}V</p>
              </div>
            )}
            {battery.minVoltage !== undefined && battery.maxVoltage !== undefined && (
              <div>
                <p className="text-gray-500">Range</p>
                <p className="font-semibold">{battery.minVoltage.toFixed(2)}-{battery.maxVoltage.toFixed(2)}V</p>
              </div>
            )}
            {battery.averageTemperature !== undefined && (
              <div>
                <p className="text-gray-500">Avg Temp</p>
                <p className="font-semibold">{battery.averageTemperature.toFixed(1)}°C</p>
              </div>
            )}
            {battery.minTemperature !== undefined && battery.maxTemperature !== undefined && (
              <div>
                <p className="text-gray-500">Temp Range</p>
                <p className="font-semibold">{battery.minTemperature.toFixed(0)}-{battery.maxTemperature.toFixed(0)}°C</p>
              </div>
            )}
            {battery.averageCellDeviation !== undefined && (
              <div>
                <p className="text-gray-500">Cell Balance</p>
                <p className={`font-semibold ${battery.averageCellDeviation > 0.1 ? 'text-yellow-600' : 'text-green-600'}`}>
                  {battery.averageCellDeviation.toFixed(3)}V
                </p>
              </div>
            )}
            {battery.fullCapacity !== undefined && (
              <div>
                <p className="text-gray-500">Capacity</p>
                <p className="font-semibold">{battery.fullCapacity}mAh</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

