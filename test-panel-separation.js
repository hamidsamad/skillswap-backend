
import assert from 'assert';

const BASE_URL = 'http://localhost:5000/api';

async function req(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    // text body
  }
  return { status: res.status, body, headers: res.headers };
}

async function runTests() {
  console.log('🧪 Starting SkillSwap Admin & User Panel Separation Verification Suite...\n');

  // 1. Unauthenticated access check
  console.log('[Scenario 1] Unauthenticated request to administrative API:');
  const unauthRes = await req('/admin/reports');
  assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401');
  console.log('  ✅ PASS: Unauthenticated request rejected with 401 Unauthorized');

  // 2. Normal user login (Ali Khan)
  console.log('\n[Scenario 2] Normal user login (Ali Khan):');
  const userLogin = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ali.khan@skillswap.pk', password: 'SwapPass123!' })
  });
  if (userLogin.status !== 200) {
    console.log('User login failed. Body:', userLogin.body);
  }
  assert.strictEqual(userLogin.status, 200, 'User login must succeed');
  assert.strictEqual(userLogin.body.user.role, 'user', 'Normal user role must strictly be "user"');
  const userToken = userLogin.body.token;
  console.log(`  ✅ PASS: Normal user logged in with verified role: "${userLogin.body.user.role}"`);

  // 3. Normal user session verification (/api/auth/me)
  console.log('\n[Scenario 3] Normal user session verification via /api/auth/me:');
  const userMe = await req('/auth/me', { token: userToken });
  assert.strictEqual(userMe.status, 200, 'Session lookup succeeded');
  assert.strictEqual(userMe.body.user.role, 'user', 'Trusted backend role is "user"');
  console.log('  ✅ PASS: Session validation from backend returns role: "user"');

  // 4. Normal user forbidden from administrative endpoints (403 RBAC)
  console.log('\n[Scenario 4] Normal user attempting to access administrative APIs:');
  const adminEndpoints = [
    '/admin/reports',
    '/admin/stats',
    '/admin/reports/stats',
    '/admin/users',
    '/admin/audit-logs'
  ];
  for (const endpoint of adminEndpoints) {
    const res = await req(endpoint, { token: userToken });
    assert.strictEqual(res.status, 403, `Normal user must be forbidden (403) from ${endpoint}`);
    console.log(`  ✅ PASS: Access to ${endpoint} blocked with 403 Forbidden`);
  }

  // 5. Normal user self-promotion protection test
  console.log('\n[Scenario 5] Security Check: Normal user attempting self-promotion to "admin":');
  const tamperRes = await req('/auth/profile', {
    method: 'PUT',
    token: userToken,
    body: JSON.stringify({ role: 'admin', headline: 'Tampered Hacker Profile' })
  });
  assert.strictEqual(tamperRes.status, 200, 'Profile update returns 200');
  assert.strictEqual(tamperRes.body.user.role, 'user', 'Role must remain "user" and ignore self-promotion attempt');
  console.log('  ✅ PASS: Self-promotion blocked: role remains strictly "user"');

  // 6. Normal user reporting a member via public reporting API
  console.log('\n[Scenario 6] Normal user submitting a member report via POST /api/reports:');
  const targetUserLogin = await req('/auth/demo-login', {
    method: 'POST',
    body: JSON.stringify({ role: 'fatima' })
  });
  const targetUserId = targetUserLogin.body.user._id;

  const reportRes = await req('/reports', {
    method: 'POST',
    token: userToken,
    body: JSON.stringify({
      reportedUserId: targetUserId,
      category: 'Spam or unwanted content',
      reason: 'Repeated promotional messages sent during skill swap discussion.',
      priority: 'Medium'
    })
  });
  assert.strictEqual(reportRes.status, 201, 'Report creation must succeed with 201');
  const createdReportId = reportRes.body.report.reportId;
  console.log(`  ✅ PASS: Report submitted successfully with ID: ${createdReportId}`);

  // 7. Administrator login (Usman Ghani)
  console.log('\n[Scenario 7] Administrator login (Usman Ghani):');
  const adminLogin = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@skillswap.pk', password: 'AdminPass123!' })
  });
  assert.strictEqual(adminLogin.status, 200, 'Admin login must succeed');
  assert.strictEqual(adminLogin.body.user.role, 'admin', 'Admin role must strictly be "admin"');
  const adminToken = adminLogin.body.token;
  console.log(`  ✅ PASS: Administrator logged in with verified role: "${adminLogin.body.user.role}"`);

  // 8. Administrator accessing reports management
  console.log('\n[Scenario 8] Administrator retrieving reports list:');
  const reportsListRes = await req('/admin/reports', { token: adminToken });
  assert.strictEqual(reportsListRes.status, 200, 'Admin can fetch reports');
  const foundSubmittedReport = reportsListRes.body.reports.some(r => r.reportId === createdReportId);
  assert(foundSubmittedReport, 'Submitted report must appear in Admin Reports management');
  console.log(`  ✅ PASS: Submitted report ${createdReportId} visible in Admin Reports Management`);

  // 9. Administrator updating report status
  console.log('\n[Scenario 9] Administrator updating report status to "Under Review":');
  const dbReport = reportsListRes.body.reports.find(r => r.reportId === createdReportId);
  const statusRes = await req(`/admin/reports/${dbReport._id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: JSON.stringify({ status: 'Under Review' })
  });
  assert.strictEqual(statusRes.status, 200, 'Status update must succeed');
  assert.strictEqual(statusRes.body.report.status, 'Under Review');
  console.log('  ✅ PASS: Report status successfully updated to "Under Review"');

  // 10. Administrator retrieving dashboard stats
  console.log('\n[Scenario 10] Administrator retrieving high-level metrics:');
  const statsRes = await req('/admin/stats', { token: adminToken });
  assert.strictEqual(statsRes.status, 200, 'Admin stats request succeeded');
  assert(statsRes.body.stats.totalUsers > 0, 'Total users metric present');
  console.log(`  ✅ PASS: Dashboard stats verified (Total Users: ${statsRes.body.stats.totalUsers}, Total Reports: ${statsRes.body.stats.totalReports})`);

  console.log('\n====================================================');
  console.log('🎉 ALL 10 VERIFICATION SCENARIOS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
