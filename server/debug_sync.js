require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const api = require('./services/easyecomApi');
(async () => {
  const orders = await api.fetchOrders('2026-03-11', '2026-03-12');
  console.log('Total:', orders.length);
  const noDate = orders.filter(o => !o.order_date);
  console.log('No order_date:', noDate.length);
  if (noDate.length > 0) console.log('Sample no-date:', JSON.stringify(noDate[0]).substring(0, 300));
  let emptyItems = 0;
  for (const o of orders) {
    if (!o.items || o.items.length === 0) emptyItems++;
  }
  console.log('No items:', emptyItems);
  console.log('Sample order:', JSON.stringify(orders[0]).substring(0, 500));
})();
