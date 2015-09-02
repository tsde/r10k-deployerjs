var https = require('https');
var fs = require('fs');
var koa = require('koa');
var router = require('koa-router')();
var plugin = require('./lib/middleware');
var KU = require('./lib/kueUtils');
var logger = require('./lib/logger');


// Env variables are mandatory
if (!process.env.LOG4JS_CONFIG
 || !process.env.PUPPETFILE_URL
 || !process.env.RD_BASEURL
 || !process.env.RD_API_VERSION
 || !process.env.RD_PROJECT_NAME
 || !process.env.RD_API_TOKEN
 || !process.env.RD_API_JOB_ENV_ID
 || !process.env.RD_API_JOB_MOD_ID) {
  logger.fatal('!! OOOPS !! The following environment variables are mandatory:\n\t- LOG4JS_CONFIG: Path to your logger configuration file\n\t- PUPPETFILE_URL: Your Puppetfile git repository URL\n\t- RD_BASEURL: Rundeck base URL\n\t- RD_API_VERSION: Version number of Rundeck API\n\t- RD_API_TOKEN: Token used to access Rundeck API\n\t- RD_PROJECT_NAME: Name of your Rundeck project where are configured your job\n\t- RD_API_JOB_ENV_ID: ID of the job used to deploy entire environments with r10k\n\t- RD_API_JOB_MOD_ID: ID of the job used to deploy a single module in a specific environment with r10k');
  process.exit(1);
}

var app = koa();
var app_port = process.env.KOA_LISTEN_PORT || 3000;

// Launch Kue processor
KU.processJob();

// Define routes
router.post('/gitlab', plugin.gitlabProcess(process.env.PUPPETFILE_URL));

// Use middlewares
app
  .use(plugin.pageNotFound())
  .use(router.routes())
  .use(router.allowedMethods());

// Start Koa app with SSL support if wanted
var sslRequired = (process.env.KOA_USE_SSL === 'true');

if (sslRequired) {

  var key_file = process.env.KOA_SSL_KEY || 'examples/ssl/r10k-deployerjs.key';
  var cert_file = process.env.KOA_SSL_CERT || 'examples/ssl/r10k-deployerjs.crt';

  var ssl_opts = {
    key: fs.readFileSync(key_file),
    cert: fs.readFileSync(cert_file)
  };

  // HTTPS
  https.createServer(ssl_opts, app.callback()).listen(app_port);

  logger.info('Koa started on port '+app_port+' with SSL support');

}
else {

  // HTTP
  app.listen(app_port);

  logger.info('Koa started on port '+app_port);

}
