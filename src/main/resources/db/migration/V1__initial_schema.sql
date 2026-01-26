-- Flyway migration: initial database schema for Jatri Ovijog

-- Users table holds passenger and police accounts. Passwords are stored
-- hashed using BCrypt. Role column can be used to distinguish "user"
-- (passenger) from "police".
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user'
);

-- Complaints table stores reports about incidents on buses or other
-- transportation. Reporter_type describes whether the reporter is a
-- registered user or anonymous. The created_at timestamp defaults to
-- the time of insertion.
CREATE TABLE IF NOT EXISTS complaints (
    id BIGSERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    thana TEXT NOT NULL,
    route TEXT NOT NULL,
    bus_name TEXT,
    bus_number TEXT,
    image_url TEXT,
    reporter_type TEXT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id BIGINT REFERENCES users(id)
);

-- Emergency reports table stores SOS events. Coordinates are optional.
CREATE TABLE IF NOT EXISTS emergency_reports (
    id BIGSERIAL PRIMARY KEY,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    audio_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id BIGINT REFERENCES users(id)
);