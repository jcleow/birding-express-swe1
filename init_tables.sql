CREATE TABLE behaviours(id SERIAL PRIMARY KEY, name TEXT);
CREATE TABLE notes (id SERIAL PRIMARY KEY, species_name TEXT,habitat TEXT, date_seen TIMESTAMPTZ,appearance TEXT, behaviour TEXT, vocalizations TEXT, flock_size INTEGER,user_id INTEGER);
CREATE TABLE notes_behaviours (id SERIAL PRIMARY KEY, note_id INTEGER, behaviour_id INTEGER);
CREATE TABLE species(id SERIAL PRIMARY KEY, name TEXT, scientific_name TEXT,family_name TEXT, other_information TEXT);

CREATE TABLE users(id SERIAL PRIMARY KEY,first_name TEXT,last_name TEXT,address TEXT,zip_code INTEGER,contactnumber INTEGER, email_address TEXT, username TEXT, password TEXT);

CREATE TABLE users_notes (id SERIAL PRIMARY KEY, comment TEXT, user_id INTEGER, note_id INTEGER);