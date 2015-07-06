var koa = require('koa');
var router = require('koa-router')();
var plugin = require('./lib/middleware');
var KU = require('./lib/kueUtils');
var logger = require('./lib/logger');

var app = koa();


// Env variables are mandatory
if (!process.env.LOG4JS_CONFIG || !process.env.PUPPETFILE_URL || !process.env.RD_BASEURL || !process.env.RD_API_VERSION || !process.env.RD_PROJECT_NAME || !process.env.RD_API_TOKEN || !process.env.RD_API_JOB_ENV_ID || !process.env.RD_API_JOB_MOD_ID) {
	logger.fatal('!! OOOPS !! The following environment variables are mandatory:\n\t- LOG4JS_CONFIG: Path to your logger configuration file\n\t- PUPPETFILE_URL: Your Puppetfile git repository URL\n\t- RD_BASEURL: Rundeck base URL\n\t- RD_API_VERSION: Version number of Rundeck API\n\t- RD_API_TOKEN: Token used to access Rundeck API\n\t- RD_PROJECT_NAME: Name of your Rundeck project where are configured your job\n\t- RD_API_JOB_ENV_ID: ID of the job used to deploy entire environments with r10k\n\t- RD_API_JOB_MOD_ID: ID of the job used to deploy a single module in a specific environment with r10k');
	process.exit(1);
}

// Launch Kue processor
KU.processJob();

// Define routes
router.post('/gitlab', plugin.gitlabProcess());

// Use middlewares
app
	.use(plugin.pageNotFound())
	.use(router.routes())
	.use(router.allowedMethods());

app.listen(3000);

logger.info('Koa started on port 3000');
