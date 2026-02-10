-- PostgreSQL Initialization Script
-- Creates databases and schemas for all services

-- Enable required extensions on template1 so all new databases get them
\c template1;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create databases for each service (legacy names)
CREATE DATABASE user_service;
CREATE DATABASE order_service;
CREATE DATABASE payment_service;
CREATE DATABASE inventory_service;
CREATE DATABASE shipping_service;
CREATE DATABASE event_driven_db;

-- Create databases for microservices (matching docker-compose.services.yml)
CREATE DATABASE recommendations;
CREATE DATABASE fulfillment;
CREATE DATABASE email;
CREATE DATABASE reviews;
CREATE DATABASE returns;
CREATE DATABASE warehouse;
CREATE DATABASE scheduler;
CREATE DATABASE address_validation;
CREATE DATABASE data_pipeline;
CREATE DATABASE preorder;
CREATE DATABASE order_export;
CREATE DATABASE orders;
CREATE DATABASE checkout;
CREATE DATABASE catalog;
CREATE DATABASE identity;
CREATE DATABASE analytics;
CREATE DATABASE customers;
CREATE DATABASE feature_flags;
CREATE DATABASE config;
CREATE DATABASE secrets;
CREATE DATABASE inventory_allocation;
CREATE DATABASE inventory_sync;
CREATE DATABASE product_import;
CREATE DATABASE backorder;
CREATE DATABASE backorders;
CREATE DATABASE reporting;
CREATE DATABASE inventory;
CREATE DATABASE pricing;
CREATE DATABASE wishlist;
CREATE DATABASE affiliate;
CREATE DATABASE webhooks;
CREATE DATABASE tax_calculation;
CREATE DATABASE notifications;
CREATE DATABASE audit;
CREATE DATABASE audit_log;
CREATE DATABASE seo;
CREATE DATABASE content;
CREATE DATABASE product_config;
CREATE DATABASE product_config_db;
CREATE DATABASE gift_cards;
CREATE DATABASE tax;
CREATE DATABASE service_registry;
CREATE DATABASE voice_commerce;
CREATE DATABASE media_processing;
CREATE DATABASE message_broker;
CREATE DATABASE cache_service;
CREATE DATABASE social_commerce;
CREATE DATABASE promotions;
CREATE DATABASE loyalty;
CREATE DATABASE compliance;
CREATE DATABASE vendor_management;
CREATE DATABASE payment;
CREATE DATABASE payments;

-- Enable pg_trgm extension on webhooks database for gin_trgm_ops
\c webhooks;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Connect to user_service database
\c user_service;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

-- Connect to order_service database
\c order_service;

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    total_amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);

-- Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);

-- Connect to payment_service database
\c payment_service;

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    user_id UUID NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    payment_method VARCHAR(50),
    transaction_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);

-- Connect to inventory_service database
\c inventory_service;

-- Create products table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_sku ON products(sku);

-- Create inventory table
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inventory_product_id ON inventory(product_id);
CREATE INDEX idx_inventory_warehouse_id ON inventory(warehouse_id);

-- Create reservations table
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_reservations_order_id ON reservations(order_id);
CREATE INDEX idx_reservations_status ON reservations(status);

-- Grant permissions (for development)
\c user_service;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

\c order_service;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

\c payment_service;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

\c inventory_service;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Connect to shipping_service database
\c shipping_service;

-- Create carriers table
CREATE TABLE IF NOT EXISTS carriers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    base_rate DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create shipments table
CREATE TABLE IF NOT EXISTS shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    carrier VARCHAR(100) NOT NULL,
    tracking_number VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    estimated_delivery DATE,
    actual_delivery TIMESTAMP,
    shipping_address JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shipments_order_id ON shipments(order_id);
CREATE INDEX idx_shipments_tracking_number ON shipments(tracking_number);
CREATE INDEX idx_shipments_status ON shipments(status);

-- Create shipping_events table
CREATE TABLE IF NOT EXISTS shipping_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    location VARCHAR(255),
    description TEXT,
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shipping_events_shipment_id ON shipping_events(shipment_id);

-- Insert default carriers
INSERT INTO carriers (name, is_active, base_rate) VALUES
    ('FedEx', TRUE, 10.00),
    ('UPS', TRUE, 12.00),
    ('USPS', TRUE, 8.00),
    ('DHL', TRUE, 15.00)
ON CONFLICT (name) DO NOTHING;

\c shipping_service;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Connect to event_driven_db for audit service
\c event_driven_db;

-- Create audit_events table
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    changes JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    service_name VARCHAR(100),
    trace_id VARCHAR(100),
    span_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_events_event_type ON audit_events(event_type, created_at);
CREATE INDEX idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX idx_audit_events_user_id ON audit_events(user_id, created_at);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at);
CREATE INDEX idx_audit_events_trace_id ON audit_events(trace_id);

