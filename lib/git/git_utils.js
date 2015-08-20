var git = require('git-promise');
var logger = require('../logger');

var pfileRepo = process.env.PUPPETFILE_URL;
var remoteName = process.env.PUPPETFILE_GIT_REMOTE_NAME || 'origin';


// Status function
var status = function *(gitopts) {

  logger.debug('Get status of repo');
  var status_out = yield git('status --porcelain', gitopts);
  return (status_out.length > 0) ? true : false;

};

// Clone function
var clone = function *(gitdir) {

  logger.debug('Cloning repository in '+gitdir);
  var clone_out = yield git('clone '+pfileRepo+' '+gitdir);
  logger.debug('Cloning OK: '+clone_out);

};

// Fetch function
var fetch = function *(gitopts) {

  logger.debug('Fetching from remote');
  var fetch_out = yield git('fetch --prune -v '+remoteName, gitopts);
  logger.debug('Fetching OK: '+fetch_out);

};

// branchExist function
var branchExist = function *(branchName, gitopts) {

  var check_refs_regex = new RegExp('refs\/heads\/'+branchName+'$', 'm');
  var refs = yield git('ls-remote --heads', gitopts);
  return check_refs_regex.test(refs);

};

// Checkout existing branch function
var checkoutExisting = function *(branchName, gitopts) {

  logger.debug('Branch '+branchName+' exists on remote. Checking it out');
  var checkout_out = yield git('checkout --force '+branchName, gitopts);
  logger.debug('Checkout OK: '+checkout_out);

  // We pull from origin
  logger.debug('Pulling from origin');
  var pull_out = yield git('pull '+remoteName+' '+branchName, gitopts);
  logger.debug('Pull OK: '+pull_out);

  // We merge potential changes from 'production' branch
  logger.debug('Merging potential changes from production branch, prioritizing our version in case of conflicts');
  var merge_out = yield git('merge '+remoteName+'/production -X ours --no-edit', gitopts);
  logger.debug('Merge OK: '+merge_out);

  return /^(?!Already up-to-date\.).*$/mg.test(merge_out.trim());

};

// Checkout new branch function
var checkoutNew = function *(branchName, gitopts) {

  // For a new branch, we simply create it and check it out
  logger.debug('Branch '+branchName+' is a new branch. Creating it now');
  var checkoutnew_out = yield git('checkout -b '+branchName, gitopts);
  logger.debug('Checkout OK: '+checkoutnew_out);

};

// Commit function
var commit = function *(moduleName, branchName, gitopts) {

  var commit_msg = 'Changing :ref for module '+moduleName+' in branch '+branchName;

  logger.debug('We now commit changes');
  var commit_out = yield git('commit -a -m "'+commit_msg+'"', gitopts);
  logger.debug('Commit OK: '+commit_out);

};

// Push function
var push = function *(branchName, gitopts) {

  logger.debug('Pushing changes to origin');
  var push_out = yield git('push '+remoteName+' '+branchName, gitopts);
  logger.debug('Push OK: '+push_out);

};

// Delete function
var del = function *(branchName, gitopts) {

  logger.debug('Deleting branch '+branchName);
  var delete_out = yield git('push '+remoteName+' --delete '+branchName, gitopts);
  logger.debug('Deleting OK: '+delete_out);

};

//Export functions
module.exports = {
  status: status,
  clone: clone,
  fetch: fetch,
  branchExist: branchExist,
  checkoutExisting: checkoutExisting,
  checkoutNew: checkoutNew,
  commit: commit,
  push: push,
  del: del
};
