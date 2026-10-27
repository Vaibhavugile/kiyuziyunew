import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';

import { auth, db, signOut } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';

import {
  DEFAULT_ROLE,
  getRoleConfig,
  loadRoleConfiguration,
} from '../config/roles';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(DEFAULT_ROLE);
  const [roleConfig, setRoleConfig] = useState(() => getRoleConfig(DEFAULT_ROLE));
  // null means this customer has no custom override; use the role default.
  const [customerMinimumOrderValue, setCustomerMinimumOrderValue] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [roleConfigurationLoaded, setRoleConfigurationLoaded] = useState(false);

  const logout = useCallback(() => signOut(auth), []);

  const resetProfile = useCallback(() => {
    setUserRole(DEFAULT_ROLE);
    setRoleConfig(getRoleConfig(DEFAULT_ROLE));
    setCustomerMinimumOrderValue(null);
  }, []);

  const applyProfile = useCallback((data = {}, source = 'unknown') => {
    const resolvedRole = String(data.role || DEFAULT_ROLE).trim().toLowerCase();
    const resolvedRoleConfig = getRoleConfig(resolvedRole);
    const rawMinimum = data.minimumOrderValue;
    const parsedMinimum = rawMinimum === '' || rawMinimum === undefined || rawMinimum === null
      ? NaN
      : Number(rawMinimum);
    const hasCustomMinimum = Number.isFinite(parsedMinimum) && parsedMinimum >= 0;
    const resolvedMinimum = hasCustomMinimum ? parsedMinimum : null;

    console.log('🔎 CUSTOMER MINIMUM DEBUG', {
      source,
      role: resolvedRole,
      rawMinimumOrderValue: rawMinimum ?? '(field missing)',
      resolvedCustomerMinimum: resolvedMinimum,
      roleDefaultMinimum: resolvedRoleConfig?.minOrderValue,
      effectiveMinimum: resolvedMinimum !== null
        ? resolvedMinimum
        : Number(resolvedRoleConfig?.minOrderValue ?? 0),
    });

    setUserRole(resolvedRole);
    setRoleConfig(resolvedRoleConfig);
    setCustomerMinimumOrderValue(resolvedMinimum);
  }, []);

  useEffect(() => {
    let active = true;
    let authGeneration = 0;
    let unsubscribeProfile = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      const generation = ++authGeneration;
      const isCurrent = () => active && generation === authGeneration;

      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (!isCurrent()) return;

      setIsLoading(true);
      setCurrentUser(user);
      setRoleConfigurationLoaded(false);
      resetProfile();

      try {
        await loadRoleConfiguration();
        if (!isCurrent()) return;
        setRoleConfigurationLoaded(true);

        if (!user) {
          setIsLoading(false);
          return;
        }

        console.log('🔐 Loading customer profile for Firebase UID:', user.uid);

        // Read the UID-named document and also look for legacy documents whose
        // `uid` field matches. Prefer the document containing a custom minimum.
        const directRef = doc(db, 'users', user.uid);
        const directSnap = await getDoc(directRef);
        if (!isCurrent()) return;

        const matchingSnap = await getDocs(query(
          collection(db, 'users'),
          where('uid', '==', user.uid),
          limit(10)
        ));
        if (!isCurrent()) return;

        const candidates = [];
        if (directSnap.exists()) candidates.push({ snap: directSnap, source: directSnap.ref.path, direct: true });
        matchingSnap.docs.forEach((snap) => {
          if (!candidates.some((item) => item.snap.ref.path === snap.ref.path)) {
            candidates.push({ snap, source: `${snap.ref.path} (uid query)`, direct: false });
          }
        });

        if (candidates.length === 0) {
          console.warn('⚠️ No Firestore user profile found for UID:', user.uid);
          resetProfile();
          setIsLoading(false);
          return;
        }

        const hasCustomMinimum = (candidate) => {
          const value = candidate.snap.data()?.minimumOrderValue;
          if (value === undefined || value === null || value === '') return false;
          return Number.isFinite(Number(value)) && Number(value) >= 0;
        };

        // Critical: if users/{uid} exists but has no override, choose a matching
        // legacy profile that does contain the customer's custom minimum.
        const selected = candidates.find(hasCustomMinimum) || candidates[0];
        const profileRef = selected.snap.ref;
        const profileData = selected.snap.data() || {};

        console.log('📄 CUSTOMER PROFILE SELECTED', {
          firebaseUID: user.uid,
          selectedPath: selected.source,
          candidatePaths: candidates.map((candidate) => ({
            path: candidate.source,
            role: candidate.snap.data()?.role ?? null,
            minimumOrderValue: candidate.snap.data()?.minimumOrderValue ?? null,
          })),
          selectedProfile: profileData,
        });

        applyProfile(profileData, selected.source);

        unsubscribeProfile = onSnapshot(
          profileRef,
          { includeMetadataChanges: true },
          (snapshot) => {
            if (!isCurrent()) return;
            if (!snapshot.exists()) {
              console.warn('⚠️ Customer profile no longer exists:', profileRef.path);
              resetProfile();
              setIsLoading(false);
              return;
            }

            const latestData = snapshot.data() || {};
            console.log('🔄 CUSTOMER PROFILE SNAPSHOT', {
              path: snapshot.ref.path,
              fromCache: snapshot.metadata.fromCache,
              role: latestData.role ?? null,
              minimumOrderValue: latestData.minimumOrderValue ?? null,
            });
            applyProfile(latestData, snapshot.ref.path);
            setIsLoading(false);
          },
          (error) => {
            if (!isCurrent()) return;
            console.error('❌ Customer profile listener failed:', error);
            setIsLoading(false);
          }
        );
      } catch (error) {
        if (!isCurrent()) return;
        console.error('❌ Authentication/profile initialization failed:', error);
        resetProfile();
        setRoleConfigurationLoaded(true);
        setIsLoading(false);
      }
    });

    return () => {
      active = false;
      authGeneration += 1;
      if (unsubscribeProfile) unsubscribeProfile();
      unsubscribeAuth();
    };
  }, [applyProfile, resetProfile]);

  const effectiveMinimumOrderValue = customerMinimumOrderValue !== null
    ? customerMinimumOrderValue
    : Number(roleConfig?.minOrderValue ?? 0);

  useEffect(() => {
    console.log('🔐 AUTH CONTEXT VALUES', {
      firebaseUID: currentUser?.uid ?? null,
      userRole,
      roleDefaultMinimum: roleConfig?.minOrderValue ?? null,
      customerMinimumOrderValue,
      effectiveMinimumOrderValue,
      roleConfigurationLoaded,
    });
  }, [
    currentUser,
    userRole,
    roleConfig,
    customerMinimumOrderValue,
    effectiveMinimumOrderValue,
    roleConfigurationLoaded,
  ]);

  const value = {
    currentUser,
    userRole,
    roleConfig,
    customerMinimumOrderValue,
    effectiveMinimumOrderValue,
    isLoading,
    roleConfigurationLoaded,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!isLoading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
