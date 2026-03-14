require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const easyecomApi = require('./services/easyecomApi');

(async () => {
  await easyecomApi.authenticate();

  let allItems = [];
  let nextUrl = null;
  let page = 0;

  while (true) {
    page++;
    const params = { includeLocations: 1, limit: 100 };

    let result;
    if (nextUrl) {
      // Extract params from nextUrl
      try {
        const parsed = new URL(nextUrl, easyecomApi.baseUrl);
        for (const [k, v] of parsed.searchParams) params[k] = v;
      } catch (e) {}
    }

    result = await easyecomApi.request('GET', '/getInventoryDetailsV3', null, params);
    const items = result.data?.inventoryData || [];
    console.log(`Page ${page}: ${items.length} items`);

    allItems.push(...items);
    nextUrl = result.data?.nextUrl;

    if (!nextUrl || items.length === 0) break;
    if (page > 30) break; // safety
  }

  console.log(`\nTotal items: ${allItems.length}`);
  const withStock = allItems.filter(i => i.availableInventory > 0);
  console.log(`Items with stock > 0: ${withStock.length}`);

  if (withStock.length > 0) {
    console.log('\nSample items with stock:');
    for (const item of withStock.slice(0, 5)) {
      console.log(`  ${item.companyName} | ${item.sku} | qty: ${item.availableInventory}`);
    }
  }
})();
