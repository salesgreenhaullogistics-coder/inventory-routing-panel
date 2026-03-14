const https = require('https');
const http = require('http');

class EasyEcomApi {
  constructor() {
    this.baseUrl = process.env.EASYECOM_API_BASE || 'https://api.easyecom.io';
    this.email = process.env.EASYECOM_EMAIL;
    this.password = process.env.EASYECOM_PASSWORD;
    this.apiKey = process.env.EASYECOM_API_KEY;
    this.locationKey = process.env.EASYECOM_LOCATION_KEY || '';
    this.token = null;
    this.tokenExpiry = null;
  }

  async request(method, path, body = null, params = {}) {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    const headers = {
      'Content-Type': 'application/json',
    };

    // x-api-key is mandatory for ALL endpoints
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return new Promise((resolve, reject) => {
      const transport = url.protocol === 'https:' ? https : http;
      const req = transport.request(url, { method, headers }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 401) {
              reject(new Error('Authentication failed. Check EasyEcom credentials.'));
            } else if (res.statusCode === 429) {
              reject(new Error('EasyEcom rate limit exceeded. Try again later.'));
            } else if (res.statusCode >= 400) {
              reject(new Error(`EasyEcom API error ${res.statusCode}: ${parsed.message || data.substring(0, 300)}`));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`Failed to parse EasyEcom response: ${data.substring(0, 300)}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // POST /access/token
  async authenticate() {
    try {
      const body = {
        email: this.email,
        password: this.password,
      };
      if (this.locationKey) {
        body.location_key = this.locationKey;
      }

      const result = await this.request('POST', '/access/token', body);

      // Response: { data: { token: { jwt_token, token_type, expires_in } } }
      const tokenData = result.data?.token;
      if (tokenData?.jwt_token) {
        this.token = tokenData.jwt_token;
        // expires_in is in seconds (7884000 = ~91 days), refresh at 90 days
        this.tokenExpiry = Date.now() + (tokenData.expires_in - 86400) * 1000;
      } else {
        throw new Error('No jwt_token in auth response');
      }

      console.log('[EasyEcom] Authentication successful. Company:', result.data?.companyname || 'N/A');
      return true;
    } catch (err) {
      console.error('[EasyEcom] Authentication failed:', err.message);
      return false;
    }
  }

  async ensureAuth() {
    if (!this.token || (this.tokenExpiry && Date.now() > this.tokenExpiry)) {
      const ok = await this.authenticate();
      if (!ok) throw new Error('EasyEcom authentication failed');
    }
  }

  // GET /orders/V2/getAllOrders
  // Max 7-day date range, max 250 per page, cursor-based pagination
  async fetchOrders(startDate, endDate) {
    await this.ensureAuth();

    const allOrders = [];
    let cursor = null;
    let pageNum = 0;

    // Format dates as YYYY-MM-DD HH:MM:SS
    const fmtStart = formatDateForApi(startDate);
    const fmtEnd = formatDateForApi(endDate);

    while (true) {
      pageNum++;
      try {
        const params = {
          start_date: fmtStart,
          end_date: fmtEnd,
          limit: 250,
        };
        if (cursor) params.cursor = cursor;

        const result = await this.request('GET', '/orders/V2/getAllOrders', null, params);

        const orders = result.data?.orders || [];
        console.log(`[EasyEcom] Orders page ${pageNum}: ${orders.length} records`);

        if (orders.length === 0) break;
        allOrders.push(...orders);

        // Check for next cursor in response
        const nextUrl = result.data?.nextUrl || result.data?.next;
        if (nextUrl) {
          try {
            const nextParsed = new URL(nextUrl, this.baseUrl);
            cursor = nextParsed.searchParams.get('cursor');
            if (!cursor) break;
          } catch {
            break;
          }
        } else {
          break;
        }
      } catch (err) {
        console.error(`[EasyEcom] Error fetching orders page ${pageNum}:`, err.message);
        break;
      }
    }

    console.log(`[EasyEcom] Total orders fetched: ${allOrders.length}`);
    return allOrders.map(mapOrder);
  }

  // GET /getInventoryDetailsV3
  async fetchInventory() {
    await this.ensureAuth();

    const allInventory = [];
    let nextUrl = null;
    let page = 0;

    while (true) {
      page++;
      try {
        const params = { includeLocations: 1, limit: 100 };

        // Parse pagination params from nextUrl if available
        if (nextUrl) {
          try {
            const parsed = new URL(nextUrl, this.baseUrl);
            for (const [k, v] of parsed.searchParams) params[k] = v;
          } catch (e) { /* use default params */ }
        }

        const result = await this.request('GET', '/getInventoryDetailsV3', null, params);

        const items = result.data?.inventoryData || result.data || [];
        console.log(`[EasyEcom] Inventory page ${page}: ${items.length} records`);

        if (items.length === 0) break;
        allInventory.push(...items);

        nextUrl = result.data?.nextUrl;
        if (!nextUrl) break;
        if (page > 50) break; // safety limit
      } catch (err) {
        console.error(`[EasyEcom] Error fetching inventory page ${page}:`, err.message);
        break;
      }
    }

    console.log(`[EasyEcom] Total inventory fetched: ${allInventory.length}`);
    return allInventory.map(mapInventory);
  }

  // POST /webhook/v2/createOrder
  async createOrder(orderData) {
    await this.ensureAuth();

    const result = await this.request('POST', '/webhook/v2/createOrder', orderData);

    if (result.code === 200) {
      console.log(`[EasyEcom] Order created: ${result.data?.OrderID} / Invoice: ${result.data?.InvoiceID}`);
      return {
        success: true,
        orderId: result.data?.OrderID,
        invoiceId: result.data?.InvoiceID,
        suborderId: result.data?.SuborderID,
        message: result.message,
      };
    } else {
      throw new Error(`Create order failed: ${result.message || JSON.stringify(result)}`);
    }
  }

  // Build the request body for creating an order at a specific warehouse location
  buildCreateOrderPayload(order, orderItems, warehouseAllocations) {
    // warehouseAllocations: [{ warehouseId, warehouseName, allocatedQty, sku }]
    const items = warehouseAllocations.map(alloc => ({
      Sku: alloc.sku,
      Quantity: String(alloc.allocatedQty),
      Price: 0, // Will be set from original order if available
      productName: alloc.sku,
      OrderItemId: `${order.easyecom_order_id}_${alloc.sku}_${alloc.warehouseId}`,
    }));

    return {
      orderType: 'retailorder',
      marketplaceId: 10, // Default; can be mapped from marketplace
      orderNumber: `RT_${order.easyecom_order_id}_${Date.now()}`,
      orderDate: order.order_date || new Date().toISOString().replace('T', ' ').substring(0, 19),
      paymentMode: 2, // PrePaid default
      shippingMethod: 1,
      items,
      customer: [
        {
          shipping: {
            name: order.customer_name || 'Customer',
            addressLine1: order.shipping_address || 'Address',
            postalCode: order.shipping_pincode || '',
            city: order.shipping_city || '',
            state: order.shipping_state || '',
            country: 'India',
            contact: order.customer_phone || '',
            email: order.customer_email || '',
          },
          billing: {
            name: order.customer_name || 'Customer',
            addressLine1: order.shipping_address || 'Address',
            postalCode: order.shipping_pincode || '',
            city: order.shipping_city || '',
            state: order.shipping_state || '',
            country: 'India',
            contact: order.customer_phone || '',
            email: order.customer_email || '',
          },
        },
      ],
    };
  }

  // GET /account/v1/api/locations — Get all warehouse locations
  async getLocations() {
    await this.ensureAuth();
    const result = await this.request('GET', '/account/v1/api/locations');
    return result.data || [];
  }
}

// Helper: format date as "YYYY-MM-DD HH:MM:SS"
function formatDateForApi(dateStr) {
  if (!dateStr) return '';
  // If already in correct format, return as-is
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateStr)) return dateStr;
  // If date-only (YYYY-MM-DD), add time
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr + ' 00:00:00';
  // Try to parse
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

// All EasyEcom column headers A–DH for raw data export
const RAW_DATA_COLUMNS = [
  'Client Location','Seller GST Num','MP Name','B2B Sales Channel','Reference Code',
  'Suborder No','Order Type','Manifest ID','EE Invoice No','MP Ref No',
  'Order Status','Shipping Status','Import Date','Order Date','Assigned At',
  'TAT','Invoice Date','QC Confirmed At','Confirmed At','Printed At',
  'Manifested At','Cancelled At','Delivered At','Handover At','Batch ID',
  'Message','Courier Aggregator Name','Courier','AWB No','Packing Material',
  'Suborder Quantity','Item Quantity','SKU','SKU Type','Sub Product Count',
  'Marketplace Sku','Product Name','Category','Brand','Model No',
  'Product Tax Code','EAN','Size','Cost','MRP',
  'Packaging Dimensions','Package Height','Package Length','Package Width','Package Weight',
  'Product Weight','Product Height','Product Length','Product Width','Payment Mode',
  'Payment Gateway','Payment Transaction ID','Listing Ref No','Checkout ID','Discount Codes',
  'Buyer GST Num','Shipping Customer Name','Mobile No','Shipping Address Line 1','Shipping Address Line 2',
  'Customer Email','Shipping City','Shipping Zip Code','Shipping State','Shipping Country',
  'Billing Customer Name','Billing Address Line 1','Billing Address Line 2','Billing City','Billing Zip Code',
  'Billing State','Billing Country','Country Code','Parent Currency Multiplier','Order Invoice Amount',
  'Order Invoice Amount Acc. to Parent Currency','TCS Rate','TCS Amount','Selling Price',
  'Selling Price Acc. to Parent Currency','Tax Type','Tax Rate','Order Collectible Amount',
  'Tax','Item Price Excluding Tax','Custom fields','Sales Channel','Accounting Sku',
  'Accounting Unit','Expected Delivery Date','ERP Customer ID','EE Client ID',
  'Shipment weight (g)','Hold Datetime','Unhold Datetime','GRN Batch Codes',
  'Cost of Goods purchased','Delivery Appointment Date','Last Status Update',
  'Consignment Number','MP Alias','Shipment length (cm)','Shipment width (cm)',
  'Shipment height (cm)','uom_quantity','uom_sku','Invoice_id'
];

// Map EasyEcom API field names to the column headers for raw data export
function buildRawDataRow(raw, sub) {
  return {
    'Client Location': raw.company_name || '',
    'Seller GST Num': raw.seller_gst_num || raw.gstin || '',
    'MP Name': raw.marketplace || '',
    'B2B Sales Channel': raw.b2b_sales_channel || '',
    'Reference Code': raw.reference_code || '',
    'Suborder No': sub?.suborder_num || sub?.suborder_id || '',
    'Order Type': raw.order_type || raw.order_type_key || '',
    'Manifest ID': raw.manifest_id || '',
    'EE Invoice No': raw.invoice_number || raw.invoice_id || '',
    'MP Ref No': raw.marketplace_reference_number || raw.mp_ref_no || '',
    'Order Status': raw.order_status || '',
    'Shipping Status': raw.shipping_status || '',
    'Import Date': raw.import_date || '',
    'Order Date': raw.order_date || '',
    'Assigned At': raw.assigned_at || '',
    'TAT': raw.tat || '',
    'Invoice Date': raw.invoice_date || '',
    'QC Confirmed At': raw.qc_confirmed_at || '',
    'Confirmed At': raw.confirmed_at || '',
    'Printed At': raw.printed_at || '',
    'Manifested At': raw.manifested_at || '',
    'Cancelled At': raw.cancelled_at || '',
    'Delivered At': raw.delivered_at || '',
    'Handover At': raw.handover_at || '',
    'Batch ID': raw.batch_id || sub?.batch_id || '',
    'Message': raw.message || '',
    'Courier Aggregator Name': raw.courier_aggregator_name || '',
    'Courier': raw.courier || raw.courier_name || '',
    'AWB No': raw.awb_number || raw.awb_no || '',
    'Packing Material': raw.packing_material || '',
    'Suborder Quantity': sub?.suborder_quantity || sub?.item_quantity || '',
    'Item Quantity': sub?.item_quantity || sub?.suborder_quantity || '',
    'SKU': sub?.sku || '',
    'SKU Type': sub?.sku_type || '',
    'Sub Product Count': sub?.sub_product_count || '',
    'Marketplace Sku': sub?.marketplace_sku || '',
    'Product Name': sub?.productName || sub?.product_name || '',
    'Category': sub?.category || '',
    'Brand': sub?.brand || '',
    'Model No': sub?.model_no || '',
    'Product Tax Code': sub?.product_tax_code || sub?.hsn || '',
    'EAN': sub?.ean || '',
    'Size': sub?.size || '',
    'Cost': sub?.cost || '',
    'MRP': sub?.mrp || '',
    'Packaging Dimensions': sub?.packaging_dimensions || '',
    'Package Height': sub?.package_height || '',
    'Package Length': sub?.package_length || '',
    'Package Width': sub?.package_width || '',
    'Package Weight': sub?.package_weight || '',
    'Product Weight': sub?.weight || '',
    'Product Height': sub?.product_height || '',
    'Product Length': sub?.product_length || '',
    'Product Width': sub?.product_width || '',
    'Payment Mode': raw.payment_mode || '',
    'Payment Gateway': raw.payment_gateway || '',
    'Payment Transaction ID': raw.payment_transaction_id || '',
    'Listing Ref No': raw.listing_ref_no || '',
    'Checkout ID': raw.checkout_id || '',
    'Discount Codes': raw.discount_codes || '',
    'Buyer GST Num': raw.buyer_gst_num || '',
    'Shipping Customer Name': raw.customer_name || '',
    'Mobile No': raw.contact_num || '',
    'Shipping Address Line 1': raw.address_line_1 || '',
    'Shipping Address Line 2': raw.address_line_2 || '',
    'Customer Email': raw.email || '',
    'Shipping City': raw.city || '',
    'Shipping Zip Code': raw.pin_code || '',
    'Shipping State': raw.state || '',
    'Shipping Country': raw.country || 'India',
    'Billing Customer Name': raw.billing_name || raw.customer_name || '',
    'Billing Address Line 1': raw.billing_address_line_1 || '',
    'Billing Address Line 2': raw.billing_address_line_2 || '',
    'Billing City': raw.billing_city || '',
    'Billing Zip Code': raw.billing_pin_code || '',
    'Billing State': raw.billing_state || '',
    'Billing Country': raw.billing_country || '',
    'Country Code': raw.country_code || '',
    'Parent Currency Multiplier': raw.parent_currency_multiplier || '',
    'Order Invoice Amount': raw.total_amount || raw.order_invoice_amount || '',
    'Order Invoice Amount Acc. to Parent Currency': raw.order_invoice_amount_parent_currency || '',
    'TCS Rate': raw.tcs_rate || '',
    'TCS Amount': raw.tcs_amount || '',
    'Selling Price': sub?.selling_price || '',
    'Selling Price Acc. to Parent Currency': sub?.selling_price_parent_currency || '',
    'Tax Type': sub?.tax_type || '',
    'Tax Rate': sub?.tax_rate || '',
    'Order Collectible Amount': raw.collectible_amount || '',
    'Tax': sub?.tax || '',
    'Item Price Excluding Tax': sub?.item_price_excluding_tax || '',
    'Custom fields': raw.custom_fields ? JSON.stringify(raw.custom_fields) : '',
    'Sales Channel': raw.sales_channel || '',
    'Accounting Sku': sub?.accounting_sku || '',
    'Accounting Unit': sub?.accounting_unit || '',
    'Expected Delivery Date': raw.expected_delivery_date || '',
    'ERP Customer ID': raw.erp_customer_id || '',
    'EE Client ID': raw.ee_client_id || raw.client_id || '',
    'Shipment weight (g)': raw.shipment_weight || '',
    'Hold Datetime': raw.hold_datetime || '',
    'Unhold Datetime': raw.unhold_datetime || '',
    'GRN Batch Codes': sub?.grn_batch_codes || '',
    'Cost of Goods purchased': sub?.cost_of_goods || '',
    'Delivery Appointment Date': raw.delivery_appointment_date || '',
    'Last Status Update': raw.last_status_update || '',
    'Consignment Number': raw.consignment_number || '',
    'MP Alias': raw.mp_alias || '',
    'Shipment length (cm)': raw.shipment_length || '',
    'Shipment width (cm)': raw.shipment_width || '',
    'Shipment height (cm)': raw.shipment_height || '',
    'uom_quantity': sub?.uom_quantity || '',
    'uom_sku': sub?.uom_sku || '',
    'Invoice_id': raw.invoice_id || '',
  };
}

// Map EasyEcom order response to our schema
function mapOrder(raw) {
  // Suborders contain the line items
  const suborders = raw.suborders || [];

  // Build raw data rows (one per suborder line for export)
  const rawDataRows = suborders.length > 0
    ? suborders.map(sub => buildRawDataRow(raw, sub))
    : [buildRawDataRow(raw, null)];

  return {
    easyecom_order_id: String(raw.order_id || ''),
    invoice_id: raw.invoice_id || null,
    reference_code: raw.reference_code || '',
    order_date: raw.order_date || '',
    shipping_pincode: String(raw.pin_code || '').trim(),
    marketplace: raw.marketplace || '',
    marketplace_id: raw.marketplace_id || null,
    customer_name: raw.customer_name || '',
    customer_phone: raw.contact_num || '',
    customer_email: raw.email || '',
    company_name: raw.company_name || '',
    import_warehouse_name: raw.import_warehouse_name || '',
    import_warehouse_id: raw.import_warehouse_id || null,
    shipping_address: raw.address_line_1 || '',
    shipping_city: raw.city || '',
    shipping_state: raw.state || '',
    order_status: raw.order_status || '',
    order_status_id: raw.order_status_id || null,
    payment_mode: raw.payment_mode || '',
    total_amount: parseFloat(raw.total_amount || 0),
    order_quantity: raw.order_quantity || 0,
    raw_data: JSON.stringify(rawDataRows),
    items: suborders.map(sub => ({
      suborder_id: sub.suborder_id || null,
      marketplace_sku: sub.marketplace_sku || sub.sku || '',
      sku: sub.sku || sub.marketplace_sku || '',
      product_name: sub.productName || sub.product_name || '',
      quantity: parseInt(sub.suborder_quantity || sub.item_quantity || sub.Quantity || 1, 10),
      selling_price: parseFloat(sub.selling_price || 0),
      weight_per_unit_kg: parseFloat(sub.weight || 0) / 1000, // EasyEcom sends weight in grams
      category: sub.category || '',
      brand: sub.brand || '',
    })),
    total_weight_kg: suborders.reduce((sum, sub) =>
      sum + ((parseFloat(sub.weight || 0) / 1000) * parseInt(sub.suborder_quantity || sub.item_quantity || 1, 10)), 0),
  };
}

// Map EasyEcom inventory response to our schema
function mapInventory(raw) {
  return {
    company_name: raw.companyName || raw.company_name || '',
    location_key: raw.location_key || '',
    sku: raw.sku || '',
    product_name: raw.productName || '',
    quantity: parseInt(raw.availableInventory ?? raw.available_qty ?? raw.quantity ?? 0, 10),
    warehouse_name: raw.companyName || '',
    weight: parseFloat(raw.weight || 0),
    mrp: parseFloat(raw.mrp || 0),
    cost: parseFloat(raw.cost || 0),
    category: raw.category || '',
    brand: raw.brand || '',
    // EasyEcom inventory API doesn't have explicit status/shelf_life fields
    // Status is inferred: if availableInventory > 0, it's available
    status: (parseInt(raw.availableInventory ?? 0, 10) > 0) ? 'Available' : 'OutOfStock',
    // Shelf life not provided by this endpoint — default to 100 unless batch/expiry data exists
    shelf_life_pct: 100,
  };
}

const easyecomApiInstance = new EasyEcomApi();
easyecomApiInstance.RAW_DATA_COLUMNS = RAW_DATA_COLUMNS;
module.exports = easyecomApiInstance;
