import io
from dataclasses import dataclass, field
from typing import Set, Optional, List, Tuple

import geopandas as gpd
import pyproj
from fastapi import UploadFile, HTTPException

# --- Excepciones Personalizadas ---
class UnknownCRSError(Exception):
    """Se lanza cuando el CRS no está definido y NO se puede inferir de forma segura."""
    pass

class InvalidGeometryError(Exception):
    """Se lanza cuando las geometrías no son del tipo esperado."""
    pass

class GeoProcessingError(Exception):
    """Excepción genérica para errores durante el procesamiento geoespacial."""
    pass

# --- Estructura de Datos de Salida ---
@dataclass
class ProcessedGeoResult:
    gdf: gpd.GeoDataFrame
    geometry_types: Set[str]
    original_crs: Optional[str]
    target_crs: str = "EPSG:4326"
    warnings: List[str] = field(default_factory=list)

# --- Clase Procesadora ---
class GeoJSONProcessor:
    ALLOWED_GEOMETRIES = {
        "Point", "LineString", "Polygon",
        "MultiPoint", "MultiLineString", "MultiPolygon"
    }
    TARGET_EPSG = 4326

    async def process(self, file: UploadFile, source_epsg: Optional[int] = None) -> ProcessedGeoResult:
        if not file.filename.lower().endswith((".geojson", ".json")):
            raise HTTPException(status_code=400, detail="El archivo debe tener extensión .geojson o .json")

        try:
            # Lectura segura en memoria
            file_content = await file.read()
            file_like_object = io.BytesIO(file_content)
            
            gdf = gpd.read_file(file_like_object)
            
            if gdf.empty:
                raise GeoProcessingError("El archivo GeoJSON está vacío o no contiene features válidas.")

            original_crs = gdf.crs.to_string() if gdf.crs else None

            # 1. Gestión de CRS (devuelve GDF y posible advertencia)
            gdf, processing_warning = self._ensure_crs(gdf, original_crs, source_epsg)
            warnings = [processing_warning] if processing_warning else []

            # 2. Validación de Geometría
            geometry_types = self._detect_geometry_types(gdf)
            self._validate_geometry_types(geometry_types)

            return ProcessedGeoResult(
                gdf=gdf,
                geometry_types=geometry_types,
                original_crs=original_crs,
                target_crs=f"EPSG:{self.TARGET_EPSG}",
                warnings=warnings
            )

        except pyproj.exceptions.CRSError as e:
            raise GeoProcessingError(f"Error de proyección (EPSG inválido): {str(e)}")
        except Exception as e:
            if isinstance(e, (UnknownCRSError, InvalidGeometryError, GeoProcessingError, HTTPException)):
                raise e
            raise GeoProcessingError(f"Error inesperado al procesar el GeoJSON: {str(e)}")

    def _is_likely_wgs84(self, gdf: gpd.GeoDataFrame) -> bool:
        """Heurística: Verifica si las coordenadas caen dentro del rango válido de EPSG:4326."""
        minx, miny, maxx, maxy = gdf.total_bounds
        return (minx >= -180.0 and maxx <= 180.0 and miny >= -90.0 and maxy <= 90.0)

    def _ensure_crs(self, gdf: gpd.GeoDataFrame, original_crs: Optional[str], source_epsg: Optional[int]) -> Tuple[gpd.GeoDataFrame, Optional[str]]:
        """Verifica, valida y gestiona la reproyección a EPSG:4326."""
        
        # CASO 1: El archivo YA declara un CRS
        if original_crs is not None:
            crs_obj = pyproj.CRS(original_crs)
            epsg_code = crs_obj.to_epsg()
            
            if epsg_code == self.TARGET_EPSG:
                if not self._is_likely_wgs84(gdf):
                    minx, miny, maxx, maxy = gdf.total_bounds
                    raise GeoProcessingError(
                        f"Inconsistencia: El archivo declara EPSG:4326, pero sus coordenadas "
                        f"(X: {minx:.2f} a {maxx:.2f}, Y: {miny:.2f} a {maxy:.2f}) están fuera del rango válido "
                        f"de WGS84. Probablemente sea un sistema proyectado mal etiquetado."
                    )
                return gdf, None 
            
            try:
                return gdf.to_crs(epsg=self.TARGET_EPSG), None
            except Exception as e:
                raise GeoProcessingError(f"Falló la reproyección a EPSG:4326: {str(e)}")

        # CASO 2: El archivo NO declara CRS, pero el usuario proporciona uno
        if source_epsg is not None:
            gdf = gdf.set_crs(epsg=source_epsg)
            try:
                return gdf.to_crs(epsg=self.TARGET_EPSG), None
            except Exception as e:
                raise GeoProcessingError(f"Falló la reproyección desde EPSG:{source_epsg}: {str(e)}")

        # CASO 3: No hay CRS y no se proporcionó source_epsg. Aplicamos heurística.
        if self._is_likely_wgs84(gdf):
            warning_msg = (
                "⚠️ El archivo no declara un sistema de coordenadas (CRS). "
                "Basado en el rango de coordenadas, el sistema asumió EPSG:4326 (WGS84). "
                "Por favor, verifica visualmente que los datos se ubiquen correctamente en el mapa."
            )
            return gdf.set_crs(epsg=self.TARGET_EPSG), warning_msg
        
        # CASO 4: Fuera de rango, imposible adivinar de forma segura.
        minx, miny, maxx, maxy = gdf.total_bounds
        raise UnknownCRSError(
            f"El archivo no declara un CRS y sus coordenadas (X: {minx:.2f} a {maxx:.2f}, Y: {miny:.2f} a {maxy:.2f}) "
            f"están fuera del rango de EPSG:4326. No se puede inferir de forma segura. "
            "Por favor, proporcione el parámetro 'source_epsg' (ej. 32718, 3857) o suba un archivo con el CRS correcto."
        )

    def _detect_geometry_types(self, gdf: gpd.GeoDataFrame) -> Set[str]:
        return set(gdf.geom_type.unique())

    def _validate_geometry_types(self, geometry_types: Set[str]) -> None:
        invalid_types = geometry_types - self.ALLOWED_GEOMETRIES
        if invalid_types:
            raise InvalidGeometryError(
                f"Tipos de geometría no soportados: {invalid_types}. "
                f"Permitidos: {', '.join(self.ALLOWED_GEOMETRIES)}"
            )