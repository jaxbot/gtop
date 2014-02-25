/* gtop
 * "Glass Top": Server monitor for Glass
 */

// include standard node libraries
var http = require('http');
var url = require("url");
var fs = require('fs');
var spawn = require("child_process").spawn;

// google api stuff
var googleapis = require('googleapis');

// load in the configuration and use it to connect to the api
var config = require("./config.json");
var oauth2Client = new googleapis.OAuth2Client(config.client_id, config.client_secret, config.redirect_dir);

// dot templates
var dot = require('dot');
var cards = {};

// load all cards and turn into templates
var files = fs.readdirSync("cards/");
for (var i = 0; i < files.length; i++) {
	cards[files[i].replace('.html','')] = dot.template(fs.readFileSync("cards/"+files[i]))
}

// will be set to the results of API discovery
var apiclient = null;

// user card storage
var user_card_ids = {};
var client_tokens = [];

var sessionhash = Math.random() * 1e8;

// read the connected users information from disk
try {
	var filedata = fs.readFileSync(".clienttokens.json");
	if (filedata) {
		client_tokens = JSON.parse(filedata.toString());
		oauth2Client.credentials = client_tokens[0];
	}
} catch(e) {
	console.log("Info: failed to load .clienttokens.json, using blank array");
}

googleapis.discover('mirror','v1').execute(function(err,client) {
	if (err) {
		console.warn("ERR: " + err.toString());
		return;
	}
	apiclient = client;

	// update cards
	getSystemLoadInfo();

	http.createServer(httpHandler).listen(config.port);
});
	
function httpHandler(req,res) {
	var u = url.parse(req.url, true)
	var s = u.pathname.split("/");
	var page = s[s.length-1];

	if (page == "subscription") {
		var postBody = "";
		req.on("data",function(data) {
			postBody += data;
			if (postBody.length > 1024 * 1024) {
				postBody = null;
				req.end();
			}
		});
		req.on("end", function(data) {
			try {
				var d = JSON.parse(postBody);
				console.log(d);

				if (d.verifyToken != sessionhash) {
					console.log("Bad hash!");
					res.end();
					return;
				}

				if (!client_tokens[d.userToken]) {
					console.log("Bad user token");
					res.end();
					return;
				}
				/*
				apiclient.mirror.timeline.get({
					id: d.itemId
				}).withAuthClient(oauth2Client).execute(function(err,data) {
					console.log(err);
					console.log(data);
				});*/
				res.end(200);
			} catch (e) {
				res.end();
			}
		});
	}
	
	if (page == "oauth2callback") {
		oauth2Client.getToken(u.query.code, function(err,tokens) {
			if (err) {
				console.log(err);
				res.writeHead(500);
				res.write("Uh oh: The token login failed. Chances are you loaded a page that was already loaded. Try going back and pressing the 'get it on glass' button again.");
				res.end();
			} else {
				var index = client_tokens.push(tokens) - 1;

				fs.writeFile(".clienttokens.json", JSON.stringify(client_tokens,null,5));

				client_tokens.push(tokens);

				getSystemLoadInfo();

				oauth2Client.credentials = tokens;

				// add subscriptions
				apiclient.mirror.subscriptions.insert({
					"callbackUrl": config.subscription_callback,
					"collection": "timeline",
					"operation": [], // empty set = all
					"userToken": index,
					"verifyToken": sessionhash
				}).withAuthClient(oauth2Client).execute(function(err,data) {
					if (err) {
						console.log(err);
					}
				});

				/*
				
				// add subscriptions
				apiclient.mirror.subscriptions.insert({
					"callbackUrl": config.subscription_callback,
					"collection": "timeline",
					"operation": [], // empty set = all
					"userToken": index,
					"verifyToken": sessionhash
				}).withAuthClient(oauth2Client).execute(function(err,data) {
					if (err) {
						console.log(err);
					}
				});

				// add contact interface
				client.mirror.contacts.insert({
					"id": "gtop_contact_provider_"+config.source_id,
					"displayName": "gtop: " + config.hostname,
					"imageUrls": [config.contactIcon],
					"priority": 7,
					"acceptCommands": [
						{"type":"POST_AN_UPDATE"}
					]
				}).withAuthClient(oauth2Client).execute(function(err,data) {
					if (err)
						console.log(err);
				});
				*/

				res.writeHead(302, { "Location": "success" });
				res.end();
			}
		});
		return;
	}

	if (page == "success") {
		res.writeHead(200, { 'Content-type': 'text/html' });
		fs.createReadStream("pages/index.html").pipe(res);
		return;
	}
	
	if (page == "authorize") {
		var uri = oauth2Client.generateAuthUrl({
			access_type: 'offline',
			approval_prompt: 'force',
			scope: 'https://www.googleapis.com/auth/glass.timeline'
		});
		res.writeHead(302, { "Location": uri });
		res.end();
		return;
	}
	
	// nothing else, so just show default
	res.writeHead(200, { 'Content-type': 'text/html' });
	fs.createReadStream("pages/index.html").pipe(res);
};

function getSystemLoadInfo() {
	var completed = 0,
		args = {
			uptime: 0,
			users: 0,
			avg: 0,
			cpu: 0,
			memtotal: 0,
			memused: 0
		};

	var cb = function() {
		if (++completed == 3) {
			updateLoadInfo(args);
		}
	}

	spawn("uptime").stdout.on('data',function(data) {
		data = data.toString();
		var matches = /up\s+(.*?),\s+([0-9]+) users?,\s+load averages?: (.*)/g.exec(data);
		args.uptime = matches[1];
		args.users = matches[2];
		args.avg = matches[3];
		cb();
	});

	spawn("mpstat").stdout.on('data',function(data) {
		data = data.toString();
		args.stats = data.match(/(\d+\.\d+)/gm);
		args.cpu = (100 - args.stats[args.stats.length-1]).toPrecision(3);
		cb();
	});

	spawn("free",['-m']).stdout.on('data',function(data) {
		data = data.toString();
		args.memtotal = /m:\s+(\d+)/g.exec(data)[1];
		args.memused = /e:\s+(\d+)/g.exec(data)[1];
		cb();
	});
}

function updateLoadInfo(data) {
	data.config = config;
	data.cpuColor = data.cpu < config.midCpuPercentage ? 'green' : 'yellow';
	data.cpuColor = data.cpu > config.highCpuPercentage ? 'red' : data.cpuColor;
	data.memColor = (data.memused/data.memtotal)*100 < config.midMemPercentage ? 'green' : 'yellow';
	data.memColor = (data.memused/data.memtotal)*100 > config.highMemPercentage ? 'red' : data.memColor;

	var html = cards.main(data);

	for (i = 0; i < client_tokens.length; i++) {
		(function(tokens) {
			oauth2Client.credentials = tokens;
			apiclient.mirror.timeline.list({ "sourceItemId": config.source_id, "isPinned": true })
			.withAuthClient(oauth2Client)
			.execute(function(err,data) {
				var apiCall;
				if (err) {
					console.log(err);
					return;
				}
				if (data && data.items.length > 0) {
					apiCall = apiclient.mirror.timeline.patch({"id": data.items[0].id }, {"html": html});
				} else {
					apiCall = apiclient.mirror.timeline.insert({
						"html": html,
						"menuItems": [
							{"action":"TOGGLE_PINNED"},
							{"action":"DELETE"}
						],
						"sourceItemId": config.source_id
					});
				}

				oauth2Client.credentials = tokens;

				apiCall.withAuthClient(oauth2Client).execute(function(err,data) {
					console.log(err);
					console.log(data);
				});
			});
		})(client_tokens[i]);
	}
}

setInterval(getSystemLoadInfo, config.updateFrequency * 60 * 1000);

