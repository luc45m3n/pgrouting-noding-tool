import json
from fastapi import FastAPI, UploadFile, Form, File, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from geo_processor import GeoJSONProcessor, UnknownCRSError, GeoProcessingError, InvalidGeometryError


app = FastAPI(title="API de Procesamiento Geoespacial")

# Servir archivos estáticos (frontend) desde la carpeta 'static'
app.mount("/static", StaticFiles(directory="static"), name="static")

geo_processor = GeoJSONProcessor()

@app.post("/api/v1/geojson/process", status_code=status.HTTP_200_OK)
async def process_geojson_endpoint(
    file: UploadFile = File(..., max_size=50 * 1024 * 1024, description="Archivo GeoJSON (Máx 50MB)"),
    source_epsg: int | None = Form(default=None, description="Código EPSG de origen si el archivo no lo declara")
):
    try:
        result = await geo_processor.process(file=file, source_epsg=source_epsg)
        
        # 1. Simplificar geometrías para que el frontend no se congele con archivos pesados
        # (tolerancia de 0.01 grados, aprox 1km en el ecuador)
        gdf_simplified = result.gdf.copy()
        gdf_simplified.geometry = gdf_simplified.geometry.simplify(tolerance=0.01)
        
        # 2. Convertir a GeoJSON y luego a diccionario Python
        try:
            geojson_dict = json.loads(gdf_simplified.to_json())
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error al serializar GeoJSON: {str(e)}")

        return {
            "status": "success",
            "data": {
                "original_crs": result.original_crs,
                "target_crs": result.target_crs,
                "geometry_types": list(result.geometry_types),
                "feature_count": len(result.gdf),
                "bounds": [round(b, 4) for b in result.gdf.total_bounds.tolist()],
                "geojson_data": geojson_dict  # <-- AQUÍ enviamos los datos al mapa
            },
            "warnings": result.warnings
        }

    except UnknownCRSError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "CRS Desconocido",
                "message": str(e),
                "suggested_actions": ["provide_epsg", "change_file", "cancel"]
            }
        )
    except (InvalidGeometryError, GeoProcessingError, HTTPException) as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno del servidor")

@app.get("/")
async def read_root():
    return FileResponse("static/index.html")