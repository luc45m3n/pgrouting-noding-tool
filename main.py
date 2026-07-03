# main.py
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import json

from geo_processor import GeoJSONProcessor, UnknownCRSError, GeoProcessingError, InvalidGeometryError
from network_processor import NetworkProcessor, NetworkProcessingError
from database import (
    get_network_geojson,
    get_nearest_node,
    calculate_shortest_path,
    calculate_tsp_route,
    get_network_stats,
    check_health
)
from i18n import i18n
# ============================================================
# 🆕 INICIALIZACIÓN AUTOMÁTICA DE POSTGRESQL Y BD
# ============================================================
from db_init import init_database

# Ejecutar al arrancar la app
if not init_database():
    print(i18n.t("log.database_init_error"))

# ============================================================
# CONFIGURACIÓN DE LA APLICACIÓN
# ============================================================
app = FastAPI(title="WebGIS Routing API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)

geo_processor = GeoJSONProcessor()
network_processor = NetworkProcessor()
init_database()

# ============================================================
# MODELOS
# ============================================================
class ShortestPathRequest(BaseModel):
    start_node: int
    end_node: int

class TSPRequest(BaseModel):
    waypoints: List[int]
    start_node: Optional[int] = None

# ==========================================
# ENDPOINTS: VISUALIZACIÓN
# ==========================================
@app.post("/api/v1/geojson/process", status_code=status.HTTP_200_OK)
async def process_geojson_endpoint(
    file: UploadFile = File(..., max_size=50 * 1024 * 1024),
    source_epsg: Optional[int] = Form(default=None)
):
    try:
        result = await geo_processor.process(file=file, source_epsg=source_epsg)
        
        # Simplificar geometrías
        gdf_simplified = result.gdf.copy()
        gdf_simplified.geometry = gdf_simplified.geometry.simplify(tolerance=0.01)
        
        geojson_dict = json.loads(gdf_simplified.to_json())
        
        # 🔍 Detectar si hay líneas
        geometry_types = set(result.geometry_types)
        has_lines = bool(geometry_types & {'LineString', 'MultiLineString'})
        
        print(i18n.t("log.geometry_types_detected", geometry_types=geometry_types))
        print(i18n.t("log.has_lines", has_lines=has_lines))
        
        return {
            "status": i18n.t("log.success"),
            "data": {
                "original_crs": result.original_crs,
                "target_crs": result.target_crs,
                "geometry_types": list(geometry_types),
                "feature_count": len(result.gdf),
                "bounds": [round(b, 4) for b in result.gdf.total_bounds.tolist()],
                "geojson_data": geojson_dict,
                "has_lines": has_lines  
            },
            "warnings": result.warnings
        }

    except UnknownCRSError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": i18n.t("log.unknown_crs"),
                "message": str(e),
                "suggested_actions": ["provide_epsg", "change_file", "cancel"]
            }
        )
    except (InvalidGeometryError, GeoProcessingError) as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=i18n.t("log.internal_error", error=str(e))
        )
# ============================================================
# ENDPOINT: CARGAR RED GEOJSON
# ============================================================
@app.post("/api/networks/load")
async def load_network(file: UploadFile = File(...)):
    """Recibe GeoJSON, valida líneas, crea tabla en PostGIS, nodea, topologiza."""
    try:
        content = await file.read()
        geojson_data = json.loads(content)
        result = network_processor.process_network(geojson_data)
        return result
    except json.JSONDecodeError:
        raise HTTPException(400, i18n.t("log.invalid_json"))
    except NetworkProcessingError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, i18n.t("log.internal_error", error=str(e)))


@app.get("/api/networks")
async def list_networks():
    try:
        networks = network_processor.list_networks()
        
        # Asegurar que networks sea una lista
        if not isinstance(networks, list):
            networks = []
        
        return {"networks": networks}
        
    except Exception as e:
        import traceback
        print(f"Error listing networks:")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@app.delete("/api/networks/{table_name}")
def delete_network(table_name: str):
    if not network_processor.network_exists(table_name):
        raise HTTPException(404, i18n.t("log.network_not_found"))
    network_processor.delete_network(table_name)
    return {"status": i18n.t("log.success"), "message": i18n.t("log.network_deleted", network_id=table_name)}


# ============================================================
# ENDPOINTS: RUTEO (todos usan table_name en la URL)
# ============================================================
@app.get("/api/networks/{table_name}/geojson")
def network_geojson(table_name: str):
    if not network_processor.network_exists(table_name):
        raise HTTPException(404, i18n.t("log.network_not_found"))
    return get_network_geojson(table_name)


@app.get("/api/networks/{table_name}/nearest-node")
def nearest_node(table_name: str, lon: float, lat: float):
    if not network_processor.network_exists(table_name):
        raise HTTPException(404, i18n.t("log.network_not_found"))
    try:
        return get_nearest_node(table_name, lon, lat)
    except ValueError as e:
        raise HTTPException(400, i18n.t("log.invalid_coordinates"))


@app.post("/api/networks/{table_name}/shortest-path")
def shortest_path(table_name: str, req: ShortestPathRequest):
    if not network_processor.network_exists(table_name):
        raise HTTPException(404, i18n.t("log.network_not_found"))
    try:
        return calculate_shortest_path(table_name, req.start_node, req.end_node)
    except ValueError as e:
        raise HTTPException(400, i18n.t("log.shortest_path_error", error=str(e)))


@app.post("/api/networks/{table_name}/tsp")
def tsp_route(table_name: str, req: TSPRequest):
    if not network_processor.network_exists(table_name):
        raise HTTPException(404, i18n.t("log.network_not_found"))
    try:
        return calculate_tsp_route(table_name, req.waypoints, req.start_node)
    except ValueError as e:
        raise HTTPException(400, i18n.t("log.tsp_error", error=str(e)))


@app.get("/api/networks/{table_name}/stats")
def network_stats(table_name: str):
    if not network_processor.network_exists(table_name):
        raise HTTPException(404, i18n.t("log.network_not_found"))
    return get_network_stats(table_name)


class ProcessNetworkRequest(BaseModel):
    geojson: dict
    target_epsg: int = 32719
    tolerance: float = 0.5
    snap_tolerance: float = 0.0          # NUEVO
    simplify_tolerance: float = 0.0      # NUEVO


@app.post("/api/networks/process")
async def process_network_from_geojson(request: ProcessNetworkRequest):
    """Procesa un GeoJSON ya cargado como red ruteable."""
    try:
        print(f"\n{'='*60}")
        print(f" Procesando red desde GeoJSON")
        print(f"🎯 EPSG destino: {request.target_epsg}")
        print(f"📏 Tolerancia: {request.tolerance}m")
        print(f"{'='*60}")
        
        result = network_processor.process_network(
            geojson_data=request.geojson,
            target_epsg=request.target_epsg,
            tolerance=request.tolerance,
            snap_tolerance=request.snap_tolerance,
            simplify_tolerance=request.simplify_tolerance
        )
        
        print(f"✅ Red procesada: {result}")
        print(f"{'='*60}\n")
        
        return result
        
    except Exception as e:
        print(i18n.t("log.processing_network_error", error=str(e)))
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=i18n.t("log.internal_error", error=str(e)))

# ============================================================
# ENDPOINT: HEALTH
# ============================================================
@app.get("/health")
def health():
    return check_health()


# ============================================================
# FRONTEND
# ============================================================
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def read_root():
    return FileResponse("static/index.html")