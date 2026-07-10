# Course Directory API

FastAPI and React application for synchronizing Marist registration sections and RateMyProfessors data into Postgres.

## Setup

1. Create an environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Start Postgres:

   ```powershell
   docker compose up -d
   ```

3. Create and activate a virtual environment, then install dependencies:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

4. Run the API:

   ```powershell
   uvicorn backend.main:app --reload
   ```

5. Sync registration data from the Admin page or API:

   ```powershell
   Invoke-RestMethod -Method Post `
     -Uri http://127.0.0.1:8000/admin/sync-registration `
     -Headers @{ "X-Admin-Token" = "change-me" }
   ```

6. Browse:

   - API docs: <http://127.0.0.1:8000/docs>
   - Course sections: <http://127.0.0.1:8000/sections>

## Docker

Build and run the backend plus Postgres:

```powershell
docker compose up --build
```

The backend container listens on <http://127.0.0.1:8000>. Inside Docker, it connects to Postgres at `db:5432`; from the host, Postgres is still available on `127.0.0.1:5433`.

## Frontend

The React frontend lives in `frontend/` and expects the FastAPI backend at `http://127.0.0.1:8000`.

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Open <http://localhost:5173> for the course section directory. The admin sync page is at <http://localhost:5173/admin> and uses the backend `ADMIN_API_KEY` as `X-Admin-Token`.

The RateMyProfessors exploration page is at <http://localhost:5173/rmp>. It calls:

```txt
GET /rmp/professors?school_id=563&page_size=20&q=
```

`563` is the RateMyProfessors school ID for Marist College.

## Registration JSON Sync

Configure the request without editing the endpoint URL:

```env
MYMARIST_TERM=202640
MYMARIST_UNIQUE_SESSION_ID=your-current-session-id
MYMARIST_PAGE_MAX_SIZE=2339
```

Set `MYMARIST_PAGE_MAX_SIZE` high enough to return every section. The Admin page's **Fetch and sync registration** button now downloads a fresh snapshot and applies the database sync in one action.

The standalone probe remains available for request debugging:

```powershell
docker compose run --rm --no-deps backend python -m backend.probe_mymarist_request
```

Confirm the resulting `registration_latest.json` has a `data` length equal to `totalCount`. Partial and empty snapshots are rejected before any database writes. Import the complete snapshot from the Admin page or call:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:8000/admin/sync-registration `
  -Headers @{ "X-Admin-Token" = "your-admin-token" }
```

The sync upserts courses, instructors, sections, and section-instructor links. Unchanged sections are detected by content hash, and sections missing from a later complete snapshot are marked inactive rather than deleted.

## Troubleshooting

If FastAPI reports `password authentication failed for user "postgres"`, first restart the API process so it reloads `.env`. The Docker database in this project expects:

```powershell
DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:5433/professors
```

You can verify the Docker database password with:

```powershell
docker compose exec -e PGPASSWORD=postgres db psql -h 127.0.0.1 -U postgres -d professors -c "select 1;"
```

If you run the API from another Docker container instead of directly on Windows, use `db` as the host:

```powershell
DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/professors
```
