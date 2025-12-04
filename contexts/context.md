# Project Context: DJI Air 3 Web Mission Planner

## High-level Summary

We are building a **web-based mission planner** for a DJI Air 3 drone.

- It **does not connect directly** to the drone.
- It is a **mission design and management tool** that:
  - Lets the user design/edit waypoint missions on a map.
  - Saves missions to a database.
  - Exports missions as **KMZ/KML** files compatible with **DJI Fly waypoint missions**, via the “dummy mission + file replacement” workflow.
- In a later phase, it will also serve as an **image archive/search tool** for photos taken by the drone, searchable by **geographic location**.

Target stack:

- **Frontend**: React (ideally Next.js) hosted on **Vercel**.
- **Backend / DB / Auth**: **Supabase** (Postgres + Row Level Security + Auth).
- **Maps**: **Google Maps** JavaScript API.
- **Deployment**: Vercel, using environment variables for Supabase, Google Maps API key, etc.

---

## Goals

1. **Mission planning web app** for DJI Air 3 (and similar DJI drones that use DJI Fly waypoints).
2. Users can:
   - Sign in (Supabase Auth).
   - Create, edit, duplicate, and delete missions.
   - Edit missions on a Google Maps-based UI (waypoints, paths, altitudes, etc.).
   - Save missions to Supabase.
   - Export missions as **KMZ/KML** files.
3. Provide a **clear, step-by-step “How to run this mission in DJI Fly” guide** inside the app.
4. Architect the data model and backend so we can **later add an image archive feature**, supporting:
   - Storing references to drone photos (not necessarily the raw files at first).
   - Searching/browsing photos by geographic location and time.

Non-goals (for now):

- No direct connection to the drone.
- No live telemetry.
- No direct control or upload to the drone from the browser.

---

## Core Architecture

### Overview

- **Client-side app** (Next.js/React) talks to:
  - **Supabase** for auth and data (missions, waypoints, future image metadata).
  - **Supabase Edge Functions or Next.js API routes** for heavy operations like KMZ/KML generation (if needed).
- **Google Maps** on the frontend for:
  - Displaying base maps.
  - Adding/editing waypoints.
  - Drawing mission paths (polylines) and polygons (for mapping missions).

### Components

1. **Frontend**
   - Next.js app (TypeScript preferred).
   - Uses Supabase JS client for auth and DB access.
   - Uses `@react-google-maps/api` (or similar) for:
     - Loading Google Maps.
     - Adding markers, polylines, polygons.
     - Handling waypoint dragging/editing.

2. **Backend**
   - Supabase Postgres schema for:
     - Users (from Supabase auth).
     - Missions.
     - Mission waypoints.
     - Future: images & image locations.
   - Optional: Supabase Edge Functions or Next.js API routes for:
     - Generating KMZ/KML files server-side.
     - Any heavy or structured export logic.

3. **Hosting**
   - Vercel for the web app.
   - Supabase project for DB + auth.

---

## Data Model (Supabase)

Use snake_case for DB columns and camelCase in TypeScript.

### 1. Users

Use Supabase Auth’s built-in `auth.users` table. Don’t create a custom users table unless needed.

Optionally a profile table:

**Table: `profiles`**

- `id` (uuid, PK, references auth.users.id)
- `display_name` (text, nullable)
- `created_at` (timestamptz, default now())

### 2. Missions

**Table: `missions`**

- `id` (uuid, PK, default `gen_random_uuid()`)
- `owner_id` (uuid, FK → auth.users.id)
- `name` (text, not null)
- `description` (text, nullable)
- `drone_model` (text, default `"DJI Air 3"`)
- `home_lat` (double precision, nullable)
- `home_lng` (double precision, nullable)
- `default_altitude_m` (double precision, default 60)
- `default_speed_mps` (double precision, default 5)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())
- `metadata` (jsonb, nullable) — extensible for future flags.

RLS: owner-based access (only owner can read/write their missions).

### 3. Mission Waypoints

**Table: `mission_waypoints`**

- `id` (uuid, PK)
- `mission_id` (uuid, FK → missions.id, on delete cascade)
- `index` (integer, not null) — the order in the mission path; 0-based or 1-based, just be consistent.
- `lat` (double precision, not null)
- `lng` (double precision, not null)
- `altitude_m` (double precision, nullable; if null, use mission default)
- `speed_mps` (double precision, nullable; if null, use mission default)
- `heading_deg` (double precision, nullable) — yaw/heading.
- `gimbal_pitch_deg` (double precision, nullable)
- `action_type` (text, nullable) — e.g. `"none" | "photo" | "video_start" | "video_stop" | "poi" | "hover"`.
- `action_payload` (jsonb, nullable) — action-specific parameters.
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

Index on `(mission_id, index)`.

### 4. Future: Image Archive

Don’t implement yet, but design with this in mind:

**Table: `images`** (future)

- `id` (uuid, PK)
- `owner_id` (uuid, FK → auth.users.id)
- `file_url` (text) — Supabase storage or external URL.
- `captured_at` (timestamptz, nullable)
- `lat` (double precision, nullable)
- `lng` (double precision, nullable)
- `altitude_m` (double precision, nullable)
- `mission_id` (uuid, nullable, FK → missions.id)
- `exif_raw` (jsonb, nullable) — raw EXIF metadata if we choose to store it.
- `tags` (text[], nullable)
- `created_at` (timestamptz, default now())

Plan for spatial querying later (e.g. bounding-box or radius search).

---

## Mission JSON Shape (Frontend)

Use a mission object that the frontend works with, and then persists to Supabase:

```ts
type Mission = {
  id: string;
  name: string;
  description?: string;
  droneModel: string;
  homeLocation?: {
    lat: number;
    lng: number;
  };
  defaultAltitudeM: number;
  defaultSpeedMps: number;
  waypoints: Waypoint[];
};

type Waypoint = {
  id: string;
  index: number;
  lat: number;
  lng: number;
  altitudeM?: number;
  speedMps?: number;
  headingDeg?: number;
  gimbalPitchDeg?: number;
  actionType?: string;
  actionPayload?: Record<string, unknown>;
};