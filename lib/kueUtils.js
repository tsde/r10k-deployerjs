var Promise = require('bluebird');
var kue = require('kue');
var logger = require('./logger');
var co = require('co');
var createAction = require('./git/create_action');
var modifyAction = require('./git/modify_action');
var deleteAction = require('./git/delete_action');

var queue = kue.createQueue({
	redis: {
		port: process.env.REDIS_PORT || '6379',
		host: process.env.REDIS_HOST || '127.0.0.1'
	}
});
var queueName = 'r10k';


// Function used to create and queue job in Redis
var createJob = function(eventInfo) {
	return new Promise(function(resolve, reject) {

		if (!eventInfo) reject('No event data passed to job creation process');

		// Create the job in queue named 'r10k'
		var job = queue.create(queueName, eventInfo);

		/*
			Queue the job in redis
			Jobs successfully processed will be automatically deleted from the queue
			Only one job execution attempt is performed
		*/
		job.attempts(1).removeOnComplete(true).save(function(err) {
			// If queueing the job in redis failed, pass the error to the promise
			(err) ? reject(err) : resolve(job.id);
		});
	});
}

// Function used to start processing of Redis queue and handling of errors
var processJob = function() {
	queue
		.on('job complete', function(id, result) {
			logger.info('Job with Redis queue ID '+id+' successfully completed');
		})
		.on('job failed attempt', function(id, errmess) {
			logger.warn('Job with Redis queue ID '+id+' failed at first attempt. Reason: '+errmess);
		})
		.on ('job failed', function(id, err) {

			logger.error(err);

			// Count failed jobs
			queue.failedCount('r10k', function(err, total) {

				logger.debug('Total of failed jobs: '+total);

				if (total > 30) {
					// Purge old failed jobs
					logger.debug('More than 30 failed jobs in Redis queue. Purging the 20 older ones');

					kue.Job.rangeByState('failed', 0, 20, 'asc', function(err, jobs) {
						jobs.forEach(function(job) {
							job.remove(function() {
								logger.debug('Job with Redis queue ID '+job.id+' removed from queue');
							});
						});
					});
				}
			
			});
		});

	// Process jobs in Redis queue
	queue.process('r10k', function (job, done) {

		if (!job.data.reponame || !job.data.branch || !job.data.type) {
			return done(new Error('Job data sent to Redis is not correctly formatted. Either "reponame", "branch" or "type" properties is not present'));
		}

		logger.info('Processing job with Redis queue ID '+job.id);

		logger.debug('Job data: '+JSON.stringify(job.data));

		switch (job.data.type) {

			case 'createEvent':
				console.log('Event: '+job.data.type);
				co(createAction.runCreate(job.data, done));
				break;

			case 'modifyEvent':
				console.log('Event: '+job.data.type);
				co(modifyAction.runModify(job.data, done));
				break;

			case 'deleteEvent':
				console.log('Event: '+job.data.type);
				co(deleteAction.runDelete(job.data, done));
				break;

			default:
				return done(new Error('Unknown event type sent to Redis queue: '+job.data.type));

		}

	});

}


// Export functions
module.exports = {
	createJob: createJob,
	processJob: processJob
}
