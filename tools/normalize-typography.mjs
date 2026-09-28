// One-time mechanical migration. Layout, colors and scene behavior are untouched.
// Typography now belongs exclusively to assets/css/typography.css.
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const viteRequire=createRequire(require.resolve('vite/package.json'));
const postcss=viteRequire('postcss');
const properties=new Set(['font','font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-transform']);
const files=['src/style.css','assets/css/styles.css','assets/css/about.css','assets/css/studio-sculpture.css','assets/css/site-integration.css'];
for(const file of files){
  const root=postcss.parse(readFileSync(file,'utf8'),{from:file});
  let removed=0;
  root.walkDecls(decl=>{if(properties.has(decl.prop.toLowerCase())){decl.remove();removed++;}});
  root.walkRules(rule=>{if(!rule.nodes.length)rule.remove();});
  writeFileSync(file,root.toString());
  console.log(`${file}: ${removed} legacy typography declarations removed`);
}
