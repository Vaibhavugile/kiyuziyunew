import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  auth,
  db,
  doc,
  onAuthStateChanged,
  getDoc,
  signOut,
  collection,
  query,
  where,
  getDocs,
} from '../firebase';

// 🔥 NEW: Role system imports
import {
  DEFAULT_ROLE,
  getRoleConfig,
} from '../config/roles';

// Create the context
export const AuthContext = createContext();

// Provider
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [roleConfig, setRoleConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Logout
  const logout = () => signOut(auth);

  useEffect(() => {
    const fetchUserProfile = async (user) => {
      if (!user) {
        setUserRole(null);
        setRoleConfig(null);
        return;
      }

      const currentUid = user.uid;
      let userDocSnap = null;

      /* ================================
         1️⃣ PRIMARY CHECK (doc ID = UID)
         ================================ */
      const userDocRef = doc(db, 'users', currentUid);
      userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        /* ============================================
           2️⃣ FALLBACK CHECK (old users / race issues)
           ============================================ */
        console.warn(
          `User profile not found by Doc ID (${currentUid}). Checking 'uid' field...`
        );

        const MAX_RETRIES = 3;
        const DELAY_MS = 1000;

        for (let i = 0; i < MAX_RETRIES; i++) {
          const q = query(
            collection(db, 'users'),
            where('uid', '==', currentUid)
          );
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            userDocSnap = querySnapshot.docs[0];
            console.log(
              `User profile found via 'uid' field after ${i + 1} attempt(s)`
            );
            break;
          }

          if (i < MAX_RETRIES - 1) {
            await new Promise((res) => setTimeout(res, DELAY_MS));
          }
        }
      }

      /* ================================
         3️⃣ ROLE NORMALIZATION (IMPORTANT)
         ================================ */
      let resolvedRole = DEFAULT_ROLE;

      if (userDocSnap?.exists()) {
        resolvedRole = userDocSnap.data()?.role || DEFAULT_ROLE;
      } else {
        console.error(
          'User profile not found after all checks. Falling back to DEFAULT_ROLE.'
        );
      }

      // 🔥 Always derive roleConfig from role
      const resolvedRoleConfig = getRoleConfig(resolvedRole);

      setUserRole(resolvedRole);
      setRoleConfig(resolvedRoleConfig);
    };

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      await fetchUserProfile(user);
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userRole,
    roleConfig, // 🔥 NEW (used everywhere later)
    isLoading,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
};

// Hook
export const useAuth = () => useContext(AuthContext);
