# pgRouting Noding Tool

Herramienta especializada para el procesamiento de redes espaciales mediante `pgRouting`.

## 🚀 Propósito
Esta herramienta automatiza el flujo de trabajo de "Noding" (limpieza y topología) de geometrías lineales en bases de datos PostgreSQL, facilitando la ejecución de algoritmos de rutas (Dijkstra, TSP).

## 📂 Estructura del Sistema
* `geo_processor.py`: Motor de conversión de GeoJSON a topología compatible con pgRouting.
* `network_processor.py`: Lógica central para la generación de nodos (`pgr_nodenetwork`).
* `database.py`: Manejador de conexiones con PostGIS.
* `i18n.py`: Soporte multilingüe para la interfaz.

## 🛠 Instalación
1. Configurar la base de datos:
   ```bash
   ./scripts/setup-postgis.sh
