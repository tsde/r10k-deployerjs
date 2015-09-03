var log4js = require('log4js');

// Load configuration from env variable LOG4JS_CONFIG
log4js.configure(process.env.LOG4JS_CONFIG, {});

var logger = log4js.getLogger('r10k-deployer');

module.exports = logger;
