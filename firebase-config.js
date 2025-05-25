const firebaseConfig = {
  apiKey: "AIzaSyDx0_sIaJDsTerCa062ujkp-2_2Du2D7WQ",
  authDomain: "tateti-8e880.firebaseapp.com",
  databaseURL: "https://tateti-8e880-default-rtdb.firebaseio.com",
  projectId: "tateti-8e880",
  storageBucket: "tateti-8e880.firebasestorage.app",
  messagingSenderId: "901540057574",
  appId: "1:901540057574:web:b7433aa55106dcc44ac627"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database(); // Make database globally available
