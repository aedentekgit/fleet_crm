import 'dotenv/config';
import { MongoClient } from 'mongodb';
import handler from './api/db.js';
import notifyHandler from './api/notify.js';
import webhookHandler from './api/webhook.js';
import uploadHandler from './api/upload.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = 'renserp';

// Mock Express req and res helper
function createMockReqRes({ method = 'GET', query = {}, body = null }) {
  const req = {
    method,
    query,
    body,
    headers: {},
  };

  const resData = {
    statusCode: 200,
    headers: {},
    body: null,
  };

  const res = {
    setHeader(key, val) {
      resData.headers[key] = val;
    },
    status(code) {
      resData.statusCode = code;
      return res;
    },
    json(data) {
      resData.body = data;
      return res;
    },
    send(data) {
      resData.body = data;
      return res;
    },
    end() {
      return res;
    }
  };

  return { req, res, getResult: () => resData };
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('  RENS ERP — LOCAL MONGODB COMPREHENSIVE TEST SUITE');
  console.log('======================================================\n');
  console.log(`Connecting to: ${MONGODB_URI}/${DB_NAME}\n`);

  const results = [];
  function record(testName, passed, details = '') {
    results.push({ testName, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark} | ${testName} ${details ? `(${details})` : ''}`);
  }

  // 1. Direct MongoDB Ping
  try {
    const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
    await client.connect();
    const db = client.db(DB_NAME);
    const pingRes = await db.command({ ping: 1 });
    await client.close();
    record('Direct MongoDB Connection & Ping', pingRes.ok === 1, `Ping OK`);
  } catch (err) {
    record('Direct MongoDB Connection & Ping', false, err.message);
    console.error('Fatal: Cannot connect to MongoDB. Aborting.');
    return;
  }

  // 2. Health & Status Check via /api/db?table=status
  try {
    const { req, res, getResult } = createMockReqRes({ method: 'GET', query: { table: 'status' } });
    await handler(req, res);
    const r = getResult();
    record('API DB Status Check (/api/db?table=status)', r.statusCode === 200 && r.body?.connected === true, `Type: ${r.body?.type}, DB: ${r.body?.database}`);
  } catch (err) {
    record('API DB Status Check (/api/db?table=status)', false, err.message);
  }

  // 3. Seed Demo / Admin Setup
  try {
    const { req, res, getResult } = createMockReqRes({ method: 'GET', query: { action: 'seed_demo' } });
    await handler(req, res);
    const r = getResult();
    record('API DB Seed Demo (/api/db?action=seed_demo)', r.statusCode === 200 && r.body?.success === true, r.body?.message);
  } catch (err) {
    record('API DB Seed Demo (/api/db?action=seed_demo)', false, err.message);
  }

  // 4. Verify Seeded Staff Account Query
  try {
    const { req, res, getResult } = createMockReqRes({ method: 'GET', query: { table: 'staff' } });
    await handler(req, res);
    const r = getResult();
    const staff = r.body?.data || [];
    const hasAdmin = staff.some(s => s.username === 'Admin' || s.username === 'Dynamic');
    record('Query Staff Collection (GET /api/db?table=staff)', hasAdmin, `Found ${staff.length} staff records`);
  } catch (err) {
    record('Query Staff Collection (GET /api/db?table=staff)', false, err.message);
  }

  // 5. Create / Upsert Customer (POST)
  const testCustomer = {
    id: 'cust-test-101',
    company_name: 'Alpha Logistics Sdn Bhd',
    contact_person: 'John Tan',
    phone: '+60123456789',
    email: 'john@alphalogistics.com',
    payment_terms: '30_days',
    status: 'active'
  };

  try {
    const { req, res, getResult } = createMockReqRes({
      method: 'POST',
      body: { table: 'customers', data: testCustomer }
    });
    await handler(req, res);
    const r = getResult();
    record('Create/Upsert Customer (POST /api/db)', r.statusCode === 200 && r.body?.success === true, `ID: ${testCustomer.id}`);
  } catch (err) {
    record('Create/Upsert Customer (POST /api/db)', false, err.message);
  }

  // 6. Query Customer with JSON Where Condition
  try {
    const { req, res, getResult } = createMockReqRes({
      method: 'GET',
      query: {
        table: 'customers',
        where: JSON.stringify([{ col: 'id', op: '=', val: 'cust-test-101' }])
      }
    });
    await handler(req, res);
    const r = getResult();
    const data = r.body?.data || [];
    record('Query with JSON Where Clause (id = cust-test-101)', data.length === 1 && data[0].company_name === 'Alpha Logistics Sdn Bhd', `Matched: ${data[0]?.company_name}`);
  } catch (err) {
    record('Query with JSON Where Clause', false, err.message);
  }

  // 7. Regex Search (LIKE)
  try {
    const { req, res, getResult } = createMockReqRes({
      method: 'GET',
      query: {
        table: 'customers',
        where: JSON.stringify([{ col: 'company_name', op: 'LIKE', val: 'Alpha' }])
      }
    });
    await handler(req, res);
    const r = getResult();
    const data = r.body?.data || [];
    record('Regex / LIKE Filter (company_name LIKE %Alpha%)', data.length >= 1, `Matched ${data.length} records`);
  } catch (err) {
    record('Regex / LIKE Filter', false, err.message);
  }

  // 8. Update Customer (PUT)
  try {
    const { req, res, getResult } = createMockReqRes({
      method: 'PUT',
      body: {
        table: 'customers',
        id: 'cust-test-101',
        data: { contact_person: 'Jonathan Tan (Updated)' }
      }
    });
    await handler(req, res);
    const r = getResult();
    record('Update Customer Record (PUT /api/db)', r.statusCode === 200 && r.body?.success === true, `Modified count: ${r.body?.affectedRows}`);
  } catch (err) {
    record('Update Customer Record (PUT /api/db)', false, err.message);
  }

  // 9. Create Driver & Job Workflow
  const testDriver = { id: 'drv-test-1', name: 'Muthu Kumar', phone: '+60119876543' };
  const testJob = {
    id: 'job-test-5001',
    job_no: 'RJ-202608-9999',
    customer_id: 'cust-test-101',
    driver_id: 'drv-test-1',
    pickup_location: 'Port Klang',
    dropoff_location: 'Shah Alam Industrial Park',
    status: 'assigned'
  };

  try {
    // Insert driver
    const mockDrv = createMockReqRes({ method: 'POST', body: { table: 'drivers', data: testDriver } });
    await handler(mockDrv.req, mockDrv.res);

    // Insert job
    const mockJob = createMockReqRes({ method: 'POST', body: { table: 'jobs', data: testJob } });
    await handler(mockJob.req, mockJob.res);
    const r = mockJob.getResult();
    record('Insert Driver and Job Documents', r.statusCode === 200 && r.body?.success === true, `Job No: ${testJob.job_no}`);
  } catch (err) {
    record('Insert Driver and Job Documents', false, err.message);
  }

  // 10. Test Notification Handler with MongoDB
  try {
    const { req, res, getResult } = createMockReqRes({
      method: 'POST',
      body: { job_id: 'job-test-5001' }
    });
    await notifyHandler(req, res);
    const r = getResult();
    record('Notify Handler Integration (/api/notify)', r.statusCode === 200 && r.body?.ok === true, `Job No: ${r.body?.job_no}`);
  } catch (err) {
    record('Notify Handler Integration (/api/notify)', false, err.message);
  }

  // 11. Test Webhook Handler with MongoDB (Driver Delivery update)
  try {
    const { req, res, getResult } = createMockReqRes({
      method: 'POST',
      body: {
        entry: [{
          changes: [{
            value: {
              messages: [{ text: { body: 'delivered RJ-202608-9999' } }]
            }
          }]
        }]
      }
    });
    await webhookHandler(req, res);
    
    // Verify job status updated in DB
    const checkJob = createMockReqRes({
      method: 'GET',
      query: { table: 'jobs', where: JSON.stringify([{ col: 'job_no', op: '=', val: 'RJ-202608-9999' }]) }
    });
    await handler(checkJob.req, checkJob.res);
    const checkRes = checkJob.getResult();
    const updatedJob = checkRes.body?.data?.[0];

    record('Webhook Driver Status Automation (/api/webhook)', updatedJob?.status === 'delivered', `New status: ${updatedJob?.status}`);
  } catch (err) {
    record('Webhook Driver Status Automation (/api/webhook)', false, err.message);
  }

  // 12. Delete Test Record (DELETE)
  try {
    const { req, res, getResult } = createMockReqRes({
      method: 'DELETE',
      body: {
        table: 'jobs',
        id: 'job-test-5001'
      }
    });
    await handler(req, res);
    const r = getResult();
    record('Delete Document (DELETE /api/db)', r.statusCode === 200 && r.body?.success === true, `Deleted: ${r.body?.affectedRows}`);
  } catch (err) {
    record('Delete Document (DELETE /api/db)', false, err.message);
  }

  // 13. File Upload (POST /api/upload)
  let uploadedFilename = null;
  try {
    const testBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const { req, res, getResult } = createMockReqRes({
      method: 'POST',
      body: {
        filename: 'test_receipt.png',
        dataUrl: testBase64
      }
    });
    await uploadHandler(req, res);
    const r = getResult();
    uploadedFilename = r.body?.filename;
    record('File Upload (POST /api/upload)', r.statusCode === 200 && r.body?.success === true, `File: ${uploadedFilename}`);
  } catch (err) {
    record('File Upload (POST /api/upload)', false, err.message);
  }

  // 14. File Read / Check (GET /api/upload?file=...)
  try {
    const { req, res, getResult } = createMockReqRes({
      method: 'GET',
      query: { file: uploadedFilename }
    });
    await uploadHandler(req, res);
    const r = getResult();
    record('File Read / Check (GET /api/upload)', r.statusCode === 200 && r.body?.exists === true, `URL: ${r.body?.url}`);
  } catch (err) {
    record('File Read / Check (GET /api/upload)', false, err.message);
  }

  // 15. File Delete (DELETE /api/upload?file=...)
  try {
    const { req, res, getResult } = createMockReqRes({
      method: 'DELETE',
      query: { file: uploadedFilename }
    });
    await uploadHandler(req, res);
    const r = getResult();
    record('File Delete (DELETE /api/upload)', r.statusCode === 200 && r.body?.success === true, r.body?.message);
  } catch (err) {
    record('File Delete (DELETE /api/upload)', false, err.message);
  }

  // Summary
  console.log('\n======================================================');
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  console.log(`  TEST RESULTS SUMMARY: ${passedCount}/${totalCount} TESTS PASSED`);
  console.log('======================================================\n');
}

runTestSuite().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
