# R10k-deployerJS


## First, a bit of warning

I am **NOT** a developper. I work as a sysadmin but I've always been interested in coding. So here's my first "real" attempt with nodeJS using ES6 generators.
This piece of code is provided as is. Feel free to fork and play with it. Also, there must be code optimization that could be done, so don't hesitate to open an issue detailing what can be done to make it better. I'm always happy to learn things ;)


## So, what is this thing ?

My team uses Puppet to manage our customers' platforms. Git is used as our VCS for our Puppet code. This app is meant to be used as a post-receive webhook for **Gitlab** (that's what we use. I'll try to add compatibility with others some day - See [TODO](#todo)). It allows you to automatically deploy Puppet environments based on git branches. Under the hood, R10k is used to actually deploy the environments.

This work is heavily based (stolen?;) on Phil Zimmerman's [Reaktor](https://github.com/pzim/reaktor).


## Git workflow

This webhook was designed to work **ONLY** with a simple git workflow based on feature branches merged regularly in a golden **production** branch.

First, you have to set up what is called the *Control Repository* containing your Puppetfile. This repository has only one branch named **production** which is the "don't-you-touch-that" branch. IMPORTANT: you should **NOT** name this branch *master* or it will mess up with R10k. You should give strict permissions to this repository.

Second, each Puppet module resides in its own git repository. Each repository has only one "golden" branch. You **MUST** name this branch **production** too. Changes are never pushed to this branch directly. Instead, you use **feature** branches to test ...well, your features. Then you open a merge request so that it can be reviewed and potentially accepted by people who have "master" permissions on repositories.

These **feature** branches represent dynamic Puppet environments which are then generated with R10k.


## Technical considerations

As I like to test new things, this code is using ES6 generators and promises.

[Koa](https://github.com/koajs/koa) is used as the web framework along with [co](https://github.com/tj/co) for controlling generator flow.

[Redis](http://redis.io/) is used as a queue backend to store the jobs.

[R10k](https://github.com/puppetlabs/r10k) is invoked through [Rundeck](http://rundeck.org/) as it provides an easy-to-use REST API and ways of launching remote commands easily on multiple servers.


## Requirements

  - nodeJS >= 0.12
  - Redis >= 3 (but should work with version >= 2.6.12 which is a Kue requirement)
  - Rundeck >= 2.5


## Installation

  - Clone the repo:

        $ git clone https://github.com/tsde/r10k-deployerjs.git

  - Install dependencies:

        $ npm install

  - Start the app:

        $ npm start

  - Configure the webhook in Gitlab: **http://hostname:port/gitlab** (you can also use https)


## Environment variables

To work properly, the following environment variables **must** be set

  - **LOG4JS_CONFIG**: path to the log4js configuration file
  - **PUPPETFILE_URL**: your Puppetfile repository URL
  - **RD_BASEURL**: Rundeck base URL
  - **RD_API_VERSION**: Rundeck API version
  - **RD_PROJECT_NAME**: Rundeck project name containing the r10k jobs
  - **RD_API_TOKEN**: Rundeck token to access the API
  - **RD_API_JOB_ID**: Rundeck job ID. This job is used to trigger r10k on your puppetmasters

The following environment variables are **optional**

  - **KOA_LISTEN_PORT**: listen port for Koa (default 3000)
  - **KOA_USE_SSL**: whether or not you want to enable SSL (default false)
  - **KOA_SSL_KEY**: path to your ssl private key (default 'examples/ssl/r10k-deployerjs.key' - **default is only meant for testing**)
  - **KOA_SSL_CERT**: path to your ssl certificate (default 'examples/ssl/r10k-deployerjs.crt' - **default is only meant for testing**)
  - **PUPPETFILE_GIT_REMOTE_NAME**: name of the remote for your puppetfile repository (default 'origin')
  - **REDIS_JOB_TYPE**: name of the job type to used (default 'r10k')
  - **REDIS_PORT**: port used by your redis instance (default 6379)
  - **REDIS_HOST**: host where redis is running (default 127.0.0.1)

If you want to run **multiple instances** of this application while using the **same** Redis instance for them, be sure to set the **REDIS_JOB_TYPE** environment variable to a specific value for each instance. Failure to do so may lead to unexpected Redis queue handling for failed jobs.


## About Rundeck jobs

This hook doesn't execute r10k directly. Instead, it delegates this task to Rundeck by using its API. Your Rundeck job identified by the **RD_API_JOB_ID** environment variable have to handle the execution of R10k on your puppetmasters. When the hook is triggered, 3 variables are sent to Rundeck which can then be used to create your job:
  - **r10k_type**
  - **r10k_env**
  - **r10k_module**

The **r10k_type** variable is set either to **deploy_env** or **deploy_mod** and is the most important one. You should use it to select the right r10k command to launch on your puppetmasters. Typically, you should launch the following r10k commands when this variable is set to:
  - *deploy_env*: `r10k deploy environment <r10k_env> -p`
  - *deploy_mod*: `r10k deploy environment <r10k_env>` to update the Puppetfile followed by `r10k deploy module -e <r10k_env> <r10k_module>`

I personally use Ansible playbooks (triggered through the Rundeck API) to execute these commands. Example playbooks are provided in the *examples/ansible* folder.


## What happens during a Push

Three events can be triggered during a push: branch creation, branch modification or branch deletion.

### Create events

When a branch is created on a module, the following happens:
  - The Puppetfile repository is cloned and fetched
  - The branch is checked out.
    - Usually, the branch doesn't exist
    - But it's also possible for multiple modules sharing the same branch when a feature is linked between modules.
  - If the module is not yet referenced in the Puppet file, we add it
  - The ref of the module is updated in the Puppetfile
  - Then, we commit and push the changes upstream
  - R10k is invoked:
    - deploy all modules in 'feature' environment if only one module is involved in the feature branch (most of the time)
    - update the module only if there's more than one module involved in a feature branch previously created


### Modify events

When a branch is modified on a module, the steps are simpler. Usually, we invoke R10k to update the module. However, some git actions can be triggered if changes from the production branch are merged into the feature branch or if the ref of the module is incorrect in the Puppetfile (if some people manually messed up with the Puppetfile).


### Delete events

When a branch is deleted on a module, the following happens:
- The Puppetfile repository is cloned and fetched
- The branch is checked out.
- The Puppetfile is parsed to see if the module is the last one referencing the branch
  - If it's the case, the branch is simply deleted on the Puppetfile repository
  - Otherwise, the reference of the module is changed to 'production' and we push the modifications upstream. R10k is then invoked to update the module.


## Logging

Log4js is used as the logging system. An example configuration file is provided in the **examples/log4js/logger.json** file. The file is checked every 30 seconds for changes. This can be useful when you want to change log level without restarting the app.


## TODO

  - Code optimization. For example, the *create_action*, *modify_action*, *delete_action* share many common parts and could be refactored (use constructor and prototypes maybe)
  - Don't clone the Puppetfile repo each time there's a push event.
  - Support git tags
  - Add a feature to send notification to Hip-Chat or similar
  - Add a Github/Stash handler
  - ...


## Issues

Feel free to open an issue if you have any question or if you find that something could be enhanced. I'm kinda busy but I'll do my best to get back to you.
