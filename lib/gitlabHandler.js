var Promise = require('bluebird');


/*
Detect which event type will be queued as a new job:
  - createEvent: when a new branch is created for a module
  - deleteEvent: when a branch is deleted for a module
  - modifyEvent: when an existing branch is updated for a module
*/

var detectEvent = function(payload, puppetfileRepo) {

  return new Promise(function(resolve, reject) {

    if (!payload) {
      return reject('No JSON payload to process');
    }
    else {
      var reponame = payload.repository.name;
      var repourl = payload.repository.git_ssh_url;
      var pushuser = payload.user_name;
      var ref = payload.ref.split('/');
      var refType = ref[1];
      var branch = ref[2];
      var created = /^0+$/.test(payload.before);
      var deleted = /^0+$/.test(payload.after);
      var eventInfo = { "pfrepo": puppetfileRepo, "pushuser": pushuser, "reponame": reponame, "branch": branch, "repourl": repourl };

      /*
        Safety check to ensure that the repo being processed is not the Puppetfile repo
        This could happen if you added your webhook using the gitlab api via some
        automated task and forgot to exclude the Puppetfile repo
      */
      if (repourl === puppetfileRepo) {
        return reject('This webhook is not intended to be used by the Puppetfile repository');
      }

      if (refType !== 'heads') {
        return reject('A reference of type "'+refType+'" was passed but we only handle "heads" reference type');
      }
      else {
        if (created) {
          eventInfo.type = 'createEvent';
        }
        else if (deleted) {
          // Don't process any deletion of the production branch. Too risky for now.
          if (branch === 'production') {
            return reject('Deletion of the golden "production" branch is not allowed at the moment');
          }
          else {
            eventInfo.type = 'deleteEvent';
          }
        }
        else if (!created && !deleted) {
          eventInfo.type = 'modifyEvent';
        }

        return resolve(eventInfo);
      }
    }

  });

};

module.exports = {
  detectEvent: detectEvent
};
