/**
 * Photoprism integration utilities
 */

export interface PhotoprismConfig {
  url: string;
  accessToken: string;
}

/**
 * Get Photoprism configuration from environment variables
 */
export function getPhotoprismConfig(): PhotoprismConfig | null {
  const url = process.env.PHOTOPRISM_URL;
  const accessToken = process.env.PHOTOPRISM_ACCESS_TOKEN;

  if (!url || !accessToken) {
    return null;
  }

  // Remove trailing slash from URL if present
  const cleanUrl = url.replace(/\/$/, '');

  return {
    url: cleanUrl,
    accessToken,
  };
}

/**
 * Upload a file to Photoprism
 * @param fileBuffer - The file buffer to upload
 * @param filename - The filename
 * @param mimeType - The MIME type of the file
 * @returns The uploaded file information or null if upload failed
 */
export async function uploadFileToPhotoprism(
  fileBuffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<{ uid: string; name: string } | null> {
  const config = getPhotoprismConfig();

  if (!config) {
    console.warn('Photoprism not configured (missing PHOTOPRISM_URL or PHOTOPRISM_ACCESS_TOKEN)');
    return null;
  }

  try {
    // Use native FormData (available in Node.js 18+)
    // Create a Blob from the Buffer for better compatibility
    const fileBlob = new Blob([fileBuffer], { type: mimeType || 'application/octet-stream' });
    const form = new FormData();
    
    // Append file with proper filename
    // In Node.js FormData, we can pass Blob with filename
    form.append('file', fileBlob, filename);

    const response = await fetch(`${config.url}/api/v1/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        // Don't set Content-Type header - let fetch set it with boundary for multipart/form-data
      },
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Photoprism upload failed for ${filename}:`, {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      return null;
    }

    const result = await response.json();
    console.log(`Successfully uploaded ${filename} to Photoprism:`, result);
    
    return {
      uid: result.uid || result.file?.uid || '',
      name: result.name || result.file?.name || filename,
    };
  } catch (error) {
    console.error(`Error uploading ${filename} to Photoprism:`, error);
    return null;
  }
}

/**
 * Check if Photoprism is configured
 */
export function isPhotoprismConfigured(): boolean {
  return getPhotoprismConfig() !== null;
}



