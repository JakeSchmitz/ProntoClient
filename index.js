const express = require('express');
const bodyParser = require('body-parser');
const app = express();

var Vantiq = require('vantiq-sdk');
var vantiq = new Vantiq({
    server:     'http://localhost:8080',
    apiVersion: 1
});

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

app.set('view engine', 'ejs');


/**
 * Assuming the user has already authenticated or provided an access token,
 * fetch the list of existing manager nodes in the current namespace and
 * render the list of connected catalogs
 * @param res - The response handler
 */
var getManagers = function(res) {
    var results = {authenticated: true, error: null, managers: []};
    vantiq.select("system.nodes", [], {"ars_properties.manager": "true"}).then((nodes) => {
        results.managers = nodes;
        res.render('index', results);
    }).catch((err) => {
        // Failed to fetch manager nodes from current namespace
        console.error("Failed to select " + JSON.stringify(err));
        results.error = JSON.stringify(err);
        res.render('index', results);
    });
};

/**
 * Route for home page where user is not connected to VANTIQ
 */
app.get('/', function (req, res) {
    res.render('index', {authenticated: false, error: null, managers: [], manager: []});
});

/**
 * Authenticate the SDK using username/ password and then get the known catalogs
 */
app.post('/credentials', function (req, res) {
    // Use sdk to authenticate
    var promise = vantiq.authenticate(req.body.username, req.body.password);
    promise.then((result) => {
        // Successfully authenticated
        getManagers(res);
    }).catch((err) => {
        // Authentication failed for some reason
        res.render('index', {authenticated: false, error: "Failed to authenticate with VANTIQ server", managers: []})
    });
});

/**
 * Update the access token used by the SDK then get the known catalogs
 */
app.post('/token', function(req, res) {
    var token = req.body.token;
    vantiq.accessToken = token;
    getManagers(res);
});

/**
 * After the user is authenticated and has seen a list of known catalogs, fetch the event types
 * from a single catatlog (identified by the manager namespace name)
 */
app.post('/catalog', function(req, res) {
    // The manager returned from authenticate was string encoded in the post, so parse it back into JSON
    var manager = JSON.parse(req.body.manager);
    // Use SDK to fetch a list of all known event types for a manager
    // We can utilize the built-in procedure Broker.getAllEvents
    vantiq.execute("Broker.getAllEvents", {managerNode: manager.name}).then((result) => {
        // The results are a list of ArsEventType object representing events defined in the catalog
        res.render('catalog', {manager: manager, events: result});
    }).catch((err) => {
        console.log("Failed to fetch all events" + JSON.stringify(err));
    });
});

/**
 * Boilerplate to start up the node server and have it listen on 3001
 */
app.listen(3001, function () {
    console.log('Example app listening on port 3001!')
});