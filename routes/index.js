
app = require('../app');

var subscription = require('./subscription');
var home = require('./home');
var callback = require('./callback');


exports.initRoutes = function(mongoTrigger) {
  app.get('/home', home.main);
  
  app.get('/newsubscription', subscription.newsubscription(mongoTrigger)); 
  app.post('/addsubscription', subscription.addsubscription(mongoTrigger));

  app.get('/callback', callback.logGet);
  app.post('/callback', callback.logPost);
  
  /*
  app.get('/home', home.main(mongoTriggerCnxStr));
  app.get('/newsubscription', subscription.newsubscription(appHostString)); 
  app.post('/addsubscription', subscription.addsubscription(mongoTriggerCnxStr, this));
  app.get('/callback', callback.logGet);
  app.post('/callback', callback.logPost);
  */
}
