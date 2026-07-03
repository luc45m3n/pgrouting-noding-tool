# i18n.py
# Sistema de internacionalización para el backend (Python)

class I18n:
    def __init__(self):
        self.current_lang = 'es'
        
        self.translations = {
            'es': {
                # Logs de procesamiento de red
                'log.processing_network': '🔧 Procesando red desde GeoJSON',
                'log.target_epsg': ' EPSG destino: {target_epsg}',
                'log.tolerance': '📏 Tolerancia: {tolerance}m',
                'log.snap_tolerance': '📐 Snap tolerance: {snap_tolerance}m',
                'log.simplify_tolerance': '✂️ Simplify tolerance: {simplify_tolerance}m',
                'log.simplifying': '🔧 Simplificando geometrías (tolerancia: {tolerance}m)...',
                'log.snapping': '🔧 Aplicando snap (tolerancia: {tolerance}m)...',
                'log.advanced_node_activated': '🔧 Nodeo avanzado activado (snap={snap_tolerance}m)',
                'log.advanced_node_details': '🔧 Nodeo avanzado: snap={snap_tolerance}m, tolerance={tolerance}m',
                'log.snap_applied': '   ✅ ST_Snap aplicado ({tolerance}m)',
                'log.intersection_points': '   ✅ Puntos de intersección creados',
                'log.split_applied': '   ✅ ST_Split aplicado con puntos',
                'log.edges_generated': '   ✅ {count} aristas generadas',
                'log.node_network': '🔧 Ejecutando pgr_nodeNetwork (tolerancia: {tolerance}m)...',
                'log.node_network_done': '✅ pgr_nodeNetwork ejecutado',
                'log.adapting_structure': '🔧 Adaptando estructura de {table}...',
                'log.structure_adapted': '✅ Estructura adaptada: gid, cost, reverse_cost agregados',
                'log.create_topology': '🔧 Ejecutando pgr_createTopology en {table}...',
                'log.topology_done': '✅ pgr_createTopology ejecutado',
                'log.getting_stats': '📊 Obteniendo estadísticas...',
                'log.network_processed': '✅ Red procesada: {data}',
                'log.creating_table': '🔧 Creando tabla {table}...',
                'log.table_created': '   ✅ Tabla {table} creada con {count} aristas',
                'log.verified': '   ✅ Verificado: {count} aristas en {table}',
                
                # Logs de base de datos
                'log.initializing_db': '🔧 Inicializando sistema de base de datos...',
                'log.postgres_not_running': '🔄 PostgreSQL no está corriendo. Intentando iniciar...',
                'log.postgres_started': '✅ PostgreSQL iniciado con: {command}',
                'log.postgres_running': '✅ PostgreSQL está corriendo',
                'log.db_exists': "✅ La base de datos '{db}' ya existe",
                'log.db_created': "✅ Base de datos '{db}' creada",
                'log.extension_enabled': "✅ Extensión '{ext}' habilitada",
                'log.db_ready': "🎉 Base de datos '{db}' lista para usar",
                'log.error_db': '❌ Error de conexión a PostgreSQL: {error}',
                'log.error_unexpected': ' Error inesperado inicializando BD: {error}',
                'log.cannot_start_postgres': '❌ No se pudo iniciar PostgreSQL automáticamente',
                'log.manual_start': '   Intentá manualmente: sudo service postgresql start',
                'log.postgres_not_responding': '❌ PostgreSQL no respondió después de iniciarlo.',
                'log.cannot_enable_extension': "⚠️ No se pudo habilitar '{ext}': {error}",
                'log.install_extension': "   Instalá con: sudo apt-get install postgresql-16-{ext}",
                'log.error_listing_tables': '❌ Error listando tablas: {error}',
                'log.incomplete_network': '⚠️ Red incompleta (sin vértices): {network}',
                'log.error_reading_network': '⚠️ Error leyendo red {network}: {error}',
                'log.error_processing': '❌ Error procesando red: {error}',
                'log.error_nearest_node': '❌ Error buscando nodo más cercano: {error}',
                'log.error_shortest_path': '❌ Error calculando ruta más corta: {error}',
                'log.error_tsp': '❌ Error calculando ruta TSP: {error}',
                'log.error_delete_network': '❌ Error eliminando red: {error}',
                'log.error_loading_geojson': '❌ Error cargando GeoJSON de la red: {error}',
                
                # Mensajes de error
                'error.no_route': 'No existe ruta conectada entre los puntos seleccionados',
                'error.no_active_network': 'No hay red activa. Carga una red primero.',
                'error.network_not_found': 'No se encontró nodo cercano',
                'error.processing': 'Error procesando red',
                'error.loading': 'Error cargando red',
                'error.deleting': 'Error eliminando red',
                'error.calculation': 'Error calculando ruta',
                'error.calculation_tsp': 'Error calculando ruta TSP',
            },
            
            'en': {
                # Network processing logs
                'log.processing_network': '🔧 Processing network from GeoJSON',
                'log.target_epsg': '🎯 Target EPSG: {target_epsg}',
                'log.tolerance': '📏 Tolerance: {tolerance}m',
                'log.snap_tolerance': '📐 Snap tolerance: {snap_tolerance}m',
                'log.simplify_tolerance': '✂️ Simplify tolerance: {simplify_tolerance}m',
                'log.simplifying': '🔧 Simplifying geometries (tolerance: {tolerance}m)...',
                'log.snapping': '🔧 Applying snap (tolerance: {tolerance}m)...',
                'log.advanced_node_activated': '🔧 Advanced node activated (snap={snap_tolerance}m)',
                'log.advanced_node_details': '🔧 Advanced node: snap={snap_tolerance}m, tolerance={tolerance}m',
                'log.snap_applied': '   ✅ ST_Snap applied ({tolerance}m)',
                'log.intersection_points': '   ✅ Intersection points created',
                'log.split_applied': '   ✅ ST_Split applied with points',
                'log.edges_generated': '   ✅ {count} edges generated',
                'log.node_network': '🔧 Executing pgr_nodeNetwork (tolerance: {tolerance}m)...',
                'log.node_network_done': '✅ pgr_nodeNetwork executed',
                'log.adapting_structure': '🔧 Adapting structure of {table}...',
                'log.structure_adapted': '✅ Structure adapted: gid, cost, reverse_cost added',
                'log.create_topology': '🔧 Executing pgr_createTopology on {table}...',
                'log.topology_done': '✅ pgr_createTopology executed',
                'log.getting_stats': '📊 Getting statistics...',
                'log.network_processed': '✅ Network processed: {data}',
                'log.creating_table': '🔧 Creating table {table}...',
                'log.table_created': '   ✅ Table {table} created with {count} edges',
                'log.verified': '   ✅ Verified: {count} edges in {table}',
                
                # Database logs
                'log.initializing_db': '🔧 Initializing database system...',
                'log.postgres_not_running': '🔄 PostgreSQL is not running. Trying to start...',
                'log.postgres_started': '✅ PostgreSQL started with: {command}',
                'log.postgres_running': '✅ PostgreSQL is running',
                'log.db_exists': "✅ Database '{db}' already exists",
                'log.db_created': "✅ Database '{db}' created",
                'log.extension_enabled': "✅ Extension '{ext}' enabled",
                'log.db_ready': " Database '{db}' ready to use",
                'log.error_db': '❌ PostgreSQL connection error: {error}',
                'log.error_unexpected': '❌ Unexpected error initializing DB: {error}',
                'log.cannot_start_postgres': '❌ Could not start PostgreSQL automatically',
                'log.manual_start': '   Try manually: sudo service postgresql start',
                'log.postgres_not_responding': ' PostgreSQL did not respond after starting.',
                'log.cannot_enable_extension': "⚠️ Could not enable '{ext}': {error}",
                'log.install_extension': "   Install with: sudo apt-get install postgresql-16-{ext}",
                'log.error_listing_tables': '❌ Error listing tables: {error}',
                'log.incomplete_network': '️ Incomplete network (no vertices): {network}',
                'log.error_reading_network': '️ Error reading network {network}: {error}',
                'log.error_processing': '❌ Error processing network: {error}',
                'log.error_nearest_node': '❌ Error searching for nearest node: {error}',
                'log.error_shortest_path': ' Error calculating shortest path: {error}',
                'log.error_tsp': '❌ Error calculating TSP route: {error}',
                'log.error_delete_network': '❌ Error deleting network: {error}',
                'log.error_loading_geojson': '❌ Error loading network GeoJSON: {error}',
                
                # Error messages
                'error.no_route': 'No connected route between selected points',
                'error.no_active_network': 'No active network. Load a network first.',
                'error.network_not_found': 'No nearby node found',
                'error.processing': 'Error processing network',
                'error.loading': 'Error loading network',
                'error.deleting': 'Error deleting network',
                'error.calculation': 'Error calculating route',
                'error.calculation_tsp': 'Error calculating TSP route',
            }
        }
    
    def t(self, key, **params):
        """
        Traduce una clave al idioma actual.
        
        Uso:
            i18n.t('log.simplifying', tolerance=1.0)
            i18n.t('log.db_exists', db='caminos')
        """
        lang = self.current_lang
        text = self.translations.get(lang, {}).get(key) or self.translations['es'].get(key, key)
        
        # Reemplazar parámetros usando .format()
        if params:
            try:
                text = text.format(**params)
            except KeyError:
                pass  # Si falta algún parámetro, dejar el placeholder
        
        return text
    
    def set_language(self, lang):
        """Cambiar idioma"""
        if lang in ('es', 'en'):
            self.current_lang = lang
            print(f"Language changed to: {lang.upper()}")


# Instancia global
i18n = I18n()