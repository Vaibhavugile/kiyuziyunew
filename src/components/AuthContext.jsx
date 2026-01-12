// src/components/AuthContext.jsx

import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  auth, 
  db, 
  doc, 
  onAuthStateChanged, 
  getDoc, 
  signOut, 
  collection, // <-- New Import
  query,     // <-- New Import
  where,     // <-- New Import
  getDocs    // <-- New Import
} from '../firebase';

// Create the context
export const AuthContext = createContext();

// Create the provider component
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // New logout function to sign the user out
  const logout = () => {
    return signOut(auth);
  };

  useEffect(() => {
    const fetchUserRole = async (user) => {
      if (!user) {
        setUserRole(null);
        return;
      }

      const currentUid = user.uid;
      let userDocSnap = null;
      
      // 1. PRIMARY CHECK: Check if document ID matches the current UID
      // This is the standard for new users where we use the UID as the Doc ID.
      const userDocRef = doc(db, 'users', currentUid);
      userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        console.log(`User profile found immediately by Doc ID: ${currentUid}`);
      } else {
        // 2. FALLBACK CHECK: Search the collection for a document where the 'uid' *field* matches the current UID
        // This handles returning users where the document might have been created 
        // with a different (old) Doc ID, but the 'uid' field was updated in LoginPage.jsx.
        console.warn(`Doc ID mismatch or profile not found by UID: ${currentUid}. Checking 'uid' field...`);
        
        // Retry logic for the Fallback Check to handle the race condition during profile creation/update
        const MAX_RETRIES = 3;
        const DELAY_MS = 1000;

        for (let i = 0; i < MAX_RETRIES; i++) {
            const q = query(collection(db, 'users'), where('uid', '==', currentUid));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                userDocSnap = querySnapshot.docs[0];
                console.log(`User profile found via 'uid' field match after ${i} retries. Doc ID: ${userDocSnap.id}`);
                break; 
            }
            if (i < MAX_RETRIES - 1) {
                console.warn(`Profile not found by 'uid' field (Attempt ${i + 1}). Retrying in ${DELAY_MS}ms...`);
                await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            }
        }
      }

      // Final Role Assignment
      if (userDocSnap?.exists()) {
        setUserRole(userDocSnap.data().role || 'retailer'); // Use 'retailer' as a fallback role
      } else {
        console.error("User profile not found after all checks. Defaulting to retailer.");
        setUserRole('retailer');
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      // Wait for the role to be fetched and resolved before setting loading to false
      await fetchUserRole(user); 
      setIsLoading(false);
    });

    return unsubscribe; // Cleanup subscription on unmount
  }, []);

  const value = {
    currentUser,
    userRole,
    isLoading,
    logout, // Add the logout function to the context value
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the auth context
export const useAuth = () => {
  return useContext(AuthContext);
};