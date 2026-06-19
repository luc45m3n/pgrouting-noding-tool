#!/bin/bash
# setup-postgis.sh

echo "🚀 Instalando PostgreSQL + PostGIS + pgRouting..."

# Actualizar
sudo apt-get update

# Instalar
sudo apt-get install -y \
  postgresql \
  postgresql-contrib \
  postgis \
  postgresql-14-postgis-3 \
  postgresql-14-pgrouting

# Iniciar servicio
sudo service postgresql start

# Configurar base de datos
sudo -u postgres psql << EOF
CREATE DATABASE georouter;
\c georouter
CREATE EXTENSION postgis;
CREATE EXTENSION pgrouting;

-- Crear usuario para tu app
CREATE USER app_user WITH PASSWORD 'app_password';
GRANT ALL PRIVILEGES ON DATABASE georouter TO app_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
EOF

echo "✅ Instalación completada!"
echo "📊 Base de datos: georouter"
echo "👤 Usuario: app_user"
echo "🔑 Password: app_password"

# Verificar
sudo -u postgres psql -d georouter -c "SELECT PostGIS_full_version();"
sudo -u postgres psql -d georouter -c "SELECT pgr_version();"