'use client';

import { Waypoint, Mission } from '@/lib/types';
import { useState } from 'react';

interface WaypointEditorProps {
  waypoint: Waypoint;
  mission: Mission;
  onUpdate: (waypoint: Waypoint) => void;
  onDelete: () => void;
}

export default function WaypointEditor({ waypoint, mission, onUpdate, onDelete }: WaypointEditorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const updateField = (field: keyof Waypoint, value: unknown) => {
    onUpdate({ ...waypoint, [field]: value });
  };

  return (
    <div className="border border-gray-200 rounded p-4 mb-2">
      <div className="flex justify-between items-center">
        <h4 className="font-semibold">Waypoint {waypoint.index + 1}</h4>
        <div className="flex gap-2">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            {isOpen ? 'Hide' : 'Edit'}
          </button>
          <button
            onClick={onDelete}
            className="text-red-600 hover:text-red-800 text-sm"
          >
            Delete
          </button>
        </div>
      </div>
      
      {isOpen && (
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Latitude</label>
            <input
              type="number"
              step="any"
              value={waypoint.lat}
              onChange={(e) => updateField('lat', parseFloat(e.target.value))}
              className="w-full border rounded px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Longitude</label>
            <input
              type="number"
              step="any"
              value={waypoint.lng}
              onChange={(e) => updateField('lng', parseFloat(e.target.value))}
              className="w-full border rounded px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Altitude (m) {!waypoint.altitudeM && `(default: ${mission.defaultAltitudeM})`}
            </label>
            <input
              type="number"
              step="any"
              value={waypoint.altitudeM ?? ''}
              onChange={(e) => updateField('altitudeM', e.target.value ? parseFloat(e.target.value) : undefined)}
              className="w-full border rounded px-2 py-1"
              placeholder={mission.defaultAltitudeM.toString()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Speed (m/s) {!waypoint.speedMps && `(default: ${mission.defaultSpeedMps})`}
            </label>
            <input
              type="number"
              step="any"
              value={waypoint.speedMps ?? ''}
              onChange={(e) => updateField('speedMps', e.target.value ? parseFloat(e.target.value) : undefined)}
              className="w-full border rounded px-2 py-1"
              placeholder={mission.defaultSpeedMps.toString()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Heading (deg)</label>
            <input
              type="number"
              step="any"
              value={waypoint.headingDeg ?? ''}
              onChange={(e) => updateField('headingDeg', e.target.value ? parseFloat(e.target.value) : undefined)}
              className="w-full border rounded px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Gimbal Pitch (deg)</label>
            <input
              type="number"
              step="any"
              value={waypoint.gimbalPitchDeg ?? ''}
              onChange={(e) => updateField('gimbalPitchDeg', e.target.value ? parseFloat(e.target.value) : undefined)}
              className="w-full border rounded px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Action Type</label>
            <select
              value={waypoint.actionType ?? ''}
              onChange={(e) => updateField('actionType', e.target.value || undefined)}
              className="w-full border rounded px-2 py-1"
            >
              <option value="">None</option>
              <option value="photo">Photo</option>
              <option value="video_start">Video Start</option>
              <option value="video_stop">Video Stop</option>
              <option value="poi">Point of Interest</option>
              <option value="hover">Hover</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}



