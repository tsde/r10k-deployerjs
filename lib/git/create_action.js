/*
  This code handle the "create" event. The process is as follows:
    - clone the repo
    - fetch (and pruning)
    - checkout the branch. If it already exists, we merge potential changes from the production branch
    - update the module ref in Puppetfile
    - commit the changes in Puppetfile
    - push the changes upstream
    - invoke r10k
      - deploy all modules in 'feature' environment if only one module is involved in the feature branch (most of the time)
      - update the module if there's more than one module involved in a feature branch that was previously created
*/

var promisify = require('promisify-node');
var fse = promisify(require('fs-extra'));
var logger = require('../logger');
var GU = require('./git_utils');
var RD = require('../r10k/rundeck');


/*
  eventData: object containing the name of the branch, the name of the module and the type of event
  cbk: represents the "done" callback used by kue to know when an error occured during job processing
*/
var runCreate = function *(eventData, cbk) {

  var now = Date.now();
  var basedir = process.cwd();
  var new_content;
  var fullDeploymentNeeded = false;
  var gitdir = '/var/tmp/puppetfile_repo_'+now;
  var gitopts = { cwd: gitdir };
  var pfile = gitdir+'/Puppetfile';
  var branchName = eventData.branch;
  var moduleName = eventData.reponame;
  var repoUrl = eventData.repourl;
  var rundeck_data = { "branch": branchName, "module": moduleName };
  var module_regex = new RegExp('('+repoUrl+'[\'"],\\s*:ref\\s*=>\\s*[\'"])([^\'"]+)([\'"]\\s*)$', 'gm');

  try {

    logger.info('Entering "create_action" process for branch '+branchName+' of module '+moduleName);

    // Clone the repository
    yield* GU.clone(gitdir);

    // Fetch from remote
    yield* GU.fetch(gitopts);

    // Checking if branch already exists on remote and checkout
    logger.debug('Checking if branch "'+branchName+'" exists on remote');
    var branchExist = yield* GU.branchExist(branchName, gitopts);

    if (branchExist) {
      /*
        This case is matched when you work on a 'feature' branch involving more than one module.
        This'll most likely be a rare case but we have to deal with it.
      */
      fullDeploymentNeeded = yield* GU.checkoutExisting(branchName, gitopts);
    }
    else {
      yield* GU.checkoutNew(branchName, gitopts);

      // As it's a new branch, we need to deploy the entire 'feature' environment
      fullDeploymentNeeded = true;
    }

    // We update the reference for the module in the Puppetfile
    var content = yield fse.readFile(pfile, { encoding: 'utf-8' });
    // The following return an array with capturing groups if regex matches
    var moduleDefined = module_regex.exec(content);

    if (!moduleDefined) {

      // This module is not defined in Puppetfile so we need to build the string that will be appended to the Puppetfile
      logger.info('Module '+moduleName+' is not yet referenced in Puppetfile. We need to update it.');

      new_content = content+'\nmod "'+moduleName+'",\n  :git => "'+repoUrl+'",\n  :ref => "'+branchName+'"\n';
      yield fse.writeFile(pfile, new_content, { encoding: 'utf-8' });

      logger.info('New module '+moduleName+' successfully added to Puppetfile');

    }
    else {

      // Module is defined in Puppetfile, we just need to update the ref
      logger.info('Updating ref of module '+moduleName+' to '+branchName);
      new_content = content.replace(module_regex, '$1'+branchName+'$3');
      logger.debug(new_content);

      yield fse.writeFile(pfile, new_content, { encoding: 'utf-8' });
      logger.debug('Puppetfile updated');

    }

    // Commiting changes
    yield* GU.commit(moduleName, branchName, gitopts);

    // Pushing changes to remote
    yield* GU.push(branchName, gitopts);

    /*
      Fully deploy environment with r10k if there were changes merged from the 'production' branch.
      Otherwise simply update the module in the 'feature' environment
    */
    if (fullDeploymentNeeded) {
      // r10k deploy environment <feature_env> --puppetfile
      logger.info('Deploy all modules in environment '+branchName+' using r10k');
      rundeck_data.type = 'deploy_env';
    }
    else {
      // r10k deploy module -e <feature_env> <module>
      logger.info('Update module '+moduleName+' in environment '+branchName+' using r10k');
      rundeck_data.type = 'deploy_mod';
    }

    // Launch Rundeck job
    var rd_job_status = yield* RD.runJob(rundeck_data);

    // Removing temp directory
    logger.debug('Removing temp dir: '+gitdir);
    yield fse.remove(gitdir);

    logger.info('Processing branch '+branchName+' of module '+moduleName+' '+rd_job_status);

    // Return the kue "done" callback with null to indicate a successful job
    return cbk(null);

  } catch(err) {

    // The working directory is not changed when a git command fails, we need explicitely change it
    process.chdir(basedir);
    
    // Remove temp dir even if there's an error so we save disk space
    yield fse.remove(gitdir);

    // Return the kue "done" callback with the error to indicate a failed job
    return cbk(err);

  }
};

module.exports = {
  runCreate: runCreate
};
