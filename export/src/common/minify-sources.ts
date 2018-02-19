import { writeFileSync } from 'fs-extra';
import { basename } from 'path';
const uglify = require('uglify-js');
import { readFileSync } from 'fs-extra';

/** Minifies a JavaScript */
export function uglifyJsFile(inputPath: string, outputPath: string) {
  const sourceMapPath = `${outputPath}.map`;
  const result = uglify.minify(readFileSync(inputPath, {encoding: 'utf8'}), {
    sourceMap: {
      filename: `${inputPath}`,
      url: sourceMapPath
    }
  });

  writeFileSync(outputPath, result.code);
  writeFileSync(sourceMapPath, result.map);
}
