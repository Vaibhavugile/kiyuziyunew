
import React, {
  createContext,
  useContext,
  useEffect,
  useState
} from "react";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "firebase/auth";

import {
  doc,
  setDoc,
  getDoc
} from "firebase/firestore";

import { db } from "../../firebase";

const StoreAuthContext = createContext();

export const StoreAuthProvider = ({ children, sellerId }) => {

  const auth = getAuth();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  /* =========================
     AUTH STATE
  ========================= */

  useEffect(() => {

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });

    return () => unsub();

  }, [auth]);

  /* =========================
     SIGNUP
  ========================= */

  const signup = async (email, password, mobile) => {

    const cred = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    await setDoc(
      doc(
        db,
        "storeCustomers",
        sellerId,
        "customers",
        cred.user.uid
      ),
      {
        email,
        mobile,
        sellerId,
        active: true,
        createdAt: Date.now()
      }
    );

  };

  /* =========================
     LOGIN
  ========================= */

  const login = async (email, password) => {

    const cred = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    try {

      const customerRef = doc(
        db,
        "storeCustomers",
        sellerId,
        "customers",
        cred.user.uid
      );

      const snap = await getDoc(customerRef);

      if (!snap.exists()) {
        throw new Error("STORE_CUSTOMER_NOT_REGISTERED");
      }

      const customerData = snap.data();

      // Only explicitly false means inactive.
      // Missing active field is treated as active.
      if (customerData.active === false) {

        throw new Error("STORE_ACCOUNT_INACTIVE");

      }

      return cred.user;

    } catch (error) {

      // Do not leave an inactive or unregistered customer signed in.
      await signOut(auth);

      throw error;

    }

  };

  /* =========================
     LOGOUT
  ========================= */

  const logout = () => {
    return signOut(auth);
  };

  return (

    <StoreAuthContext.Provider
      value={{
        user,
        signup,
        login,
        logout
      }}
    >

      {!loading && children}

    </StoreAuthContext.Provider>

  );

};

export const useStoreAuth = () => {
  return useContext(StoreAuthContext);
};
