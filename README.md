# R10k-deployerJS


## First, a bit of warning

I am **NOT** a developper. I work as a sysadmin but I've always been interested in coding. So here's my first "real" attempt with nodeJS using ES6 generators.
This piece of code is provided as is. Feel free to fork and play with it. Also, there must be code optimization that could be done, so don't hesitate to open an issue detailing what can be done to make it better. I'm always happy to learn things ;)


## So, what is this thing ?

My team uses Puppet to manage our customers' platforms. Git is used as our VCS for our Puppet code. This app is meant to be used as a post-receive webhook for Gitlab (that's what we use. I'll try to add compatibility with others some day - See [TODO](#todo)). It allows you to automatically deploy Puppet environments based on git branches. Under the hood, R10k is used to actually deploy the environments.

This work is heavily based (stolen?;) on Phil Zimmerman's [Reaktor](https://github.com/pzim/reaktor).


## Technical considerations

As I like to test new things, this code is using ES6 generators and promises.

[Koa](https://github.com/koajs/koa) is used as the web framework along with [co](https://github.com/tj/co) for controlling generator flow.

[Redis](http://redis.io/) is used as a queue backend to store the jobs.

[R10k](https://github.com/puppetlabs/r10k) is invoked through [Rundeck](http://rundeck.org/) as it provides an easy-to-use REST API and ways of launching remote commands easily on multiple servers.


## Requirements

  - nodeJS >= 0.12
  - Redis >= 3 (but should work with earlier versions)
  - Rundeck >= 2.5


## Installation

  - Clone the repo:

        $ git clone https://github.com/tsde/r10k-deployerjs.git

  - Install dependencies:

        $ npm install

  - Start the app:

        $ npm start


## Git workflow

This webhook was designed to work **ONLY** with a simple git workflow based on feature branches merged regularly in a golden **production** branch.

First, you have to set up what is called the *Control Repository* containing your Puppetfile. This repository has only one branch named **production** which is the "don't-you-touch-that" branch. IMPORTANT: you should **NOT** name this branch *master* or it will mess up with R10k. You should give strict permissions to this repository.

Second, each Puppet module resides in its own git repository. Each repository has only one "golden" branch. You can name it whatever you like (master, production, etc...). Changes are never pushed to this branch directly. Instead, you use **feature** branches to test ...well, your features. Then you open a merge request so that it can be reviewed and potentially accepted by people who have "master" permissions on repositories.

These **feature** branches represent dynamic Puppet environments which are then generated with R10k.


## Environment variables

To work properly, the following environment variables **must** be set

  - **LOG4JS\_CONFIG**: path to the log4js configuration file
  - **PUPPETFILE\_URL**: your Puppetfile repository URL
  - **RD\_BASEURL**: Rundeck base URL
  - **RD\_API\_VERSION**: Rundeck API version
  - **RD\_PROJECT\_NAME**: Rundeck project name containing the r10k jobs
  - **RD\_API\_TOKEN**: Rundeck token to access the API
  - **RD\_API\_JOB\_ENV\_ID**: Rundeck job ID used to deploy entire Puppet environments
  - **RD\_API\_JOB\_MOD\_ID**: Rundeck Job ID used to deploy a specific module in a specific Puppet environment

The following environment variables are **optional**

  - **KOA_LISTEN_PORT**: listen port for Koa (default 3000)
  - **PUPPETFILE_GIT_REMOTE_NAME**: name of the remote for your puppetfile repository (default 'origin')
  - **REDIS_PORT**: port used by your redis instance (default 6379)
  - **REDIS_HOST**: host where redis is running (default 127.0.0.1)


## Logging

Log4js is used as the logging system. An example configuration file is provided in the **examples/log4js/logger.json** file. The file is checked every 30 seconds for changes. This can be useful when you want to change log level without restarting the app.


## Limitations (at the moment)

  - This webhook works only on git branches. Tags are not supported yet, but that'll change soon as it's not that difficult to implement ;)
  - Newly created modules have to be **manually** referenced in your Puppetfile as it should not be something you do on a daily basis. This webhook doesn't automatically add modules if they're not referenced.


## TODO

  - Code optimization. For example, the *create_action*, *modify_action*, *delete_action* share many common parts and could be refactored (use constructor and prototypes maybe)
  - Support git tags
  - Add a feature to send notification to Hip-Chat or similar
  - Add a Github/Stash handler
  - ...


## Issues

Feel free to open an issue if you have any question or if you find that something could be enhanced. I'm kinda busy but I'll do my best to get back to you.
