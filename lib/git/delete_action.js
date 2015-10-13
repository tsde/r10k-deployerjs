/*
  This code handle the "delete" event. The process is as follow:
    - clone the repo
    - fetch (and pruning if needed)
    - checkout the feature branch
    - check if the current module is the last one referencing the feature branch
    - if yes, we simply delete the branch on remote. The corresponding puppet environment will be deleted the next time r10 deploy is invoked (most of the time)
    - if no, we update the ref of the current module to the 'production' branch and we push the changes to the remote
      - we update the module in the 'feature' or
      - we deploy all module in the environment if there were changes merged from the 'production' branch
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
var runDelete = function *(eventData, cbk) {

  var now = Date.now();
  var basedir = process.cwd();
  var fullDeploymentNeeded = false;
  var gitdir = '/var/tmp/puppetfile_repo_'+now;
  var gitopts = { cwd: gitdir };
  var pfile = gitdir+'/Puppetfile';
  var pfileRepo = eventData.pfrepo;
  var branchName = eventData.branch;
  var moduleName = eventData.reponame;
  var pushUsername = eventData.pushuser;
  var rundeck_data = { "pushUsername": pushUsername, "branch": branchName, "module": moduleName };
  var branch_regex_builder = '([-\\w]+)\\.git[\'"],\\s*:ref\\s*=>\\s*[\'"]'+branchName+'[\'"]$';
  var module_regex_builder = '('+moduleName+'\\.git[\'"],\\s*:ref\\s*=>\\s*[\'"])'+branchName+'([\'"]\\s*)$';
  var branch_regex = new RegExp(branch_regex_builder, 'gm');
  var module_regex = new RegExp(module_regex_builder, 'gm');
  var module_list = [];

  try {

    logger.info('Entering "delete_action" process for branch '+branchName+' of module '+moduleName);

    // Clone the repository
    yield* GU.clone(gitdir, pfileRepo);

    // Fetch from remote
    yield* GU.fetch(gitopts);

    /*
      Checking if branch still exists on remote. This should be the case.
      If not (maybe in the case it's been manually deleted), then we don't need to do anything
    */
    logger.debug('Checking if branch "'+branchName+'" exists on remote');
    var branchExist = yield* GU.branchExist(branchName, gitopts);

    if (!branchExist) {
      // Branch seems to have already been deleted, nothing to do.
      logger.info('Someone seems to have already (maybe manually?) deleted branch '+branchName+' on Puppetfile repo. Nothing to do.');
      return cbk(null);
    }

    // Checkout "feature" branch
    fullDeploymentNeeded = yield* GU.checkoutExisting(branchName, gitopts);

    /*
      Checking if the current module is the last one referencing the "feature" branch.
      If yes, we delete the branch from the Puppetfile repository.
      If no, we change the ref of the current module to the 'production' branch.
    */

    logger.info('Checking if module '+moduleName+' is the last one referencing branch "'+branchName+'"');
    var content = yield fse.readFile(pfile, { encoding: 'utf-8' });

    content.replace(branch_regex, function(match, p1) {
      // Don't push to array the current module being processed
      if (p1 !== moduleName) module_list.push(p1);
    });

    /*
      If array is empty, that means the current module is the last one used in the branch.
      Otherwise, there're still modules in this branch so we shouldn't delete it yet and we need to
      change the ref to 'production' for the current module
    */
    if (module_list.length == 0) {

      logger.info('This is the last module in the branch '+branchName+', we can delete the branch from the Puppetfile repo');
      yield* GU.del(branchName, gitopts);

    }
    else {

      logger.info('There\'re still modules in this branch: '+module_list+'. We just have to change the ref for '+moduleName+' to point to the "production" branch');
      var new_content = content.replace(module_regex, '$1production$2');
      logger.debug(new_content);

      yield fse.writeFile(pfile, new_content, { encoding: 'utf-8' });
      logger.debug('Puppetfile updated');

      // Commiting changes
      yield* GU.commit(moduleName, branchName, gitopts);

      // Pushing changes to remote
      yield* GU.push(branchName, gitopts);

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

    }

    // Removing temp directory
    logger.debug('Removing temp dir: '+gitdir);
    yield fse.remove(gitdir);

    rd_job_status ? logger.info('Processing branch '+branchName+' of module '+moduleName+' '+rd_job_status) : logger.info('Branch '+branchName+' of module '+moduleName+' successfully processed');

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
  runDelete: runDelete
};
