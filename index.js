const express = require('express');
const bodyParser = require('body-parser');
const uuidv4 = require('uuid/v4');
const app = express();

var Vantiq = require('vantiq-sdk');

// Holder to contain all the different vantiq sdk instances
// This is necessary to support multiple simultaneous users
var vantiqSessions = {};

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

app.set('view engine', 'ejs');

/**
 * Assuming the user has already authenticated or provided an access token,
 * fetch the list of existing manager nodes in the current namespace and
 * render the list of connected catalogs
 * @param res - The response handler
 */
var getManagers = function(vantiq, sessionId, res) {
    var results = {authenticated: true, error: null, managers: [], sessionId: sessionId};
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
 * Given a manager, get all events in that managers catalog and render the catalog view
 * This process also requires looking up all ArsEventSubscriber and ArsEventPublisher records
 * to figure out if the current namespace is already a publisher or subscriber for any existing
 * events
 * @param res
 */
var renderCatalogForManager = function(vantiq, sessionId, manager, res) {
    // Use SDK to fetch a list of all known event types for a manager
    // We can utilize the built-in procedure Broker.getAllEvents
    vantiq.execute("Broker.getAllEvents", {managerNode: manager.name}).then((events) => {

        // Now get all known subcriptions
        vantiq.select("ArsEventSubscriber", [], {}).then((subscribers) => {

            // Lastly get all publishers
            vantiq.select("ArsEventPublisher", [], {}).then((publishers) => {

                // Now merge the subscriber and publisher information into the event types
                for (var i = 0; i < events.length; i++) {

                    // search publishers for any that match this event
                    for (var j = 0; j < publishers.length; j++) {
                        // Match the event type name to the publisher name
                        if (publishers[j].name === events[i].name) {
                            events[i].publisher = publishers[j];
                        }
                    }

                    // do the same for subscribers
                    for (var j = 0; j < subscribers.length; j++) {
                        // Match the event type name to the subscriber name
                        if (subscribers[j].name === events[i].name) {
                            events[i].subscriber = subscribers[j];
                        }
                    }
                }

                // The results are a list of ArsEventType object representing events defined in the catalog
                res.render('catalog', {manager: manager, events: events, sessionId: sessionId});
            }).catch((err) => {
                console.log("Failed to fetch all publishers: " + JSON.stringify(err));
            });
        }).catch((err) => {
            console.log("Failed to fetch all subscribers: " + JSON.stringify(err));
        });
    }).catch((err) => {
        console.log("Failed to fetch all events: " + JSON.stringify(err));
    });
};

/**
 * Route for home page where user is not connected to VANTIQ
 */
app.get('/', function (req, res) {
    // Create a new vantiq sdk instance for this session
    // TODO: we should manage this in session/ cookie data instead of passing it back and forth in each request
    var vantiq = new Vantiq({
        server:     'http://localhost:8080',
        apiVersion: 1
    });
    console.log(vantiq);
    // Generate a unique identifier for this session
    var sessionId = uuidv4();
    console.log(sessionId);
    vantiqSessions[sessionId] = vantiq;
    console.log(vantiqSessions);
    res.render('index', {authenticated: false, error: null, managers: [], manager: [], sessionId: sessionId});
});

/**
 * Authenticate the SDK using username/ password and then get the known catalogs
 */
app.post('/credentials', function (req, res) {
    console.log(req.body);
    var vantiq = vantiqSessions[req.body.sessionId];
    console.log(vantiq);
    // Use sdk to authenticate
    var promise = vantiq.authenticate(req.body.username, req.body.password);
    promise.then((result) => {
        // Successfully authenticated
        getManagers(vantiq, req.body.sessionId, res);
    }).catch((err) => {
        console.log(err);
        // Authentication failed for some reason
        res.render('index', {authenticated: false, error: "Failed to authenticate with VANTIQ server", managers: [], sessionId: req.body.sessionId})
    });
});

/**
 * Update the access token used by the SDK then get the known catalogs
 */
app.post('/token', function(req, res) {
    var vantiq = vantiqSessions[req.body.sessionId];
    var token = req.body.token;
    vantiq.accessToken = token;
    getManagers(vantiq, req.body.sessionId, res);
});

/**
 * After the user is authenticated and has seen a list of known catalogs, fetch the event types
 * from a single catatlog (identified by the manager namespace name)
 */
app.post('/catalog', function(req, res) {
    var vantiq = vantiqSessions[req.body.sessionId];
    // The manager returned from authenticate was string encoded in the post, so parse it back into JSON
    var manager = JSON.parse(req.body.manager);
    renderCatalogForManager(vantiq, req.body.sessionId, manager, res);
});

/**
 * Called when the subscribe button is clicked on an event type in the catalog
 * this button is only visible for events where the current namespace is not already
 * a subscriber
 */
app.post('/subscribeForm', function(req, res) {
    var vantiq = vantiqSessions[req.body.sessionId];
    var event = JSON.parse(req.body.event);
    var manager = JSON.parse(req.body.manager);
    // Render the subscribe page, which includes a form to register as a subscriber
    res.render('subscribe', {event: event, manager: manager, error: null, sessionId: req.body.sessionId});
});

/**
 * Similar to /subscribe, but for publish
 */
app.post('/publishForm', function(req, res) {
    var vantiq = vantiqSessions[req.body.sessionId];
    var event = JSON.parse(req.body.event);
    var manager = JSON.parse(req.body.manager);
    // Render the subscribe page, which includes a form to register as a subscriber
    res.render('publish', {event: event, manager: manager, error: null, sessionId: req.body.sessionId});
});

/**
 * Boilerplate to start up the node server and have it listen on 3001
 */
app.listen(3001, function () {
    console.log('Example app listening on port 3001!')
});