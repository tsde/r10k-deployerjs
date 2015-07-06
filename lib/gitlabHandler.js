var Promise = require('bluebird');


/*
Detect which event type will be queued as a new job:
	- createEvent: when a new branch is created for a module
	- deleteEvent: when a branch is deleted for a module
	- modifyEvent: when an existing branch is updated for a module
*/

var detectEvent = function(payload) {

	return new Promise(function(resolve, reject) {

		if (!payload) {
			reject('No JSON payload to process');
		}
		else {
			var reponame = payload.repository.name;
			var ref = payload.ref.split('/');
			var refType = ref[1];
			var branch = ref[2];
			var created = /^0+$/.test(payload.before);
			var deleted = /^0+$/.test(payload.after);
			var eventInfo = { "reponame": reponame, "branch": branch };

			if (refType !== 'heads') {
				reject('A reference of type "'+refType+'" was passed but we only handle "heads" reference type');
			}
			else {	
				if (created) {
					eventInfo.type = 'createEvent';
				}
				else if (deleted) {
					// Don't process any deletion of the production branch. Too risky for now.
					(branch == 'production') ? reject('Deletion of the golden "production" branch is not allowed at the moment') : eventInfo.type = 'deleteEvent';
				}
				else if (!created && !deleted) {
					eventInfo.type = 'modifyEvent';
				}

				resolve(eventInfo);
			}
		}

	});

}

module.exports = {
	detectEvent: detectEvent
}
