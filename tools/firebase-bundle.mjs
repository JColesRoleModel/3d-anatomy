// Bundles the parts of the Firebase web SDK the app uses (sign-in, and the small "lite" Firestore client) into one
// ES module, vendor/firebase.js, so the site keeps its no-build, no-CDN setup. Run after changing the version in
// package.json:  node tools/firebase-bundle.mjs
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
      export { getFirestore, connectFirestoreEmulator, collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore/lite';
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
