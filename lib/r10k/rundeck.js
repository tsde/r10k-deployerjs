var logger = require('../logger');
var promisify = require('promisify-node');
var parser = promisify(require('xml2js').parseString);
var sleep = require('co-sleep');
var request = require('co-request');

// Use Rundeck API to launch jobs
var runJob = function *(deployInfo) {

	var job_id;
	var job_args;
	var job_status;
	var job_output;
	var req_params;
	var response;
	var response_to_json;
	var execution_id;
	var api_baseurl = process.env.RD_BASEURL+"/api/"+process.env.RD_API_VERSION;
	var api_token = process.env.RD_API_TOKEN;
	var api_job_deployenv_id = process.env.RD_API_JOB_ENV_ID;
	var api_job_deploymod_id = process.env.RD_API_JOB_MOD_ID;

	// Check input parameter
	if (!deployInfo.type || !deployInfo.branch || !deployInfo.module) {
		throw new Error('Missing information in input parameter used for Rundeck API');
	}

	// Set Job ID based on event type
	if (deployInfo.type == 'deploy_env') {
		job_id = api_job_deployenv_id;
		job_args = '-r10k_env '+deployInfo.branch;
	}
	else if (deployInfo.type == 'deploy_mod') {
		job_id = api_job_deploymod_id;
		job_args = '-r10k_env '+deployInfo.branch+' -r10k_module '+deployInfo.module;
	}
	else {
		throw new Error('Wrong event type. Impossible to build a proper call to Rundeck API');
	}

	// Build request parameters to run the job
	req_params = {
		baseUrl: api_baseurl,
		uri: "/job/"+job_id+"/run?authtoken="+api_token,
		method: "POST",
    form: {
    	"argString": job_args
    }
	}

	// Request to run the job
	response = yield request(req_params);
	
	// A status code other than 200 means there was a problem while trying to communicate with Rundeck API
	if (response.statusCode != '200') throw new Error('API call returned a '+response.statusCode+' when trying to launch the job');

	// Store execution ID
  response_to_json = yield parser(response.body);
  execution_id = response_to_json.executions.execution[0].$.id;

  logger.debug('Job launched with ID: '+execution_id);

  // Build request parameters to check job execution
  req_params = {
  	baseUrl: api_baseurl,
		uri: "/execution/"+execution_id+"?authtoken="+api_token,
		method: "GET",
  }

  /*
  	Regularly check execution status till it's not running anymore.
  	To prevent this piece of code looping forever for some reason, I strongly suggest to set a timeout value to your Rundeck jobs
  */
  do {

		response = yield request(req_params);

		// A status code other than 200 means there was a problem while trying to communicate with Rundeck API
		if (response.statusCode != '200') throw new Error('API call returned a '+response.statusCode+' when trying to check job execution status');

		response_to_json = yield parser(response.body);
		job_status = response_to_json.executions.execution[0].$.status;

		// Sleep a little so we don't DOS our API :p
		yield sleep(5000);

	} while (job_status == 'running');

	if (job_status != 'succeeded') {
		throw new Error('Job execution '+job_status+'. Check the following URL for job logs: '+process.env.RD_BASEURL+'/project/'+process.env.RD_PROJECT_NAME+'/execution/show/'+execution_id);
	}
	else {
		// Job was successfully processed.
		return job_status;
	}

}

module.exports = {
	runJob: runJob
}
