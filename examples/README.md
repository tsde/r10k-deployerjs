# Example files

## Ansible

This directory contains two (really) simple Ansible jobs that can be used to launch R10k on your puppet masters. One invokes R10k to deploy an entire environment, the other invokes R10k to deploy a specific module in a specific environment.


## Gitlab

Just an example of payload sent by gitlab during a push event


## Log4js

This directory provides a simple log4js configuration file.


## PM2

This directory provides a sample configuration file for managing multiple instances of the app with [PM2](https://github.com/Unitech/pm2)


## Rundeck

This directory contains two Rundeck job definitions. These jobs are only used to call ansible playbooks through Rundeck API as Ansible doesn't provide one (except via Tower but that's a bit expensive;)


## SSL

Self-signed certificate so you can quickly test the app with SSL. **Of course, don't use this in a production environment.** This is only meant for testing.
