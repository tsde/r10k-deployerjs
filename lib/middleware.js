var parse = require('co-body');
var gitlabHandler = require('./gitlabHandler');
var KU = require('./kueUtils');
var logger = require('./logger');


// Middleware used to handle unsupported requests
var pageNotFound = function() {

  return function *(next) {

    yield next;

    if (404 != this.status) return;

    // we need to explicitly set 404 here so that koa doesn't return a 200
    this.status = 404;

    switch (this.accepts('html', 'json')) {
    case 'html':
      this.type = 'html';
      this.body = '<p>Owned</p>';
      break;
    case 'json':
      this.body = { message: 'Owned' };
      break;
    default:
      this.type = 'text';
      this.body = 'Owned';
    }
  };
};

// Middleware used to register Gitlab events in Redis queue
var gitlabProcess = function(puppetfileRepo) {

  return function *(next) {

    try {

      // If no Puppetfile repository is passed, this means that PUPPETFILE_URL_WINDOWS was not set
      if (!puppetfileRepo) { throw new Error('No Puppetfile repository defined for Windows. Please set the environment variable PUPPETFILE_URL_WINDOWS'); }

      // Parse request body sent by gitlab webhook
      var body = yield parse.json(this);

      logger.debug('repo_name: '+body.repository.name+', ref_type: '+body.ref+', before_hash: '+body.before+', after_hash: '+body.after);

      // Detect which type of event is received
      var eventInfo = yield gitlabHandler.detectEvent(body, puppetfileRepo);

      // Send the event to queue
      var jobID = yield KU.createJob(eventInfo);

      logger.info('Job '+eventInfo.type+' on branch '+eventInfo.branch+' of module '+eventInfo.reponame+' queued in Redis with ID '+jobID);

      // Send a basic response
      this.status = 200;
      this.type = 'html';
      this.body = '<p>OK</p>';

    } catch(err) {

      // Send a 500 if an error occured
      logger.error(err);
      this.status = 500;
      this.type = 'html';
      this.body = '<p>POST failed. Reason: '+err+'</p>';

    }
  };
};

module.exports = {
  pageNotFound: pageNotFound,
  gitlabProcess: gitlabProcess
};
