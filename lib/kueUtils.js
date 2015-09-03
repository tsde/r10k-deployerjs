var Promise = require('bluebird');
var kue = require('kue');
var logger = require('./logger');
var co = require('co');
var createAction = require('./git/create_action');
var modifyAction = require('./git/modify_action');
var deleteAction = require('./git/delete_action');

var jobType = process.env.REDIS_JOB_TYPE || 'r10k';
var queue = kue.createQueue({
  jobEvents: false,
  redis: {
    port: process.env.REDIS_PORT || '6379',
    host: process.env.REDIS_HOST || '127.0.0.1'
  }
});

// Function used to create and queue job in Redis
var createJob = function(eventInfo) {
  return new Promise(function(resolve, reject) {

    if (!eventInfo.pfrepo || !eventInfo.reponame || !eventInfo.branch || !eventInfo.repourl || !eventInfo.type) {
      return reject('Job data sent to Redis is not correctly formatted. Either "pfrepo", "reponame", "branch", "repourl" or "type" properties is not present');
    }

    // Create the job in queue named 'r10k'
    var job = queue.create(jobType, eventInfo);

    /*
      Queue the job in redis
      Jobs successfully processed will be automatically deleted from the queue
      Only one job execution attempt is performed
    */
    job.attempts(1).removeOnComplete(true).save(function(err) {
      // If queueing the job in redis failed, pass the error to the promise
      return (err) ? reject(err) : resolve(job.id);
    });
  });
};

// Function used to start processing of Redis queue and handling of errors
var processJob = function() {
  queue.on('job failed', function(id, err) {

    /*
      Only handle jobs of a specific type so that multiple instances
      of the app using the same Redis instance don't create conflicts
    */
    kue.Job.get(id, function(error, job) {

      if (error || job.type !== jobType) return;

      logger.error(err);

      // Count failed jobs
      queue.failedCount(jobType, function(err, total) {

        logger.debug('Total of failed tasks: '+total);

        if (total > 30) {
          // Purge old failed jobs
          logger.debug('More than 30 failed tasks in Redis queue. Purging the 20 older ones');

          kue.Job.rangeByState('failed', 0, 20, 'asc', function(err, jobs) {
            jobs.forEach(function(job) {
              job.remove(function() {
                logger.debug('Redis task with ID '+job.id+' removed from queue');
              });
            });
          });
        }
      });
    });
  });

  // Process jobs in Redis queue
  queue.process(jobType, function (job, done) {

    logger.info('Processing Redis task with ID '+job.id);
    logger.debug('Job data: '+JSON.stringify(job.data));

    switch (job.data.type) {

    case 'createEvent':
      co(createAction.runCreate(job.data, done));
      break;

    case 'modifyEvent':
      co(modifyAction.runModify(job.data, done));
      break;

    case 'deleteEvent':
      co(deleteAction.runDelete(job.data, done));
      break;

    default:
      return done(new Error('Unknown event type sent to Redis queue: '+job.data.type));

    }

  });

};


// Export functions
module.exports = {
  createJob: createJob,
  processJob: processJob
};
