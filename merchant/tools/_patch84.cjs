/* V4.14：没有发货记录（待确认 / 已确认）时不显示「预计发货时间」，改为空态说明 */
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '..');
const log = [];
const ed = (file, pairs) => {
  const P = path.join(D, file);
  let t = fs.readFileSync(P, 'utf8');
  pairs.forEach(([from, to, tag]) => {
    const n = t.split(from).length - 1;
    if (!n) throw new Error('未命中：' + tag);
    t = t.split(from).join(to);
    log.push(tag + ' ×' + n);
  });
  fs.writeFileSync(P, t, 'utf8');
};

ed('merchant-purchase-order-v2.js', [
  [`  /* 发货记录（V2.0.9）：只保留预计发货时间 + 配送员姓名 + 手机号，不再展示发货明细 */
  const ships = (o.shipments && o.shipments.length ? o.shipments : [null]).map(s => {
    const hhmm = s && s.at ? (s.at.split(' ')[1] || '06:00') : '06:00';
    const planAt = \`\${mdw(o.deliveryDate)} \${hhmm}\`;
    return \`<tr><td class="po-sub">\${planAt}</td><td>\${s ? esc(s.driver) : '—'}</td>
      <td class="po-sub">\${s ? esc(s.phone || '—') : '—'}</td></tr>\`;
  }).join('');`,
   `  /* 发货记录（V2.0.9）：只保留预计发货时间 + 配送员姓名 + 手机号，不再展示发货明细。
     V4.14：待确认 / 已确认等**还没有发货记录**的状态，不再编造「预计发货时间」，改为空态说明 */
  const hasShip = !!(o.shipments && o.shipments.length);
  const ships = hasShip ? o.shipments.map(s => {
    const hhmm = s && s.at ? (s.at.split(' ')[1] || '06:00') : '06:00';
    const planAt = \`\${mdw(o.deliveryDate)} \${hhmm}\`;
    return \`<tr><td class="po-sub">\${planAt}</td><td>\${s ? esc(s.driver || '—') : '—'}</td>
      <td class="po-sub">\${s ? esc(s.phone || '—') : '—'}</td></tr>\`;
  }).join('') : '';
  const shipEmpty = o.status === 'wait'
    ? '订单待供应商确认，确认发货后回显预计发货时间与配送员'
    : '供应商尚未发货，发货后回显预计发货时间与配送员';`,
   '发货记录空态数据'],

  [`      <div class="po-section"><h3>发货记录</h3>
        <table class="po-table"><thead><tr><th>预计发货时间</th><th>配送员</th><th>手机号</th></tr></thead><tbody>\${ships}</tbody></table>`,
   `      <div class="po-section"><h3>发货记录</h3>
        \${hasShip
          ? \`<table class="po-table"><thead><tr><th>预计发货时间</th><th>配送员</th><th>手机号</th></tr></thead><tbody>\${ships}</tbody></table>\`
          : \`<div class="po-empty">\${shipEmpty}</div>\`}`,
   '发货记录空态渲染']
]);

console.log(log.join('\n'));
