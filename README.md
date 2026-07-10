# Professor Catalog API

FastAPI backend for scraping the Marist faculty catalog into Postgres and serving professor data to a frontend.

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
   uvicorn app.main:app --reload
   ```

5. Sync the catalog:

   ```powershell
   Invoke-RestMethod -Method Post `
     -Uri http://127.0.0.1:8000/admin/sync-catalog `
     -Headers @{ "X-Admin-Token" = "change-me" }
   ```

6. Browse:

   - API docs: <http://127.0.0.1:8000/docs>
   - Professors: <http://127.0.0.1:8000/professors>

## Docker

Build and run the backend plus Postgres:

```powershell
docker compose up --build
```

The backend container listens on <http://127.0.0.1:8000>. Inside Docker, it connects to Postgres at `db:5432`; from the host, Postgres is still available on `127.0.0.1:5433`.

### Catalog WAF fallback

The live catalog URL can return an AWS WAF JavaScript challenge to backend HTTP clients. When that happens, save the Faculty catalog page HTML from a browser into `data/faculty.html`, then set this in `.env`:

```powershell
CATALOG_HTML_PATH=/app/data/faculty.html
```

Restart the backend:

```powershell
docker compose up -d --build backend
```

The admin sync endpoint will then parse the saved HTML snapshot instead of fetching the WAF-blocked live URL.

## Data Source

The Marist catalog page is server-rendered HTML. Each professor entry is parsed from a paragraph with a `<strong>` name/year line and an `<em>` title line. The scraper stores name, title, category, source URL, and sync timestamps.

## Frontend

The React frontend lives in `frontend/` and expects the FastAPI backend at `http://127.0.0.1:8000`.

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Open <http://localhost:5173> for the professor directory. The admin sync page is at <http://localhost:5173/admin> and uses the backend `ADMIN_API_KEY` as `X-Admin-Token`.

The RateMyProfessors exploration page is at <http://localhost:5173/rmp>. It calls:

```txt
GET /rmp/professors?school_id=563&page_size=20&q=
```

`563` is the RateMyProfessors school ID for Marist College.

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
