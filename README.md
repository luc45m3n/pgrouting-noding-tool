# 🗺️ Visor GeoJSON

Un WebGIS profesional para visualización, análisis y ruteo de datos geoespaciales, construido con Leaflet, FastAPI y PostgreSQL/PostGIS.

![Estado del Proyecto](https://img.shields.io/badge/estado-en%20desarrollo-yellow)
![Versión](https://img.shields.io/badge/versión-1.0.0-blue)
![Licencia](https://img.shields.io/badge/licencia-MIT-green)

## 📋 Tabla de Contenidos

- [Descripción](#-descripción)
- [Características](#-características)
- [Stack Tecnológico](#-stack-tecnológico)
- [Instalación](#-instalación)
- [Uso](#-uso)
- [Arquitectura](#-arquitectura)
- [Roadmap](#-roadmap)
- [Contribuciones](#-contribuciones)
- [Licencia](#-licencia)

## Descripción

**Visor GeoJSON Pro** es una aplicación web geoespacial que permite a usuarios cargar, visualizar y analizar datos geográficos en formato GeoJSON. La aplicación ofrece una interfaz intuitiva con un menú hamburguesa unificado, gestión avanzada de capas y capacidades de ruteo mediante pgRouting.

### Casos de Uso

- **Visualización de datos geoespaciales**: Carga archivos GeoJSON desde OpenStreetMap, QGIS u otras fuentes
- **Análisis de redes de transporte**: Genera topologías de ruteo para calles y caminos
- **Planificación urbana**: Visualiza y analiza infraestructura vial
- **Educación**: Herramienta didáctica para conceptos de SIG y ruteo

## Características

### ✅ Implementadas

#### Interfaz de Usuario
- **Menú hamburguesa unificado**: Interfaz limpia con todos los controles en un solo lugar
- **Gestión de mapas base**: Cambio entre OpenStreetMap y Satélite Esri
- **Control de capas avanzado**: 
  - Activar/desactivar capas
  - Reordenar capas (subir/bajar)
  - Zoom a extensión de capa
  - Eliminar capas
- **Popups interactivos**: Visualización de propiedades de features
- **Tooltips**: Información al pasar el cursor sobre features
- **Notificaciones toast**: Feedback visual de acciones

#### Procesamiento de Datos
- **Carga de GeoJSON**: Soporte para archivos `.geojson` y `.json`
- **Validación automática**: Detección de formatos y geometrías válidas
- **Reproyección automática**: Conversión a EPSG:4326 (WGS84)
- **Manejo de CRS desconocidos**: Opción para especificar EPSG de origen
- **Parser robusto**: Compatible con GeoJSON de Overpass Turbo y otras fuentes

#### 🗄️ Backend
- **API REST con FastAPI**: Endpoints eficientes y documentados
- **Procesamiento asíncrono**: Manejo concurrente de requests
- **Validación de geometrías**: Soporte para Point, LineString, Polygon y Multi-variantes
- **Manejo de errores**: Respuestas claras y códigos HTTP apropiados

### 🚧 En Desarrollo

#### Ruteo con pgRouting
- **Carga de redes de transporte**: Importación de callejeros OSM
- **Generación de topología**: Nodeado automático con `pgr_nodeNetwork`
- **Creación de grafo**: Topología con `pgr_createTopology`
- **Cálculo de rutas**: Algoritmos Dijkstra y A* (próximamente)
- **Reproyección a UTM**: Trabajo en metros para cálculos precisos

#### 📈 Análisis Espacial (Planificado)
- **Medición de distancias**: Herramienta interactiva
- **Cálculo de áreas**: Para polígonos
- **Búferes**: Generación de zonas de influencia
- **Intersecciones**: Análisis de superposición de capas

#### 💾 Persistencia (Planificado)
- **Guardado de sesiones**: Almacenamiento de capas cargadas
- **Exportación de datos**: Descarga de GeoJSON procesados
- **Historial de rutas**: Registro de cálculos de ruteo

## Stack Tecnológico

### Frontend
- **Leaflet 1.9.4**: Biblioteca de mapas interactivos
- **HTML5/CSS3**: Estructura y estilos
- **JavaScript (ES6+)**: Lógica de cliente
- **Fetch API**: Comunicación con backend

### Backend
- **Python 3.12+**: Lenguaje principal
- **FastAPI**: Framework web asíncrono
- **GeoPandas**: Procesamiento de datos geoespaciales
- **Shapely**: Operaciones geométricas
- **PyProj**: Reproyección de coordenadas
- **Uvicorn**: Servidor ASGI

### Base de Datos (En desarrollo)
- **PostgreSQL 14+**: Sistema de gestión de base de datos
- **PostGIS 3+**: Extensión geoespacial
- **pgRouting**: Extensión de ruteo y análisis de redes

### Herramientas de Desarrollo
- **GitHub Codespaces**: Entorno de desarrollo en la nube
- **Git**: Control de versiones
- **Markdown**: Documentación

## Instalación

### Requisitos Previos

- Python 3.12 o superior
- pip (gestor de paquetes de Python)
- Git

### Pasos de Instalación

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/tu-usuario/webgis-pgrouting.git
   cd webgis-pgrouting
   ```
2. **Crear entorno virtual** 
  ```bash
  python -m venv venv
  source venv/bin/activate  # Linux/Mac
  # o
  venv\Scripts\activate  # Windows
  ```
 3. **Instalar dependencias**
  ```bash
  pip install -r requirements.txt
 ```
 4. **Ejecutar la aplicación**
  ```bash
  uvicorn main:app --reload --host 0.0.0.0 --port 8000
 ```
 5. **Acceder a la aplicación**
  ```bash
  Abre tu navegador en http://localhost:8000
 ```
## Instalación con GitHub Codespaces  
  1. Ve al repositorio en GitHub  
  2. Haz clic en Code → Codespaces → Create codespace on main  
  4. Espera a que se configure el entorno  
  5. La aplicación estará disponible en el puerto 8000   
### 📖 Uso
#### Cargar un archivo GeoJSON
  1. Haz clic en el menú hamburguesa ☰ (esquina superior derecha)
  2. Selecciona Cargar GeoJSON  
  3. Haz clic en Seleccionar y elige tu archivo .geojson o .json  
  4. Si el archivo no tiene CRS definido, ingresa el código EPSG (ej: 4326)  
  5. Haz clic en Cargar  
  6. La capa aparecerá en el mapa y en la lista de capas    
#### Gestionar capas  
  1. Abre el menú ☰    
  2. Ve a Capas Cargadas    
  3. Para cada capa puedes:  
   - Activar/Desactivar: Checkbox para mostrar/ocultar  
   -  Zoom a extensión: Botón 🔍 para centrar el mapa en la capa  
   - Subir/Bajar: Botones ⬆️ ⬇️ para reordenar  
   - Eliminar: Botón 🗑️ para remover la capa  
#### Cambiar mapa base  
  1. Abre el menú ☰  
  2. En Mapa Base, selecciona:  
       -- Callejero (OSM): Mapa de calles  
       -- Satélite (Esri): Imagen satelital  
      
## Arquitectura
```bash
webgis-pgrouting/
├── static/                 # Archivos estáticos del frontend
│   ├── index.html         # Página principal
│   ├── app.js             # Lógica JavaScript
│   ├── app.css            # Estilos
│   └── menu_principal.js  # Componente del menú
├── main.py                # Aplicación FastAPI
├── geo_processor.py       # Procesamiento de GeoJSON
├── routable_processor.py  # Procesamiento de redes (en desarrollo)
├── requirements.txt       # Dependencias Python
└── README.md             # Este archivo
```

## Flujo de Datos  
```bash
Usuario → Sube GeoJSON
    ↓
Frontend (Leaflet) → Envía archivo a API
    ↓
Backend (FastAPI) → Valida y procesa
    ↓
GeoProcessor → Reproyecta a EPSG:4326
    ↓
Frontend → Visualiza en mapa
```
# 🗺️ Roadmap  
## Fase 1: Visor GeoJSON (✅ Completada)  
- Carga y visualización de GeoJSON  
- Menú hamburguesa unificado  
- Gestión de capas (orden, visibilidad, eliminación)  
- Mapas base múltiples  
- Popups y tooltips interactivos  
- Reproyección automática  
## Fase 2: Ruteo con pgRouting (🚧 En progreso)  
- Procesador de redes ruteables  
- Endpoint de carga de redes  
- Integración con PostgreSQL/PostGIS  
- Generación de topología automática  
- Interfaz para cálculo de rutas  
## Fase 3: Análisis Espacial ( Planificado)  
- Herramientas de medición  
- Cálculo de buffers  
- Análisis de intersecciones  
- Estadísticas espaciales  
## Fase 4: Persistencia y Exportación ( Planificado)  
- Guardado de sesiones  
- Exportación de datos procesados  
- Historial de operaciones  
- Compartir mapas  
## Fase 5: Características Avanzadas ( Futuro)  
- Búsqueda de features por atributos  
- Estilización dinámica de capas  
- Mapas temáticos (coropléticos)  
- Integración con servicios WMS/WFS  
- Edición de features en el mapa  
##  Contribuciones  
### Las contribuciones son bienvenidas. Para contribuir:  
1- Haz un fork del proyecto  
2- Crea una rama para tu feature (git checkout -b feature/nueva-funcionalidad)  
3- Haz commit de tus cambios (git commit -m 'Agregar nueva funcionalidad')  
4- Push a la rama (git push origin feature/nueva-funcionalidad)  
5- Abre un Pull Request  
6- Guías de Contribución   
7- Sigue el estilo de código existente  
8- Documenta funciones y métodos nuevos  
9- Incluye tests para nuevas funcionalidades  
10- Actualiza el README si es necesario  
## 📄 Licencia
Este proyecto está bajo la Licencia MIT. Ver LICENSE para más detalles.
## 🙏 Agradecimientos
- **OpenStreetMap:** Por los datos geoespaciales libres
- **Leaflet:** Por la excelente biblioteca de mapas
- **FastAPI:** Por el framework web moderno y eficiente
- **PostGIS/pgRouting:** Por las herramientas de análisis geoespacial
## 📧 Contacto
Para preguntas o sugerencias:  
GitHub Issues: Reportar un problema  
Email: lucasmenger@gmail.com  
## 📸 Capturas de Pantalla
**Menú Principal**
