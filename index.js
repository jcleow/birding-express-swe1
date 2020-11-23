import pg from 'pg';
import methodOverride from 'method-override';
import express, { request } from 'express';

// Set up Pooling with PostgresQL
const { Pool } = pg;
const poolConfig = {
  user: process.env.USER,
  host: 'localhost',
  database: 'birding',
  port: 5432, // Postgres server always runs on this port
};
// Create a new instance of Pool object
const pool = new Pool(poolConfig);

// Set up Express app;
const app = express();
const PORT = 3000;
// Set view engine to ejs
app.set('view engine', 'ejs');
// To parse encoded incoming requests  with urlencoded payloads
app.use(express.urlencoded({ extended: false }));
// Middleware to allow static images/css files to be served
app.use(express.static('public'));
// Middleware that allows POST methods to be overriden for PUT and DELETE requests
app.use(methodOverride('_method'));

// Route: Render a form that will create a new note
app.get('/note', (req, res) => {
  res.render('submitNewBirdSightingForm');
});

// Route: Accept a post request to create a new note
app.post('/note', (req, res) => {
  const newNoteArray = Object.entries(req.body).map(([key, value]) => {
    if (key === 'date_seen') {
      return Date(value).toString();
    }
    return value;
  });
  const insertNoteQuery = {
    text: 'INSERT INTO notes(species_name,habitat,date_seen,appearance,behaviour,vocalizations,flock_size) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING * ',
    values: newNoteArray,
  };
  pool.query(insertNoteQuery, (err, result) => {
    if (err) {
      console.log(err, 'err');
      return;
    }
    const { id } = result.rows[0];
    res.redirect(`/note/${id}`);
  });
});

// Route: Render a single note.
app.get('/note/:id', (req, res) => {
  const { id } = req.params;
  pool.query(`SELECT * FROM notes WHERE id=${id}`, (err, result) => {
    res.render('birdSighting', result.rows[0]);
  });
});

// Route: Render a list of notes
app.get('/', (req, res) => {
  const getAllNotesQuery = {
    text: 'SELECT * FROM notes',
  };
  pool.query(getAllNotesQuery, (err, result) => {
    if (err) {
      console.log(err, 'error');
      return;
    }
    const allSightingsObj = { sightings: result.rows };
    res.render('allBirdSightings', allSightingsObj);
  });
});

// Render the edit form
app.get('/note/:id/edit', (req, res) => {
  const { id } = req.params;
  const getExistingNoteQuery = (`SELECT * FROM notes WHERE id=${id}`);
  pool.query(getExistingNoteQuery, (err, result) => {
    res.render('editExistingBirdSightingForm', result.rows[0]);
  });
});

// Route: Edit a sighting
app.put('/note/:id/edit', (req, res) => {
  const { id } = req.params;
  let textQuery = 'UPDATE notes SET';

  Object.entries(req.body).forEach(([key, value]) => {
    if (key === 'flock_size') {
      textQuery += ` ${key}=${Number(value)}`;
    } else if (key === 'date_seen') {
      // replace the query with $ notation
      textQuery += `${key}= $1,`;
    } else {
      textQuery += ` ${key}='${value}',`;
    }
  });
  textQuery += ` WHERE id=${id} RETURNING *;`;

  // append the date to update within the array argument
  pool.query(textQuery, [new Date(req.body.date_seen)], (err, result) => {
    if (err) {
      console.log(err, 'error');
      return;
    }
    res.redirect(`/note/${id}`);
  });
});

// Route handler that deletes an sighting from the list
app.delete('/note/:id/delete', (req, res) => {
  const { id } = req.params;
  const deleteQuery = (`DELETE FROM notes WHERE id=${id}`);
  pool.query(deleteQuery, (err, result) => {
    if (err) {
      console.log(err);
      return;
    }
    res.redirect('/');
  });
});

// Route handler that handles logins
app.get('/login', (req, res) => {

});

app.listen(PORT);
