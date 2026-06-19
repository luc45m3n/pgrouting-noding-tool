# db_init.py
"""
Inicialización automática de la base de datos.
Se ejecuta al arrancar la app para garantizar que la BD exista.
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()


def init_database():
    """Crea la BD 'caminos' si no existe y habilita extensiones."""
    admin_config = {
        "host": os.getenv("DB_HOST", "localhost"),
        "database": "postgres",
        "user": os.getenv("DB_USER", "postgres"),
        "password": os.getenv("DB_PASS", "postgres"),
        "port": os.getenv("DB_PORT", "5432"),
    }
    
    target_db = os.getenv("DB_NAME", "caminos")
    
    print(f"🔧 Inicializando base de datos '{target_db}'...")
    
    conn = None
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
        
        # Conectar a la BD nueva para habilitar extensiones
        target_config = admin_config.copy()
        target_config["database"] = target_db
        
        conn = psycopg2.connect(**target_config)
        cur = conn.cursor()
        
        for ext in ["postgis", "pgrouting"]:
            try:
                cur.execute(f"CREATE EXTENSION IF NOT EXISTS {ext};")
                print(f"✅ Extensión '{ext}' habilitada")
            except Exception as e:
                print(f"⚠️ No se pudo habilitar '{ext}': {e}")
        
        conn.commit()
        cur.close()
        
        print(f"🎉 Base de datos '{target_db}' lista para usar")
        return True
        
    except psycopg2.OperationalError as e:
        print(f"❌ Error de conexión a PostgreSQL: {e}")
        print(f"   ¿Está PostgreSQL corriendo? Probá:")
        print(f"   sudo service postgresql start")
        return False
        
    except Exception as e:
        print(f"❌ Error inesperado inicializando BD: {e}")
        return False
        
    finally:
        if conn:
            conn.close()