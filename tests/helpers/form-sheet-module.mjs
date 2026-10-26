import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const module={exports:{}};
vm.runInNewContext(readFileSync('wechat-miniprogram/miniprogram/utils/form-sheet.js','utf8'),{module,setTimeout,clearTimeout});
export default module.exports;
