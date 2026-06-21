-- ============================================================
-- SCHEMA: Sistema de Turnos FOFEL
-- ============================================================

-- Tabla de videos
CREATE TABLE IF NOT EXISTS videos (
    id SERIAL PRIMARY KEY,
    numero INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    ruta VARCHAR(500) NOT NULL,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de configuración de impresora
CREATE TABLE IF NOT EXISTS config_impresora (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(20) DEFAULT 'ip', -- 'ip' | 'usb'
    ip_address VARCHAR(50),
    puerto INTEGER DEFAULT 9100,
    nombre VARCHAR(100),
    activo BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de inicio del día / sucursal
CREATE TABLE IF NOT EXISTS inicio_dia (
    id SERIAL PRIMARY KEY,
    folio_inicio INTEGER NOT NULL CHECK (folio_inicio BETWEEN 1000 AND 9999),
    folio_actual INTEGER NOT NULL,
    nombre_sucursal VARCHAR(20) NOT NULL,
    fecha DATE NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de contenido del ticket
CREATE TABLE IF NOT EXISTS config_ticket (
    id SERIAL PRIMARY KEY,
    promocion TEXT,
    codigo VARCHAR(50),
    descripcion TEXT,
    precio DECIMAL(10,2),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de terminales de trabajo
CREATE TABLE IF NOT EXISTS terminales (
    id SERIAL PRIMARY KEY,
    mac VARCHAR(17) NOT NULL UNIQUE, -- formato XX:XX:XX:XX:XX:XX
    nombre VARCHAR(100) NOT NULL,
    folio_actual INTEGER,
    status VARCHAR(10) DEFAULT 'offline' CHECK (status IN ('offline', 'online')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de registro de folios (turnos)
CREATE TABLE IF NOT EXISTS folios (
    id SERIAL PRIMARY KEY,
    folio INTEGER NOT NULL,
    fecha_hora_toma TIMESTAMP DEFAULT NOW(),
    fecha_hora_inicio_atencion TIMESTAMP,
    fecha_hora_fin_atencion TIMESTAMP,
    fecha_hora_entrega TIMESTAMP,
    terminal_id INTEGER REFERENCES terminales(id),
    nombre_sucursal VARCHAR(20),
    status_atencion SMALLINT DEFAULT 0 CHECK (status_atencion IN (0,1,2)),
    -- 0=por atender, 1=atendiendo, 2=atendido
    status_entrega SMALLINT DEFAULT 0 CHECK (status_entrega IN (0,1)),
    -- 0=por entregar, 1=entregado
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_folios_status ON folios(status_atencion);
CREATE INDEX IF NOT EXISTS idx_folios_fecha ON folios(fecha_hora_toma);
CREATE INDEX IF NOT EXISTS idx_terminales_mac ON terminales(mac);

-- Datos iniciales config ticket (vacío pero estructurado)
INSERT INTO config_ticket (id, promocion, codigo, descripcion, precio)
VALUES (1, '', '', '', 0.00)
ON CONFLICT DO NOTHING;

-- Datos iniciales config impresora
INSERT INTO config_impresora (id, tipo, ip_address, puerto, nombre)
VALUES (1, 'ip', '', 9100, '')
ON CONFLICT DO NOTHING;
