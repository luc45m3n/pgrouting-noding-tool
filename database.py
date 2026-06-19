import psycopg2
import os
import json
from contextlib import contextmanager
from typing import List, Dict, Any, Optional, Tuple
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "postgis"),
    "database": os.getenv("DB_NAME", "caminos"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASS", "postgres"),
    "port": os.getenv("DB_PORT", "5432"),
}


@contextmanager
def get_db_connection():
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        yield conn
        conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        raise e
    finally:
        if conn:
            conn.close()


# ============================================================
# FUNCIONES DE RUTEO (TODAS requieren table_name)
# ============================================================

def get_network_geojson(table_name: str) -> Dict:
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            query = f"""
                SELECT gid,
                ST_AsGeoJSON(ST_Transform(the_geom, 4326)) as geom
                FROM {table_name};
            """
            cur.execute(query)
            rows = cur.fetchall()

            features = []
            for row in rows:
                features.append({
                    "type": "Feature",
                    "geometry": json.loads(row[1]) if row[1] else None,
                    "properties": {"gid": row[0]}
                })

            return {"type": "FeatureCollection", "features": features}


def get_nearest_node(table_name: str, lon: float, lat: float) -> Dict[str, Any]:
    vertices_table = f"{table_name}_vertices_pgr"

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            query = f"""
                SELECT id,
                       ST_X(ST_Transform(the_geom, 4326)) as lon,
                       ST_Y(ST_Transform(the_geom, 4326)) as lat
                FROM {vertices_table}
                ORDER BY the_geom <-> ST_Transform(
                    ST_SetSRID(ST_MakePoint(%s, %s), 4326), 32719
                )
                LIMIT 1;
            """
            cur.execute(query, (lon, lat))
            row = cur.fetchone()

            if not row:
                raise ValueError("No se encontró nodo cercano")

            return {"id": int(row[0]), "lon": float(row[1]), "lat": float(row[2])}


def calculate_shortest_path(table_name: str, start_node: int, end_node: int) -> Dict[str, Any]:
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            query = f"""
                WITH ruteo AS (
                    SELECT edge
                    FROM pgr_dijkstra(
                        'SELECT gid AS id, source, target, ST_Length(the_geom) AS cost FROM {table_name}',
                        %s, %s, directed := false
                    )
                    WHERE edge != -1
                )
                SELECT ST_AsGeoJSON(ST_Transform(ST_Union(e.the_geom), 4326))::json AS geom
                FROM ruteo r
                JOIN {table_name} e ON r.edge = e.gid;
            """
            cur.execute(query, (start_node, end_node))
            row = cur.fetchone()

            if not row or row[0] is None:
                raise ValueError("No existe ruta conectada entre los puntos seleccionados")

            return {"geom": row[0]}


def calculate_tsp_route(table_name: str, waypoints: List[int], start_node: Optional[int] = None) -> Dict:
    if len(waypoints) < 2:
        raise ValueError("Se necesitan al menos 2 puntos para TSP")

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            waypoints_arr = ','.join(map(str, waypoints))
            start = start_node or waypoints[0]

            tsp_sql = f"""
                SELECT * FROM pgr_TSP(
                    $$SELECT start_vid, end_vid, agg_cost
                    FROM pgr_dijkstraCostMatrix(
                        'SELECT gid as id, source, target, ST_Length(the_geom) AS cost FROM {table_name}',
                        ARRAY[{waypoints_arr}],
                        false
                    )$$,
                    {start}
                )
            """
            cur.execute(tsp_sql)
            tsp_result = cur.fetchall()
            ordered_nodes = [row[1] for row in tsp_result if row[1] in waypoints]

            if len(ordered_nodes) < 2:
                raise ValueError("TSP no pudo determinar un orden válido")

            geojson_parts = []
            total_cost = 0.0

            for i in range(len(ordered_nodes) - 1):
                u, v = ordered_nodes[i], ordered_nodes[i + 1]
                seg_sql = f"""
                    WITH path AS (
                        SELECT seq, edge, cost
                        FROM pgr_dijkstra(
                            'SELECT gid as id, source, target, ST_Length(the_geom) AS cost FROM {table_name}',
                            %s, %s, false
                        )
                    )
                    SELECT ST_AsGeoJSON(ST_Transform(ST_Collect(r.the_geom ORDER BY p.seq), 4326))::json,
                           SUM(p.cost)
                    FROM path p
                    JOIN {table_name} r ON p.edge = r.gid
                    WHERE p.edge != -1;
                """
                cur.execute(seg_sql, (u, v))
                row = cur.fetchone()
                if row and row[0]:
                    geojson_parts.append(row[0])
                    total_cost += float(row[1]) if row[1] else 0

            return {
                "geojson": {
                    "type": "Feature",
                    "geometry": {"type": "GeometryCollection", "geometries": geojson_parts},
                    "properties": {}
                },
                "total_cost": total_cost,
                "tsp_order": ordered_nodes
            }


def get_network_stats(table_name: str) -> Dict:
    vertices_table = f"{table_name}_vertices_pgr"
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM {table_name}")
            edges = cur.fetchone()[0]
            cur.execute(f"SELECT COUNT(*) FROM {vertices_table}")
            vertices = cur.fetchone()[0]
            return {"edges": edges, "vertices": vertices}


def check_health() -> Dict:
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return {"status": "connected", "database": DB_CONFIG["database"]}
    except Exception as e:
        return {"status": "error", "error": str(e)}
