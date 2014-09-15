

var MongoClient = require('mongodb').MongoClient;
var db; 

MongoClient.connect(app.get("mongoTriggerCnxStr"), function(err, database) {
	if(err) { 
    	return console.dir(err); 
	}

	db = database;
});

exports.main = function(req, res) {	
	db.collection('subscription').find({}, function(e,cursor){
		cursor.toArray(function(err, items) {
	    	if(err) { 
	      		return console.dir(err); 
	    	}

	    	db.close();
	    	res.render('home', {'title' : 'MongoTrigger', 'headline' : 'Mongo Trigger', 'subscriptionTableTitle' : 'Registered subscriptions', 'subscriptions' : items});
	  	});
	});
}
