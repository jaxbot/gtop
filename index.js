var http = require('http');
var url = require("url");
var spawn = require("child_process").spawn;
var googleapis = require('googleapis');
var OAuth2Client = googleapis.OAuth2Client;

var config = require("./config.json");

var oauth2Client = new OAuth2Client(config.client_id, config.client_secret, config.redirect_dir);

var apiclient = null;

var our_card_id = "";

googleapis.discover('mirror','v1').execute(function(err,client) {
	if (err) {
		console.warn("ERR: " + err.toString());
		return;
	}
	apiclient = client;

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
				oauth2Client.credentials = tokens;
				console.log(tokens);
				//res.writeHead(301, { "Location": "timeline" });
			}
			res.write('');
			res.end();
			
			apiclient.mirror.timeline.list({ "sourceItemId": "gtop_" + config.hostname }).withAuthClient(oauth2Client).
				execute(function(err,data) {
					console.log(data);
					if (data.items.length > 0) {
						our_card_id = data.items[0].id;
					}
				});
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
		uptime = 0,
		users = 0,
		avg = 0,
		cpu = 0,
		memtotal = 0,
		memused = 0;

	var cb = function() {
		if (++completed == 3) {
			updateLoadInfo(uptime, users, avg, cpu, memtotal, memused);
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

function updateLoadInfo(uptime, users, avg, cpu, memtotal, memused) {
	var cpuColor = 'green', memColor = 'green';
	if (cpu > config.midCpuPercentage) cpuColor = 'yellow';
	if (cpu > config.highCpuPercentage) cpuColor = 'red';
	if ((memused/memtotal)*100 > config.midMemPercentage) memColor = 'yellow';
	if ((memused/memtotal)*100 > config.highMemPercentage) memColor = 'red';

	var html = "<article><section><div class=\"text-auto-size\"><p>"+config.hostname+"</p><p><span class='"+cpuColor+"'>" + cpu + "%</span> cpu, <span class='text-small'>avg. " + avg + "</span></p><p class='"+memColor+"'>"+memused+"/"+memtotal+"mb</p><p>"+users+" users</p></div></section><footer><div>"+uptime+"</div></footer></article>";

	console.log(html);
	
	var apiCall;
	if (our_card_id) {
		apiCall = apiclient.mirror.timeline.patch({id: our_card_id }, {"html": html});
		console.log("UPDATE MODE:"+our_card_id);
	}
	else
		apiCall = apiclient.mirror.timeline.insert({
			"html": html,
			"menuItems": [
				{"action":"TOGGLE_PINNED"},
				{"action":"REPLY"},
				{"action":"DELETE"}
			],
			"sourceItemId": "gtop_" + config.hostname
		});

	apiCall.withAuthClient(oauth2Client).execute(function(err,data) {
		console.log(err);
		console.log(data);
		if (!our_card_id)
			our_card_id = data.id;
	});
}

