var http = require('http');
var url = require("url");
var spawn = require("child_process").spawn;
var googleapis = require('googleapis');
var OAuth2Client = googleapis.OAuth2Client;

var CLIENT_ID = "5507397964.apps.googleusercontent.com";
var CLIENT_SECRET = "";
var REDIRECT_DIR = "https://sparklr.me/foodlog/oauth2callback";

var oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_DIR);

var config = {
	hostname: "jaxbot.me"
}

http.createServer(function(req,res) {
	var u = url.parse(req.url, true)
	var s = u.pathname.split("/");
	s.shift();

	if (s[1] == "subscription") {
		console.log("sub received.");
		var postBody = "";
		req.on("data",function(data) {
			postBody += data;
		});
		req.on("end", function(data) {
			var d = JSON.parse(postBody);
			console.log(d);
			
			googleapis.discover('mirror','v1').execute(function(err,client) {
				client.mirror.timeline.get({
					id: d.itemId
				}).withAuthClient(oauth2Client).execute(function(err,data) {
					console.log(err);
					console.log(data);
					if (data.attachments) {
						http.get(data.attachments[0].contentUrl + "&access_token=" + oauth2Client.credentials.access_token, function(res) {
						console.log(res);
						});
					}
				});
			});
			res.end(200);
		});
	}
	
	if (s[1] == "oauth2callback") {
		oauth2Client.getToken(u.query.code, function(err,tokens) {
			if (err) {
				console.log(err);
			} else {
				oauth2Client.credentials = tokens;
				console.log(tokens);
				res.writeHead(301, { "Location": "timeline" });
			}
			res.write('');
			res.end();
				
		});
		return;
	}
	
	if (!oauth2Client.credentials) {
		var uri = oauth2Client.generateAuthUrl({
			access_type: 'offline',
			scope: 'https://www.googleapis.com/auth/glass.timeline'
		});
		res.writeHead(301, { "Location": uri });
		res.end();
	} else {
		if (s[1] == "subscribe") {
			googleapis.discover('mirror','v1').execute(function(err,client) {
				client.mirror.subscriptions.insert({
					"callbackUrl": "https://sparklr.me/foodlog/subscription",
					"collection": "timeline",
					"operation": [],
					"userToken": "idc",
					"verifyToken": "istilldontcare"
				}).withAuthClient(oauth2Client).execute(function(err,data) {
				});
			});
		}
		if (s[1] == "contact") {
			googleapis.discover('mirror','v1').execute(function(err,client) {
				client.mirror.contacts.insert({
					"id": "food_log",
					"displayName": "Food Log",
					"priority": 7,
					"acceptCommands": [
						{"type":"TAKE_A_NOTE"},
						{"type":"POST_AN_UPDATE"}
					]
				}).withAuthClient(oauth2Client).execute(function(err,data) {
					console.log(err);
					console.log(data);
				});
			});
		}
		if (s[1] == "timeline") {
			getSystemLoadInfo();
		}
		res.write('Glass Mirror API with Node');
		res.end();
	}
}).listen(8099);

function getSystemLoadInfo() {
	var completed = 0,
		uptime = 0,
		users = 0,
		avg = 0,
		cpu = 0,
		memtotal = 0,
		memused = 0;

	var cb = function() {
		console.log(completed);
		if (++completed == 3) {
			updateLoadInfo(uptime, users, avg, cpu, memtotal, memused);
		}
	}

	spawn("uptime").stdout.on('data',function(data) {
		data = data.toString();
		var matches = /up\s+(.*?),\s+([0-9]+) users?,\s+load averages?: (.*)/g.exec(data);
		console.log(matches);
		uptime = matches[1];
		users = matches[2];
		avg = matches[3];
		cb();
	});

	spawn("mpstat").stdout.on('data',function(data) {
		data = data.toString();
		stats = data.match(/(\d+\.\d+)/gm);
		cpu = (100 - stats[stats.length-1]).toPrecision(3);
		cb();
	});

	spawn("free",['-m']).stdout.on('data',function(data) {
		data = data.toString();
		memtotal = /m:\s+(\d+)/g.exec(data)[1];
		memused = /e:\s+(\d+)/g.exec(data)[1];
		cb();
	});
}

function updateLoadInfo(uptime, users, avg, cpu, memtotal, memused) {
	googleapis.discover('mirror','v1').execute(function(err,client) {
		client.mirror.timeline.insert({
			"callbackUrl": "http://localhost:8099/",
			"html": "<article>\n  <section>\n    <div class=\"text-auto-size\">\n      <p>"+config.hostname+"</p>\n<p><span class='green'>" + cpu + "%</span> cpu, <span class='text-small'>avg. " + avg + "</span></p>\n      <p>"+memused+"/"+memtotal+"mb</p>\n      <p>"+users+" users</p>\n    </div>\n  </section>\n  <footer>\n    <div>"+uptime+"</div>\n  </footer>\n</article>",
			"menuItems": [
				{"action":"TOGGLE_PINNED"},
				{"action":"REPLY"},
				{"action":"DELETE"}
			]
		}).withAuthClient(oauth2Client).execute(function(err,data) {
			console.log(err);
			console.log(data);
		});
	});
}

