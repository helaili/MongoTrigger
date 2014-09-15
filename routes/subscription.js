var MongoClient = require('mongodb').MongoClient;

var db; 

MongoClient.connect(app.get("mongoTriggerCnxStr"), function(err, database) {
	if(err) { 
    	return console.dir(err); 
	}

	db = database;
});

	  	
exports.newsubscription = function(mongoTrigger) {
	return function(req, res) {
		MongoClient.connect(mongoTrigger.appAdminDBCnxStr, function(err, db) {
    		if(err) { 
        		return console.dir(err); 
    		}
    
			return db.command({listDatabases: 1}, function(err, result) {
				if(err) { 
					return console.dir(err); 
				}

				var namespaces = [];
				namespaces = retrieveNamespace(req, res, db, mongoTrigger.appHostString, result.databases, 0, namespaces); 		
				db.close();	
			});
		});
  	};
};


function retrieveNamespace(req, res, db, hostString, databaseList, index, namespaces) {
	if(databaseList.length == index) {
		res.render('newsubscription', 
			{'title' : 'MongoTrigger', 
			 'headline' : 'Subscription manager', 
			 'operationTypes' : [
				{'value': 'a', 'label': 'All operations'}, 
				{'value': 'i', 'label': 'Insert operations'}, 
				{'value': 'u', 'label': 'Update operations'}, 
				{'value': 'd', 'label': 'Delete opeartions'}
			],
			'namespaces': namespaces});

	} else {
		var cnxUrl = hostString + "/" + databaseList[index].name

		MongoClient.connect(cnxUrl, function(err, db2) {
	    	if(err) { 
	        	return console.dir(err); 
	    	}


	    	db2.collectionNames({namesOnly : true}, function(err, nsArray) {
	    		db2.close();
	    		namespaces = namespaces.concat(nsArray);
	    		retrieveNamespace(req, res, db, hostString, databaseList, index+1, namespaces) 
	    	});				
	      			
	    });
    }
} 


exports.addsubscription = function(mongoTrigger) {
	return function(req, res) {
		
		req.body.active = true;
		
		db.collection('subscription').insert(req.body, function(e,docs){
			mongoTrigger.emit('reset');
			res.redirect('/home');
		});			
  	};
};




