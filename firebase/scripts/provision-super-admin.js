// One-Time Super Admin Provisioning Script - NextBuy 77
// Run locally: node firebase/scripts/provision-super-admin.js <email> <password>
// Requires service-account.json placed in project root (listed in .gitignore)

const fs = require('fs');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const email = args[0] || 'arghadeepg2006@gmail.com';
  const password = args[1] || 'Art454500@';

  console.log('--- NextBuy 77 Super Admin Provisioning ---');
  console.log(`Target Email: ${email}`);

  const serviceAccountPath = path.resolve(__dirname, '../../service-account.json');
  if (!fs.existsSync(serviceAccountPath)) {
    console.log('\n[NOTICE] service-account.json not found in root directory.');
    console.log('To provision a live Super Admin in production:');
    console.log('1. Go to Firebase Console -> Project Settings -> Service Accounts.');
    console.log('2. Click "Generate new private key" and save it as service-account.json in the project root.');
    console.log('3. Run: node firebase/scripts/provision-super-admin.js <email> <password>');
    console.log('4. Delete service-account.json immediately after provisioning.\n');
    return;
  }

  let admin;
  try {
    admin = require('firebase-admin');
  } catch (e) {
    console.log('Installing firebase-admin locally to complete provisioning...');
    return;
  }

  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'nextbuy77-a3529'
  });

  const auth = admin.auth();
  const db = admin.firestore();

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    console.log(`Existing user found with UID: ${userRecord.uid}. Updating credentials...`);
    await auth.updateUser(userRecord.uid, { password });
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      console.log('Creating new admin user account...');
      userRecord = await auth.createUser({
        email,
        password,
        emailVerified: true,
        displayName: 'Super Admin'
      });
      console.log(`Created user with UID: ${userRecord.uid}`);
    } else {
      throw err;
    }
  }

  // Set Custom Claims { admin: true, role: 'Super Admin' }
  await auth.setCustomUserClaims(userRecord.uid, {
    admin: true,
    role: 'Super Admin'
  });
  console.log('Custom claims set: { admin: true, role: "Super Admin" }');

  // Write protected adminUsers record
  await db.collection('adminUsers').doc(userRecord.uid).set({
    uid: userRecord.uid,
    email: email,
    displayName: 'Super Admin',
    role: 'Super Admin',
    permissions: ['ALL'],
    status: 'active',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('adminUsers document created in Firestore with permissions: ["ALL"].');
  console.log('\n[SUCCESS] Super Admin provisioning completed successfully!\n');
  process.exit(0);
}

main().catch(err => {
  console.error('[ERROR] Provisioning failed:', err);
  process.exit(1);
});

