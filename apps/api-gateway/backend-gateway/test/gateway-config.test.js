'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const configDir = path.join(__dirname, '..', 'config');
const gatewayConfig = yaml.load(fs.readFileSync(path.join(configDir, 'gateway.config.yml'), 'utf8'));
const systemConfig = yaml.load(fs.readFileSync(path.join(configDir, 'system.config.yml'), 'utf8'));

const pipelinePolicies = () =>
  gatewayConfig.pipelines['user-pipeline'].policies;

const pipelinePolicyNames = () =>
  pipelinePolicies().map(step => Object.keys(step)[0]);

const pipelineStep = name =>
  pipelinePolicies().find(step => step[name])[name];

test('gateway.config.yml declares firebase-auth as an available policy', () => {
  assert.ok(Array.isArray(gatewayConfig.policies));
  assert.ok(gatewayConfig.policies.includes('firebase-auth'));
});

test('existing pipeline order is preserved with firebase-auth inserted before proxy', () => {
  assert.deepEqual(pipelinePolicyNames(), ['rate-limit', 'log', 'firebase-auth', 'proxy']);
});

test('rate-limit configuration is untouched', () => {
  assert.deepEqual(pipelineStep('rate-limit')[0].action, {
    max: 10,
    windowMs: 60000,
    delayAfter: 0,
    delayMs: 0,
    statusCode: 429,
    headers: true
  });
});

test('log configuration is untouched', () => {
  assert.equal(pipelineStep('log')[0].action.message, '${req.method} ${req.originalUrl}');
});

test('firebase-auth action exposes a publicPaths list', () => {
  const action = pipelineStep('firebase-auth')[0].action;
  assert.deepEqual(action.publicPaths, ['/health']);
});

test('proxy still targets the user-service endpoint', () => {
  assert.equal(pipelineStep('proxy')[0].action.serviceEndpoint, 'user-service');
  assert.equal(gatewayConfig.serviceEndpoints['user-service'].url, 'http://localhost:3000');
  assert.deepEqual(gatewayConfig.apiEndpoints['user-api'].paths, ['/users', '/users/*', '/health']);
});

test('system.config.yml registers the firebase-auth plugin', () => {
  assert.equal(systemConfig.plugins['firebase-auth'].package, './plugins/firebase-auth');
});

test('standard-response plugin registration is untouched', () => {
  assert.equal(systemConfig.plugins['standard-response'].package, './plugins/standard-response');
  assert.equal(systemConfig.plugins['standard-response'].exposeInternalErrors, false);
});

test('plugin manifests and entry points exist for every registered plugin', () => {
  for (const name of Object.keys(systemConfig.plugins)) {
    const dir = path.join(__dirname, '..', 'plugins', name);
    assert.ok(fs.existsSync(path.join(dir, 'index.js')), `${name} index.js missing`);
    assert.ok(fs.existsSync(path.join(dir, 'manifest.yml')), `${name} manifest.yml missing`);
  }
});
