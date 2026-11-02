import fs from 'node:fs';
const LIVE = 'https://weiyifu13757187351.github.io/smart-catering-recipe-prototype/merchant/' + encodeURIComponent('食联网数智餐饮平台-组织及人员.html');
const LOCAL = '食联网数智餐饮平台-组织及人员.html';

const r = await fetch(LIVE + '?cb=' + Date.now(), { headers: { 'cache-control': 'no-cache' } });
const live = await r.text();
const local = fs.readFileSync(LOCAL, 'utf8');

console.log('live status', r.status, 'len', live.length);
console.log('local len', local.length);
console.log('live script 标签数', (live.match(/<script/g) || []).length, '| local', (local.match(/<script/g) || []).length);
console.log('live src 脚本', (live.match(/<script[^>]+src="[^"]+"/g) || []).length, '| local', (local.match(/<script[^>]+src="[^"]+"/g) || []).length);
console.log('live 结尾:', JSON.stringify(live.slice(-120)));
console.log('local 结尾:', JSON.stringify(local.slice(-120)));
console.log('live 含 purchasePlanNav 字样:', live.includes('purchasePlanNav'), '| local:', local.includes('purchasePlanNav'));
console.log('live 含 merchant-purchase-order-v2.js:', live.includes('merchant-purchase-order-v2.js'));
const srcTags = (local.match(/<script[^>]+src="[^"]+"/g) || []);
console.log('\n本地 src 脚本清单:'); srcTags.forEach(s => console.log('  ', s.replace(/\s+/g, ' ')));
console.log('\n线上缺失的 src 脚本:');
srcTags.forEach(s => { const name = (s.match(/src="([^"?]+)/) || [])[1]; if (name && !live.includes(name)) console.log('   缺 ', name); });
