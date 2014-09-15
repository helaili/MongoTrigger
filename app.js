var express = require('express');
var http = require('http');
var path = require('path');
var favicon = require('static-favicon');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');


var logMgr = require('./logger');
var MongoTriggerReq = require('./MongoTrigger');


var argv = require('optimist').argv; 

var mongoTriggerCnxStr = argv.mtdb;
var appHostString  = argv.appdb;

if(mongoTriggerCnxStr == null || appHostString == null) {
    return console.log("Missing parameter. Example : node app.js --mtdb=\"mongodb://localhost:27017/mongoTrigger\" --appdb=\"mongodb://localhost:27017\"");
}


var app = module.exports = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.set("mongoTriggerCnxStr", mongoTriggerCnxStr);

app.use(favicon());
app.use(logMgr.expressErrorLogger());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(app.router);




/// catch 404 and forwarding to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

/// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.render('error', {
        message: err.message,
        error: {}
    });
});



var mongoTrigger = new MongoTrigger(mongoTriggerCnxStr, appHostString);
mongoTrigger.emit('init');

require('./routes').initRoutes(mongoTrigger);



app.listen(3000);


