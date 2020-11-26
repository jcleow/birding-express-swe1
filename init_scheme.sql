CREATE TABLE notes (id SERIAL PRIMARY KEY, species_name TEXT,habitat TEXT, date_seen TIMESTAMPTZ,appearance TEXT, behaviour TEXT, vocalizations TEXT, flock_size INTEGER)
//INSERT INTO notes(date_seen,behaviour,flock_size) VALUES ('20-Nov-2020','chirpy',3);


CREATE TABLE species(id SERIAL PRIMARY KEY, name TEXT, scientific_name TEXT);
INSERT INTO species(name,scientific_name) VALUES('Asian Koel','Eudynamys scolopaceus');

CREATE TABLE behaviours(id SERIAL PRIMARY KEY, name TEXT);

CREATE TABLE notes_behaviours (id SERIAL PRIMARY KEY, note_id INTEGER, behaviour_id INTEGER);