# geo_processor.py
import io
import json
from dataclasses import dataclass, field
from typing import Set, Optional, List

import geopandas as gpd
import pyproj
from shapely.geometry import shape
from fastapi import UploadFile, HTTPException


# --- Excepciones ---
class UnknownCRSError(Exception):
    pass

class GeoProcessingError(Exception):
    pass

class InvalidGeometryError(Exception):
    pass


# --- Resultado del procesamiento ---
@dataclass
class ProcessedGeoResult:
    gdf: gpd.GeoDataFrame
    geometry_types: Set[str]
    original_crs: Optional[str]
    target_crs: str
    warnings: List[str] = field(default_factory=list)


class GeoJSONProcessor:
    ALLOWED_GEOMETRIES = {
        "Point", "LineString", "Polygon",
        "MultiPoint", "MultiLineString", "MultiPolygon"
    }
    TARGET_EPSG = 4326

    async def process(self, file: UploadFile, source_epsg: Optional[int] = None) -> ProcessedGeoResult:
        if not file.filename.lower().endswith((".geojson", ".json")):
            raise HTTPException(status_code=400, detail="Extensión inválida. Usa .geojson o .json")

        warnings = []
        try:
            file_content = await file.read()
            json_data = json.loads(file_content)

            # 1. FIX: Detectar si es una lista cruda (Array) de features
            if isinstance(json_data, list):
                # Verificar que el primer elemento parezca una feature
                if len(json_data) > 0 and isinstance(json_data[0], dict) and 'geometry' in json_data[0]:
                    json_data = {
                        "type": "FeatureCollection",
                        "features": json_data
                    }
                    warnings.append("Se detectó lista de features, se normalizó a FeatureCollection.")
                else:
                    raise GeoProcessingError("El archivo es una lista pero no contiene features GeoJSON válidas.")

            # 2. Validar estructura FeatureCollection
            if not isinstance(json_data, dict):
                raise GeoProcessingError("El archivo debe ser un objeto JSON o una lista de features.")
                
            if "features" not in json_data:
                raise GeoProcessingError("El archivo no contiene la clave 'features'")

            features = json_data["features"]
            if not isinstance(features, list):
                raise GeoProcessingError("La clave 'features' debe ser una lista")

            # 3. Procesar features de forma robusta (Evita errores con 'id' de Overpass)
            properties_list = []
            geometries_list = []
            skipped = 0
            
            for feature in features:
                try:
                    if not isinstance(feature, dict):
                        skipped += 1; continue
                        
                    geom_dict = feature.get("geometry")
                    if not geom_dict:
                        skipped += 1; continue
                        
                    # Convertir a objeto Shapely real
                    geom = shape(geom_dict)
                    if geom.is_empty or not geom.is_valid:
                        skipped += 1; continue
                        
                    geometries_list.append(geom)
                    # Extraer propiedades (ignorar 'id' de la raíz)
                    properties_list.append(feature.get("properties", {}) or {})
                    
                except Exception:
                    skipped += 1
                    continue

            if skipped > 0:
                warnings.append(f"Se omitieron {skipped} features inválidas")

            if not geometries_list:
                raise GeoProcessingError("No se encontraron geometrías válidas en el archivo.")

            # 4. Crear GeoDataFrame
            gdf = gpd.GeoDataFrame(properties_list, geometry=geometries_list)
            
            # 5. Forzar CRS a 4326 si no lo tiene
            if gdf.crs is None:
                gdf.set_crs(epsg=4326, inplace=True)
                warnings.append("CRS no especificado, se asumió EPSG:4326")

            original_crs = gdf.crs.to_string()

            # 6. Gestión de CRS
            gdf = self._ensure_crs(gdf, original_crs, source_epsg)

            # 7. Validación de geometría
            geometry_types = self._detect_geometry_types(gdf)
            self._validate_geometry_types(geometry_types)

            return ProcessedGeoResult(
                gdf=gdf,
                geometry_types=geometry_types,
                original_crs=original_crs,
                target_crs=f"EPSG:{self.TARGET_EPSG}",
                warnings=warnings
            )

        except json.JSONDecodeError as e:
            raise GeoProcessingError(f"JSON inválido: {str(e)}")
        except (UnknownCRSError, InvalidGeometryError, GeoProcessingError, HTTPException):
            raise
        except Exception as e:
            import traceback
            print(f"ERROR DETALLADO: {type(e).__name__}: {str(e)}")
            traceback.print_exc()
            raise GeoProcessingError(f"Error inesperado: {str(e)}")

    def _ensure_crs(self, gdf, original_crs, source_epsg):
        # (Mantén tu lógica de CRS aquí, es correcta)
        if source_epsg:
            if gdf.crs is None:
                gdf.set_crs(epsg=source_epsg, inplace=True)
            else:
                gdf = gdf.to_crs(epsg=source_epsg)
        
        if gdf.crs is None:
             gdf.set_crs(epsg=4326, inplace=True)
        
        if gdf.crs.to_epsg() != self.TARGET_EPSG:
            gdf = gdf.to_crs(epsg=self.TARGET_EPSG)
        return gdf

    def _detect_geometry_types(self, gdf):
        return set(gdf.geometry.geom_type.dropna().unique())

    def _validate_geometry_types(self, geometry_types):
        invalid = geometry_types - self.ALLOWED_GEOMETRIES
        if invalid:
            raise InvalidGeometryError(f"Geometrías no soportadas: {', '.join(invalid)}")