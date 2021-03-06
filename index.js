import pg from 'pg';
import jsSHA from 'jssha';
import methodOverride from 'method-override';
import cookieParser from 'cookie-parser';
import express from 'express';
import axios from 'axios';

// Constant Variable of process.env
const SALT = process.env.MY_ENV_VAR;
// Set up Pooling with PostgresQL
const { Pool } = pg;
let poolConfig;
if (process.env.ENV === 'PRODUCTION') {
  poolConfig = {
    user: 'postgres',
    // set DB_PASSWORD as an environment variable for security.
    password: process.env.DB_PASSWORD,
    host: 'localhost',
    database: 'birding',
    port: 5432,
  };
} else {
  poolConfig = {
    user: process.env.USER,
    host: 'localhost',
    database: 'birding',
    port: 5432, // Postgres server always runs on this port
  };
}
// Create a new instance of Pool object
const pool = new Pool(poolConfig);

// Set up Express app;
const app = express();
const PORT = process.argv[2];
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

// Function that converts supplied username into a hash (using a salt)
const convertUserIdToHash = (userId) => {
  const shaObj = new jsSHA('SHA-512', 'TEXT', { encoding: 'UTF8' });
  const unhashedCookieString = `${userId}-${SALT}`;
  shaObj.update(unhashedCookieString);
  const hashedCookieString = shaObj.getHash('HEX');
  return hashedCookieString;
};

// Middleware that checks if a user has been logged in and authenticates
// before granting access to a page for every request
app.use((req, res, next) => {
// set the default value
  req.middlewareLoggedIn = false;

  // check to see if user is logged in but yet to be authenticated
  if (req.cookies.loggedInUserId) {
    // get the hashed value that should be inside the cookie
    const hash = convertUserIdToHash(req.cookies.loggedInUserId);
    // Test the value of the cookie
    if (req.cookies.loggedInHash === hash) {
      req.middlewareLoggedIn = true;
      // Look for this user in the database
      const { loggedInUserId } = req.cookies;
      // Try to get the user
      pool.query(`SELECT id,username FROM users WHERE id = ${loggedInUserId}`, (error, result) => {
        if (error || result.rows.length < 1) {
          res.status(503).send('sorry an error occurred');
        }
        // set the user as a key in the req object so that it is accessible
        req.loggedInUserId = result.rows[0].id;
        req.loggedInUser = result.rows[0].username;
        next();
      });
      // make sure we don't get down to the next () below
      return;
    }
  }
  next();
});

// Function that includes the username(if logged-in ) from cookies into dataObj for rendering
const includeLoggedInUsername = (data, loggedInUserName, loggedInUserId) => {
  // If user is logged in, hence loggedInUserName exists in req cookie
  if (loggedInUserName) {
    data.loggedInUser = loggedInUserName;
    data.loggedInUserId = loggedInUserId;
  }
  return data;
};

// Get all behaviour types from database
const getAllBehaviourTypes = (callback) => {
  pool.query('SELECT * from behaviours', (behaviourErr, behaviourResult) => {
    if (behaviourErr) {
      console.log(behaviourErr, 'err getting behaviours');
    }
    const allBehavioursArray = behaviourResult.rows;
    if (callback) {
      callback(allBehavioursArray);
    }
  });
};

// Route: Render a form that will create a new note
app.get('/note', (req, res) => {
  getAllBehaviourTypes((allBehavioursArray) => {
    const allBehaviourData = {};
    allBehaviourData.behaviours = allBehavioursArray;

    // If user is authenticated through the middleware at the start
    // Display user's loggedInUsername at the start
    includeLoggedInUsername(allBehaviourData, req.loggedInUser, req.loggedInUserId);

    res.render('navlinks/submitNewBirdSightingForm', allBehaviourData);
  });
});

// Route: Accept a post request to create a new note
app.post('/note', (req, res) => {
  const newNoteArray = Object.entries(req.body).map(([key, value]) => {
  // Obtain the index of BehaviourNum Variable and remove from array of values to be inserted
    if (key === 'date_seen') {
      return Date(value).toString();
    }
    if (key === 'behaviour') {
      // First obtain the
      pool.query('SELECT last_value from notes_id_seq', (err, result) => {
        if (err) {
          console.log(err, 'error with selecting notes\' last value');
        }
        // This is the latest sequence in 'notes' table
        // Need to do this as id of an entry may be deleted
        const lastNotesId = Number(result.rows[0].last_value);
        console.log(lastNotesId, 'lastNotesId');

        // Check if value is an array. If it is, it means multiple boxes are checked
        // If it is not means only 1 box is checked
        if (Array.isArray(value)) {
          value.forEach((num) => {
          // Need to increment by 1 to lastNotesId as upon creation of this
          // note, the sequence will increase by 1 to output the latest id
            pool.query(`INSERT INTO notes_behaviours(note_id,behaviour_id) 
          VALUES (${lastNotesId + 1},${num}) RETURNING *`, (insertErr, insertResult) => {
              if (insertErr) {
                console.log(insertErr, 'insert behaviour into join table error');
              }
              console.log(insertResult.rows[0], 'behaviour-insertion to join table');
            });
          });
        }
      });
      const dummyVar = 'behaviour';
      return dummyVar;
    }
    return value;
  });
  // To remove behaviour position from the notes database insertion for now since
  // it can contain multiple values
  newNoteArray.splice(newNoteArray.indexOf('behaviour'), 1);
  console.log(newNoteArray, 'test-2');
  // To include in loggedInUserId to store in database
  newNoteArray.push(req.cookies.loggedInUserId);
  const insertNoteQuery = {
    text: 'INSERT INTO notes(species_name,habitat,date_seen,appearance,vocalizations,flock_size,user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING * ',
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
  console.log(req.body);

  // Function that appends comments into the data that is to be parsed into ejs
  const getAndRenderCommentsFromDb = (data) => {
    pool.query(`SELECT username,comment FROM users_notes INNER JOIN users ON users.id= user_id WHERE note_id=${id} AND user_id=users.id`, (err, result) => {
      if (err) {
        console.log(err, 'err getting comments from db');
        return;
      }
      // Append comments into the data object
      data.comments = result.rows;
      // End the res-req cycle
      res.render('birdSighting', data);
    });
  };
  // Get all data from notes table, include author's user id and username
  pool.query(`SELECT *,notes.id AS id FROM notes INNER JOIN users ON users.id=user_id WHERE notes.id=${id}`, (err, result) => {
    let data = result.rows[0];
    // Get all data from notes table, include loggedin User's id and username
    data = includeLoggedInUsername(data, req.loggedInUser, req.loggedInUserId);
    pool.query(`SELECT name FROM behaviours INNER JOIN notes_behaviours ON behaviours.id=behaviour_id WHERE notes_behaviours.note_id=${id}`, (behaviourErr, behaviourResult) => {
      if (behaviourErr) {
        console.log(behaviourErr, 'behaviourErr');
        return;
      }
      // Store all behaviour data into an array
      data.behaviours = behaviourResult.rows;
      getAndRenderCommentsFromDb(data);
    });
  });
});

// Route: Render a list of notes
app.get('/', (req, res) => {
  let allSightingsObj;
  const getAllNotesQuery = {
    text: 'SELECT *, notes.id AS id FROM notes INNER JOIN users ON user_id=users.id ',
  };
  pool
    .query(getAllNotesQuery)
    .then((result) => {
      allSightingsObj = { sightings: result.rows };
      // Add in current loggedInUser parameter to change navbar display to display current user
      allSightingsObj = includeLoggedInUsername(allSightingsObj,
        req.loggedInUser, req.loggedInUserId);
    })
    .then(() => pool.query('SELECT * FROM species'))
    .then((result) => {
      allSightingsObj.species = result.rows;
      res.render('mainpage/allBirdSightings', allSightingsObj);
    })
    .catch((error) => console.error(error.stack));
});

// Render the edit form
app.get('/note/:id/edit', (req, res) => {
  const { id } = req.params;

  // Subsequent callback function that renders edit form after validating username
  const renderEditForm = (behavioursDataArray) => {
    const getExistingNoteQuery = (`SELECT * FROM notes WHERE id=${id}`);
    pool.query(getExistingNoteQuery, (nextErr, nextResult) => {
      if (nextErr) {
        console.log(nextErr, 'nextErr');
        return;
      }
      const data = nextResult.rows[0];
      data.behaviours = behavioursDataArray;
      console.log(data, 'data-test');
      res.render('editExistingBirdSightingForm', nextResult.rows[0]);
    });
  };

  // Perform validation on whether user can edit/delete a particular sighting
  pool.query(`SELECT user_id FROM notes WHERE id=${id}`, (err, result) => {
    if (err) {
      console.log(err);
      return;
    }
    // Perform validation against hashcode in cookies
    const { loggedInHash } = req.cookies;
    console.log(result.rows[0], 'user-id');
    const userIdFromNote = result.rows[0].user_id;
    // Since we also want to verify whether the id of the note's author is the same
    // as the id of the user access it, we hash the author's Id as well
    const hashedUserIdAsPerNoteString = convertUserIdToHash(userIdFromNote);
    // Here we compare the current user's id hash against
    // the note's author's id hash
    if (loggedInHash !== hashedUserIdAsPerNoteString) {
      res.status(403);
      res.render('displayNotAuthorized');
      return;
    }
    // If valid,
    getAllBehaviourTypes(renderEditForm);
  });
});

// Route: Edit a sighting
app.put('/note/:id/edit', (req, res) => {
  console.log(req.body, 'req.body update');
  const { id } = req.params;
  let behaviourNumArray = [];
  let textQuery = 'UPDATE notes SET';

  async function updateBehaviours(ArrayOfBehaviours) {
    // First Query the database to delete the existing behaviours associated with the note
    pool.query(`DELETE FROM notes_behaviours WHERE note_id=${id}`, (err, result) => {
      if (err) {
        console.log(err);
        return;
      }
      // Next re-insert the new behavours for each of the ids provided in arrayofbehaviours
      ArrayOfBehaviours.forEach((behaviourId) => {
        pool.query(`INSERT INTO notes_behaviours(note_id,behaviour_id) VALUES(${id},${behaviourId}) `, (nextErr, nextResult) => {
          if (nextErr) {
            console.log(nextErr, 'insert behaviour into join table error');
          }
          console.log(nextResult.rows[0], 'behaviour-insertion to join table');
        });
      });
    });
  }
  const updateEditSightingsPage = () => {
    // append the date to update within the array argument
    pool.query(textQuery, [new Date(req.body.date_seen)], (err, result) => {
      if (err) {
        console.log(err, 'error');
        return;
      }
      res.redirect(`/note/${id}`);
    });
  };

  // Iterate through the req.body key value pair to get some value
  Object.entries(req.body).forEach(([key, value]) => {
    if (key === 'flock_size') {
      textQuery += ` ${key}=${Number(value)}`;
      return;
    }

    if (key === 'date_seen') {
      // replace the query with $ notation
      textQuery += `${key}= $1,`;
      return;
    }

    if (key === 'behaviourNum') {
      // Store all the selected behaviourNum in an array
      if (Array.isArray(value)) {
        behaviourNumArray = value;
      } else {
        behaviourNumArray.push(value);
      }
      return;
    }
    // for all other key value pairs
    textQuery += ` ${key}='${value}',`;
  });
  textQuery += ` WHERE id=${id} RETURNING *;`;
  // Update the behaviours asynchronously first
  // once complete, proceed to update the rest of the info asynchronously
  updateBehaviours(behaviourNumArray).then(updateEditSightingsPage);
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
  pool.query(`SELECT user_id FROM notes WHERE id=${id}`, (err, result) => {
    if (err) {
      console.log(err);
      return;
    }
    // Perform validation against hashcode in cookies
    const { loggedInHash } = req.cookies;
    const userIdFromNote = result.rows[0].user_id;
    // Since we also want to verify whether the id of the note's author is the same
    // as the id of the user access it, we hash the author's Id as well
    const hashedUserIdAsPerNoteString = convertUserIdToHash(userIdFromNote);
    // Here we compare the current user's id hash against
    // the note's author's id hash
    if (loggedInHash !== hashedUserIdAsPerNoteString) {
      res.status(403);
      res.render('displayNotAuthorized');
      return;
    }
    // If valid,
    deleteSighting();
  });
});

// Route handler that posts comments on a given note
app.post('/note/:id/comment', (req, res) => {
  console.log(req.body, 'output');
  const { id } = req.params;
  const { comment } = req.body;
  const { loggedInUserId } = req.cookies;
  if (comment != '') {
    const insertCommentQuery = (`INSERT INTO users_notes(comment,note_id,user_id) VALUES('${comment}',${id},${loggedInUserId}) RETURNING *`);
    pool.query(insertCommentQuery, (err, result) => {
      if (err) {
        console.log(err, 'error during inserting comments');
        return;
      }
      res.redirect(`/note/${id}`);
    });
  } else {
    res.redirect(`/note/${id}`);
  }
});

// Route hanlder that renders signup form
app.get('/signup', (req, res) => {
  res.render('navlinks/signup');
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
    const hashedUserIdString = convertUserIdToHash(result.rows[0].id);
    res.cookie('loggedInHash', hashedUserIdString);
    res.cookie('loggedInUser', req.body.username);
    res.cookie('loggedInUserId', result.rows[0].id);
    res.redirect('/successLogin');
  });
});

app.get('/successLogin', (req, res) => {
  const data = {};
  includeLoggedInUsername(data, req.cookies.loggedInUser, req.cookies.loggedInUserId);
  console.log(data, 'test-1');
  res.render('navlinks/successLogin', data);
});

// This doesn't work
// axios.get('/successLogin')
//   .then((response) => response.render('navlinks/successLogin'))
//   .catch((err) => { console.error(err.stack); });

// Route handler that handles logins
app.get('/login', (req, res) => {
  res.render('navlinks/login');
});

// Route handler that posts/submits login info to server for auth
app.post('/login', (req, res) => {
  // Convert req.body.password to hashed password first
  const shaObj = new jsSHA('SHA-512', 'TEXT', { encoding: 'UTF8' });
  shaObj.update(req.body.password);
  const hash = shaObj.getHash('HEX');
  pool.query(`SELECT id from users WHERE password='${hash}'`, (err, result) => {
    if (err) {
      console.log(err, 'error');
    }
    if (result.rows.length === 0) {
      res.status(403);
      res.render('displayErrorPage');
      return;
    }
    // Perform hashing of username using username and salt and
    // send out hashedString in cookie
    const hashedUserIdString = convertUserIdToHash(result.rows[0].id);
    res.cookie('loggedInHash', hashedUserIdString);
    res.cookie('loggedInUser', req.body.username);
    res.cookie('loggedInUserId', result.rows[0].id);
    res.redirect('/user-dashboard');
  });
});

// Deletes cookie with associated username
app.delete('/logout', (req, res) => {
  res.clearCookie('loggedInHash');
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
  // Locally block scoped data for use at the last promise chain
  let data = {};
  // Array of comments;
  let arrayOfCommentPromises = [];
  // First select username based on id provided in url
  pool
    .query(`SELECT id,username FROM users WHERE id= ${id}`)
  // Based on the results obtained, pass it into the next query to get all data from notes
    .then((result) => {
      const { id: userId } = result.rows[0];
      // pool.query itself returns a promise... but to pass it to the next .then()
      // we need to add another return statement to the output of pool.query
      return pool.query(`SELECT * FROM notes WHERE user_id=${userId}`);
    }, (error) => {
      console.log(error);
      throw error;
    })
    .then((nextResult) => {
      data.sightings = nextResult.rows;
      // This loggedInUser refers to user who is currently logged in
      data = includeLoggedInUsername(data, req.loggedInUser, req.loggedInUserId);

      // Get a list of unique species names to view in dropdown button
      const listView = [];
      data.sightings.forEach((sighting) => {
        if (!listView.includes(sighting.species_name)) {
          listView.push(sighting.species_name);
        }
      });
      data.listView = listView;

      // if user specified a species_name through the dropdown button
      // This is an array
      data.selectedSpeciesData = data.sightings.filter((sighting) => sighting.species_name === speciesName);
      console.log(data, 'data-1');

      // Don't have to explicitly return a Promise.resolve() here since .then() handles
      // this for us
      // I think no value is passed on to the next .then();
    })

  // Create an array of Promises that queries and searches for comments
    .then(() => {
      arrayOfCommentPromises = data.selectedSpeciesData.map((selectedData) => pool.query(`SELECT note_id,comment FROM users_notes WHERE user_id = ${data.loggedInUserId} AND note_id = ${selectedData.id}`));
    })

  // Pass in all the comments promises into Promise.all() where it will only resolve when
  // the individual promises are resolved
    .then(() => {
      // not ideal but need to nest .then, but required to access the values from promise.all
      Promise.all(arrayOfCommentPromises)
        .then((promiseResults) => {
          // output the result into an object
          const commentArray = [];

          promiseResults.forEach((result) => {
            result.rows.forEach((row) => {
              commentArray.push(row);
            });
          });

          // Assign comments into data obj to be passed into EJS
          data.comments = commentArray;

          // data.comments = result.rows;
          res.render('navlinks/userBirdSighting', data);
        });
    })
    .catch((err) => console.error(err.stack));
});

// Render a form to create a new species
app.get('/species/create', (req, res) => {
  res.render('navlinks/submitNewSpecies');
});

// Submit a new species
app.post('/species/create', (req, res) => {
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

// Render specific species by index
app.get('/species/:index', (req, res) => {
  const { index } = req.params;

  pool;
  // First select
  res.render('/species/speciesIndex');
});

app.listen(PORT);
