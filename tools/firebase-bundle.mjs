// Bundles the parts of the Firebase web SDK the app uses (sign-in, and the full Firestore client with its offline
// cache and live listeners, which Tasks needs) into one ES module, vendor/firebase.js, so the site keeps its
// no-build, no-CDN setup. It only loads once someone signs in. Run after changing the version in package.json:
//   node tools/firebase-bundle.mjs
import { build } from 'esbuild';
import { readFileSync } from 'fs';

const version = JSON.parse(readFileSync('node_modules/firebase/package.json', 'utf8')).version;
await build({
  stdin: {
    contents: `
      export { initializeApp } from 'firebase/app';
      export {
        initializeAuth, browserLocalPersistence, indexedDBLocalPersistence, browserPopupRedirectResolver, connectAuthEmulator,
        GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
        signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail,
        onAuthStateChanged, signOut,
      } from 'firebase/auth';
      export {
        initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, connectFirestoreEmulator,
        collection, doc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, onSnapshot, increment, query, where,
      } from 'firebase/firestore';
    `,
    resolveDir: '.',
    loader: 'js',
  },
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  legalComments: 'eof',
  banner: { js: `// Firebase JS SDK ${version} (Apache-2.0), bundled by tools/firebase-bundle.mjs.` },
  outfile: 'vendor/firebase.js',
});
console.log(`wrote vendor/firebase.js (Firebase ${version})`);
