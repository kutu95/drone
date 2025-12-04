# OpenDroneMap (ODM) Setup Guide

This guide explains how to set up OpenDroneMap for orthomosaic processing in your mapping system.

## Installation

### macOS

1. **Install Docker Desktop**
   ```bash
   # Download from https://www.docker.com/products/docker-desktop
   # Or install via Homebrew
   brew install --cask docker
   ```

2. **Start Docker Desktop**
   - Open Docker Desktop from Applications
   - Wait for it to start (whale icon in menu bar)

3. **Pull ODM Docker Image**
   ```bash
   docker pull opendronemap/odm
   ```

4. **Verify Installation**
   ```bash
   docker run --rm opendronemap/odm --help
   ```

### Linux (Ubuntu/Debian)

1. **Install Docker**
   ```bash
   sudo apt-get update
   sudo apt-get install docker.io
   sudo systemctl start docker
   sudo systemctl enable docker
   sudo usermod -aG docker $USER
   # Log out and back in for group changes to take effect
   ```

2. **Pull ODM Image**
   ```bash
   docker pull opendronemap/odm
   ```

### Windows

1. Install Docker Desktop for Windows
2. Start Docker Desktop
3. Pull ODM image:
   ```powershell
   docker pull opendronemap/odm
   ```

## Manual Processing (Current Workflow)

Since photos are stored on your local file system, you can process them manually:

### Option 1: Command Line Processing

1. **Collect Photos**
   - Navigate to your photo folder (e.g., `2024_03_19/`)
   - Copy all photos to a working directory

2. **Run ODM**
   ```bash
   docker run -it --rm \
     -v /path/to/photos:/code/images:ro \
     -v /path/to/output:/code/output \
     opendronemap/odm \
     --project-path /code \
     --orthophoto-resolution 2.0
   ```

3. **Results**
   - `odm_orthophoto.tif` - Main orthomosaic
   - `odm_dem.tif` - Digital Elevation Model
   - `odm_orthophoto/odm_tiles/` - Map tiles (if generated)

### Option 2: Using the API (Future)

Once photos are uploaded to Supabase Storage, the processing API will automatically:
1. Download photos from storage
2. Process with ODM
3. Upload results back to storage
4. Update the project status

## Integration with Your App

### Current Status

- ✅ ODM processor library created (`src/lib/odm-processor.ts`)
- ✅ Processing API endpoint (`/api/orthomosaics/process-uploaded`)
- ⏳ Full integration pending (requires photo upload to storage)

### Next Steps for Full Integration

1. **Upload Photos to Supabase Storage**
   - Modify photo matching to upload originals to storage
   - Or create a separate upload step before processing

2. **Automatic Processing**
   - When processing is triggered, photos are downloaded from storage
   - ODM processes them
   - Results are uploaded back to storage
   - Project status updates automatically

3. **Progress Updates** (Optional)
   - WebSocket or polling for real-time status
   - Show processing progress in UI

## Processing Requirements

### Hardware Requirements
- **CPU**: Multi-core recommended (4+ cores for faster processing)
- **RAM**: 8GB minimum, 16GB+ recommended for large projects
- **Storage**: ~10-20GB free space for temporary files
- **Processing Time**: ~30-60 minutes for 500 photos at 2cm resolution

### Photo Requirements
- Minimum 50 photos for reliable results
- 60-80% overlap (front and side)
- Consistent lighting conditions
- GPS coordinates in EXIF (automatically handled by your system)

## Troubleshooting

**Docker not found:**
```bash
# Verify Docker is running
docker ps

# Check if Docker Desktop is started
# macOS: Check menu bar for whale icon
# Linux: sudo systemctl status docker
```

**ODM fails to start:**
```bash
# Check Docker logs
docker logs <container_id>

# Verify ODM image is pulled
docker images | grep opendronemap
```

**Out of memory errors:**
- Reduce orthophoto resolution (e.g., 5.0 instead of 2.0)
- Process smaller batches
- Increase Docker memory limit in Docker Desktop settings

**Slow processing:**
- Normal for large projects (500+ photos can take 1+ hours)
- Consider using lower resolution for faster preview
- Process in smaller batches if needed

## Performance Tips

1. **Start with lower resolution** for quick previews (5.0 cm/pixel)
2. **Process full resolution** only for final output (2.0 cm/pixel)
3. **Use SSD storage** for temporary files if possible
4. **Close other applications** during processing to free up resources

## Advanced Options

ODM supports many options. See full documentation:
```bash
docker run --rm opendronemap/odm --help
```

Common options:
- `--orthophoto-resolution`: Output resolution in cm/pixel
- `--skip-3dmodel`: Skip 3D model generation (faster)
- `--min-num-features`: Minimum features for matching (default: 10000)
- `--matcher-neighbors`: Number of neighbors for matching (default: 0)

