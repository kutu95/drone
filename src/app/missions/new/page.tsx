'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Mission, saveMission } from '@/lib/supabase';
import MapEditor from '@/components/MapEditor';
import WaypointEditor from '@/components/WaypointEditor';

const defaultMission: Mission = {
  id: '',
  name: 'New Mission',
  description: '',
  droneModel: 'DJI Air 3',
  defaultAltitudeM: 60,
  defaultSpeedMps: 5,
  waypoints: [],
};

export default function NewMissionPage() {
  const { user, loading: authLoading } = useAuth();
  const [mission, setMission] = useState<Mission>(defaultMission);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  const handleSave = async () => {
    if (mission.waypoints.length === 0) {
      alert('Please add at least one waypoint before saving.');
      return;
    }

    setSaving(true);
    try {
      const saved = await saveMission(mission);
      router.push(`/missions/${saved.id}`);
    } catch (error) {
      console.error('Failed to save mission:', error);
      alert('Failed to save mission');
    } finally {
      setSaving(false);
    }
  };

  const handleWaypointUpdate = (updatedWaypoint: typeof mission.waypoints[0]) => {
    const updated = mission.waypoints.map(wp =>
      wp.id === updatedWaypoint.id ? updatedWaypoint : wp
    );
    setMission({ ...mission, waypoints: updated });
  };

  const handleWaypointDelete = (waypointId: string) => {
    const updated = mission.waypoints
      .filter(wp => wp.id !== waypointId)
      .map((wp, idx) => ({ ...wp, index: idx }));
    setMission({ ...mission, waypoints: updated });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold">New Mission</h1>
            <div className="flex gap-4">
              <button
                onClick={() => router.push('/missions')}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Mission'}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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



