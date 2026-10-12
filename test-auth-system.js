import assert from 'assert';
import jwt from 'jsonwebtoken';

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

async function runAuthVerificationSuite() {
  console.log('🧪 Starting SkillSwap Pakistan Authentication & RBAC Verification Suite...\n');

  // Test 1: Verify Google OAuth endpoint requires token
  console.log('[Test 1] POST /api/auth/google without credentials:');
  const emptyGoogleRes = await req('/auth/google', {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.strictEqual(emptyGoogleRes.status, 400, 'Empty Google auth body must return 400 Bad Request');
  assert.strictEqual(emptyGoogleRes.body.success, false);
  console.log('  ✅ PASS: Empty Google authentication rejected with 400 Bad Request');

  // Test 2: Verify Google OAuth endpoint rejects invalid/fake tokens
  console.log('\n[Test 2] POST /api/auth/google with forged/invalid access token:');
  const forgedGoogleRes = await req('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ access_token: 'fake_forged_google_token_12345' })
  });
  assert(forgedGoogleRes.status === 401 || forgedGoogleRes.status === 500, 'Invalid token must be rejected');
  assert.strictEqual(forgedGoogleRes.body.success, false);
  console.log(`  ✅ PASS: Forged Google access token rejected with status ${forgedGoogleRes.status}: "${forgedGoogleRes.body.message}"`);

  // Test 3: Normal user login through standard form
  console.log('\n[Test 3] Normal user standard sign-in (Ali Khan):');
  const userLogin = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'ali.khan@skillswap.pk', password: 'SwapPass123!' })
  });
  assert.strictEqual(userLogin.status, 200, 'User login must succeed');
  assert.strictEqual(userLogin.body.user.role, 'user', 'Normal user role must strictly be "user"');
  assert(userLogin.body.token, 'Must return JWT token');
  const userToken = userLogin.body.token;
  console.log(`  ✅ PASS: Normal user authenticated with role: "${userLogin.body.user.role}"`);

  // Test 4: Administrator login through standard form (Requirement 4)
  console.log('\n[Test 4] Administrator standard sign-in through normal form (admin@skillswap.pk):');
  const adminLogin = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@skillswap.pk', password: 'AdminPass123!' })
  });
  assert.strictEqual(adminLogin.status, 200, 'Admin login must succeed through normal form');
  assert.strictEqual(adminLogin.body.user.role, 'admin', 'Admin role must strictly be "admin"');
  assert(adminLogin.body.token, 'Must return JWT token');
  const adminToken = adminLogin.body.token;
  console.log(`  ✅ PASS: Administrator authenticated through normal form with role: "${adminLogin.body.user.role}"`);

  // Test 5: Normal user cannot access protected admin routes
  console.log('\n[Test 5] Normal user attempting to access admin APIs:');
  const userAdminCheck = await req('/admin/reports', { token: userToken });
  assert.strictEqual(userAdminCheck.status, 403, 'Normal user must be forbidden from admin API');
  console.log('  ✅ PASS: Normal user access denied (403 Forbidden)');

  // Test 6: Authorized admin can access protected admin routes
  console.log('\n[Test 6] Administrator accessing admin APIs:');
  const adminCheck = await req('/admin/reports', { token: adminToken });
  assert.strictEqual(adminCheck.status, 200, 'Admin must be authorized for admin API');
  console.log('  ✅ PASS: Administrator authorized (200 OK)');

  // Test 7: Invalid credentials rejected
  console.log('\n[Test 7] Invalid password rejected on standard form:');
  const badLogin = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@skillswap.pk', password: 'WrongPassword999!' })
  });
  assert.strictEqual(badLogin.status, 401, 'Invalid password must return 401');
  console.log('  ✅ PASS: Incorrect credentials rejected with 401 Unauthorized');

  // Test 8: Nonexistent user rejected
  console.log('\n[Test 8] Nonexistent user rejected on standard form:');
  const noUserLogin = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'nonexistent_test@skillswap.pk', password: 'AnyPassword123!' })
  });
  assert.strictEqual(noUserLogin.status, 401, 'Nonexistent email must return 401');
  console.log('  ✅ PASS: Nonexistent account rejected with 401 Unauthorized');

  console.log('\n======================================================');
  console.log('🎉 ALL AUTHENTICATION & RBAC TEST SCENARIOS PASSED!');
  console.log('======================================================');
}

runAuthVerificationSuite().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
