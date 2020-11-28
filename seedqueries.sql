-- notes
INSERT INTO notes(species_name,habitat,date_seen,appearance,behaviour,vocalizations,flock_size,user_id) VALUES ('Peacock','Zoo','12/25/2000','looks like a peacock','behaviour','vocalizations',1,100);
-- behaviours
INSERT INTO behaviours(name) VALUES('quirky');

-- notes_behaviours
INSERT INTO notes_behaviours(note_id,behaviour_id) VALUES(1,1);

-- species 
INSERT INTO species(name,scientific_name) VALUES('special','scientific name');

-- users 
INSERT INTO users(first_name,last_name,address) VALUES('test','test','test');

-- users_notes 
INSERT INTO users(comment,user_id,note_id) VALUES('test',1,1);