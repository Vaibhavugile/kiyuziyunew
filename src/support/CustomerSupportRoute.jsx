import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, storage } from '../firebase';
import CustomerSupportCenter from './CustomerSupportCenter';

/** Route adapter for this project's existing Firebase exports. */
export default function CustomerSupportRoute() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, async (nextUser) => {
    setUser(nextUser);
    setProfile(null);
    if (nextUser) {
      try {
        const snap = await getDoc(doc(db, 'users', nextUser.uid));
        setProfile(snap.exists() ? snap.data() : {});
      } catch (error) {
        console.error('Could not load support customer profile:', error);
        setProfile({});
      }
    }
    setLoading(false);
  }), []);

  if (loading) return <div className="sc-shell"><div className="sc-empty">Loading customer support…</div></div>;
  return <CustomerSupportCenter db={db} storage={storage} user={user} profile={profile || user} />;
}
