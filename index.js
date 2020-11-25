import pg from 'pg';
import jsSHA from 'jssha';
import methodOverride from 'method-override';
import cookieParser from 'cookie-parser';
import express from 'express';
import { render } from 'ejs';

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
// Middleware that allows request.cookies to be parsed
app.use(cookieParser());

// Function that includes the username(if logged-in ) from cookies into dataObj for rendering

const includeLoggedInUsername = (data, loggedInUserName, loggedInUserId) => {
  // If user is logged in, hence loggedInUserName exists in req cookie
  if (loggedInUserName) {
    data.loggedInUser = loggedInUserName;
    data.loggedInUserId = loggedInUserId;
  }
  return data;
};

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
  newNoteArray.push(req.cookies.loggedInUser);
  const insertNoteQuery = {
    text: 'INSERT INTO notes(species_name,habitat,date_seen,appearance,behaviour,vocalizations,flock_size,username) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING * ',
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
    let data = result.rows[0];
    data = includeLoggedInUsername(data, req.cookies.loggedInUser, req.cookies.loggedInUserId);
    res.render('birdSighting', data);
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
    let allSightingsObj = { sightings: result.rows };
    // Add in current loggedInUser parameter to change navbar display
    allSightingsObj = includeLoggedInUsername(allSightingsObj,
      req.cookies.loggedInUser, req.cookies.loggedInUserId);
    res.render('allBirdSightings', allSightingsObj);
  });
});

// Render the edit form
app.get('/note/:id/edit', (req, res) => {
  const { id } = req.params;
  // Subsequent callback function that runs after validating username
  const renderEditForm = () => {
    const getExistingNoteQuery = (`SELECT * FROM notes WHERE id=${id}`);
    pool.query(getExistingNoteQuery, (nextErr, nextResult) => {
      if (nextErr) {
        console.log(nextErr, 'nextErr');
        return;
      }
      res.render('editExistingBirdSightingForm', nextResult.rows[0]);
    });
  };

  // Perform validation on whether user can edit/delete a particular sighting
  pool.query(`SELECT username FROM notes WHERE id=${id}`, (err, result) => {
    if (req.cookies.loggedInUser !== result.rows[0].username) {
      res.status(403);
      res.render('displayErrorPage');
      return;
    }
    // If valid,
    renderEditForm();
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
  // Subsequent callback that deletes a sighting
  const deleteSighting = () => {
    pool.query(deleteQuery, (nextErr, nextResult) => {
      if (nextErr) {
        console.log(nextErr);
        return;
      }
      res.redirect('/');
    });
  };

  // Perform validation on whether user can edit/delete a particular sighting
  pool.query(`SELECT username FROM notes WHERE id=${id}`, (err, result) => {
    if (req.cookies.loggedInUser !== result.rows[0].username) {
      res.status(403).send('You are not allowed to delete this sighting');
      return;
    }
    // If valid,
    deleteSighting();
  });
});

// Route hanlder that renders signup form
app.get('/signup', (req, res) => {
  res.render('signup');
});

// Route handler that submits signup details
app.post('/signup', (req, res) => {
  const userDetailsArray = Object.entries(req.body).map(([field, input]) => {
    if (field === 'password') {
      const shaObj = new jsSHA('SHA-512', 'TEXT', { encoding: 'UTF8' });
      shaObj.update(input);
      const hash = shaObj.getHash('HEX');
      return hash;
    }
    if (field !== 'confirmPassword' && field !== 'termsAndConditions') {
      return input;
    }
  });
  // Filter out the undefined values during map function
  const filteredUserDetailsArray = userDetailsArray.filter((detail) => detail !== undefined);

  const signupQuery = {
    text: 'INSERT INTO users(first_name,last_name,address,zip_code,contactNumber,email_address,username,password) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING * ',
    values: filteredUserDetailsArray,
  };
  pool.query(signupQuery, (err, result) => {
    if (err) {
      console.log('error', err.stack);
      return;
    }
    console.log(result.rows);
  });
  res.render('successLogin');
});

// Route handler that handles logins
app.get('/login', (req, res) => {
  res.render('login');
});

// Route handler that posts/submits login info to server for auth
app.post('/login', (req, res) => {
  // Convert req.body.password to hashed password first
  const shaObj = new jsSHA('SHA-512', 'TEXT', { encoding: 'UTF8' });
  shaObj.update(req.body.password);
  const hash = shaObj.getHash('HEX');
  // Perform check by first getting the data from database
  pool.query(`SELECT username FROM users WHERE password='${hash}'`, (err, result) => {
    if (err) {
      console.log(err, 'error');
      return;
    }
    if (result.rows.length === 0) {
      res.status(403);
      res.render('displayErrorPage');
      return;
    }
    pool.query(`SELECT id FROM users WHERE username='${req.body.username}'`, (nextErr, nextResult) => {
      res.cookie('loggedInUser', req.body.username);
      res.cookie('loggedInUserId', nextResult.rows[0].id);
      res.redirect('/user-dashboard');
    });
  });
});

// Deletes cookie with associated username
app.delete('/logout', (req, res) => {
  res.clearCookie('loggedInUser');
  res.clearCookie('loggedInUserId');
  res.redirect('/');
});

// Fictitious action url that checks if user is logged in
app.get('/user-dashboard', (req, res) => {
  if (req.cookies.loggedInUser === undefined) {
    res.status(403).send('Sorry you entered the wrong username and/or password');
    return;
  }

  pool.query(`SELECT id FROM users WHERE username = '${req.cookies.loggedInUser}'`, (err, result) => {
    if (err) {
      console.log(err);
      return;
    }
    const { id } = result.rows[0];
    // Redirect to user sighting page
    res.redirect(`/users/${id}`);
  });
});

// Render a user's sighting page
app.get('/users/:id', (req, res) => {
  const { id } = req.params;
  const { species_name: speciesName } = req.query;
  // First select username based on id provided in url
  pool.query(`SELECT username FROM users WHERE id= ${id}`, (err, result) => {
    if (err) {
      console.log('err', err);
      return;
    }
    const { username } = result.rows[0];
    // Next select all objects that is associated with said username
    pool.query(`SELECT * FROM notes WHERE username='${username}'`, (nextErr, nextResult) => {
      if (nextErr) {
        console.log('err', err);
        return;
      }
      let data = {};
      data.sightings = nextResult.rows;
      // This loggedInUser refers to user who is currently logged in
      data = includeLoggedInUsername(data, req.cookies.loggedInUser, req.cookies.loggedInUserId);

      // Get a list of unique species names to view in dropdown button
      const listView = [];
      data.sightings.forEach((sighting) => {
        if (!listView.includes(sighting.species_name)) {
          listView.push(sighting.species_name);
        }
      });
      data.listView = listView;

      // if user specified a species_name through the dropdown button
      if (speciesName) {
        // This is an array
        data.selectedSpeciesData = data.sightings.filter((sighting) => sighting.species_name === speciesName);
      }
      res.render('userBirdSighting', data);
    });
  });
});

// Render a form to create a new species
app.get('/species', (req, res) => {
  res.render('submitNewSpecies');
});

// Submit a new species
app.post('/species', (req, res) => {
  const newTypeOfSpeciesData = Object.entries(req.body).map(([key, value]) => value);

  const insertQuery = {
    text: 'INSERT INTO species(name,scientific_name,family_name,other_information) VALUES($1,$2,$3,$4)',
    values: newTypeOfSpeciesData,
  };
  pool.query(insertQuery, (err, result) => {
    if (err) {
      console.log(err);
      return;
    }
    console.log(result.rows);
  });
  res.redirect('/');
});

app.get('/species/:index', (req, res) => {
  res.render('speciesIndex');
});

app.listen(PORT);
