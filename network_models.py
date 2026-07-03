# network_models.py
"""Modelos Pydantic para el procesamiento de redes viales."""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any


class NetworkProcessRequest(BaseModel):
    """Request para procesar una red vial."""
    geojson: Dict[str, Any] = Field(..., description="GeoJSON FeatureCollection")
    tolerance: float = Field(
        default=0.5, 
        ge=0.01, 
        le=100.0,
        description="Tolerancia en metros para nodeado (0.01 a 100)"
    )
    utm_epsg: Optional[int] = Field(
        default=None,
        description="EPSG UTM local. Default: 32719 (Bariloche)"
    )


class NetworkProcessResponse(BaseModel):
    """Response del procesamiento de red."""
    status: str
    network_id: str
    original_features: int
    filtered_features: int
    edges: int
    segments: int
    vertices: int
    connected_edges: int
    srid: int
    tolerance_m: float
    tables: Dict[str, str]