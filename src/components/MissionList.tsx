'use client';

import { Mission } from '@/lib/types';
import Link from 'next/link';

interface MissionListProps {
  missions: Mission[];
  onDelete: (id: string) => void;
}

export default function MissionList({ missions, onDelete }: MissionListProps) {
  return (
    <div className="space-y-4">
      {missions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No missions yet. Create your first mission to get started!</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {missions.map((mission) => (
            <div
              key={mission.id}
              className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow"
            >
              <h3 className="text-xl font-bold mb-2">{mission.name}</h3>
              {mission.description && (
                <p className="text-gray-600 mb-4 text-sm">{mission.description}</p>
              )}
              <div className="text-sm text-gray-500 mb-4">
                <p>Waypoints: {mission.waypoints.length}</p>
                <p>Drone: {mission.droneModel}</p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/missions/${mission.id}`}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-center"
                >
                  Edit
                </Link>
                <button
                  onClick={() => onDelete(mission.id)}
                  className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}



