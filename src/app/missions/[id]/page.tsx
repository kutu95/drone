'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Mission, fetchMission, saveMission, deleteMission, smoothMission } from '@/lib/supabase';
import MapEditor from '@/components/MapEditor';
import WaypointEditor from '@/components/WaypointEditor';
import HowToGuide from '@/components/HowToGuide';
import { downloadKMZ } from '@/lib/kmz-export';
import Link from 'next/link';

export default function MissionDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const [mission, setMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [smoothing, setSmoothing] = useState(false);
  const [showSmoothSettings, setShowSmoothSettings] = useState(false);
  const [smoothSettings, setSmoothSettings] = useState({
    toleranceM: 10,
    minDistanceM: 15,
  });

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
      } else {
        loadMission();
      }
    }
  }, [user, authLoading, router, params.id]);

  const loadMission = async () => {
    try {
      const data = await fetchMission(params.id as string);
      setMission(data);
    } catch (error) {
      console.error('Failed to load mission:', error);
      alert('Failed to load mission');
      router.push('/missions');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!mission) return;
    if (mission.waypoints.length === 0) {
      alert('Please add at least one waypoint before saving.');
      return;
    }

    setSaving(true);
    try {
      await saveMission(mission);
      alert('Mission saved successfully!');
    } catch (error) {
      console.error('Failed to save mission:', error);
      alert('Failed to save mission');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!mission) return;
    if (!confirm('Are you sure you want to delete this mission?')) return;

    try {
      await deleteMission(mission.id);
      router.push('/missions');
    } catch (error) {
      console.error('Failed to delete mission:', error);
      alert('Failed to delete mission');
    }
  };

  const handleExport = () => {
    if (!mission) return;
    if (mission.waypoints.length === 0) {
      alert('Please add at least one waypoint before exporting.');
      return;
    }
    downloadKMZ(mission);
  };

  const handleSmooth = () => {
    if (!mission) return;
    if (mission.waypoints.length <= 2) {
      alert('Mission must have more than 2 waypoints to smooth.');
      return;
    }

    const originalCount = mission.waypoints.length;
    setSmoothing(true);
    
    try {
      const smoothed = smoothMission(mission, {
        toleranceM: smoothSettings.toleranceM,
        minDistanceM: smoothSettings.minDistanceM,
      });
      
      const newCount = smoothed.waypoints.length;
      const reduction = originalCount - newCount;
      
      setMission(smoothed);
      setShowSmoothSettings(false);
      
      alert(`Mission smoothed successfully!\nOriginal waypoints: ${originalCount}\nNew waypoints: ${newCount}\nReduced by: ${reduction} (${Math.round((reduction / originalCount) * 100)}%)`);
    } catch (error) {
      console.error('Failed to smooth mission:', error);
      alert('Failed to smooth mission');
    } finally {
      setSmoothing(false);
    }
  };

  const handleWaypointUpdate = (updatedWaypoint: Mission['waypoints'][number]) => {
    if (!mission) return;
    const updated = mission.waypoints.map(wp =>
      wp.id === updatedWaypoint.id ? updatedWaypoint : wp
    );
    setMission({ ...mission, waypoints: updated });
  };

  const handleWaypointDelete = (waypointId: string) => {
    if (!mission) return;
    const updated = mission.waypoints
      .filter(wp => wp.id !== waypointId)
      .map((wp, idx) => ({ ...wp, index: idx }));
    setMission({ ...mission, waypoints: updated });
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

  if (!mission) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold">{mission.name}</h1>
            <div className="flex gap-4 items-center">
              <Link
                href="/missions"
                className="px-4 py-2 border rounded hover:bg-gray-50"
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
                className="text-gray-600 hover:text-gray-800"
              >
                Fleet
              </Link>
              <button
                onClick={() => setShowSmoothSettings(!showSmoothSettings)}
                className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
                title="Smooth mission to reduce waypoint density"
              >
                {showSmoothSettings ? 'Hide Smooth' : 'Smooth Mission'}
              </button>
              <button
                onClick={handleExport}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Export KMZ
              </button>
              <button
                onClick={handleDelete}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
              >
                Delete
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <HowToGuide />

        {/* Smooth Mission Settings */}
        {showSmoothSettings && mission && mission.waypoints.length > 2 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6 border-2 border-purple-200">
            <h3 className="text-lg font-semibold mb-3 text-gray-800">Smooth Mission Settings</h3>
            <p className="text-sm text-gray-600 mb-4">
              Simplify waypoints by removing points in straight sections while preserving action points (photos, video) and important turns.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tolerance (meters)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={smoothSettings.toleranceM}
                  onChange={(e) => setSmoothSettings({
                    ...smoothSettings,
                    toleranceM: parseFloat(e.target.value) || 10
                  })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Maximum perpendicular distance (1-100m). Higher values remove more waypoints in straight sections.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Minimum Distance (meters)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={smoothSettings.minDistanceM}
                  onChange={(e) => setSmoothSettings({
                    ...smoothSettings,
                    minDistanceM: parseFloat(e.target.value) || 15
                  })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Minimum distance between waypoints after smoothing (1-100m).
                </p>
              </div>
            </div>
            <div className="mb-4 text-sm text-gray-600">
              <p className="font-medium mb-1">Current mission:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Total waypoints: {mission.waypoints.length}</li>
                <li>Action points (photos/video): {mission.waypoints.filter(wp => wp.actionType).length}</li>
              </ul>
            </div>
            <button
              onClick={handleSmooth}
              disabled={smoothing}
              className="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {smoothing ? 'Smoothing...' : 'Apply Smoothing'}
            </button>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Mission Name</label>
              <input
                type="text"
                value={mission.name}
                onChange={(e) => setMission({ ...mission, name: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Drone Model</label>
              <input
                type="text"
                value={mission.droneModel}
                onChange={(e) => setMission({ ...mission, droneModel: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={mission.description || ''}
              onChange={(e) => setMission({ ...mission, description: e.target.value })}
              className="w-full border rounded px-3 py-2"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Default Altitude (m)</label>
              <input
                type="number"
                value={mission.defaultAltitudeM}
                onChange={(e) => setMission({ ...mission, defaultAltitudeM: parseFloat(e.target.value) })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Default Speed (m/s)</label>
              <input
                type="number"
                value={mission.defaultSpeedMps}
                onChange={(e) => setMission({ ...mission, defaultSpeedMps: parseFloat(e.target.value) })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Map Editor</h2>
          <p className="text-sm text-gray-600 mb-4">
            Click on the map to add waypoints. Drag waypoints to reposition them.
          </p>
          <MapEditor mission={mission} onMissionUpdate={setMission} />
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Waypoints ({mission.waypoints.length})</h2>
          {mission.waypoints.length === 0 ? (
            <p className="text-gray-500">No waypoints yet. Click on the map to add waypoints.</p>
          ) : (
            <div className="space-y-2">
              {mission.waypoints.map((waypoint) => (
                <WaypointEditor
                  key={waypoint.id}
                  waypoint={waypoint}
                  mission={mission}
                  onUpdate={handleWaypointUpdate}
                  onDelete={() => handleWaypointDelete(waypoint.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}



