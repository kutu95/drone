'use client';

import { useEffect, useState } from 'react';

interface TestResults {
  success: boolean;
  timestamp?: string;
  fileSize?: number;
  cliParser?: {
    success: boolean;
    dataPointsCount?: number;
    error?: string;
    parser?: string;
    [key: string]: unknown;
  };
  basicParser?: {
    success: boolean;
    dataPointsCount?: number;
    error?: string;
    parser?: string;
    [key: string]: unknown;
  };
  error?: string;
}

export default function TestParserPage() {
  const [results, setResults] = useState<TestResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function runTest() {
      try {
        const response = await fetch('/api/test-parser');
        const data = await response.json();
        setResults(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to run test');
      } finally {
        setLoading(false);
      }
    }

    runTest();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">Parser Test Results</h1>
          <p>Running tests...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">Parser Test Results</h1>
          <div className="bg-red-50 border border-red-200 rounded p-4 text-red-800">
            Error: {error}
          </div>
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">Parser Test Results</h1>
          <p>No results available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-gray-50 text-gray-900">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-900">DJI Log Parser Test Results</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6 text-gray-900">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">Test Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="font-medium">Timestamp:</span>{' '}
              {results.timestamp ? new Date(results.timestamp).toLocaleString() : 'N/A'}
            </div>
            <div>
              <span className="font-medium">File Size:</span>{' '}
              {results.fileSize ? `${(results.fileSize / 1024).toFixed(2)} KB` : 'N/A'}
            </div>
          </div>
        </div>

        {/* CLI Parser Results */}
        {results.cliParser && (
          <div className="bg-white rounded-lg shadow p-6 mb-6 text-gray-900">
            <h2 className="text-xl font-semibold mb-4">
              CLI Parser Results{' '}
              {results.cliParser.success ? (
                <span className="text-green-600">✓</span>
              ) : (
                <span className="text-red-600">✗</span>
              )}
            </h2>
            {results.cliParser.error ? (
              <div className="bg-red-50 border border-red-300 rounded p-4 text-red-900">
                <p className="font-bold text-lg mb-2">⚠️ Parser Failed</p>
                <p className="mb-3 whitespace-pre-wrap">{results.cliParser.error}</p>
                {(results.cliParser.error.includes('CLI tool') || results.cliParser.error.includes('dji-log-parser')) && (
                  <div className="mt-4 p-3 bg-white rounded border border-red-200">
                    <p className="font-medium mb-2">To fix this:</p>
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>Download the <code className="bg-gray-100 px-1 rounded">dji-log-parser</code> binary for your platform from{' '}
                        <a
                          href="https://github.com/lvauvillier/dji-log-parser/releases"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-blue-600"
                        >
                          GitHub releases
                        </a>
                      </li>
                      <li>Place it in your project root directory as <code className="bg-gray-100 px-1 rounded">dji-log-parser</code></li>
                      <li>Make it executable: <code className="bg-gray-100 px-1 rounded">chmod +x dji-log-parser</code></li>
                      <li>Restart your development server</li>
                    </ol>
                  </div>
                )}
                {results.cliParser.error.includes('API Key') && (
                  <div className="mt-4 p-3 bg-white rounded border border-blue-200">
                    {results.cliParser.error.includes('Unable to fetch keychain') ? (
                      <>
                        <p className="font-medium mb-2 text-orange-900">API Key Configuration Error:</p>
                        <p className="text-sm text-orange-800 mb-2">
                          The DJI API key was provided but unable to fetch the keychain. This usually means:
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-sm text-orange-800 mb-2">
                          <li>The API key is invalid or incorrect</li>
                          <li>The API key doesn't have the required permissions</li>
                          <li>There's a network connectivity issue</li>
                        </ul>
                        <p className="text-sm text-orange-800 mb-2">
                          Please verify your API key in the{' '}
                          <a
                            href="https://developer.dji.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            DJI Developer Portal
                          </a>
                          {' '}and ensure it has access to log file decryption services.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium mb-2 text-blue-900">API Key Required:</p>
                        <p className="text-sm text-blue-800 mb-2">
                          Your log file is version 13 or above and requires a DJI API key for decryption.
                        </p>
                        <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
                          <li>Visit the{' '}
                            <a
                              href="https://developer.dji.com/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              DJI Developer Portal
                            </a>
                            {' '}and create an account
                          </li>
                          <li>Register your application and obtain an API key</li>
                          <li>Set it as an environment variable:
                            <code className="bg-gray-100 px-1 rounded ml-1">export DJI_API_KEY=your-key</code>
                          </li>
                          <li>Or add to <code className="bg-gray-100 px-1 rounded">.env.local</code>: <code className="bg-gray-100 px-1 rounded">DJI_API_KEY=your-key</code></li>
                          <li>Restart your development server</li>
                        </ol>
                        <p className="text-xs text-blue-600 mt-2">
                          Note: Older log files (version 12 and below) do not require an API key.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-medium">Parser:</span> {results.cliParser.parser || 'N/A'}
                  </div>
                  <div>
                    <span className="font-medium">Data Points:</span>{' '}
                    {results.cliParser.dataPointsCount || 0}
                  </div>
                </div>
                {typeof results.cliParser.durationSeconds === 'number' && (
                  <div>
                    <span className="font-medium">Duration:</span>{' '}
                    {results.cliParser.durationSeconds.toFixed(1)}s
                  </div>
                )}
                {typeof results.cliParser.maxAltitudeM === 'number' && (
                  <div>
                    <span className="font-medium">Max Altitude:</span>{' '}
                    {results.cliParser.maxAltitudeM.toFixed(1)}m
                  </div>
                )}
                {typeof results.cliParser.maxSpeedMps === 'number' && (
                  <div>
                    <span className="font-medium">Max Speed:</span>{' '}
                    {results.cliParser.maxSpeedMps.toFixed(1)} m/s
                  </div>
                )}
                {(() => {
                  const homeLoc = results.cliParser.homeLocation;
                  if (homeLoc && typeof homeLoc === 'object' && homeLoc !== null) {
                    const loc = homeLoc as { lat?: unknown; lng?: unknown };
                    if (typeof loc.lat === 'number' && typeof loc.lng === 'number') {
                      return (
                        <div>
                          <span className="font-medium">Home Location:</span>{' '}
                          {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}
                        </div>
                      );
                    }
                  }
                  return null;
                })()}
                {results.cliParser.firstDataPoint !== undefined && results.cliParser.firstDataPoint !== null && (
                  <details className="mt-4">
                    <summary className="cursor-pointer font-medium text-gray-900">First Data Point</summary>
                    <pre className="mt-2 bg-gray-50 p-3 rounded text-sm overflow-auto">
                      {JSON.stringify(results.cliParser.firstDataPoint, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        )}

        {/* Basic Parser Results */}
        {results.basicParser && (
          <div className="bg-white rounded-lg shadow p-6 mb-6 text-gray-900">
            <h2 className="text-xl font-semibold mb-4">
              Basic Parser Results{' '}
              {results.basicParser.success ? (
                <span className="text-green-600">✓</span>
              ) : (
                <span className="text-red-600">✗</span>
              )}
            </h2>
            {results.basicParser.error ? (
              <div className="bg-red-50 border border-red-200 rounded p-4 text-red-800">
                <p className="font-medium">Error:</p>
                <p>{results.basicParser.error}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-medium">Parser:</span> {results.basicParser.parser || 'N/A'}
                  </div>
                  <div>
                    <span className="font-medium">Data Points:</span>{' '}
                    {results.basicParser.dataPointsCount || 0}
                  </div>
                </div>
                {results.basicParser.durationSeconds && (
                  <div>
                    <span className="font-medium">Duration:</span>{' '}
                    {results.basicParser.durationSeconds.toFixed(1)}s
                  </div>
                )}
                {results.basicParser.maxAltitudeM && (
                  <div>
                    <span className="font-medium">Max Altitude:</span>{' '}
                    {results.basicParser.maxAltitudeM.toFixed(1)}m
                  </div>
                )}
                {results.basicParser.maxSpeedMps && (
                  <div>
                    <span className="font-medium">Max Speed:</span>{' '}
                    {results.basicParser.maxSpeedMps.toFixed(1)} m/s
                  </div>
                )}
                {results.basicParser.homeLocation && (
                  <div>
                    <span className="font-medium">Home Location:</span>{' '}
                    {results.basicParser.homeLocation.lat?.toFixed(6)}, {results.basicParser.homeLocation.lng?.toFixed(6)}
                  </div>
                )}
                {results.basicParser.firstDataPoint && (
                  <details className="mt-4">
                    <summary className="cursor-pointer font-medium text-gray-900">First Data Point</summary>
                    <pre className="mt-2 bg-gray-50 p-3 rounded text-sm overflow-auto">
                      {JSON.stringify(results.basicParser.firstDataPoint, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded p-4">
          <p className="font-medium text-blue-900">Summary:</p>
          <ul className="list-disc list-inside mt-2 text-blue-800 space-y-1">
            {results.cliParser?.success && results.cliParser.dataPointsCount && results.cliParser.dataPointsCount > 0 && (
              <li>CLI Parser: ✓ Extracted {results.cliParser.dataPointsCount} data points</li>
            )}
            {results.basicParser?.success && results.basicParser.dataPointsCount !== undefined && (
              <li>
                Basic Parser: {results.basicParser.dataPointsCount > 0 ? '✓' : '⚠'} Extracted{' '}
                {results.basicParser.dataPointsCount} data points
              </li>
            )}
            {(!results.cliParser?.success || results.cliParser?.dataPointsCount === 0) &&
              results.basicParser?.dataPointsCount === 0 && (
                <li className="text-red-600">
                  ⚠ No data points extracted. Install dji-log-parser CLI tool for accurate parsing.
                </li>
              )}
          </ul>
        </div>
      </div>
    </div>
  );
}

