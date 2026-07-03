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
from i18n import i18n
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
        tolerance: float = 0.5,
        snap_tolerance: float = 0.0, 
        simplify_tolerance: float = 0.0,
         
    ) -> Dict[str, Any]:
        # 1. Validar
        is_valid, message, line_count = self.validate_geojson(geojson_data)
        if not is_valid:
            raise NetworkProcessingError(message)
        
        # 2. Parsear y reproyectar
        gdf = self._parse_geojson_to_gdf(geojson_data, target_epsg)
        
        # 3. Pre-procesamiento: simplificar si se solicita
        if simplify_tolerance > 0:
            print(i18n.t('log.simplifying', tolerance=simplify_tolerance))
            gdf.geometry = gdf.geometry.simplify(tolerance=simplify_tolerance)
        
        # 4. Pre-procesamiento: snap si se solicita
        if snap_tolerance > 0:
            print(i18n.t('log.snapping', tolerance=snap_tolerance))
            gdf.geometry = gdf.geometry.apply(
                lambda geom: self._snap_geometry(geom, snap_tolerance)
            )
        
        # 5. Generar nombre único
        table_name = self._generate_table_name()
        edges_table = f"{table_name}_edges"
        noded_table = f"{edges_table}_noded"
        vertices_table = f"{noded_table}_vertices_pgr"
        
        # 6. Cargar a PostGIS
        print(i18n.t('log.creating_table', table=edges_table))
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
                
                print(i18n.t('log.table_created', table=edges_table, count=inserted))
        
        # Verificar que la tabla existe antes de continuar
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = %s
                    );
                """, (edges_table,))
                exists = cur.fetchone()[0]
                
                if not exists:
                    raise NetworkProcessingError(f"La tabla {edges_table} no se creó correctamente")
                
                cur.execute(f"SELECT COUNT(*) FROM {edges_table};")
                count = cur.fetchone()[0]
                print(i18n.t('log.table_verified', table=edges_table, count=count))
        
        
            # 7. Decidir método de nodeo
            if snap_tolerance > 0:
                # Flujo avanzado: ya crea la tabla con gid, cost, reverse_cost
                print(i18n.t('log.advanced_noding', tolerance=snap_tolerance))
                self._advanced_node_network(edges_table, noded_table, tolerance, snap_tolerance)

                # Solo falta crear topología
                print(i18n.t('log.creating_topology', table=noded_table))
                with self._get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            SELECT pgr_createTopology(%s, %s, 'the_geom', 'gid');
                        """, (noded_table, tolerance))
                print(i18n.t('log.topology_created', table=noded_table))

            else:
                # Flujo simple: pgr_nodeNetwork
                print(i18n.t('log.executing_pgr_nodeNetwork', tolerance=tolerance))
                with self._get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            SELECT pgr_nodeNetwork(%s, %s, 'gid', 'the_geom');
                        """, (edges_table, tolerance))
                print(i18n.t('log.pgr_nodeNetwork_executed'))

                # Adaptar estructura de la tabla _noded
                print(i18n.t('log.adapting_structure', table=noded_table))
                with self._get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(f"ALTER TABLE {noded_table} RENAME COLUMN id TO gid;")
                        cur.execute(f"ALTER TABLE {noded_table} ADD COLUMN IF NOT EXISTS cost DOUBLE PRECISION;")
                        cur.execute(f"ALTER TABLE {noded_table} ADD COLUMN IF NOT EXISTS reverse_cost DOUBLE PRECISION;")
                        cur.execute(f"""
                            UPDATE {noded_table}
                            SET cost = ST_Length(the_geom),
                                reverse_cost = ST_Length(the_geom);
                        """)
                print(i18n.t('log.structure_adapted', table=noded_table))

                # Crear topología
                print(i18n.t('log.creating_topology', table=noded_table))
                with self._get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            SELECT pgr_createTopology(%s, %s, 'the_geom', 'gid');
                        """, (noded_table, tolerance))
                print(i18n.t('log.topology_created', table=noded_table))
        
        # 8. Obtener estadísticas
        print(i18n.t('log.fetching_statistics'))
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"SELECT COUNT(*) FROM {noded_table};")
                edges_count = cur.fetchone()[0]
                
                cur.execute(f"SELECT COUNT(*) FROM {vertices_table};")
                vertices_count = cur.fetchone()[0]
        
            
        # 9. Crear topología
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT pgr_createTopology(%s, %s, 'the_geom', 'gid');
                """, (noded_table, tolerance))
        
        # 10. Obtener estadísticas
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
                "snap_tolerance": snap_tolerance,
                "simplify_tolerance": simplify_tolerance,
                "message": f"Red creada: {edges_count} aristas, {vertices_count} vértices"
            }
    
    def _snap_geometry(self, geom, tolerance):
        """Aplica snapping a una geometría."""
        from shapely.ops import snap
        # Snap a una grícula virtual
        coords = list(geom.coords)
        snapped_coords = [
            (round(x / tolerance) * tolerance, round(y / tolerance) * tolerance)
            for x, y in coords
        ]
        return LineString(snapped_coords)
    
    def _advanced_node_network(self, edges_table, noded_table, tolerance, snap_tolerance):
        """
        Nodeo avanzado robusto:
        ST_Snap → ST_Union (corta en intersecciones) → ST_Dump
        """
        print(i18n.t('log.advanced_noding', snap_tolerance=snap_tolerance, tolerance=tolerance))

        with self._get_connection() as conn:
            with conn.cursor() as cur:
                # PASO 1: Snapear líneas
                temp_snapped = f"{edges_table}_snapped"
                cur.execute(f"DROP TABLE IF EXISTS {temp_snapped};")

                if snap_tolerance > 0:
                    cur.execute(f"""
                        CREATE TABLE {temp_snapped} AS
                        SELECT 
                            e.gid,
                            ST_Snap(
                                e.the_geom, 
                                c.collected_geom, 
                                {snap_tolerance}
                            ) AS the_geom
                        FROM {edges_table} e,
                             (SELECT ST_Collect(the_geom) AS collected_geom FROM {edges_table}) c;
                    """)
                    print(i18n.t('log.snap_applied', tolerance=snap_tolerance))
                else:
                    cur.execute(f"""
                        CREATE TABLE {temp_snapped} AS
                        SELECT gid, the_geom FROM {edges_table};
                    """)

                cur.execute(f"CREATE INDEX ON {temp_snapped} USING GIST (the_geom);")

                # PASO 2: Unir todas las líneas y cortar en intersecciones con ST_Node + ST_Dump
                # ST_Node crea nodos en todas las intersecciones
                # ST_Dump extrae las líneas individuales resultantes
                cur.execute(f"DROP TABLE IF EXISTS {noded_table};")
                cur.execute(f"""
                    CREATE TABLE {noded_table} AS
                    SELECT 
                        ROW_NUMBER() OVER () AS gid,
                        geom AS the_geom
                    FROM (
                        SELECT (ST_Dump(ST_Node(ST_Union(the_geom)))).geom AS geom
                        FROM {temp_snapped}
                    ) AS dumped
                    WHERE geom IS NOT NULL
                      AND GeometryType(geom) = 'LINESTRING'
                      AND ST_Length(geom) >= 0.01;
                """)
                print(i18n.t('log.st_union_node_dump_applied'))

                # PASO 3: Preparar para pgRouting
                cur.execute(f"ALTER TABLE {noded_table} ADD COLUMN IF NOT EXISTS source INTEGER;")
                cur.execute(f"ALTER TABLE {noded_table} ADD COLUMN IF NOT EXISTS target INTEGER;")
                cur.execute(f"ALTER TABLE {noded_table} ADD COLUMN IF NOT EXISTS cost DOUBLE PRECISION;")
                cur.execute(f"ALTER TABLE {noded_table} ADD COLUMN IF NOT EXISTS reverse_cost DOUBLE PRECISION;")

                cur.execute(f"""
                    UPDATE {noded_table}
                    SET cost = ST_Length(the_geom),
                        reverse_cost = ST_Length(the_geom);
                """)

                cur.execute(f"CREATE INDEX ON {noded_table} USING GIST (the_geom);")

                # Limpiar tabla temporal
                cur.execute(f"DROP TABLE IF EXISTS {temp_snapped};")

                # Contar resultado
                cur.execute(f"SELECT COUNT(*) FROM {noded_table};")
                count = cur.fetchone()[0]
                print(i18n.t('log.edges_generated', count=count))

                if count == 0:
                    raise NetworkProcessingError(
                        "El nodeo avanzado no generó aristas. "
                        "Intentá reducir snap_tolerance o usar el método simple."
                    )
    
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
        networks = []

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
            print(f"Error listing tables: {e}")
            return networks  # ✅ Retorna lista vacía

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
                            print(f"⚠️ Incomplete network: {network_id}")
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
                print(f"⚠️ Error reading network {network_id}: {e}")
                continue
            
        return networks  # ✅ Siempre retorna lista
    
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