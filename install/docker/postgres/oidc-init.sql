CREATE DATABASE dekart_geo;

\connect dekart_geo

CREATE SCHEMA sample;

CREATE TABLE sample.geospatial_points (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    geom_wkt TEXT NOT NULL
);

INSERT INTO sample.geospatial_points (name, category, longitude, latitude, geom_wkt) VALUES
    ('Berlin', 'city', 13.4050, 52.5200, 'POINT(13.4050 52.5200)'),
    ('Paris', 'city', 2.3522, 48.8566, 'POINT(2.3522 48.8566)'),
    ('London', 'city', -0.1276, 51.5072, 'POINT(-0.1276 51.5072)'),
    ('Rome', 'city', 12.4964, 41.9028, 'POINT(12.4964 41.9028)'),
    ('Madrid', 'city', -3.7038, 40.4168, 'POINT(-3.7038 40.4168)');
