var logger = require('../logger');
var promisify = require('promisify-node');
var parser = promisify(require('xml2js').parseString);
var sleep = require('co-sleep');
var request = require('co-request');

// Use Rundeck API to launch jobs
var runJob = function *(deployInfo) {

  // Check input parameter
  if (!deployInfo.pushUsername || !deployInfo.type || !deployInfo.branch || !deployInfo.module) {
    throw new Error('Missing information in input parameter used for Rundeck API');
  }

  var job_id = process.env.RD_API_JOB_ID;
  var job_args = '-push_user "'+deployInfo.pushUsername+'" -r10k_type "'+deployInfo.type+'" -r10k_env "'+deployInfo.branch+'" -r10k_module "'+deployInfo.module+'"';
  var job_status;
  var req_params;
  var response;
  var response_to_json;
  var execution_id;
  var api_baseurl = process.env.RD_BASEURL+"/api/"+process.env.RD_API_VERSION;
  var api_token = process.env.RD_API_TOKEN;

  // Build request parameters to run the job
  req_params = {
    baseUrl: api_baseurl,
    uri: "/job/"+job_id+"/run?authtoken="+api_token,
    method: "POST",
    form: {
      "argString": job_args
    }
  };

  // Request to run the job
  response = yield request(req_params);

  // A status code other than 200 means there was a problem while trying to communicate with Rundeck API
  if (response.statusCode != '200') throw new Error('API call returned a '+response.statusCode+' when trying to launch Rundeck job');

  // Store execution ID
  response_to_json = yield parser(response.body);
  execution_id = response_to_json.executions.execution[0].$.id;

  logger.debug('Rundeck job launched with ID: '+execution_id);

  // Build request parameters to check job execution
  req_params = {
    baseUrl: api_baseurl,
    uri: "/execution/"+execution_id+"?authtoken="+api_token,
    method: "GET"
  };

  /*
    Regularly check execution status till it's not running anymore.
    To prevent this piece of code looping forever for some reason, I strongly suggest to set a timeout value to your Rundeck jobs
  */
  do {

    response = yield request(req_params);

    // A status code other than 200 means there was a problem while trying to communicate with Rundeck API
    if (response.statusCode != '200') throw new Error('API call returned a '+response.statusCode+' when trying to check Rundeck job execution status');

    response_to_json = yield parser(response.body);
    job_status = response_to_json.executions.execution[0].$.status;

    // Sleep a little so we don't DOS our API :p
    yield sleep(3000);

  } while (job_status == 'running');

  if (job_status != 'succeeded') {
    throw new Error('Rundeck job execution '+job_status+'. Check the following URL for logs: '+process.env.RD_BASEURL+'/project/'+process.env.RD_PROJECT_NAME+'/execution/show/'+execution_id);
  }
  else {
    // Job was successfully processed.
    return job_status;
  }

};

module.exports = {
  runJob: runJob
};
