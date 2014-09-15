var counter = 0;

exports.logGet = function(req, res) {
	console.log("Get Callback!!!!!!");
	var data = JSON.parse(req.query.data);
	console.log(data, ++counter);
	res.send(data);
}


exports.logPost = function(req, res) {
	console.log("Post Callback!!!!!!");
	console.log(req.body, ++counter);
	res.send(req.body);
}