# Database Migration Instructions

## Running Migrations

To apply the database migrations for photo filename support, run the SQL migrations in your Supabase project.

### Migration Files

1. **001_initial_schema.sql** - Initial database schema (missions, waypoints)
2. **002_flight_logs.sql** - Flight logs tables
3. **003_add_photo_filename.sql** - Adds photo_filename column to flight_log_data_points

### How to Run Migrations

#### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy and paste the contents of `supabase/migrations/003_add_photo_filename.sql`
5. Click **Run**

#### Option 2: Supabase CLI

If you have Supabase CLI installed:

```bash
supabase db push
```

This will apply all pending migrations.

#### Option 3: Manual SQL Execution

Connect to your database and run:

```sql
-- Add photo_filename column to flight_log_data_points table
ALTER TABLE flight_log_data_points 
ADD COLUMN IF NOT EXISTS photo_filename TEXT;

-- Add index for faster photo queries
CREATE INDEX IF NOT EXISTS idx_flight_log_data_points_photo 
ON flight_log_data_points(flight_log_id, is_photo) 
WHERE is_photo = true;
```

### Note

The application will automatically work without the `photo_filename` column (it will skip that field), but you'll miss photo filename data. Run the migration to enable full photo tracking functionality.

