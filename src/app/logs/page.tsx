'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { FlightLog, fetchFlightLogs, deleteFlightLog } from '@/lib/supabase';
import FlightLogUpload from '@/components/FlightLogUpload';
import BulkPhotoRegenerator from '@/components/BulkPhotoRegenerator';
import Link from 'next/link';

type GroupedLogs = {
  year: number;
  month: number;
  monthName: string;
  logs: FlightLog[];
};

export default function FlightLogsPage() {
  const { user, loading: authLoading } = useAuth();
  const [flightLogs, setFlightLogs] = useState<FlightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<FlightLog | null>(null);
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBulkPhotoRegenerator, setShowBulkPhotoRegenerator] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
      } else {
        loadFlightLogs();
      }
    }
  }, [user, authLoading, router]);

  const loadFlightLogs = async () => {
    try {
      setLoading(true);
      const data = await fetchFlightLogs();
      setFlightLogs(data);
    } catch (err) {
      console.error('Failed to load flight logs:', err);
      setError('Failed to load flight logs');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this flight log?')) return;

    try {
      await deleteFlightLog(id);
      setFlightLogs(flightLogs.filter(log => log.id !== id));
      setSelectedLogIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    } catch (err) {
      console.error('Failed to delete flight log:', err);
      alert('Failed to delete flight log');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedLogIds.size === 0) return;

    const count = selectedLogIds.size;
    if (!confirm(`Are you sure you want to delete ${count} ${count === 1 ? 'flight log' : 'flight logs'}? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    const idsToDelete = Array.from(selectedLogIds);
    const deletedIds: string[] = [];
    const failedIds: string[] = [];
    
    try {
      // Delete sequentially to avoid overwhelming the database
      for (let i = 0; i < idsToDelete.length; i++) {
        const id = idsToDelete[i];
        try {
          await deleteFlightLog(id);
          deletedIds.push(id);
          // Update UI incrementally for better UX
          setFlightLogs(prev => prev.filter(log => log.id !== id));
        } catch (error: any) {
          console.error(`Failed to delete flight log ${id}:`, error);
          failedIds.push(id);
          // If it's a timeout, continue trying others
          if (error?.code === '57014' || error?.message?.includes('timeout')) {
            console.warn(`Timeout deleting ${id}, continuing with others...`);
          }
        }
        // Small delay between deletions to avoid overwhelming the database
        if (i < idsToDelete.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Remove successfully deleted IDs from selection
      if (deletedIds.length > 0) {
        setSelectedLogIds(prev => {
          const newSet = new Set(prev);
          deletedIds.forEach(id => newSet.delete(id));
          return newSet;
        });
      }
      
      if (failedIds.length > 0) {
        alert(`Successfully deleted ${deletedIds.length} ${deletedIds.length === 1 ? 'log' : 'logs'}. Failed to delete ${failedIds.length} ${failedIds.length === 1 ? 'log' : 'logs'}. Please try again.`);
      } else {
        // Clear selection if all succeeded
        setSelectedLogIds(new Set());
      }
    } catch (error) {
      console.error('Failed to delete flight logs:', error);
      alert(`Failed to delete some flight logs. Please try again.`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSignOut = async () => {
    const { supabase } = await import('@/lib/supabase');
    await supabase.auth.signOut();
    router.push('/login');
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  // Group flight logs by year and month
  const groupedLogs = useMemo(() => {
    const grouped = new Map<string, GroupedLogs>();
    const noDateLogs: FlightLog[] = [];

    flightLogs.forEach((log) => {
      if (!log.flightDate) {
        noDateLogs.push(log);
        return;
      }

      const date = new Date(log.flightDate);
      const year = date.getFullYear();
      const month = date.getMonth(); // 0-11
      const key = `${year}-${month}`;

      if (!grouped.has(key)) {
        const monthName = date.toLocaleDateString('en-US', { month: 'long' });
        grouped.set(key, {
          year,
          month,
          monthName,
          logs: [],
        });
      }

      grouped.get(key)!.logs.push(log);
    });

    // Sort logs within each group by date (newest first)
    grouped.forEach((group) => {
      group.logs.sort((a, b) => {
        const dateA = a.flightDate ? new Date(a.flightDate).getTime() : 0;
        const dateB = b.flightDate ? new Date(b.flightDate).getTime() : 0;
        return dateB - dateA; // Descending order
      });
    });

    // Sort no date logs by filename or created date
    noDateLogs.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    // Convert map to array and sort by year/month (newest first)
    const groups = Array.from(grouped.values()).sort((a, b) => {
      if (a.year !== b.year) {
        return b.year - a.year; // Descending year
      }
      return b.month - a.month; // Descending month
    });

    // Add no-date group at the end if there are any
    if (noDateLogs.length > 0) {
      groups.push({
        year: 0,
        month: 0,
        monthName: 'No Date',
        logs: noDateLogs,
      });
    }

    return groups;
  }, [flightLogs]);

  // Groups start collapsed by default - user can expand them as needed
  // No auto-expand logic - groups remain collapsed until user clicks to expand

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
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
                className="text-blue-600 font-semibold"
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
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold">Flight Logs</h2>
          {selectedLogIds.size > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">
                {selectedLogIds.size} {selectedLogIds.size === 1 ? 'log' : 'logs'} selected
              </span>
              <button
                onClick={() => setSelectedLogIds(new Set())}
                className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Clear Selection
              </button>
              <button
                onClick={() => setShowBulkPhotoRegenerator(true)}
                disabled={isDeleting}
                className="px-4 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Regenerate Photos ({selectedLogIds.size})
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={isDeleting}
                className="px-4 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : `Delete Selected (${selectedLogIds.size})`}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
            {error}
          </div>
        )}

        {uploadError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
            Upload error: {uploadError}
            <button
              onClick={() => setUploadError(null)}
              className="ml-2 text-red-500 hover:text-red-700"
            >
              ×
            </button>
          </div>
        )}

        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4">Upload New Flight Log</h3>
          <FlightLogUpload
            onUploadComplete={() => {
              loadFlightLogs();
              setUploadError(null);
            }}
            onError={(err) => setUploadError(err)}
          />
        </div>

        {flightLogs.length === 0 ? (
          <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
            No flight logs yet. Upload a log file to get started.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Select All / Unselect All Controls */}
            <div className="bg-white shadow rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    const allIds = new Set(flightLogs.map(log => log.id));
                    setSelectedLogIds(allIds);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelectedLogIds(new Set())}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Unselect All
                </button>
                {selectedLogIds.size > 0 && (
                  <span className="text-sm text-gray-600">
                    {selectedLogIds.size} of {flightLogs.length} selected
                  </span>
                )}
              </div>
            </div>

            {groupedLogs.map((group, groupIndex) => {
              const groupKey = group.year === 0 ? 'no-date' : `${group.year}-${group.month}`;
              const isExpanded = expandedGroups.has(groupKey);

              return (
                <div key={`${group.year}-${group.month}-${groupIndex}`} className="bg-white shadow rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleGroup(groupKey)}
                    className="w-full bg-gray-50 px-6 py-3 border-b border-gray-200 hover:bg-gray-100 transition-colors text-left flex items-center justify-between"
                  >
                    <h3 className="text-lg font-semibold text-gray-900">
                      {group.year === 0 ? (
                        group.monthName
                      ) : (
                        `${group.monthName} ${group.year}`
                      )}
                      <span className="ml-2 text-sm font-normal text-gray-500">
                        ({group.logs.length} {group.logs.length === 1 ? 'flight' : 'flights'})
                      </span>
                    </h3>
                    <svg
                      className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  {isExpanded && (
                    <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                        <input
                          type="checkbox"
                          checked={group.logs.length > 0 && group.logs.every(log => selectedLogIds.has(log.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const groupIds = new Set(group.logs.map(log => log.id));
                              setSelectedLogIds(prev => new Set([...prev, ...groupIds]));
                            } else {
                              const groupIds = new Set(group.logs.map(log => log.id));
                              setSelectedLogIds(prev => {
                                const newSet = new Set(prev);
                                groupIds.forEach(id => newSet.delete(id));
                                return newSet;
                              });
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Filename
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Duration
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Max Altitude
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Distance
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Photos
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {group.logs.map((log) => (
                      <tr key={log.id} className={`hover:bg-gray-50 ${selectedLogIds.has(log.id) ? 'bg-blue-50' : ''}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedLogIds.has(log.id)}
                            onChange={(e) => {
                              setSelectedLogIds(prev => {
                                const newSet = new Set(prev);
                                if (e.target.checked) {
                                  newSet.add(log.id);
                                } else {
                                  newSet.delete(log.id);
                                }
                                return newSet;
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Link
                            href={`/logs/${log.id}`}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {log.filename}
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(log.flightDate)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDuration(log.durationSeconds)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {log.maxAltitudeM
                            ? `${Math.round(log.maxAltitudeM)}m`
                            : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {log.totalDistanceM
                            ? `${Math.round(log.totalDistanceM)}m`
                            : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {log.photoCount !== undefined ? log.photoCount : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {(log.errors && log.errors.length > 0) || (log.warnings && log.warnings.length > 0) ? (
                            <div className="flex gap-2">
                              {log.errors && log.errors.length > 0 && (
                                <button
                                  onClick={() => setSelectedLogForDetails(log)}
                                  className="text-red-600 hover:text-red-800"
                                  title={`${log.errors.length} error(s)`}
                                >
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              )}
                              {log.warnings && log.warnings.length > 0 && (
                                <button
                                  onClick={() => setSelectedLogForDetails(log)}
                                  className="text-yellow-600 hover:text-yellow-800"
                                  title={`${log.warnings.length} warning(s)`}
                                >
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <Link
                            href={`/logs/${log.id}`}
                            className="text-blue-600 hover:text-blue-900 mr-4"
                          >
                            View
                          </Link>
                          <button
                            onClick={() => handleDelete(log.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Bulk Photo Regenerator Dialog */}
      {showBulkPhotoRegenerator && selectedLogIds.size > 0 && (
        <BulkPhotoRegenerator
          flightLogs={flightLogs.filter(log => selectedLogIds.has(log.id))}
          onClose={() => setShowBulkPhotoRegenerator(false)}
          onComplete={async () => {
            await loadFlightLogs();
          }}
        />
      )}

      {/* Warning/Error Details Modal */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">Flight Log Warnings & Errors</h3>
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              <p className="text-sm text-gray-600 mb-4">
                <strong>File:</strong> {selectedLogForDetails.filename}
              </p>
              
              {selectedLogForDetails.errors && selectedLogForDetails.errors.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-md font-semibold text-red-600 mb-2 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    Errors ({selectedLogForDetails.errors.length})
                  </h4>
                  <div className="space-y-3">
                    {selectedLogForDetails.errors.map((error, idx) => (
                      <div key={error.id || idx} className="bg-red-50 border border-red-200 rounded p-3">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-semibold text-red-800">{error.category}</span>
                          {error.timestampOffsetMs !== undefined && (
                            <span className="text-xs text-red-600">
                              {formatDuration(error.timestampOffsetMs / 1000)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-red-700">{error.message}</p>
                        {error.details && Object.keys(error.details).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-red-600 cursor-pointer">Details</summary>
                            <pre className="mt-1 text-xs bg-red-100 p-2 rounded overflow-auto">
                              {JSON.stringify(error.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedLogForDetails.warnings && selectedLogForDetails.warnings.length > 0 && (
                <div>
                  <h4 className="text-md font-semibold text-yellow-600 mb-2 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Warnings ({selectedLogForDetails.warnings.length})
                  </h4>
                  <div className="space-y-3">
                    {selectedLogForDetails.warnings.map((warning, idx) => (
                      <div key={warning.id || idx} className="bg-yellow-50 border border-yellow-200 rounded p-3">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-semibold text-yellow-800">{warning.category}</span>
                          {warning.timestampOffsetMs !== undefined && (
                            <span className="text-xs text-yellow-600">
                              {formatDuration(warning.timestampOffsetMs / 1000)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-yellow-700">{warning.message}</p>
                        {warning.details && Object.keys(warning.details).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-yellow-600 cursor-pointer">Details</summary>
                            <pre className="mt-1 text-xs bg-yellow-100 p-2 rounded overflow-auto">
                              {JSON.stringify(warning.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {(!selectedLogForDetails.errors || selectedLogForDetails.errors.length === 0) &&
               (!selectedLogForDetails.warnings || selectedLogForDetails.warnings.length === 0) && (
                <p className="text-gray-500 text-center py-4">No warnings or errors for this flight log.</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setSelectedLogForDetails(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

