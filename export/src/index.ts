#!/usr/bin/env node

import { Observable } from 'rxjs';
import chalk from 'chalk';
import * as camelcase from 'camelcase';
import * as ora from 'ora';
import { Console } from './common/console';
import { generateBundle } from './common/generate-bundle';
import { ngc } from './common/ngc';
import { mergeRecursive } from './common/merge-recursive';
import { uglifyJsFile } from './common/minify-sources';
const inlineResources = require('./common/inline-resources');
const { prettySize } = require('pretty-size');
const replaceInFile = require('replace-in-file');
const gzipSize = require('gzip-size');
import { extname } from 'path';
import { readdir } from 'fs';
import { writeFileSync, removeSync, copySync, pathExists, pathExistsSync, readFileSync, statSync } from 'fs-extra';
const ambConfig = require(`${process.cwd()}/.amb.json`);
const libRoot = ambConfig['root'];
const tmp = ambConfig['tmp'] = `${process.cwd()}/.tmp/${libRoot.split('/').reverse()[0]}`;
const GLOBALS = ambConfig['globals'];
const version = ambConfig['version'];

Console.log('Angular Module Builder CLI');
/** Clean */
function clean() {
  removeSync(`${process.cwd()}/.tmp`);
  removeSync(`${process.cwd()}/${ambConfig['outDir']}`);
}

clean();

/** Copy sources to .tmp */
copySync(libRoot, `${tmp}`);

const modules: Module[] = ambConfig['libs'];
const checkPath = (path: string) => {
  if (!pathExistsSync(path)) {
    Console.error(`does not exist: ${path}`);
  }
  return path;
};


/** Check folder libRoot */
checkPath(libRoot);

function getModuleFile(module: Module, key: string, file: string) {
  let moduleFile = (module as any)[key];

  /** Verifying its existence file default {root}/{dir}/${file} */
  if (pathExistsSync(`${tmp}/${module.dir}/${file}`)) {
    moduleFile = `${tmp}/${module.dir}/${file}`;
  } else if (moduleFile) {
    moduleFile = `${tmp}/${module.dir}/${moduleFile}/${file}`;
  } else {
    moduleFile = `${tmp}/${file}`;
  }
  return moduleFile;
}

/** Update Modules */
modules.forEach((module) => {
  const name = module.name;
  /**
   * set default
   */
  if (!module.dir) {
    module.dir = `${name}`;
  }
  module.container = module.dir;
  module.outDir = `${process.cwd()}/${ambConfig['outDir']}/${module.dir}`;

  module.pkg = getModuleFile(module, 'pkg', 'package.json');

  if (!module.version) {
    module.version = version;
  }

  module.es2015 = getModuleFile(module, 'es2015', 'tsconfig-build.json');

  module.esm = getModuleFile(module, 'esm', 'tsconfig-esm.json');

  for (const $key in module) {
    if (
      module.hasOwnProperty($key) &&
      $key === 'esm' ||
      $key === 'es2015'
    ) {
      const moduleConfig = (module as any)[$key];
      /**
       * Set absolute routes
       * default to {root}/{dir}/key
       */
      // (module as any)[$key] = `${tmp}/${module.dir}/${moduleConfig}`;
    }
  }
  checkPath(`${module.pkg}`);
  module.dir = `${process.cwd()}/${libRoot}/${module.dir}`;
});

// Console.log('modules: ', JSON.stringify(modules, null, 2));

function writeTsConfig(module: Module): {state: boolean, err: any} {
  const es2015 = {
    'compilerOptions': {
      'baseUrl': '.',
      'experimentalDecorators': true,
      'emitDecoratorMetadata': true,
      'module': 'es2015',
      'target': 'es2015',
      'noImplicitAny': false,
      'outDir': '{outDir}/es2015',
      'rootDir': '.',
      'sourceMap': true,
      'inlineSources': true,
      'declaration': false,
      'strictNullChecks': true,
      'lib': ['es2015', 'dom'],
      'skipLibCheck': true,
      'moduleResolution': 'node',
      'paths': { }
    },
    'files': [
      'index.ts'
    ],
    'angularCompilerOptions': {
      'skipTemplateCodegen': true,
      'strictMetadataEmit': true,
      'enableSummariesForJit': false
    }
  };
  const copy_es2015 = JSON.parse(JSON.stringify(es2015));
  const esm = mergeRecursive(copy_es2015, {
    'compilerOptions': {
      'target': 'es5',
      'outDir': '{outDir}',
      'declaration': true
    },
    'files': [
      'public_api.ts'
    ],
    'angularCompilerOptions': {
      'skipTemplateCodegen': true,
      'strictMetadataEmit': true,
      'enableSummariesForJit': false,
      'flatModuleOutFile': 'index.js',
      'flatModuleId': `{name}`
    }
  });
  /** If not exist, create a new one*/
  const createOrUpdateTsConfig = (type: 'es2015' | 'esm') => {
    let tsconfigContent = {} as any;
    if (!pathExistsSync(`${module[type]}`)) {
      tsconfigContent = type === 'es2015' ? es2015 : esm;
    } else {
      tsconfigContent = JSON.parse(readFileSync(`${module[type]}`, {encoding: 'utf8'}));
    }
    if (type === 'es2015') {
      tsconfigContent['compilerOptions']['outDir'] = '{dir}/es2015';
      writeFileSync(`${tmp}/${module.container}/tsconfig-build.json`, JSON.stringify(tsconfigContent, null, 2));
    } else {
      tsconfigContent['compilerOptions']['outDir'] = '{dir}';
      tsconfigContent['angularCompilerOptions']['flatModuleOutFile'] = `index.js`;
      tsconfigContent['angularCompilerOptions']['flatModuleId'] = `${module.name}`;
      tsconfigContent['files'] = ['public_api.ts'];
      writeFileSync(`${tmp}/${module.container}/tsconfig-esm.json`, JSON.stringify(tsconfigContent, null, 2));
    }
  };
  try {
    ['es2015', 'esm'].forEach((val: 'es2015' | 'esm') => {
      createOrUpdateTsConfig(val);
    });
    return {
      state: true,
      err: null
    };
  } catch (error) {
    return {
      state: false,
      err: error
    };
  }
}
const converterToModuleName = (str: string) => str
          .split('/')
          .filter((val: string) => !!val)
          .map((part: string) => camelcase(part))
          .join('.');
const converterToFileName = (str: string) => str
          .split('/')
          .filter((val: string) => !!val)
          .map((part: string) => (part))
          .join('__');

const promiseSerial = (funcs: any[]): Promise<any> =>
  funcs.reduce((promise, func) =>
    promise.then((result: any) => func().then(Array.prototype.concat.bind(result))),
    Promise.resolve([]));
function buildModules():
Observable<{module: Module | null, state: 'start' | 'end' | 'err' | 'finish', msg: string | null}> {
  return new Observable((observer) => {

    /** Inline resources */
    (<Promise<void>>inlineResources(tmp))
    .then(() => {
      const funcs = modules.map(module => () => {
        const state = (st: 'start' | 'end' | 'err' | 'finish', msg: string | null = null) => (observer.next({module, state: st, msg}));

        /** Bump version */
        state('start', 'Updating version...');
        let currentVersion = '';
        replaceInFile.sync({
          files: `${module.dir}/version.ts`,
          from: /(\/\*\*\n?\s?\*?\s?@version.*\n?.*\*\/\n.*\;?\n)/g,
          to: (match: string) => {
            const rgxp = /\'.*\'/;
            const vrsn = (match.match(rgxp) || [])[0];
            if (vrsn.replace(/\'/g, '') !== module.version) {
              currentVersion = vrsn;
            }
            return match.replace(rgxp, `'${module.version}'`);
          }
        });
        state('end', !!currentVersion ? `New version: ${module.version}` : `Current version: ${module.version}`);

        state('start', 'Updating tsconfig');
        writeTsConfig(module).state ? state('end', 'tsconfig updated') : state('err');
        const es2015 = () => {
          state('start', 'Building es2015...');
          return ngc(`${tmp}/${module.container}/tsconfig-build.json`, `${module.outDir}`)
            .then(() => state('end', 'es2015 built'))
            .catch(() => state('err'));
        };
        const esm = () => {
          state('start', 'Building esm...');
          return ngc(`${tmp}/${module.container}/tsconfig-esm.json`, `${module.outDir}`, 'esm')
            .then(() => state('end', 'esm built'))
            .catch(() => state('err'));
        };
        return es2015()
        .then(() => esm())
        .then(() => {
          const globals = GLOBALS as any;
          const inputPathJS = `${module.outDir}/index.js`;
          const outputPathUMD = `${module.outDir}/${converterToFileName(module.name)}.umd.js`;
          const outputPathUMDmin = `${module.outDir}/${converterToFileName(module.name)}.umd.min.js`;
          return generateBundle(inputPathJS, {
            file: outputPathUMD,
            globals,
            name: converterToModuleName(module.name)
          })
          .then(() => ({outputPathUMD, outputPathUMDmin}))
          .catch((err: any) => state('err', err));
        })
        .catch((err: any) => state('err', err))
        .then((result) => {
          state('start', 'Minifying resources...');
          uglifyJsFile(result.outputPathUMD, result.outputPathUMDmin);
          state('end', 'Successfully minified resources');
          state('start', 'Creating package...');
          /** Read file */
          const pkgContent = JSON.parse(readFileSync(`${module.pkg}`, {encoding: 'utf8'}));
          /** Set Config */
          pkgContent['name'] = module.name;
          pkgContent['version'] = module.version;
          pkgContent['main'] = `${converterToFileName(module.name)}.umd.js`;
          pkgContent['es2015'] = `es2015/index.js`;
          pkgContent['module'] = `index.js`;
          pkgContent['typings'] = `index.d.js`;
          writeFileSync(`${module.outDir}/package.json`, JSON.stringify(pkgContent, null, 2));
          // removeSync(`${tmp}/node_modules`);
          copySync(`${module.outDir}`, `${tmp}/node_modules/${module.name}`);
          state('end', 'Package created successfully');
        });
      });
      promiseSerial(funcs)
      .then(() => {
        measure();
        observer.next({module: null, state: 'finish', msg: null});
      })
      .catch(console.error.bind(console));
    });
  });
}

function measure() {
  const measureOf = (module: Module, min?: '.min') => {
    const moduleName = converterToFileName(module.name);
    const path = `${module.outDir}/${moduleName}.umd${min || ''}.js`;
    const file = readFileSync(path);
    const gzip = prettySize(gzipSize.sync(file), true);
    const size = prettySize(statSync(path).size, true);
    return { gzip, size };
  };
  modules.forEach((module) => {
    const moduleName = converterToFileName(module.name);
    const umd = measureOf(module);
    const umdMin = measureOf(module, '.min');
    const txt = {
      original: `${chalk.gray('[original]')}`,
      gzip: `${chalk.gray('[gzip]')}`
    };
    const green = chalk.greenBright;
    const gray = chalk.gray;
    console.log(chalk.yellow(
      `  ${moduleName}.umd.js ${gray('[original]')} ${chalk.red(umd.size)} ${txt.gzip} ${green(umd.gzip)}
  ${moduleName}.umd.min.js ${gray('[minified]')} ${chalk.red(umdMin.size)} ${txt.gzip} ${green(umdMin.gzip)}`));
  });
}

const spinner = ora();
spinner.color = 'magenta';
buildModules().subscribe((state) => {
  const name = state.module ? chalk.hex('#304ffe')(`${camelcase(state.module.name)}: `) : '';
  if (state.state === 'start') {
    state.msg ?
              spinner.start(`${name}${state.msg}`) :
              spinner.start(`${name}Compiling...`);
  } else if (state.state === 'end') {
    state.msg ?
              spinner.succeed(`${name}${state.msg}`) :
              spinner.succeed(`${name}Successfully compilation`);
  } else if (state.state === 'err') {
    clean();
    spinner.fail(`Fail: ${name}`);
    spinner.stop();
    Console.error('~Failed compilation', state.msg ? `=> ${state.msg}` : '');
  } else if (state.state === 'finish') {
    removeSync(`${process.cwd()}/.tmp`);
    spinner.stop();
    Console.log('~All the compilation has been successful');
  }
});

export interface Module {
  name: string;
  /** component folder */
  dir?: string;
  outDir?: string;
  pkg?: string;
  version?: string;
  es2015?: string;
  esm?: string;
  /** {dir}: only dir folder */
  container: string;
}
