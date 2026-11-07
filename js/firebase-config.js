// Firebase Modular Configuration for NextBuy 77
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDYmZgXBz9XnNISiZNiSGe-Av7xMTfLOBo",
  authDomain: "nextbuy77-a3529.firebaseapp.com",
  projectId: "nextbuy77-a3529",
  storageBucket: "nextbuy77-a3529.firebasestorage.app",
  messagingSenderId: "335396686694",
  appId: "1:335396686694:web:90c7f4bbd3685166e3d6a7",
  measurementId: "G-543GGTCTNQ"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

