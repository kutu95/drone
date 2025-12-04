'use client';

export default function HowToGuide() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 my-6">
      <h2 className="text-xl font-bold mb-4 text-blue-900">How to Run This Mission in DJI Fly</h2>
      <ol className="list-decimal list-inside space-y-3 text-gray-700">
        <li>Open the DJI Fly app on your mobile device.</li>
        <li>Connect your DJI Air 3 drone and controller.</li>
        <li>Navigate to the <strong>Waypoint</strong> feature in the app.</li>
        <li>Create a dummy waypoint mission with at least one waypoint (this is required to enable the import feature).</li>
        <li>Export or save the dummy mission to get a KMZ file location.</li>
        <li>Download the KMZ file from this web app using the &quot;Export KMZ&quot; button.</li>
        <li>Replace the dummy mission&apos;s KMZ file with the downloaded file from this app.</li>
        <li>Import the replaced KMZ file back into DJI Fly.</li>
        <li>Review the mission on the map in DJI Fly to verify all waypoints are correct.</li>
        <li>Execute the mission when ready!</li>
      </ol>
      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
        <p className="text-sm text-yellow-800">
          <strong>Note:</strong> Make sure your drone is in a safe location with GPS lock before starting the mission.
        </p>
      </div>
    </div>
  );
}



