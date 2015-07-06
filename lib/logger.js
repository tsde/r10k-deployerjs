var log4js = require('log4js');

// Load configuration from env variable LOG4JS_CONFIG and check for file changes every 30 seconds
log4js.configure(process.env.LOG4JS_CONFIG, { reloadSecs: 30 });

var logger = log4js.getLogger('r10k-deployer');

module.exports = logger;
