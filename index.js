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
var OAuth2Client = googleapis.OAuth2Client;

// load in the configuration and use it to connect to the api
var config = require("./config.json");
var oauth2Client = new OAuth2Client(config.client_id, config.client_secret, config.redirect_dir);

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
				client_tokens.push(tokens);
				fs.writeFileSync(".clienttokens.json", JSON.stringify(client_tokens,null,5));
				getSystemLoadInfo();
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
					"id": "gtop_contact_provider_"+config.hostname,
					"displayName": "gtop: " + config.hostname,
					"imageUrls": [config.contactIcon],
					"priority": 7,
					"acceptCommands": [
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
};

function getSystemLoadInfo() {
	var completed = 0,
		data = {
			uptime: 0,
			users: 0,
			avg: 0,
			cpu: 0,
			memtotal: 0,
			memused: 0
		};

	var cb = function() {
		if (++completed == 3) {
			updateLoadInfo(data);
		}
	}

	spawn("uptime").stdout.on('data',function(data) {
		data = data.toString();
		var matches = /up\s+(.*?),\s+([0-9]+) users?,\s+load averages?: (.*)/g.exec(data);
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

function updateLoadInfo(data) {
	data.cpuColor = cpu > config.midCpuPercentage ? 'green' : 'yellow';
	data.cpuColor = cpu > config.highCpuPercentage ? 'red' : data.cpuColor;
	data.memColor = (memused/memtotal)*100 > config.midMemPercentage ? 'green' : 'yellow';
	data.memColor = (memused/memtotal)*100 > config.highMemPercentage ? 'red' : data.memColor;

	var html = cards.main(data);

	for (i = 0; i < client_tokens.length; i++) {
		oauth2Client.credentials = client_tokens[i];
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

			apiCall.withAuthClient(oauth2Client).execute(function(err,data) {
				console.log(err);
				console.log(data);
			});
		});
	}
}

setInterval(getSystemLoadInfo, config.updateFrequency * 60 * 1000);

