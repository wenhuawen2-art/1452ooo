const {createRequire}=require('node:module');
const sharp=createRequire('C:/Users/wenhu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/x.js')('sharp');
(async()=>{
 const ref='C:/Users/wenhu/.mgmcp/resources/screenshots/200425698503069/170-8160/加载页_170-8160.png';
 const label=Buffer.from('<svg width="810" height="38"><rect width="810" height="38" fill="#edf1f5"/><text x="12" y="25" font-size="16">MasterGo 393 x 852</text><text x="418" y="25" font-size="16">Implementation - reduced motion</text></svg>');
 await sharp({create:{width:810,height:902,channels:4,background:'#edf1f5'}}).composite([{input:label,left:0,top:0},{input:ref,left:6,top:42},{input:'output/playwright/loading-welcome-393.png',left:411,top:42}]).png().toFile('output/loading-design-comparison.png');
})();
