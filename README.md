Here is a complete `README.md` you can use for the project:

---

# pgRouting Noding Tool

A web application that automates the transformation of raw GeoJSON line data into
topologically sound, routable networks inside a PostGIS/pgRouting database.
It solves the classic "noding" problem — ensuring that intersecting lines are split
at their intersection points so that routing algorithms (Dijkstra, TSP) can traverse
the graph correctly.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)

---

## Features

- **GeoJSON Upload & Validation** — Accepts `.geojson` / `.json` files up to 50 MB.
  Handles raw feature arrays, normalizes them to `FeatureCollection`, and skips
  invalid geometries with warnings.
- **CRS Detection & Reprojection** — Automatically detects the source coordinate
  reference system and reprojects to a target UTM zone (default EPSG:32719) for
  metric operations.
- **Noding Pipeline** — Two modes:
  - *Simple*: uses `pgr_nodeNetwork` to split edges at intersections.
  - *Advanced*: applies `ST_Snap → ST_Union → ST_Node → ST_Dump` for robust
    handling of near-miss intersections.
- **Topology Creation** — Runs `pgr_createTopology` to assign `source`/`target`
  node IDs to every edge.
- **Shortest Path (Dijkstra)** — Finds the optimal undirected route between two
  graph vertices.
- **TSP (Traveling Salesperson)** — Optimizes a multi-stop route using
  `pgr_TSP` + `pgr_dijkstraCostMatrix`.
- **Nearest Node Lookup** — Snaps a map click (lon/lat) to the closest graph vertex.
- **Network Management** — List, inspect stats, and delete stored networks via REST.
- **Interactive Map UI** — Leaflet.js single-page application with file upload,
  layer management, draggable routing panel, and i18n support.
- **Auto Database Init** — On startup, the app verifies PostgreSQL is running,
  creates the target database if missing, and enables the `postgis` and `pgrouting`
  extensions automatically.

---

## Architecture

```bash
┌─────────────────────────────────┐
│  Browser (Leaflet.js SPA)       │
│  app.js · menu_principal.js     │
│  routing_panel.js · i18n.js     │
└────────────┬────────────────────┘
             │ HTTP / REST
┌────────────▼────────────────────┐
│  FastAPI Server  (main.py)      │
│  GeoJSONProcessor               │
│  NetworkProcessor               │
└────────────┬────────────────────┘
             │ psycopg2
┌────────────▼────────────────────┐
│  PostgreSQL + PostGIS           │
│  + pgRouting                    │
│  database: caminos              │
└─────────────────────────────────┘
```

---

## Requirements

| Dependency | Minimum Version |
|---|---|
| Python | 3.10+ |
| PostgreSQL | 14+ |
| PostGIS | 3+ |
| pgRouting | 3+ |

Python packages (see `requirements.txt`):

```
fastapi>=0.110.0
uvicorn>=0.29.0
python-multipart>=0.0.9
geopandas>=0.14.0
shapely>=2.0.0
pyproj>=3.6.0
psycopg2
dotenv
```

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/luc45m3n/pgrouting-noding-tool.git
cd pgrouting-noding-tool
```

### 2. Set up PostgreSQL, PostGIS, and pgRouting

Run the provided setup script (Debian/Ubuntu):

```bash
chmod +x setup-postgis.sh
./setup-postgis.sh
```

This script installs `postgresql`, `postgis`, and `postgresql-14-pgrouting`,
starts the service, and creates a `georouter` database with both extensions enabled.

> **Note:** The application itself targets a database named `caminos` by default
> (configurable via environment variables). The `db_init.py` module will create
> it and enable extensions automatically on first startup.

### 3. Create a Python virtual environment and install dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## Configuration

Create a `.env` file in the project root (all values have defaults):

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=caminos
DB_USER=postgres
DB_PASS=postgres
```

---

## Running the Application

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Open your browser at `http://localhost:8000`.

The API documentation (Swagger UI) is available at `http://localhost:8000/docs`.

---

## API Reference

### Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Check database connectivity |

### GeoJSON Processing (preview only, no DB write)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/geojson/process` | Validate, reproject, and preview a GeoJSON file |

**Form fields:**
- `file` — `.geojson` or `.json` file (required)
- `source_epsg` — Override source CRS (optional integer)

**Response includes:** `original_crs`, `target_crs`, `geometry_types`,
`feature_count`, `bounds`, `geojson_data`, `has_lines`, `warnings`.

### Network Management

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/networks/load` | Upload GeoJSON, node it, and store as a routable network |
| `POST` | `/api/networks/process` | Process an already-loaded GeoJSON dict with advanced options |
| `GET` | `/api/networks` | List all stored networks |
| `DELETE` | `/api/networks/{table_name}` | Delete a network and all its associated tables |

**`POST /api/networks/process` body:**

```json
{
  "geojson": { ... },
  "target_epsg": 32719,
  "tolerance": 0.5,
  "snap_tolerance": 0.0,
  "simplify_tolerance": 0.0
}
```

- `tolerance` — Noding tolerance in meters (how close endpoints must be to merge).
- `snap_tolerance` — If > 0, activates the advanced noding pipeline (`ST_Snap`).
- `simplify_tolerance` — If > 0, simplifies geometries before noding.

### Routing

All routing endpoints require a `{table_name}` that matches a stored noded network.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/networks/{table_name}/geojson` | Export the noded network as GeoJSON |
| `GET` | `/api/networks/{table_name}/nearest-node?lon=&lat=` | Find the closest graph vertex to a coordinate |
| `POST` | `/api/networks/{table_name}/shortest-path` | Dijkstra shortest path between two nodes |
| `POST` | `/api/networks/{table_name}/tsp` | TSP optimized route through multiple waypoints |
| `GET` | `/api/networks/{table_name}/stats` | Edge and vertex counts for a network |

**`POST /api/networks/{table_name}/shortest-path` body:**

```json
{
  "start_node": 1,
  "end_node": 42
}
```

**`POST /api/networks/{table_name}/tsp` body:**

```json
{
  "waypoints": [1, 5, 12, 42],
  "start_node": 1
}
```

---

## Project Structure

```
pgrouting-noding-tool/
├── main.py                # FastAPI app, all REST endpoints
├── geo_processor.py       # GeoJSON validation, CRS detection, reprojection
├── network_processor.py   # Noding pipeline (pgr_nodeNetwork / advanced ST_Node)
├── database.py            # pgRouting queries: Dijkstra, TSP, nearest node
├── db_init.py             # Auto-init: starts PostgreSQL, creates DB, enables extensions
├── network_models.py      # Pydantic request/response models
├── i18n.py                # Internationalization helper
├── requirements.txt
├── setup-postgis.sh       # One-shot DB environment setup script
└── static/
    ├── index.html
    ├── app.js             # Leaflet map initialization and layer management
    ├── app.css
    ├── menu_principal.js  # Network management UI control
    ├── routing_panel.js   # Draggable routing panel (waypoints, TSP, Dijkstra)
    ├── routing_panel.css
    ├── control_capas.js   # Layer switcher control
    ├── desplegable_carga.js # File upload dropdown
    └── i18n.js            # Frontend translations
```

---

## How It Works

1. **Upload** — The user uploads a GeoJSON file via the Leaflet UI or the API.
2. **Validate** — `GeoJSONProcessor` checks the file structure, normalizes the CRS,
   and filters out non-line geometries.
3. **Reproject** — Geometries are reprojected to a metric UTM CRS for accurate
   distance calculations.
4. **Load to PostGIS** — A staging table (`net_<uuid>_edges`) is created and
   populated with the line features, including `cost` (length) and `reverse_cost`
   (respecting one-way attributes).
5. **Node** — Either `pgr_nodeNetwork` (simple) or `ST_Snap + ST_Node + ST_Dump`
   (advanced) splits edges at every intersection, producing a `_noded` table.
6. **Topology** — `pgr_createTopology` assigns `source` and `target` vertex IDs,
   creating the `_vertices_pgr` table.
7. **Route** — The frontend lets the user click two or more points on the map;
   the backend resolves them to the nearest graph vertices and runs `pgr_dijkstra`
   or `pgr_TSP`, returning the route geometry as GeoJSON.
```
