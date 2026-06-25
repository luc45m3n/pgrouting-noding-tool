# db_init.py
"""
Inicialización automática de PostgreSQL y la base de datos.
Se ejecuta al arrancar la app para garantizar que:
1. PostgreSQL esté corriendo
2. La BD exista
3. Las extensiones PostGIS y pgRouting estén habilitadas
"""
import psycopg2
import os
import subprocess
import time
from dotenv import load_dotenv

load_dotenv()


def is_postgresql_running() -> bool:
    """Verifica si PostgreSQL está corriendo."""
    try:
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST", "localhost"),
            database="postgres",
            user=os.getenv("DB_USER", "postgres"),
            password=os.getenv("DB_PASS", "postgres"),
            port=os.getenv("DB_PORT", "5432"),
            connect_timeout=2
        )
        conn.close()
        return True
    except psycopg2.OperationalError:
        return False


def start_postgresql() -> bool:
    """Intenta iniciar PostgreSQL."""
    print("🔄 PostgreSQL no está corriendo. Intentando iniciar...")
    
    # Métodos para iniciar PostgreSQL en Linux
    commands = [
        ["sudo", "service", "postgresql", "start"],
        ["sudo", "pg_ctlcluster", "16", "main", "start"],
        ["sudo", "pg_ctlcluster", "15", "main", "start"],
        ["sudo", "pg_ctlcluster", "14", "main", "start"],
        ["sudo", "-u", "postgres", "pg_ctl", "-D", "/var/lib/postgresql/data", "start"],
    ]
    
    for cmd in commands:
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                print(f"✅ PostgreSQL iniciado con: {' '.join(cmd)}")
                return True
        except (subprocess.TimeoutExpired, FileNotFoundError):
            continue
    
    print("❌ No se pudo iniciar PostgreSQL automáticamente")
    print("   Intentá manualmente: sudo service postgresql start")
    return False


def wait_for_postgresql(max_attempts: int = 5) -> bool:
    """Espera a que PostgreSQL esté disponible."""
    for attempt in range(max_attempts):
        if is_postgresql_running():
            return True
        print(f"   Esperando PostgreSQL... ({attempt + 1}/{max_attempts})")
        time.sleep(2)
    return False


def init_database():
    """
    Inicializa PostgreSQL y la base de datos 'caminos'.
    Se ejecuta automáticamente al arrancar la app.
    """
    print("\n" + "="*60)
    print("🔧 Inicializando sistema de base de datos...")
    print("="*60)
    
    # PASO 1: Verificar/iniciar PostgreSQL
    if not is_postgresql_running():
        if not start_postgresql():
            print("\n❌ No se pudo iniciar PostgreSQL. La app no puede funcionar.")
            print("   Solución manual: sudo service postgresql start")
            return False
        
        # Esperar a que esté disponible
        if not wait_for_postgresql():
            print("\n❌ PostgreSQL no respondió después de iniciarlo.")
            return False
    
    print("✅ PostgreSQL está corriendo")
    
    # PASO 2: Crear la base de datos si no existe
    admin_config = {
        "host": os.getenv("DB_HOST", "localhost"),
        "database": "postgres",
        "user": os.getenv("DB_USER", "postgres"),
        "password": os.getenv("DB_PASS", "postgres"),
        "port": os.getenv("DB_PORT", "5432"),
    }
    
    target_db = os.getenv("DB_NAME", "caminos")
    
    try:
        conn = psycopg2.connect(**admin_config)
        conn.autocommit = True
        cur = conn.cursor()
        
        # Verificar si la BD existe
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s;", (target_db,))
        
        if cur.fetchone():
            print(f"✅ La base de datos '{target_db}' ya existe")
        else:
            cur.execute(f"CREATE DATABASE {target_db};")
            print(f"✅ Base de datos '{target_db}' creada")
        
        cur.close()
        conn.close()
        
        # PASO 3: Habilitar extensiones
        target_config = admin_config.copy()
        target_config["database"] = target_db
        
        conn = psycopg2.connect(**target_config)
        cur = conn.cursor()
        
        extensions = ["postgis", "pgrouting"]
        
        for ext in extensions:
            try:
                cur.execute(f"CREATE EXTENSION IF NOT EXISTS {ext};")
                print(f"✅ Extensión '{ext}' habilitada")
            except Exception as e:
                print(f"️ No se pudo habilitar '{ext}': {e}")
                print(f"   Instalá con: sudo apt-get install postgresql-16-{ext}")
        
        conn.commit()
        cur.close()
        
        print(f"\n🎉 Base de datos '{target_db}' lista para usar")
        print("="*60 + "\n")
        return True
        
    except psycopg2.OperationalError as e:
        print(f"\n❌ Error de conexión a PostgreSQL: {e}")
        print("="*60 + "\n")
        return False
        
    except Exception as e:
        print(f"\n❌ Error inesperado inicializando BD: {e}")
        print("="*60 + "\n")
        return False
        
    finally:
        if 'conn' in locals() and conn:
            conn.close()


if __name__ == "__main__":
    init_database()