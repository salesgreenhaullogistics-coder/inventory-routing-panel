require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const easyecomApi = require('./services/easyecomApi');

(async () => {
  await easyecomApi.authenticate();

  // Get raw response to see actual fields
  const result = await easyecomApi.request('GET', '/getInventoryDetailsV3', null, {
    includeLocations: 1,
    limit: 5,
  });

  console.log('Top-level keys:', Object.keys(result));
  console.log('data keys:', result.data ? Object.keys(result.data) : 'no data');

  const items = result.data?.inventoryData || result.data || [];
  if (items.length > 0) {
    console.log('\nFirst item keys:', Object.keys(items[0]));
    console.log('\nFirst item:', JSON.stringify(items[0], null, 2));
  }
})();
