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

CREATE TABLE sample.geospatial_points_raw (
    name TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    basic_category TEXT
);

COPY sample.geospatial_points_raw (name, latitude, longitude, basic_category)
FROM '/docker-entrypoint-initdb.d/denmark-pois.csv'
WITH (FORMAT csv, HEADER true);

INSERT INTO sample.geospatial_points (name, category, longitude, latitude, geom_wkt)
SELECT
    name,
    basic_category,
    longitude,
    latitude,
    'POINT(' || longitude || ' ' || latitude || ')'
FROM sample.geospatial_points_raw;
