import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, storage } from '../firebase';
import SupportInbox from './SupportInbox';

const STAFF_ROLES = ['superadmin', 'manager', 'sales', 'admin', 'support'];

/** Staff role is read from the existing users/{uid} profile, never from URL/input. */
export default function SupportInboxRoute() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, async (nextUser) => {
    setUser(nextUser);
    setProfile(null);
    if (nextUser) {
      try {
        const snap = await getDoc(doc(db, 'users', nextUser.uid));
        setProfile(snap.exists() ? snap.data() : null);
      } catch (error) {
        console.error('Could not verify support staff role:', error);
        setProfile(null);
      }
    }
    setLoading(false);
  }), []);

  if (loading) return <div className="sc-shell"><div className="sc-empty">Verifying support access…</div></div>;
  const role = String(profile?.role || '').toLowerCase();
  if (!user || !STAFF_ROLES.includes(role)) {
    return <div className="sc-shell"><div className="sc-empty"><h2>Support team access required</h2><p>This page is available to authorized store staff only.</p></div></div>;
  }
  return <SupportInbox db={db} storage={storage} user={user} staffRole={role} staffProfile={profile} />;
}
