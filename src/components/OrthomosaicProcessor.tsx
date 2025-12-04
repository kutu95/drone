'use client';

import { useState } from 'react';
import { FlightLog } from '@/lib/types';

interface OrthomosaicProcessorProps {
  flightLog: FlightLog;
  onComplete?: () => void;
}

export default function OrthomosaicProcessor({ flightLog, onComplete }: OrthomosaicProcessorProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const photoCount = flightLog.dataPoints?.filter(dp => dp.isPhoto && dp.originalFileUrl).length || 0;

  const handleStartProcessing = async () => {
    if (!projectName.trim()) {
      setError('Please enter a project name');
      return;
    }

    if (photoCount === 0) {
      setError('No photos found in this flight log. Please ensure photos are matched to the flight first.');
      return;
    }

    setProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/orthomosaics/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          flightLogId: flightLog.id,
          projectName: projectName.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start processing');
      }

      setSuccess(`Orthomosaic project created! Project ID: ${data.projectId}`);
      setProjectName('');
      
      // Note: Since photos are stored locally, processing will need to be done client-side
      // or photos need to be uploaded to Supabase Storage first
      if (data.photoPaths && data.photoPaths.length > 0) {
        setSuccess(`Project created. ${data.photoPaths.length} photos found. For server-side processing, upload photos to Supabase Storage first, or process locally with ODM.`);
      }

      setTimeout(() => {
        setShowDialog(false);
        onComplete?.();
      }, 3000);
    } catch (err) {
      console.error('Error processing orthomosaic:', err);
      setError(err instanceof Error ? err.message : 'Failed to process orthomosaic');
    } finally {
      setProcessing(false);
    }
  };

  if (photoCount === 0) {
    return null; // Don't show button if no photos
  }

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
      >
        Process Orthomosaic
      </button>

      {showDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Create Orthomosaic Project</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="e.g., Farm Mapping - March 2024"
                  disabled={processing}
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                <p className="font-semibold mb-1">Processing Options:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li><strong>Local Processing:</strong> Use ODM on your machine</li>
                  <li><strong>Server Processing:</strong> Upload photos to Supabase Storage first</li>
                </ul>
                <p className="mt-2 text-xs">
                  This will create a project record. For now, photos are stored locally. 
                  Full ODM integration coming soon.
                </p>
              </div>

              <div className="text-sm text-gray-600">
                <p><strong>Photos found:</strong> {photoCount}</p>
                <p><strong>Flight Date:</strong> {flightLog.flightDate || 'Unknown'}</p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="bg-green-50 border border-green-200 text-green-800 px-3 py-2 rounded text-sm">
                  {success}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleStartProcessing}
                  disabled={processing || !projectName.trim()}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {processing ? 'Creating...' : 'Create Project'}
                </button>
                <button
                  onClick={() => {
                    setShowDialog(false);
                    setError(null);
                    setSuccess(null);
                    setProjectName('');
                  }}
                  disabled={processing}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

