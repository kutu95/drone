import JSZip from 'jszip';
import { Mission, Waypoint } from './types';

export async function generateKMZ(mission: Mission): Promise<Blob> {
  const zip = new JSZip();
  
  // Generate KML content
  const kml = generateKML(mission);
  
  // Add KML to ZIP
  zip.file('doc.kml', kml);
  
  // Generate and return ZIP as Blob
  return await zip.generateAsync({ type: 'blob' });
}

function generateKML(mission: Mission): string {
  const waypoints = mission.waypoints;
  
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXML(mission.name)}</name>
    <description>${escapeXML(mission.description || '')}</description>
    
    <!-- Mission Path -->
    <Placemark>
      <name>Mission Path</name>
      <LineString>
        <tessellate>1</tessellate>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
`;

  // Add coordinates for path
  waypoints.forEach(wp => {
    const alt = wp.altitudeM ?? mission.defaultAltitudeM;
    kml += `          ${wp.lng},${wp.lat},${alt}\n`;
  });

  kml += `        </coordinates>
      </LineString>
      <Style>
        <LineStyle>
          <color>ff0000ff</color>
          <width>3</width>
        </LineStyle>
      </Style>
    </Placemark>
    
    <!-- Waypoints -->
`;

  waypoints.forEach((wp, idx) => {
    const alt = wp.altitudeM ?? mission.defaultAltitudeM;
    kml += `    <Placemark>
      <name>Waypoint ${idx + 1}</name>
      <description>
        Altitude: ${alt}m
        ${wp.speedMps ? `Speed: ${wp.speedMps}m/s` : ''}
        ${wp.headingDeg ? `Heading: ${wp.headingDeg}°` : ''}
        ${wp.actionType ? `Action: ${wp.actionType}` : ''}
      </description>
      <Point>
        <coordinates>${wp.lng},${wp.lat},${alt}</coordinates>
      </Point>
      <Style>
        <IconStyle>
          <scale>1.2</scale>
          <Icon>
            <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
          </Icon>
        </IconStyle>
      </Style>
    </Placemark>
`;
  });

  // Add home point if set
  if (mission.homeLocation) {
    kml += `    <Placemark>
      <name>Home Point</name>
      <Point>
        <coordinates>${mission.homeLocation.lng},${mission.homeLocation.lat},0</coordinates>
      </Point>
      <Style>
        <IconStyle>
          <scale>1.5</scale>
          <Icon>
            <href>http://maps.google.com/mapfiles/kml/shapes/homegardenbusiness.png</href>
          </Icon>
        </IconStyle>
      </Style>
    </Placemark>
`;
  }

  kml += `  </Document>
</kml>`;

  return kml;
}

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function downloadKMZ(mission: Mission) {
  generateKMZ(mission).then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mission.name.replace(/[^a-z0-9]/gi, '_')}.kmz`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}



