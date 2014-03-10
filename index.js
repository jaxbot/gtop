/* gtop
 * "Glass Top": Server monitor for Glass
 * By Jonathan Warner (@jaxbot)
 * 
 * Instructions, install, etc: http://okaysass.com/posts/gtop
 */

// uses glass-prism Node.js library to interface with Glass
var prism = require("glass-prism");

// include standard node libraries
var spawn = require("child_process").spawn;
var exec = require("child_process").exec;
var os = require("os");

// load configuration for this instance
var config = require("./config.json");

// for fuzzy time
var time = require("./time");

config.callbacks = {
	subscription: onSubscription,
	newclient: onNewClient
};

prism.init(config, function(err) {
	getSystemLoadInfo();

	setInterval(getSystemLoadInfo, config.updateFrequency * 60 * 1000);
});

function onNewClient(tokens) {
	getSystemLoadInfo();
};

function onSubscription(err, payload) {
	for (var i = 0; i < config.commands.length; i++) {
		for (var j = 0; j < config.commands[i].aliases.length; j++) {
			if (config.commands[i].aliases[j] == data.text) {
				exec(config.commands[i].command, function(err, stdout, stderr) {
					console.log(stdout);
					
					var html = prism.cards.stdout({ stdout: stdout, command: config.commands[i].command });
					
					if (config.commands[i].sendback)
						prism.insertCard({ token: payload.token, html: html });
				});
			}
		}
	}
};

function getSystemLoadInfo() {
	var args = {
		uptime: 0,
		avg: 0,
		memtotal: 0,
		memused: 0,
		cpuColor: 'green',
		memColor: 'green',
		config: config
	};

	args.uptime = time.getRelativeTime(os.uptime());

	var avg = os.loadavg();

	for (var i=0;i<avg.length;i++) {
		avg[i] = avg[i].toPrecision(3);
	}

	args.avg = avg.join(" ");
	args.memtotal = Math.round((os.totalmem() / 1024 / 1024));
	args.memused = Math.round(((os.totalmem() - os.freemem()) / 1024 / 1024));

	var mempercent = (args.memused/args.memtotal) * 100;

	if (avg[0] > config.midCpuLoad)
		if (avg[0] > config.highCpuLoad)
			args.cpuColor = 'red';
		else
			args.cpuColor = 'yellow';
	if (mempercent > config.midMemPercentage)
		if (mempercent > config.highMemPercentage)
			args.memColor = 'red';
		else
			args.memColor = 'yellow';

	var html = prism.cards.main(args);
	prism.updateAllCards({ html: html, pinned: true, sourceItemId: "gtop_"+config.hostname });

};

