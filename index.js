/* gtop
 * "Glass Top": Server monitor for Glass
 */

var prism = require("glass-prism");

// include standard node libraries
var spawn = require("child_process").spawn;
var exec = require("child_process").exec;

var config = require("./config.json");

config.callbacks = {
	subscription: this.onSubscription
};

prism.init(config, function(err) {
	getSystemLoadInfo();

	setInterval(getSystemLoadInfo, config.updateFrequency * 60 * 1000);
});

var onSubscription = function(err, payload) {
	for (var i = 0; i < config.commands.length; i++) {
		for (var j = 0; j < config.commands[i].aliases.length; j++) {
			if (config.commands[i].aliases[j] == data.text) {
				(function(command,token) {
					exec(config.commands[i].command, function(err, stdout, stderr) {
						console.log(stdout);
						oauth2Client.credentials = token;
						if (command.sendback) {
							var apiCall = apiclient.mirror.timeline.insert({
								"html": "<article><section><div class='text-auto-size'><pre>" + stdout + "</pre></div></section><footer>gtop</footer></article>",
								"menuItems": [
							{"action":"REPLY"},
								{"action":"TOGGLE_PINNED"},
								{"action":"DELETE"}
							],
							});
							apiCall.withAuthClient(oauth2Client).execute(function(err,data) {
								console.log(err);
								console.log(data);
							});
						}
					});
				})(config.commands[i],oauth2Client.credentials);
			}
		}
	}
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
	prism.updateAllCards({ card: html });
}

