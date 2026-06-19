# network_processor.py
import uuid
import json
from contextlib import contextmanager
from typing import Dict, Any, List, Tuple, Optional

import psycopg2
import geopandas as gpd
from shapely.geometry import shape, LineString, MultiLineString
from shapely.ops import linemerge
from dotenv import load_dotenv
import os

load_dotenv()

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "database": os.getenv("DB_NAME", "caminos"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASS", "postgres"),
    "port": os.getenv("DB_PORT", "5432"),
}


class NetworkProcessingError(Exception):
    pass


class NetworkProcessor:
    """
    Procesa un GeoJSON de líneas y lo convierte en una red ruteable en PostGIS.
    """
    
    ROUTABLE_HIGHWAYS = {
        'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
        'unclassified', 'residential', 'living_street', 'service',
        'motorway_link', 'trunk_link', 'primary_link', 'secondary_link',
        'tertiary_link', 'pedestrian', 'footway', 'path', 'cycleway'
    }
    
    def __init__(self):
        self.db_config = DB_CONFIG
    
    @contextmanager
    def _get_connection(self):
        conn = None
        try:
            conn = psycopg2.connect(**self.db_config)
            yield conn
            conn.commit()
        except Exception as e:
            if conn:
                conn.rollback()
            raise e
        finally:
            if conn:
                conn.close()
    
    def _generate_table_name(self, prefix: str = "net") -> str:
        return f"{prefix}_{uuid.uuid4().hex[:8]}"
    
    def validate_geojson(self, geojson_data: Dict) -> Tuple[bool, str, int]:
        if not isinstance(geojson_data, dict):
            return False, "El archivo no es un JSON válido", 0
        
        if geojson_data.get("type") != "FeatureCollection":
            return False, "El JSON no es un FeatureCollection", 0
        
        features = geojson_data.get("features", [])
        if not features:
            return False, "El FeatureCollection está vacío", 0
        
        line_count = 0
        for f in features:
            geom = f.get("geometry", {})
            if geom.get("type") in ("LineString", "MultiLineString"):
                line_count += 1
        
        if line_count == 0:
            return False, "El archivo no contiene geometrías LineString/MultiLineString", 0
        
        return True, f"GeoJSON válido: {line_count} líneas detectadas", line_count
    
    def _parse_geojson_to_gdf(self, geojson_data: Dict, target_epsg: int) -> gpd.GeoDataFrame:
        features = geojson_data.get("features", [])
        
        properties_list = []
        geometries_list = []
        
        for f in features:
            geom_dict = f.get("geometry")
            if not geom_dict:
                continue
            if geom_dict.get("type") not in ("LineString", "MultiLineString"):
                continue
            
            try:
                geom = shape(geom_dict)
                if geom.is_empty:
                    continue
                
                if geom.geom_type == "MultiLineString":
                    merged = linemerge(geom)
                    if merged.geom_type == "LineString":
                        geom = merged
                    else:
                        geom = list(geom.geoms)[0]
                
                geometries_list.append(geom)
                props = f.get("properties", {}) or {}
                properties_list.append(props)
            except Exception:
                continue
        
        if not geometries_list:
            raise NetworkProcessingError("No se pudieron extraer geometrías válidas")
        
        gdf = gpd.GeoDataFrame(properties_list, geometry=geometries_list, crs="EPSG:4326")
        gdf = gdf.to_crs(epsg=target_epsg)
        
        return gdf
    
    def process_network(
        self,
        geojson_data: Dict,
        target_epsg: int = 32719,
        tolerance: float = 0.5
    ) -> Dict[str, Any]:
        # 1. Validar
        is_valid, message, line_count = self.validate_geojson(geojson_data)
        if not is_valid:
            raise NetworkProcessingError(message)
        
        # 2. Parsear y reproyectar
        gdf = self._parse_geojson_to_gdf(geojson_data, target_epsg)
        
        # 3. Generar nombre único
        table_name = self._generate_table_name()
        edges_table = f"{table_name}_edges"
        noded_table = f"{edges_table}_noded"
        vertices_table = f"{noded_table}_vertices_pgr"
        
        # 4. Cargar a PostGIS
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"DROP TABLE IF EXISTS {edges_table};")
                
                cur.execute(f"""
                    CREATE TABLE {edges_table} (
                        gid SERIAL PRIMARY KEY,
                        source INTEGER,
                        target INTEGER,
                        cost DOUBLE PRECISION,
                        reverse_cost DOUBLE PRECISION,
                        highway VARCHAR(50),
                        name VARCHAR(255),
                        oneway VARCHAR(10),
                        the_geom geometry(LineString, {target_epsg})
                    );
                """)
                
                inserted = 0
                for _, row in gdf.iterrows():
                    geom = row.geometry
                    length = geom.length
                    
                    oneway = str(row.get('oneway', 'no')).lower()
                    reverse_cost = -1 if oneway == 'yes' else length
                    
                    highway = str(row.get('highway', ''))[:50] if row.get('highway') else None
                    name = str(row.get('name', ''))[:255] if row.get('name') else None
                    
                    # ✅ CORREGIDO: cast explícito de bytea a geometry
                    cur.execute(f"""
                        INSERT INTO {edges_table} 
                        (cost, reverse_cost, highway, name, oneway, the_geom)
                        VALUES (%s, %s, %s, %s, %s, ST_SetSRID(ST_GeomFromWKB(%s::bytea), %s))
                    """, (length, reverse_cost, highway, name, oneway, geom.wkb, target_epsg))
                    inserted += 1
                
                cur.execute(f"""
                    CREATE INDEX idx_{table_name}_geom 
                    ON {edges_table} USING GIST (the_geom);
                """)
        
        # 5. Ejecutar pgr_nodeNetwork (crea tabla _noded)
        print(f"🔧 Ejecutando pgr_nodeNetwork en {edges_table}...")
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT pgr_nodeNetwork(%s, %s, 'gid', 'the_geom');
                """, (edges_table, tolerance))
                print(f"✅ pgr_nodeNetwork ejecutado")
        
        # 5.5. 🔧 ADAPTAR estructura de la tabla _noded para pgRouting
        print(f"🔧 Adaptando estructura de {noded_table}...")
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                # Renombrar 'id' a 'gid' (pgRouting espera 'gid')
                cur.execute(f"""
                    ALTER TABLE {noded_table} 
                    RENAME COLUMN id TO gid;
                """)
                
                # Agregar columna cost (longitud en metros)
                cur.execute(f"""
                    ALTER TABLE {noded_table} 
                    ADD COLUMN IF NOT EXISTS cost DOUBLE PRECISION;
                """)
                
                # Agregar columna reverse_cost
                cur.execute(f"""
                    ALTER TABLE {noded_table} 
                    ADD COLUMN IF NOT EXISTS reverse_cost DOUBLE PRECISION;
                """)
                
                # Calcular costos (longitud en metros porque está en UTM)
                cur.execute(f"""
                    UPDATE {noded_table}
                    SET cost = ST_Length(the_geom),
                        reverse_cost = ST_Length(the_geom);
                """)
                
                print(f"✅ Estructura adaptada: gid, cost, reverse_cost agregados")
        
        # 6. Ejecutar pgr_createTopology sobre la tabla NODEADA
        print(f"🔧 Ejecutando pgr_createTopology en {noded_table}...")
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT pgr_createTopology(%s, %s, 'the_geom', 'gid');
                """, (noded_table, tolerance))
                print(f"✅ pgr_createTopology ejecutado")
        
        # 7. Obtener estadísticas
        print(f"📊 Obteniendo estadísticas...")
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"SELECT COUNT(*) FROM {noded_table};")
                edges_count = cur.fetchone()[0]
                
                cur.execute(f"SELECT COUNT(*) FROM {vertices_table};")
                vertices_count = cur.fetchone()[0]
        return {
            "status": "success",
            "table_name": noded_table,
            "edges_table": noded_table,
            "vertices_table": vertices_table,
            "edges": edges_count,
            "vertices": vertices_count,
            "target_epsg": target_epsg,
            "tolerance": tolerance,
            "message": f"Red creada: {edges_count} aristas, {vertices_count} vértices"
        }    
    
    
    def delete_network(self, table_name: str) -> bool:
        """Elimina una red y TODAS sus tablas asociadas."""
        # Normalizar a network_id base
        network_id = table_name
        if network_id.endswith("_edges_noded"):
            network_id = network_id.replace("_edges_noded", "")
        elif network_id.endswith("_edges"):
            network_id = network_id.replace("_edges", "")
        
        tables_to_drop = [
            f"{network_id}_edges_noded_vertices_pgr",
            f"{network_id}_edges_noded",
            f"{network_id}_edges",
        ]
        
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                for table in tables_to_drop:
                    cur.execute(f"DROP TABLE IF EXISTS {table};")
        
        return True
    
    def list_networks(self) -> List[Dict]:
        """Lista todas las redes completas (con tabla de vértices)."""
        networks = []
        
        # PASO A: Obtener lista de tablas nodeadas
        noded_tables = []
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT table_name 
                        FROM information_schema.tables 
                        WHERE table_name LIKE 'net_%_edges_noded'
                        ORDER BY table_name;
                    """)
                    noded_tables = [row[0] for row in cur.fetchall()]
        except Exception as e:
            print(f"❌ Error listando tablas: {e}")
            return networks
        
        # PASO B: Para cada tabla, verificar que esté COMPLETA
        for noded_table in noded_tables:
            vertices_table = f"{noded_table}_vertices_pgr"
            network_id = noded_table.replace("_edges_noded", "")
            
            try:
                with self._get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            SELECT EXISTS (
                                SELECT FROM information_schema.tables 
                                WHERE table_name = %s
                            );
                        """, (vertices_table,))
                        
                        if not cur.fetchone()[0]:
                            print(f"⚠️ Red incompleta (sin vértices): {network_id}")
                            continue
                        
                        cur.execute(f"SELECT COUNT(*) FROM {noded_table};")
                        edges = cur.fetchone()[0]
                        
                        cur.execute(f"SELECT COUNT(*) FROM {vertices_table};")
                        vertices = cur.fetchone()[0]
                        
                        networks.append({
                            "table_name": noded_table,
                            "network_id": network_id,
                            "edges": edges,
                            "vertices": vertices
                        })
            except Exception as e:
                print(f"⚠️ Error leyendo red {network_id}: {e}")
                continue
        
        return networks
    
    def network_exists(self, table_name: str) -> bool:
        """Verifica si una red existe (busca la tabla nodeada)."""
        if table_name.endswith("_edges_noded"):
            noded_table = table_name
        elif table_name.endswith("_edges"):
            noded_table = f"{table_name}_noded"
        else:
            noded_table = f"{table_name}_edges_noded"
        
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = %s
                    );
                """, (noded_table,))
                return cur.fetchone()[0]