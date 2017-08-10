/* jshint node: true */
"use strict";

let DeployPluginBase = require('ember-cli-deploy-plugin');
let fs = require('fs');
let path = require('path');
let minimatch = require('minimatch');
let uglify = require('uglify-js');

module.exports = {
  name: 'ember-cli-deploy-appshell',

  included(app) {
    this.app = app;
  },

  contentFor(type, config) {
    if (type === 'head') {
      this.rootURL = config.rootURL;
      this.modulePrefix = config.modulePrefix;
      this.assetsURL = this.app.options.fingerprint.prepend + '/' + config.rootURL + '/';
      // Remove multiple slashes except following `:` and remove multiple leading slashes
      this.assetsURL = this.assetsURL.replace(/([^:]\/)\/+/g, '$1').replace(/^\/+/, '/');
      return `<script src="${this.assetsURL}bootloader.js"></script>`;
    }
  },

  createDeployPlugin(options) {
    let rootURL = () => this.rootURL;
    let assetsURL = () => this.assetsURL;
    let modulePrefix = () => this.modulePrefix;

    let DeployPlugin = DeployPluginBase.extend({
      name: options.name,

      defaultConfig: {
        excludePattern: '{robots.txt,crossdomain.xml}',
        externalDependencies: [],
        prefixDomains: {},
        buildManifest: true,
        distDir(context) {
          return context.distDir;
        },
        distFiles(context) {
          return context.distFiles;
        },
      },

      didBuild(context) {
        this.buildBootLoader(context);
        if (this.readConfig('buildManifest')) {
          this.buildManifest(context);
        }
      },

      buildBootLoader(context) {
        let distDir = this.readConfig('distDir');
        fs.writeFileSync(path.join(distDir, 'bootloader.js'), this.writeBootloader());
        if (context.distFiles) {
          context.distFiles.push('bootloader.js');
        }
      },

      buildManifest(context) {
        let distDir = this.readConfig('distDir');
        let files = this.readConfig('distFiles');
        let indexHTML = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
        fs.writeFileSync(path.join(distDir, 'manifest.appcache'), this.writeManifest(files));
        fs.writeFileSync(path.join(distDir, 'index.html'), indexHTML.replace(/<html/i, `<html manifest="${rootURL()}manifest.appcache"`));
        if (context.distFiles) {
          context.distFiles.push('manifest.appcache');
        }
      },

      writeManifest(paths) {
        let excludePattern = this.readConfig('excludePattern');
        let prefixDomains = this.readConfig('prefixDomains');
        let outputPaths = paths.filter((p) => !minimatch(p, excludePattern))
          .map((p) => {
            let domain = Object.keys(prefixDomains).find((domain) => minimatch(p, prefixDomains[domain]));
            if (domain) {
              return domain + p;
            } else {
              return p;
            }
          });

        return [
          'CACHE MANIFEST',
          `# ${new Date()}`,
        ].concat(
          outputPaths,
          this.readConfig('externalDependencies'),
          'NETWORK:',
          '*'
        ).join("\n");
      },

      writeBootloader() {
        let loader = fs.readFileSync(require.resolve('loader.js'), 'utf8');
        let src = fs.readFileSync(path.join(__dirname, 'lib', 'bootloader.js'), 'utf8')
          .replace(/MODULE_PREFIX/g, modulePrefix())
          .replace(/APPSHELL_PATH/g, rootURL());
        return uglify.minify(loader + src, { fromString: true, mangle: true, compress: true }).code;
      }
    });

    return new DeployPlugin();
  }
};
