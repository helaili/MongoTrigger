

var winston = require('winston');
var expressWinston = require('express-winston');

exports.logger = new (winston.Logger)({
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'all-logs.log.js' })
    ],
    exceptionHandlers: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'exceptions.log.js' })
    ]
});

exports.expressErrorLogger = function() {
	return expressWinston.errorLogger({
    	transports: [
        	new winston.transports.Console({
            	json: true,
            	colorize: true
        	})
    	]
	});
}