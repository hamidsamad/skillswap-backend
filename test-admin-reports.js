// Comprehensive verification test for Admin Dashboard & User Report Management System
import http from 'http';

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Running SkillSwap Admin & Reporting Comprehensive Verification Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Login Normal User (Ali Khan)
    console.log('[1] Logging in regular user (Ali Khan)...');
    const userLoginRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/demo-login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { role: 'ali' });

    assert(userLoginRes.status === 200 && userLoginRes.body.token, 'Regular user demo-login succeeded');
    const userToken = userLoginRes.body.token;
    const userId = userLoginRes.body.user._id;

    // 2. Login Admin User (Usman Ghani)
    console.log('[2] Logging in administrator (Usman Ghani)...');
    const adminLoginRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/demo-login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { role: 'admin' });

    assert(adminLoginRes.status === 200 && adminLoginRes.body.user.role === 'admin', 'Admin login succeeded with ADMIN role');
    const adminToken = adminLoginRes.body.token;
    const adminId = adminLoginRes.body.user._id;

    // 3. Security Test: Unauthorized user cannot access Admin Reports API
    console.log('[3] Testing RBAC Security: Regular user accessing /api/admin/reports...');
    const unauthorizedRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/admin/reports',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    assert(unauthorizedRes.status === 403, 'Regular user denied with 403 Forbidden on administrative route');

    // 4. Validation: Invalid report submission (missing fields)
    console.log('[4] Testing report submission validation (missing category & short reason)...');
    const invalidReportRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/reports',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      }
    }, { category: 'InvalidCategory', reason: 'Short' });
    assert(invalidReportRes.status === 400, 'Invalid category / short reason rejected with 400');

    // 5. Validation: User cannot report self
    console.log('[5] Testing self-report rejection...');
    const selfReportRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/reports',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      }
    }, {
      reportedUserId: userId,
      category: 'Other',
      reason: 'Attempting to report my own profile for test'
    });
    assert(selfReportRes.status === 400, 'Self-report rejected with 400');

    // 6. Valid report submission
    console.log('[6] Submitting genuine user report...');
    // Target Fatima Noor
    const fatimaLoginRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/demo-login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { role: 'fatima' });
    const fatimaId = fatimaLoginRes.body.user._id;

    const validReportRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/reports',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      }
    }, {
      reportedUserId: fatimaId,
      category: 'Spam or unwanted content',
      reason: 'Test automated report: user posted unsolicited external promotional links in chat.',
      priority: 'High'
    });

    assert(validReportRes.status === 201 && validReportRes.body.report.reportId, `Report successfully created with ID: ${validReportRes.body?.report?.reportId}`);
    const createdReportId = validReportRes.body.report.reportId;

    // 7. Duplicate Abuse Protection
    console.log('[7] Testing duplicate submission abuse prevention...');
    const duplicateRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/reports',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      }
    }, {
      reportedUserId: fatimaId,
      category: 'Spam or unwanted content',
      reason: 'Duplicate submission test within rate limit window.',
      priority: 'High'
    });
    assert(duplicateRes.status === 429, 'Duplicate report rate-limited with 429 Too Many Requests');

    // 8. Admin retrieves reports
    console.log('[8] Admin fetching /api/admin/reports...');
    const adminReportsRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/admin/reports',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(adminReportsRes.status === 200 && adminReportsRes.body.reports.length > 0, `Admin successfully fetched reports (Count: ${adminReportsRes.body?.totalCount})`);

    const createdReportObj = adminReportsRes.body.reports.find(r => r.reportId === createdReportId);
    assert(Boolean(createdReportObj), `Newly submitted report ${createdReportId} visible in Admin Dashboard`);

    // 9. Admin views report detail
    console.log('[9] Admin viewing report detail and audit open event...');
    const detailRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/reports/${createdReportObj._id}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(detailRes.status === 200 && detailRes.body.report.history.length > 0, 'Report detail retrieved with event history timeline');

    // 10. Admin updates status to Under Review
    console.log('[10] Admin updating status to "Under Review"...');
    const underReviewRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/reports/${createdReportObj._id}/status`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { status: 'Under Review' });
    assert(underReviewRes.status === 200 && underReviewRes.body.report.status === 'Under Review', 'Report marked as Under Review');

    // 11. Admin adds internal note
    console.log('[11] Admin adding internal administrative note...');
    const noteRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/reports/${createdReportObj._id}/notes`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { note: 'Verified promotional links in conversation log. Preparing advisory.' });
    assert(noteRes.status === 200 && noteRes.body.adminNotes.length > 0, 'Internal administrative note successfully appended');

    // 12. Admin assigns report
    console.log('[12] Admin assigning report...');
    const assignRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/reports/${createdReportObj._id}/assign`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { adminId });
    assert(assignRes.status === 200, 'Report assigned to administrator');

    // 13. Admin resolves report
    console.log('[13] Admin marking report as Resolved with resolution details...');
    const resolveRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/reports/${createdReportObj._id}/status`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      status: 'Resolved',
      resolutionAction: 'Content Hidden & Warning Issued',
      resolutionDetails: 'Promotional content removed and user reminded of barter terms.'
    });
    assert(resolveRes.status === 200 && resolveRes.body.report.status === 'Resolved', 'Report successfully marked as Resolved');

    // 14. Moderation Safeguards: User Suspension
    console.log('[14] Testing User Suspension safeguards...');
    // Self-suspension safeguard
    const selfSuspendRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/users/${adminId}/suspend`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { suspend: true, reason: 'Testing self suspension' });
    assert(selfSuspendRes.status === 400, 'Admin self-suspension blocked by safeguard with 400');

    // Suspend target user (Bilal Tariq)
    const bilalLoginRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/demo-login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { role: 'bilal' });
    const bilalId = bilalLoginRes.body.user._id;

    const suspendRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/users/${bilalId}/suspend`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { suspend: true, reason: 'Confirmed violation of community barter policy: advance cash payment demand.' });
    assert(suspendRes.status === 200 && suspendRes.body.user.isSuspended === true, 'Target user successfully suspended with audit rationale');

    // Verify suspended user cannot login
    const blockedLoginRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/demo-login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { role: 'bilal' });
    assert(blockedLoginRes.status === 403 && blockedLoginRes.body.isSuspended === true, 'Suspended user blocked from logging in with 403 and suspension message');

    // Reactivate user
    const reactivateRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/users/${bilalId}/suspend`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, { suspend: false });
    assert(reactivateRes.status === 200 && reactivateRes.body.user.isSuspended === false, 'Target user reactivated');

    // Verify reactivated user can login
    const restoredLoginRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/demo-login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { role: 'bilal' });
    assert(restoredLoginRes.status === 200, 'Reactivated user can log in successfully');

    // 15. Admin Stats Endpoint
    console.log('[15] Fetching dashboard report stats...');
    const statsRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/admin/reports/stats',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(statsRes.status === 200 && statsRes.body.stats.totalReports >= 4, 'Report stats returned accurate counts');

    // 16. Audit Logs Endpoint
    console.log('[16] Fetching immutable audit logs...');
    const auditRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/admin/audit-logs',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(auditRes.status === 200 && auditRes.body.logs.length > 0, `Audit logs returned ${auditRes.body?.logs?.length} recorded events`);

  } catch (err) {
    console.error('Test Suite encountered unhandled error:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
