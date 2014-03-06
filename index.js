/* gtop
 * "Glass Top": Server monitor for Glass
 */

var prism = require("glass-prism");

// include standard node libraries
var spawn = require("child_process").spawn;
var exec = require("child_process").exec;
var os = require("os");

var config = require("./config.json");

config.callbacks = {
	subscription: this.onSubscription,
	newclient: this.onNewClient
};

prism.init(config, function(err) {
	getSystemLoadInfo();

	setInterval(getSystemLoadInfo, config.updateFrequency * 60 * 1000);
});

var onNewClient = function(tokens) {
	getSystemLoadInfo();
};

var onSubscription = function(err, payload) {
	for (var i = 0; i < config.commands.length; i++) {
		for (var j = 0; j < config.commands[i].aliases.length; j++) {
			if (config.commands[i].aliases[j] == data.text) {
				exec(config.commands[i].command, function(err, stdout, stderr) {
					console.log(stdout);

					var html = "<article><section><div class='text-auto-size'><pre>" + stdout + "</pre></div></section><footer>gtop</footer></article>";

					if (config.commands[i].sendback)
						prism.insertCard({ token: payload.token, card: html });
				}
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

	args.uptime = os.uptime();
	args.avg = os.loadAvg().join(" ");
	args.memtotal = os.totalmem();
	args.memused = os.totalmem() - os.freemem();
	
	updateLoadInfo(args);
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

