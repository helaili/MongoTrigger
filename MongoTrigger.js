var events = require('events');
var util = require('util');
var http = require('http');

var MongoClient = require('mongodb').MongoClient;
var logMgr = require('./logger');


MongoTrigger = function(mongoTriggerCnxStr, appHostString){
  events.EventEmitter.call(this);
  this.mongoTriggerCnxStr = mongoTriggerCnxStr;
  this.appHostString = appHostString;
  this.appAdminDBCnxStr = appHostString+"/admin";
  this.filterArray = [];
  this.subscriptions = {};
  this.streams = [];
  this.mtdb = {};
  this.localdbs = {};

  var self = this;



  this.init = function() {
    logMgr.logger.info("Initializing Mongo Trigger"); 
    
    MongoClient.connect(this.mongoTriggerCnxStr, function(err, db) {
      if(err) { 
          return logMgr.logger.error("MongoTrigger.init - connect", err); 
      }

      self.mtdb = db;

      self.mtdb.collection('subscription').find({active: true}, function(err,cursor){
        if(err) { 
          return logMgr.logger.error("MongoTrigger.init - subscription.find", err); 
        }

        cursor.toArray(function(err, items) {
          if(err) { 
            return logMgr.logger.error("MongoTrigger.init - cursor", err); 
          }

          for(var itemIndex in items) {
            self.addSubscription(items[itemIndex].ns, items[itemIndex].op, items[itemIndex].cb);
          }
          self.retrieveShardList();
        });
      });   
    });
  }

  this.reset = function() {
    logMgr.logger.info("Reseting Mongo Trigger"); 
    for(var streamIndex in this.streams) {
      this.streams[streamIndex].emit('close');
    }

    this.filterArray = [];
    this.subscriptions = {};
    this.streams = [];
    this.localdbs = {};

    self.emit('init');
  }

  this.addSubscription = function(ns, op, cb) {
    var filter = {};
    filter.ns = ns;

    if(this.subscriptions[ns] == null) {
      this.subscriptions[ns] = { 'i' : [], 'u' : [], 'd': []};
    }
    
    if(op != "a") {
      filter.op = op;
      this.subscriptions[ns][op].push(cb);
    } else {
      this.subscriptions[ns].i.push(cb);
      this.subscriptions[ns].u.push(cb);
      this.subscriptions[ns].d.push(cb);
    }

    this.filterArray.push(filter);  
  }

  this.retrieveShardList = function() {
    //Connect to the admin DB of the cluster
    MongoClient.connect(this.appAdminDBCnxStr, function(connectAppError, db) {
      if(connectAppError) { 
          return logMgr.logger.error("MongoTrigger.retrieveShardList - connect", connectAppError);
      }
      //Retrieve the list of shards
      db.command({listShards: 1}, function(commandError, result) {
        if(commandError) { 
          return logMgr.logger.error("MongoTrigger.retrieveShardList - listShards", commandError);
        }

        for(var shard in result.shards) {
          //generate the query for the local db on each shard (mongodb://xxx:27110,yyy:27111,zzz:27112/local)
          var appLocalDBCnxStr = "mongodb://"+result.shards[shard].host.substring(result.shards[shard].host.indexOf("/")+1)+"/local";
          self.connectToShards(result.shards[shard]._id, appLocalDBCnxStr);

        }

        db.close();
        return result;
      });
    });
  }

  this.connectToShards = function(shard, appLocalDBCnxStr) {
    MongoClient.connect(appLocalDBCnxStr, function(connectAppError, appLocalDb) {
      if(connectAppError) { 
        return logMgr.logger.error("MongoTrigger.connectToShards - connect local", connectAppError);
      }

      self.localdbs[appLocalDBCnxStr] = appLocalDb;
      self.retrieveLastOp(shard, appLocalDBCnxStr);
    });
  }

  //When was the last event processed before going down. How far back should we go in the oplog?
  this.retrieveLastOp = function(shard, appLocalDBCnxStr) {
    self.mtdb.collection('execution').find({'_id' : shard}).nextObject(function(e,lastItem) {
        
      if(lastItem == null) {
        //No previous item recorded so we need to start from the end of the tailOplog 
       
        self.localdbs[appLocalDBCnxStr].collection('oplog.rs').find({}, {ts : 1}, {sort : {$natural : -1}, limit : 1}).nextObject(function(e,lastItem){
          db.close();
          logMgr.logger.info(shard, "No previous execution. Using last item from oplog", lastItem.ts);
          self.tailOplog(shard, appLocalDBCnxStr, lastItem);
        });
      } else {
        //Starting from last item
        logMgr.logger.info(shard, "Previous execution found", lastItem.ts);
        self.tailOplog(shard, appLocalDBCnxStr, lastItem);
      }
          
    });
  }


  //Apply the filters to the oplog query, get every new matching event and keep track of last execution
  this.tailOplog = function(shard, appLocalDBCnxStr, lastItem) {
    logMgr.logger.info("Connecting to " + shard + " with " + appLocalDBCnxStr);

    if(self.filterArray.length > 0) {

      //Tail the oplog of a shard based of the filter, after last read, exclude migrating docs
      var stream = self.localdbs[appLocalDBCnxStr].collection('oplog.rs').find({$or : self.filterArray, 'ts' : {$gt : lastItem.ts}, 'fromMigrate' : {$exists : false}}, {tailable: true, awaitData: true}).stream();
      self.streams.push(stream);


      stream.on('close', function() {
        return logMgr.logger.error("Closing stream");
      });

      //New doc received
      stream.on('data', function(data) {
        
          //Record this new event as the last one processed so we know where to start over in case of downtime
        self.mtdb.collection('execution').update({'_id' : shard}, {'ts': data.ts}, {upsert : true}, function(updateError, result) {
          if(updateError) { 
            self.logCallBackError(options, "Failed to update last execution date");
            return logMgr.logger.error("MongoTrigger.tailOplog - update execution", updateError);
          }

          //Calling every suscriber of this event
          for(item in self.subscriptions[data.ns][data.op]) {
            var options = {};
            options.method = self.subscriptions[data.ns][data.op][item].method;
            options.host = self.subscriptions[data.ns][data.op][item].host;
            options.port = self.subscriptions[data.ns][data.op][item].port;

            if(options.method == "GET") {
              options.path = self.subscriptions[data.ns][data.op][item].path + "?data=" + JSON.stringify(data);
            } else { //POST
              var dataString = JSON.stringify(data);
              
              options.headers = {};
              options.headers = { 'Content-Type': 'application/json', 'Content-Length': dataString.length};
              options.path = self.subscriptions[data.ns][data.op][item].path;
              //options.body = JSON.stringify(data);
              options.json = true;
            }
            
            
            var req = http.request(options, function(res) {
              res.setEncoding('utf8');
              res.on('data', function (chunk) {
                //console.log('BODY: ' + chunk);
              });
            });
            
            if(options.method != "GET") {
              req.write(dataString);
            }
            
            req.end();

            req.on("error", function (){
              self.logCallBackError(options, "Failed to reach subscriber");
            });
          }
        });   
      });
    }
  }

 

  // Save data which could not be sent to a subscriber into the 'error' collection 
  this.logCallBackError = function(options, message) {
    //adding a date to register time of failure
    options.when = new Date();
    options.message = message;

    self.mtdb.collection('error').insert(options, function(insertError, docs) {
      if(insertError) { 
        return logMgr.logger.error(insertError); 
      }
      
      logMgr.logger.warn("CALLBACK ERROR", options); 
    });   
  }

  
  this.on('init', this.init);
  this.on('reset', this.reset);
  
 };


util.inherits(MongoTrigger, events.EventEmitter);